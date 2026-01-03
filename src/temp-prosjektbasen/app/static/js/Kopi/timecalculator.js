document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ timecalculator.js loaded");

  const isAdmin = document.body.dataset.isAdmin === "true";

  // === LEGG TIL NY GRUPPE ===
  const addGroupBtn = document.getElementById("add-group-btn");
  if (addGroupBtn) {
    addGroupBtn.addEventListener("click", () => {
      const sections = document.getElementById("calculator-sections");
      const gruppeId = Date.now();
      const html = `
        <div class="app-card mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div><h5 contenteditable="true">Ny gruppe</h5></div>
            <div class="d-flex align-items-center gap-2">
              <span class="fw-bold" id="total-${gruppeId}">0.00 t</span>
              <button type="button" class="btn btn-sm btn-danger remove-group">🗑️</button>
            </div>
          </div>
          <button class="btn btn-sm btn-primary mb-2 add-subpoint-btn" data-gruppe-id="${gruppeId}">
            ➕ Legg til underpunkt
          </button>
          <div class="table-responsive">
            <table class="table table-bordered mb-0">
              <thead class="table-light">
                <tr>
                  <th>Underpunkt</th>
                  <th>Antall</th>
                  <th>Tid pr. stk (t)</th>
                  <th>Total tid (t)</th>
                  <th>Handling</th>
                </tr>
              </thead>
              <tbody id="tbody-${gruppeId}"></tbody>
            </table>
          </div>
        </div>
      `;
      sections.insertAdjacentHTML("beforeend", html);
    });
  }

  // === DELEGERT: LEGG TIL UNDERPUNKT ===
  document.addEventListener("click", e => {
    if (e.target.classList.contains("add-subpoint-btn")) {
      const gruppeId = e.target.dataset.gruppeId;
      const tbody = document.getElementById(`tbody-${gruppeId}`);
      const row = document.createElement("tr");
      row.classList.add("underpunkt-row");
      row.innerHTML = `
        <td><input type="text" class="form-control form-control-sm subpoint-name" value="Nytt underpunkt"></td>
        <td><input type="number" class="form-control form-control-sm subpoint-count" value="0"></td>
        <td><input type="number" step="0.1" class="form-control form-control-sm subpoint-time" value="0"></td>
        <td class="subpoint-total">0.00 t</td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-light move-up">⬆️</button>
          <button type="button" class="btn btn-sm btn-light move-down">⬇️</button>
          <button type="button" class="btn btn-sm btn-danger remove-subpoint">❌</button>
        </td>
      `;
      tbody.appendChild(row);
    }
  });

  // === DELEGERT: SLETT UNDERPUNKT ===
  document.addEventListener("click", e => {
    if (e.target.classList.contains("remove-subpoint")) {
      e.target.closest("tr").remove();
    }
  });

  // === DELEGERT: FLYTT OPP/NED UNDERPUNKT ===
  document.addEventListener("click", e => {
    const row = e.target.closest("tr");
    if (e.target.classList.contains("move-up")) {
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains("underpunkt-row")) {
        row.parentNode.insertBefore(row, prev);
      }
    }
    if (e.target.classList.contains("move-down")) {
      const next = row.nextElementSibling;
      if (next && next.classList.contains("underpunkt-row")) {
        row.parentNode.insertBefore(next, row);
      }
    }
  });

  // === DELEGERT: SLETT GRUPPE ===
  document.addEventListener("click", e => {
    if (e.target.classList.contains("remove-group")) {
      if (confirm("Vil du slette hele gruppen og alle underpunktene?")) {
        e.target.closest(".app-card").remove();
      }
    }
  });

  // === KALKULER FUNKSJON ===
  function calculate() {
    console.log("🔄 Kalkulerer...");

    // Per gruppe
    document.querySelectorAll("#calculator-sections .app-card").forEach(card => {
      let sum = 0;
      card.querySelectorAll(".underpunkt-row").forEach(row => {
        const count = parseFloat(row.querySelector(".subpoint-count").value) || 0;
        const time = parseFloat(row.querySelector(".subpoint-time").value) || 0;
        const total = count * time;
        row.querySelector(".subpoint-total").textContent = `${total.toFixed(2)} t`;
        sum += total;
      });
      const spanId = card.querySelector("span[id^='total-']").id;
      document.getElementById(spanId).textContent = `${sum.toFixed(2)} t`;
    });

    // Risiko
    const riskBefore = Array.from(document.querySelectorAll("span[id^='total-']"))
      .reduce((acc, el) => acc + (parseFloat(el.textContent) || 0), 0);
    const riskPercent = parseFloat(document.getElementById("riskPercent").value) || 0;
    const riskExtra = (riskBefore * riskPercent) / 100;
    const riskAfter = riskBefore + riskExtra;

    document.getElementById("risk-total-before").textContent = `${riskBefore.toFixed(2)} t`;
    document.getElementById("risk-extra").textContent = `${riskExtra.toFixed(2)} t`;
    document.getElementById("risk-total-after").textContent = `${riskAfter.toFixed(2)} t`;
    document.getElementById("risk-rounded").textContent = `${(riskAfter / 7).toFixed(1)} dager eller ${riskAfter.toFixed(2)} t`;
  }

  // === HJELPEFUNKSJON: Hent alle data fra skjemaet ===
  function hentKalkulatorData() {
    const data = {
      fag: document.getElementById("fagSelect").value,
      grupper: [],
      total_before: document.getElementById("risk-total-before").textContent.replace(" t", ""),
      risk_extra: document.getElementById("risk-extra").textContent.replace(" t", ""),
      total_after: document.getElementById("risk-total-after").textContent.replace(" t", ""),
      rounded: document.getElementById("risk-rounded").textContent.replace(" dager eller ", "").replace(" t", "")
    };

    document.querySelectorAll("#calculator-sections .app-card").forEach((card, gIndex) => {
      const name = card.querySelector("h5").textContent.trim();
      const underpunkter = [];
      card.querySelectorAll(".underpunkt-row").forEach((row, uIndex) => {
        underpunkter.push({
          name: row.querySelector(".subpoint-name").value,
          order: uIndex + 1,
          default_count: parseFloat(row.querySelector(".subpoint-count").value) || 0,
          default_time: parseFloat(row.querySelector(".subpoint-time").value) || 0
        });
      });
      data.grupper.push({
        name: name,
        order: gIndex + 1,
        underpunkter: underpunkter
      });
    });

    return data;
  }

  // === KALKULER-KNAPP ===
  document.getElementById("calc-btn").addEventListener("click", calculate);

  // === AUTOKALKULER ===
  document.addEventListener("input", e => {
    if (
      e.target.classList.contains("subpoint-count") ||
      e.target.classList.contains("subpoint-time") ||
      e.target.id === "riskPercent"
    ) {
      calculate();
    }
  });

  // === EKSPORT (placeholder) ===
  document.getElementById("export-btn").addEventListener("click", () => {
    alert("🚧 Eksport til Excel må kobles til backend!");
  });

  // === LAGRE MAL ===
  const saveBtn = document.getElementById("save-template-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const data = hentKalkulatorData();
      fetch("/timecalculator/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
      .then(res => {
        if (res.ok) alert("✅ Mal lagret!");
        else alert("❌ Feil ved lagring!");
      })
      .catch(err => {
        console.error(err);
        alert("❌ Nettverksfeil!");
      });
    });
  }

  // === SEND TIL PROSJEKT ===
  const prosjektVelger = document.getElementById("velgProsjekt");
  const sendTilProsjektBtn = document.getElementById("sendTilProsjekt");

  if (prosjektVelger && sendTilProsjektBtn) {
    prosjektVelger.addEventListener("change", () => {
      sendTilProsjektBtn.style.display = prosjektVelger.value ? "inline-block" : "none";
    });

    sendTilProsjektBtn.addEventListener("click", () => {
      const pid = prosjektVelger.value;
      if (!pid) return;

      const data = hentKalkulatorData();

      fetch("/timecalculator/send_tidsbruk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, project_id: pid })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) alert("✅ Tidskalkulator-data sendt til prosjekt.");
        else alert("❌ Feil: " + (d.error || "Ukjent feil"));
      })
      .catch(() => alert("Uventet feil ved sending."));
    });
  }
});
