// static/js/calendar/calendar-init.js
(function () {
  // ------------------ Utils ------------------
  function onReady(fn) {
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();
  }

  function normalizeEvent(raw) {
    if (!raw) return null;
    if (raw.title && raw.start) return raw;

    const id =
      raw.id ||
      raw._id ||
      raw.event_id ||
      raw.order_number ||
      String(Math.random());
    const title = raw.title || raw.name || raw.order_number || "Oppgave";
    const start = raw.start || raw.start_iso || raw.startDate || raw.start_date;
    const end = raw.end || raw.end_iso || raw.endDate || raw.end_date;
    if (!start) return null;

    const ev = { id, title, start };
    if (end) ev.end = end;
    if (raw.allDay != null) ev.allDay = !!raw.allDay;
    if (raw.color) ev.color = raw.color;

    ev.extendedProps = Object.assign({}, raw.extendedProps || {}, {
      status: raw.status,
      order_number: raw.order_number,
      fag: raw.fag,
      lokasjon: raw.lokasjon || raw.location,
      plassering: raw.plassering,
      kommentar: raw.kommentar,
      tekniker: raw.technician || raw.tekniker,
      tekniker_fornavn: raw.tekniker_fornavn,
      tekniker_navn: raw.tekniker_navn
    });
    return ev;
  }

  async function fetchEvents(params) {
    try {
      window.appLog?.log(
        `Henter oppgaver ${params?.start || ""} → ${params?.end || ""}`,
        "info"
      );
    } catch (_) {}

    if (window.apiServices?.getOppgaver) {
      try {
        const raw = await window.apiServices.getOppgaver(params);
        const arr = Array.isArray(raw) ? raw : raw?.items || raw?.data || [];
        const out = arr.map(normalizeEvent).filter(Boolean);
        window.appLog?.log(`Hentet ${out.length} oppgaver`, "success");
        return out;
      } catch (e) {
        window.appLog?.log(`Feil ved henting (apiServices): ${e.message}`, "error");
        window.showToast?.("Kunne ikke hente oppgaver", "error");
        throw e;
      }
    }

    // Fallback til /kalender/data
    try {
      const u = new URL(
        (window.APP_BASE_URL || "") + "/kalender/data",
        window.location.origin
      );
      if (params?.lokasjon) u.searchParams.set("lokasjon", params.lokasjon);
      if (params?.fag) u.searchParams.set("fag", params.fag);
      if (params?.start) u.searchParams.set("start", params.start);
      if (params?.end) u.searchParams.set("end", params.end);

      const res = await fetch(u.toString(), { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data?.items || data?.data || [];
      const out = arr.map(normalizeEvent).filter(Boolean);
      window.appLog?.log(`Hentet ${out.length} oppgaver`, "success");
      return out;
    } catch (e) {
      window.appLog?.log(`Feil ved henting (/kalender/data): ${e.message}`, "error");
      window.showToast?.("Kunne ikke hente oppgaver", "error");
      throw e;
    }
  }

  // Fjern evt. eldre Bootstrap-tooltips (bakoverkomp)
  function cleanupLegacyTooltips() {
    try {
      document
        .querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach((el) => {
          const inst = window.bootstrap?.Tooltip?.getInstance(el);
          if (inst) inst.dispose();
          el.removeAttribute("data-bs-toggle");
          el.removeAttribute("title");
        });
      document.querySelectorAll(".tooltip").forEach((el) => el.remove());
    } catch (_) {}
  }

  // --- ROBUST helgebredde (lør/søn = 50% av ukedagsbredde) ---
  function applyWeekendWidthsOnce(rootEl){
    // Finn header/body-tabeller
    const headerTable = rootEl.querySelector('.fc-col-header .fc-scrollgrid-sync-table');
    const bodyTable   = rootEl.querySelector('.fc-daygrid-body .fc-scrollgrid-sync-table');
    if(!headerTable || !bodyTable) return false;

    // colgroups (kan mangle i noen temaer)
    const headerColgroup = headerTable.querySelector('colgroup');
    const bodyColgroup   = bodyTable.querySelector('colgroup');

    // Finn første uke-rad for å beregne offset (ukenummer-kolonne)
    const firstWeekRow = rootEl.querySelector('.fc-daygrid-body tr');
    if(!firstWeekRow) return false;

    const tds = Array.from(firstWeekRow.children);
    const hasWeekNum = tds.length === 8 || tds.some(td => td.classList.contains('fc-week-number'));
    const offset = hasWeekNum ? 1 : 0;

    // Vekter: ukedag = 1, helg = 0.5
    const pctUnit      = 100 / (5*1 + 2*0.5); // 100/6
    const widthWeekday = (pctUnit * 1)   + '%';   // ~16.6667%
    const widthWeekend = (pctUnit * 0.5) + '%';   // ~8.3333%
    const isWeekendIdx = (i) => (i === 5 || i === 6); // mon=0..sun=6 (firstDay=1)

    // 1) colgroup – mest stabilt
    function ensureCols(colgroup, count){
      if(!colgroup) return null;
      let cols = colgroup.querySelectorAll('col');
      if(cols.length < count){
        while(colgroup.children.length < count){
          colgroup.appendChild(document.createElement('col'));
        }
        cols = colgroup.querySelectorAll('col');
      }
      return Array.from(cols);
    }
    const headerCols = ensureCols(headerColgroup, 7 + offset);
    const bodyCols   = ensureCols(bodyColgroup,   7 + offset);

    function setColWidth(cols, dayIdx, w){
      const col = cols?.[dayIdx + offset];
      if(col) col.style.width = w;
    }
    for(let i=0;i<7;i++){
      const w = isWeekendIdx(i) ? widthWeekend : widthWeekday;
      setColWidth(headerCols, i, w);
      setColWidth(bodyCols,   i, w);
    }

    // 2) fallback – sett bredde direkte på TH/TD hvis colgroup ignoreres
    const headerCells = Array.from(rootEl.querySelectorAll('.fc-col-header th')).filter(th => th.hasAttribute('data-date'));
    headerCells.forEach((th, i) => th.style.width = isWeekendIdx(i) ? widthWeekend : widthWeekday);

    const weekRows = rootEl.querySelectorAll('.fc-daygrid-body tr');
    weekRows.forEach((tr)=>{
      const cells = Array.from(tr.children).slice(offset);
      for(let i=0;i<7 && i<cells.length;i++){
        cells[i].style.width = isWeekendIdx(i) ? widthWeekend : widthWeekday;
      }
    });

    return true;
  }

  function setWeekendColumnWidths(rootEl){
    // Prøv nå og et par frames til (FC gjør målinger etter render)
    let attempts = 0;
    function tryApply(){
      attempts++;
      const ok = applyWeekendWidthsOnce(rootEl);
      if(!ok && attempts < 5){
        requestAnimationFrame(tryApply);
      }
    }
    tryApply();
  }

  function observeWeekendWidths(rootEl){
    const target = rootEl.querySelector('.fc-view-harness');
    if(!target) return;
    const mo = new MutationObserver(()=> setWeekendColumnWidths(rootEl));
    mo.observe(target, { childList:true, subtree:true });
    rootEl._weekendObserver = mo;
  }

  // ------------------ Main ------------------
  onReady(async () => {
    if (!window.FullCalendar?.Calendar) {
      console.error("FullCalendar ikke funnet.");
      return;
    }

    const filterLok = document.getElementById("filterLokasjon");
    const filterFag = document.getElementById("filterFag");
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) {
      console.warn("Fant ikke #calendar.");
      return;
    }

    // Helligdager
    const holidayMap = {};
    if (window.apiServices?.getHelligdager) {
      try {
        const hds = await window.apiServices.getHelligdager();
        (hds || []).forEach((h) => {
          const d = new Date(h.start);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(d.getDate()).padStart(2, "0")}`;
          holidayMap[iso] = h.title;
        });
      } catch (e) {
        console.error("Helligdager feilet:", e);
        window.appLog?.log("Klarte ikke å hente helligdager", "error");
      }
    }

    // ---- Kalender ----
    const calendar = new FullCalendar.Calendar(calendarEl, {
      timeZone: "local",
      height: "auto",
      contentHeight: "auto",
      expandRows: true,
      firstDay: 1,
      locale: "nb",
		
	  weekends: false,
      weekNumbers: true,
      weekNumberCalculation: "ISO",
      weekNumberContent(arg) {
        return { html: `Uke&nbsp;${arg.num}` };
      },

      dayHeaderFormat: { weekday: "short" },
      titleFormat: { year: "numeric", month: "long" },

      editable: true,
      eventResizableFromStart: true,
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "16:00" },

      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      buttonText: { today: "I dag", month: "Måned", week: "Uke", day: "Dag" },
      slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
      eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
      initialView: "dayGridMonth",
      eventDisplay: "block",

      // Helligdager/helger i celler
      dayCellDidMount(info) {
        const d = info.date;
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
        if (holidayMap[iso]) {
          info.el.style.background = "#fff0f0";
          info.el.insertAdjacentHTML(
            "beforeend",
            `<div style="position:absolute;top:2px;left:2px;font-size:0.7rem;color:#a00;font-weight:500;">${holidayMap[iso]}</div>`
          );
        } else if ([0, 6].includes(d.getDay())) {
          // Helgedag – marker med klasse, styres i CSS for “ligger bak”-effekt
          info.el.classList.add("fc-weekend");
        }
      },

      // Kompakt event tittel med status-ikon
      eventContent(arg) {
        const status = arg.event.extendedProps?.status;
        let iconHtml = "";
        if (status === "utført")
          iconHtml = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
        else if (status === "kansellert")
          iconHtml = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';

        const titleEl = document.createElement("div");
        titleEl.classList.add("fc-event-title", "fc-sticky");
        titleEl.innerHTML = iconHtml + (arg.event.title || "");
        return { domNodes: [titleEl] };
      },

      // Lett hover-preview – viser NAVN, ikke epost
      eventMouseEnter(info) {
        const t = document.createElement("div");
        t.className = "fc-tooltip";
        const x = info.event.extendedProps || {};
        const lines = [];
        if (info.event.title) lines.push(`<strong>${escapeHtml(info.event.title)}</strong>`);
        if (x.lokasjon) lines.push(`📍 ${escapeHtml(x.lokasjon)}`);
        const navn = x.tekniker_fornavn || x.tekniker_navn || "";
        const visNavn = navn || (x.tekniker ? x.tekniker.split("@")[0] : "");
        if (visNavn) lines.push(`👤 ${escapeHtml(visNavn)}`);
        if (x.status) lines.push(`🏷️ ${escapeHtml(x.status)}`);
        if (x.plassering) lines.push(`🧭 ${escapeHtml(x.plassering)}`);
        t.innerHTML = lines.join("<br>");

        document.body.appendChild(t);
        info.el._tt = t;

        const move = (e) => {
          t.style.top = e.pageY + 12 + "px";
          t.style.left = e.pageX + 12 + "px";
        };
        info.el._ttMove = move;
        document.addEventListener("mousemove", move, { passive: true });
      },

      eventMouseLeave(info) {
        const t = info.el._tt;
        if (t && t.parentNode) t.parentNode.removeChild(t);
        if (info.el._ttMove) document.removeEventListener("mousemove", info.el._ttMove);
        delete info.el._tt;
        delete info.el._ttMove;
      },

      // Klikk -> åpne modal
      eventClick(info) {
        info.jsEvent.preventDefault();
        if (window.modalHandlers?.open) window.modalHandlers.open(info.event);
      },

      // Drag/resize -> lagre tider
      eventDrop: handleEventUpdate,
      eventResize: handleEventUpdate,

      // Hent events kun for synlig range (ytelse/robusthet)
      events(fetchInfo, success, failure) {
        const params = {
          lokasjon: (document.getElementById("filterLokasjon")?.value || "").trim(),
          fag: (document.getElementById("filterFag")?.value || "").trim(),
          start: fetchInfo.startStr,
          end: fetchInfo.endStr,
        };

        fetchEvents(params)
          .then((events) => {
            success(events);
            showZeroBanner(events.length === 0);
          })
          .catch((err) => {
            console.error("Henting oppgaver feilet:", err);
            failure(err);
            showZeroBanner(true);
          });

        function showZeroBanner(show) {
          let el = document.getElementById("cal-empty-hint");
          if (!el) {
            el = document.createElement("div");
            el.id = "cal-empty-hint";
            el.className = "alert alert-warning mt-2";
            el.style.display = "none";
            el.textContent = "Ingen aktiviteter i valgt periode/filtre.";
            (document.getElementById("calendar")?.parentElement || document.body).prepend(el);
          }
          el.style.display = show ? "" : "none";
        }
      },

      // Når visningen/range endres, sett kolonnebredder på nytt
      datesSet()    { setTimeout(() => setWeekendColumnWidths(calendarEl), 0); },
      viewDidMount(){ setTimeout(() => setWeekendColumnWidths(calendarEl), 0); }
    });

    // Render kalender
    cleanupLegacyTooltips();
    calendar.render();

    // Sett helgebredder første gang + reaktiver ved videre DOM-endringer
    setWeekendColumnWidths(calendarEl);
    observeWeekendWidths(calendarEl);

    // Oppdater ved resize
    window.addEventListener('resize', () => setWeekendColumnWidths(calendarEl));

    // Gjør kalender globalt tilgjengelig ved behov
    window.calendar = calendar;

    // Hjelpere (eksisterende)
    if (typeof window.initICSExport === "function") window.initICSExport(calendar);
    if (typeof window.modalHandlers?.init === "function") window.modalHandlers.init(calendar);

    // Re-fetch ved filterendring
    if (filterLok) filterLok.addEventListener("change", () => calendar.refetchEvents());
    if (filterFag) filterFag.addEventListener("change", () => calendar.refetchEvents());

    // ------------------ Lokale funksjoner ------------------
    function handleEventUpdate(info) {
      const event = info.event;

      try {
        // konverter tider
        const startIso = event.startStr || (event.start ? event.start.toISOString() : null);
        let endIso = event.endStr || (event.end ? event.end.toISOString() : null);

        if (event.allDay && event.end) {
          const e = new Date(event.end);
          e.setDate(e.getDate() - 1);
          endIso = e.toISOString();
        }
        const startDate = startIso ? startIso.split("T")[0] : null;
        const startTime = startIso && startIso.includes("T") ? startIso.split("T")[1].substring(0, 5) : "00:00";
        const endDate = endIso ? endIso.split("T")[0] : startDate;
        const endTime = endIso && endIso.includes("T") ? endIso.split("T")[1].substring(0, 5) : "00:00";

        if (!startDate) {
          info.revert();
          return;
        }

        const saver = window.apiServices?.updateTaskDates;
        if (typeof saver !== "function") {
          window.appLog?.log("Oppdatering av tid feilet: mangler updateTaskDates()", "error");
          window.showToast?.("Kan ikke lagre – mangler backend-funksjon", "error");
          info.revert();
          return;
        }

        saver(event.id, { start: `${startDate}T${startTime}`, end: `${endDate}T${endTime}` })
          .then(() => {
            window.appLog?.log(`Oppgave oppdatert: ${event.title || event.id}`, "success");
            calendar.refetchEvents();
          })
          .catch((e) => {
            console.error(e);
            window.appLog?.log(`Lagringsfeil ved flytting/resize: ${e.message}`, "error");
            window.showToast?.("Kunne ikke lagre endring. Ruller tilbake.", "error");
            info.revert();
          });
      } catch (e) {
        console.error(e);
        window.appLog?.log(`Uventet feil ved oppdatering: ${e.message}`, "error");
        window.showToast?.("Noe gikk galt. Ruller tilbake.", "error");
        info.revert();
      }
    }

    // trygg HTML-escape for tooltip
    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
  });
})();
