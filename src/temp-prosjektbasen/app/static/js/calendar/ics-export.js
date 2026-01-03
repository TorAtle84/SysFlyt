// static/js/calendar/ics-export.js
// Global (ikke-ESM). Setter window.initICSExport(calendar)

(function () {
  // ---- Utils ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function toZulu(dt) { return new Date(dt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
  function nowZulu() { return toZulu(new Date()); }
  function icsEscape(text) {
    if (!text) return "";
    return String(text)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }
  function monthNameNo(d) {
    const m = d.getMonth();
    const y = d.getFullYear();
    const names = ["Januar","Februar","Mars","April","Mai","Juni","Juli","August","September","Oktober","November","Desember"];
    return `${names[m]} ${y}`;
  }
  function slug(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
  function yyyymmddhhmm(value) {
    const d = (value instanceof Date) ? value : new Date(value);
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + "-" +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  // Overlappsjekk mot synlig periode (fra FullCalendar)
  function overlapsRange(ev, start, end) {
    const evStart = ev.start || new Date();
    const evEnd   = ev.end   || ev.start || evStart;
    return (evStart <= end) && (evEnd >= start);
  }

  // Pen visning av tekniker
  function getTechDisplay(ep) {
    return (
      ep.tekniker_fornavn ||
      ep.tekniker_navn ||
      ep.technician_name ||
      ep.technician ||
      ep.tekniker || // kan være e-post
      ""
    );
  }

  // Stabil nøkkel/UID for et event (unik selv med samme ordrenr)
  function eventKey(ev) {
    const ep = ev.extendedProps || {};
    const id = (ev.id != null) ? String(ev.id) : "";
    const startISO = ev.start ? new Date(ev.start).toISOString() : "";
    const endISO   = ev.end   ? new Date(ev.end).toISOString()   : "";
    const order = ep.order_number || "";
    // Tittel tas med i nøkkel for ekstra entropi
    const title = ev.title || "";
    return `${title}|${startISO}|${endISO}|${order}|${id}`;
  }

  // Bygg VEVENT (med ønsket SUMMARY og unik UID)
  function buildVEventICS(ev, currentUser) {
    const ep = ev.extendedProps || {};

    const orderNo    = ep.order_number || "";
    const title      = ev.title || "";
    const plassering = ep.plassering || ep.location || ep.lokasjon || "";

    // SUMMARY: Ordrenummer – Tittel – Plassering (utelat tomme deler)
    const summaryParts = [];
    if (orderNo)    summaryParts.push(orderNo);
    if (title)      summaryParts.push(title);
    if (plassering) summaryParts.push(plassering);
    const summary = summaryParts.join(" – ");

    const location  = plassering;
    const kommentar = ep.kommentar || "";
    const description =
      "Ordrenummer: " + (orderNo || "") +
      (kommentar ? "\\n\\nKommentar:\\n" + icsEscape(kommentar) : "\\n\\nKommentar:\\n") +
      "\\n\\nHa en strålende dag videre og lykke til på oppdraget 🙂";

    const attendeeEmail = (ep.tekniker || "").trim();
    const attendeeName  = (getTechDisplay(ep) || attendeeEmail).trim();
    const attendeeLine  = attendeeEmail
      ? `ATTENDEE;CN=${icsEscape(attendeeName)}:mailto:${attendeeEmail}`
      : "";

    const orgEmail = (currentUser && currentUser.email) || "";
    const orgName  = (currentUser && currentUser.name)  || "";
    const organizerLine = orgEmail
      ? `ORGANIZER;CN=${icsEscape(orgName || orgEmail)}:mailto:${orgEmail}`
      : "";

    // Unik UID per forekomst (hindrer dedupe)
    const uid     = `${eventKey(ev)}@gk-kalender`;
    const dtstamp = nowZulu();
    const dtstart = toZulu(ev.start);
    const dtend   = toZulu(ev.end || ev.start);

    const lines = [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `STATUS:CONFIRMED`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(location)}`,
      `DESCRIPTION:${description}`,
    ];
    if (organizerLine) lines.push(organizerLine);
    if (attendeeLine)  lines.push(attendeeLine);
    lines.push("END:VEVENT");
    return lines.join("\r\n");
  }

  // Bygg VCALENDAR (én eller mange VEVENTs)
  function buildCalendarICSFromMany(vevents) {
    return [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "VERSION:2.0",
      "PRODID:-//GK//Kalender//NO",
      "CALSCALE:GREGORIAN",
      ...vevents,
      "END:VCALENDAR",
      ""
    ].join("\r\n");
  }
  function buildCalendarICS(vevent) {
    return buildCalendarICSFromMany([vevent]);
  }

  // Unike filnavn: <ordrenr>-<YYYYMMDD-HHMM>-<slug(tittel)>.ics (+ (2), (3) ved kollisjon)
  function suggestIcsFilename(ev) {
    const ep = ev.extendedProps || {};
    const order = ep.order_number || "oppgave";
    const t     = slug(ev.title || "");
    const when  = ev.start ? yyyymmddhhmm(ev.start) : "00000000-0000";
    return `${order}-${when}${t ? "-" + t : ""}.ics`;
  }
  function uniqueNameFactory() {
    const used = new Map(); // name -> count
    return function uniqueName(name) {
      if (!used.has(name)) { used.set(name, 1); return name; }
      const n = used.get(name) + 1;
      used.set(name, n);
      const dot = name.lastIndexOf(".");
      return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    };
  }

  function buildZipName(activeStart) {
    const y = activeStart.getFullYear();
    const m = pad(activeStart.getMonth() + 1);
    return `kalender-${y}-${m}.zip`;
  }
  function buildSingleIcsName(activeStart) {
    const y = activeStart.getFullYear();
    const m = pad(activeStart.getMonth() + 1);
    return `kalender-${y}-${m}.ics`;
  }

  // ---- Public init ----
  window.initICSExport = function initICSExport(calendar) {
    const openBtn    = document.getElementById("downloadIcsBtn");
    const modalEl    = document.getElementById("icsModal");
    const listEl     = document.getElementById("icsTaskList");
    const confirmBtn = document.getElementById("downloadIcsConfirmBtn");
    if (!openBtn || !modalEl || !listEl || !confirmBtn) {
      console.warn("[ICS] Mangler elementer (knapper/modal/liste) – hopper over init.");
      return;
    }
    let bsModal = null;
    try { bsModal = new bootstrap.Modal(modalEl, { backdrop: "static" }); } catch (_) {}

    // --- State ---
    const selectedIds = new Set(); // persisterer valg ved navigasjon/filter
    let filterText = "";
    let excludeWeekend = false;
    let singleFile = false;

    // --- Toolbar (bygges dynamisk) ---
    let toolbar = modalEl.querySelector("#icsToolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "icsToolbar";
      toolbar.className = "d-flex flex-wrap align-items-center gap-2 mb-2";
      toolbar.innerHTML = `
        <div class="btn-group" role="group" aria-label="Velg">
          <button type="button" class="btn btn-sm btn-outline-primary" id="icsSelectAllBtn">Legg til alle</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="icsClearAllBtn">Fjern alle</button>
        </div>

        <div class="d-flex align-items-center ms-auto me-2 gap-1" id="icsMonthNav">
          <button type="button" class="btn btn-sm btn-light" id="icsPrevMonthBtn" title="Forrige måned">‹</button>
          <span id="icsMonthLabel" class="fw-semibold" style="min-width: 140px; text-align:center;"></span>
          <button type="button" class="btn btn-sm btn-light" id="icsNextMonthBtn" title="Neste måned">›</button>
        </div>

        <div class="flex-grow-1" style="min-width: 220px;">
          <input type="text" class="form-control form-control-sm" id="icsFilterInput" placeholder="Filter (f.eks. Lagunen)">
        </div>

        <div class="form-check ms-1">
          <input class="form-check-input" type="checkbox" id="icsExcludeWeekend">
          <label class="form-check-label" for="icsExcludeWeekend">Ekskluder helg</label>
        </div>

        <div class="form-check ms-1">
          <input class="form-check-input" type="checkbox" id="icsSingleFile">
          <label class="form-check-label" for="icsSingleFile">En .ics-fil</label>
        </div>

        <div id="icsCounts" class="ms-auto small text-muted"></div>
      `;

      // Finn et fornuftig container-element å sette toolbaren i:
      // 1) helst forelder til lista
      // 2) ellers .modal-body
      // 3) ellers selve modalEl
      const preferredContainer =
        (listEl && listEl.parentNode) ||
        modalEl.querySelector(".modal-body") ||
        modalEl;

      // Velg et "before"-anker som GARANTERT er barn av container
      const beforeNode = (listEl && listEl.parentNode === preferredContainer)
        ? listEl
        : preferredContainer.firstChild;

      if (beforeNode) {
        preferredContainer.insertBefore(toolbar, beforeNode);
      } else {
        preferredContainer.appendChild(toolbar);
      }
    }

    // Refs
    const btnSelectAll   = toolbar.querySelector("#icsSelectAllBtn");
    const btnClearAll    = toolbar.querySelector("#icsClearAllBtn");
    const btnPrevMonth   = toolbar.querySelector("#icsPrevMonthBtn");
    const btnNextMonth   = toolbar.querySelector("#icsNextMonthBtn");
    const monthLabel     = toolbar.querySelector("#icsMonthLabel");
    const filterInput    = toolbar.querySelector("#icsFilterInput");
    const chkExcludeWknd = toolbar.querySelector("#icsExcludeWeekend");
    const chkSingleFile  = toolbar.querySelector("#icsSingleFile");
    const countsEl       = toolbar.querySelector("#icsCounts");

    // --- Helpers for gjeldende view ---
    function getActiveRange() {
      const view = calendar.view;
      const activeStart = view.activeStart || view.currentStart || calendar.getDate();
      const activeEnd   = view.activeEnd   || view.currentEnd   || calendar.getDate();
      return { activeStart: new Date(activeStart), activeEnd: new Date(activeEnd) };
    }
    function gotoMonthOffset(offset) {
      const center = calendar.getDate ? new Date(calendar.getDate()) : new Date();
      const d = new Date(center);
      d.setMonth(d.getMonth() + offset);
      calendar.gotoDate(d);
      updateMonthLabel();
      renderList();
    }
    function updateMonthLabel() {
      const center = calendar.getDate ? new Date(calendar.getDate()) : new Date();
      monthLabel.textContent = monthNameNo(center);
    }

    // --- Filtrering ---
    function normalize(s) { return (s || "").toString().toLowerCase(); }
    function matchFilter(ev) {
      if (!filterText) return true;
      const f = normalize(filterText);
      const ep = ev.extendedProps || {};
      const hay = [
        ev.title,
        ep.plassering, ep.location, ep.lokasjon,
        ep.order_number,
        getTechDisplay(ep)
      ].map(normalize).join(" ");
      return hay.includes(f);
    }
    function isWeekend(date) {
      const d = (date instanceof Date) ? date : new Date(date);
      const day = d.getDay(); // 0=Sun, 6=Sat
      return (day === 0 || day === 6);
    }

    // --- Render liste ---
    function updateCounts() {
      const totalVisible = visibleCheckboxes().length;
      let selectedVisible = 0;
      for (const cb of visibleCheckboxes()) if (cb.checked) selectedVisible++;
      const { activeStart, activeEnd } = getActiveRange();
      const totalMonth = calendar.getEvents().filter(ev => overlapsRange(ev, activeStart, activeEnd)).length;
      countsEl.textContent = `${selectedVisible} / ${totalVisible} valgt (totalt ${totalMonth} i måneden)`;
    }
    function visibleCheckboxes() {
      return listEl.querySelectorAll("input.ics-item-cb[data-event-key]");
    }
    function renderList() {
      const { activeStart, activeEnd } = getActiveRange();
      const eventsAll = calendar.getEvents()
        .filter(ev => overlapsRange(ev, activeStart, activeEnd))
        .sort((a, b) => (a.start || 0) - (b.start || 0));

      let events = eventsAll.filter(matchFilter);
      if (excludeWeekend) {
        events = events.filter(ev => ev.start && !isWeekend(ev.start));
      }

      listEl.innerHTML = "";

      if (events.length === 0) {
        listEl.innerHTML = `<div class="alert alert-info">Ingen oppgaver i aktiv visning.</div>`;
        countsEl.textContent = `0 / 0 valgt`;
        return;
      }

      for (const ev of events) {
        const key = eventKey(ev);
        const start = ev.start ? new Date(ev.start) : null;
        const d = start
          ? `${pad(start.getDate())}.${pad(start.getMonth() + 1)}.${start.getFullYear()} ${pad(start.getHours())}:${pad(start.getMinutes())}`
          : "";
        const ep = ev.extendedProps || {};
        const tech = getTechDisplay(ep);
        const orderNo = ep.order_number ? ` [${ep.order_number}]` : "";
        const techPart = tech ? ` — <em>Tekniker: ${tech}</em>` : "";

        const item = document.createElement("label");
        item.className = "list-group-item d-flex align-items-center gap-2";
        item.innerHTML = `
          <input type="checkbox" class="form-check-input me-2 ics-item-cb" data-event-key="${key}" ${selectedIds.has(key) ? "checked" : ""}>
          <span>${ev.title || "Oppgave"}${orderNo} — ${d}${techPart}</span>
        `;
        listEl.appendChild(item);
      }

      updateCounts();
    }

    // --- Event: åpne modal -> init UI + render ---
    openBtn.addEventListener("click", () => {
      updateMonthLabel();
      renderList();
      listEl.addEventListener("change", (e) => {
        if (e.target && e.target.matches("input.ics-item-cb")) {
          const key = e.target.getAttribute("data-event-key");
          if (e.target.checked) selectedIds.add(key);
          else selectedIds.delete(key);
          updateCounts();
        }
      });
      if (bsModal) bsModal.show();
    });

    // --- Toolbar handlers ---
    btnPrevMonth.addEventListener("click", () => gotoMonthOffset(-1));
    btnNextMonth.addEventListener("click", () => gotoMonthOffset(+1));

    filterInput.addEventListener("input", () => {
      filterText = filterInput.value || "";
      renderList();
    });

    chkExcludeWknd.addEventListener("change", () => {
      excludeWeekend = !!chkExcludeWknd.checked;
      renderList();
    });

    chkSingleFile.addEventListener("change", () => {
      singleFile = !!chkSingleFile.checked;
    });

    btnSelectAll.addEventListener("click", () => {
      for (const cb of visibleCheckboxes()) {
        cb.checked = true;
        selectedIds.add(cb.getAttribute("data-event-key"));
      }
      updateCounts();
    });
    btnClearAll.addEventListener("click", () => {
      for (const cb of visibleCheckboxes()) {
        cb.checked = false;
        selectedIds.delete(cb.getAttribute("data-event-key"));
      }
      updateCounts();
    });

    // --- Bekreft nedlasting ---
    confirmBtn.addEventListener("click", async () => {
      // Sync state fra UI
      for (const cb of visibleCheckboxes()) {
        const key = cb.getAttribute("data-event-key");
        if (cb.checked) selectedIds.add(key);
        else selectedIds.delete(key);
      }

      const { activeStart } = getActiveRange();
      const currentUser = window.currentUser || { email: "", name: "" };

      const byKey = new Map(calendar.getEvents().map(e => [eventKey(e), e]));
      const chosen = Array.from(selectedIds)
        .map(k => byKey.get(k))
        .filter(Boolean)
        .sort((a, b) => (a.start || 0) - (b.start || 0));

      if (chosen.length === 0) {
        alert("Velg minst én oppgave.");
        return;
      }

      if (singleFile) {
        // Én .ics med mange VEVENT
        const vevents = chosen.map(ev => buildVEventICS(ev, currentUser));
        const ics     = buildCalendarICSFromMany(vevents);
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = buildSingleIcsName(activeStart);
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } else {
        // ZIP med én .ics per oppgave
        if (typeof JSZip === "undefined") {
          alert("JSZip mangler. Last inn JSZip før du eksporterer som ZIP, eller bruk 'En .ics-fil'.");
          return;
        }
        const zip = new JSZip();
        const uniqueName = uniqueNameFactory(); // sikrer at to like navn ikke overskriver hverandre

        for (const ev of chosen) {
          const vevent = buildVEventICS(ev, currentUser);
          const ics    = buildCalendarICS(vevent);
          const raw    = suggestIcsFilename(ev);
          const fname  = uniqueName(raw);
          zip.file(fname, ics);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = buildZipName(activeStart);
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }

      try { bsModal && bsModal.hide(); } catch (_) {}
    });
  };
})();