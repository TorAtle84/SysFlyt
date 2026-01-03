// static/js/calendar/modal-handlers.js
// Global, ikke-ESM. Eksporterer window.modalHandlers.{open,init}

(function () {
  let modal, modalEl, calendarRef;

  // ---- DOM ----
  let fldTaskId, fldTitle, fldOrder, fldLokasjon, fldPlassering;
  let fldStartDato, fldStartTid, fldEndDato, fldEndTid;
  let fldTekniker, fldPLKommentar, fldTekKommentar, btnSave;

  // ---------------- utils ----------------
  const isStr = (v) => typeof v === "string";
  const isObj = (v) => v && typeof v === "object";

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
    return new Date(`${dateStr}T${t}`).toISOString();
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
    fldStartDato.value = sd; fldStartTid.value = st;
    fldEndDato.value = ed;   fldEndTid.value = et;

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
    const teknikerEmail = fldTekniker.value || "";
    const teknikerNavn  = opt?.dataset?.name || "";

    return {
      id: fldTaskId.value,
      title: fldTitle.value,
      order_number: fldOrder.value,
      lokasjon: fldLokasjon.value,
      plassering: fldPlassering.value,
      start: localPartsToISO(fldStartDato.value, fldStartTid.value),
      end:   localPartsToISO(fldEndDato.value, fldEndTid.value),
      tekniker: teknikerEmail,
      tekniker_navn: teknikerNavn,
      kommentar: fldPLKommentar.value,
      kommentar_tekniker: fldTekKommentar.value
    };
  }

  // Bruk ny tekniker til å style eventen og oppdatere props
  function applyEventStyling(ev, teknikerEmail, teknikerNavn) {
    const tech = teknikerEmail
      ? findTechnician((t) => techEmail(t).toLowerCase() === teknikerEmail.toLowerCase())
      : null;

    const color = colorForTechnician(tech);
    if (color) {
      // FullCalendar leser disse on-the-fly
      ev.setProp("backgroundColor", color);
      ev.setProp("borderColor", color);
    }

    // Tooltip/innhold baserer seg på extendedProps
    ev.setExtendedProp("tekniker", teknikerEmail || "");
    ev.setExtendedProp("tekniker_fornavn", teknikerNavn || techLabel(tech) || "");

    // Tving re-render av tooltips hvis Bootstrap er i bruk
    try {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        const inst = bootstrap.Tooltip.getInstance(el);
        if (inst) inst.dispose();
      });
    } catch (_) {}
    if (calendarRef) calendarRef.rerenderEvents();
  }

  async function saveChanges(ev) {
    const p = readToPayload();

    // Lokal oppdatering først (snappy UI)
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

    // Lagre til backend hvis tilgjengelig
    try {
      if (window.apiServices?.updateTask) {
        await window.apiServices.updateTask(ev.id, p);
      } else if (window.apiServices?.updateTaskTechnician) {
        await window.apiServices.updateTaskTechnician(ev.id, {
          tekniker: p.tekniker,
          tekniker_navn: p.tekniker_navn
        });
      }
    } catch (err) {
      console.error("[modal] lagring feilet:", err);
      // valgfritt: vis toast/alert
    }
  }

  // ---------------- public API ----------------
  function open(eventObj) {
    ensureRefs();
    if (!modal) return;
    fillFromEvent(eventObj);
    modal.show();
    btnSave.onclick = async () => {
      await saveChanges(eventObj);
      modal.hide();
    };
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

    buildTechOptions();
  }

  window.modalHandlers = { open, init };
})();
