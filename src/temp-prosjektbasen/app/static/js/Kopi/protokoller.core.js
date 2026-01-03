// ============================================================================
// PROTOKOLLER • CORE (Komplett og korrigert)
// Felles state, hjelpefunksjoner, farger, UI-utils + AUTOINIT FORMATBYGGER
// ============================================================================

export let ALL_DATA_FROM_BACKEND = [];
export let allRows = []; // global kopi (for kompatibilitet)

export let FUNKSJONSBANK = {}; // { TFM: [ {navn,test,aksept}, ... ] }
export let USERS = [];
export let TECHS = [];

export const ACTIVE_FILES = new Set();
export const TFM_SETTINGS = { MC: new Set(), FUNKSJONSTEST: new Set(), INNREGULERING: new Set() };

// System/tabs-filter state (for Funksjonstest)
export const ALL_GROUPED_COMPONENTS = {};         // { systemKey: [rows] }
export const ALL_IDENTIFIED_SYSTEMS = [];         // [ { number, full_name } ]
export const SELECTED_SYSTEM_NUMBERS = new Set(); // synlige i tabs

// ------------------------ UI HELPERS ------------------------
export function showMessage(msg, type = "info", timeoutMs = 4000) {
  const box = document.getElementById("message-box");
  if (!box) return;
  box.innerHTML = `
    <div class="alert alert-${type === "error" ? "danger" : type} shadow-sm mb-2" role="alert">
      ${msg}
    </div>`;
  box.style.display = "block";
  if (timeoutMs > 0) {
    setTimeout(() => {
      box.style.display = "none";
      box.innerHTML = "";
    }, timeoutMs);
  }
}

export function td(childOrText, opts = {}) {
  const td = document.createElement("td");
  if (childOrText instanceof HTMLElement) td.appendChild(childOrText);
  else td.textContent = childOrText ?? "";
  if (opts.className) td.className = opts.className;
  return td;
}
export function tdText(value, placeholder = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control form-control-sm";
  input.value = value ?? "";
  if (placeholder) input.placeholder = placeholder;
  return input;
}
export function dropdown(options, placeholder = "") {
  const sel = document.createElement("select");
  sel.className = "form-select form-select-sm";
  if (placeholder) {
    const ph = document.createElement("option");
    ph.value = "";
    ph.disabled = true;
    ph.hidden = true;
    ph.textContent = placeholder;
    sel.appendChild(ph);
  }
  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  });
  return sel;
}

// ------------------------ Autosize for textarea ------------------------
export function autosizeNow(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.overflow = "hidden";
  textarea.style.height = (textarea.scrollHeight + 2) + "px";
}
export function addAutoHeightListeners(elOrTextarea) {
  if (!elOrTextarea) return;
  const nodes = elOrTextarea.matches?.("textarea")
    ? [elOrTextarea]
    : elOrTextarea.querySelectorAll("textarea");
  nodes.forEach(t => {
    t.classList.add("autosize");
    const adjust = () => autosizeNow(t);
    t.addEventListener("input", adjust);
    t.addEventListener("change", adjust);
    queueMicrotask(adjust);
  });
}
export function autosizeAll(root = document) {
  root.querySelectorAll("textarea.autosize, textarea.form-control").forEach(autosizeNow);
  requestAnimationFrame(() =>
    root.querySelectorAll("textarea.autosize, textarea.form-control").forEach(autosizeNow)
  );
}

// ------------------------ Fargekart ------------------------
export const STATUS_COLORS = {
  "Ikke startet": "#e0e0e0",
  "Under arbeid": "#fff2cc",
  "Avvik": "#f4cccc",
  "Utført": "#d9ead3",
  "Fullført": "#d9ead3"
};

export const INTEGRERT_TEST_COLORS = {
  "Start og Stopp funksjoner": "#DCEBFF",
  "Reguleringsfunksjoner": "#E7F7E7",
  "Sikkerhetsfunksjoner": "#FFE5E5",
  "Øvrig": "#F1F1F1",
  "": "#F1F1F1"
};

export function applyColorCoding(selectElement, colorMap) {
  if (!selectElement) return;
  const c = colorMap[selectElement.value] || "";
  selectElement.style.backgroundColor = c || "";
}

// ------------------------ Backend utils ------------------------
export async function getUsers() {
  try {
    const r = await fetch("/protokoller/api/users");
    USERS = r.ok ? await r.json() : [];
  } catch (error) {
    USERS = [];
    showMessage("Kunne ikke hente brukere.", "error");
    console.error(error);
  }
}
export async function getTechnicians() {
  try {
    const r = await fetch("/protokoller/api/technicians");
    TECHS = r.ok ? await r.json() : [];
  } catch (error) {
    TECHS = [];
    showMessage("Kunne ikke hente teknikere.", "error");
    console.error(error);
  }
}
export async function getLoggedInUser() {
  try {
    const r = await fetch("/protokoller/api/me");
    return r.ok ? await r.text() : "UkjentBruker";
  } catch {
    return "UkjentBruker";
  }
}

// ------------------------ File filter (valgfri) ------------------------
export function setActiveFiles(list = []) {
  ACTIVE_FILES.clear();
  list.forEach(n => ACTIVE_FILES.add(n));
}

// ======================================================================
// FORMATBYGGER (uendret)
// ======================================================================

function _collectSelectedSegments() {
  return Array
    .from(document.querySelectorAll('#format-segmenter .segment.selected'))
    .map(s => s.dataset.placeholder)
    .join('');
}

function _updateFormatInput() {
  const input = document.getElementById('format-input');
  if (input) input.value = _collectSelectedSegments();
}

function _wireOneSegment(seg) {
  if (!seg || seg.__wired) return;
  seg.__wired = true;

  seg.addEventListener('click', () => {
    seg.classList.toggle('selected');
    _updateFormatInput();
  });

  seg.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      seg.click();
    }
  });
}

function _wireAllSegments() {
  const wrap = document.getElementById('format-segmenter');
  if (!wrap) return;
  wrap.querySelectorAll('.segment').forEach(_wireOneSegment);
  _updateFormatInput();
}

export function initFormatBuilder() {
  _wireAllSegments();

  const wrap = document.getElementById('format-segmenter');
  if (wrap && !wrap.__observer) {
    const mo = new MutationObserver(() => _wireAllSegments());
    mo.observe(wrap, { childList: true, subtree: true });
    wrap.__observer = mo;
  }

  document.addEventListener('click', (ev) => {
    const seg = ev.target?.closest?.('#format-segmenter .segment');
    if (seg && !seg.__wired) {
      _wireOneSegment(seg);
      seg.click();
    }
  }, true);

  const box = document.getElementById('message-box');
  if (box) box.style.pointerEvents = 'none';
}

document.addEventListener('DOMContentLoaded', initFormatBuilder);

// ======================================================================
// Felles TFM-parsing (system/komponent/byggnr/typekode)
// ======================================================================

// +byggnr =system -komponent %typekode
export const FULL_TOKEN_RE = /^(?:\+(?<byggnr>[A-Za-z0-9]+))?\s*(?:=)?(?<system>\d+(?:\.\d+)*)-(?<komponent>(?:[A-Za-z]{2,3})\d{2,5}[^\s%]*)(?:%(?<typekode>[^\s]+))?$/i;

function _safeUpper(x) {
  return (x ?? "").toString().trim().toUpperCase();
}

export function parseFullId(str) {
  if (!str && str !== 0) return {};
  const m = String(str).trim().match(FULL_TOKEN_RE);
  if (!m || !m.groups) return {};
  const { byggnr, system, komponent, typekode } = m.groups;
  return {
    byggnr: byggnr || undefined,
    system: system || undefined,
    komponent: _safeUpper(komponent) || undefined,
    typekode: typekode || undefined
  };
}

export function extractSystem(input) {
  const s = String(input ?? "");
  let m = s.match(/=(\d[\d.\-]*)/);
  if (m) return m[1];
  m = s.match(/(\d[\d.\-]*)(?=[:\-\s]|$)/);
  return m ? m[1] : undefined;
}

export function extractComponent(sysStr, compCellVal) {
  let fromFull;
  if (sysStr) {
    const mm = String(sysStr).match(/-(?<k>[^%]+?)(?=%|$)/);
    if (mm?.groups?.k) fromFull = _safeUpper(mm.groups.k);
  }
  const fromCell = _safeUpper(compCellVal);
  if (fromFull && fromFull.length > fromCell.length) return fromFull;
  return fromCell || fromFull || undefined;
}

export function parseFromCells({ systemCell, fullIdCell, tfmTypekodeCell } = {}) {
  const full = parseFullId(fullIdCell);
  if (full.system || full.komponent || full.byggnr || full.typekode) {
    return full;
  }

  const system = extractSystem(systemCell) || extractSystem(fullIdCell);
  const komponent = extractComponent(fullIdCell, tfmTypekodeCell);
  const byggnrMatch = String(fullIdCell ?? systemCell ?? "").match(/\+([A-Za-z0-9]+)/);
  const byggnr = byggnrMatch ? byggnrMatch[1] : undefined;
  const typekodeMatch = String(fullIdCell ?? "").match(/%([A-Za-z0-9.\-]+)/);
  const typekode = typekodeMatch ? typekodeMatch[1] : undefined;

  return { byggnr, system, komponent, typekode };
}

export function buildToken({ byggnr, system, komponent, typekode } = {}) {
  if (!komponent) return undefined;
  return (byggnr ? `+${byggnr}` : "")
    + (system ? `=${system}` : "")
    + `-${komponent}`
    + (typekode ? `%${typekode}` : "");
}

export function getSystemFromAny(x) {
  const p = parseFullId(x);
  return p.system || extractSystem(x);
}

export function getComponentFromAny(x, typekodeCellIfAny) {
  const p = parseFullId(x);
  return p.komponent || extractComponent(x, typekodeCellIfAny);
}

export function normalizeRow(row = {}) {
  if (row.full_id) {
    const p = parseFullId(row.full_id);
    return {
      ...row,
      system: p.system ?? row.system,
      komponent: p.komponent ?? row.komponent,
      byggnr: p.byggnr ?? row.byggnr,
      typekode: p.typekode ?? row.typekode
    };
  }
  const p = parseFromCells({
    systemCell: row.system,
    fullIdCell: row.full,
    tfmTypekodeCell: row.komponent
  });
  return {
    ...row,
    full_id: buildToken(p),
    system: p.system ?? row.system,
    komponent: p.komponent ?? row.komponent,
    byggnr: p.byggnr ?? row.byggnr,
    typekode: p.typekode ?? row.typekode
  };
}

export function isParsableFullId(str) {
  return FULL_TOKEN_RE.test(String(str ?? "").trim());
}

// ======================================================================
// NY, VIKTIG FUNKSJON SOM MANGLER
// ======================================================================

/**
 * Henter ut TFM-prefikset (2-4 bokstaver) fra starten av en komponent-ID.
 * @param {string} komponentId - Den rene komponent-IDen (f.eks. "RI011T").
 * @returns {string|undefined} TFM-prefikset (f.eks. "RI") eller undefined.
 */
export function tfmPrefix(komponentId) {
  if (!komponentId) return undefined;
  // Matcher 2 til 4 store bokstaver i starten av strengen
  const match = String(komponentId).match(/^[A-Z]{2,4}/);
  return match ? match[0] : undefined;
}