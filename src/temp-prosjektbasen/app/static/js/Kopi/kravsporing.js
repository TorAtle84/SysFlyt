window.renderPostRunActions = window.renderPostRunActions || function () {};

document.addEventListener("DOMContentLoaded", () => {
  // === Konstanter / Endepunkter ===
  const BASE = window.KS_BASE || "/kravsporing";

  // === UI refs ===
  const startBtn          = document.getElementById("startKravsporingBtn");
  const filesInput        = document.getElementById("files");
  const minScoreInput     = document.getElementById("min_score");
  const nsStandardSelect  = document.getElementById("ns_standard_selection");
  const keywordsInput     = document.getElementById("keywords");
  const modeRadios        = document.querySelectorAll('input[name="mode"]');

  // === Revidering-UI ===
  const reviewPromptModal  = document.getElementById('review-prompt-modal');
  const reviewPromptYesBtn = document.getElementById('review-prompt-yes');
  const reviewPromptNoBtn  = document.getElementById('review-prompt-no');
  const reviewContainer    = document.getElementById('review-container');
  const reviewTableWrapper = document.getElementById('review-table-wrapper');
  const saveChangesBtn     = document.getElementById('save-changes-btn');
  const retrainAiBtn       = document.getElementById('retrain-ai-btn');
  const finishReviewBtn    = document.getElementById('finish-review-btn');
  const addNewReqBtn       = document.getElementById('add-new-req-btn');

  const statusContainer    = document.getElementById('status-container');
  const progressBar        = document.getElementById('progress-bar');
  const statusText         = document.getElementById('status-text');
  const downloadLink       = document.getElementById('download-link');
  const errorMessagesDiv   = document.getElementById('error-messages');

  const aiControlsWrapper  = document.getElementById("ai-controls-wrapper");
  const aiGroupsSelect     = document.getElementById("ai_groups");
  const fokusInput         = document.getElementById("fokusomraade");

  const aiStatusPill       = document.getElementById("ai-status-pill"); // valgfritt i HTML
  let   aiStatusCache      = null;

  const magnifier          = document.getElementById("magnifier");
  const textElement        = document.getElementById("kravsporing-text");

  // === Globale variabler ===
  let animation = null;
  let msgTimer = null; // REVIDERT: Lagt til for å kunne stoppe tekst-animasjonen
  let currentResults = { temp_folder_id: null, requirements: [] };
  window.currentResults = currentResults; // eksponer objektet globalt
  let pollTimer = null;
  let pollInFlight = false;

  // ---------- Nettverkshelpers (robust JSON-håndtering) ----------
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 25000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return res;
    } catch (e) {
      if (e && (e.name === 'AbortError' || String(e.message).toLowerCase().includes('aborted'))) {
        throw e;
      }
      throw e;
    } finally {
      clearTimeout(id);
    }
  }

  async function fetchJSON(url, opts = {}, timeoutMs = 25000) {
    try {
      const res = await fetchWithTimeout(url, opts, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      if (e && (e.name === 'AbortError' || String(e.message).toLowerCase().includes('aborted'))) {
        throw e;
      }
      throw e;
    }
  }

  // ---------- Små helpers ----------
  function startMagnifierAnimation() {
    if (!magnifier) return;
    magnifier.style.display = 'inline';
    let angle = 0;
    
    // Sørg for at tidligere timere er stoppet
    clearInterval(animation);
    clearInterval(msgTimer);

    animation = setInterval(() => {
      angle = (angle + 5) % 360;
      magnifier.style.transform = `rotate(${angle}deg)`;
    }, 50);

    const messages = [
      "Skanner dokumenter...", "Analyserer innhold...", "Identifiserer krav...",
      "Klassifiserer fag...", "Genererer rapporter..."
    ];
    let i = 0;
    
    // REVIDERT: Bruker global msgTimer
    msgTimer = setInterval(() => {
      if (!textElement || !animation) {
        clearInterval(msgTimer);
        return;
      }
      textElement.textContent = messages[i % messages.length];
      i++;
    }, 1200);
  }

  function stopMagnifierAnimation() {
    if (animation) {
        clearInterval(animation);
        animation = null;
    }
    // REVIDERT: Stopper også tekst-timeren
    if (msgTimer) {
        clearInterval(msgTimer);
        msgTimer = null;
    }
    if (magnifier) {
        magnifier.style.display = 'none';
    }
    if (textElement) {
        textElement.textContent = " Kravsporing";
    }
  }

  function updateAiControlsVisibility() {
    const selectedMode = [...modeRadios].find(r => r.checked)?.value;
    if (aiControlsWrapper) {
      aiControlsWrapper.style.display = (selectedMode === "ai" || selectedMode === "keywords_ai") ? "block" : "none";
    }
  }
  modeRadios.forEach(r => r.addEventListener("change", () => {
    updateAiControlsVisibility();
    refreshAiStatus().catch(()=>{});
  }));
  updateAiControlsVisibility();

  if (aiGroupsSelect) {
    aiGroupsSelect.addEventListener("change", () => {
      const values = Array.from(aiGroupsSelect.selectedOptions).map(o => o.value);
      if (values.includes("__ALL__") && values.length > 1) {
        Array.from(aiGroupsSelect.options).forEach(opt => {
          opt.selected = (opt.value === "__ALL__");
        });
      }
    });
  }

  function safePercent(cur, total, fallback = 0) {
    const c = Number(cur), t = Number(total);
    if (!isFinite(c) || !isFinite(t) || t <= 0) return fallback;
    return Math.max(0, Math.min(100, (c / t) * 100));
  }

  function extractTempIdFromUrl(url) {
    // REVIDERT: Korrigert regex, fjernet utilsiktet mellomrom og brukt `+`
    const m = /\/kravsporing\/(?:download|download_results)\/([^/]+)/.exec(url || "");
    return m ? m[1] : null;
  }

  // ---------- AI status ----------
  async function refreshAiStatus() {
    try {
      const s = await fetchJSON(`${BASE}/ai_status`, {}, 15000);
      aiStatusCache = s || {};
      const nb = s?.nb_bert?.ready;
      const mn = s?.mnli?.ready;
      const ready = !!(nb || mn);
      if (aiStatusPill) {
        aiStatusPill.classList.remove("bg-success","bg-warning","bg-danger");
        aiStatusPill.textContent = ready ? "Modeller klare" : "AI utilgjengelig";
        aiStatusPill.classList.add(ready ? "bg-success" : "bg-danger");
        aiStatusPill.title = `NB-BERT: ${nb ? "OK" : "–"} • MNLI: ${mn ? "OK" : "–"}`;
      }
      return ready;
    } catch (e) {
      if (aiStatusPill) {
        aiStatusPill.classList.remove("bg-success","bg-warning");
        aiStatusPill.classList.add("bg-danger");
        aiStatusPill.textContent = "AI-status ukjent";
        aiStatusPill.title = String(e);
      }
      return false;
    }
  }
  refreshAiStatus().catch(()=>{});

  // ---------- Normalisering av kravobjekt ----------
  function normalizeRequirement(r) {
    const grp = r.gruppe || (Array.isArray(r.fag) ? r.fag[0] : null) || "Uspesifisert";
    const label = Array.isArray(r.fag) ? r.fag[0] : String(grp || "Uspesifisert");
    const rank = Array.isArray(r.gruppe_rank) ? r.gruppe_rank : [];
    const ns   = Array.isArray(r.ns_treff) ? r.ns_treff : [];
    const aiThr = (typeof r.ai_threshold === "number") ? r.ai_threshold : 0.45;
    const aiLoaded = typeof r.ai_loaded === "boolean" ? r.ai_loaded : (r.gruppe_kilde === "ai");
    return {
      ...r,
      fag: [label],
      gruppe: label,
      gruppe_kilde: r.gruppe_kilde || "regex",
      gruppe_score: typeof r.gruppe_score === "number" ? r.gruppe_score : 0,
      gruppe_rank: rank,
      ai_threshold: aiThr,
      ai_loaded: aiLoaded,
      korttekst: (r.korttekst || r.short_text || "").trim(),
      text: (r.text || r.full_text || "").trim(),
      kravtype: r.kravtype || "krav",
      status: r.status || "Aktiv",
      ref: r.ref || "",
      ns_treff: ns
    };
  }

  function ensureAiFallbackAlert(requires) {
    const containerId = "ai-fallback-alert";
    let el = document.getElementById(containerId);
    const anyRegex = requires.some(x => (x.gruppe_kilde || "regex").toLowerCase() === "regex");
    const anyNotLoaded = requires.some(x => x.ai_loaded === false);
    if (anyRegex || anyNotLoaded) {
      if (!el) {
        el = document.createElement("div");
        el.id = containerId;
        el.className = "alert alert-warning mt-3";
        const anchor = document.getElementById("review-section-anchor") || reviewContainer;
        anchor?.parentNode?.insertBefore(el, anchor);
      }
      el.textContent = "AI var usikker eller ikke lastet for noen funn. Fag er satt via enklere regler der det var nødvendig.";
      el.style.display = "block";
    } else if (el) {
      el.style.display = "none";
    }
  }

  // --- Start prosess ---
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      const keywordsVal  = (keywordsInput?.value || "").trim();
      const files        = filesInput?.files || [];
      const min_score    = (minScoreInput?.value || "").trim();
      const selectedMode = [...modeRadios].find((r) => r.checked)?.value || "keywords_ai";

      if ((selectedMode === "keywords" || selectedMode === "keywords_ai") && !keywordsVal) {
        alert("❗ Oppgi søkeord for valgt modus.");
        return;
      }
      if (!files.length) {
        alert("❗ Velg minst én fil.");
        return;
      }
      if (!min_score || isNaN(Number(min_score))) {
        alert("❗ Angi gyldig treffprosent (0–100).");
        return;
      }

      startBtn.disabled = true;
      startBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Pågår...';
      statusContainer.style.display = 'block';
      progressBar.style.width = '0%';
      progressBar.classList.add('progress-bar-animated');
      progressBar.classList.remove('bg-success', 'bg-danger');
      statusText.textContent = 'Forbereder opplasting...';
      if (downloadLink) downloadLink.style.display = 'none';
      errorMessagesDiv.style.display = 'none';
      reviewPromptModal.style.display = 'none';
      reviewContainer.style.display = 'none';

      startMagnifierAnimation();

      const formEl   = document.getElementById('kravsporingForm');
      const formData = new FormData(formEl);

      try {
        const startResp = await fetchWithTimeout(`${BASE}/scan`, { method: 'POST', body: formData }, 60000);
        const ct = (startResp.headers.get('content-type') || '').toLowerCase();
        if (!startResp.ok) {
          const errBody = ct.includes('application/json') ? (await startResp.json().catch(()=>({}))) : (await startResp.text().catch(()=>''));
          const msg = (errBody && errBody.error) ? errBody.error : `Serverfeil: ${startResp.status} ${startResp.statusText}`;
          throw new Error(msg);
        }
        const startJson = ct.includes('application/json') ? await startResp.json() : null;
        const taskId = startJson?.job_id;
        if (!taskId) throw new Error("Mottok ikke job_id fra serveren.");
        pollForTaskStatus(taskId, "analyze");
      } catch (err) {
        console.error("Oppstart-feil:", err);
        alert(`❗ ${err.message || err}`);
        statusContainer.style.display = 'none';
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
        stopMagnifierAnimation();
      }
    });
  }

  // --- Generell og gjenbrukbar polling-funksjon ---
  function pollForTaskStatus(taskId, taskType) {
    clearTimeout(pollTimer);

    const MAX_RUNTIME_MS       = 180 * 60 * 1000; // 3 timer
    const MAX_INACTIVITY_MS    = 30 * 60 * 1000;  // 15 min uten fremdrift
    let   pollIntervalMs       = 3000;
    const MAX_POLL_INTERVAL_MS = 15000;
    const START_TIME           = Date.now();
    let lastProgressSignature  = null;
    let lastProgressTs         = Date.now();

    async function pollOnce() {
      if (Date.now() - START_TIME > MAX_RUNTIME_MS) {
        handleFatalError(new Error("Tidsavbrudd. Jobben overskred maksimal tillatt varighet."));
        return;
      }
      if (pollInFlight) return;
      pollInFlight = true;

      let statusData;
      try {
        statusData = await fetchJSON(`${BASE}/status/${taskId}`, {}, 25000);
      } catch (e) {
        if (e && (e.name === 'AbortError' || String(e.message).toLowerCase().includes('aborted'))) {
          // Ikke en feil, bare en timeout før neste poll. Fortsett stille.
        } else {
          console.warn("Status-kall feilet midlertidig:", e);
        }
        scheduleNext();
        return;
      } finally {
        pollInFlight = false;
      }

      if (Array.isArray(statusData.errors) && statusData.errors.length > 0) {
        errorMessagesDiv.innerHTML = '<h6>Feil/Advarsler:</h6>' + statusData.errors.map(err => `<p>${err}</p>`).join('');
        errorMessagesDiv.style.display = 'block';
      }

      statusText.textContent = statusData.status || 'Venter på status...';

      if (statusData.state === 'PROGRESS' || statusData.ready === false) {
        const pct = (typeof statusData.progress === 'number')
          ? statusData.progress
          : safePercent(statusData.current, statusData.total, 0);
        progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;

        const sig = `${statusData.current||''}/${statusData.total||''}`;
        if (sig !== lastProgressSignature) {
          lastProgressSignature = sig;
          lastProgressTs = Date.now();
          pollIntervalMs = Math.max(3000, Math.floor(pollIntervalMs * 0.8)); // Raskere ved fremdrift
        } else if (Date.now() - lastProgressTs > MAX_INACTIVITY_MS) {
          handleFatalError(new Error("Tidsavbrudd. Ingen fremdrift registrert på en stund."));
          return;
        }
      }

      if (statusData.state === 'SUCCESS' || (statusData.ready === true && statusData.successful === true)) {
        clearTimeout(pollTimer);
        stopMagnifierAnimation();
        progressBar.style.width = '100%';
        progressBar.classList.remove('progress-bar-animated');
        progressBar.classList.add('bg-success');
        
        const merged = {
          download_url: statusData.download_url || null,
          result: statusData.result || null,
          temp_folder_id: statusData.temp_folder_id || null
        };

        switch (taskType) {
          case 'analyze': {
            statusText.textContent = "Analyse fullført! Velg neste steg nedenfor.";
            const tempId = (merged.result && (merged.result.temp_folder_id || merged.result.zip_folder))
                         || merged.temp_folder_id
                         || extractTempIdFromUrl(merged.download_url);
            
            const previewReqs = (merged.result?.preview?.requirements) || [];
            const normalized = previewReqs.map(normalizeRequirement);
            currentResults = { temp_folder_id: tempId, requirements: normalized };
            window.currentResults = currentResults;

            const forcedDl = tempId ? `${BASE}/download/${encodeURIComponent(tempId)}` : null;
            if (forcedDl && downloadLink) {
              downloadLink.href = forcedDl;
              downloadLink.style.display = 'block';
            }

            const learnInput = document.getElementById('learn-temp-id');
            if (learnInput && tempId) learnInput.value = tempId;

            reviewPromptModal.style.display = 'block';
            ensureAiFallbackAlert(normalized);

            try {
              renderPostRunActions({
                status: statusData.status || 'Fullført',
                download_url: forcedDl,
                result: { preview: { requirements: normalized }, temp_folder_id: tempId, zip_folder: tempId }
              });
            } catch (e) { console.warn('renderPostRunActions feilet:', e); }

            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
            break;
          }
          case 'zip': {
            statusText.textContent = "ZIP-fil er klar for nedlasting!";
            if (merged.download_url && downloadLink) {
              downloadLink.href = merged.download_url;
              downloadLink.style.display = 'block';
            }
            finishReviewBtn.innerHTML = "Fullfør og generer ZIP";
            finishReviewBtn.disabled = false;
            saveChangesBtn.disabled = false;
            retrainAiBtn.disabled = false;
            break;
          }
          case 'retrain': {
            statusText.textContent = "AI-trening fullført! Modellene er oppdatert.";
            retrainAiBtn.innerHTML = "✓ TRENT!";
            setTimeout(() => {
              retrainAiBtn.innerHTML = "Lær AI";
              retrainAiBtn.disabled = false;
              refreshAiStatus().catch(()=>{});
            }, 3000);
            break;
          }
        }
        return;
      }

      if (statusData.state === 'FAILURE' || (statusData.ready === true && statusData.successful === false)) {
        clearTimeout(pollTimer);
        stopMagnifierAnimation();
        progressBar.style.width = '100%';
        progressBar.classList.remove('progress-bar-animated');
        progressBar.classList.add('bg-danger');
        statusText.textContent = `Feil ved prosessering: ${statusData.detail || statusData.status || 'Ukjent feil'}`;

        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
        finishReviewBtn.innerHTML = "Fullfør og generer ZIP";
        finishReviewBtn.disabled = false;
        saveChangesBtn.disabled = false;
        retrainAiBtn.innerHTML = "Lær AI";
        retrainAiBtn.disabled = false;
        return;
      }

      scheduleNext(true);
    }

    function scheduleNext(backoff = false) {
      if (backoff) {
        // REVIDERT: Rettet skrivefeil fra MAX_POLL_INTERVAL til MAX_POLL_INTERVAL_MS
        pollIntervalMs = Math.min(MAX_POLL_INTERVAL_MS, Math.floor(pollIntervalMs * 1.2));
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      pollTimer = setTimeout(pollOnce, pollIntervalMs);
    }

    function handleFatalError(err) {
      clearTimeout(pollTimer);
      stopMagnifierAnimation();
      progressBar.classList.remove('progress-bar-animated');
      progressBar.classList.add('bg-danger');
      statusText.textContent = err.message || String(err);
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
    }

    lastProgressTs = Date.now();
    pollOnce();
  }
  window.pollForTaskStatus = pollForTaskStatus;

  // ===================================================================
  // KODEBLOKK FOR REVIDERING
  // ===================================================================

  const FAG_OPTIONS      = ["Ventilasjon", "Elektro", "Rørlegger", "Byggautomasjon", "Prosjektering", "Økonomi", "Byggherre", "Totalentreprenør", "Kulde", "Uspesifisert"];
  const KRAVTYPE_OPTIONS = ["Installasjon", "Krav", "Dokumentasjon", "Funksjon", "Ytelse", "Uspesifisert"];
  const STATUS_OPTIONS   = ["Aktiv", "Inaktiv"];

  if (reviewPromptYesBtn) {
    reviewPromptYesBtn.addEventListener('click', async () => {
      reviewPromptModal.style.display = 'none';
      if (!Array.isArray(currentResults?.requirements) || currentResults.requirements.length === 0) {
        if (!currentResults?.temp_folder_id) {
          alert("Mangler temp_folder_id. Kjør analysen på nytt.");
          return;
        }
        try {
          const j = await fetchJSON(`${BASE}/review_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temp_folder_id: currentResults.temp_folder_id })
          });
          if (!j?.ok) throw new Error(j?.error || "Kunne ikke hente rå funn.");
          currentResults.requirements = (j.requirements || []).map(normalizeRequirement);
          window.currentResults = currentResults;
          ensureAiFallbackAlert(currentResults.requirements);
        } catch (e) {
          alert(e.message || e);
          return;
        }
      }
      buildReviewUI();
    });
  }

  if (reviewPromptNoBtn) {
    reviewPromptNoBtn.addEventListener('click', () => {
      reviewPromptModal.style.display = 'none';
      if (downloadLink && downloadLink.href) {
        downloadLink.style.display = 'block';
      }
    });
  }

  if (addNewReqBtn) {
    addNewReqBtn.addEventListener('click', () => {
      const table = reviewTableWrapper.querySelector('table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (tbody) {
        addNewRequirementRow(tbody);
      }
    });
  }

  if (saveChangesBtn) {
    saveChangesBtn.addEventListener('click', async () => {
      if (!currentResults?.temp_folder_id) {
        alert("Mangler sesjons-ID (temp_folder_id). Kjør analysen på nytt.");
        return;
      }

      const originalBtnText = saveChangesBtn.innerHTML;
      saveChangesBtn.disabled = true;
      saveChangesBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Lagrer...`;

      try {
        const payload  = collectReviewedData();
        await fetchJSON(`${BASE}/save_review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        saveChangesBtn.innerHTML = `✓ Lagret!`;
        setTimeout(() => {
          saveChangesBtn.innerHTML = originalBtnText;
          saveChangesBtn.disabled = false;
        }, 1200);
      } catch (err) {
        alert(`Kunne ikke lagre endringer: ${err.message || err}`);
        saveChangesBtn.innerHTML = originalBtnText;
        saveChangesBtn.disabled = false;
      }
    });
  }

  if (retrainAiBtn) {
    retrainAiBtn.addEventListener('click', async () => {
      if (!currentResults?.temp_folder_id) {
        alert("Mangler sesjons-ID (temp_folder_id). Kjør analysen på nytt.");
        return;
      }
      if (!confirm("Er du sikker på at du vil starte AI-trening? Dette vil oppdatere modellene basert på dine endringer.")) {
        return;
      }
      const originalBtnText = retrainAiBtn.innerHTML;
      retrainAiBtn.disabled = true;
      retrainAiBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Trener...`;
      try {
        await saveChangesBtn.click(); // Auto-save før trening
        const j = await fetchJSON(`${BASE}/retrain_ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temp_folder_id: currentResults.temp_folder_id }),
        });
        const task_id = j?.task_id;
        if (!task_id) throw new Error('Mangler task_id fra server.');
        statusContainer.style.display = 'block';
        statusText.textContent = 'Starter AI-trening...';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-success', 'bg-danger');
        progressBar.classList.add('progress-bar-animated');
        pollForTaskStatus(task_id, 'retrain');
      } catch (err) {
        alert(`Kunne ikke starte AI-trening: ${err.message || err}`);
        retrainAiBtn.innerHTML = originalBtnText;
        retrainAiBtn.disabled = false;
      }
    });
  }

  if (finishReviewBtn) {
    finishReviewBtn.addEventListener('click', async () => {
      if (!currentResults?.temp_folder_id) {
        alert("Mangler sesjons-ID (temp_folder_id). Kjør analysen på nytt.");
        return;
      }
      const originalBtnText = finishReviewBtn.innerHTML;
      finishReviewBtn.disabled = true;
      saveChangesBtn.disabled  = true;
      retrainAiBtn.disabled    = true;
      finishReviewBtn.innerHTML= `<span class="spinner-border spinner-border-sm"></span> Genererer...`;
      if (downloadLink) downloadLink.style.display = 'none';

      try {
        await saveChangesBtn.click(); // Auto-save
        const j = await fetchJSON(`${BASE}/generate_zip_from_review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temp_folder_id: currentResults.temp_folder_id }),
        });
        const task_id = j?.task_id;
        if (!task_id) throw new Error('Mangler task_id fra server.');
        statusContainer.style.display = 'block';
        statusText.textContent = 'Starter generering av ZIP...';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-success', 'bg-danger');
        progressBar.classList.add('progress-bar-animated');
        pollForTaskStatus(task_id, 'zip');
      } catch (err) {
        alert(`Kunne ikke starte generering: ${err.message || err}`);
        finishReviewBtn.innerHTML = originalBtnText;
        finishReviewBtn.disabled  = false;
        saveChangesBtn.disabled   = false;
        retrainAiBtn.disabled     = false;
      }
    });
  }

  function collectReviewedData() {
    const tableRows = reviewTableWrapper.querySelectorAll("tbody tr");
    const reviewedRequirements = [];
    const tempId = currentResults?.temp_folder_id;

    tableRows.forEach(row => {
      if (row.dataset.deleted === 'true') return;
      const cells = row.cells;
      let requirement;

      if (row.dataset.isNew === 'true') {
        requirement = {
          keyword: '(Manuelt lagt til)',
          text: (cells[4]?.textContent || "").trim(),
          kravtype: (cells[2]?.querySelector('select')?.value) || "Uspesifisert",
          score: 100.0,
          ref: 'Manuelt lagt til',
          korttekst: (cells[3]?.textContent || "").trim(),
          fag: [(cells[1]?.querySelector('select')?.value) || "Uspesifisert"],
          status: (cells[8]?.querySelector('select')?.value) || "Aktiv",
          duplicate_of: (cells[9]?.querySelector('input')?.value || "").trim() || null,
          user_reviewed: true,
          is_newly_added: true
        };
      } else {
        const originalIndex = parseInt(row.dataset.originalIndex, 10);
        const originalReq   = (currentResults.requirements || [])[originalIndex] || {};
        requirement = {
          ...originalReq,
          fag: [(cells[1]?.querySelector('select')?.value) || "Uspesifisert"],
          kravtype: (cells[2]?.querySelector('select')?.value) || "Uspesifisert",
          korttekst: (cells[3]?.textContent || "").trim(),
          text: (cells[4]?.textContent || "").trim(),
          status: (cells[8]?.querySelector('select')?.value) || "Aktiv",
          duplicate_of: (cells[9]?.querySelector('input')?.value || "").trim() || null,
          user_reviewed: true
        };
      }
      if (requirement.is_newly_added && !requirement.text) return;
      reviewedRequirements.push(requirement);
    });

    return {
      temp_folder_id: tempId,
      requirements: reviewedRequirements
    };
  }
  window.collectReviewedData = collectReviewedData;

  function buildRankToggle(rank) {
    const wrap = document.createElement('div');
    const btn  = document.createElement('button');
    btn.className = 'btn btn-outline-secondary btn-sm';
    btn.textContent = 'Vis rank';
    const pane = document.createElement('div');
    pane.className = 'mt-1 small border rounded p-2';
    pane.style.display = 'none';
    pane.style.maxWidth = '320px';
    pane.style.whiteSpace = 'pre-wrap';
    pane.textContent = (rank && rank.length)
      ? rank.slice(0, 5).map(([lbl, sc]) => `${lbl}: ${Math.round((sc || 0)*1000)/10}%`).join('\n')
      : 'Ingen rangering tilgjengelig.';
    btn.addEventListener('click', () => {
      pane.style.display = pane.style.display === 'none' ? 'block' : 'none';
      btn.textContent = pane.style.display === 'none' ? 'Vis rank' : 'Skjul rank';
    });
    wrap.appendChild(btn);
    wrap.appendChild(pane);
    return wrap;
  }

  function buildNsChips(nsTreff) {
    const box = document.createElement('div');
    if (!Array.isArray(nsTreff) || !nsTreff.length) {
      box.innerHTML = '<span class="text-muted">–</span>';
      return box;
    }
    nsTreff.slice(0, 3).forEach(h => {
      const chip = document.createElement('span');
      chip.className = 'badge rounded-pill bg-info text-dark me-1 mb-1';
      const sc = (typeof h.score === 'number') ? ` (${h.score}%)` : '';
      chip.textContent = `${h.standard || 'NS?'} s.${h.side || '?'}${sc}`;
      chip.title = (h.tekst || '').slice(0, 300);
      box.appendChild(chip);
    });
    return box;
  }

  function buildAiScoreBar(score, thr, loaded, kilde) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(score || 0))) * 100);
    const bar = document.createElement('div');
    const outer = document.createElement('div');
    outer.className = 'progress';
    outer.style.height = '8px';
    const inner = document.createElement('div');
    inner.className = 'progress-bar';
    inner.style.width = `${pct}%`;
    inner.setAttribute('aria-valuenow', String(pct));
    inner.setAttribute('aria-valuemin', '0');
    inner.setAttribute('aria-valuemax', '100');
    if (pct >= Math.round((thr || 0.45)*100)) {
      inner.classList.add('bg-success');
    } else {
      inner.classList.add('bg-warning');
    }
    outer.title = `score: ${pct}% • terskel: ${Math.round((thr||0.45)*100)}% • kilde: ${kilde || 'regex'} • lastet: ${loaded ? 'ja' : 'nei'}`;
    outer.appendChild(inner);
    bar.appendChild(outer);
    return bar;
  }

  function buildSourceBadge(kilde) {
    const span = document.createElement('span');
    const k = (kilde || '').toLowerCase();
    span.className = `badge ${k === 'ai' ? 'bg-primary' : 'bg-secondary'} ms-1`;
    span.textContent = k === 'ai' ? 'AI' : 'Regex';
    span.title = k === 'ai' ? 'Fag fra AI-modell' : 'Fag fra regex/heuristikk';
    return span;
  }

  function buildReviewUI() {
    if (!currentResults || !Array.isArray(currentResults.requirements)) {
      reviewTableWrapper.innerHTML = `
        <div class="alert alert-info">
          Ingen forhåndsvisning tilgjengelig fra serveren. Du kan laste ned resultatene direkte${downloadLink?.href ? ' via knappen under' : ''}.
        </div>`;
      reviewContainer.style.display = 'block';
      return;
    }

    reviewTableWrapper.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'table table-bordered table-hover align-middle';
    table.innerHTML = `
      <thead class="table-light">
        <tr>
          <th>#</th>
          <th>Fag <span class="text-muted">(kilde)</span></th>
          <th>Kravtype</th>
          <th>Korttekst</th>
          <th>Kravfunn (full tekst)</th>
          <th>AI-score</th>
          <th>AI-rank</th>
          <th>NS-treff</th>
          <th>Status</th>
          <th>Duplikat av #</th>
          <th>Handlinger</th>
        </tr>
      </thead>
      <tbody></tbody>`;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    (currentResults.requirements || []).forEach((req, index) => {
      const row = tbody.insertRow();
      row.dataset.originalIndex = index;

      row.insertCell().textContent = index + 1; // #

      const fagCell = row.insertCell();
      const fagSelect = createDropdown(FAG_OPTIONS, (req.fag && req.fag[0]) || "Uspesifisert");
      fagCell.appendChild(fagSelect);
      fagCell.appendChild(buildSourceBadge(req.gruppe_kilde));

      row.insertCell().appendChild(createDropdown(KRAVTYPE_OPTIONS, req.kravtype || "Uspesifisert"));

      const korttekstCell = row.insertCell();
      korttekstCell.textContent = (req.korttekst || "").trim();
      korttekstCell.setAttribute('contenteditable', 'true');

      const fullTextCell = row.insertCell();
      fullTextCell.textContent = (req.text || "").trim();
      fullTextCell.setAttribute('contenteditable', 'true');

      row.insertCell().appendChild(buildAiScoreBar(req.gruppe_score || 0, req.ai_threshold || 0.45, !!req.ai_loaded, req.gruppe_kilde || 'regex'));
      row.insertCell().appendChild(buildRankToggle(req.gruppe_rank || []));
      row.insertCell().appendChild(buildNsChips(req.ns_treff || []));

      const statusSelect = createDropdown(STATUS_OPTIONS, (req.status || "Aktiv"));
      statusSelect.addEventListener('change', (e) => row.classList.toggle('table-secondary', e.target.value === 'Inaktiv'));
      row.insertCell().appendChild(statusSelect);

      const duplicateInput = document.createElement('input');
      duplicateInput.type = 'number';
      duplicateInput.className = 'form-control form-control-sm';
      row.insertCell().appendChild(duplicateInput);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger btn-sm';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.onclick = () => {
        if (confirm(`Er du sikker på at du vil slette rad ${index + 1}?`)) {
          row.style.display = 'none';
          row.dataset.deleted = 'true';
        }
      };
      row.insertCell().appendChild(deleteBtn);
    });

    reviewTableWrapper.appendChild(table);
    reviewContainer.style.display = 'block';
  }
  window.buildReviewUI = buildReviewUI;

  function addNewRequirementRow(tbody) {
    const newIndex = tbody.rows.length + 1;
    const row = tbody.insertRow();
    row.dataset.isNew = 'true';
    row.classList.add('table-success');

    row.insertCell().textContent = newIndex;

    const fagCell = row.insertCell();
    fagCell.appendChild(createDropdown(FAG_OPTIONS, "Uspesifisert"));
    fagCell.appendChild(buildSourceBadge("manual"));

    row.insertCell().appendChild(createDropdown(KRAVTYPE_OPTIONS, "Krav"));

    const korttekstCell = row.insertCell();
    korttekstCell.setAttribute('contenteditable', 'true');
    korttekstCell.setAttribute('placeholder', 'Skriv korttekst her...');

    const textCell = row.insertCell();
    textCell.setAttribute('contenteditable', 'true');
    textCell.setAttribute('placeholder', 'Lim inn tekst for nytt krav her...');

    row.insertCell().appendChild(buildAiScoreBar(0, 0.45, false, 'manual'));
    row.insertCell().appendChild(buildRankToggle([]));
    row.insertCell().appendChild(buildNsChips([]));
    row.insertCell().appendChild(createDropdown(STATUS_OPTIONS, "Aktiv"));

    const duplicateInput = document.createElement('input');
    duplicateInput.type = 'number';
    duplicateInput.className = 'form-control form-control-sm';
    row.insertCell().appendChild(duplicateInput);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
    deleteBtn.onclick = () => {
      if (confirm(`Fjerne denne nye raden?`)) {
        row.remove();
      }
    };
    row.insertCell().appendChild(deleteBtn);
    textCell.focus();
  }

  function createDropdown(options, selectedValue) {
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    options.forEach(optionText => {
      const option = document.createElement('option');
      option.value = optionText;
      option.textContent = optionText;
	  if (optionText.toLowerCase() === (selectedValue || "").toLowerCase()) {
	    option.selected = true;
	  }
      select.appendChild(option);
    });
    return select;
  }
});