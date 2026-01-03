/*
 * ics-builder.js v2.4
 * Bygger og laster ned kalenderinvitasjoner (.ics) i UTC (Z-suffix), optimalisert for Outlook m.fl.
 * - UTC-stempling (DTSTART/DTEND med Z)
 * - Felter: ATTENDEE, ORGANIZER, DESCRIPTION, DTSTART, DTEND, SUMMARY, UID, STATUS
 * - Rekkefølge: METHOD først, så VERSION, PRODID
 * - ATTENDEE/ORGANIZER: CN og verdi satt til ren e-post (uten "mailto:")
 * - Stabilt UNIK UID per hendelse (hindrer at flere jobber med samme ordrenummer slås sammen)
 * - SUMMARY: "Ordrenummer – Tittel – Plassering" (tittelen etter ordrenummer)
 */

(function (global) {
  // ───────────────────────── Utils ─────────────────────────
  function pad(n, len = 2) { return String(n).padStart(len, "0"); }

  /** Formatér dato som UTC YYYYMMDDTHHMMSSZ */
  function formatUTC(value) {
    const d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) throw new Error("Invalid date: " + value);
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z"
    );
  }

  /** ICS-escape (RFC5545): \ ; , og linjeskift */
  function esc(text) {
    return (text || "")
      .replace(/\\/g, "\\\\")   // må være først
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
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

  function slug(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Enkel stabil hash (djb2) for UID */
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i); // h*33 ^ char
    }
    // tving til usignert og i base36
    return (h >>> 0).toString(36);
  }

  /** Lag UID som ikke kolliderer selv om ordrenummeret er likt */
  function buildUID(evt) {
    const id = evt.id || "";
    const order = (evt.extendedProps && evt.extendedProps.order_number) || "";
    const startISO = evt.start ? new Date(evt.start).toISOString() : "";
    const endISO   = evt.end   ? new Date(evt.end).toISOString()   : "";
    const seed = [order, id, startISO, endISO].join("|");
    const h = hashStr(seed || Math.random().toString(36));
    return `${h}@gk-kalender`;
  }

  /** Lag SUMMARY: "Ordrenummer – Tittel – Plassering" (utelater tomme deler) */
  function buildSummary(evt) {
    const order = (evt.extendedProps && evt.extendedProps.order_number) || "";
    const title = evt.title || "";
    const loc   = (evt.extendedProps && (evt.extendedProps.location || evt.extendedProps.plassering || evt.extendedProps.lokasjon)) || "";
    const parts = [];
    if (order) parts.push(order);
    if (title) parts.push(title);
    if (loc)   parts.push(loc);
    return esc(parts.join(" – "));
  }

  // ───────────────────────── Builders ─────────────────────────

  /**
   * Bygg ett VCALENDAR med ÉN VEVENT
   * evt: { id, title, start, end, extendedProps: { location/plassering/lokasjon, description, organizerEmail, attendees:[{email}], status, order_number } }
   * method: "REQUEST" | "CANCEL"
   */
  function build(evt, method = "REQUEST") {
    const startUTC = formatUTC(evt.start);
    const endUTC   = formatUTC(evt.end);
    const status   = (evt.extendedProps && evt.extendedProps.status) || "CONFIRMED";

    const desc     = esc((evt.extendedProps && evt.extendedProps.description) || "");
    const loc      = esc((evt.extendedProps && (evt.extendedProps.location || evt.extendedProps.plassering || evt.extendedProps.lokasjon)) || "");
    const orgEmail = esc((evt.extendedProps && evt.extendedProps.organizerEmail) || "");

    const summary  = buildSummary(evt);
    const uid      = buildUID(evt);

    const lines = [
      "BEGIN:VCALENDAR",
      `METHOD:${method}`,
      "VERSION:2.0",
      "PRODID:-//GK//ICS-Builder v2.4//NO",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      // Attendees: CN og verdi = ren e-post (uten mailto:)
      ...(((evt.extendedProps && evt.extendedProps.attendees) || []).map(att =>
        `ATTENDEE;CN=${esc(att.email)}:${esc(att.email)}`
      )),
      `DESCRIPTION:${desc}`,
      `DTEND:${endUTC}`,
      `LOCATION:${loc}`,
      `ORGANIZER;CN=${orgEmail}:${orgEmail}`,
      `DTSTART:${startUTC}`,
      `STATUS:${status}`,
      `SUMMARY:${summary}`,
      `UID:${uid}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n");
  }

  /**
   * Bygg ett VCALENDAR med MANGE VEVENTs (nyttig hvis du vil laste ned én .ics med flere møter)
   * events: Array av evt-objekter (samme struktur som i build)
   * method: "REQUEST" | "CANCEL"
   */
  function buildMany(events = [], method = "REQUEST") {
    const lines = [
      "BEGIN:VCALENDAR",
      `METHOD:${method}`,
      "VERSION:2.0",
      "PRODID:-//GK//ICS-Builder v2.4//NO",
      "CALSCALE:GREGORIAN"
    ];

    for (const evt of events) {
      const startUTC = formatUTC(evt.start);
      const endUTC   = formatUTC(evt.end);
      const status   = (evt.extendedProps && evt.extendedProps.status) || "CONFIRMED";

      const desc     = esc((evt.extendedProps && evt.extendedProps.description) || "");
      const loc      = esc((evt.extendedProps && (evt.extendedProps.location || evt.extendedProps.plassering || evt.extendedProps.lokasjon)) || "");
      const orgEmail = esc((evt.extendedProps && evt.extendedProps.organizerEmail) || "");

      const summary  = buildSummary(evt);
      const uid      = buildUID(evt);

      lines.push(
        "BEGIN:VEVENT",
        ...(((evt.extendedProps && evt.extendedProps.attendees) || []).map(att =>
          `ATTENDEE;CN=${esc(att.email)}:${esc(att.email)}`
        )),
        `DESCRIPTION:${desc}`,
        `DTEND:${endUTC}`,
        `LOCATION:${loc}`,
        `ORGANIZER;CN=${orgEmail}:${orgEmail}`,
        `DTSTART:${startUTC}`,
        `STATUS:${status}`,
        `SUMMARY:${summary}`,
        `UID:${uid}`,
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  // ───────────────────────── Nedlasting ─────────────────────────

  /** Anbefalt standard filnavn: <ordrenr>-<YYYYMMDD-HHMM>-<slug(tittel)>.ics */
  function defaultFilename(evt) {
    const order = (evt.extendedProps && evt.extendedProps.order_number) || "oppgave";
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
  extendedProps: {
    order_number: '21007552-100', // <- viktig for SUMMARY og UID
    location: 'Allegaten 70',
    description: 'Ordrenummer: 21007552-100\\n\\nKommentar:\\nKlaus ...',
    organizerEmail: 'tm5479@gk.no',
    attendees: [ { email: 'as80258@gk.no' } ],
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
