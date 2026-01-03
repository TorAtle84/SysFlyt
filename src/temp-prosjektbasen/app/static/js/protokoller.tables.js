// Fil: app/static/js/protokoller.tables.js

// ============================================================================
// PROTOKOLLER • TABLES (Komplett, med korrekt system-parser og konsistent visning)
// ============================================================================

import {
  showMessage, addAutoHeightListeners, autosizeNow, autosizeAll,
  applyColorCoding, STATUS_COLORS, INTEGRERT_TEST_COLORS,
  td, tdText, dropdown,
  ALL_GROUPED_COMPONENTS, ALL_IDENTIFIED_SYSTEMS, SELECTED_SYSTEM_NUMBERS,
  FUNKSJONSBANK
} from "./protokoller.core.js";

// --- Fallback-export (beholdt for kompatibilitet) ---
export function openModalFor() { return; }

// ------------------------ System- og Komponent-parsing ------------------------

/**
 * Returnerer en kanonisk systemstreng (unik nøkkel + visningsnavn).
 * - Trimmer whitespace
 * - Stopper ved første kolon/slash/parantes/whitespace
 * - Erstatt komma/mellomrom med punktum
 * - Faller tilbake til første "tall(.tall)" fra start dersom fullt mønster mangler
 * - Returnerer "Uspesifisert" ved tom/ugyldig
 */
function canonicalSystem(raw) {
  if (raw == null) return "Uspesifisert";
  let s = String(raw).trim();
  if (!s) return "Uspesifisert";

  // erstatt komma/mellomrom med punktum for å unngå variasjoner som "4330,201" / "4330 201"
  s = s.replace(/[, ]+/g, ".");

  // kutt ved første kontrolltegn (kolon, slash, parentes, whitespace)
  s = s.split(/[:/()\[\]\s]/)[0] || s;

  // forsøk å finne vanlig mønster: NNNN.NNN (1–4 siffer) . (1–3 siffer)
  const m = s.match(/\b(\d{1,4}\.\d{1,3})\b/);
  if (m) return m[1];

  // fallback: fra start – siffer + valgfri .siffer
  const m2 = s.match(/^\d+(?:\.\d+)?/);
  return m2 ? m2[0] : "Uspesifisert";
}

/** Systemnøkkel/label for rad */
function getSystemKeyFromRow(r = {}) {
  const source = r.unique_system || r.system_number || r.system_full_name || "";
  return canonicalSystem(source);
}

/** Plukker komponent-ID fra full tag-streng, for eldre datakilder */
function parseComponentIdFromFullId(fullId) {
  if (!fullId || typeof fullId !== "string") return null;
  const m = fullId.match(/-(?:[A-Za-z]{2,3}\d{2,5}[^\s%]*)/);
  return m ? m[0].slice(1) : null;
}

// ------------------------ Hjelpere ------------------------
function el(tag, cls = "", html = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
function makeStatusSelect(value = "Ikke startet") {
  const sel = dropdown(["Ikke startet", "Under arbeid", "Avvik", "Utført"], "");
  sel.value = value || "Ikke startet";
  applyColorCoding(sel, STATUS_COLORS);
  sel.addEventListener("change", () => applyColorCoding(sel, STATUS_COLORS));
  return sel;
}
function makeFunksjonsvalgSelect(value = "Øvrig") {
  const sel = dropdown(
    ["Start og Stopp funksjoner", "Reguleringsfunksjoner", "Sikkerhetsfunksjoner", "Øvrig"],
    ""
  );
  sel.value = value || "Øvrig";
  applyColorCoding(sel, INTEGRERT_TEST_COLORS);
  sel.addEventListener("change", () => applyColorCoding(sel, INTEGRERT_TEST_COLORS));
  return sel;
}
const SECTION_ORDER = [
  "Start og Stopp funksjoner",
  "Reguleringsfunksjoner",
  "Sikkerhetsfunksjoner",
  "Øvrig",
];

const ml = (lines) => lines.join("\n");

// ------------------------ Predefinerte rader ------------------------
const PREDEF = {
  "Start og Stopp funksjoner": [
    {
      komponent: "Nettstrøm",
      test: ml([
        "1. Systemet gjøres spenningsløst ved hjelp av sikkerhetsbryter tilhørende system/komponent, evt. sikring i forsyningstavle levert av elektro",
        "",
        "2. Kontroller at eventuelle sikkerhetsfunksjoner stenger ned og at alt ser spenningsløst",
        "",
        "3. Innkoble strøm igjen og kontroller at systemet starter opp som normal, i den driftsmodusen den skal være i"
      ]),
      aksept: ml([
        "1. Systemet er spenningsløst",
        "",
        "2. Alle komponenter er stengt ned som tiltenkt",
        "",
        "3. Strøm er tilbake og systemet er tilbake til normal drift, og uten alarmer"
      ])
    },
    {
      komponent: "LAN, SD",
      test: ml([
        "1. Verifiser at SD-anlegget har kontakt med regulator/kontroller",
        "",
        "2. Koble fra kommunikasjon mellom enhetene",
        "",
        "3. Verifiser at evt. endringer gjort fra SD-anlegget forblir i kontroller",
        "",
        "4. Koble tilbake, og verifiser normal drift"
      ]),
      aksept: ml([
        "1. Aggregatet er i kommunikasjon OK med SD-anlegget",
        "",
        "2. Begge enhetene mistet kontakten",
        "",
        "3. Alle settpunkter og endringer fungerer som normalt",
        "",
        "4. Enhetene kommuniserer som normalt, og uten alarmer",
        "",
        "Blir testet under IT-test, i regi av rITB evt. annen stedfortreder."
      ])
    },
    {
      komponent: "Program-vender, SD",
      test: ml([
        "Av:",
        "Betjen programvender i Av.",
        "",
        "På:",
        "Betjen programvender i På.",
        "",
        "Auto:",
        "Betjen programvender i Auto."
      ]),
      aksept: ml([
        "Av:",
        "Kontroller at systemet slår seg av på normal måte, og forblir avslått. Systemet påvirkes heller ikke av aktiv brannalarm",
        "",
        "På:",
        "Kontroller at systemet går kontinuerlig.",
        "",
        "Auto:",
        "Kontroller at anlegget er i drift iht. innstilt tidsprogram i SD-anlegg. Endringer slår inn. Brann/tidsprogram ellers testes i IT-test."
      ])
    }
  ],
  "Sikkerhetsfunksjoner": [
    {
      komponent: "Brannsignal",
      test: ml([
        "1. Stopp systemet",
        "2. Koble fra brannsignal (NC) fra IO på regulator",
        "3. Ved aktivt brannsignal aktiver frost",
        "4. Ved aktivt brannsignal, aktiver røykmelder i aggregatet",
        "5. Returner anlegget til normal drift",
        "",
        "Aktivt brannsignal testes i IT-test (rITB/avtalt)."
      ]),
      aksept: ml([
        "1. Systemet er stanset",
        "2. Aggregatet starter opp etter styring for brannscenario",
        "3. Systemet registrerer frost, men forsetter i brannmodus",
        "4. Systemet stanser, og røykmelder må resettes før restart",
        "5. Systemet er i normal drift"
      ])
    }
  ],
  "Øvrig": [
    {
      komponent: "SFP",
      test: ml([
        "1. Start aggregat i normal drift med prosjektert luftmengde. Mål luftmengde (m³/s) og total effekt til vifter (kW)",
        "2. Beregn SFP = effekt / luftmengde (evt. les HMI/SD). Sammenlign mot krav",
        "3. Endre luftmengde og gjenta for å se forventet endring i SFP",
        "4. Dokumenter måledata (tid, måleutstyr, luftmengde, effekt, metode)"
      ]),
      aksept: ml([
        "1. Stabil drift uten alarmer; målinger gir rimelige verdier",
        "2. SFP ≤ prosjektert (f.eks. ≤ 1,8 kW/(m³/s))",
        "3. SFP følger lastendring",
        "4. Full sporbar dokumentasjon"
      ])
    },
    {
      komponent: "-Logg/Alarm, SD",
      test: ml([
        "1. Verifiser at alle relevante punkter har logging aktivert og riktige alarmoppsett/tekster"
      ]),
      aksept: ml([
        "1. Logger og alarmer er aktive og trender som krav"
      ])
    }
  ]
};

// ------------------------ Filfilter ------------------------
export function renderFileFilter(files = [], refreshCallback) {
  const c = document.getElementById("fileFilterContainer");
  if (!c) return;
  c.innerHTML = "";
  if (!files.length) return;

  const label = document.createElement("label");
  label.className = "form-label";
  label.textContent = "Filfilter (vis/skjul):";
  c.appendChild(label);

  files.forEach(f => {
    const safeId = `file-chk-${String(f).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const wrap = document.createElement("div");
    wrap.className = "form-check";
    wrap.innerHTML = `<input class="form-check-input" type="checkbox" checked data-filename="${f}" id="${safeId}"><label class="form-check-label" for="${safeId}">${f}</label>`;
    c.appendChild(wrap);
  });

  c.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.onchange = () => {
      const active = Array.from(c.querySelectorAll("input:checked")).map(i => i.dataset.filename);
      const filtered = (window.allRows || []).filter(r => active.includes(r.source));
      if (typeof refreshCallback === "function") refreshCallback(filtered);
      const tabContent = document.getElementById('systemTabContent');
      if (tabContent) autosizeAll(tabContent);
    };
  });
}

// ------------------------ MC Display ------------------------
export function renderMCProtocolDisplay(rows = []) {
  const systemTabs = document.getElementById("systemTabs");
  const systemTabContent = document.getElementById("systemTabContent");
  const protocolTable = document.getElementById("protocol-table");
  const filterBox = document.getElementById("system-filter-container");
  if (!systemTabs || !systemTabContent || !protocolTable) return;

  // ---- Gruppér rader på kanonisk nøkkel ----
  const grouped = {};
  rows.forEach(r => {
    const key = (r.unique_system || "Uspesifisert").toString();
    (grouped[key] = grouped[key] || []).push(r);
  });

  // Speil til global state (samme som FT)
  Object.keys(ALL_GROUPED_COMPONENTS).forEach(k => delete ALL_GROUPED_COMPONENTS[k]);
  Object.assign(ALL_GROUPED_COMPONENTS, grouped);

  ALL_IDENTIFIED_SYSTEMS.length = 0;
  Object.keys(grouped).sort().forEach(s => {
    ALL_IDENTIFIED_SYSTEMS.push({ number: s, full_name: s });
  });

  // Default: velg alle
  SELECTED_SYSTEM_NUMBERS.clear();
  ALL_IDENTIFIED_SYSTEMS.forEach(sys => SELECTED_SYSTEM_NUMBERS.add(sys.number));

  // intern renderer som respekterer valgt filter
  function renderTabs() {
    systemTabs.innerHTML = "";
    systemTabContent.innerHTML = "";
    systemTabs.style.display = "flex";
    systemTabContent.style.display = "block";
    protocolTable.style.display = "table";

    const systems = Object.keys(grouped)
      .filter(s => SELECTED_SYSTEM_NUMBERS.has(s))
      .sort((a, b) => a.localeCompare(b, "nb"));

    systems.forEach((sys, idx) => {
      const count = grouped[sys].length;

      const li = document.createElement("li");
      li.className = "nav-item";
      const a = document.createElement("a");
      a.className = "nav-link" + (idx === 0 ? " active" : "");
      a.setAttribute("data-bs-toggle", "tab");
      a.setAttribute("href", `#pane-mc-${idx}`);
      a.innerHTML = `<span class="tab-label">${sys}</span>
                     <span class="badge bg-secondary ms-2">${count}</span>`;
      li.appendChild(a);
      systemTabs.appendChild(li);

      const pane = document.createElement("div");
      pane.className = "tab-pane fade" + (idx === 0 ? " show active" : "");
      pane.id = `pane-mc-${idx}`;
      pane.dataset.systemName = sys;

      // Bygg MC-tabellen for dette systemet
      const tbl = document.createElement("table");
      tbl.className = "table table-sm align-middle";
      tbl.innerHTML = `
        <thead>
          <tr>
            <th style="width:56px;">Rekkefølge</th>
            <th>System</th>
            <th>Komponent ID</th>
            <th>Beskrivelse</th>
            <th>Montasjestatus</th>
            <th>Kablet og koblet</th>
            <th>Merket</th>
            <th>Tilordnet til</th>
            <th>Utført av</th>
            <th>Dato utført</th>
            <th>Kommentar</th>
            <th style="width:48px;">Slett</th>
          </tr>
        </thead>
        <tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      // Hjelpere til radkontroll (opp/ned)
      function makeMoveButtons() {
        const tdCtl = document.createElement('td');
        tdCtl.style.verticalAlign = 'middle';
        tdCtl.style.textAlign = 'center';
        const group = document.createElement('div');
        group.className = 'btn-group-vertical btn-group-sm';
        const up = document.createElement('button');
        up.className = 'btn btn-light';
        up.title = 'Flytt opp';
        up.innerHTML = '<i class="bi bi-arrow-up"></i>';
        up.onclick = function () {
          const row = this.closest('tr');
          const prev = row?.previousElementSibling;
          if (prev) prev.before(row);
        };
        const down = document.createElement('button');
        down.className = 'btn btn-light';
        down.title = 'Flytt ned';
        down.innerHTML = '<i class="bi bi-arrow-down"></i>';
        down.onclick = function () {
          const row = this.closest('tr');
          const next = row?.nextElementSibling;
          if (next) next.after(row);
        };
        group.append(up, down);
        tdCtl.appendChild(group);
        return tdCtl;
      }

      // Sletteknapp
      function makeDeleteButton() {
        const tdBtn = document.createElement('td');
        tdBtn.className = 'text-center';
        tdBtn.style.verticalAlign = 'middle';
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-danger';
        btn.title = 'Slett denne linjen';
        btn.innerHTML = '<i class="bi bi-trash"></i>';
        btn.onclick = () => {
          const tr = btn.closest('tr');
          if (tr && confirm('Er du sikker på at du vil slette denne linjen?')) tr.remove();
        };
        tdBtn.appendChild(btn);
        return tdBtn;
      }

      // Enkle cellehjelpere
      function cellSelect(options) {
        const td = document.createElement("td");
        const sel = document.createElement("select");
        sel.className = "form-select form-select-sm";
        sel.innerHTML = options.map(v => `<option>${v}</option>`).join("");
        td.appendChild(sel);
        return td;
      }
      function cellInput() {
        const td = document.createElement("td");
        td.innerHTML = `<input class="form-control form-control-sm">`;
        return td;
      }

      for (const r of grouped[sys]) {
        const tr = document.createElement("tr");

        // 1) Rekkefølge (opp/ned)
        tr.appendChild(makeMoveButtons());

        // 2) System
        const tdSystem = document.createElement("td");
        tdSystem.innerHTML = `<input class="form-control form-control-sm" data-col="system" value="${sys}">`;
        tr.appendChild(tdSystem);

        // 3) Komponent ID (inkluderer typekode hvis den finnes i full_id)
        const tdKomp = document.createElement("td");
        const kompOnly =
          (r.komponent && String(r.komponent).trim()) ||
          parseComponentIdFromFullId(r.full_id || "") || "";
        tdKomp.appendChild(tdText(kompOnly));
        tr.appendChild(tdKomp);

        // 4) Beskrivelse
        const tdDesc = document.createElement("td");
        tdDesc.appendChild(tdText(r.desc || "Ukjent beskrivelse"));
        tr.appendChild(tdDesc);

        // 5) Montasjestatus (bruk fargekodet velger som i Excel/FT)
        const tdStatus = document.createElement('td');
        tdStatus.appendChild(makeStatusSelect("Ikke startet"));
        tr.appendChild(tdStatus);

        // 6) Kablet og koblet
        tr.appendChild(cellSelect(["", "Ja", "Nei"]));

        // 7) Merket
        tr.appendChild(cellSelect(["", "Ja", "Nei"]));

        // 8) Tilordnet til
        tr.appendChild(cellInput());

        // 9) Utført av
        tr.appendChild(cellInput());

        // 10) Dato utført
        const tdDato = document.createElement("td");
        tdDato.innerHTML = `<input type="date" class="form-control form-control-sm">`;
        tr.appendChild(tdDato);

        // 11) Kommentar
        const tdKomm = document.createElement("td");
        tdKomm.innerHTML = `<textarea class="form-control form-control-sm" rows="1"></textarea>`;
        tr.appendChild(tdKomm);

        // 12) Slett
        tr.appendChild(makeDeleteButton());

        tbody.appendChild(tr);
      }

      pane.appendChild(tbl);
      systemTabContent.appendChild(pane);
    });
  }

  // Vis filteret (med riktig callback) og første render
  if (filterBox) filterBox.style.display = "block";
  renderSystemFilter(renderTabs);
  renderTabs();

  // Autosize/tilpasning
  try { autosizeAll?.(); } catch {}
}

// ------------------------ FUNKSJONSTEST ------------------------
export function renderFunksjonstestDisplay(rows = []) {
  const tabs = document.getElementById('systemTabs');
  const content = document.getElementById('systemTabContent');
  const table = document.getElementById('protocol-table');
  if (!tabs || !content || !table) return;

  // Gruppér rader på KANONISK nøkkel og skriv samtidig kanonisk system_number inn i radobjektet
  const grouped = {};
  rows.forEach(r => {
    const key = getSystemKeyFromRow(r); // KANONISK
    const obj = {
      ...r,
      system_number: key, // tving visning i tabell til kanonisk
      komponent: parseComponentIdFromFullId(r.full_id) || r.komponent,
      funksjonsvalg: r.funksjonsvalg || r.integrert || "Øvrig"
    };
    (grouped[key] = grouped[key] || []).push(obj);
  });

  // Speil til global state
  Object.keys(ALL_GROUPED_COMPONENTS).forEach(k => delete ALL_GROUPED_COMPONENTS[k]);
  Object.assign(ALL_GROUPED_COMPONENTS, grouped);

  // Bygg filterlisten med *samme* kanoniske tekst for både number og label
  ALL_IDENTIFIED_SYSTEMS.length = 0;
  Object.keys(grouped).sort().forEach(s => {
    ALL_IDENTIFIED_SYSTEMS.push({ number: s, full_name: s }); // label = key (kanonisk)
  });

  // Velg alt som default
  SELECTED_SYSTEM_NUMBERS.clear();
  ALL_IDENTIFIED_SYSTEMS.forEach(sys => SELECTED_SYSTEM_NUMBERS.add(sys.number));

  tabs.style.display = 'flex';
  content.style.display = 'block';
  table.style.display = 'none';

  renderSystemFilter(updateFilteredTabs);
  updateFilteredTabs();
}

// ------------------------ Filter UI + Tab-render ------------------------
export function renderSystemFilter(onChange) {
  const filterContainer = document.getElementById('system-filter-container');
  if (!filterContainer) return;
  filterContainer.innerHTML = '<h6>Filtrer systemer:</h6>';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'btn btn-sm btn-outline-secondary me-2 mb-2';
  selectAllBtn.textContent = 'Velg alle';
  selectAllBtn.onclick = () => {
    SELECTED_SYSTEM_NUMBERS.clear();
    ALL_IDENTIFIED_SYSTEMS.forEach(sys => SELECTED_SYSTEM_NUMBERS.add(sys.number));
    if (typeof onChange === 'function') onChange();
    renderSystemFilter();
  };

  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'btn btn-sm btn-outline-secondary mb-2';
  clearAllBtn.textContent = 'Fjern alle';
  clearAllBtn.onclick = () => {
    SELECTED_SYSTEM_NUMBERS.clear();
    if (typeof onChange === 'function') onChange();
    renderSystemFilter();
  };

  filterContainer.append(selectAllBtn, clearAllBtn);

  const box = document.createElement('div');
  box.className = 'd-flex flex-wrap';
  filterContainer.appendChild(box);

  ALL_IDENTIFIED_SYSTEMS.forEach(sys => {
    const safe = sys.number ? String(sys.number).replace(/[^a-zA-Z0-9]/g, '_') : 'uspesifisert';
    const id = `sys-filter-${safe}`;
    const wrap = document.createElement('div');
    wrap.className = 'form-check form-check-inline';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input';
    input.id = id;
    input.value = sys.number;
    input.checked = SELECTED_SYSTEM_NUMBERS.has(sys.number);
    input.onchange = e => {
      e.target.checked ? SELECTED_SYSTEM_NUMBERS.add(sys.number) : SELECTED_SYSTEM_NUMBERS.delete(sys.number);
      if (typeof onChange === 'function') onChange();
    };

    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = id;
    label.textContent = sys.full_name; // = kanonisk

    wrap.append(input, label);
    box.appendChild(wrap);
  });

  filterContainer.style.display = 'block';
}

function createSectionHeaderRow(title) {
  const tr = document.createElement('tr');
  tr.className = 'table-primary section-row';
  tr.dataset.role = 'section-header';
  tr.dataset.section = title;
  const tdHdr = document.createElement('td');
  tdHdr.colSpan = 9;
  tdHdr.textContent = title;
  tdHdr.style.textAlign = "center";
  tdHdr.style.fontWeight = "600";
  tr.appendChild(tdHdr);
  return tr;
}

function insertAfterHeader(tbody, rowEl, sectionName) {
  const header = tbody.querySelector(`tr.section-row[data-section="${sectionName}"]`);
  if (!header) { tbody.appendChild(rowEl); return; }
  let before = null;
  for (let n = header.nextElementSibling; n; n = n.nextElementSibling) {
    if (n.classList?.contains('section-row')) { before = n; break; }
  }
  tbody.insertBefore(rowEl, before);
}

function buildComponentRow(obj, system_number) {
  const tr = document.createElement("tr");

  const td0 = document.createElement('td');
  td0.style.verticalAlign = 'middle';
  td0.style.textAlign = 'center';
  const btnGroup = document.createElement('div');
  btnGroup.className = 'btn-group-vertical btn-group-sm';
  const upBtn = document.createElement('button');
  upBtn.className = 'btn btn-light';
  upBtn.innerHTML = '<i class="bi bi-arrow-up"></i>';
  upBtn.title = 'Flytt opp';
  upBtn.onclick = function () {
    const currentRow = this.closest('tr');
    const prevRow = currentRow.previousElementSibling;
    if (prevRow && !prevRow.classList.contains('section-row')) prevRow.before(currentRow);
  };
  const downBtn = document.createElement('button');
  downBtn.className = 'btn btn-light';
  downBtn.innerHTML = '<i class="bi bi-arrow-down"></i>';
  downBtn.title = 'Flytt ned';
  downBtn.onclick = function () {
    const currentRow = this.closest('tr');
    const nextRow = currentRow.nextElementSibling;
    if (nextRow && !nextRow.classList.contains('section-row')) nextRow.after(currentRow);
  };
  btnGroup.append(upBtn, downBtn);
  td0.appendChild(btnGroup);
  tr.appendChild(td0);

  const sysInput = document.createElement("input");
  sysInput.type = "text";
  sysInput.className = "form-control form-control-sm";
  sysInput.value = system_number || obj.system_number || "";
  sysInput.readOnly = true;
  sysInput.setAttribute("data-col", "system");
  sysInput.setAttribute("name", "system_number");
  tr.appendChild(td(sysInput));

  const kompInput = document.createElement("input");
  kompInput.type = "text";
  kompInput.className = "form-control form-control-sm";
  kompInput.value = obj.komponent || "";
  kompInput.readOnly = true;
  tr.appendChild(td(kompInput));

  const tfm = (obj.komponent || "").substring(0, 2).toUpperCase();
  const forslagForTFM = FUNKSJONSBANK[tfm] || [];
  const forslagSel = document.createElement("select");
  forslagSel.className = "form-select form-select-sm";
  forslagSel.innerHTML = `<option value="">-- Velg funksjon --</option>`;
  forslagForTFM.forEach((f, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = f.navn || `(Uten navn ${i + 1})`;
    forslagSel.appendChild(opt);
  });
  if (!forslagForTFM.length) forslagSel.disabled = true;
  tr.appendChild(td(forslagSel));

  const valgtInp = document.createElement("input");
  valgtInp.type = "text";
  valgtInp.className = "form-control form-control-sm";
  valgtInp.value = obj.funksjonsbeskrivelse || "";
  tr.appendChild(td(valgtInp));

  const testArea = document.createElement("textarea");
  testArea.className = "form-control form-control-sm autosize";
  testArea.value = obj.testutfoerelse || obj.test || "";
  testArea.rows = 2;
  tr.appendChild(td(testArea));

  const expArea = document.createElement("textarea");
  expArea.className = "form-control form-control-sm autosize";
  expArea.value = obj.aksept || "";
  expArea.rows = 2;
  tr.appendChild(td(expArea));

  forslagSel.onchange = () => {
    const i = Number(forslagSel.value);
    const f = forslagForTFM[i];
    if (!f) return;
    valgtInp.value = f.navn || "";
    testArea.value = f.test || "";
    expArea.value = f.aksept || "";
    autosizeNow(testArea);
    autosizeNow(expArea);
  };

  const funksjonsvalgSel = makeFunksjonsvalgSelect(obj.funksjonsvalg || obj.integrert || "Øvrig");
  funksjonsvalgSel.dataset.role = "funksjonsvalg";
  tr.appendChild(td(funksjonsvalgSel));

  const btnTd = document.createElement("td");
  btnTd.className = 'text-center';
  btnTd.style.verticalAlign = 'middle';
  const funksjonerBtnGroup = document.createElement('div');
  funksjonerBtnGroup.className = 'btn-group';
  funksjonerBtnGroup.setAttribute('role', 'group');

  const lagreBtn = document.createElement("button");
  lagreBtn.className = "btn btn-sm btn-outline-primary";
  lagreBtn.innerHTML = '<i class="bi bi-save"></i>';
  lagreBtn.title = "Lagre test som mal i funksjonsbanken";
  lagreBtn.onclick = async () => {
    const navn = prompt("Gi funksjonen et visningsnavn:", valgtInp.value);
    if (!navn || !navn.trim()) return;
    const payload = { tfm, navn: navn.trim(), test: testArea.value, aksept: expArea.value };
    try {
      const res = await fetch("/protokoller/lagre_funksjonstest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showMessage("Ny funksjon lagret!", "success");
        const bank = FUNKSJONSBANK[tfm] = FUNKSJONSBANK[tfm] || [];
        bank.push(payload);
        const opt = document.createElement("option");
        opt.value = String(bank.length - 1);
        opt.textContent = payload.navn;
        forslagSel.appendChild(opt);
        forslagSel.disabled = false;
        forslagSel.value = String(bank.length - 1);
      } else {
        showMessage(`Feil: ${await res.text()}`, "error");
      }
    } catch (e) {
      showMessage(`Nettverksfeil: ${e.message}`, "error");
    }
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-sm btn-outline-danger";
  deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
  deleteBtn.title = "Slett denne linjen";
  deleteBtn.onclick = () => { if (confirm("Er du sikker?")) tr.remove(); };

  const duplicateBtn = document.createElement('button');
  duplicateBtn.className = 'btn btn-sm btn-outline-secondary';
  duplicateBtn.innerHTML = '<i class="bi bi-copy"></i>';
  duplicateBtn.title = 'Dupliser denne linjen';
  duplicateBtn.onclick = () => {
    const newRow = buildComponentRow(obj, system_number);
    tr.after(newRow);
    autosizeAll(tr.closest('table'));
  };

  funksjonerBtnGroup.append(lagreBtn, duplicateBtn, deleteBtn);
  btnTd.appendChild(funksjonerBtnGroup);
  tr.appendChild(btnTd);

  addAutoHeightListeners(testArea);
  addAutoHeightListeners(expArea);

  funksjonsvalgSel.addEventListener('change', () => {
    const table = tr.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;
    const target = funksjonsvalgSel.value || "Øvrig";
    insertAfterHeader(tbody, tr, target);
    autosizeAll(table);
  });

  return tr;
}

export function buildFunksjonstestTable(rows = [], systemTabKey = "") {
  const system_number = systemTabKey || getSystemKeyFromRow(rows?.[0] || {}) || "";
  const tbl = document.createElement("table");
  tbl.className = "table table-bordered table-sm";
  tbl.innerHTML = `<thead><tr><th>Rekkefølge</th><th>System</th><th>Komponent ID</th><th>Forslag</th><th>Valgt forslag</th><th>Testutførelse</th><th>Forventet resultat</th><th>Funksjonsvalg</th><th>Funksjoner</th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  SECTION_ORDER.forEach(sec => tbody.appendChild(createSectionHeaderRow(sec)));

  SECTION_ORDER.forEach(sec => {
    (PREDEF[sec] || []).forEach(p => {
      const tr = buildComponentRow({ ...p, funksjonsvalg: sec }, system_number);
      insertAfterHeader(tbody, tr, sec);
    });
  });

  rows.forEach(rad => {
    const sec = rad.funksjonsvalg || rad.integrert || "Øvrig";
    const tr = buildComponentRow(rad, system_number);
    insertAfterHeader(tbody, tr, SECTION_ORDER.includes(sec) ? sec : "Øvrig");
  });

  requestAnimationFrame(() => autosizeAll(tbl));
  return tbl;
}

export function renderInnreguleringDisplay(rows = []) {
  const table = document.getElementById("protocol-table");
  const tbody = document.getElementById("table-body");
  const thead = document.getElementById("table-head");
  const tabs = document.getElementById("systemTabs");
  const tabContent = document.getElementById("systemTabContent");
  if (!table || !tbody || !thead || !tabs || !tabContent) return;

  tabs.style.display = "none";
  tabContent.style.display = "none";
  table.style.display = "table";

  thead.innerHTML = `<tr><th>System</th><th>Komponent</th><th>vMin</th><th>vMid</th><th>vMaks</th><th>Kilde</th></tr>`;
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.appendChild(td(getSystemKeyFromRow(r) || "")); // KANONISK
    tr.appendChild(td(r.komponent || ""));
    tr.appendChild(td(r.vMin || ""));
    tr.appendChild(td(r.vMid || ""));
    tr.appendChild(td(r.vMaks || ""));
    tr.appendChild(td(r.source || ""));
    tbody.appendChild(tr);
  });
}

export function updateFilteredTabs() {
  const tabs = document.getElementById("systemTabs");
  const content = document.getElementById("systemTabContent");
  if (!tabs || !content) return;

  tabs.innerHTML = '';
  content.innerHTML = '';

  const toRender = Object.keys(ALL_GROUPED_COMPONENTS || {})
    .filter(s => SELECTED_SYSTEM_NUMBERS.has(s))
    .sort();

  if (!toRender.length) {
    content.innerHTML = `<p class="text-muted p-3">${Object.keys(ALL_GROUPED_COMPONENTS || {}).length ? 'Ingen systemer valgt.' : 'Ingen systemer funnet.'}</p>`;
    return;
  }

  toRender.forEach((system_number, idx) => {
    const rader = ALL_GROUPED_COMPONENTS[system_number] || [];
    const full = system_number; // **alltid kanonisk i fanetittel**
    const id = `tab-${String(system_number).replace(/[^a-zA-Z0-9]/g, '_')}`;
    const isActive = idx === 0;

    const li = document.createElement("li");
    li.className = "nav-item";
    li.innerHTML = `<a class="nav-link ${isActive ? 'active' : ''}" data-bs-toggle="tab" href="#${id}"><span class="tab-label">${full}</span></a>`;
    tabs.appendChild(li);

    const pane = document.createElement("div");
    pane.className = `tab-pane fade ${isActive ? 'show active' : ''}`;
    pane.id = id;
	pane.dataset.systemName = system_number;
    pane.appendChild(buildFunksjonstestTable(rader, system_number));
    content.appendChild(pane);
  });

  const first = tabs.querySelector('.nav-link');
  if (first && window.bootstrap?.Tab) new window.bootstrap.Tab(first).show();

  autosizeAll(content);
}
