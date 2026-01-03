// static/js/kravsporing.js
// -*- coding: utf-8 -*-
/**
 * kravsporing.js – frontend for Kravsporing
 * Eneste globale symbol: window.KS
 */
(() => {
  /* ==========  STATE  ========== */
  const state = {
    nokkelordData: {},
    currentResults: { temp_folder_id: null, requirements: [], baseRequirements: [], previewRequirements: [] },
    timers: { anim: null, msg: null, poll: null },
    flags: { polling: false },
    opts: {
      FAG: ['ventilasjon', 'elektro', 'rørlegger', 'byggautomasjon', 'prosjektering',
            'økonomi', 'byggherre', 'totalentreprenør', 'kulde', 'felles', 'uspesifisert'],
      KRAVTYPE: ['installasjon', 'krav', 'dokumentasjon', 'funksjon', 'ytelse', 'uspesifisert'],
      STATUS: ['aktiv', 'inaktiv']
    }
  };

  /* ==========  UI CACHE  ========== */
  const ui = (() => {
    const cache = {};
    const q = (s, c = document) => { if (!cache[s]) cache[s] = c.querySelector(s); return cache[s]; };
    const qa = (s, c = document) => c.querySelectorAll(s);
    return {
      /* hovedskjema */
      startBtn: q('#startKravsporingBtn'),
      files: q('#files'),
      minScore: q('#min_score'),
      modeRadios: qa('input[name="mode"]'),
      functionGroupSelect: q('#function-group-select'),
      aiWrapper: q('#ai-controls-wrapper'),
      aiStatusPill: q('#ai-status-pill'),
      fokus: q('#fokusomraade'),
      /* editor-modal */
      editorModalEl: q('#nokkelord-editor-modal'),
      editorModal: null,
      tabs: q('#nokkelord-editor-tabs'),
      content: q('#nokkelord-editor-content'),
      addFagBtn: q('#add-fag-btn'),
      saveNokkelordBtn: q('#save-nokkelord-btn'),
      /* status/download */
      statusBox: q('#status-container'),
      progress: q('#progress-bar'),
      statusText: q('#status-text'),
      downloadLink: q('#download-link'),
      errorBox: q('#error-messages'),
      magnifier: q('#magnifier'),
      textEl: q('#kravsporing-text'),
      /* review */
      reviewPrompt: q('#review-prompt-modal'),
      reviewYes: q('#review-prompt-yes'),
      reviewNo: q('#review-prompt-no'),
      reviewBox: q('#review-container'),
      reviewTable: q('#review-table-wrapper'),
      saveReviewBtn: q('#save-changes-btn'),
      retrainBtn: q('#retrain-ai-btn'),
      finishBtn: q('#finish-review-btn'),
      addReqBtn: q('#add-new-req-btn'),
      /* cards/counter */
      fagGrid: q('#fag-grid'),
      valgtCounter: q('#valgt-counter'),
	  toggleUncertain: q('#toggle-uncertain')
    };
  })();

  /* ==========  API  ========== */
  const API = {
	BASE: (window.KS_BASE || '/kravsporing').replace(/\/$/, ''),

	_url(path) {
	if (/^https?:\/\//i.test(path)) return path;
	return this.BASE + (path.startsWith('/') ? path : '/' + path);
	},

	async fetchJSON(endpoint, opts = {}, timeout = 60000) {
	  const ctrl = new AbortController();
	  const t = setTimeout(() => ctrl.abort(), timeout);
	  try {
		const res = await fetch(this._url(endpoint), {
		  credentials: 'same-origin',   // ✅ send cookies (for @login_required)
		  cache: 'no-store',            // ✅ unngå gamle svar i cache
		  redirect: 'follow',
		  ...opts,
		  signal: ctrl.signal
		});
		if (!res.ok) throw new Error('HTTP ' + res.status);
		return await res.json();
	  } catch (e) {
		// NetworkError i Firefox/Dom → e er ofte TypeError
		const msg = (e && e.message) || String(e);
		if (e.name === 'AbortError') throw new Error('The operation was aborted (timeout).');
		if (msg.includes('NetworkError') || e instanceof TypeError) {
		  throw new Error('Nettverksfeil – sjekk at du er innlogget og at adressen er riktig (CORS/https?).');
		}
		throw e;
	  } finally {
		clearTimeout(t);
	  }
	},

	loadKeywords: () => API.fetchJSON('/api/nokkelord'),

	saveKeywords: (data) => API.fetchJSON('/api/nokkelord', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data)
	}),

	startScan: (formData) => {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 300000); // 5 min for store opplastinger
	return fetch(API._url('/scan'), { method: 'POST', body: formData, credentials: 'same-origin', cache: 'no-store', redirect: 'follow', signal: ctrl.signal })
	.finally(() => clearTimeout(t));
	},

	taskStatus: (id, timeoutMs = 60000) => API.fetchJSON(`/status/${id}`, {}, timeoutMs),

	saveReview: (payload) => API.fetchJSON('/save_review', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
	}),

	retrain: (id) => API.fetchJSON('/learn', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ temp_folder_id: id })
	}),

	zip: (id) => API.fetchJSON('/generate_zip_from_review', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ temp_folder_id: id })
	})
  };

  /* ==========  UTILS  ========== */
  const Utils = {
    el(tag, attr = {}, ...kids) {
      const e = document.createElement(tag);
      if (tag.toLowerCase() === 'button' && !('type' in attr)) e.setAttribute('type', 'button');
      Object.keys(attr).forEach(k => {
        if (k === 'className') e.className = attr[k];
        else if (k === 'innerText') e.innerText = attr[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attr[k]);
        else if (k === 'dataset') Object.assign(e.dataset, attr[k]);
        else e.setAttribute(k, attr[k]);
      });
      kids.flat().forEach(k => e.append(k));
      return e;
    },
    safePercent(cur, tot, def = 0) {
      const c = Number(cur), t = Number(tot);
      return (!isFinite(c) || !isFinite(t) || t <= 0) ? def : Math.max(0, Math.min(100, (c / t) * 100));
    },
    show(el) { if (!el) return; el.hidden = false; el.style.display = ''; },
    hide(el) { if (!el) return; el.hidden = true; el.style.display = 'none'; },
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    /* Normaliser fag-navn til CSS-vennlige data-fag verdier */
    slugFag(name) {
      const s = String(name || '').trim().toLowerCase();
      const map = {
        'byggautomasjon':'byggautomasjon',
        'elektro':'elektro',
        'rørlegger':'rørlegger',
        'rorlegger':'rørlegger',
        'ventilasjon':'ventilasjon',
        'økonomi':'økonomi',
        'okonomi':'økonomi',
        'kontrakt':'økonomi',
        'kontrakt og underlag':'økonomi',
        'roller og ansvar':'økonomi',
        'prosjektering':'økonomi',
      };
      if (map[s]) return map[s];
      const k = Object.keys(map).find(k => s.startsWith(k));
      return (k ? map[k] : s.replace(/\s/g,''));
    },
	normalizeReq(r) {
	  const raw = Array.isArray(r.fag) ? r.fag[0] : (r.gruppe ?? 'uspesifisert');
	  let label = String(raw).trim().toLowerCase();
	  const known = new Set(state.opts.FAG);
	  if (!known.has(label)) label = 'uspesifisert';
      return {
        ...r,
        fag: [label],
        gruppe: label,
        gruppe_kilde: r.gruppe_kilde || 'regex',
        gruppe_score: typeof r.gruppe_score === 'number' ? r.gruppe_score : 0,
        gruppe_rank: Array.isArray(r.gruppe_rank) ? r.gruppe_rank : [],
        ai_loaded: Boolean(r.ai_loaded),
        korttekst: (r.korttekst || '').trim(),
        text: (r.text || '').trim(),
        kravtype: (r.kravtype || 'krav').toLowerCase(),
        status: (r.status || 'aktiv').toLowerCase(),
        ref: r.ref || '',
        ns_treff: Array.isArray(r.ns_treff) ? r.ns_treff : []
      };
    }
  };

  function buildExplainCell(explain) {
    if (!explain) return '';
    const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
    const pct = (v) => `${num(v).toFixed(1)}%`;
    const fk = num(explain.fokus_boost || 0);
    return `KW: ${pct(explain.kw_sc)} | SEM: ${pct(explain.sem_sc)} | AI: ${pct(explain.ai_sc)} | FOKUS: ${fk.toFixed(1)}`;
  }
  function buildTopFagCell(topFag) {
    if (!Array.isArray(topFag) || !topFag.length) return '';
    return topFag.map(t => `${t.label ?? '–'} (${(Number(t.score) || 0).toFixed(1)}%)`).join(', ');
  }

  // Synk valgte funksjonssamlinger til hidden <select> + JSON-speiling
  function syncSelectedGroupsToHiddenFields(groupsArray) {
    const selectEl = document.getElementById('function-group-select');
    const jsonEl   = document.getElementById('selected_groups_json');

    if (!selectEl || !jsonEl) return;

    // Bygg select-options på nytt
    selectEl.innerHTML = '';
    for (const g of groupsArray) {
      if (!g || !String(g).trim()) continue;
      const opt = document.createElement('option');
      opt.value = String(g).trim();
      opt.textContent = String(g).trim();
      opt.selected = true;                 // viktig, ellers postes de ikke
      selectEl.appendChild(opt);
    }

    // JSON-speiling
    jsonEl.value = JSON.stringify(groupsArray.filter(v => v && String(v).trim()));
  }


  /* ==========  KEYWORD EDITOR  ========== */
  const KeywordEditor = {
    async init() {
      if (!ui.editorModalEl) return;
      ui.editorModal = new bootstrap.Modal(ui.editorModalEl);
      ui.editorModalEl.addEventListener('show.bs.modal', () => this.loadAndRender());
      ui.content?.addEventListener('click', e => this.handleAction(e));
      ui.content?.addEventListener('keydown', e => this.handleAction(e));
      ui.tabs?.addEventListener('click', e => this.handleAction(e));
      ui.addFagBtn?.addEventListener('click', () => this.handleAction({ target: { dataset: { action: 'add-fag' } } }));
      ui.saveNokkelordBtn?.addEventListener('click', () => this.save());
    },
    async loadAndRender() {
      try {
        state.nokkelordData = structuredClone(await API.loadKeywords());
        this.render();
      } catch (e) {
        this.showError('Kunne ikke laste nøkkelord: ' + e.message);
      }
    },
	render() {
      if (!ui.tabs || !ui.content) return;
      ui.tabs.innerHTML = ''; ui.content.innerHTML = '';
      let first = true;
      
      // ✅ FIKS: Hent ut .fag-objektet
      const fagData = state.nokkelordData?.fag || {};

      // ✅ FIKS: Iterer over fagData, ikke state.nokkelordData
      for (const fag of Object.keys(fagData).sort((a, b) => a.localeCompare(b, 'no'))) {
        const safe = fag.replace(/\W/g, '');
        const paneId = 'pane-' + safe;
        ui.tabs.appendChild(
          Utils.el('li', { className: 'nav-item d-flex align-items-center' },
            Utils.el('button', { className: 'nav-link ' + (first ? 'active' : ''), 'data-bs-toggle': 'tab', 'data-bs-target': '#' + paneId }, fag),
            Utils.el('button', { className: 'btn btn-sm text-secondary p-0 px-2', innerText: '✏️', dataset: { action: 'edit-fag', fag }, title: 'Rediger' }),
            Utils.el('button', { className: 'btn btn-sm text-danger p-0 px-1', innerText: '❌', dataset: { action: 'delete-fag', fag }, title: 'Slett' })
          )
        );
        ui.content.appendChild(
          Utils.el('div', { className: 'tab-pane fade ' + (first ? 'show active' : ''), id: paneId },
            Utils.el('div', { className: 'd-flex justify-content-end mb-3' },
              Utils.el('button', { className: 'btn btn-sm btn-outline-primary', innerText: '+ Legg til funksjonssamling', dataset: { action: 'add-fs', fag } })
            ),
            Utils.el('div', { className: 'accordion', id: 'acc-' + safe },
              // ✅ FIKS: Hent undermenyer fra fagData[fag]
              ...Object.keys(fagData[fag]).sort((a, b) => a.localeCompare(b, 'no')).map(fs => this.accordionItem(fag, fs, safe))
            )
          )
        );
        first = false;
      }
    },
	accordionItem(fag, fs, safe) {
      const safeFs = fs.replace(/\W/g, '');
      
      // ✅ FIKS: Hent nøkkelord fra state.nokkelordData.fag[fag][fs]
      const keywords = Object.keys(state.nokkelordData.fag[fag][fs]).sort((a, b) => a.localeCompare(b, 'no')).map(kw => this.keywordItem(fag, fs, kw));
      
      return Utils.el('div', { className: 'accordion-item' },
        Utils.el('h2', { className: 'accordion-header d-flex align-items-center' },
          Utils.el('button', { className: 'accordion-button collapsed flex-grow-1', type: 'button', 'data-bs-toggle': 'collapse', 'data-bs-target': '#coll-' + safe + '-' + safeFs }, fs),
          Utils.el('button', { className: 'btn btn-sm text-secondary p-0 px-2', innerText: '✏️', dataset: { action: 'edit-fs', fag, fs }, title: 'Rediger' }),
          Utils.el('button', { className: 'btn btn-sm text-danger p-0 px-2', innerText: '❌', dataset: { action: 'delete-fs', fag, fs }, title: 'Slett' })
        ),
        Utils.el('div', { id: 'coll-' + safe + '-' + safeFs, className: 'accordion-collapse collapse', 'data-bs-parent': '#acc-' + safe },
          Utils.el('div', { className: 'accordion-body' },
            Utils.el('ul', { className: 'list-group' }, ...keywords),
            Utils.el('div', { className: 'input-group mt-3' },
              Utils.el('input', { className: 'form-control form-control-sm', placeholder: 'Nytt nøkkelord', dataset: { action: 'add-nokkelord', fag, fs } }),
              Utils.el('button', { className: 'btn btn-sm btn-outline-success', innerText: 'Legg til', dataset: { action: 'add-nokkelord', fag, fs } })
            )
          )
        )
      );
    },
	keywordItem(fag, fs, kw) {
      // ✅ FIKS: Henter nå fra state.nokkelordData.fag...
      const syns = (state.nokkelordData.fag[fag][fs][kw] || []).map(s =>
        Utils.el('span', { className: 'badge bg-light text-dark me-1 editor-synonym', innerText: s + ' ×', dataset: { action: 'del-syn', fag, fs, kw, syn: s }, title: 'Slett synonym' })
      );
      return Utils.el('li', { className: 'list-group-item', dataset: { fag, fs, kw } },
        Utils.el('div', { className: 'd-flex justify-content-between align-items-center' },
          Utils.el('strong', {}, kw),
          Utils.el('div', {},
            Utils.el('button', { className: 'btn btn-sm text-secondary p-0 px-2', innerText: '✏️', dataset: { action: 'edit-kw', fag, fs, kw }, title: 'Rediger' }),
            Utils.el('button', { className: 'btn btn-sm text-danger p-0 px-1', innerText: '❌', dataset: { action: 'del-kw', fag, fs, kw }, title: 'Slett' })
          )
        ),
        // ✅ FIKS: Egen container for badges, slik at vi kan legge til nye
        Utils.el('div', { className: 'mt-2 synonym-badge-container' }, ...syns),
        
        // ✅ FIKS: Bytter ut enkelt input-felt med en input-gruppe (felt + knapp)
        Utils.el('div', { className: 'input-group input-group-sm mt-1' },
          Utils.el('input', { 
            className: 'form-control add-synonym-input', 
            placeholder: '+ Legg til synonym', 
            dataset: { action: 'add-syn-input', fag, fs, kw } // Egen action for Enter-trykk
          }),
          Utils.el('button', { 
            className: 'btn btn-outline-secondary', 
            innerText: 'Legg til', 
            dataset: { action: 'add-syn-btn', fag, fs, kw } // Egen action for knappetrykk
          })
        )
      );
    },
    async save() {
      if (!ui.saveNokkelordBtn) return;
      ui.saveNokkelordBtn.disabled = true;
      const prev = ui.saveNokkelordBtn.innerHTML;
      ui.saveNokkelordBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Lagrer...';
      try {
        await API.saveKeywords(state.nokkelordData);
        ui.editorModal?.hide();
      } catch (e) {
        this.showError(e.message);
      } finally {
        ui.saveNokkelordBtn.disabled = false; ui.saveNokkelordBtn.innerHTML = prev;
      }
    },
    showError(msg) { Utils.show(ui.errorBox); ui.errorBox.innerText = msg; },
	handleAction(e) {
      const target = e.target;
      const action = target?.dataset?.action;
      if (!action) return;
 
      const ds = target.dataset;
      const { fag, fs, kw, syn } = ds;
 
      // --- Håndter 'Enter' på input-felt ---
      if (e.type === 'keydown') {
        if (e.key !== 'Enter') return;
        e.preventDefault(); // Stopp Enter fra å submitte/lukke
        
        // ✅ FIKS: Hvis 'Enter' trykkes, finn "Legg til"-knappen ved siden av og "klikk" den
        if (action === 'add-syn-input') {
          target.nextElementSibling?.click();
          return;
        }
        if (action === 'add-nokkelord') {
          target.nextElementSibling?.click();
          return;
        }
        return; // Ikke gjør noe mer på Enter
      }
      
      // ✅ FIKS: Alle operasjoner må skje på state.nokkelordData.fag
      switch (action) {
        // ... (Alle dine eksisterende 'case' for fag, fs, kw er de samme som vi fikset sist) ...
        // ... (Bare lim inn de du allerede har, fra 'add-fag' til 'del-kw') ...
        
        // Våre 4-nivås fikser (inkludert for sikkerhets skyld)
        case 'add-fag': {
          const newFag = prompt('Hva heter det nye fagområdet?');
          if (!newFag || !newFag.trim()) return;
          state.nokkelordData.fag[newFag.trim()] = {};
          this.render();
          break;
        }
        case 'edit-fag': {
          const newFag = prompt('Endre navn på fagområde:', fag);
          if (!newFag || !newFag.trim() || newFag === fag) return;
          state.nokkelordData.fag[newFag.trim()] = state.nokkelordData.fag[fag];
          delete state.nokkelordData.fag[fag];
          this.render();
          break;
        }
        case 'delete-fag': {
          if (!confirm(`Slette fagområdet "${fag}" og alle tilhørende funksjonssamlinger?`)) return;
          delete state.nokkelordData.fag[fag];
          this.render();
          break;
        }
        case 'add-fs': {
          const newFs = prompt(`Hva heter den nye funksjonssamlingen under "${fag}"?`);
          if (!newFs || !newFs.trim()) return;
          state.nokkelordData.fag[fag][newFs.trim()] = {};
          this.render();
          break;
        }
        case 'edit-fs': {
          const newFs = prompt('Endre navn på funksjonssamling:', fs);
          if (!newFs || !newFs.trim() || newFs === fs) return;
          state.nokkelordData.fag[fag][newFs.trim()] = state.nokkelordData.fag[fag][fs];
          delete state.nokkelordData.fag[fag][fs];
          this.render();
          break;
        }
        case 'delete-fs': {
          if (!confirm(`Slette funksjonssamlingen "${fs}" og alle tilhørende nøkkelord?`)) return;
          delete state.nokkelordData.fag[fag][fs];
          this.render();
          break;
        }
        case 'add-nokkelord': {
          const input = target.previousElementSibling;
          const newKw = input?.value?.trim();
          if (!newKw) return;
          state.nokkelordData.fag[fag][fs][newKw] = [];
          input.value = '';
          this.render();
          break;
        }
        case 'edit-kw': {
          const newKw = prompt('Endre nøkkelord:', kw);
          if (!newKw || !newKw.trim() || newKw === kw) return;
          state.nokkelordData.fag[fag][fs][newKw.trim()] = state.nokkelordData.fag[fag][fs][kw];
          delete state.nokkelordData.fag[fag][fs][kw];
          this.render();
          break;
        }
        case 'del-kw': {
          if (!confirm(`Slette nøkkelordet "${kw}"?`)) return;
          delete state.nokkelordData.fag[fag][fs][kw];
          this.render();
          break;
        }

        // --- ✅ NY LOGIKK FOR SYNONYMER ---
        
        // Denne kjøres når du klikker "Legg til"
        case 'add-syn-btn': { 
          const input = target.previousElementSibling; // Finner input-feltet
          const newSyn = input?.value?.trim();
          if (!newSyn) return; // Ikke gjør noe hvis feltet er tomt

          // 1. Sjekk for duplikater
          const existing = state.nokkelordData.fag[fag][fs][kw];
          if (existing.includes(newSyn)) {
            input.value = ''; // Tøm feltet selv om det var en duplikat
            input.focus();
            return;
          }

          // 2. Oppdater data-objektet
          existing.push(newSyn);

          // 3. Oppdater UI (uten full re-render)
          const badgeContainer = target.closest('li').querySelector('.synonym-badge-container');
          if (badgeContainer) {
            // Vi trenger en 'del-syn'-badge, så vi må lage den
            const badge = Utils.el('span', { 
                className: 'badge bg-light text-dark me-1 editor-synonym', 
                innerText: newSyn + ' ×', 
                dataset: { action: 'del-syn', fag, fs, kw, syn: newSyn }, 
                title: 'Slett synonym' 
            });
            badgeContainer.appendChild(badge);
          }

          // 4. Tøm og fokuser for neste synonym
          input.value = '';
          input.focus();
          // VIKTIG: Ingen this.render() her!
          break;
        }
        
        // Denne kjøres når du sletter et synonym
        case 'del-syn': {
          if (!confirm(`Slette synonymet "${syn}"?`)) return;
          
          // 1. Oppdater data-objektet
          state.nokkelordData.fag[fag][fs][kw] = state.nokkelordData.fag[fag][fs][kw].filter(s => s !== syn);
          
          // 2. Oppdater UI (fjern kun badgen)
          target.remove();
          // VIKTIG: Ingen this.render() her!
          break;
        }
      }
    },
  };

  /* ==========  POLLING  ========== */
  const Polling = {
	async start(taskId, taskType) {
	  // init UI
	  state.flags.polling = true;
	  clearTimeout(state.timers.poll);
	  ui.statusText.innerText = 'Starter...';
	  ui.progress.style.width = '0%';
	  ui.progress.classList.add('progress-bar-animated');
	  ui.progress.classList.remove('bg-success', 'bg-danger');

	  const POLL_INTERVAL_OK   = 1000;   // 1s ved OK respons
	  const POLL_INTERVAL_SLOW = 1500;   // 1.5s ved timeout/aborted
	  const STATUS_TIMEOUT_MS  = 90000;  // 90s per status-kall

	  const tick = async () => {
		if (!state.flags.polling) return;

		try {
		  const j = await API.taskStatus(taskId, STATUS_TIMEOUT_MS);

		  // Normaliser meta / progress
		  const meta     = (j && (j.meta || j.status || 'Arbeider...'));
		  const cur      = (j && (j.current ?? j.meta?.current ?? 0));
		  const tot      = (j && (j.total   ?? j.meta?.total   ?? 100));
		  const stateStr = (j && j.state) || 'PENDING';

		  if (stateStr === 'PENDING' || stateStr === 'PROGRESS') {
			ui.statusText.innerText = (typeof meta === 'string') ? meta : 'Arbeider...';
			ui.progress.style.width = Utils.safePercent(cur, tot, 0) + '%';
			state.timers.poll = setTimeout(tick, POLL_INTERVAL_OK);
			return;
		  }

		  if (stateStr === 'SUCCESS') {
              ui.progress.style.width = '100%';
              ui.progress.classList.remove('progress-bar-animated');
              ui.progress.classList.add('bg-success');
              ui.statusText.innerText = 'Ferdig!';
              App.stopMagnifierAnimation();
              state.flags.polling = false;

              const result = j.result || {};
			  
			   if (taskType === 'analyze') {
				const previewReqs = Array.isArray(result?.preview?.requirements)
				  ? result.preview.requirements.map(Utils.normalizeReq)
				  : [];

				state.currentResults = {
				  temp_folder_id: result.temp_folder_id || '',
				  requirements: [],
				  baseRequirements: [],
				  previewRequirements: previewReqs
				};

                if (ui.reviewPrompt) ui.reviewPrompt.style.display = 'block';
                if (!ui.reviewPrompt && result.download_url && ui.downloadLink) {
                  ui.downloadLink.href = result.download_url;
                  Utils.show(ui.downloadLink);
                }


              } else if (taskType === 'zip') {
                const url = result.download_url || result.url || '';
                if (url && ui.downloadLink) {
                  ui.downloadLink.href = url;
                  Utils.show(ui.downloadLink);
                }
                ui.statusText.innerText = 'ZIP klar for nedlasting';
              }

              if (ui.startBtn) {
                ui.startBtn.disabled = false;
                ui.startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
              }
              return;
		  }

		  // Feiltilstander
		  const errMsg = (j && (j.error || j.traceback)) || 'Ukjent feil';
		  throw new Error(errMsg);

		} catch (e) {
		  // Timeout/abort → vent litt og prøv igjen uten å knekke UI
		  const msg = (e && (e.message || e.name || '') || '').toString().toLowerCase();
		  if (msg.includes('aborted') || msg.includes('timeout')) {
			state.timers.poll = setTimeout(tick, POLL_INTERVAL_SLOW);
			return;
		  }

		  // Reelle feil: stopp
		  App.stopMagnifierAnimation();
		  state.flags.polling = false;
		  ui.progress.classList.remove('progress-bar-animated');
		  ui.progress.classList.add('bg-danger');
		  ui.statusText.innerText = 'Feil: ' + (e.message || 'Ukjent feil');
		  if (ui.startBtn) {
			ui.startBtn.disabled = false;
			ui.startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
		  }
		}
	  };

	  tick();
	},
    stop() { state.flags.polling = false; clearTimeout(state.timers.poll); }
  };

  /* ==========  REVIEW UI  ========== */
  const ReviewUI = {
    lastRenderedItems: [],
    init() {
      if (!ui.reviewYes) return;
      ui.reviewYes.addEventListener('click', () => this.show());
      ui.reviewNo.addEventListener('click', () => { ui.reviewPrompt.style.display = 'none'; Utils.show(ui.downloadLink); });
      ui.addReqBtn.addEventListener('click', () => this.addRow());
      ui.saveReviewBtn.addEventListener('click', () => this.saveChanges());
      ui.retrainBtn.addEventListener('click', () => this.retrain());
      ui.finishBtn.addEventListener('click', () => this.finish());
      if (ui.toggleUncertain) {
        ui.toggleUncertain.addEventListener('change', () => this.buildTable());
      }
    },
	async show() {
	  ui.reviewPrompt.style.display = 'none';
	  if (!state.currentResults.temp_folder_id) { alert('Mangler temp_folder_id'); return; }

	  // Hvis vi allerede har krav fra preview, render dem med en gang
      if (!Array.isArray(state.currentResults.baseRequirements) || state.currentResults.baseRequirements.length === 0) {
        try {
          const j = await API.fetchJSON('/review_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temp_folder_id: state.currentResults.temp_folder_id })
          });
          if (Array.isArray(j.requirements) && j.requirements.length) {
            state.currentResults.baseRequirements = j.requirements.map(Utils.normalizeReq);
          }
        } catch (e) {
          console.warn('review_data feilet:', e);
        }
      }

      this.buildTable();
      Utils.show(ui.reviewBox);
	},
    buildTable() {
      ui.reviewTable.innerHTML = '';
      const showUncertain = !!ui.toggleUncertain?.checked;
      const base = Array.isArray(state.currentResults.baseRequirements) ? state.currentResults.baseRequirements : [];
      const prev = Array.isArray(state.currentResults.previewRequirements) ? state.currentResults.previewRequirements : [];
      const items = showUncertain ? [...base, ...prev] : base;

      if (!items.length) { ui.reviewTable.innerText = 'Ingen krav å vise'; return; }

      this.lastRenderedItems = items;
      const headers = ['#','Fag','Kravtype','Korttekst','Full tekst','AI-score','NS-treff','Forklaring','Topp fag','Status','Duplikat',''];
      const tbl = Utils.el('table', { className: 'table table-bordered table-hover' },
        Utils.el('thead', { className: 'table-light' },
          Utils.el('tr', {}, ...headers.map(h => Utils.el('th', {}, h)))
        ),
        Utils.el('tbody', {}, ...items.map((req, idx) => this.row(req, idx)))
      );
      ui.reviewTable.appendChild(tbl);
    },
    row(req, idx) {
      const tr = Utils.el('tr', { dataset: { originalIndex: idx } });
      if (req.uncertain) tr.classList.add('table-warning');
      tr.appendChild(Utils.el('td', {}, idx + 1));
      const fagSelect = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.FAG.map(f => Utils.el('option', { value: f, selected: f === req.fag[0] }, f)));
      tr.appendChild(Utils.el('td', {}, fagSelect));
      const typeSelect = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.KRAVTYPE.map(t => Utils.el('option', { value: t, selected: t === req.kravtype }, t)));
      tr.appendChild(Utils.el('td', {}, typeSelect));
      const kort = Utils.el('td', { contentEditable: true, innerText: req.korttekst });
      tr.appendChild(kort);
      const full = Utils.el('td', { contentEditable: true, innerText: req.text });
      tr.appendChild(full);
      const scoreDiv = Utils.el('div', { className: 'progress', style: 'height:8px', title: 'score: ' + Math.round((req.gruppe_score || 0) * 100) + '%' },
        Utils.el('div', { className: 'progress-bar ' + ((req.gruppe_score || 0) >= 0.45 ? 'bg-success' : 'bg-warning'), style: 'width:' + Utils.safePercent((req.gruppe_score || 0), 1, 0) + '%' })
      );
      tr.appendChild(Utils.el('td', {}, scoreDiv));
      const nsCell = Utils.el('td', {});
      // Behold valgt pin på raden
      const currentPin = req.ns_pin || null;
      const pinLabel = Utils.el('div', { className: 'small text-muted mb-1' }, currentPin ? `Valgt: ${(currentPin.standard || 'NS?')} s.${currentPin.side ?? '?'}` : 'Valgt: –');
      nsCell.appendChild(pinLabel);

      if (Array.isArray(req.ns_treff) && req.ns_treff.length) {
        req.ns_treff.slice(0, 6).forEach(h => {
          const badge = Utils.el('span', {
            className: 'badge bg-info me-1',
            innerText: (h.standard || 'NS?') + ' s.' + (h.side || '?'),
            title: 'Klikk for å velge som NS-pin'
          });
          badge.addEventListener('click', () => {
            // lagre pin på TR (dataset) og vis i label
            tr.dataset.nsPin = JSON.stringify({ standard: h.standard || '', side: h.side || '', tekst: (h.tekst || '').slice(0, 200), score: h.score ?? null });
            pinLabel.innerText = `Valgt: ${(h.standard || 'NS?')} s.${h.side ?? '?'}`;
            // visuell feedback
            [...nsCell.querySelectorAll('.badge')].forEach(b => b.classList.remove('bg-primary'));
            badge.classList.add('bg-primary');
          });
          nsCell.appendChild(badge);
        });
      } else {
        nsCell.innerText = '–';
      }

      // Kvalitet-velger (høy/middels/lav)
      const kvalSel = Utils.el('select', { className: 'form-select form-select-sm mt-2', title: 'Vurder kvaliteten på NS-treffet' },
        Utils.el('option', { value: '' }, 'NS-kvalitet (valgfritt)'),
        Utils.el('option', { value: 'høy', selected: req.ns_quality === 'høy' }, 'høy'),
        Utils.el('option', { value: 'middels', selected: req.ns_quality === 'middels' }, 'middels'),
        Utils.el('option', { value: 'lav', selected: req.ns_quality === 'lav' }, 'lav')
      );
      kvalSel.addEventListener('change', () => { tr.dataset.nsQuality = kvalSel.value || ''; });
      if (req.ns_quality) kvalSel.value = req.ns_quality;
      nsCell.appendChild(kvalSel);

	  tr.appendChild(nsCell);
	  tr.appendChild(Utils.el('td', {}, buildExplainCell(req.explain)));
	  tr.appendChild(Utils.el('td', {}, buildTopFagCell(req.top_fag)));
      const statSelect = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.STATUS.map(s => Utils.el('option', { value: s, selected: s === req.status }, s)));
      statSelect.addEventListener('change', e => tr.classList.toggle('table-secondary', e.target.value === 'inaktiv'));
      tr.appendChild(Utils.el('td', {}, statSelect));
      const dupInput = Utils.el('input', { className: 'form-control form-control-sm', type: 'number', value: req.duplicate_of || '' });
      tr.appendChild(Utils.el('td', {}, dupInput));
      const delBtn = Utils.el('button', { className: 'btn btn-danger btn-sm', innerHTML: '<i class="bi bi-trash"></i>' });
      delBtn.addEventListener('click', () => { if (confirm('Slette rad ' + (idx + 1) + '?')) { tr.hidden = true; tr.dataset.deleted = 'true'; } });
      tr.appendChild(Utils.el('td', {}, delBtn));
      return tr;
    },
    addRow() {
      const tbody = ui.reviewTable.querySelector('tbody');
      if (!tbody) return;
      const tr = Utils.el('tr', { className: 'table-success', dataset: { isNew: 'true' } });
      const idx = tbody.rows.length + 1;
      tr.appendChild(Utils.el('td', {}, idx));
      const fagSel = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.FAG.map(f => Utils.el('option', { value: f }, f)));
      tr.appendChild(Utils.el('td', {}, fagSel));
      const typeSel = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.KRAVTYPE.map(t => Utils.el('option', { value: t }, t)));
      tr.appendChild(Utils.el('td', {}, typeSel));
      const kort = Utils.el('td', { contentEditable: true, placeholder: 'Kort tekst' });
      const full = Utils.el('td', { contentEditable: true, placeholder: 'Full tekst' });
      tr.appendChild(kort); tr.appendChild(full);
      tr.appendChild(Utils.el('td', {}, '–')); // ai-score
      tr.appendChild(Utils.el('td', {}, '–')); // ns
      const statSel = Utils.el('select', { className: 'form-select form-select-sm' }, ...state.opts.STATUS.map(s => Utils.el('option', { value: s }, s)));
      tr.appendChild(Utils.el('td', {}, statSel));
      tr.appendChild(Utils.el('td', {}, Utils.el('input', { className: 'form-control form-control-sm', type: 'number' })));
      const del = Utils.el('button', { className: 'btn btn-danger btn-sm', innerHTML: '<i class="bi bi-trash"></i>' });
      del.addEventListener('click', () => { if (confirm('Fjerne ny rad?')) tr.remove(); });
      tr.appendChild(Utils.el('td', {}, del));
      tbody.appendChild(tr);
      full.focus();
    },
	collect() {
	  const rows = ui.reviewTable.querySelectorAll('tbody tr');
	  const reqs = [];

	  rows.forEach(tr => {
		if (tr.hidden) return;
		const cells = tr.cells;

		// Pakk ut med tydelige navn (og fallbacks om kolonner mangler)
		const fagCell      = cells[1];
		const typeCell     = cells[2];
		const kortCell     = cells[3];
		const fullCell     = cells[4];
		// cells[5] = ai-score (read-only)
		// cells[6] = ns-treff (read-only)
		const statusCell   = cells[7];
		const dupCell      = cells[8];

		const fagVal    = fagCell?.querySelector('select')?.value ?? 'Uspesifisert';
		const typeVal   = typeCell?.querySelector('select')?.value ?? 'Krav';
		const kortVal   = (kortCell?.innerText || '').trim();
		const fullVal   = (fullCell?.innerText || '').trim();
		const statusVal = statusCell?.querySelector('select')?.value ?? 'Aktiv';
		const dupVal    = dupCell?.querySelector('input')?.value || null;

		const isNew = tr.dataset.isNew === 'true';
		const base = isNew ? {
		  keyword: '(Manuelt lagt til)',
		  text: fullVal,
		  kravtype: typeVal,
		  score: 1,
		  ref: 'Manuelt lagt til',
		  korttekst: kortVal,
		  fag: [fagVal],
		  status: statusVal,
		  duplicate_of: dupVal,
		  user_reviewed: true,
		  is_newly_added: true
        } : {
          ...ReviewUI.lastRenderedItems[parseInt(tr.dataset.originalIndex, 10)],
          fag: [fagVal],
          kravtype: typeVal,
          korttekst: kortVal,
          text: fullVal,
          status: statusVal,
          duplicate_of: dupVal,
          user_reviewed: true,
          ns_pin: (() => { try { return tr.dataset.nsPin ? JSON.parse(tr.dataset.nsPin) : null; } catch { return null; } })(),
          ns_quality: (tr.dataset.nsQuality || null)
        };

		if (isNew && !base.text) return; // hopp over tom ny rad
		reqs.push(base);
	  });

	  return { temp_folder_id: state.currentResults.temp_folder_id, requirements: reqs };
	},
    async saveChanges() {
      if (!state.currentResults.temp_folder_id) { alert('Mangler temp_folder_id'); return; }
      ui.saveReviewBtn.disabled = true;
      const orig = ui.saveReviewBtn.innerHTML;
      ui.saveReviewBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Lagrer...';
      try {
        await API.saveReview(this.collect());
        ui.saveReviewBtn.innerHTML = '✓ Lagret!';
        setTimeout(() => { ui.saveReviewBtn.innerHTML = orig; ui.saveReviewBtn.disabled = false; }, 1200);
      } catch (e) {
        alert('Kunne ikke lagre: ' + e.message);
        ui.saveReviewBtn.innerHTML = orig; ui.saveReviewBtn.disabled = false;
      }
    },
    async retrain() {
      if (!confirm('Starte AI-trening?')) return;
      ui.retrainBtn.disabled = true; const orig = ui.retrainBtn.innerHTML;
      ui.retrainBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Trener...';
      try {
        await this.saveChanges();
        const j = await API.retrain(state.currentResults.temp_folder_id);
        Utils.show(ui.statusBox); ui.statusText.innerText = 'Starter AI-trening...';
        ui.progress.style.width = '0%'; ui.progress.classList.add('progress-bar-animated'); ui.progress.classList.remove('bg-success', 'bg-danger');
        Polling.start(j.task_id, 'retrain');
      } catch (e) {
        alert('Kunne ikke starte trening: ' + e.message);
        ui.retrainBtn.innerHTML = orig; ui.retrainBtn.disabled = false;
      }
    },
    async finish() {
      ui.finishBtn.disabled = true; ui.saveReviewBtn.disabled = true; ui.retrainBtn.disabled = true;
      const orig = ui.finishBtn.innerHTML;
      ui.finishBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Genererer...';
      Utils.hide(ui.downloadLink);
      try {
        await this.saveChanges();
        const j = await API.zip(state.currentResults.temp_folder_id);
        Polling.start(j.task_id, 'zip');
      } catch (e) {
        alert('Kunne ikke starte ZIP-generering: ' + e.message);
        ui.finishBtn.innerHTML = orig; ui.finishBtn.disabled = false; ui.saveReviewBtn.disabled = false; ui.retrainBtn.disabled = false;
      }
    }
  };

  /* ==========  CARD-GRID (valg av funksjoner via kort)  ========== */
  const Cards = {
    fagModalInstance: null,

    init() {
      if (!ui.fagGrid || !ui.functionGroupSelect) return;

      this.fagModalInstance = new bootstrap.Modal(document.getElementById('fag-modal'));

      ui.fagGrid.addEventListener('click', e => {
        const card = e.target.closest('.fag-card');
        if (!card) return;
        this.handleCardClick(card);
      });

      const modalBody = document.getElementById('fag-modal-body');
      modalBody.addEventListener('change', e => {
        const checkbox = e.target;
        if (checkbox.matches('.form-check-input[data-fs]')) this.handleCheckboxChange(checkbox);
      });
      modalBody.addEventListener('click', e => {
        if (e.target.matches('.form-check-input')) e.stopPropagation();
      });

      this.updateCounter();
      this.renderSelectedState();
    },

	handleCardClick(card) {
      const fag = card.dataset.fagkey || card.dataset.fag;  // original nøkkel for data-oppslag
      
      // ✅ FIKS: Ser nå på riktig datasti (uten .funksjoner)
      const funksjoner = Object.keys(state.nokkelordData?.fag?.[fag] || {});
      
      const allSelected = funksjoner.every(fs =>
        [...ui.functionGroupSelect.options].some(o => o.value === fs && o.selected)
      );

      funksjoner.forEach(fs => this.setOptionSelected(fs, !allSelected));

      this.updateCounter();
      this.renderSelectedState();

      this.fillModal(fag);
	  this.fagModalInstance.show();
	  const groupsArray = Array.from(ui.functionGroupSelect.selectedOptions).map(o => o.value);
	  syncSelectedGroupsToHiddenFields(groupsArray);
    },

    handleCheckboxChange(checkbox) {
      const fs = checkbox.dataset.fs;
      const isSelected = checkbox.checked;
      this.setOptionSelected(fs, isSelected);
      this.updateCounter();
	  this.renderSelectedState();
	  const groupsArray = Array.from(ui.functionGroupSelect.selectedOptions).map(o => o.value);
	  syncSelectedGroupsToHiddenFields(groupsArray);
    },

    setOptionSelected(val, on) {
      let opt = [...ui.functionGroupSelect.options].find(o => o.value === val);
      if (!opt) {
        opt = new Option(val, val, false, false);
        ui.functionGroupSelect.appendChild(opt);
      }
      opt.selected = !!on;
    },

	updateCounter() {
      if (!ui.valgtCounter) return;

      // 1. Få en liste over alle valgte funksjonsgruppe-navn (f.eks. "Tele og Data")
      const selectedFuncGroups = new Set(
        [...ui.functionGroupSelect.selectedOptions].map(o => o.value)
      );

      let totalSynonymCount = 0;
      const fagData = state.nokkelordData?.fag || {};

      // 2. Vi må iterere gjennom hele datastrukturen for å finne
      //    alle synonymer som tilhører de valgte gruppene.
      
      // Gå gjennom hvert Fag (f.eks. "Elektro")
      for (const fagName in fagData) {
        const funcGroups = fagData[fagName] || {};
        
        // Gå gjennom hver funksjonsgruppe (f.eks. "Tele og Data")
        for (const funcGroupName in funcGroups) {
          
          // 3. Hvis denne gruppen er på listen vår over valgte...
          if (selectedFuncGroups.has(funcGroupName)) {
            
            const keywords = funcGroups[funcGroupName] || {};
            
            // 4. ...summer alle synonym-listene under den
            for (const keywordName in keywords) {
              const synonyms = keywords[keywordName] || [];
              if (Array.isArray(synonyms)) {
                // Her legger vi til antall synonymer (f.eks. 17 for "Infrastruktur")
                totalSynonymCount += synonyms.length; 
                
                // Valgfritt: Hvis du også vil telle selve nøkkelordet (f.eks. "Infrastruktur")
                // kan du legge til +1 her:
                // totalSynonymCount += (synonyms.length + 1); 
              }
            }
          }
        }
      }
      
      // 5. Oppdater telleren med den nye totalen
      ui.valgtCounter.textContent = `${totalSynonymCount} valgt`;
    },

	renderSelectedState() {
	  const selected = new Set([...ui.functionGroupSelect.selectedOptions].map(o => o.value));
	  ui.fagGrid.querySelectorAll('.fag-card').forEach(card => {
        const key = card.dataset.fagkey || card.dataset.fag; // bruk original nøkkel
        
        // ✅ FIKS: Ser nå på riktig datasti (uten .funksjoner)
        const funks = Object.keys(state.nokkelordData?.fag?.[key] || {});
		const total = funks.length;

		let sel = 0;
		for (const f of funks) if (selected.has(f)) sel++;

		card.classList.remove('selected', 'partial');
		if (sel === 0) {
		  // ingen
		} else if (sel === total) {
		  card.classList.add('selected');   // alle valgt
		} else {
		  card.classList.add('partial');    // delvis
		}

		// oppdater chip "sel/total"
		const chip = card.querySelector('.selchip');
		if (chip) chip.innerText = `${sel}/${total}`;
	  });
	},
	fillModal(fag) {
      const body = document.getElementById('fag-modal-body');
      const title = document.getElementById('fag-modal-title');
      title.textContent = fag;

      // Hent fra .fag (dette er riktig fra forrige fiks)
      const data = state.nokkelordData?.fag?.[fag] || {};
      const accId = 'acc-' + fag.replace(/\W/g, '');
      const selectedOptions = new Set([...ui.functionGroupSelect.selectedOptions].map(o => o.value));

      const accordionItemsHTML = Object.keys(data)
        .sort((a, b) => a.localeCompare(b, 'no'))
        .map(fs => {
          const safeFs = fs.replace(/\W/g, '');
          const isChecked = selectedOptions.has(fs);
          
          const kws = Object.keys(data[fs] || {});
          
          // --- ✅ FIKS: Ny tellelogikk ---
          // Vi summerer lengden på alle synonym-lister under dette nøkkelordet
          let totalSynonyms = 0;
          kws.forEach(kw => {
            const syns = Array.isArray(data[fs]?.[kw]) ? data[fs][kw] : [];
            totalSynonyms += syns.length;
          });
          // kwCount er nå det totalet du ønsket (f.eks. 17)
          const kwCount = totalSynonyms; 
          // --- Slutt på fiks ---

          const keywordsHTML = kws.map(kw => {
            const syns = Array.isArray(data[fs]?.[kw]) ? data[fs][kw] : [];
            const synBadges = syns.map(s => `<span class="badge bg-light text-dark me-1">${s}</span>`).join('');
            return `<li class="mb-2">
                      <div class="fw-semibold"><i class="bi bi-hash text-muted"></i> ${kw}</div>
                      ${syns.length ? `<div class="mt-1">${synBadges}</div>` : ''}
                    </li>`;
          }).join('');
          
          return `
            <div class="accordion-item">
              <h2 class="accordion-header">
                <div class="accordion-button collapsed py-2 d-flex align-items-center justify-content-between" data-bs-toggle="collapse" data-bs-target="#${accId}-${safeFs}">
                  <div class="d-flex align-items-center gap-2">
                    <input class="form-check-input" type="checkbox" data-fs="${fs}" ${isChecked ? 'checked' : ''}>
                    <span>${fs}</span>
                    <span class="badge bg-secondary" title="Antall nøkkelord/synonymer i samlingen">${kwCount}</span>
                  </div>
                  <i class="bi bi-chevron-down ms-2"></i>
                </div>
              </h2>
              <div id="${accId}-${safeFs}" class="accordion-collapse collapse" data-bs-parent="#${accId}">
                <div class="accordion-body py-2">
                  <ul class="list-unstyled mb-0">${keywordsHTML}</ul>
                </div>
              </div>
            </div>`;
        }).join('');

      body.innerHTML = accordionItemsHTML || '<p>Ingen funksjonssamlinger funnet for dette faget.</p>';
    }
  };

  /* ==========  MAIN APP  ========== */
  const App = {
    init() {
      KeywordEditor.init();
      ReviewUI.init();
      if (ui.startBtn) ui.startBtn.addEventListener('click', () => this.startScan());
      ui.modeRadios.forEach(r => r.addEventListener('change', () => this.updateMode()));

      this.updateMode();

      // Last nøkkelord → bygg kort → bind kortlogikk
      this.loadFunctionGroups().then(() => {
        this.ensureCards();
        Cards.init();
        Cards.renderSelectedState();
      });

      // Sett AI-status umiddelbart (kan kobles til reell sjekk senere)
      if (ui.aiStatusPill) ui.aiStatusPill.textContent = 'Klar';
    },

    updateMode() {
      // Vis AI-panelet for alle moduser som involverer AI
      const mode = [...ui.modeRadios].find(r => r.checked)?.value || 'keywords_ai';
      const showAI = mode !== 'keywords';
      if (ui.aiWrapper) ui.aiWrapper.style.display = showAI ? '' : 'none';
    },

	async loadFunctionGroups() {
      if (!ui.functionGroupSelect) return;
      try {
        const data = await API.loadKeywords(); // data = {"fag": {...}}
        state.nokkelordData = structuredClone(data);
        
        // VIKTIG: Hent ut .fag-objektet
        const fagData = (data && data.fag) ? data.fag : {};

        if (!fagData || !Object.keys(fagData).length) {
          console.warn('Nøkkelorddata (data.fag) er tomt – sjekk nokkelord.json på server.');
        }

        ui.functionGroupSelect.innerHTML = '';
        // Loop over fagData (data.fag)
        for (const fag of Object.keys(fagData).sort((a,b)=>a.localeCompare(b,'no'))) {
          const og = Utils.el('optgroup', { label: fag });
          // Loop over fagData[fag].funksjoner
          const funksjoner = (fagData[fag]) ? fagData[fag] : {};
          for (const fs of Object.keys(funksjoner).sort((a,b)=>a.localeCompare(b,'no')))
            og.appendChild(Utils.el('option', { value: fs }, fs));
          ui.functionGroupSelect.appendChild(og);
        }
      } catch (e) {
        console.error('Feil ved lasting av nøkkelord:', e);
        ui.functionGroupSelect.innerHTML = '<option disabled>Feil ved lasting</option>';
      }
    },

	ensureCards() {
      if (!ui.fagGrid || !state.nokkelordData || !state.nokkelordData.fag) return; // Sjekk .fag
      if (ui.fagGrid.querySelector('.fag-card')) return;

      const frag = document.createDocumentFragment();
      const fagData = state.nokkelordData.fag; // Bruk .fag

      Object.keys(fagData).sort((a, b) => a.localeCompare(b, 'no')).forEach(fag => {
        // ✅ FIKS: Henter nå funksjoner direkte fra fagData[fag]
        const funksjoner = (fagData[fag]) ? fagData[fag] : {};
        const countFs = Object.keys(funksjoner).length; // Total antall funksjoner for dette faget
        const fagKey = Utils.slugFag(fag);
        
        const card = Utils.el('div', { className: 'col-12 col-sm-6 col-lg-4 mb-3' }, // Bruker mb-3 for litt luft
          Utils.el('div', { className: 'p-3 fag-card', dataset: { fag: fagKey, fagkey: fag }, title: fag }, // Bruker fagkey (originalt fagnavn)
			Utils.el('div', { className: 'd-flex justify-content-between align-items-center' },
			  Utils.el('h5', { className: 'mb-1' }, fag),
			  Utils.el('div', {},
                // --- ✅ FJERNET: Den grå telleren ('totalcount') er borte ---
				// Utils.el('span', { className: 'badge bg-secondary me-1 totalcount', innerText: String(countFs) }),
                
                // --- ✅ FIKS: Den blå telleren viser nå "0 / Total" i starten ---
				Utils.el('span', { className: 'badge bg-primary selchip', innerText: '0/' + String(countFs) })
			  )
			),
			// Endret teksten litt for klarhet
			Utils.el('small', { className: 'text-muted sub' }, 'Klikk for å velge/endre funksjoner') 
		  )
		);
        frag.appendChild(card);
      });
      ui.fagGrid.appendChild(frag);
    },

    async startScan() {
      // 1) Valider input
      const files = ui.files.files;
      const minScoreRaw = ui.minScore.value.trim();
      const mode = [...ui.modeRadios].find(r => r.checked)?.value || 'keywords_ai';
      const groups = Array.from(ui.functionGroupSelect.selectedOptions).map(o => o.value);
	  syncSelectedGroupsToHiddenFields(groups);
      const score = Number(minScoreRaw);

      if ((mode === 'keywords' || mode === 'keywords_ai') && groups.length === 0) {
        return alert('❗ Du må velge minst én funksjonssamling for denne modusen.');
      }
      if (files.length === 0) return alert('❗ Du må velge minst én fil å analysere.');
      if (!minScoreRaw || isNaN(score) || score < 0 || score > 100) {
        return alert('❗ Angi en gyldig treffprosent mellom 0 og 100.');
      }

      // 2) UI: pågår
      ui.startBtn.disabled = true;
      ui.startBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Pågår...';
      Utils.show(ui.statusBox);
      ui.progress.style.width = '0%';
      ui.progress.classList.add('progress-bar-animated');
      ui.progress.classList.remove('bg-success', 'bg-danger');
      ui.statusText.innerText = 'Forbereder...';
      this.startMagnifierAnimation();

      // 3) Send form
      try {
        const formEl = document.getElementById('kravsporingForm');
        const fd = new FormData(formEl);

        // Sikre *alle* navn-varianter:
        fd.delete('selected_function_groups');
        fd.delete('selected_function_groups[]');
        groups.forEach(g => {
          fd.append('selected_function_groups', g);
          fd.append('selected_function_groups[]', g);
        });

        // Legg inn mode eksplisitt (i tilfelle backend baserer logikk på dette)
        fd.set('mode', mode);

        // DEBUG – se nøyaktig hva som sendes:
        try {
          console.debug('FormData ->', [...fd.entries()]);
        } catch {}

        const r = await API.startScan(fd);
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: 'Ukjent serverfeil' }));
          throw new Error(err.error || `Serverfeil ${r.status}`);
        }
        const j = await r.json();
        if (!j.job_id) throw new Error('Mottok ikke en gyldig job_id fra serveren.');

        Polling.start(j.job_id, 'analyze');
      } catch (e) {
        this.stopMagnifierAnimation();
        ui.startBtn.disabled = false;
        ui.startBtn.innerHTML = '<i class="bi bi-play"></i> Kjør kravsporing';
        ui.statusText.innerText = 'Feil: ' + e.message;
        ui.progress.classList.remove('progress-bar-animated');
        ui.progress.classList.add('bg-danger');
      }
    },

    startMagnifierAnimation() {
      const el = ui.magnifier;
      if (!el) return;
      el.hidden = false;
      el.style.display = 'inline';
      el.style.opacity = '1';
      el.style.transform = 'rotate(0deg)';
      el.style.transition = 'transform 0.05s linear';
      clearInterval(state.timers.anim);
      clearInterval(state.timers.msg);
      let angle = 0;
      state.timers.anim = setInterval(() => {
        angle = (angle + 5) % 360;
        el.style.transform = `rotate(${angle}deg)`;
      }, 50);
      const msgs = ['Skanner dokumenter...', 'Analyserer innhold...', 'Identifiserer krav...'];
      let i = 0;
      state.timers.msg = setInterval(() => {
        if (ui.textEl) ui.textEl.innerText = msgs[i++ % msgs.length];
      }, 1200);
    },

    stopMagnifierAnimation() {
      const el = ui.magnifier;
      clearInterval(state.timers.anim);
      clearInterval(state.timers.msg);
      if (el) {
        el.style.transform = 'rotate(0deg)';
        el.style.transition = '';
        el.style.opacity = '1';
        el.hidden = false;
        el.style.display = 'inline';
      }
      if (ui.textEl) ui.textEl.innerText = ' Kravsporing';
    }
  };

/* ==========  BOOT  ========== */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  console.debug('KS BASE =', API.BASE, 'scan url =', API._url('/scan'));
});

/* ==========  EXPORT  ========== */
window.KS = { state, API, Utils, KeywordEditor, ReviewUI, Polling, App, Cards };
})();