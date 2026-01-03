const valgtSystemPrefiks = {};

document.addEventListener("DOMContentLoaded", () => {
  let lastChangedIndex = null;
  let shiftPressed = false;

  // Shift-taster for multi-select
  document.addEventListener("keydown", e => { if (e.key === "Shift") shiftPressed = true; });
  document.addEventListener("keyup",   e => { if (e.key === "Shift") shiftPressed = false; });

  // Element-referanser
  const segmenter       = Array.from(document.querySelectorAll(".segment"));
  const formatInput     = document.getElementById("egendefinert-format");
  const venstreTekst    = document.getElementById("venstre-tabell");
  const genererBtn      = document.getElementById("generer-btn");
  const tomTabellBtn    = document.getElementById("tom-tabell-btn");
  const lastnedBtn      = document.getElementById("lastned-btn");
  const feilmeldingDiv  = document.getElementById("feilmelding");
  const hoyreTabellBody = document.querySelector("#hoyre-tabell tbody");
  const ordrenummerInput= document.getElementById("ordrenummer");
  const sysButtons      = Array.from(document.querySelectorAll(".sys-btn"));
  const scanBtn         = document.getElementById("scan-btn");
  const fileInput       = document.getElementById("file-input");
  const tfmPopupBtn     = document.getElementById("tfm-popup-btn");

  const prosjektVelger       = document.getElementById("velgProsjekt");
  const sendTilProsjektBtn   = document.getElementById("sendTilProsjekt");

  const placeholders = ["{byggnr}", "{system}", "{komponent}", "{typekode}"];

  // Oppdater format‐tekst
  function oppdaterFormatString() {
    let str = "";
    placeholders.forEach(ph => {
      const span = segmenter.find(s => s.dataset.placeholder === ph);
      if (span?.classList.contains("selected")) str += ph;
    });
    formatInput.value = str;
  }

  // Hent rader fra venstre input
  function hentTagLinjer() {
    return venstreTekst.value
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length);
  }

  // Legg til én rad i tabellen
  function leggTilRad(obj) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${obj.komponent  || ""}</td>
      <td>${obj.beskrivelse || ""}</td>
      <td>
        <select class="form-control himling-select">
          <option value="Nei" ${obj.himlingsskilt==="Nei" ? "selected":""}>Nei</option>
          <option value="Ja"  ${obj.himlingsskilt==="Ja"  ? "selected":""}>Ja</option>
        </select>
      </td>
      <td>
        <select class="form-control strips-select">
          <option value="Nei" ${obj.stripsskilt==="Nei" ? "selected":""}>Nei</option>
          <option value="Ja"  ${obj.stripsskilt==="Ja"  ? "selected":""}>Ja</option>
        </select>
      </td>
    `;
    hoyreTabellBody.appendChild(tr);
  }

  // Enable shift‐range‐change on selects
  function aktiverShiftEndring() {
    const allSelects = [
      ...document.querySelectorAll(".himling-select"),
      ...document.querySelectorAll(".strips-select")
    ];
    allSelects.forEach((sel, i) => {
      sel.dataset.rowIndex = i;
      sel.removeEventListener("change", handleSelectChange);
      sel.addEventListener("change", handleSelectChange);
    });
  }

  function handleSelectChange(e) {
    const sel   = e.target;
    const idx   = +sel.dataset.rowIndex;
    const val   = sel.value;
    const type  = sel.classList.contains("himling-select") ? "h" : "s";
    if (shiftPressed && lastChangedIndex !== null) {
      const start = Math.min(lastChangedIndex, idx);
      const end   = Math.max(lastChangedIndex, idx);
      const list  = type==="h"
        ? document.querySelectorAll(".himling-select")
        : document.querySelectorAll(".strips-select");
      for (let i=start; i<=end; i++) list[i].value = val;
    }
    lastChangedIndex = idx;
  }

  // Fyll TFM-tabell
  async function fyllTfmTabell(data) {
    const tbody = document.querySelector("#tfm-tabel tbody");
    tbody.innerHTML = "";
    data.forEach((item, i) => {
      const tr = document.createElement("tr");
      tr.classList.add(item.aktiv ? "tfm-active" : "tfm-inactive");
      tr.innerHTML = `
        <td>${item.kode}</td>
        <td>${item.beskrivelse||"Ikke i bruk"}</td>
        <td>
          <select class="form-control tfm-status" data-row-index="${i}">
            <option value="aktiv"   ${item.aktiv ? "selected":""}>Aktiv</option>
            <option value="inaktiv" ${!item.aktiv? "selected":""}>Inaktiv</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // TFM-popup
  tfmPopupBtn?.addEventListener("click", async () => {
    try {
      const resp = await fetch("/api/tfm-liste", { credentials:"include" });
      if (!resp.ok) throw "";
      const data = await resp.json();
      fyllTfmTabell(data);
      $("#tfmModal").modal("show");
    } catch {
      alert("Feil ved henting av TFM-liste");
    }
  });

  // Lagre TFM
  document.getElementById("lagre-tfm-btn")?.addEventListener("click", async () => {
    const settings = Array.from(document.querySelectorAll(".tfm-status"))
      .map(sel => ({ kode: sel.dataset.kode, aktiv: sel.value==="aktiv" }));
    try {
      const resp = await fetch("/api/tfm-liste/save", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        credentials:"include",
        body: JSON.stringify({ innstillinger: settings })
      });
      if (!resp.ok) throw "";
      $("#tfmModal").modal("hide");
      alert("TFM-innstillinger lagret!");
    } catch {
      alert("Feil ved lagring av TFM-innstillinger.");
    }
  });

  // Segment‐klikking
  segmenter.forEach(span => {
    span.addEventListener("click", () => {
      span.classList.toggle("selected");
      oppdaterFormatString();
    });
  });
  
  /**
   * Åpner en modal for å velge undergrupper for et system-prefiks. 
   * @param {string} hovedsiffer - Hovedsifferet for systemkategorien (f.eks. "3").
   */
  function openModalFor(hovedsiffer) {
    const modalElement = document.getElementById("filterModal");
    const modal = new bootstrap.Modal(modalElement);
    const checkboxesDiv = document.getElementById("modalCheckboxes");
    const modalTitle = document.getElementById("modalTitle");

    modalTitle.textContent = `Velg systemer fra kategori ${hovedsiffer}x`;
    checkboxesDiv.innerHTML = "";

    for (let i = 0; i <= 9; i++) {
        const val = `${hovedsiffer}${i}`;
        const id = `chk-${val}`;
        const isChecked = valgtSystemPrefiks[hovedsiffer]?.includes(val) || false;

        const label = document.createElement("label");
        label.htmlFor = id;
        label.className = "form-check form-check-inline";
        label.innerHTML = `<input type="checkbox" class="form-check-input" id="${id}" value="${val}" ${isChecked ? 'checked' : ''}> ${val}`;
        checkboxesDiv.appendChild(label);
    }

    document.getElementById("modalConfirm").onclick = () => {
        valgtSystemPrefiks[hovedsiffer] = [...checkboxesDiv.querySelectorAll("input:checked")].map(cb => cb.value);
        bootstrap.Modal.getInstance(modalElement).hide();
    };

    modal.show();
  }

  // System‐knapper
  sysButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        // Fjern 'selected' fra alle andre knapper for å indikere at kun én er aktiv
        sysButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        // Åpne modalen for det valgte hovedsifferet
        openModalFor(btn.dataset.val);
    });
  });

  // Tøm tabell
  tomTabellBtn?.addEventListener("click", () => {
    hoyreTabellBody.innerHTML = "";
    feilmeldingDiv.textContent = "";
    lastChangedIndex = null;
  });

  // Generer fra tekst
  genererBtn?.addEventListener("click", async () => {
    feilmeldingDiv.textContent = "";
    hoyreTabellBody.innerHTML = "";
    lastChangedIndex = null;

    const tags = hentTagLinjer();
    if (!tags.length) {
      feilmeldingDiv.textContent = "Lim inn minst én rad i venstre felt.";
      return;
    }
    const fmt = formatInput.value.trim();
    if (!fmt) {
      feilmeldingDiv.textContent = "Bygg formatet øverst først.";
      return;
    }

    try {
      const resp = await fetch("/api/generer", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ tags, format: fmt })
      });
      const data = await resp.json();
      if (!resp.ok) {
        feilmeldingDiv.textContent = (data.feil||[data.error||"Feil"]).join("\n");
        return;
      }
      data.forEach(leggTilRad);
      aktiverShiftEndring();
    } catch {
      feilmeldingDiv.textContent = "Uventet feil under generering.";
    }
  });

  // Scan‐og‐generer fra filer
  scanBtn?.addEventListener("click", async () => {
    feilmeldingDiv.textContent = "";
    hoyreTabellBody.innerHTML = "";

    const fmt = formatInput.value.trim();
    if (!fmt) {
      feilmeldingDiv.textContent = "Bygg formatet øverst først.";
      return;
    }
    const files = fileInput.files;
    if (!files.length) {
      feilmeldingDiv.textContent = "Ingen filer valgt.";
      return;
    }
    const kriterier = Object.values(valgtSystemPrefiks).flat();

    const formData = new FormData();
    formData.append("format", fmt);
    Array.from(files).forEach(f=>formData.append("files", f));
    formData.append("system_kriterier", kriterier.join(","));

    try {
      const resp = await fetch("/api/scan-og-generer", { method:"POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) {
        feilmeldingDiv.textContent = (data.feil||[data.error||"Feil"]).join("\n");
        return;
      }
      data.forEach(leggTilRad);
      aktiverShiftEndring();
    } catch {
      feilmeldingDiv.textContent = "Uventet feil under scanning.";
    }
  });

  // Last ned Excel
  lastnedBtn?.addEventListener("click", async () => {
    feilmeldingDiv.textContent = "";
    const ord = ordrenummerInput.value.trim();
    if (!ord) {
      ordrenummerInput.classList.add("is-invalid");
      return;
    }
    ordrenummerInput.classList.remove("is-invalid");

    const rows = Array.from(document.querySelectorAll("#hoyre-tabell tbody tr"))
      .map(tr => {
        const tds = tr.querySelectorAll("td");
        return {
          komponent: tds[0].textContent,
          beskrivelse: tds[1].textContent,
          himlingsskilt: tds[2].querySelector("select").value,
          stripsskilt: tds[3].querySelector("select").value
        };
      });
    if (!rows.length) {
      feilmeldingDiv.textContent = "Ingen rader å laste ned.";
      return;
    }

    try {
      const resp = await fetch("/api/lastned", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ rader: rows, ordrenummer: ord })
      });
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${ord}-Merkeskilt.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      feilmeldingDiv.textContent = "Feil ved nedlasting.";
    }
  });

  // — Tillegg: Send til prosjekt-knapp —
  if (prosjektVelger && sendTilProsjektBtn) {
    prosjektVelger.addEventListener("change", () => {
      sendTilProsjektBtn.style.display = prosjektVelger.value ? "inline-block" : "none";
    });
    sendTilProsjektBtn.addEventListener("click", () => {
      const pid = prosjektVelger.value;
      if (!pid) return;

      const rows = Array.from(document.querySelectorAll("#hoyre-tabell tbody tr"))
        .map(tr => {
          const tds = tr.querySelectorAll("td");
          return {
            komponent_id: tds[0].innerText.trim(),
            beskrivelse:  tds[1].innerText.trim(),
            aktiv:        tds[2].querySelector("select").value,
            inaktiv:      tds[3].querySelector("select").value
          };
        });

      fetch("/send_merkeskilt", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ project_id: pid, rows })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) alert("✅ Merkeskilt sendt til prosjekt.");
        else          alert("❌ Feil: " + (d.error||"Ukjent feil"));
      })
      .catch(() => alert("Uventet feil ved sending."));
    });
  }
});
