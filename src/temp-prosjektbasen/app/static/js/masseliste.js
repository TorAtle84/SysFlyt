// Matcher Merkeskilt-adferd: segment-toggle (ingen duplikater, fast rekkefølge),
// systemknapper åpner modal for 2-sifrede undersystemer, og alt annet som før.
document.addEventListener("DOMContentLoaded", () => {
  // ── Visning ────────────────────────────────────────────────────────────────
  const velger        = document.getElementById("funksjon-valg");
  const masselisteApp = document.getElementById("masseliste-app");
  const versjonCard   = document.getElementById("versjon-card");
  const ifcApp        = document.getElementById("ifc-app");
  function switchView() {
    const v = velger?.value || "masseliste";
    masselisteApp?.classList.toggle("d-none", v !== "masseliste");
    versjonCard?.classList.toggle("d-none",   v !== "versjon");
    ifcApp?.classList.toggle("d-none",        v !== "ifc");
  }
  velger?.addEventListener("change", switchView);
  switchView();

  // ── Drag & drop helpers ────────────────────────────────────────────────────
  function normalizeAccept(acceptStr) {
    if (!acceptStr) return null;
    return acceptStr.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  }
  function fileMatchesAccept(file, acceptList) {
    if (!acceptList || !acceptList.length) return true;
    const name = (file?.name || "").toLowerCase();
    return acceptList.some(ext => name.endsWith(ext));
  }
  function setFileListOnInput(inputEl, files) {
    try {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      inputEl.files = dt.files;
      return true;
    } catch { return false; }
  }
  function wireDropzone(zoneEl, inputEl) {
    if (!zoneEl || !inputEl) return;
    if (inputEl.id === "masseliste-fil" && inputEl.accept && !inputEl.accept.includes(".xlsm")) {
      inputEl.accept = inputEl.accept + ",.xlsm";
    }
    const acceptList = normalizeAccept(inputEl.getAttribute("accept"));
    const hint = zoneEl.querySelector(".dz-hint");
    zoneEl._chosenFiles = [];
    function showFilename(files) {
      if (!hint) return;
      if (!files || !files.length) { hint.textContent = "Dra & slipp her, eller klikk for å velge"; return; }
      hint.textContent = files.length === 1 ? files[0].name : `${files.length} filer valgt`;
    }
    ["dragenter","dragover"].forEach(evt => zoneEl.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); zoneEl.classList.add("dragover");
    }, false));
    ["dragleave","drop"].forEach(evt => zoneEl.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); zoneEl.classList.remove("dragover");
    }, false));
    zoneEl.addEventListener("drop", e => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const okFiles = files.filter(f => fileMatchesAccept(f, acceptList));
      if (!okFiles.length) { showFilename([]); return; }
      if (!setFileListOnInput(inputEl, okFiles)) zoneEl._chosenFiles = okFiles;
      showFilename(okFiles);
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }, false);
    zoneEl.addEventListener("click", () => inputEl.click());
    inputEl.addEventListener("change", () => {
      const files = Array.from(inputEl.files || []);
      if (files.length) zoneEl._chosenFiles = files;
      showFilename(files);
    });
  }
  function getChosenFiles(zoneEl, inputEl) {
    const fromInput = Array.from(inputEl?.files || []);
    if (fromInput.length) return fromInput;
    return zoneEl?._chosenFiles || [];
  }

  // ── Masseliste (Excel) ─────────────────────────────────────────────────────
  const scanBtn     = document.getElementById("scan-masseliste");
  const fileInput   = document.getElementById("masseliste-fil");
  const dropExcel   = document.getElementById("masseliste-drop");
  const resultatDiv = document.getElementById("resultat-tabell");
  const dlBtn       = document.getElementById("lastned-excel");
  wireDropzone(dropExcel, fileInput);

  let masselisteRows = [];
  let masselisteCols = [];
  function renderSimpleTable(rows) {
    if (!rows || !rows.length) {
      resultatDiv.innerHTML = "<div class='text-muted'>Ingen rader</div>";
      if (dlBtn) dlBtn.disabled = true;
      return;
    }
    const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
    const head = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
    resultatDiv.innerHTML = `<table class="table table-bordered table-sm">${head}${body}</table>`;
    if (dlBtn) dlBtn.disabled = false;
  }
  scanBtn?.addEventListener("click", async () => {
    const files = getChosenFiles(dropExcel, fileInput);
    if (!files.length) { alert("Velg en Excel-fil først."); return; }
    const fd = new FormData();
    fd.append("file", files[0]);
    try {
      const res = await fetch("/api/parse-masseliste", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || "Feil ved parsing."); renderSimpleTable([]); return; }
      masselisteRows = data.rows || [];
      masselisteCols = data.columns || [];
      renderSimpleTable(masselisteRows);
    } catch { alert("Nettverksfeil."); renderSimpleTable([]); }
  });
  dlBtn?.addEventListener("click", async () => {
    if (!masselisteRows.length) return;
    try {
      const res = await fetch("/api/masseliste/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: masselisteRows, columns: masselisteCols })
      });
      if (!res.ok) {
        const data = await res.json().catch(()=>null);
        alert((data && (data.error||data.feil)) ? (data.error||data.feil) : "Feil ved eksport.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Masseliste.xlsx";
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
    } catch { alert("Nettverksfeil ved eksport."); }
  });

	// ── IFC ────────────────────────────────────────────────────────────────────
	const segWrap       = document.getElementById("segmenter");
	const formatInput   = document.getElementById("format-input");
	const formatHint    = document.getElementById("format-hint");
	const ifcDrop       = document.getElementById("ifc-drop");
	const ifcFile       = document.getElementById("ifc-file");
	const scanIFC       = document.getElementById("scan-ifc");
	const exportIFC     = document.getElementById("export-ifc");
	const ifcFeil       = document.getElementById("ifc-feil");
	const ifcTabell     = document.getElementById("ifc-tabell");
	const ifcHead       = ifcTabell?.querySelector("thead");
	const ifcBody       = ifcTabell?.querySelector("tbody");
	const sysBtnWrap    = document.getElementById("system-kriterier");
	const psetVelger    = document.getElementById("pset-velger");
	const psetSelectAll = document.getElementById("pset-select-all");
	const ifcStats      = document.getElementById("ifc-stats");
	wireDropzone(ifcDrop, ifcFile);

	// (A) Segmenter – MERKESKILT-LOGIKK (toggle + fast rekkefølge)
	const placeholders = ["{byggnr}", "{system}", "{komponent}", "{typekode}"];
	const segmenter = Array.from(segWrap?.querySelectorAll(".segment") || []);
	function setFormatHint() {
	  const hasFmt = (formatInput?.value ?? "").trim().length > 0;
	  if (formatHint) formatHint.textContent = hasFmt
		? "Format valgt."
		: "Ingen format valgt. Skanner uten format.";
	  if (ifcFeil) { ifcFeil.textContent = ""; ifcFeil.classList.remove("text-danger"); ifcFeil.classList.add("text-muted"); }
	}
	function oppdaterFormatString() {
	  let str = "";
	  placeholders.forEach(ph => {
		const span = segmenter.find(s => s.dataset.placeholder === ph);
		if (span?.classList.contains("selected")) str += ph;
	  });
	  if (formatInput) formatInput.value = str;
	  setFormatHint();
	}
	segmenter.forEach(span => {
	  span.addEventListener("click", () => {
		span.classList.toggle("selected");
		oppdaterFormatString();
	  });
	});
	setFormatHint();

	// (B) Systemkriterier – MERKESKILT-LOGIKK (modal for 2-sifrede)
	const valgtSystemPrefiks = {};  // f.eks. { "3": ["30","31"], ... }
	const sysButtons = Array.from(sysBtnWrap?.querySelectorAll(".sys-btn") || []);
	function openModalFor(hovedsiffer) {
	  const modalElement  = document.getElementById("filterModal");
	  const modalTitle    = document.getElementById("modalTitle");
	  const checkboxesDiv = document.getElementById("modalCheckboxes");
	  if (!modalElement || !modalTitle || !checkboxesDiv) return;

	  const modal = new bootstrap.Modal(modalElement);
	  modalTitle.textContent = `Velg systemer fra kategori ${hovedsiffer}x`;
	  checkboxesDiv.innerHTML = "";
	  for (let i = 0; i <= 9; i++) {
		const val = `${hovedsiffer}${i}`;
		const id  = `chk-${val}`;
		const isChecked = valgtSystemPrefiks[hovedsiffer]?.includes(val) || false;
		const label = document.createElement("label");
		label.htmlFor = id;
		label.className = "form-check form-check-inline";
		label.innerHTML = `
		  <input type="checkbox" class="form-check-input" id="${id}" value="${val}" ${isChecked ? "checked": ""}>
		  <span class="ms-1">${val}</span>
		`;
		checkboxesDiv.appendChild(label);
	  }
	  const confirmBtn = document.getElementById("modalConfirm");
	  if (confirmBtn) {
		confirmBtn.onclick = () => {
		  valgtSystemPrefiks[hovedsiffer] = [...checkboxesDiv.querySelectorAll("input:checked")]
			.map(cb => cb.value);
		  bootstrap.Modal.getInstance(modalElement)?.hide();
		};
	  }
	  modal.show();
	}
	sysButtons.forEach(btn => {
	  btn.addEventListener("click", () => {
		sysButtons.forEach(b => b.classList.remove("selected"));
		btn.classList.add("selected");
		openModalFor(btn.dataset.val);
	  });
	});

	// (C) Pset-velger
	psetSelectAll?.addEventListener("change", () => {
	  document.querySelectorAll(".pset-check").forEach(cb => { cb.checked = psetSelectAll.checked; });
	});

	// (D) Tabell/Stats-rendering
	let ifcRows = [];
	function renderIFCTable(rows) {
	  ifcRows = rows || [];
	  if (!ifcRows.length) {
		if (ifcHead) ifcHead.innerHTML = "";
		if (ifcBody) ifcBody.innerHTML = "";
		if (exportIFC) exportIFC.disabled = true;
		if (ifcStats) ifcStats.innerHTML = "";
		if (psetVelger) psetVelger.innerHTML = "";
		return;
	  }
	  const cols = Array.from(ifcRows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
	  const core = ["Komponent-ID","IFC Class","Name","Tag","ObjectType","GlobalId","Type.Name","Type.PredefinedType"];
	  const head = core.filter(c => cols.includes(c)).concat(cols.filter(c => !core.includes(c)));
	  if (ifcHead) ifcHead.innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>`;
	  if (ifcBody) ifcBody.innerHTML = ifcRows.map(r => `<tr>${head.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("");
	  if (exportIFC) exportIFC.disabled = false;

	  const antallTreff = ifcRows.length;
	  const unikeKlasser = new Set(ifcRows.map(r => r["IFC Class"]).filter(Boolean));
	  const psetCounts = {};
	  cols.filter(c => String(c).startsWith("Pset:")).forEach(ps => psetCounts[ps] = 0);
	  ifcRows.forEach(r => {
		Object.entries(r).forEach(([k,v]) => {
		  if (String(k).startsWith("Pset:") && v !== "" && v != null) psetCounts[k] = (psetCounts[k] || 0) + 1;
		});
	  });
	  const topp = Object.entries(psetCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
	  const toppHtml = topp.length
		? `<ul class="mb-0">${topp.map(([k,v])=>`<li>${k} <span class="text-muted">(${v})</span></li>`).join("")}</ul>`
		: "<em>Ingen Pset-kolonner funnet</em>";
	  if (ifcStats) {
		ifcStats.innerHTML = `
		  <div><strong>Treff:</strong> ${antallTreff}</div>
		  <div><strong>Unike IFC-klasser:</strong> ${unikeKlasser.size}</div>
		  <div class="mt-1"><strong>Topp Pset’er:</strong> ${toppHtml}</div>
		`;
	  }
	}
	function renderPsetVelger(psets) {
	  if (!psetVelger) return;
	  const p = psets || [];
	  if (!p.length) { psetVelger.innerHTML = '<div class="text-muted">Ingen Pset-kolonner oppdaget.</div>'; return; }
	  psetVelger.innerHTML = p.map(ps => `
		<label><input type="checkbox" class="pset-check" value="${ps}" checked> <span>${ps}</span></label>
	  `).join("");
	  if (psetSelectAll) psetSelectAll.checked = true;
	}

	// (E) Skann / Eksport – *Format er VALGFRITT*
	scanIFC?.addEventListener("click", async () => {
	  if (ifcFeil) { ifcFeil.textContent = ""; ifcFeil.classList.remove("text-danger"); ifcFeil.classList.add("text-muted"); }

	  const files = (function(zone, input){ const a = Array.from(input?.files||[]); return a.length?a:(zone?._chosenFiles||[]); })(ifcDrop, ifcFile);
	  if (!files.length) { if (ifcFeil) { ifcFeil.classList.add("text-danger"); ifcFeil.textContent = "Velg en IFC-fil først."; } return; }

	  const fmt = (formatInput?.value ?? "").trim();
	  const kriterier = Object.values(valgtSystemPrefiks || {}).flat();

	  const fd = new FormData();
	  fd.append("ifc_file", files[0]);
	  fd.append("use_format", fmt ? "true" : "false");
	  if (fmt) fd.append("format", fmt);
	  if (kriterier.length) fd.append("system_kriterier", kriterier.join(","));

	  try {
		const resp = await fetch("/api/ifc/scan", { method: "POST", body: fd });
		const isJson = (resp.headers.get("content-type") || "").includes("application/json");
		const payload = isJson ? await resp.json() : { error: await resp.text() };

		if (!resp.ok) {
		  const msg = payload?.feil || payload?.error || `HTTP ${resp.status}`;
		  if (ifcFeil) { ifcFeil.classList.add("text-danger"); ifcFeil.textContent = String(msg); }
		  renderIFCTable([]); renderPsetVelger([]);
		  return;
		}
		renderIFCTable(payload.rows || []);
		renderPsetVelger(payload.pset_columns || []);
		setFormatHint();
		if (!fmt && ifcFeil) { ifcFeil.textContent = "Skannet uten format."; }
	  } catch {
		if (ifcFeil) { ifcFeil.classList.add("text-danger"); ifcFeil.textContent = "Nettverksfeil under skanning."; }
		renderIFCTable([]); renderPsetVelger([]);
	  }
	});

	exportIFC?.addEventListener("click", async () => {
	  const selected = Array.from(document.querySelectorAll(".pset-check")).filter(cb => cb.checked).map(cb => cb.value);
	  try {
		const res = await fetch("/api/ifc/export", {
		  method: "POST", headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ rows: ifcRows, pset_columns: selected })
		});
		if (!res.ok) {
		  const data = await res.json().catch(()=>null);
		  if (ifcFeil) { ifcFeil.classList.add("text-danger"); ifcFeil.textContent = (data && (data.error||data.feil)) ? (data.error||data.feil) : "Feil ved eksport."; }
		  return;
		}
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url; a.download = "IFC-masseliste.xlsx";
		document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
	  } catch {
		if (ifcFeil) { ifcFeil.classList.add("text-danger"); ifcFeil.textContent = "Nettverksfeil ved eksport."; }
	  }
	});

});
