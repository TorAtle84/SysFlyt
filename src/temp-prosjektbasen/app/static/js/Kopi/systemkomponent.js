const valgtSystemPrefiks = {}; 

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

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ systemkomponent.js kjører!");

  // === FORMATBYGGER ===
  const segments = document.querySelectorAll("#format-segmenter .segment");
  const formatInput = document.getElementById("format-input");
  segments.forEach(seg => {
    seg.classList.remove("selected");
    seg.addEventListener("click", () => {
      seg.classList.toggle("selected");
      const active = [];
      segments.forEach(s => {
        if (s.classList.contains("selected")) {
          active.push(s.dataset.placeholder);
        }
      });
      formatInput.value = active.join("");
    });
  });

  // === SYSTEMKRITERIER ===
  //  FIX 1: Hent knappene og lagre dem i 'sysBtns'-variabelen
  const sysBtns = document.querySelectorAll("#system-kriterier .sys-btn");
  
  sysBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sysBtns.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      openModalFor(btn.dataset.val);
    });
  });

  window.masterRowsOpptelling = [];
  window.masterRowsSystem = []; // Raw data from backend
  window.groupedSystemData = {}; // Grouped data for tabs

  // Elements for tab functionality
  const systemTabsContainer = document.getElementById("systemTabs");
  const systemTabContentContainer = document.getElementById("systemTabContent");
  const mainResultTable = document.getElementById("resultat-tabell"); // Main table for component counting or a single system tab


  function updateTableHeader(funksjonsvalg, totalCount = null) {
    const thead = document.getElementById("table-head");
    if (funksjonsvalg === "komponentopptelling") {
      const antallHeader = totalCount !== null ? `Antall: ${totalCount}` : `Antall`;
      thead.innerHTML = `
        <tr>
          <th>Med system?</th>
          <th>Komponent</th>
          <th>Beskrivelse</th>
          <th>${antallHeader}</th>
          <th>Filer</th>
        </tr>`;
    } else if (funksjonsvalg === "systembygging") {
      // Headers will be set per tab, main table header can be default or empty
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

  updateTableHeader("velg");

  document.getElementById("funksjonsvalg").addEventListener("change", e => {
    updateTableHeader(e.target.value);
    document.querySelector("#resultat-tabell tbody").innerHTML = "";
    document.getElementById("fil-filter").innerHTML = "";
    // Hide tabs when function changes
    systemTabsContainer.style.display = 'none';
    systemTabContentContainer.innerHTML = '';
    mainResultTable.style.display = ''; // Show main table
    window.masterRowsOpptelling = [];
    window.masterRowsSystem = [];
    window.groupedSystemData = {}; // Clear grouped data
  });

  function renderOpptellingTable() {
    // Hide tabs when rendering component counting
    systemTabsContainer.style.display = 'none';
    systemTabContentContainer.innerHTML = '';
    mainResultTable.style.display = ''; // Ensure main table is visible

    const activeFiles = new Set();
    document.querySelectorAll("#fil-filter input[type=checkbox]").forEach(cb => {
      if (cb.checked) activeFiles.add(cb.nextSibling.textContent.trim());
    });

    const tbody = document.querySelector("#resultat-tabell tbody");
    tbody.innerHTML = "";

    let overallTotalCount = 0;

    window.masterRowsOpptelling.forEach(row => {
      const matchingFiles = row.files.filter(f => activeFiles.has(f));
      if (matchingFiles.length > 0) {
        let filteredCount = 0;
        for (const f of matchingFiles) {
          filteredCount += row.per_file[f] || 0;
        }

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
      }
    });

    updateTableHeader("komponentopptelling", overallTotalCount);
  }

  function renderSystemTable() {
    // This function will now orchestrate tab creation and rendering
    // Hide the default table content initially
    mainResultTable.style.display = 'none'; 
    systemTabsContainer.style.display = ''; // Show tab navigation

    const activeFiles = new Set();
    document.querySelectorAll("#fil-filter input[type=checkbox]").forEach(cb => {
      if (cb.checked) activeFiles.add(cb.nextSibling.textContent.trim());
    });

    // Group data by unique system key
    window.groupedSystemData = {};
    const missingSystemKey = 'Systemnummer mangler'; // Special key for missing systems

    window.masterRowsSystem
      .filter(row => row.files.some(f => activeFiles.has(f)))
      .sort((a, b) => {
        // Sort rows by unique_system_key, then component, with missing system at the bottom
        const aUniqueSystemMissing = !a.unique_system_key; 
        const bUniqueSystemMissing = !b.unique_system_key; 

        if (aUniqueSystemMissing && !bUniqueSystemMissing) return 1;
        if (!aUniqueSystemMissing && bUniqueSystemMissing) return -1;
        
        // If both are missing or both are present, sort by unique_system_key and then full system and component
        if (a.unique_system_key !== b.unique_system_key) return a.unique_system_key.localeCompare(b.unique_system_key);
        if (a.system !== b.system) return a.system.localeCompare(b.system); // Fallback to original system for consistent order
        return a.component.localeCompare(b.component);
      })
      .forEach(row => {
        // Use the new 'unique_system_key' from backend for grouping
        const key = row.unique_system_key || missingSystemKey; 
        if (!window.groupedSystemData[key]) {
          window.groupedSystemData[key] = [];
        }
        window.groupedSystemData[key].push(row);
      });

    // Clear existing tabs
    systemTabsContainer.innerHTML = '';
    systemTabContentContainer.innerHTML = '';

    const systemNames = Object.keys(window.groupedSystemData).sort((a, b) => {
      // Ensure "Systemnummer mangler" is always last in tab order
      if (a === missingSystemKey) return 1;
      if (b === missingSystemKey) return -1;
      return a.localeCompare(b);
    });

    let firstTabRendered = false;

    systemNames.forEach((sysName, index) => {
      const tabId = `tab-${sysName.replace(/\W/g, '_')}`; // Sanitize for ID
      const isActive = !firstTabRendered ? 'active' : ''; // Make the first one active
      const showClass = !firstTabRendered ? 'show active' : '';

      // Create tab button
      const tabButton = document.createElement('li');
      tabButton.className = 'nav-item';
      tabButton.innerHTML = `
        <button class="nav-link ${isActive}" id="${tabId}-tab" data-bs-toggle="tab" data-bs-target="#${tabId}" type="button" role="tab" aria-controls="${tabId}" aria-selected="${isActive ? 'true' : 'false'}">
          ${sysName || 'System mangler'}
        </button>
      `;
      systemTabsContainer.appendChild(tabButton);

      // Create tab pane
      const tabPane = document.createElement('div');
      tabPane.className = `tab-pane fade ${showClass}`;
      tabPane.id = tabId;
      tabPane.setAttribute('role', 'tabpanel');
      tabPane.setAttribute('aria-labelledby', `${tabId}-tab`);
      
      // Create table inside tab pane
      const table = document.createElement('table');
      table.className = 'table table-bordered';
      table.innerHTML = `
        <thead id="table-head-${tabId}">
          <tr>
            <th>Full ID</th>
            <th>Beskrivelse</th>
            <th>Filer</th>
          </tr>
        </thead>
        <tbody id="table-body-${tabId}"></tbody>
      `;
      tabPane.appendChild(table);
      systemTabContentContainer.appendChild(tabPane);

      // Populate table body for this tab
      const tbody = table.querySelector('tbody');
      window.groupedSystemData[sysName].forEach(row => {
        const matchingFiles = row.files.filter(f => activeFiles.has(f));
        const tr = document.createElement("tr");
        
        let fullIdDisplay = row.full_id;
        // Apply "Systemnummer mangler" styling only for the actual missing system rows, not the tab label itself
        // This logic is for the *content* of the Full ID cell within each tab.
        // We now check against row.system (the full system string), but use unique_system_key for grouping.
        if (sysName === missingSystemKey) {
            // If this row belongs to the missing system tab, and its original system value is truly empty,
            // then apply the styling.
            if (row.system === '') { // Use row.system to check if the original system field was empty
                 fullIdDisplay = `<span style="color: #FFCCCC; font-weight: bold;">Systemnummer mangler</span>`;
            }
        }


        tr.innerHTML = `
          <td>${fullIdDisplay}</td>
          <td>${row.desc}</td>
          <td>${matchingFiles.join(", ")}</td>
        `;
        tbody.appendChild(tr);
      });

      if (!firstTabRendered) {
        firstTabRendered = true;
      }
    });
  }

  document.getElementById("generer-tabell").addEventListener("click", async (e) => {
    e.preventDefault();

    const funksjonsvalg = document.getElementById("funksjonsvalg").value;
    const format = formatInput.value.trim();
    // FIX 2: Rettet opp i syntaksfeil og bruker riktig variabel
    const kriterier = Object.values(valgtSystemPrefiks).flat().join(',');
    
    const files = document.getElementById("filopplaster").files;
    const status = document.getElementById("status-text");

    if (!format && funksjonsvalg === "systembygging") return alert("Bygg opp et format først!");
    if (files.length === 0) return alert("Velg minst én fil!");

    updateTableHeader(funksjonsvalg); 
    status.textContent = "Starter...";

    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.append("format", format);
    fd.append("kriterier", kriterier);

    const res = await fetch(`/systemkomponent/${funksjonsvalg}`, { method: "POST", body: fd });
    if (!res.ok) { status.textContent = "Feil: " + res.status; return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let rowsJSON = null;
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      let lastNewlineIndex;
      while ((lastNewlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.substring(0, lastNewlineIndex);
        buffer = buffer.substring(lastNewlineIndex + 1);

        line = line.trim();
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.currentFile) status.textContent = "Behandler: " + parsed.currentFile;
          if (parsed.rows) rowsJSON = parsed.rows;
        } catch (e) {
          console.error("Error parsing JSON line:", line, e);
          status.textContent = "Feil: Ugyldig data mottatt. Sjekk konsollen for detaljer.";
        }
      }
    }
    if (buffer.trim()) {
        try {
            const parsed = JSON.parse(buffer.trim());
            if (parsed.currentFile) status.textContent = "Behandler: " + parsed.currentFile;
            if (parsed.rows) rowsJSON = parsed.rows;
        } catch (e) {
            console.error("Error parsing final JSON chunk:", buffer.trim(), e);
            status.textContent = "Feil: Ugyldig data mottatt i siste del.";
        }
    }

    if (!rowsJSON) { status.textContent = "Feil: Ingen data"; return; }

    status.textContent = "Ferdig!";
    const filterDiv = document.getElementById("fil-filter");
    const allFiles = new Set();
    rowsJSON.forEach(r => (r.files || []).forEach(f => allFiles.add(f)));
    filterDiv.innerHTML = `<strong>Filfilter (Aktiv/Inaktiv):</strong><br>`;
    allFiles.forEach(file => {
      const id = `file-${file.replace(/\W/g, "_")}`;
      filterDiv.innerHTML += `
        <label style="margin-right: 1rem;">
          <input type="checkbox" id="${id}" checked onchange="${funksjonsvalg === 'komponentopptelling' ? 'renderOpptellingTable()' : 'renderSystemTable()'}">
          ${file}
        </label>
      `;
    });

    if (funksjonsvalg === "komponentopptelling") {
      window.masterRowsOpptelling = rowsJSON;
      renderOpptellingTable();
    } else {
      window.masterRowsSystem = rowsJSON; // Store raw data
      renderSystemTable(); // This will handle tab creation
    }
  });

  document.getElementById("lastned-tabell").addEventListener("click", async () => {
    console.log("Last ned tabell clicked!");
    const funksjonsvalg = document.getElementById("funksjonsvalg").value;
    const rows = [];
    const activeFiles = new Set();
    document.querySelectorAll("#fil-filter input[type=checkbox]").forEach(cb => {
        if (cb.checked) activeFiles.add(cb.nextSibling.textContent.trim());
    });

    if (funksjonsvalg === "komponentopptelling") {
        window.masterRowsOpptelling.forEach(r => {
            const match = r.files.filter(f => activeFiles.has(f));
            if (match.length > 0) {
                let filteredCount = 0;
                for (const f of match) {
                    filteredCount += r.per_file[f] || 0;
                }
                rows.push({
                    has_system: r.has_system,
                    id: r.id,
                    desc: r.desc,
                    count: filteredCount,
                    files: match
                });
            }
        });
    } else { // Systembygging - Use the sorted and filtered data for download
        // If tabs are active, we need to reconstruct the rows to be sent for Excel
        // based on the original data, but filtered by active files.
        const sortedRowsForDownload = [...window.masterRowsSystem].sort((a, b) => {
            const aSystemMissing = !a.system;
            const bSystemMissing = !b.system;

            if (aSystemMissing && !bSystemMissing) return 1;
            if (!aSystemMissing && bSystemMissing) return -1;
            
            // Use unique_system_key for primary sorting in Excel as well
            if (a.unique_system_key !== b.unique_system_key) return a.unique_system_key.localeCompare(b.unique_system_key);
            // Fallback to full system then component for secondary sorting within unique_system_key group
            if (a.system !== b.system) return a.system.localeCompare(b.system);
            return a.component.localeCompare(b.component);
        });

        sortedRowsForDownload.forEach(r => {
            const match = r.files.filter(f => activeFiles.has(f));
            if (match.length > 0) rows.push({
                full_id: r.full_id,
                desc: r.desc,
                files: match,
                system: r.system,
                component: r.component,
                unique_system_key: r.unique_system_key // Ensure this is passed for Excel
            });
        });
    }

    try {
        const res = await fetch("/systemkomponent/excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows,
            project_id: window.aktivtProsjektId
          })
        });
        if (!res.ok) {
            console.error("Feil ved nedlasting av Excel:", res.status, await res.text());
            alert("Feil ved nedlasting av Excel-fil. Vennligst prøv igjen.");
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
a.href = url;
        a.download = "Resultat.xlsx";
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("En uventet feil oppstod under nedlasting:", error);
        alert("En uventert feil oppstod under nedlasting. Sjekk konsollen for detaljer.");
    }
  });

  window.tomTabell = () => {
    document.querySelector("#resultat-tabell tbody").innerHTML = "";
    document.getElementById("fil-filter").innerHTML = "";
    updateTableHeader(document.getElementById("funksjonsvalg").value); 
    systemTabsContainer.style.display = 'none'; // Hide tabs
    systemTabContentContainer.innerHTML = ''; // Clear tab content
    mainResultTable.style.display = ''; // Show main table
    window.masterRowsOpptelling = [];
    window.masterRowsSystem = [];
    window.groupedSystemData = {}; // Clear grouped data
  };

  window.renderOpptellingTable = renderOpptellingTable;
  window.renderSystemTable = renderSystemTable;

  const prosjektSelect = document.getElementById("prosjektvalg");
  const sendKnapp = document.getElementById("send-til-prosjekt");
  window.aktivtProsjektId = null;

  prosjektSelect.addEventListener("change", e => {
    const valgtId = parseInt(e.target.value);
    console.log("Prosjekt valgt:", valgtId);
    if (valgtId) {
      window.aktivtProsjektId = valgtId;
      sendKnapp.style.display = "block";
    } else {
      window.aktivtProsjektId = null;
      sendKnapp.style.display = "none";
    }
  });

  sendKnapp.addEventListener("click", async () => {
    const projectId = window.aktivtProsjektId;
    const funksjonsvalg = document.getElementById("funksjonsvalg").value;

    if (!projectId) return alert("Ingen prosjekt valgt");

    const rows = (funksjonsvalg === "komponentopptelling")
      ? window.masterRowsOpptelling
      : window.masterRowsSystem;

    const payload = {
      project_id: projectId,
      rows: rows
    };

    try {
      console.log("📦 Data som sendes til /send/komponentopptelling:", JSON.stringify(payload, null, 2));
      const res = await fetch(`/systemkomponent/send/${funksjonsvalg}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("✅ Sendt til prosjekt!");
      } else {
        const errorText = await res.text();
        console.error("Feil ved innsending:", errorText);
        alert("❌ Feil ved innsending: " + errorText);
      }
    } catch (err) {
      console.error("Uventet feil:", err);
      alert("❌ Uventet feil. Se konsollen for detaljer.");
    }
  });
});