// static/js/calendar/modal-handlers.js
// Global, ikke-ESM. Eksporterer window.modalHandlers.{open,init}

(function () {
  let modal, modalEl, calendarRef;

  // ---- DOM ----
  let fldTaskId, fldTitle, fldOrder, fldLokasjon, fldPlassering;
  let fldStartDato, fldStartTid, fldEndDato, fldEndTid;
  let fldTekniker, fldPLKommentar, fldTekKommentar, btnSave;
  let fpStart, fpEnd;

  // ---------------- utils ----------------
  const isStr = (v) => typeof v === "string";
  const isObj = (v) => v && typeof v === "object";
  const clamp = (v) => (v == null ? "" : String(v));
  const trim = (v) => clamp(v).trim();

  function trimJoin(...parts) {
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  // Finn én tekniker fra window.alleTeknikere
  function findTechnician(predicate) {
    const list = Array.isArray(window.alleTeknikere) ? window.alleTeknikere : [];
    for (const t of list) {
      if (predicate(t)) return t;
    }
    return null;
  }

  function techLabel(t) {
    if (isStr(t)) {
      const m = t.match(/^(.*?)\s*<([^>]+)>$/);
      if (m) return m[1].trim() || m[2].trim();
      return t.trim();
    }
    if (isObj(t)) {
      return (
        t.full_name ||
        t.display_name ||
        trimJoin(t.first_name || t.fornavn, t.last_name || t.etternavn) ||
        t.name ||
        t.email ||
        t.epost ||
        t.mail ||
        ""
      );
    }
    return "";
  }

  function techEmail(t) {
    if (isStr(t)) {
      const m = t.match(/<([^>]+)>$/);
      if (m) return m[1].trim();
      return t.includes("@") ? t.trim() : "";
    }
    if (isObj(t)) {
      return (t.email || t.epost || t.mail || "").trim();
    }
    return "";
  }

  function initTimePicker(input) {
    if (!input || typeof window.flatpickr !== "function") return null;
    if (input._flatpickr) return input._flatpickr;
    return window.flatpickr(input, {
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      time_24hr: true,
      minuteIncrement: 5,
      disableMobile: true,
      locale: window.flatpickr?.l10ns?.no || "no"
    });
  }

  function applyTimeValue(input, picker, value) {
    if (picker) {
      if (value) picker.setDate(value, true, "H:i");
      else picker.clear();
    }
    if (input) input.value = value || "";
  }

  // Konsistent farge for tekniker: bruk t.color hvis finnes, ellers hash e-post til HSL
  function colorForTechnician(t) {
    if (t && isObj(t) && t.color) return t.color;
    const email = techEmail(t) || (isStr(t) ? t : "");
    if (!email) return null;

    // enkel hash -> hue
    let h = 0;
    for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    // dempet pastel
    return `hsl(${hue} 65% 70%)`;
  }

  function zuluToLocalParts(dt) {
    if (!dt) return { d: "", t: "" };
    const d = new Date(dt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return { d: `${yyyy}-${mm}-${dd}`, t: `${hh}:${mi}` };
  }

  function localPartsToISO(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = timeStr || "00:00";
    // Viktig: tolkes i lokal tid (lesbar for bruker), sendes som ISO UTC
    const local = new Date(`${dateStr}T${t}`);
    return isNaN(local.getTime()) ? null : local.toISOString();
  }

  function parseLocal(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = timeStr || "00:00";
    const local = new Date(`${dateStr}T${t}`);
    return isNaN(local.getTime()) ? null : local;
  }

  // ---------------- tekniker <select> ----------------
  let optionsBuilt = false;

  function buildTechOptions() {
    if (!fldTekniker || optionsBuilt) return;

    fldTekniker.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "";
    fldTekniker.appendChild(opt0);

    const list = Array.isArray(window.alleTeknikere) ? window.alleTeknikere : [];
    for (const t of list) {
      const label = techLabel(t);
      const value = techEmail(t);
      if (!label) continue;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      opt.dataset.name = label;
      fldTekniker.appendChild(opt);
    }
    optionsBuilt = true;
  }

  // ---------------- modal <-> event ----------------
  function fillFromEvent(ev) {
    const ep = ev.extendedProps || {};
    fldTaskId.value = ev.id || "";
    fldTitle.value = ev.title || "";
    fldOrder.value = ep.order_number || "";
    fldLokasjon.value = ep.lokasjon || ep.location || "";
    fldPlassering.value = ep.plassering || "";

    const { d: sd, t: st } = zuluToLocalParts(ev.start);
    const { d: ed, t: et } = zuluToLocalParts(ev.end || ev.start);
    fldStartDato.value = sd;
    fldEndDato.value = ed;
    applyTimeValue(fldStartTid, fpStart, st);
    applyTimeValue(fldEndTid, fpEnd, et);

    buildTechOptions();

    // Preselect: e-post først, ellers visningsnavn
    const email = ep.tekniker || ep.technician || "";
    let selected = false;
    if (email) {
      const byMail = Array.from(fldTekniker.options).find(o => o.value.toLowerCase() === email.toLowerCase());
      if (byMail) { fldTekniker.value = byMail.value; selected = true; }
    }
    if (!selected) {
      const display = ep.tekniker_fornavn || ep.tekniker_navn || ep.technician_name || "";
      if (display) {
        const byName = Array.from(fldTekniker.options).find(o => (o.dataset.name || "").toLowerCase() === display.toLowerCase());
        if (byName) fldTekniker.value = byName.value;
      } else {
        fldTekniker.value = "";
      }
    }

    fldPLKommentar.value = ep.kommentar || "";
    fldTekKommentar.value = ep.kommentar_tekniker || "";
  }

  function readToPayload() {
    const opt = fldTekniker.options[fldTekniker.selectedIndex];
    const teknikerEmail = trim(fldTekniker.value || "");
    const teknikerNavn  = trim(opt?.dataset?.name || "");

    const startISO = localPartsToISO(trim(fldStartDato.value), trim(fldStartTid.value));
    const endISO   = localPartsToISO(trim(fldEndDato.value),   trim(fldEndTid.value));

    return {
      id: trim(fldTaskId.value),
      title: trim(fldTitle.value),
      order_number: trim(fldOrder.value),
      lokasjon: trim(fldLokasjon.value),
      plassering: trim(fldPlassering.value),
      start: startISO,
      end:   endISO,
      tekniker: teknikerEmail,
      tekniker_navn: teknikerNavn,
      kommentar: trim(fldPLKommentar.value),
      kommentar_tekniker: trim(fldTekKommentar.value)
    };
  }

  // Valider at slutt >= start (når begge finnes)
  function validateDatesOrToast(p) {
    const s = parseLocal(trim(fldStartDato.value), trim(fldStartTid.value));
    const e = parseLocal(trim(fldEndDato.value),   trim(fldEndTid.value));
    if (s && e && e.getTime() < s.getTime()) {
      window.showToast?.("Sluttid kan ikke være før starttid.", "error");
      return false;
    }
    return true;
  }

  // Bruk ny tekniker til å style eventen og oppdatere props
  function applyEventStyling(ev, teknikerEmail, teknikerNavn) {
    const tech = teknikerEmail
      ? findTechnician((t) => techEmail(t).toLowerCase() === teknikerEmail.toLowerCase())
      : null;

    const color = colorForTechnician(tech);
    if (color) {
      ev.setProp("backgroundColor", color);
      ev.setProp("borderColor", color);
    }

    ev.setExtendedProp("tekniker", teknikerEmail || "");
    ev.setExtendedProp("tekniker_fornavn", teknikerNavn || techLabel(tech) || "");

    // FullCalendar egen tooltip (fra calendar-init) re-render
    if (calendarRef) calendarRef.rerenderEvents();
  }

  // Lag et snapshot for mulig rollback
  function snapshotEvent(ev) {
    return {
      title: ev.title,
      start: ev.start ? new Date(ev.start.getTime()) : null,
      end: ev.end ? new Date(ev.end.getTime()) : null,
      ext: Object.assign({}, ev.extendedProps || {}),
      bg: ev.backgroundColor,
      bc: ev.borderColor
    };
  }
  function rollbackEvent(ev, snap) {
    try {
      ev.setProp("title", snap.title);
      if (snap.start) ev.setStart(snap.start);
      if (snap.end) ev.setEnd(snap.end); else ev.setEnd(null);
      // restore ext props
      for (const k of Object.keys(ev.extendedProps || {})) ev.setExtendedProp(k, undefined);
      for (const [k, v] of Object.entries(snap.ext || {})) ev.setExtendedProp(k, v);
      if (snap.bg) ev.setProp("backgroundColor", snap.bg);
      if (snap.bc) ev.setProp("borderColor", snap.bc);
      calendarRef?.rerenderEvents();
    } catch (_) {}
  }

  async function saveChanges(ev) {
    const p = readToPayload();
    if (!validateDatesOrToast(p)) return;

    // Optimistisk oppdatering + snapshot for rollback
    const snap = snapshotEvent(ev);

    // Lokal oppdatering (snappy UI)
    if (p.title) ev.setProp("title", p.title);
    if (p.start) ev.setStart(p.start);
    if (p.end)   ev.setEnd(p.end);
    ev.setExtendedProp("order_number", p.order_number);
    ev.setExtendedProp("lokasjon", p.lokasjon);
    ev.setExtendedProp("plassering", p.plassering);
    ev.setExtendedProp("kommentar", p.kommentar);
    ev.setExtendedProp("kommentar_tekniker", p.kommentar_tekniker);

    // Viktig: oppdater tekniker + farge
    applyEventStyling(ev, p.tekniker, p.tekniker_navn);

    // Disable lagre-knapp under save
    const prevDisabled = !!btnSave?.disabled;
    if (btnSave) btnSave.disabled = true;

    window.appLog?.log(`Lagrer oppgave: ${p.title || p.id}`, "info");

    // Lagre til backend
    try {
      if (window.apiServices?.updateTask) {
        await window.apiServices.updateTask(ev.id, p);
      } else if (window.apiServices?.updateTaskTechnician) {
        await window.apiServices.updateTaskTechnician(ev.id, {
          tekniker: p.tekniker,
          tekniker_navn: p.tekniker_navn
        });
        // Om vi kun oppdaterte tekniker, vurder å sende resten i et annet kall hos deg.
      } else {
        // Ingen tilgjengelig lagringsfunksjon – rull tilbake
        throw new Error("Mangler backend-funksjon for lagring");
      }

      window.showToast?.("Endringer lagret", "success");
      window.appLog?.log("Endringer lagret", "success");

      // Hent friskeste data fra server slik at lokalt = server
      calendarRef?.refetchEvents();
    } catch (err) {
      console.error("[modal] lagring feilet:", err);
      window.showToast?.("Kunne ikke lagre endringer. Ruller tilbake.", "error");
      window.appLog?.log(`Lagringsfeil: ${err.message}`, "error");
      // Rollback
      rollbackEvent(ev, snap);
    } finally {
      if (btnSave) btnSave.disabled = prevDisabled;
    }
  }

  // ---------------- public API ----------------
  function open(eventObj) {
    ensureRefs();
    if (!modal) return;
    fillFromEvent(eventObj);
    try { modal.show(); } catch (_) {}

    if (btnSave) {
      btnSave.onclick = async (e) => {
        e?.preventDefault?.();
        await saveChanges(eventObj);
        try { modal.hide(); } catch (_) {}
      };
    }
  }

  function init(calendarInstance) {
    calendarRef = calendarInstance || null;
    ensureRefs();
  }

  function ensureRefs() {
    if (modalEl) return;

    modalEl = document.getElementById("oppgaveModal");
    if (!modalEl) return;
    try { modal = new bootstrap.Modal(modalEl, { backdrop: "static" }); } catch (_) {}

    fldTaskId = document.getElementById("modalTaskId");
    fldTitle  = document.getElementById("modalTitle");
    fldOrder  = document.getElementById("modalOrderNumber");
    fldLokasjon = document.getElementById("modalLokasjon");
    fldPlassering = document.getElementById("modalPlassering");
    fldStartDato = document.getElementById("modalStartDato");
    fldStartTid  = document.getElementById("modalStartTid");
    fldEndDato   = document.getElementById("modalEndDato");
    fldEndTid    = document.getElementById("modalEndTid");
    fldTekniker  = document.getElementById("modalTekniker");
    fldPLKommentar = document.getElementById("modalKommentarProsjektleder");
    fldTekKommentar = document.getElementById("modalKommentarTekniker");
    btnSave = document.getElementById("btnLagreAlle");

    if (!fpStart) fpStart = initTimePicker(fldStartTid);
    if (!fpEnd)   fpEnd   = initTimePicker(fldEndTid);

    buildTechOptions();
  }

  window.modalHandlers = { open, init };
})();
