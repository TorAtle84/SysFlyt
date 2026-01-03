// ============================================================================
// PROTOKOLLER • UI (Komplett og revidert for korrekt MC-streaming og filtrering)
// Init, event-delegation, generering, nedlasting, TFM-modal + TAB-RENAME (FT)
// ============================================================================

import {
  FUNKSJONSBANK, showMessage, getUsers, getTechnicians, getLoggedInUser, autosizeAll, tdText,
  // Viktig: robust komponentparser og TFM-filter-state fra core
  TFM_SETTINGS, getComponentFromAny, tfmPrefix, applyCustomSegmentFilters
} from "./protokoller.core.js";

import {
  renderFileFilter, renderMCProtocolDisplay, renderFunksjonstestDisplay, renderInnreguleringDisplay,
  renderSystemFilter
} from "./protokoller.tables.js";

window.allRows = []; // gjør tilgjengelig for filfilter og nedlasting

// --- Robust JSON-leser: tåler at server sender HTML/feilmelding i stedet for JSON
async function safeJson(res) {
  const txt = await res.text();              // les alltid som tekst
  try {
    return JSON.parse(txt);                  // forsøk å parse som JSON
  } catch (e) {
    console.error("[safeJson] Ikke-JSON respons:", txt.slice(0, 400));
    throw new Error(`Ugyldig JSON fra server (status ${res.status}).`);
  }
}

// --- State for system-kriterier (for systemknappene) ---
const SELECTED_SYSTEM_CRITERIA = new Set();

const CUSTOM_SEGMENT_INPUTS = {
  byggnr: "custom-format-byggnr",
  system: "custom-format-system",
  komponent: "custom-format-komponent",
  typekode: "custom-format-typekode",
};

function getCustomSegmentFilters() {
  return Object.fromEntries(
    Object.entries(CUSTOM_SEGMENT_INPUTS).map(([key, id]) => {
      const el = document.getElementById(id);
      const value = (el?.value || "").trim();
      return [key, value];
    })
  );
}

// ------------------------ System-modalen ------------------------
function openModalFor(button) {
  const mainDigit = button?.dataset?.val;
  if (!mainDigit) return;

  const modalEl = document.getElementById('filterModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalCheckboxes = document.getElementById('modalCheckboxes');
  const modalConfirm = document.getElementById('modalConfirm');
  if (!modalEl || !modalTitle || !modalCheckboxes || !modalConfirm) {
    showMessage("Filtermodal mangler i DOM.", "error");
    return;
  }

  const modal = new window.bootstrap.Modal(modalEl);
  modalTitle.textContent = `Velg systemer fra kategori ${mainDigit}x`;
  modalCheckboxes.innerHTML = '';

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'd-flex flex-wrap gap-3';
  modalCheckboxes.appendChild(checkboxContainer);

  for (let i = 0; i < 10; i++) {
    const systemValue = `${mainDigit}${i}`;
    const isChecked = SELECTED_SYSTEM_CRITERIA.has(systemValue);

    const div = document.createElement('div');
    div.className = 'form-check form-check-inline';
    div.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${systemValue}" id="sys-chk-${systemValue}" ${isChecked ? 'checked' : ''}>
      <label class="form-check-label" for="sys-chk-${systemValue}">
        ${systemValue}
      </label>
    `;
    checkboxContainer.appendChild(div);
  }

  modalConfirm.onclick = () => {
    for (let i = 0; i < 10; i++) {
      SELECTED_SYSTEM_CRITERIA.delete(`${mainDigit}${i}`);
    }
    modalCheckboxes.querySelectorAll('input:checked').forEach(chk => {
      SELECTED_SYSTEM_CRITERIA.add(chk.value);
    });
    const hasSelection = Array.from(SELECTED_SYSTEM_CRITERIA).some(s => s.startsWith(mainDigit));
    button.classList.toggle('selected', hasSelection);
    modal.hide();
    showMessage(`Filter for kategori ${mainDigit}x oppdatert.`, 'success');
  };
  modal.show();
}

document.addEventListener('click', (ev) => {
  const sysBtn = ev.target.closest?.('.sys-btn');
  if (sysBtn) openModalFor(sysBtn);
}, true);

const _msgBox = document.getElementById('message-box');
if (_msgBox) _msgBox.style.pointerEvents = 'none';

// ------------------------ TFM-innstillinger ------------------------
async function loadTfmSettings(funksjon) {
  const key = (funksjon || "").toUpperCase();
  if (!TFM_SETTINGS[key]) return;

  try {
    const res = await fetch(`/protokoller/api/tfm-liste?funksjon=${encodeURIComponent(funksjon)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = await safeJson(res); // robust
    TFM_SETTINGS[key].clear();
    Object.entries(settings || {}).forEach(([kode, aktiv]) => {
      if (aktiv) TFM_SETTINGS[key].add(kode);
    });
  } catch (e) {
    showMessage(`Kunne ikke laste TFM-innstillinger for ${funksjon}: ${e.message}`, 'error');
  }
}

// ======================================================================
// NDJSON streamingleser – brukes av MC for live-progresjon (tåler også SSE `data:`)
// ======================================================================
async function readNdjsonStream(response, onLine) {
  // Ingen strøm? Les alt som tekst og prøv linjevis
  if (!response?.body?.getReader) {
    const txt = await response.text();
    txt.split(/\r?\n/).forEach(l => {
      let line = l.trim();
      if (!line) return;
      if (line.startsWith('data:')) line = line.slice(5).trim(); // håndter SSE
      try { onLine?.(JSON.parse(line)); } catch { /* ignorer ulesbare linjer */ }
    });
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (let raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      if (line.startsWith('data:')) line = line.slice(5).trim(); // håndter SSE
      try { onLine?.(JSON.parse(line)); }
      catch { /* ignorer ulesbare linjer */ }
    }
  }

  let tail = buffer.trim();
  if (tail) {
    if (tail.startsWith('data:')) tail = tail.slice(5).trim();
    try { onLine?.(JSON.parse(tail)); } catch { /* ignore */ }
  }
}

// ======================================================================
// MC-filter helper (TFM-prefiks 2–4 bokstaver før første siffer + failsafe)
// ======================================================================
function applyMcTfmFilter(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const tillatte = TFM_SETTINGS.MC;

  // Ingen aktive koder => vis alt
  if (!tillatte || tillatte.size === 0) {
    console.debug("[MC] TFM-filter tomt/ikke lastet → viser alle rader");
    return rows;
  }

  const before = rows.length;
  const filteredRows = rows.filter(r => {
    const komponentId = getComponentFromAny(r.full_id, r.komponent);
    if (!komponentId) return false;
    const pref = tfmPrefix(komponentId); // 2–4 bokstaver før første siffer
    return !!pref && tillatte.has(pref);
  });

  // Failsafe – ikke end opp med "0" i UI hvis filteret er for strengt
  if (before > 0 && filteredRows.length === 0) {
    console.debug("[MC] TFM-filter aktivt, men 0 beholdt → failsafe: viser alle");
    showMessage("Alle rader ble filtrert bort av TFM-filteret. Viser alle rader midlertidig. Juster TFM-filteret i menyen.", "warning");
    return rows;
  }

  console.debug(`[MC] TFM-filter aktivt: beholdt ${filteredRows.length}/${before} rader`);
  return filteredRows;
}

// ======================================================================
// TAB-RENAME (FT): oppdater fane-tittel og "System"-kolonnen i alle rader
// ======================================================================
function getPaneFromTabLink(tabLinkEl) {
  if (!tabLinkEl) return null;
  const target = tabLinkEl.getAttribute('data-bs-target') || tabLinkEl.getAttribute('href');
  if (!target) return null;
  try { return document.querySelector(target); } catch { return null; }
}

function applySystemNameToPane(tabLinkEl, newName) {
  const pane = getPaneFromTabLink(tabLinkEl);
  if (!pane) return;

  // Oppdater faneteksten
  const labelEl = tabLinkEl.querySelector('.tab-label') || tabLinkEl;
  labelEl.textContent = newName;
  pane.dataset.systemName = newName;

  // OPPDATER KUN SYSTEM-FELT
  // Treffer både MC og FT hvis vi merker inputs riktig (se pkt. 2)
  const inputs = pane.querySelectorAll('input[data-col="system"], input[name="system_number"]');
  inputs.forEach(inp => { inp.value = newName; });
}

function promptRenameForTab(tabLinkEl) {
  const currentText = (tabLinkEl.querySelector('.tab-label') || tabLinkEl).textContent.trim() || 'Uspesifisert';
  const newName = window.prompt('Gi systemet et navn:', currentText);
  if (!newName) return; // avbrutt
  applySystemNameToPane(tabLinkEl, newName.trim());
}

// ======================================================================
// Generering (MC streamer; FT/INNREGULERING vanlig JSON)
// ======================================================================
async function handleGeneration() {
  const funksjonsvalgEl = document.getElementById("funksjonsvalg");
  const formatEl        = document.getElementById("format-input");
  const filerEl         = document.getElementById("filopplaster");
  const statusText      = document.getElementById("status-text");
  const generateBtn     = document.getElementById("generate-data-btn");
  const downloadBtn     = document.getElementById("download-protocol-btn");
  const systemFilterContainer = document.getElementById("system-filter-container");
  const protocolTable   = document.getElementById("protocol-table");

  if (!funksjonsvalgEl || !filerEl || !statusText || !generateBtn || !downloadBtn || !protocolTable) {
    showMessage("Påkrevd UI-element mangler i DOM.", "error");
    return;
  }

  const funksjon = (funksjonsvalgEl.value || "").trim();
  const format   = (formatEl?.value || "").trim();
  const filer    = filerEl.files;
  const customFilters = getCustomSegmentFilters();
  const hasCustomFilters = Object.values(customFilters).some(Boolean);

  if (!funksjon) return showMessage("Velg en funksjon først.", 'info');
  if (!filer || filer.length === 0) return showMessage("Last opp minst én fil.", 'warning');
  if (funksjon.toUpperCase() !== "FUNKSJONSTEST" && !format) {
    return showMessage("Du må angi et format for denne protokolltypen.", 'warning');
  }

  const formData = new FormData();
  formData.append("format", format || "{komponent}");
  formData.append("funksjon", funksjon);
  formData.append("debug", "1"); // be backend strømme debug-linjer hvis støttet
  for (const f of filer) formData.append("files", f);
  const systemKriterierString = Array.from(SELECTED_SYSTEM_CRITERIA).join(',');
  if (systemKriterierString) formData.append("system_kriterier", systemKriterierString);
  if (hasCustomFilters) {
    Object.entries(customFilters).forEach(([key, value]) => {
      if (value) formData.append(`custom_${key}`, value);
    });
  }

  generateBtn.disabled = true;
  downloadBtn.disabled = true;
  protocolTable.style.display = "none";
  if (systemFilterContainer) systemFilterContainer.style.display = "none";
  statusText.textContent = `Genererer underlag for ${funksjon}…`;

  let endpoint = "";
  let renderFunction = null;

  switch (funksjon.toUpperCase()) {
    case "FUNKSJONSTEST":
      endpoint = "/protokoller/generate_funksjonstest";
      renderFunction = renderFunksjonstestDisplay;
      if (systemFilterContainer) systemFilterContainer.style.display = "block";
      break;
    case "MC":
      endpoint = "/protokoller/generate_underlag";
      renderFunction = renderMCProtocolDisplay;
      break;
    case "INNREGULERING":
      endpoint = "/protokoller/generate_innreguleringsprotokoll";
      renderFunction = renderInnreguleringDisplay;
      break;
    default:
      showMessage("Ukjent funksjon.", "error");
      generateBtn.disabled = false;
      return;
  }

  try {
    if (funksjon.toUpperCase() === "MC") {
      // ---------- STREAMET NDJSON ----------
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Serverfeil (${res.status}): ${await res.text()}`);

      let lastRows = [];
      let currentFile = null;
      let filesSeen = 0;

      await readNdjsonStream(res, (obj) => {
        // Backend kan sende {"currentFile": "..."} og til slutt {"rows":[...]}
        if (obj.currentFile) {
          currentFile = obj.currentFile;
          filesSeen++;
          if (statusText) statusText.textContent = `Leser: ${currentFile} (${filesSeen}/${filer.length})…`;
        }
        if (obj.error) {
          console.warn("Backend-feil:", obj.error);
          showMessage(obj.error, "warning");
        }
        if (Array.isArray(obj.rows)) {
          lastRows = obj.rows;
        }
        if (obj.debug) console.debug("[MC debug]", obj);
      });

      const allRowsFromServer = Array.isArray(lastRows) ? lastRows : [];

      // LOGG 1: Rådata
      console.log("--- LOGG 1: Rådata mottatt fra server ---");
      console.table(allRowsFromServer);

      let rowsAfterCustom = allRowsFromServer;
      if (hasCustomFilters) {
        rowsAfterCustom = applyCustomSegmentFilters(allRowsFromServer, customFilters);
        console.log(`[MC] Egendefinert segmentfilter aktiv – beholdt ${rowsAfterCustom.length}/${allRowsFromServer.length} rader`);
      }

      // --- TFM-filter + failsafe ---
      const finalRows = applyMcTfmFilter(rowsAfterCustom);
      window.allRows = finalRows;

      // Filfilter-UI
      const uniqueFiles = [...new Set(finalRows.map(row => row.source))];
      renderFileFilter(uniqueFiles, (filteredByFile) => {
        renderFunction(filteredByFile);
      });

      renderFunction(finalRows);
      protocolTable.style.display = "table";
      if (statusText) {
        let txt = `Fant ${finalRows.length} komponenter. `;
        txt += TFM_SETTINGS.MC?.size > 0 ? `(TFM-filter aktivt: ${TFM_SETTINGS.MC.size} koder)` : `(TFM-filter: av)`;
        if (hasCustomFilters) {
          txt += " (Egendefinert segmentfilter aktiv)";
        }
        statusText.textContent = txt;
      }
      if (finalRows.length === 0) {
        let msg = "Ingen komponenter funnet.";
        if (hasCustomFilters && rowsAfterCustom.length === 0) {
          msg = "Ingen komponenter matchet de egendefinerte segmentene.";
        } else if (TFM_SETTINGS.MC?.size > 0 && rowsAfterCustom.length > 0) {
          msg = "Ingen komponenter passerte de aktive filtrene.";
        }
        showMessage(msg, "warning");
      } else {
        showMessage("Underlag (MC) generert!", "success");
      }
      downloadBtn.disabled = (finalRows.length === 0);
    } else {
      // ---------- FT/INNREGULERING: vanlig JSON ----------
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Serverfeil (${res.status}): ${await res.text()}`);

      const data = await safeJson(res); // robust
      const baseRows = Array.isArray(data) ? data : (data.rows || []);

      // LOGG 1: Rådata
      console.log("--- LOGG 1: Rådata mottatt fra server (FT/Innregulering) ---");
      console.table(baseRows);

      let rowsAfterCustom = baseRows;
      if (hasCustomFilters) {
        rowsAfterCustom = applyCustomSegmentFilters(baseRows, customFilters);
        console.log(`[${funksjon}] Egendefinert segmentfilter aktiv – beholdt ${rowsAfterCustom.length}/${baseRows.length} rader`);
      }

      // Funksjonsbank-beriking (kun FT)
      if (funksjon.toUpperCase() === "FUNKSJONSTEST") {
        const tfms = [...new Set(rowsAfterCustom.map(r => (r.komponent || "").substring(0, 2).toUpperCase()))].filter(Boolean);
        if (tfms.length) {
          try {
            const fb = await fetch(`/protokoller/api/funksjonsbank?tfm=${encodeURIComponent(tfms.join(","))}`);
            if (fb.ok) Object.assign(FUNKSJONSBANK, await safeJson(fb));
          } catch (e) {
            console.warn("Kunne ikke hente data fra funksjonsbanken:", e);
          }
        }
        rowsAfterCustom.forEach(r => {
          const bank = FUNKSJONSBANK[(r.komponent || "").substring(0, 2).toUpperCase()];
          if (bank && bank.length) {
            r.funksjonsbeskrivelse = r.funksjonsbeskrivelse || bank[0].navn || "";
            r.testutfoerelse       = r.testutfoerelse       || bank[0].test || ""
            r.aksept               = r.aksept               || bank[0].aksept || "";
          }
        });
      }

      window.allRows = rowsAfterCustom;

      // Filfilter-UI
      const uniqueFiles = [...new Set(rowsAfterCustom.map(row => row.source))];
      renderFileFilter(uniqueFiles, (filteredByFile) => {
        renderFunction(filteredByFile);
      });

      renderFunction(rowsAfterCustom);
      protocolTable.style.display = "table";
      if (statusText) {
        let txt = `Fant ${rowsAfterCustom.length} komponenter.`;
        if (hasCustomFilters) {
          txt += " (Egendefinert segmentfilter aktiv)";
        }
        statusText.textContent = txt;
      }

      if (rowsAfterCustom.length === 0) {
        const msg = hasCustomFilters ? "Ingen komponenter matchet de egendefinerte segmentene." : "Ingen komponenter funnet.";
        showMessage(msg, "warning");
      } else {
        showMessage(`Underlag (${funksjon}) generert!`, "success");
      }
      downloadBtn.disabled = (rowsAfterCustom.length === 0);
    }
  } catch (err) {
    console.error(err);
    showMessage(`Noe gikk galt: ${err.message}`, 'error');
    if (statusText) statusText.textContent = "Status: Feil ved generering.";
  } finally {
    generateBtn.disabled = false;
  }
}

// ======================================================================
// Innlesing av FT-rader fra DOM
// ======================================================================
const _val = (el) => (el && typeof el.value !== "undefined") ? el.value : "";

function collectFunksjonstestRowsFromDOM() {
  const panes = [...document.querySelectorAll('#systemTabContent .tab-pane')];
  const out = [];

  for (const pane of panes) {
    const tbody = pane.querySelector('tbody');
    if (!tbody) continue;

    const rows = [...tbody.querySelectorAll('tr')].filter(tr => tr.dataset.role !== 'section-header');
    for (const tr of rows) {
      const systemEl   = tr.cells?.[1]?.querySelector('input');
      const kompEl     = tr.cells?.[2]?.querySelector('input');
      const valgtEl    = tr.cells?.[4]?.querySelector('input');
      const testEl     = tr.cells?.[5]?.querySelector('textarea');
      const akseptEl   = tr.cells?.[6]?.querySelector('textarea');
      const kategoriEl = tr.cells?.[7]?.querySelector('select');

      if (!systemEl && !kompEl) continue;

      out.push({
        status: "Ikke startet",
        system_number:        _val(systemEl).trim(),
        komponent:            _val(kompEl).trim(),
        funksjonsbeskrivelse: _val(valgtEl).trim(),
        testutfoerelse:       _val(testEl),
        aksept:               _val(akseptEl),
        integrert:            _val(kategoriEl) || "Øvrig",
        funksjonsvalg:        _val(kategoriEl) || "Øvrig"
      });
    }
  }
  return out;
}

// ======================================================================
// INIT / EVENTS
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    getUsers(),
    getTechnicians(),
    loadTfmSettings('MC'),
    loadTfmSettings('FUNKSJONSTEST'),
    loadTfmSettings('INNREGULERING')
  ]);

  const funksjonsvalg = document.getElementById("funksjonsvalg");
  const generateBtn = document.getElementById("generate-data-btn");
  const downloadBtn = document.getElementById("download-protocol-btn");
  const clearBtn = document.getElementById("clear-table-btn");
  const tfmBtn = document.getElementById("tfm-popup-btn");
  const protocolTable = document.getElementById("protocol-table");
  const systemTabs = document.getElementById("systemTabs");
  const systemTabContent = document.getElementById("systemTabContent");
  const systemFilterContainer = document.getElementById("system-filter-container");
  const thead = protocolTable?.querySelector("thead");

  if (funksjonsvalg) {
    funksjonsvalg.onchange = () => {
      const valgt = (funksjonsvalg.value || "").toUpperCase();
      if (systemTabs) systemTabs.innerHTML = "";
      if (systemTabContent) systemTabContent.innerHTML = "";
      if (systemFilterContainer) systemFilterContainer.style.display = "none";
      if (protocolTable) protocolTable.style.display = "table";
      if (tfmBtn) tfmBtn.style.display = ["MC", "INNREGULERING", "FUNKSJONSTEST"].includes(valgt) ? "inline-block" : "none";

      if (!thead) return;

      if (valgt === "MC") {
        thead.innerHTML = `<tr><th>System</th><th>Komponent ID</th><th>Beskrivelse</th><th>Montasjestatus</th><th>Kablet og koblet</th><th>Merket</th><th>Tilordnet til</th><th>Utført av</th><th>Dato utført</th><th>Kommentar</th></tr>`;
      } else if (valgt === "INNREGULERING") {
        thead.innerHTML = `<tr><th>System</th><th>Komponent</th><th>vMin</th><th>vMid</th><th>vMaks</th><th>Kilde</th></tr>`;
      } else {
        thead.innerHTML = "";
        if (protocolTable) protocolTable.style.display = "none";
      }
    };
  }

  if (generateBtn) generateBtn.onclick = handleGeneration;

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!confirm("Er du sikker på at du vil fjerne alt innhold? Dette kan ikke angres.")) return;
      if (systemTabs) {
        systemTabs.innerHTML = "";
        systemTabs.style.display = "none";
      }
      if (systemTabContent) {
        systemTabContent.innerHTML = "";
        systemTabContent.style.display = "none";
      }
      const tbody = protocolTable?.querySelector("tbody");
      if (tbody) tbody.innerHTML = "";
      if (protocolTable) protocolTable.style.display = "table";
      if (systemFilterContainer) {
        systemFilterContainer.innerHTML = "";
        systemFilterContainer.style.display = "none";
      }
      const fileFilter = document.getElementById("fileFilterContainer");
      if (fileFilter) fileFilter.innerHTML = "";

      window.allRows = [];
      SELECTED_SYSTEM_CRITERIA.clear();
      document.querySelectorAll('.sys-btn.selected').forEach(b => b.classList.remove('selected'));
      showMessage("Alt innhold er fjernet.", "info");
      const statusText = document.getElementById("status-text");
      if (statusText) statusText.textContent = "Tabell tømt.";
      if (downloadBtn) downloadBtn.disabled = true;
    };
  }

  if (tfmBtn) {
    tfmBtn.onclick = async () => {
      const funksjon = funksjonsvalg?.value;
      const tfmTable = document.getElementById("tfmTable");
      const tbody = tfmTable?.querySelector("tbody");
      if (!tbody) return showMessage("TFM-tabellen ble ikke funnet.", "error");
      try {
        const [statusRes, dictRes] = await Promise.all([
          fetch(`/protokoller/api/tfm-liste?funksjon=${encodeURIComponent(funksjon || "")}`),
          fetch(`/static/data/tfm-dict.json`)
        ]);
        if (!statusRes.ok || !dictRes.ok) throw new Error("Kunne ikke laste TFM-data.");
        const statusData = await safeJson(statusRes);     // robust
        const beskrivelseData = await safeJson(dictRes); // robust
        tbody.innerHTML = "";
        Object.entries(statusData || {}).forEach(([kode, aktiv]) => {
          const tr = tbody.insertRow();

          const tdKode = document.createElement("td");
          tdKode.appendChild(tdText(kode));
          tr.appendChild(tdKode);

          const tdBeskr = document.createElement("td");
          tdBeskr.appendChild(tdText(beskrivelseData?.[kode] || "Ikke i bruk"));
          tr.appendChild(tdBeskr);

          const sel = document.createElement("select");
          sel.className = "form-select";
          sel.innerHTML = `<option>Aktiv</option><option>Inaktiv</option>`;
          sel.value = aktiv ? "Aktiv" : "Inaktiv";
          sel.style.backgroundColor = aktiv ? "#d9ead3" : "#e0e0e0";
          sel.onchange = () => sel.style.backgroundColor = sel.value === "Aktiv" ? "#d9ead3" : "#e0e0e0";
          const tdSel = document.createElement("td");
          tdSel.appendChild(sel);
          tr.appendChild(tdSel);
        });
        new window.bootstrap.Modal(document.getElementById("tfmModal")).show();
      } catch (e) {
        showMessage(`TFM-feil: ${e.message}`, "error");
      }
    };
  }

  const lagreTfmBtn = document.getElementById("lagre-tfm-btn");
  if (lagreTfmBtn) {
    lagreTfmBtn.onclick = async () => {
      const tfmTable = document.getElementById("tfmTable");
      const tbody = tfmTable?.querySelector("tbody");
      const funksjon = funksjonsvalg?.value;
      if (!tbody || !funksjon) return;

      const payload = {};
      tbody.querySelectorAll("tr").forEach(tr => {
        const kode = tr.cells?.[0]?.textContent?.trim();            // les tekst, ikke input
        const statusSel = tr.cells?.[2]?.querySelector("select");
        const status = statusSel ? statusSel.value : "Inaktiv";
        if (kode) payload[kode] = (status === "Aktiv");
      });

      try {
        const r = await fetch(`/protokoller/api/tfm-liste/save?funksjon=${encodeURIComponent(funksjon)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error(await r.text());
        await loadTfmSettings(funksjon); // reflekter endringene umiddelbart
        showMessage("TFM-filteret er lagret og oppdatert!", "success");
        const modalEl = document.getElementById("tfmModal");
        if (modalEl) window.bootstrap.Modal.getInstance(modalEl)?.hide();
      } catch (e) {
        showMessage(`Feil ved lagring av TFM: ${e.message}`, "error");
      }
    };
  }

  // --- Rename system tabs (FT): dblclick tab title eller klikk på .rename-tab
  const systemTabsNav = document.getElementById('systemTabs');
  if (systemTabsNav) {
    // Dobbelklikk på fanen
    systemTabsNav.addEventListener('dblclick', (ev) => {
      const link = ev.target.closest('a.nav-link');
      if (!link) return;
      const valgt = (funksjonsvalg?.value || '').toUpperCase();
      if (!['FUNKSJONSTEST', 'MC'].includes(valgt)) return;
      ev.preventDefault();
      promptRenameForTab(link);
    });

    // (Valgfritt) liten penn-ikon i fanen
    systemTabsNav.addEventListener('click', (ev) => {
      const renameBtn = ev.target.closest('.rename-tab');
      if (!renameBtn) return;
      const link = renameBtn.closest('a.nav-link');
      if (!link) return;
      const valgt = (funksjonsvalg?.value || '').toUpperCase();
      if (valgt !== 'FUNKSJONSTEST') return;
      ev.preventDefault();
      promptRenameForTab(link);
    });
  }

  // Nedlasting
  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      const valgt = (funksjonsvalg?.value || "").toUpperCase();
      let endpoint = "", payload = {}, defaultFilename = "Protokoll.xlsx";
      const rowsToDownload = window.allRows || [];

      if (valgt === "FUNKSJONSTEST") {
	   endpoint = "/protokoller/download_funksjonstest_protokoll";
	   defaultFilename = "Funksjonstest_Protokoll.xlsx";

	   // 1) Hent fra DOM
	   const rawRows = collectFunksjonstestRowsFromDOM();

	   // 2) Sikkerhetsnett: parse strenger -> objekter
	   const rows = rawRows
		 .map(r => (typeof r === "string" ? (() => { try { return JSON.parse(r); } catch { return null; } })() : r))
		 .filter(r => r && typeof r === "object");

	   if (!rows.length) return showMessage("Ingen data å laste ned.", "info");
	   payload.rows = rows;

	   // 3) Debug: vis hvilke typer vi faktisk sender
	   console.log("[FT-DL] rows length:", rows.length, "first type:", typeof rows[0]);
	   console.log("[FT-DL] sample row:", rows[0]);
      } else if (valgt === "MC") {
        endpoint = "/protokoller/download_protokoll";
        defaultFilename = "MC_Protokoll.xlsx";
        const rows = rowsToDownload.map(r => ({
          full_id: r.full_id, desc: r.desc, unique_system: r.unique_system
        }));
        if (!rows.length) return showMessage("Ingen data å laste ned.", "info");
        payload.rows = rows;
      } else if (valgt === "INNREGULERING") {
        return showMessage("Nedlasting for Innregulering er ikke implementert.", "info");
      } else {
        return showMessage("Velg en protokolltype for nedlasting.", "warning");
      }

      payload.bruker = await getLoggedInUser();
      const statusText = document.getElementById("status-text");
      if (statusText) statusText.textContent = "Forbereder nedlasting...";

      // LOGG 2: Payload til server
      console.log("--- LOGG 2: Data som sendes til server for nedlasting ---");
      console.log("Endpoint:", endpoint);
      console.table(payload.rows);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const disp = res.headers.get("Content-Disposition");
        const m = disp?.match(/filename="?([^"]+)"?/);
        const filename = m && m[1] ? m[1] : defaultFilename;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (statusText) statusText.textContent = "Protokoll lastet ned.";
        showMessage("Protokoll lastet ned!", "success");
      } catch (e) {
        showMessage(`Feil ved nedlasting: ${e.message}`, "error");
      }
    });
  }
});
