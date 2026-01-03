// systemkomponent.js (komplett, revidert)

// ───────────────────────────────────────────────────────────────────────────────
// State
// ───────────────────────────────────────────────────────────────────────────────
const valgtSystemPrefiks = {};     // { "3": ["30","31",...], ... }
window.masterRowsOpptelling = [];  // rårader (komponentopptelling)
window.masterRowsSystem = [];      // rårader (systembygging)
window.groupedSystemData = {};     // { unique_system_key|Systemnummer mangler: [rows] }
window.aktivtProsjektId = null;

// ───────────────────────────────────────────────────────────────────────────────
// UI helpers
// ───────────────────────────────────────────────────────────────────────────────
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function updateTableHeader(mode, totalCount = null) {
  const thead = qs("#table-head");
  if (!thead) return;

  if (mode === "komponentopptelling") {
    const antallHeader = totalCount !== null ? `Antall: ${totalCount}` : `Antall`;
    thead.innerHTML = `
      <tr>
        <th>Med system?</th>
        <th>Komponent</th>
        <th>Beskrivelse</th>
        <th>${antallHeader}</th>
        <th>Filer</th>
      </tr>`;
  } else if (mode === "systembygging") {
    thead.innerHTML = `
      <tr>
        <th>Full ID</th>
        <th>Beskrivelse</th>
        <th>Filer</th>
      </tr>`;
  } else {
    thead.innerHTML = `<tr><th>Velg funksjon</th></tr>`;
  }
}

function getActiveFilesFromFilter() {
  const set = new Set();
  qsa("#fil-filter input[type=checkbox]").forEach(cb => {
    if (cb.checked) set.add(cb.dataset.fname);
  });
  return set;
}

function buildKriterierString() {
  // Flater alle valgte undermenyer (eks. "30,31,39")
  return Object.values(valgtSystemPrefiks).flat().join(",");
}

// ───────────────────────────────────────────────────────────────────────────────
// Modal for system-kriterier (3x, 4x, ...)
// ───────────────────────────────────────────────────────────────────────────────
function openModalFor(hovedsiffer) {
  const modalElement = qs("#filterModal");
  if (!modalElement) return;

  const modalTitle = qs("#modalTitle", modalElement);
  const checkboxesDiv = qs("#modalCheckboxes", modalElement);
  modalTitle.textContent = `Velg systemer fra kategori ${hovedsiffer}x`;
  checkboxesDiv.innerHTML = "";

  for (let i = 0; i <= 9; i++) {
    const val = `${hovedsiffer}${i}`;
    const id = `chk-${val}`;
    const isChecked = (valgtSystemPrefiks[hovedsiffer] || []).includes(val);

    const label = document.createElement("label");
    label.className = "form-check form-check-inline";
    label.innerHTML = `
      <input type="checkbox" class="form-check-input" id="${id}" value="${val}" ${isChecked ? "checked" : ""}>
      <span>${val}</span>
    `;
    checkboxesDiv.appendChild(label);
  }

  const confirmBtn = qs("#modalConfirm", modalElement);
  confirmBtn.onclick = () => {
    const selected = qsa("input[type=checkbox]:checked", checkboxesDiv).map(cb => cb.value);
    valgtSystemPrefiks[hovedsiffer] = selected;
    const inst = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
    inst.hide();
  };

  const inst = new bootstrap.Modal(modalElement);
  inst.show();
}

// ───────────────────────────────────────────────────────────────────────────────
// Rendering (komponentopptelling)
// ───────────────────────────────────────────────────────────────────────────────
function renderOpptellingTable() {
  const systemTabsContainer = qs("#systemTabs");
  const systemTabContentContainer = qs("#systemTabContent");
  const mainResultTable = qs("#resultat-tabell");
  // skjul faner, vis hovedtabell
  systemTabsContainer.style.display = "none";
  systemTabContentContainer.innerHTML = "";
  mainResultTable.style.display = "";

  const activeFiles = getActiveFilesFromFilter();
  const tbody = qs("#resultat-tabell tbody");
  tbody.innerHTML = "";

  let overallTotalCount = 0;

  window.masterRowsOpptelling.forEach(row => {
    const matchingFiles = (row.files || []).filter(f => activeFiles.has(f));
    if (matchingFiles.length === 0) return;

    // Summer kun for aktive filer
    let filteredCount = 0;
    matchingFiles.forEach(f => filteredCount += (row.per_file?.[f] || 0));
    overallTotalCount += filteredCount;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.has_system}</td>
      <td>${row.id}</td>
      <td>${row.desc}</td>
      <td>${filteredCount}</td>
      <td>${matchingFiles.join(", ")}</td>
    `;
    tbody.appendChild(tr);
  });

  updateTableHeader("komponentopptelling", overallTotalCount);
}

// ───────────────────────────────────────────────────────────────────────────────
// Rendering (systembygging) – grupper i faner per unique_system_key
// ───────────────────────────────────────────────────────────────────────────────
function renderSystemTable() {
  const systemTabsContainer = qs("#systemTabs");
  const systemTabContentContainer = qs("#systemTabContent");
  const mainResultTable = qs("#resultat-tabell");

  mainResultTable.style.display = "none";
  systemTabsContainer.style.display = "";

  const activeFiles = getActiveFilesFromFilter();

  // grupper
  window.groupedSystemData = {};
  const missingSystemKey = "Systemnummer mangler";

  [...window.masterRowsSystem]
    .filter(r => (r.files || []).some(f => activeFiles.has(f)))
    .sort((a, b) => {
      const am = !a.unique_system_key;
      const bm = !b.unique_system_key;
      if (am && !bm) return 1;
      if (!am && bm) return -1;
      if (a.unique_system_key !== b.unique_system_key) {
        return (a.unique_system_key || "").localeCompare(b.unique_system_key || "");
      }
      if (a.system !== b.system) return (a.system || "").localeCompare(b.system || "");
      return (a.component || "").localeCompare(b.component || "");
    })
    .forEach(r => {
      const key = r.unique_system_key || missingSystemKey;
      (window.groupedSystemData[key] ||= []).push(r);
    });

  // bygg faner
  systemTabsContainer.innerHTML = "";
  systemTabContentContainer.innerHTML = "";

  const order = Object.keys(window.groupedSystemData).sort((a, b) => {
    if (a === missingSystemKey) return 1;
    if (b === missingSystemKey) return -1;
    return a.localeCompare(b);
  });

  let first = true;
  order.forEach(sysName => {
    const tabId = `tab-${sysName.replace(/\W/g, "_")}`;
    const li = document.createElement("li");
    li.className = "nav-item";
    li.innerHTML = `
      <button class="nav-link ${first ? "active" : ""}" id="${tabId}-tab"
              data-bs-toggle="tab" data-bs-target="#${tabId}" type="button" role="tab"
              aria-controls="${tabId}" aria-selected="${first ? "true" : "false"}">
        ${sysName}
      </button>`;
    systemTabsContainer.appendChild(li);

    const pane = document.createElement("div");
    pane.className = `tab-pane fade ${first ? "show active" : ""}`;
    pane.id = tabId;
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", `${tabId}-tab`);

    const table = document.createElement("table");
    table.className = "table table-bordered";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Full ID</th>
          <th>Beskrivelse</th>
          <th>Filer</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    const tbody = qs("tbody", table);

    (window.groupedSystemData[sysName] || []).forEach(row => {
      const matchingFiles = (row.files || []).filter(f => activeFiles.has(f));
      if (matchingFiles.length === 0) return;
      const tr = document.createElement("tr");

      let fullIdDisplay = row.full_id;
      if (sysName === "Systemnummer mangler" && (row.system || "") === "") {
        fullIdDisplay = `<span style="color:#FFCCCC;font-weight:bold;">Systemnummer mangler</span>`;
      }

      tr.innerHTML = `
        <td>${fullIdDisplay}</td>
        <td>${row.desc}</td>
        <td>${matchingFiles.join(", ")}</td>`;
      tbody.appendChild(tr);
    });

    pane.appendChild(table);
    qs("#systemTabContent").appendChild(pane);
    first = false;
  });
}

// Eksponer for filter events
window.renderOpptellingTable = renderOpptellingTable;
window.renderSystemTable = renderSystemTable;

// ───────────────────────────────────────────────────────────────────────────────
// DOM Ready
// ───────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ systemkomponent.js kjører!");

  // FORMATBYGGER: bruk data-placeholder (alltid {byggnr}{system}{komponent}{typekode} etc.)
  const segments = qsa("#format-segmenter .segment");
  const formatInput = qs("#format-input");
  segments.forEach(seg => {
    seg.classList.remove("selected");
    seg.addEventListener("click", () => {
      seg.classList.toggle("selected");
      const active = segments
        .filter(s => s.classList.contains("selected"))
        .map(s => s.dataset.placeholder); // <<< viktige: MALEN, ikke eksempelteks
      formatInput.value = active.join("");
    });
  });

  // SYSTEMKRITERIER: hovedknapper (3,4,5,...) åpner modal for 30..39
  const sysBtns = qsa("#system-kriterier .sys-btn");
  sysBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // gjør det mulig å åpne flere modaler i serie – ikke tving single select
      btn.classList.toggle("selected");
      openModalFor(btn.dataset.val);
    });
  });

  // INIT
  updateTableHeader("velg");
  const systemTabsContainer = qs("#systemTabs");
  const systemTabContentContainer = qs("#systemTabContent");
  const mainResultTable = qs("#resultat-tabell");
  systemTabsContainer.style.display = "none";
  systemTabContentContainer.innerHTML = "";
  mainResultTable.style.display = "";

  // Funksjonsvalg endrer header og nullstiller tabell
  qs("#funksjonsvalg").addEventListener("change", e => {
    updateTableHeader(e.target.value);
    qs("#resultat-tabell tbody").innerHTML = "";
    qs("#fil-filter").innerHTML = "";
    systemTabsContainer.style.display = "none";
    systemTabContentContainer.innerHTML = "";
    mainResultTable.style.display = "";
    window.masterRowsOpptelling = [];
    window.masterRowsSystem = [];
    window.groupedSystemData = {};
  });

  // GENERER TABELL
  qs("#generer-tabell").addEventListener("click", async (e) => {
    e.preventDefault();

    const funksjonsvalg = qs("#funksjonsvalg").value;                 // "komponentopptelling" | "systembygging"
    let format = (formatInput.value || "").trim();                    // f.eks. "{byggnr}{system}{komponent}{typekode}"
    const kriterier = buildKriterierString();                         // f.eks. "30,31,39"
    const files = qs("#filopplaster").files;
    const status = qs("#status-text");

    if (files.length === 0) return alert("Velg minst én fil!");

    // fallback: for komponentopptelling er {komponent} eneste krav
    if (funksjonsvalg === "komponentopptelling" && !format) {
      format = "{komponent}";
      formatInput.value = format;
    }
    // for systembygging bør man ha en mal – minst {komponent}
    if (funksjonsvalg === "systembygging" && !format) {
      return alert("Bygg opp et format (minst {komponent}) før du starter.");
    }

    updateTableHeader(funksjonsvalg);
    status.textContent = "Starter…";

    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.append("format", format);
    fd.append("kriterier", kriterier);

    const res = await fetch(`/systemkomponent/${funksjonsvalg}`, { method: "POST", body: fd });
    if (!res.ok) { status.textContent = "Feil: " + res.status; return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rowsJSON = null;

    while (true) {
      const { done, value } = await reader.read();
      const chunk = value ? decoder.decode(value, { stream: true }) : "";
      buffer += chunk;

      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.currentFile) status.textContent = "Behandler: " + parsed.currentFile;
          if (parsed.rows) rowsJSON = parsed.rows;
        } catch (err) {
          console.error("JSON-line parse error:", line, err);
          status.textContent = "Feil: Ugyldig data mottatt. Sjekk konsollen.";
        }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        if (parsed.rows) rowsJSON = parsed.rows;
      } catch (err) {
        console.error("Final JSON chunk parse error:", buffer.trim(), err);
      }
    }

    if (!rowsJSON) { status.textContent = "Feil: Ingen data"; return; }

    // Bygg fil-filter
    status.textContent = "Ferdig!";
    const filterDiv = qs("#fil-filter");
    const allFiles = new Set();
    rowsJSON.forEach(r => (r.files || []).forEach(f => allFiles.add(f)));

    filterDiv.innerHTML = `<strong>Filfilter (Aktiv/Inaktiv):</strong><br>`;
    allFiles.forEach(file => {
      const id = `ff-${file.replace(/\W/g, "_")}`;
      const wrap = document.createElement("label");
      wrap.style.marginRight = "1rem";
      wrap.innerHTML = `
        <input type="checkbox" id="${id}" data-fname="${file}" checked>
        <span>${file}</span>
      `;
      filterDiv.appendChild(wrap);
    });

    // Koble filter-events til riktig renderer
    qsa("#fil-filter input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        if (funksjonsvalg === "komponentopptelling") renderOpptellingTable();
        else renderSystemTable();
      });
    });

    // Render
    if (funksjonsvalg === "komponentopptelling") {
      window.masterRowsOpptelling = rowsJSON;
      renderOpptellingTable();
    } else {
      window.masterRowsSystem = rowsJSON;
      renderSystemTable();
    }
  });

  // LAST NED EXCEL
  qs("#lastned-tabell").addEventListener("click", async () => {
    const funksjonsvalg = qs("#funksjonsvalg").value;
    const activeFiles = getActiveFilesFromFilter();
    const rows = [];

    if (funksjonsvalg === "komponentopptelling") {
      window.masterRowsOpptelling.forEach(r => {
        const match = (r.files || []).filter(f => activeFiles.has(f));
        if (match.length === 0) return;
        let filteredCount = 0;
        match.forEach(f => filteredCount += (r.per_file?.[f] || 0));
        rows.push({
          has_system: r.has_system,
          id: r.id,
          desc: r.desc,
          count: filteredCount,
          files: match
        });
      });
    } else {
      // systembygging – sorter før eksport for stabilt Excel
      const sorted = [...window.masterRowsSystem].sort((a, b) => {
        const am = !a.system;
        const bm = !b.system;
        if (am && !bm) return 1;
        if (!am && bm) return -1;
        if (a.unique_system_key !== b.unique_system_key) return (a.unique_system_key || "").localeCompare(b.unique_system_key || "");
        if (a.system !== b.system) return (a.system || "").localeCompare(b.system || "");
        return (a.component || "").localeCompare(b.component || "");
      });

      sorted.forEach(r => {
        const match = (r.files || []).filter(f => activeFiles.has(f));
        if (match.length === 0) return;
        rows.push({
          full_id: r.full_id,
          desc: r.desc,
          files: match,
          system: r.system,
          component: r.component,
          unique_system_key: r.unique_system_key
        });
      });
    }

    try {
      const res = await fetch("/systemkomponent/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, project_id: window.aktivtProsjektId })
      });
      if (!res.ok) {
        console.error("Feil ved nedlasting:", res.status, await res.text());
        alert("Feil ved nedlasting av Excel. Prøv igjen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (funksjonsvalg === "komponentopptelling" ? "Komponentopptelling.xlsx" : "Systembygging.xlsx");
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Uventet feil under nedlasting:", err);
      alert("Uventet feil under nedlasting. Sjekk konsollen.");
    }
  });

  // Tøm tabell
  window.tomTabell = () => {
    qs("#resultat-tabell tbody").innerHTML = "";
    qs("#fil-filter").innerHTML = "";
    updateTableHeader(qs("#funksjonsvalg").value);
    qs("#systemTabs").style.display = "none";
    qs("#systemTabContent").innerHTML = "";
    qs("#resultat-tabell").style.display = "";
    window.masterRowsOpptelling = [];
    window.masterRowsSystem = [];
    window.groupedSystemData = {};
  };

  // Prosjektvalg + send til prosjekt
  const prosjektSelect = qs("#prosjektvalg");
  const sendKnapp = qs("#send-til-prosjekt");
  if (prosjektSelect && sendKnapp) {
    prosjektSelect.addEventListener("change", e => {
      const id = parseInt(e.target.value);
      window.aktivtProsjektId = id || null;
      sendKnapp.style.display = window.aktivtProsjektId ? "block" : "none";
    });

    sendKnapp.addEventListener("click", async () => {
      const projectId = window.aktivtProsjektId;
      const funksjonsvalg = qs("#funksjonsvalg").value;
      if (!projectId) return alert("Ingen prosjekt valgt");

      const payload = {
        project_id: projectId,
        rows: (funksjonsvalg === "komponentopptelling") ? window.masterRowsOpptelling : window.masterRowsSystem
      };

      try {
        const res = await fetch(`/systemkomponent/send/${funksjonsvalg}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) alert("✅ Sendt til prosjekt!");
        else alert("❌ Feil ved innsending: " + (await res.text()));
      } catch (err) {
        console.error("Uventet feil:", err);
        alert("❌ Uventet feil. Se konsollen for detaljer.");
      }
    });
  }
});
