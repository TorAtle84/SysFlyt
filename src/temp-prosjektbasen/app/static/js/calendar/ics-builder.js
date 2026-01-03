/*
 * ics-builder.js v3.0
 * Bygger og laster ned kalenderinvitasjoner (.ics) i UTC (Z-suffix), optimalisert for Outlook m.fl.
 * - UTC-stempling (DTSTART/DTEND med Z) for timed events, VALUE=DATE for allDay
 * - Felter: METHOD, VERSION, PRODID, CALSCALE, VEVENT med ATTENDEE, ORGANIZER, DESCRIPTION, DTSTART, DTEND,
 *           STATUS, SUMMARY, UID, DTSTAMP, CREATED, LAST-MODIFIED
 * - ATTENDEE/ORGANIZER: CN og verdi satt til ren e-post (uten "mailto:"), som du ønsket
 * - Stabil UID per hendelse basert på (order_number, id, start, end)
 * - SUMMARY: "Ordrenummer – Tittel – Plassering" (utelater tomme deler)
 * - Robust RFC5545 line folding (75 bytes)
 */

(function (global) {
  // ───────────────────────── Utils ─────────────────────────
  function pad(n, len = 2) { return String(n).padStart(len, "0"); }

  function toDate(v) {
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new Error("Invalid date: " + v);
    return d;
  }

  /** Formatér dato som UTC YYYYMMDDTHHMMSSZ */
  function formatUTC(value) {
    const d = toDate(value);
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z"
    );
  }

  /** Formatér all-day dato (VALUE=DATE) som YYYYMMDD */
  function formatDate(value) {
    const d = toDate(value);
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate())
    );
  }

  /** ICS-escape (RFC5545) for property-verdier */
  function esc(text) {
    return (text == null ? "" : String(text))
      .replace(/\\/g, "\\\\")   // må være først
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  /** Escape for parameterverdier (må også quote ved spesialtegn) */
  function escParam(text) {
    const s = (text == null ? "" : String(text)).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return /[;,:"]/g.test(s) ? `"${s}"` : s;
  }

  /** Fold lines (RFC 5545) – 75 bytes pr linje, fortsettelseslinjer starter med en space */
  function foldLine(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    let out = [];
    let i = 0;
    while (i < bytes.length) {
      let j = Math.min(i + 75, bytes.length);
      // unngå å klippe midt i en UTF-8 sekvens
      while (j < bytes.length && (bytes[j] & 0xC0) === 0x80) j--;
      out.push(new TextDecoder().decode(bytes.slice(i, j)));
      i = j;
    }
    // første linje normal, resten med ledende space
    return out.map((seg, idx) => (idx === 0 ? seg : " " + seg)).join("\r\n");
  }

  /** Fold hele ICS-strengen (linjevis) */
  function foldLines(lines) {
    return lines.map(foldLine).join("\r\n");
  }

  function yyyymmddhhmm(value) {
    const d = toDate(value);
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + "-" +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  function slug(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Enkel stabil hash (djb2^ variant) for UID */
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i); // h*33 ^ char
    }
    return (h >>> 0).toString(36);
  }

  /** Stabil UID basert på (order, id, start, end) */
  function buildUID(evt) {
    const id = evt.id || "";
    const order = evt.extendedProps?.order_number || "";
    const startISO = evt.start ? new Date(evt.start).toISOString() : "";
    const endISO   = evt.end   ? new Date(evt.end).toISOString()   : "";
    const seed = [order, id, startISO, endISO].join("|");
    const h = hashStr(seed || Math.random().toString(36));
    return `${h}@gk-kalender`;
  }

  /** SUMMARY: "Ordrenummer – Tittel – Plassering" (utelater tomme deler) */
  function buildSummary(evt) {
    const order = evt.extendedProps?.order_number || "";
    const title = evt.title || "";
    const loc   = evt.extendedProps?.location || evt.extendedProps?.plassering || evt.extendedProps?.lokasjon || "";
    const parts = [];
    if (order) parts.push(order);
    if (title) parts.push(title);
    if (loc)   parts.push(loc);
    return esc(parts.join(" – "));
  }

  function nowUTCStamp() {
    return formatUTC(new Date());
  }

  /** Normaliser attendee: aksepter {email,name} eller "Navn <epost>" eller "epost" */
  function normalizeAttendee(a) {
    if (!a) return null;
    if (typeof a === "string") {
      const m = a.match(/^(.*?)\s*<([^>]+)>$/);
      return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: a.trim() };
    }
    return { name: a.name || a.CN || "", email: a.email || a.mail || a.address || "" };
  }

  // ───────────────────────── Builders ─────────────────────────

  /**
   * Bygg ett VCALENDAR med ÉN VEVENT
   * evt: {
   *   id, title, start, end, allDay?: boolean,
   *   extendedProps: { location/plassering/lokasjon, description, organizerEmail, attendees:[{email,name}|string], status, order_number }
   * }
   * method: "REQUEST" | "CANCEL"
   */
  function build(evt, method = "REQUEST") {
    if (!evt || !evt.start) throw new Error("Event mangler start");
    // valider/normaliser tider
    let start = toDate(evt.start);
    let end   = evt.end ? toDate(evt.end) : null;

    if (end && end.getTime() < start.getTime()) {
      // auto-korriger hvis slutt < start
      const tmp = start; start = end; end = tmp;
    }

    const status = (evt.extendedProps && evt.extendedProps.status) || "CONFIRMED";
    const desc   = esc(evt.extendedProps?.description || "");
    const loc    = esc(evt.extendedProps?.location || evt.extendedProps?.plassering || evt.extendedProps?.lokasjon || "");
    const orgRaw = evt.extendedProps?.organizerEmail || "";
    const orgCN  = escParam(orgRaw);
    const summary = buildSummary(evt);
    const uid     = buildUID(evt);
    const stamp   = nowUTCStamp();

    const isAllDay = !!evt.allDay;

    const lines = [
      "BEGIN:VCALENDAR",
      `METHOD:${method}`,
      "VERSION:2.0",
      "PRODID:-//GK//ICS-Builder v3.0//NO",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
    ];

    // Attendees (uten mailto:, etter ditt ønske)
    const atts = (evt.extendedProps?.attendees || []).map(normalizeAttendee).filter(Boolean);
    for (const att of atts) {
      const cn = escParam(att.name || att.email || "");
      const em = esc(att.email || "");
      if (em) lines.push(`ATTENDEE;CN=${cn}:${em}`);
    }

    // Organizer (uten mailto:)
    if (orgRaw) lines.push(`ORGANIZER;CN=${orgCN}:${esc(orgRaw)}`);

    // Obligatoriske/vanlige felter
    lines.push(
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `CREATED:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `STATUS:${esc(status)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${loc}`
    );

    // Tid: allDay -> VALUE=DATE, ellers UTC med Z
    if (isAllDay) {
      const d1 = formatDate(start);
      // iCal all-day DTEND er eksklusiv; hvis mangler end, bruk samme dato + 1
      const endDate = end ? end : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      const d2 = formatDate(endDate);
      lines.push(`DTSTART;VALUE=DATE:${d1}`);
      lines.push(`DTEND;VALUE=DATE:${d2}`);
    } else {
      lines.push(`DTSTART:${formatUTC(start)}`);
      lines.push(`DTEND:${formatUTC(end || start)}`);
    }

    lines.push("END:VEVENT", "END:VCALENDAR");
    return foldLines(lines);
  }

  /**
   * Bygg ett VCALENDAR med MANGE VEVENTs
   * events: Array av evt-objekter (samme struktur som i build)
   * method: "REQUEST" | "CANCEL"
   */
  function buildMany(events = [], method = "REQUEST") {
    const lines = [
      "BEGIN:VCALENDAR",
      `METHOD:${method}`,
      "VERSION:2.0",
      "PRODID:-//GK//ICS-Builder v3.0//NO",
      "CALSCALE:GREGORIAN"
    ];

    for (const evt of events) {
      if (!evt || !evt.start) continue;
      let start = toDate(evt.start);
      let end   = evt.end ? toDate(evt.end) : null;
      if (end && end.getTime() < start.getTime()) { const t = start; start = end; end = t; }

      const status  = (evt.extendedProps && evt.extendedProps.status) || "CONFIRMED";
      const desc    = esc(evt.extendedProps?.description || "");
      const loc     = esc(evt.extendedProps?.location || evt.extendedProps?.plassering || evt.extendedProps?.lokasjon || "");
      const orgRaw  = evt.extendedProps?.organizerEmail || "";
      const orgCN   = escParam(orgRaw);
      const summary = buildSummary(evt);
      const uid     = buildUID(evt);
      const stamp   = nowUTCStamp();
      const isAllDay = !!evt.allDay;

      lines.push("BEGIN:VEVENT");

      // attendees
      const atts = (evt.extendedProps?.attendees || []).map(normalizeAttendee).filter(Boolean);
      for (const att of atts) {
        const cn = escParam(att.name || att.email || "");
        const em = esc(att.email || "");
        if (em) lines.push(`ATTENDEE;CN=${cn}:${em}`);
      }

      if (orgRaw) lines.push(`ORGANIZER;CN=${orgCN}:${esc(orgRaw)}`);

      lines.push(
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `CREATED:${stamp}`,
        `LAST-MODIFIED:${stamp}`,
        `STATUS:${esc(status)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        `LOCATION:${loc}`
      );

      if (isAllDay) {
        const d1 = formatDate(start);
        const endDate = end ? end : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        const d2 = formatDate(endDate);
        lines.push(`DTSTART;VALUE=DATE:${d1}`);
        lines.push(`DTEND;VALUE=DATE:${d2}`);
      } else {
        lines.push(`DTSTART:${formatUTC(start)}`);
        lines.push(`DTEND:${formatUTC(end || start)}`);
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return foldLines(lines);
  }

  // ───────────────────────── Nedlasting ─────────────────────────

  /** Anbefalt standard filnavn: <ordrenr>-<YYYYMMDD-HHMM>-<slug(tittel)>.ics */
  function defaultFilename(evt) {
    const order = evt.extendedProps?.order_number || "oppgave";
    const when  = evt.start ? yyyymmddhhmm(evt.start) : "00000000-0000";
    const t     = slug(evt.title || "");
    return `${order}-${when}${t ? "-" + t : ""}.ics`;
  }

  /** Last ned valgfritt innhold som .ics */
  function download(content, filename) {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  // Eksporter API
  global.icsBuilder = { build, buildMany, download, defaultFilename };
})(window);

/* USAGE:
const event = {
  id: '5ebe5db6-e072-4369-aff5-0a653bd49929',
  title: 'Allegaten 70 - Innregulering, Plan 3',
  start: '2025-07-14T08:00:00',
  end:   '2025-07-14T16:00:00',
  allDay: false, // valgfritt
  extendedProps: {
    order_number: '21007552-100',
    location: 'Allegaten 70',
    description: 'Ordrenummer: 21007552-100\\n\\nKommentar:\\nKlaus ...',
    organizerEmail: 'tm5479@gk.no',
    attendees: [ { name:'A.S.', email:'as80258@gk.no' }, 'Ola Nordmann <ola@gk.no>' ],
    status: 'CONFIRMED'
  }
};
// Én hendelse:
const ics = icsBuilder.build(event, 'REQUEST');
icsBuilder.download(ics, icsBuilder.defaultFilename(event));

// Flere hendelser i én fil:
const icsMany = icsBuilder.buildMany([event1, event2, event3], 'REQUEST');
icsBuilder.download(icsMany, 'kalender-2025-07.ics');
*/
