document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");
  const filterLokasjon = document.getElementById("filterLokasjon");
  const filterFag = document.getElementById("filterFag");
  const loader = document.getElementById("loader");

  // Hent informasjon om innlogget bruker
  const userRole = sessionGet('role');
  const username = sessionGet('username');
  const userLocation = sessionGet('location');

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  // Hjelpefunksjoner
  function toISODate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Kartlegg helligdager som navn → start-dato
  let holidayMap = {};

  // Finn arbeidsdager mellom to datoer
  function getArbeidsdagerMellom(startISO, endISO) {
    const days = [];
    let current = new Date(startISO.split("T")[0]);
    const end = new Date(endISO.split("T")[0]);

    while (current <= end) {
      const iso = toISODate(current);
      if (isArbeidsdag(iso)) {
        days.push(iso);
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  function isArbeidsdag(isoDato) {
    const wd = new Date(isoDato).getDay();
    return wd >= 1 && wd <= 5 && !holidayMap[isoDato];
  }

  // --- FullCalendar-instans ---
  const calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay"
    },
    buttonText: {
      today: 'I dag',
      month: 'Måned',
      week: 'Uke',
      day: 'Dag'
    },
    views: {
      dayGridMonth: { buttonText: "Måned" },
      timeGridWeek: { buttonText: "Uke" },
      timeGridDay: { buttonText: "Dag" }
    },
    locale: "no",
    initialView: "dayGridMonth",
    slotMinTime: "06:00:00",
    slotMaxTime: "18:00:00",
    firstDay: 1,
    selectable: true,
    selectMirror: true,
    height: "auto",

    // Fargelegg helg og helligdager
    dayCellDidMount: function (arg) {
      arg.el.style.position = 'relative';
      const date = arg.date;
      const iso = toISODate(date);

      // Slett tidligere stil (hvis noen)
      arg.el.style.backgroundColor = '';

      // HELLIGDAG?
      if (holidayMap[iso]) {
        arg.el.style.backgroundColor = 'rgba(255, 220, 220, 0.4)';
        const lbl = document.createElement('div');
        lbl.className = 'holiday-label';
        lbl.textContent = holidayMap[iso];
        arg.el.appendChild(lbl);
      }
      // HELG (lørdag eller søndag)?
      else if (date.getDay() === 0 || date.getDay() === 6) {
        arg.el.style.backgroundColor = 'rgba(230, 230, 230, 0.7)';
      }
    },

    // Hent oppgaver
    events: '/api/oppgaver',

    // Vis popup når man klikker på oppgave
    eventClick: function (info) {
      const e = info.event;

      // Sett ID
      document.getElementById("modalTaskId").value = e.id;

      // Tittel
      document.getElementById("modalTitle").value = e.title;

      // Tekniker
      const teknikerSelect = document.getElementById("modalTekniker");
      teknikerSelect.value = e.extendedProps.tekniker || "";

      // Lokasjon
      document.getElementById("modalLokasjon").value = e.extendedProps.location || "";

      // Start/slutt
      const start = new Date(e.start);
      const end = new Date(e.end);

      document.getElementById("modalStartDato").value = start.toISOString().split("T")[0];
      document.getElementById("modalStartTid").value = start.toTimeString().slice(0, 5);
      document.getElementById("modalEndDato").value = end.toISOString().split("T")[0];
      document.getElementById("modalEndTid").value = end.toTimeString().slice(0, 5);

      // Status
      document.getElementById("modalStatus").value = e.extendedProps.status || "planlagt";

      // Kommentarer
      document.getElementById("modalKommentarProsjektleder").value = e.extendedProps.kommentar || "";
      document.getElementById("modalKommentarTekniker").value = e.extendedProps.teknikerKommentar || "";

      // Tilpass modal etter rolle
      tilpassModalEtterRolle(e.extendedProps.tekniker);

      // Vis modal
      new bootstrap.Modal(document.getElementById("taskDetailsModal")).show();
    }
  });

  calendar.render();

  // Tving refetch etter kort pause
  setTimeout(() => {
    calendar.changeView("timeGridWeek");
    setTimeout(() => {
      calendar.changeView("dayGridMonth");
    }, 10);
  }, 10);

  // Refetch når dato eller filter endres
  calendar.on('datesSet', () => calendar.refetchEvents());
  filterLokasjon.addEventListener("change", () => calendar.refetchEvents());
  filterFag.addEventListener("change", () => calendar.refetchEvents());

  // --- Hent helligdager og oppdater kalender ---
  fetch('/api/helligdager')
    .then(r => r.json())
    .then(data => {
      holidayMap = data.reduce((map, h) => {
        const date = new Date(h.start);
        const iso = toISODate(date);
        map[iso] = h.title || "Helligdag";
        return map;
      }, {});

      setTimeout(() => {
        calendar.refetchEvents();
        calendar.changeView(calendar.view.type);
      }, 100); // Lite delay for sikkerhet

      if (loader) loader.style.display = "none";
    })
    .catch(err => console.error("Feil ved henting av helligdager", err));

  // --- Modal-popup logikk ---
  const taskIdInput = document.getElementById("modalTaskId");
  const teknikerSelect = document.getElementById("modalTekniker");
  const titleInput = document.getElementById("modalTitle");
  const lokasjonInput = document.getElementById("modalLokasjon");
  const startDatoInput = document.getElementById("modalStartDato");
  const startTidInput = document.getElementById("modalStartTid");
  const endDatoInput = document.getElementById("modalEndDato");
  const endTidInput = document.getElementById("modalEndTid");
  const statusInput = document.getElementById("modalStatus");
  const kommentarProsjektleder = document.getElementById("modalKommentarProsjektleder");
  const kommentarTekniker = document.getElementById("modalKommentarTekniker");
  const vedleggInput = document.getElementById("vedleggInput");

  // --- Hent teknikere ---
  fetch("/ny_oppgave")
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const options = doc.querySelectorAll("#filterFag option[value]");
      options.forEach(opt => {
        const value = opt.getAttribute("value");
        if (value && value !== "") {
          const selected = opt.selected ? "selected" : "";
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          option.setAttribute("data-role", "tekniker");
          teknikerSelect.appendChild(option);
        }
      });
    });

  // --- Lagre endringer ---
  document.getElementById("saveChangesBtn")?.addEventListener("click", () => {
    const taskId = taskIdInput.value;
    const oldEvent = calendar.getEventById(taskId);

    if (!oldEvent) return;

    // Les verdier fra modal
    const updatedEvent = {
      id: taskId,
      title: titleInput.value,
      technician: teknikerSelect.value,
      location: lokasjonInput.value,
      start: `${startDatoInput.value}T${startTidInput.value}`,
      end: `${endDatoInput.value}T${endTidInput.value}`,
      status: statusInput.value,
      extendedProps: {
        ...oldEvent._def.extendedProps,
        kommentar: kommentarProsjektleder.value,
        tekniker: teknikerSelect.value,
        lokasjon: lokasjonInput.value
      }
    };

    // 1️⃣ Slett gammel versjon som bakgrunnshendelse
    const deletedEvent = {
      ...oldEvent._def,
      display: "background",
      backgroundColor: "rgba(255, 0, 0, 0.3)",
      title: "SLETTET - " + oldEvent.title
    };

    fetch("/api/slett-oppgave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deletedEvent)
    }).then(() => {
      // 2️⃣ Opprett ny versjon
      return fetch(`/api/oppgave/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedEvent)
      });
    }).then(() => {
      calendar.refetchEvents(); // Oppdater kalenderen
      document.querySelector(".modal").querySelector(".btn-close").click(); // Lukk modal
    }).catch(err => {
      console.error("Feil ved lagring:", err);
      alert("Noe gikk galt under lagring.");
    });

  });

  // --- Last opp vedlegg ---
  vedleggInput?.addEventListener("change", function (e) {
    const files = Array.from(e.target.files);

    if (files.length > 5) {
      alert("Du kan ikke laste opp mer enn 5 filer.");
      e.target.value = "";
      return;
    }

    const tooBig = files.find(f => f.size > 10 * 1024 * 1024); // 10 MB
    if (tooBig) {
      alert("Ingen filer over 10 MB tillatt.");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    files.forEach(f => formData.append("vedlegg", f));
    formData.append("taskId", taskIdInput.value);

    fetch("/api/upload-file", {
      method: "POST",
      body: formData
    }).then(res => res.json())
      .then(data => {
        alert("Filer lastet opp!");
      })
      .catch(err => {
        console.error("Feil ved opplasting:", err);
        alert("Kunne ikke laste opp filer");
      });
  });

  // --- Eksporter som ICS ---
  document.getElementById("exportIcsBtn")?.addEventListener("click", () => {
    const taskId = document.getElementById("modalTaskId").value;
    const event = calendar.getEventById(taskId);

    if (!event) {
      alert("Fant ikke oppgaven");
      return;
    }

    generateICS(event);
  });

  // --- Generer .ics-innvitasjon ---
  function generateICS(event) {
    const start = new Date(event.start);
    const end = new Date(event.end);

    const formatDateForICS = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}${month}${day}T${hours}${minutes}00`;
    };

    const description = `
Tittel: ${event.title}
Ordre: ${event.extendedProps.ordrenummer || "Ingen"}
Tekniker: ${event.extendedProps.tekniker || "Ikke satt"}
Status: ${event.extendedProps.status || "Planlagt"}
Kommentar: ${event.extendedProps.kommentar || "Ingen beskrivelse"}
`.replace(/\n/g, "\\n");

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Bedrift AS//Booking System v1.0//NO
BEGIN:VEVENT
UID:${event.id}@dinbedrift.no
DTSTAMP:${formatDateForICS(new Date())}
DTSTART:${formatDateForICS(start)}
DTEND:${formatDateForICS(end)}
SUMMARY:${event.title}
DESCRIPTION:${description}
LOCATION:${event.extendedProps.location || "Ukjent"}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${event.title.replace(/\s+/g, '_')}.ics`;
    link.click();
  }

  // --- Tilpass modal etter rolle ---
  function tilpassModalEtterRolle(teknikerNavn) {
    const erEgenOppgave = userRole === "tekniker" && teknikerNavn === username;

    // Alle felt → standard: skru av alt
    const readOnlyFields = [
      titleInput,
      teknikerSelect,
      lokasjonInput,
      startDatoInput,
      startTidInput,
      endDatoInput,
      endTidInput,
      statusInput,
      kommentarProsjektleder,
      vedleggInput
    ];

    // Aktiver felt basert på rolle
    if (userRole === "admin") {
      readOnlyFields.forEach(el => el.removeAttribute("readonly"));
      readOnlyFields.forEach(el => el.removeAttribute("disabled"));
    } else if (userRole === "prosjektleder") {
      // Prosjektleder: kan ikke redigere sin egen kommentar
      kommentarTekniker.disabled = true;
      vedleggInput.disabled = false;
      statusInput.disabled = false;
    } else if (userRole === "tekniker") {
      // Tekniker: kun redigering av sin egen kommentar, status og vedlegg
      readOnlyFields.forEach(el => el.setAttribute("readonly", "readonly"));
      kommentarTekniker.removeAttribute("readonly");
      kommentarTekniker.removeAttribute("disabled");
      statusInput.removeAttribute("readonly");
      statusInput.removeAttribute("disabled");
      vedleggInput.removeAttribute("readonly");
      vedleggInput.removeAttribute("disabled");
    }
  }
});