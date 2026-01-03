// ============================================================================
// CORE – tilstand, helpers, felles farger og API-hjelpere
// ============================================================================

export let ALL_DATA_FROM_BACKEND = [];
export let allRows = [];

export let FUNKSJONSBANK = {}; // { TFM: [ {navn,test,aksept}, ... ] }
export let USERS = [];
export let TECHS = [];

export let ACTIVE_FILES = new Set();
export const TFM_SETTINGS = { MC: new Set(), FUNKSJONSTEST: new Set(), INNREGULERING: new Set() };
export const valgtSystemPrefiks = {};

export let ALL_GROUPED_COMPONENTS = {};
export let ALL_IDENTIFIED_SYSTEMS = [];
export let SELECTED_SYSTEM_NUMBERS = new Set();

export function showMessage(message, type = 'info') {
  const messageBox = document.getElementById('message-box');
  if (!messageBox) return;
  messageBox.textContent = message;
  messageBox.className = 'p-3 my-2 rounded-lg text-white fw-semibold';
  const types = { error: 'bg-danger', success: 'bg-success', warning: 'bg-warning text-dark', info: 'bg-primary' };
  messageBox.classList.add(types[type] || types['info']);
  messageBox.style.display = 'block';
  setTimeout(() => { if (messageBox) messageBox.style.display = 'none'; }, 5000);
}

// autosize for textarea
export function addAutoHeightListeners(element) {
  const adjust = () => { element.style.height = 'auto'; element.style.height = `${element.scrollHeight}px`; };
  ['input','change','cut','paste','drop','keydown'].forEach(e => element.addEventListener(e, adjust));
  element.classList.add('autoarea');
  adjust();
}

export function applyColorCoding(selectElement, colorMap) {
  selectElement.style.backgroundColor = colorMap[selectElement.value] || "";
}
export const STATUS_COLORS = { "Ikke startet":"#e0e0e0","Under arbeid":"#fff2cc","Avvik":"#f4cccc","Utført":"#d9ead3","Fullført":"#d9ead3" };
export const INTEGRERT_TEST_COLORS = {"I/A":"#ededed","Nei":"#fff2cc","OK":"#d9ead3"};

export function td(child) { const c = document.createElement("td"); c.appendChild(child); return c; }
export function tdText(text) { const c = document.createElement("td"); c.textContent = text; return c; }

export function dropdown(optionsArray, defaultText = "-- Velg --") {
  const select = document.createElement("select");
  select.className = "form-select";
  select.innerHTML = `<option value="">${defaultText}</option>`;
  optionsArray.forEach(opt => {
    const o = document.createElement("option"); o.value = o.text = opt; select.appendChild(o);
  });
  return select;
}

// ---------- API helpers ----------
export async function getUsers() {
  try { const r=await fetch("/protokoller/api/users"); if(!r.ok) throw 0; USERS=await r.json(); }
  catch { USERS=[]; showMessage("Kunne ikke hente brukere.", "error"); }
}
export async function getTechnicians() {
  try { const r=await fetch("/protokoller/api/technicians"); if(!r.ok) throw 0; TECHS=await r.json(); }
  catch { TECHS=[]; showMessage("Kunne ikke hente teknikere.", "error"); }
}
export async function getLoggedInUser() {
  try { const r=await fetch("/protokoller/api/me"); return r.ok ? await r.text() : "UkjentBruker"; }
  catch { return "UkjentBruker"; }
}
// ============================================================================
// TABLES – bygger tabeller for FT / MC / INNREGULERING + systemfaner
// ============================================================================

import {
  FUNKSJONSBANK, USERS, TECHS,
  showMessage, addAutoHeightListeners, applyColorCoding,
  STATUS_COLORS, INTEGRERT_TEST_COLORS,
  dropdown, td, tdText
} from "./protokoller.core.js";

// ====================== FUNKSJONSTEST (NY KOLONNEREKKEFØLGE) =================
export function buildFTTable(rows) {
  const tbl = document.createElement("table");
  tbl.className = "table table-bordered";
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Status</th>
        <th>System</th>
        <th>Komponent</th>
        <th>Forslag</th>
        <th>Valgt forslag</th>
        <th>Testutførelse</th>
        <th>Forventet resultat</th>
        <th>Integrert test</th>
        <th>Funksjoner</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  rows.forEach(rad => {
    const tr = tbody.insertRow();
    const tfm = (rad.komponent || "").substring(0,2).toUpperCase();
    const forslagForTFM = FUNKSJONSBANK[tfm] || [];

    // 1) Status
    const statusSelect = dropdown(["Ikke startet","Under arbeid","Avvik","Fullført"], "");
    statusSelect.value = rad.status || "Ikke startet";
    applyColorCoding(statusSelect, STATUS_COLORS);
    statusSelect.onchange = () => applyColorCoding(statusSelect, STATUS_COLORS);
    tr.appendChild(td(statusSelect));

    // 2) System (read-only)
    const sysInput = document.createElement("input");
    sysInput.type="text"; sysInput.className="form-control"; sysInput.value = rad.system_number || ""; sysInput.readOnly = true;
    tr.appendChild(td(sysInput));

    // 3) Komponent (read-only)
    const kompInput = document.createElement("input");
    kompInput.type="text"; kompInput.className="form-control"; kompInput.value = rad.komponent || ""; kompInput.readOnly = true;
    tr.appendChild(td(kompInput));

    // 4) Forslag (fra bank)
    const forslagSel = document.createElement("select");
    forslagSel.className = "form-select";
    forslagSel.innerHTML = `<option value="">-- Velg funksjon --</option>`;
    forslagForTFM.forEach((f, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx); opt.textContent = f.navn || `(Uten navn ${idx+1})`;
      forslagSel.appendChild(opt);
    });
    if (!forslagForTFM.length) forslagSel.disabled = true;
    tr.appendChild(td(forslagSel));

    // 5) Valgt forslag (fri tekst – tidligere "Funksjonsbeskrivelse")
    const valgtInput = document.createElement("input");
    valgtInput.type="text"; valgtInput.className="form-control";
    valgtInput.value = rad.funksjonsbeskrivelse || rad.valgt_forslag || "";
    tr.appendChild(td(valgtInput));

    // 6) Testutførelse – autosize
    const testArea = document.createElement("textarea");
    testArea.className = "form-control";
    testArea.value = rad.testutfoerelse || "";
    addAutoHeightListeners(testArea);
    tr.appendChild(td(testArea));

    // 7) Forventet resultat – autosize (tidl. aksept)
    const expArea = document.createElement("textarea");
    expArea.className = "form-control";
    expArea.value = rad.aksept || rad.forventet || "";
    addAutoHeightListeners(expArea);
    tr.appendChild(td(expArea));

    // 8) Integrert test
    const integrertSelect = dropdown(["I/A","Nei","OK"], "");
    integrertSelect.value = rad.integrert || "I/A";
    applyColorCoding(integrertSelect, INTEGRERT_TEST_COLORS);
    integrertSelect.onchange = () => applyColorCoding(integrertSelect, INTEGRERT_TEST_COLORS);
    tr.appendChild(td(integrertSelect));

    // 9) Funksjoner (lagre/slett)
    const btnTd = document.createElement("td");
    btnTd.className = 'd-flex flex-column align-items-center justify-content-center';

    const lagreBtn = document.createElement("button");
    lagreBtn.className = "btn btn-sm btn-outline-primary mb-1";
    lagreBtn.textContent = "Lagre test";
    lagreBtn.onclick = async () => {
      const navn = prompt("Gi funksjonen et visningsnavn:");
      if (!navn) return;
      const payload = {
        tfm,
        navn,
        test: testArea.value,
        aksept: expArea.value
      };
      try {
        const res = await fetch("/protokoller/lagre_funksjonstest", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showMessage("Ny funksjon lagret!", "success");
          // legg inn i lokal FUNKSJONSBANK også
          FUNKSJONSBANK[tfm] = FUNKSJONSBANK[tfm] || [];
          FUNKSJONSBANK[tfm].push({navn: payload.navn, test: payload.test, aksept: payload.aksept});
          const opt = document.createElement("option");
          opt.value = String(FUNKSJONSBANK[tfm].length - 1);
          opt.textContent = payload.navn;
          forslagSel.appendChild(opt);
          forslagSel.disabled = false;
        } else {
          showMessage("Feil ved lagring.", "error");
        }
      } catch {
        showMessage("Nettverksfeil ved lagring.", "error");
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm btn-outline-danger";
    deleteBtn.textContent = "Slett linje";
    deleteBtn.onclick = () => {
      if (!confirm("Er du sikker på at du vil slette denne linjen?")) return;
      tr.remove();
    };

    btnTd.append(lagreBtn, deleteBtn);
    tr.appendChild(btnTd);

    // Koble forslag → fyll felter
    forslagSel.onchange = () => {
      const idx = Number(forslagSel.value);
      const f = forslagForTFM[idx];
      if (!f) return;
      valgtInput.value  = f.navn || "";
      testArea.value    = f.test || "";
      expArea.value     = f.aksept || "";
      [testArea, expArea].forEach(addAutoHeightListeners);
    };
  });

  return tbl;
}

// ============================= MC ============================================
export function buildMCProtocolTable(rows) {
  const tbl = document.createElement("table");
  tbl.className = "table table-bordered";
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Montasjestatus</th><th>Kablet og koblet</th><th>Merket</th><th>Komponent</th>
        <th>Beskrivelse</th><th>Tilordnet til</th><th>Utført av</th><th>Dato utført</th><th>Kommentar</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  rows.forEach(r => {
    const tr = tbody.insertRow();
    const statusOptions = ["Ikke startet","Under arbeid","Avvik","Utført"];
    const sA = dropdown(statusOptions, ""), sB = dropdown(statusOptions, ""), sC = dropdown(statusOptions, "");
    [sA,sB,sC].forEach(s => { applyColorCoding(s, STATUS_COLORS); s.onchange=()=>applyColorCoding(s, STATUS_COLORS); });
    const d = document.createElement("input"); d.type="date"; d.className="form-control";
    const c = document.createElement("input"); c.className="form-control";
    tr.append(td(sA), td(sB), td(sC), tdText(r.full_id||""), tdText(r.desc||""), td(dropdown(USERS)), td(dropdown(TECHS)), td(d), td(c));
  });
  return tbl;
}

// ======================= INNREGULERING ======================================
export function buildInnreguleringTable(rows){
  const tbl=document.createElement("table"); tbl.className="table table-bordered";
  tbl.innerHTML=`
    <thead><tr><th>Velg</th><th>Komponentnavn</th><th>vMin</th><th>vMid</th><th>vMaks</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td><input type="checkbox" checked></td><td>${r.komponent||"-"}</td><td>${r.vMin||"-"}</td><td>${r.vMid||"-"}</td><td>${r.vMaks||"-"}</td></tr>`).join("")}</tbody>`;
  return tbl;
}
// ============================================================================
// UI – wiring, systemfilter, generering, nedlasting, TFM/Prefiks-modaler
// ============================================================================

import {
  ALL_GROUPED_COMPONENTS, ALL_IDENTIFIED_SYSTEMS, SELECTED_SYSTEM_NUMBERS,
  valgtSystemPrefiks,
  showMessage,
  getUsers, getTechnicians, getLoggedInUser
} from "./protokoller.core.js";

import {
  buildFTTable, buildMCProtocolTable, buildInnreguleringTable
} from "./protokoller.tables.js";

// ---------- Systemfilter (checkboxer) ----------
function renderSystemFilter() {
  const filterContainer = document.getElementById('system-filter-container');
  if (!filterContainer) return;
  filterContainer.innerHTML = '<h6>Filtrer systemer:</h6>';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'btn btn-sm btn-outline-secondary me-2 mb-2';
  selectAllBtn.textContent = 'Velg alle';
  selectAllBtn.onclick = () => {
    SELECTED_SYSTEM_NUMBERS.clear();
    ALL_IDENTIFIED_SYSTEMS.forEach(sys => SELECTED_SYSTEM_NUMBERS.add(sys.number));
    for (const k in valgtSystemPrefiks) delete valgtSystemPrefiks[k];
    document.querySelectorAll(".sys-btn.selected").forEach(b => b.classList.remove("selected"));
    updateFilteredTabs(); renderSystemFilter();
  };

  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'btn btn-sm btn-outline-secondary mb-2';
  clearAllBtn.textContent = 'Fjern alle';
  clearAllBtn.onclick = () => {
    SELECTED_SYSTEM_NUMBERS.clear();
    for (const k in valgtSystemPrefiks) delete valgtSystemPrefiks[k];
    document.querySelectorAll(".sys-btn.selected").forEach(b => b.classList.remove("selected"));
    updateFilteredTabs(); renderSystemFilter();
  };

  filterContainer.append(selectAllBtn, clearAllBtn);

  const box = document.createElement('div'); box.className = 'd-flex flex-wrap'; filterContainer.appendChild(box);
  ALL_IDENTIFIED_SYSTEMS.forEach(sys => {
    const id = `sys-filter-${sys.number.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const wrap = document.createElement('div'); wrap.className = 'form-check form-check-inline';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.className = 'form-check-input'; input.id = id;
    input.value = sys.number; input.checked = SELECTED_SYSTEM_NUMBERS.has(sys.number);
    input.onchange = e => {
      e.target.checked ? SELECTED_SYSTEM_NUMBERS.add(sys.number) : SELECTED_SYSTEM_NUMBERS.delete(sys.number);
      for (const k in valgtSystemPrefiks) delete valgtSystemPrefiks[k];
      document.querySelectorAll(".sys-btn.selected").forEach(b => b.classList.remove("selected"));
      updateFilteredTabs();
    };
    const label = document.createElement('label');
    label.className = 'form-check-label'; label.htmlFor = id; label.textContent = sys.full_name;
    wrap.append(input, label); box.appendChild(wrap);
  });
}

function openModalFor(hovedsiffer) {
  const modalEl = document.getElementById("filterModal");
  const modal = new bootstrap.Modal(modalEl);
  const checkboxesDiv = document.getElementById("modalCheckboxes");
  const title = document.getElementById("modalTitle");
  title.textContent = `Velg systemer fra kategori ${hovedsiffer}x`;
  checkboxesDiv.innerHTML = "";

  for (let i=0;i<=9;i++){
    const val = `${hovedsiffer}${i}`, id = `chk-${val}`;
    const checked = valgtSystemPrefiks[hovedsiffer]?.includes(val) || false;
    const label = document.createElement("label");
    label.htmlFor = id; label.className = "form-check form-check-inline";
    label.innerHTML = `<input type="checkbox" class="form-check-input" id="${id}" value="${val}" ${checked?'checked':''}> ${val}`;
    checkboxesDiv.appendChild(label);
  }
  document.getElementById("modalConfirm").onclick = () => {
    valgtSystemPrefiks[hovedsiffer] = [...checkboxesDiv.querySelectorAll("input:checked")].map(cb => cb.value);
    bootstrap.Modal.getInstance(modalEl).hide(); oppdaterVisningBasertPåPrefiks();
  };
  modal.show();
}

function oppdaterVisningBasertPåPrefiks() {
  SELECTED_SYSTEM_NUMBERS.clear();
  if (Object.keys(valgtSystemPrefiks).length === 0) {
    ALL_IDENTIFIED_SYSTEMS.forEach(sys => SELECTED_SYSTEM_NUMBERS.add(sys.number));
  } else {
    const chosen = Object.values(valgtSystemPrefiks).flat();
    ALL_IDENTIFIED_SYSTEMS.forEach(sys => { if (chosen.includes(sys.number.slice(0,2))) SELECTED_SYSTEM_NUMBERS.add(sys.number); });
  }
  renderSystemFilter(); updateFilteredTabs();
}

function updateFilteredTabs() {
  const tabs = document.getElementById("systemTabs");
  const content = document.getElementById("systemTabContent");
  tabs.innerHTML = ''; content.innerHTML = '';

  const toRender = Object.keys(ALL_GROUPED_COMPONENTS).filter(s => SELECTED_SYSTEM_NUMBERS.has(s)).sort();
  if (!toRender.length){
    const msg = Object.keys(ALL_GROUPED_COMPONENTS).length ? 'Ingen systemer valgt eller ingen resultater.' : 'Ingen systemer funnet.';
    content.innerHTML = `<p class="text-muted p-3">${msg}</p>`; return;
  }

  toRender.forEach((system_number, idx) => {
    const rader = ALL_GROUPED_COMPONENTS[system_number];
    const full = rader[0]?.system_full_name || system_number;
    const id = `tab-${system_number.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const isActive = idx===0;

    const li = document.createElement("li"); li.className="nav-item";
    li.innerHTML = `<a class="nav-link ${isActive?'active':''}" data-bs-toggle="tab" href="#${id}">${full}</a>`;
    tabs.appendChild(li);

    const pane = document.createElement("div"); pane.className = `tab-pane fade ${isActive?'show active':''}`; pane.id=id;
    pane.appendChild(buildFTTable(rader)); // bruker FT-varianten når vi er i FT-visning
    content.appendChild(pane);
  });

  const first = tabs.querySelector('.nav-link'); if (first) new bootstrap.Tab(first).show();
}

// ------------------------- Filfilter -------------------------
function renderFileFilter(files, refreshCallback){
  const c=document.getElementById("fileFilterContainer"); if(!c) return;
  c.innerHTML = `<label class="form-label">Filfilter (vis/skjul):</label>`;
  files.forEach(f=>{
    const wrap=document.createElement("div"); wrap.className="form-check";
    wrap.innerHTML = `<input class="form-check-input" type="checkbox" checked data-filename="${f}" id="file-chk-${f}">
                      <label class="form-check-label" for="file-chk-${f}">${f}</label>`;
    c.appendChild(wrap);
  });
  c.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
    chk.onchange=()=>{
      const active = Array.from(c.querySelectorAll("input:checked")).map(i=>i.dataset.filename);
      refreshCallback(window.allRows.filter(r=>active.includes(r.source)));
    };
  });
}

// ============================== GENERERING ==============================
async function generateFunksjonstest() {
  const format = document.getElementById("format-input").value.trim() || "{komponent}";
  const filer = document.getElementById("filopplaster").files;
  const statusText = document.getElementById("status-text");
  const funksjon = document.getElementById("funksjonsvalg").value;
  const system_kriterier = Object.values(valgtSystemPrefiks).flat().join(',');

  if (filer.length === 0) return showMessage("Last opp minst én fil.", 'warning');

  const formData = new FormData();
  formData.append("format", format);
  formData.append("funksjon", funksjon);
  formData.append("system_kriterier", system_kriterier);
  for (const f of filer) formData.append("files", f);

  statusText.textContent = "Leser funksjonstest-underlag...";

  try {
    const res = await fetch("/protokoller/generate_funksjonstest", { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    window.allRows = data;

    // Hent forslag fra Excel-banken via API
    const tfms = [...new Set(window.allRows.map(r => (r.komponent || "").substring(0,2).toUpperCase()))].filter(Boolean);
    if (tfms.length) {
      try {
        const fb = await fetch(`/protokoller/api/funksjonsbank?tfm=${tfms.join(",")}`);
        if (fb.ok) {
          const bank = await fb.json();
          // merge
          for (const k of Object.keys(bank)) {
            if (!window.FUNKSJONSBANK[k]) window.FUNKSJONSBANK[k] = [];
            window.FUNKSJONSBANK[k].push(...bank[k]);
          }
        }
      } catch {}
    }

    // Prefill klient
    window.allRows.forEach(r=>{
      const bank = (window.FUNKSJONSBANK || {})[(r.komponent||"").substring(0,2).toUpperCase()];
      if (bank && bank.length) {
        r.funksjonsbeskrivelse = r.funksjonsbeskrivelse || bank[0].navn || "";
        r.testutfoerelse       = r.testutfoerelse       || bank[0].test || "";
        r.aksept               = r.aksept               || bank[0].aksept || "";
      }
    });

    // Gruppér per system (som før)
    const grouped = {};
    const systems = new Map();
    window.allRows.forEach(r=>{
      const key = r.unique_system || r.system_number || "Uspesifisert";
      (grouped[key] ??= []).push(r);
      if (!systems.has(key)) systems.set(key, { number: key, full_name: r.system_full_name || key });
    });
    window.ALL_GROUPED_COMPONENTS = grouped;
    window.ALL_IDENTIFIED_SYSTEMS = Array.from(systems.values());
    window.SELECTED_SYSTEM_NUMBERS = new Set(window.ALL_IDENTIFIED_SYSTEMS.map(s => s.number));

    const uniqueFiles = [...new Set(window.allRows.map(row => row.source))];
    renderFileFilter(uniqueFiles, rows => {
      // Rebygg FT-faner med filtrerte rader
      const grouped2 = {};
      rows.forEach(r=>{
        const key = r.unique_system || r.system_number || "Uspesifisert";
        (grouped2[key] ??= []).push(r);
      });
      window.ALL_GROUPED_COMPONENTS = grouped2;
      updateFilteredTabs();
    });

    document.getElementById("systemTabs").style.display="flex";
    document.getElementById("systemTabContent").style.display="block";
    document.getElementById("protocol-table").style.display="none";

    renderSystemFilter();
    updateFilteredTabs();

    statusText.textContent = `Fant ${data.length} komponenter.`;
    showMessage("Funksjonstest-underlag generert!", "success");
    document.getElementById("download-protocol-btn").disabled = false;

  } catch (err) {
    showMessage(`Noe gikk galt: ${err.message}`, 'error');
    statusText.textContent = "Status: Feil ved henting.";
  }
}

async function generateMCProtokoll() {
  const format = document.getElementById("format-input").value.trim();
  const filer = document.getElementById("filopplaster").files;
  const statusText = document.getElementById("status-text");
  const funksjon = document.getElementById("funksjonsvalg").value;
  const system_kriterier = Object.values(valgtSystemPrefiks).flat().join(',');
  if (!format || filer.length === 0) return showMessage("Du må angi format og laste opp filer.", 'warning');

  const formData = new FormData();
  formData.append("format", format);
  formData.append("funksjon", funksjon);
  formData.append("system_kriterier", system_kriterier);
  for (const f of filer) formData.append("files", f);

  statusText.textContent = "Skanner dokumenter for MC-protokoll...";
  try {
    const response = await fetch("/protokoller/api/scan", { method:"POST", body: formData });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Serverfeil (${response.status}): ${responseText.slice(0,500)}`);
    let data; try { data = JSON.parse(responseText); } catch { throw new Error("Mottok data som ikke kunne tolkes."); }
    window.allRows = data;

    // Gruppér og render
    const grouped={}; const systems=new Map();
    window.allRows.forEach(r=>{const k=r.unique_system||"Uspesifisert"; (grouped[k]??=[]).push(r); systems.set(k,{number:k, full_name:k});});
    const tabs=document.getElementById("systemTabs"), content=document.getElementById("systemTabContent");
    tabs.innerHTML=""; content.innerHTML="";
    Object.keys(grouped).sort().forEach((sys,idx)=>{
      const id=`mc_tab_${sys.replace(/[^a-zA-Z0-9]/g,'_')}`, active=idx===0;
      const li=document.createElement("li"); li.className="nav-item";
      li.innerHTML=`<a class="nav-link ${active?'active':''}" data-bs-toggle="tab" href="#${id}">${sys}</a>`; tabs.appendChild(li);
      const pane=document.createElement("div"); pane.className=`tab-pane fade ${active?'show active':''}`; pane.id=id;
      pane.appendChild(buildMCProtocolTable(grouped[sys])); content.appendChild(pane);
    });
    document.getElementById("protocol-table").style.display="none";
    tabs.style.display="flex"; content.style.display="block";
    const first=tabs.querySelector('.nav-link'); if(first) new bootstrap.Tab(first).show();

    // filfilter
    const uniqueFiles = [...new Set(window.allRows.map(row => row.source))];
    renderFileFilter(uniqueFiles, rows => {
      const grouped2={}; rows.forEach(r=>{const k=r.unique_system||"Uspesifisert"; (grouped2[k]??=[]).push(r);});
      const tabs=document.getElementById("systemTabs"), content=document.getElementById("systemTabContent");
      tabs.innerHTML=""; content.innerHTML="";
      Object.keys(grouped2).sort().forEach((sys,idx)=>{
        const id=`mc_tab_${sys.replace(/[^a-zA-Z0-9]/g,'_')}`, active=idx===0;
        const li=document.createElement("li"); li.className="nav-item";
        li.innerHTML=`<a class="nav-link ${active?'active':''}" data-bs-toggle="tab" href="#${id}">${sys}</a>`; tabs.appendChild(li);
        const pane=document.createElement("div"); pane.className=`tab-pane fade ${active?'show active':''}`; pane.id=id;
        pane.appendChild(buildMCProtocolTable(grouped2[sys])); content.appendChild(pane);
      });
      const first=tabs.querySelector('.nav-link'); if(first) new bootstrap.Tab(first).show();
    });

    statusText.textContent = `Fant ${data.length} komponenter.`; showMessage("Skanning fullført!", "success");
    document.getElementById("download-protocol-btn").disabled = false;
  } catch (err) {
    showMessage("Feil under scanning: " + err.message, "error"); statusText.textContent = "Feil ved scanning.";
  }
}

async function generateInnreguleringsprotokoll() {
  const format = document.getElementById("format-input").value.trim();
  const filer = document.getElementById("filopplaster").files;
  const statusText = document.getElementById("status-text");
  const funksjon = document.getElementById("funksjonsvalg").value;
  const system_kriterier = Object.values(valgtSystemPrefiks).flat().join(',');
  if (!format || filer.length === 0) return showMessage("Du må angi format og laste opp filer.", 'warning');

  const formData = new FormData();
  formData.append("format", format); formData.append("funksjon", funksjon);
  formData.append("system_kriterier", system_kriterier);
  for (const f of filer) formData.append("files", f);

  statusText.textContent = "Genererer innreguleringsprotokoll...";
  try {
    const res = await fetch("/protokoller/generate_innreguleringsprotokoll", { method:"POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    window.allRows = data;

    // render tabs
    const grouped={}; window.allRows.forEach(r=>{const k=r.unique_system||"Uspesifisert"; (grouped[k]??=[]).push(r);});
    const tabs=document.getElementById("systemTabs"), content=document.getElementById("systemTabContent");
    tabs.innerHTML=""; content.innerHTML="";
    Object.keys(grouped).sort().forEach((sys,idx)=>{
      const id=`in_tab_${sys.replace(/[^a-zA-Z0-9]/g,'_')}`, active=idx===0;
      const li=document.createElement("li"); li.className="nav-item";
      li.innerHTML=`<a class="nav-link ${active?'active':''}" data-bs-toggle="tab" href="#${id}">${sys}</a>`; tabs.appendChild(li);
      const pane=document.createElement("div"); pane.className=`tab-pane fade ${active?'show active':''}`; pane.id=id;
      pane.appendChild(buildInnreguleringTable(grouped[sys])); content.appendChild(pane);
    });
    document.getElementById("protocol-table").style.display="none";
    tabs.style.display="flex"; content.style.display="block";
    const first=tabs.querySelector('.nav-link'); if(first) new bootstrap.Tab(first).show();

    // filfilter
    const uniqueFiles = [...new Set(window.allRows.map(row => row.source))];
    renderFileFilter(uniqueFiles, rows => {
      const grouped2={}; rows.forEach(r=>{const k=r.unique_system||"Uspesifisert"; (grouped2[k]??=[]).push(r);});
      const tabs=document.getElementById("systemTabs"), content=document.getElementById("systemTabContent");
      tabs.innerHTML=""; content.innerHTML="";
      Object.keys(grouped2).sort().forEach((sys,idx)=>{
        const id=`in_tab_${sys.replace(/[^a-zA-Z0-9]/g,'_')}`, active=idx===0;
        const li=document.createElement("li"); li.className="nav-item";
        li.innerHTML=`<a class="nav-link ${active?'active':''}" data-bs-toggle="tab" href="#${id}">${sys}</a>`; tabs.appendChild(li);
        const pane=document.createElement("div"); pane.className=`tab-pane fade ${active?'show active':''}`; pane.id=id;
        pane.appendChild(buildInnreguleringTable(grouped2[sys])); content.appendChild(pane);
      });
      const first=tabs.querySelector('.nav-link'); if(first) new bootstrap.Tab(first).show();
    });

    statusText.textContent = `Fant ${data.length} komponenter for innregulering.`;
    showMessage("Innreguleringsprotokoll generert!", "success");
    document.getElementById("download-protocol-btn").disabled = false;
  } catch (e) { showMessage(`Feil ved behandling: ${e.message}`, 'error'); }
}

// ================================ INIT =================================
document.addEventListener("DOMContentLoaded", async () => {
  // Hent brukere/teknikere (for MC)
  await Promise.all([getUsers(), getTechnicians()]);

  const funksjonsvalg = document.getElementById("funksjonsvalg");
  const generateBtn = document.getElementById("generate-data-btn");
  const downloadBtn = document.getElementById("download-protocol-btn");
  const clearBtn = document.getElementById("clear-table-btn");
  const tfmBtn = document.getElementById("tfm-popup-btn");
  const lagreTfmBtn = document.getElementById("lagre-tfm-btn");
  const formatInput = document.getElementById("format-input");
  const protocolTable = document.getElementById("protocol-table");
  const systemTabs = document.getElementById("systemTabs");
  const systemTabContent = document.getElementById("systemTabContent");
  const systemFilterContainer = document.getElementById("system-filter-container");

  document.querySelectorAll("#format-segmenter .segment").forEach(seg=>{
    seg.onclick=()=>{
      seg.classList.toggle("selected");
      formatInput.value = Array.from(document.querySelectorAll("#format-segmenter .segment.selected"))
        .map(s => s.dataset.placeholder).join("");
    };
  });

  document.querySelectorAll(".sys-btn").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".sys-btn").forEach(b=>b.classList.remove("selected"));
      btn.classList.add("selected"); openModalFor(btn.dataset.val);
    };
  });

  funksjonsvalg.onchange=()=>{
    const valgt = funksjonsvalg.value.toUpperCase();
    const thead = protocolTable.querySelector("thead");
    systemTabs.innerHTML=""; systemTabContent.innerHTML=""; systemFilterContainer.style.display="none"; protocolTable.style.display="table";
    for (const k in valgtSystemPrefiks) delete valgtSystemPrefiks[k];
    document.querySelectorAll(".sys-btn.selected").forEach(b=>b.classList.remove("selected"));
    tfmBtn.style.display = ["MC","INNREGULERING","FUNKSJONSTEST"].includes(valgt) ? "inline-block" : "none";
    if (valgt==="MC"){
      thead.innerHTML=`<tr><th>Montasjestatus</th><th>Kablet og koblet</th><th>Merket</th><th>Komponentnavn</th><th>Beskrivelse</th><th>Tilordnet til</th><th>Utført av</th><th>Dato utført</th><th>Kommentar</th></tr>`;
    } else if (valgt==="INNREGULERING"){
      thead.innerHTML=`<tr><th>Velg</th><th>Komponentnavn</th><th>vMin</th><th>vMid</th><th>vMaks</th></tr>`;
    } else {
      thead.innerHTML=""; protocolTable.style.display="none";
    }
  };

  generateBtn.onclick = async () => {
    const valgt = funksjonsvalg.value;
    if (!valgt) return showMessage("Velg en funksjon først.", "info");
    protocolTable.style.display="none"; systemFilterContainer.style.display="none";
    if (valgt==="MC") await generateMCProtokoll();
    else if (valgt==="INNREGULERING") await generateInnreguleringsprotokoll();
    else if (valgt==="FUNKSJONSTEST"){ systemFilterContainer.style.display="block"; await generateFunksjonstest(); }
  };

  clearBtn.onclick=()=>{
    systemTabs.innerHTML=""; systemTabContent.innerHTML="";
    systemTabs.style.display="none"; systemTabContent.style.display="none";
    protocolTable.querySelector("tbody").innerHTML=""; protocolTable.style.display="table";
    systemFilterContainer.innerHTML=""; systemFilterContainer.style.display="none";
    document.getElementById("fileFilterContainer").innerHTML="";
    window.allRows=[]; window.ALL_GROUPED_COMPONENTS={}; window.ALL_IDENTIFIED_SYSTEMS=[]; window.SELECTED_SYSTEM_NUMBERS.clear();
    for (const k in valgtSystemPrefiks) delete valgtSystemPrefiks[k];
    document.querySelectorAll(".sys-btn.selected").forEach(b=>b.classList.remove("selected"));
    document.getElementById("status-text").textContent="Tabell tømt."; showMessage("Alt innhold er fjernet.", "info");
  };

  // --------- TFM modal ----------
  tfmBtn.onclick=async()=>{
    const funksjon = funksjonsvalg.value;
    const tbody = document.getElementById("tfmTable")?.querySelector("tbody");
    if(!tbody) return showMessage("TFM-tabellen ble ikke funnet.", "error");
    try{
      const [statusRes, dictRes] = await Promise.all([
        fetch(`/protokoller/api/tfm-liste?funksjon=${funksjon}`),
        fetch(`/static/data/tfm-dict.json`)
      ]);
      if(!statusRes.ok || !dictRes.ok) throw new Error("Kunne ikke laste TFM-data.");
      const statusData = await statusRes.json(); const beskrivelseData = await dictRes.json();
      tbody.innerHTML="";
      Object.entries(statusData).forEach(([kode, aktiv])=>{
        const tr = tbody.insertRow();
        const sel = document.createElement("select");
        sel.className="form-select"; sel.innerHTML=`<option>Aktiv</option><option>Inaktiv</option>`;
        sel.value = aktiv ? "Aktiv":"Inaktiv"; sel.style.backgroundColor = aktiv ? "#d9ead3":"#e0e0e0";
        sel.onchange = () => sel.style.backgroundColor = sel.value==="Aktiv" ? "#d9ead3" : "#e0e0e0";
        tr.append(tdText(kode), tdText(beskrivelseData[kode]||"Ikke i bruk"), td(sel));
      });
      new bootstrap.Modal(document.getElementById("tfmModal")).show();
    } catch(e){ showMessage(`TFM-feil: ${e.message}`, "error"); }
  };

  document.getElementById("lagre-tfm-btn").onclick=async()=>{
    const payload={}; const funksjon = funksjonsvalg.value;
    document.getElementById("tfmTable").querySelectorAll("tbody tr").forEach(tr=>{
      const kode = tr.cells[0].textContent.trim();
      const status = tr.querySelector("select").value;
      if (kode) payload[kode] = (status==="Aktiv");
    });
    try{
      const r=await fetch(`/protokoller/api/tfm-liste/save?funksjon=${funksjon}`,{
        method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
      });
      if(!r.ok) throw new Error(await r.text());
      showMessage("TFM-filteret er lagret!", "success");
      bootstrap.Modal.getInstance(document.getElementById("tfmModal")).hide();
    }catch(e){ showMessage(`Feil ved lagring av TFM: ${e.message}`, "error"); }
  };

  // --------- Nedlasting ----------
  downloadBtn.addEventListener("click", async ()=>{
    const valgt = funksjonsvalg.value;
    let endpoint="", payload={}, defaultFilename="Protokoll.xlsx";

    if (valgt==="FUNKSJONSTEST"){
      endpoint="/protokoller/download_funksjonstest_protokoll"; defaultFilename="Funksjonstest_Protokoll.xlsx";
      const rows=[];
      document.querySelectorAll('#systemTabContent .tab-pane').forEach(pane=>{
        pane.querySelectorAll('tbody tr').forEach(row=>{
          // speiler ny kolonnerekkefølge
          rows.push({
            status:              row.cells[0].querySelector('select').value,
            system_number:       row.cells[1].querySelector('input').value,
            komponent:           row.cells[2].querySelector('input').value,
            valgt_forslag:       row.cells[4].querySelector('input').value,        // <-- ny
            testutfoerelse:      row.cells[5].querySelector('textarea').value,      // autosize
            aksept:              row.cells[6].querySelector('textarea').value,      // autosize
            integrert:           row.cells[7].querySelector('select').value
          });
        });
      });
      if(!rows.length) return showMessage("Ingen data å laste ned.", "info");
      payload.rows = rows;

    } else if (valgt==="MC"){
      endpoint="/protokoller/download_protokoll"; defaultFilename="MC_Protokoll.xlsx";
      const rows=[]; 
      document.querySelectorAll('#systemTabContent .tab-pane').forEach(pane=>{
        const us = pane.id.replace('mc_tab_','');
        pane.querySelectorAll('tbody tr').forEach(row=>{
          rows.push({ full_id: row.cells[3].textContent, desc: row.cells[4].textContent, unique_system: us });
        });
      });
      if(!rows.length) return showMessage("Ingen data å laste ned.", "info");
      payload.rows = rows;

    } else if (valgt==="INNREGULERING"){
      return showMessage("Nedlasting for Innregulering er ikke implementert i denne versjonen.", "info");
    } else {
      return showMessage("Velg en protokolltype for nedlasting.", "warning");
    }

    payload.bruker = await getLoggedInUser();
    document.getElementById("status-text").textContent="Forbereder nedlasting...";

    try {
      const res = await fetch(endpoint, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition");
      const m = disp?.match(/filename="?([^"]+)"?/);
      const filename = m && m[1] ? m[1] : defaultFilename;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      document.getElementById("status-text").textContent="Protokoll lastet ned."; showMessage("Protokoll lastet ned!", "success");
    } catch (e){ showMessage(`Feil ved nedlasting: ${e.message}`, "error"); }
  });
// ─────────────────────────────────────────────────────────────────────────────
// Failsafe: Event-delegation for format-segmenter og systemknapper (1–9)
// Kjør alltid, uavhengig av andre init-feil
// ─────────────────────────────────────────────────────────────────────────────
(function failsafeBinding(){
  const fmtInput = () => document.getElementById("format-input");

  // Klikk på +/=/-/%-segment
  document.addEventListener("click", (ev) => {
    const seg = ev.target.closest(".segment");
    if (seg) {
      seg.classList.toggle("selected");
      const selected = Array.from(document.querySelectorAll("#format-segmenter .segment.selected"))
        .map(s => s.dataset.placeholder)
        .join("");
      const fi = fmtInput();
      if (fi) fi.value = selected;
    }

    // Klikk på system-hovedsiffer 1–9
    const sysBtn = ev.target.closest(".sys-btn");
    if (sysBtn) {
      document.querySelectorAll(".sys-btn").forEach(b => b.classList.remove("selected"));
      sysBtn.classList.add("selected");
      // Bruk eksisterende modal-logikk hvis den finnes
      if (typeof openModalFor === "function") {
        openModalFor(sysBtn.dataset.val);
      }
    }
  }, true);

  // Tastaturstøtte for segmentene
  document.addEventListener("keydown", (ev) => {
    const target = ev.target;
    if (target && target.classList && target.classList.contains("segment")) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        target.click();
      }
    }
  });

  // Ekstra: sørg for at message-box aldri ligger usynlig over
  const box = document.getElementById("message-box");
  if (box) {
    box.style.pointerEvents = "none"; // beskytter klikk under
  }
})();
});
