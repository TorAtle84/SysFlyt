// static/js/dokumentsammenligning.js
document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("dokumentsammenligning-status");

  // ===== Modus-veksling (syntaktisk/kombinert/diff) =====
  const modus = document.getElementById("sokemodus");
  const syntaktisk = document.getElementById("syntaktisk-oppsett");
  const kombinert = document.getElementById("kombinert-oppsett");
  const diffseksjon = document.getElementById("diff-oppsett");

  function setMode(value) {
    if (!syntaktisk || !kombinert || !diffseksjon) return;
    syntaktisk.style.display = value === "syntaktisk" ? "" : "none";
    kombinert.style.display = value === "kombinert" ? "" : "none";
    diffseksjon.style.display = value === "diff" ? "" : "none";
    if (statusDiv) statusDiv.textContent = "";
  }
  if (modus) {
    modus.addEventListener("change", e => setMode(e.target.value));
    setMode(modus.value || "syntaktisk");
  }

  // ===== Syntaktisk: vis/skjul hoveddokument + checkbox ved valg =====
  const radios = document.querySelectorAll("input[name='syntaktisk_action']");
  const onlyRow = document.getElementById("only-hoveddokument-row");
  const hovedRow = document.getElementById("hoveddokument-row");
  function toggleSyntaktiskFields() {
    const v = document.querySelector("input[name='syntaktisk_action']:checked")?.value || "search";
    if (hovedRow && onlyRow) {
      if (v === "diff") {
        hovedRow.style.display = "";
        onlyRow.style.display = "";
      } else {
        hovedRow.style.display = "none";
        onlyRow.style.display = "none";
      }
    }
  }
  radios.forEach(r => r.addEventListener("change", toggleSyntaktiskFields));
  toggleSyntaktiskFields();

  // ===== Kombinert søk =====
  const kombTabell = document.getElementById("kombinert-tabell");
  const leggTilRadBtn = document.getElementById("legg-til-rad");
  const leggTilKolBtn = document.getElementById("legg-til-kolonne");
  const kombFiler = document.getElementById("kombinert_filer");
  const kombStartBtn = document.getElementById("kombinert_sok_btn");

  function serializeTable() {
    const rows = [];
    if (!kombTabell) return rows;
    kombTabell.querySelectorAll("tbody tr").forEach(tr => {
      const cols = [];
      tr.querySelectorAll("td").forEach(td => cols.push(td.textContent || ""));
      if (cols.some(c => (c || "").trim() !== "")) rows.push(cols);
    });
    return rows;
  }

  if (kombTabell) {
    kombTabell.addEventListener("paste", ev => {
      if (!ev.clipboardData) return;
      ev.preventDefault();
      const text = ev.clipboardData.getData("text");
      const rows = text.split(/\r?\n/).filter(Boolean).map(r => r.split("\t"));
      const body = kombTabell.tBodies[0];
      body.innerHTML = "";
      rows.forEach(r => {
        const tr = document.createElement("tr");
        const maxCols = Math.max(r.length, kombTabell.tHead.rows[0].cells.length);
        for (let i=0; i<maxCols; i++) {
          const td = document.createElement("td");
          td.contentEditable = "true";
          td.textContent = r[i] || "";
          tr.appendChild(td);
        }
        body.appendChild(tr);
      });
    });

    leggTilRadBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      const tr = document.createElement("tr");
      const cols = kombTabell.tHead.rows[0].cells.length;
      for (let i=0; i<cols; i++) {
        const td = document.createElement("td");
        td.contentEditable = "true";
        tr.appendChild(td);
      }
      kombTabell.tBodies[0].appendChild(tr);
    });

    leggTilKolBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      const th = document.createElement("th");
      const cols = kombTabell.tHead.rows[0].cells.length + 1;
      th.textContent = `Kolonne ${cols}`;
      kombTabell.tHead.rows[0].appendChild(th);
      kombTabell.tBodies[0].querySelectorAll("tr").forEach(tr => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        tr.appendChild(td);
      });
    });

    kombStartBtn?.addEventListener("click", async () => {
      if (statusDiv) statusDiv.textContent = "⏳ Kjører kombinert søk...";
      try {
        const table = serializeTable();
        if (!table.length) {
          if (statusDiv) statusDiv.textContent = "Tabellen er tom.";
          return;
        }
        const fd = new FormData();
        fd.append("kombinert_data", JSON.stringify(table));
        Array.from(kombFiler?.files || []).forEach(f => fd.append("kombinert_filer", f));

        const res = await fetch("/kombinert_sok", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Feil: ${res.status} – ${await res.text()}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "KombinertSok.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (statusDiv) statusDiv.textContent = "✅ Ferdig. Fil lastet ned.";
      } catch (err) {
        if (statusDiv) statusDiv.textContent = `🚨 ${err.message}`;
      }
    });
  }

  // ===== Diff-sjekk =====
  const diffForm = document.getElementById("diff-form");
  const diffRunBtn = document.getElementById("diff-run");
  const diffSideA = document.getElementById("diff-sideA");
  const diffSideB = document.getElementById("diff-sideB");
  const diffInline = document.getElementById("diff-inline");
  const diffTableBody = document.getElementById("diff-summary-body");
  const diffDlExcel = document.getElementById("diff-download-excel");
  const diffDlJson = document.getElementById("diff-download-json");

  let lastDiffPayload = null;

  function escapeHTML(s) {
    return (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Ny: lag inline markup for ord-diff, filtrert for venstre/høyre panel
  function renderWordDiffFiltered(wordDiff, side /* 'left' | 'right' */) {
    if (!Array.isArray(wordDiff)) return "";
    return wordDiff.map(part => {
      if (part.op === "=") {
        return `<span>${escapeHTML(part.text)}</span>`;
      }
      if (side === "left" && part.op === "-") {
        return `<span class="diff-del">${escapeHTML(part.text)}</span>`;
      }
      if (side === "right" && part.op === "+") {
        return `<span class="diff-ins">${escapeHTML(part.text)}</span>`;
      }
      return ""; // skjul '+' i venstre og '-' i høyre
    }).join(" ");
  }

  // Rull synkront mellom panelene
  function syncScroll(elA, elB) {
    let lock = false;
    elA?.addEventListener("scroll", () => {
      if (lock) return;
      lock = true;
      if (elB) elB.scrollTop = elA.scrollTop;
      lock = false;
    });
    elB?.addEventListener("scroll", () => {
      if (lock) return;
      lock = true;
      if (elA) elA.scrollTop = elB.scrollTop;
      lock = false;
    });
  }
  if (diffSideA && diffSideB) syncScroll(diffSideA, diffSideB);

  async function runDiff() {
    if (statusDiv) statusDiv.textContent = "⏳ Kjører diff...";
    if (diffSideA) diffSideA.innerHTML = "";
    if (diffSideB) diffSideB.innerHTML = "";
    if (diffInline) diffInline.innerHTML = "";
    if (diffTableBody) diffTableBody.innerHTML = "";

    const fd = new FormData(diffForm);
    try {
      const res = await fetch("/diff_sjekk", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Feil: ${res.status} – ${await res.text()}`);
      const payload = await res.json();
      lastDiffPayload = payload;

      // Vi viser IKKE avsnitts-headere; kun tekst. Like blokker vises ikke.
      for (const b of payload.blocks || []) {
        if (b.type === "equal") {
          // hopp over like blokker for renere visning
          continue;
        } else if (b.type === "delete") {
          diffSideA?.insertAdjacentHTML("beforeend",
            `<div class="blk del"><pre>${escapeHTML(b.textA || "")}</pre></div>`);
          diffSideB?.insertAdjacentHTML("beforeend",
            `<div class="blk empty"><pre></pre></div>`);
        } else if (b.type === "insert") {
          diffSideA?.insertAdjacentHTML("beforeend",
            `<div class="blk empty"><pre></pre></div>`);
          diffSideB?.insertAdjacentHTML("beforeend",
            `<div class="blk ins"><pre>${escapeHTML(b.textB || "")}</pre></div>`);
        } else if (b.type === "replace") {
          const left = renderWordDiffFiltered(b.wordDiff || [], "left");
          const right = renderWordDiffFiltered(b.wordDiff || [], "right");
          diffSideA?.insertAdjacentHTML("beforeend",
            `<div class="blk rep"><pre>${left || escapeHTML(b.textA || "")}</pre></div>`);
          diffSideB?.insertAdjacentHTML("beforeend",
            `<div class="blk rep"><pre>${right || escapeHTML(b.textB || "")}</pre></div>`);
        }
      }

      if (statusDiv) statusDiv.textContent = "✅ Diff fullført.";
      if ((diffSideA?.innerHTML || "").trim() === "" && (diffSideB?.innerHTML || "").trim() === "") {
        diffSideA.innerHTML = `<div class="blk eq"><pre>Ingen forskjeller.</pre></div>`;
        diffSideB.innerHTML = `<div class="blk eq"><pre>Ingen forskjeller.</pre></div>`;
      }
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `🚨 ${err.message}`;
    }
  }

  diffRunBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    runDiff();
  });

  diffDlExcel?.addEventListener("click", async () => {
    if (!lastDiffPayload) return;
    const res = await fetch("/diff_download_excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastDiffPayload)
    });
    if (!res.ok) {
      if (statusDiv) statusDiv.textContent = `🚨 Nedlasting feilet: ${res.status}`;
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Diff.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  diffDlJson?.addEventListener("click", () => {
    if (!lastDiffPayload) return;
    const blob = new Blob([JSON.stringify(lastDiffPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Diff.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
});
