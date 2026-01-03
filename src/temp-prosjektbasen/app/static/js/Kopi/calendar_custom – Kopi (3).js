document.addEventListener("DOMContentLoaded",  function () {
     const calendarEl =  document.getElementById("calendar");
     const filterLokasjon =  document.getElementById("filterLokasjon");
     const filterFag =  document.getElementById("filterFag");
     const loader =  document.getElementById("loader");
     // Hjelpefunksjoner
     function stringToColor(str,  alpha =  0.95) {
         let hash =  0;

        for (let i =  0;
         i <  str.length;
         i++) {
             hash =  str.charCodeAt(i) +  (
            (hash <<  5) -  hash);

        } let r =  215 +  (hash &  0x1F);
         let g =  215 +  (
        (hash >>  8) &  0x1F);
         let b =  215 +  (
        (hash >>  16) &  0x1F);

        return `rgba($ {
            r
        },
        $ {
            g
        },
        $ {
            b
        },
        $ {
            alpha
        })`;

    } function toISODate(date) {
         const yyyy =  date.getFullYear();
         const mm =  String(date.getMonth() +  1).padStart(2,  "0");
         const dd =  String(date.getDate()).padStart(2,  "0");

        return `$ {
            yyyy
        } - $ {
            mm
        } - $ {
            dd
        }`;

    } // Kartlegg helligdager som navn → start-dato
     let holidayMap =  {};
     // Finn arbeidsdager mellom to datoer
     function getArbeidsdagerMellom(startISO,  endISO) {
         const days =  [];
         let current =  new Date(startISO.split("T")
        [0]);
         const end =  new Date(endISO.split("T")
        [0]);

        while (current <=  end) {
             const iso =  toISODate(current);

            if (isArbeidsdag(iso)) {
                 days.push(iso);

            } current.setDate(current.getDate() +  1);

        }
        return days;

    } function isArbeidsdag(isoDato) {
         const wd =  new Date(isoDato).getDay();

        return wd >=  1 &&  wd <=  5 &&  ! holidayMap[isoDato];

    } let firstLoad =  true;
     // Opprett kalender-instans
     let calendar =  new FullCalendar.Calendar(calendarEl,  {
         initialView:  'dayGridMonth',
         headerToolbar:  {
             left:  'prev,next today',
             center: 'title',
             right:  'dayGridMonth,timeGridWeek,timeGridDay'
        },
         buttonText:  {
             today:  'I dag',
             month:  'Måned',
             week:  'Uke',
             day:  'Dag'
        },
         views:  {
             dayGridMonth:  {},
             timeGridWeek:  {
                 slotMinTime:  '06:00:00',
                 slotMaxTime:  '20:00:00'
            },
             timeGridDay:  {
                 slotMinTime:  '06:00:00',
                 slotMaxTime:  '20:00:00'
            }
        },
        navLinks:  true,
         nowIndicator:  true,
         locale:  "no",
         firstDay:  1,
         selectable:  true,
         selectMirror:  true,
         height:  "auto",
         // Fargelegg helg og helligdager
         dayCellDidMount:  function(arg) {
             arg.el.style.position =  'relative';
             const date =  arg.date;
             const iso =  toISODate(date);
             // Slett tidligere stil (hvis noen)
             arg.el.style.backgroundColor =  'white';
             // HELLIGDAG?

            if (holidayMap[iso]) {
                 arg.el.style.backgroundColor =  'rgba(255, 220, 220, 0.9)';
                 const lbl =  document.createElement('div');
                 lbl.className =  'holiday-label';
                 lbl.textContent =  holidayMap[iso];
                 arg.el.appendChild(lbl);

            } // HELG (lørdag eller søndag)?

            else
            if (date.getDay() ===  0 ||  date.getDay() ===  6) {
                 arg.el.style.backgroundColor =  'rgba(230, 230, 230, 0.7)';

            }
        },
        // 1️⃣ events: Henter oppgaver og deler dem opp per arbeidsdag
        events:  function(fetchInfo,  successCallback,  failureCallback) {
             fetch( ` / api / oppgaver ? lokasjon = $ {
                encodeURIComponent(filterLokasjon.value)
            } & fag = $ {
                encodeURIComponent(filterFag.value)
            }`,  {
                 credentials:  'include'
            } ) .then(r = > {

                if (!r.ok)
                throw new Error(`Feil ved henting av oppgaver:  $ {
                    r.status
                }`);

                return r.json();

            }) .then(data = > {
                 const isMonth =  calendar.view.type ===  'dayGridMonth';
                 const out =  [];
                 data.forEach(evt = > {
                     const days =  getArbeidsdagerMellom(evt.start,  evt.end ||  evt.start);
                     // 1️⃣ Bakgrunns-hendelse – viser streken i månedsvisning

                    if (isMonth) {
                         out.push({
                             id:  evt.id,
                             start:  days[0] +  'T08:00:00',
                             end:  days[days.length -  1] +  'T16:00:00',
                             display:  'background',
                             backgroundColor:  evt.color ||  '#b77',
                             borderColor:  evt.color ||  '#b77'
                        });

                    } // 2️⃣ Daglig hendelse – viser teksten (i alle visninger)
                     days.forEach(day = > {
                         out.push({
                             id:  evt.id,
                             title:  isMonth ?  `$ {
                                evt.title
                            } — $ {
                                evt.extendedProps.tekniker ||  'Uten tekniker'
                            }` :  evt.title,
                             start:  day +  'T08:00:00',
                             end:  day +  'T16:00:00',
                             display:  'block',
                             backgroundColor:  evt.color ||  '#b77',
                             borderColor:  evt.color ||  '#b77',
                             extendedProps:  evt.extendedProps
                        });

                    });

                });
                 successCallback(out);

            }) .
            catch(failureCallback);
        },
        // 2️⃣ eventDidMount: Tooltip på hover
        eventDidMount:  function(info) {
             const e =  info.event;
             new bootstrap.Tooltip(info.el,  {
                 title:  `Tittel:  $ {
                    e.title
                }\nTekniker:  $ {
                    e.extendedProps.tekniker
                }\nOrdre:  $ {
                    e.extendedProps.ordrenummer
                }`,
                 placement:  "top",
                 trigger:  "hover",
                 customClass:  "custom-tooltip"
            });
        },
        // 3️⃣ eventClick: Klikk på oppgave → fyll modal og vis den
        eventClick:  function(info) {
             console.log("Åpner modal for oppgave",  info.event.id,  info.event.extendedProps);
             const e =  info.event;

            if (!e ||  ! e.id)
            return;
             // hjelpe‐funksjon for å sette felt
             const setValue =  (id,  value) = > {
                 const el =  document.getElementById(id);

                if (el) el.value =  value ? ? "";

            };
             // 1) Prefyll enkle felt
             setValue("modalTaskId",  e.id);
             setValue("modalTitle",  e.title);
             setValue("modalLokasjon",  e.extendedProps.location);
             // 2) Prefyll Start‐ og Slutt‐dato/tid (format YYYY-MM-DD for <input type="date">)

            if (e.startStr) {
                 const [d,  t] =  e.startStr.split("T");
                 setValue("modalStartDato",  d);
                 setValue("modalStartTid",  t.substr(0, 5));

            }
            if (e.endStr) {
                 const [d,  t] =  e.endStr.split("T");
                 setValue("modalEndDato",  d);
                 setValue("modalEndTid",  t.substr(0, 5));

            } // 3) Fyll tekniker‐dropdown fra embedded window.alleTeknikere
             const tekSel =  document.getElementById("modalTekniker");
             tekSel.innerHTML =  "";
             (window.alleTeknikere ||  []).forEach(t = > tekSel.append(new Option(t.navn,  t.id)) );
             tekSel.value =  e.extendedProps.tekniker ||  "";
             // 4) Fyll status‐dropdown fra embedded window.alleStatusverdier
             const statSel =  document.getElementById("modalStatus");
             statSel.innerHTML =  "";
             (window.alleStatusverdier ||  []).forEach(s = > statSel.append(new Option(s.navn,  s.kode)) );
             statSel.value =  e.extendedProps.status ||  "";
             // 5) Kommentar‐felt
             setValue("modalKommentarProsjektleder",  e.extendedProps.kommentar ||  "");
             setValue("modalKommentarTekniker",  e.extendedProps.teknikerKommentar ||  "");
             // 6) Lagre ordrenummer for fil‐prefixing og hent vedlegg
             currentOrderNumber =  e.extendedProps.ordreNummer ||  "";
             lastNedVedlegg(e.id);
             // 7) Vis modal
             new bootstrap.Modal(document.getElementById("taskDetailsModal")).show();
        },
         // 3) Force‐redraw on first load so multi-day events split at week/holiday
         datesSet:  function() {

            if (firstLoad) {
                setTimeout(
                () = > {
                     calendar.changeView('timeGridWeek');
                     calendar.changeView('dayGridMonth');
                },
                 10);
                 firstLoad =  false;

            }
        }
    });
     // Vis loader

    if (loader) {
         loader.style.display =  "block";

    } calendar.render();
     // 🕒 Venter 1 sekund for å være sikker på alt er ferdiglastet
     setTimeout(
    () = > {
         console.log("Bootstrap?",  typeof bootstrap !==  "undefined");

    },
     1000);
     // Tving refetch etter kort pause
     setTimeout(
    () = > {
         calendar.changeView("timeGridWeek");
         setTimeout(
        () = > {
             calendar.changeView("dayGridMonth");

        },
         10);

    },
     10);
     // Refetch når dato eller filter endres
     calendar.on('datesSet',  () = > calendar.refetchEvents());
     filterLokasjon.addEventListener('change',  () = > {
         calendar.refetchEvents();

    });
     filterFag .addEventListener('change',  () = > {
         calendar.refetchEvents();

    });
     // Default-verdier for lokasjon og fag
     const defaultLokasjon =  "Bergen";
     // Endre om nødvendig
     const defaultFag =  "Alle";

    if (!filterLokasjon.value) filterLokasjon.value =  defaultLokasjon;

    if (!filterFag.value) filterFag.value =  defaultFag;
     console.log("Filter Lokasjon:",  filterLokasjon.value);
     console.log("Filter Fag:",  filterFag.value);
     // --- Hent helligdager og oppdater kalender ---
     fetch('/api/helligdager') .then(r = > r.json()) .then(data = > {
         holidayMap =  data.reduce(
        (map,  h) = > {
             const date =  new Date(h.start);
             const iso =  toISODate(date);
             map[iso] =  h.title ||  "Helligdag";

            return map;

        },
         {});
         setTimeout(
        () = > {
             calendar.refetchEvents();
             calendar.changeView(calendar.view.type);

        },
         100);
         // Lite delay for sikkerhet

        if (loader) loader.style.display =  "none";

    }) .
    catch(err = > console.error("Feil ved henting av helligdager",  err));
     // --- Modal-popup logikk ---
     const taskIdInput =  document.getElementById("modalTaskId");
     const teknikerSelect =  document.getElementById("modalTekniker");
     const titleInput =  document.getElementById("modalTitle");
     const lokasjonInput =  document.getElementById("modalLokasjon");
     const startDatoInput =  document.getElementById("modalStartDato");
     const startTidInput =  document.getElementById("modalStartTid");
     const endDatoInput =  document.getElementById("modalEndDato");
     const endTidInput =  document.getElementById("modalEndTid");
     const statusInput =  document.getElementById("modalStatus");
     const kommentarProsjektleder =  document.getElementById("modalKommentarProsjektleder");
     const kommentarTekniker =  document.getElementById("modalKommentarTekniker");
     const vedleggInput =  document.getElementById("vedleggInput");
     // --- Hent teknikere ---
     fetch("/ny_oppgave") .then(res = > res.text()) .then(html = > {
         const parser =  new DOMParser();
         const doc =  parser.parseFromString(html,  "text/html");
         const options =  doc.querySelectorAll("#filterFag option[value]");
         options.forEach(opt = > {
             const value =  opt.getAttribute("value");

            if (value &&  value !==  "") {
                 const selected =  opt.selected ?  "selected" :  "";
                 const option =  document.createElement("option");
                 option.value =  value;
                 option.textContent =  value;
                 option.setAttribute("data-role",  "tekniker");
                 teknikerSelect.appendChild(option);

            }
        });

    });
     // --- Lagre endringer ---
     document.getElementById("saveChangesBtn") ? .addEventListener("click",  () = > {
         const taskId =  taskIdInput.value;
         const oldEvent =  calendar.getEventById(taskId);

        if (!oldEvent)
        return;
         // Les verdier fra modal
         const updatedEvent =  {
             id:  taskId,
             title:  titleInput.value,
             technician:  teknikerSelect.value,
             location:  lokasjonInput.value,
             start:  `$ {
                startDatoInput.value
            }
            T$ {
                startTidInput.value
            }`,
             end:  `$ {
                endDatoInput.value
            }
            T$ {
                endTidInput.value
            }`,
             status:  statusInput.value,
             extendedProps:  {
                 .oldEvent._def.extendedProps,
                 kommentar:  kommentarProsjektleder.value,
                 tekniker:  teknikerSelect.value,
                 lokasjon:  lokasjonInput.value
            }
        };
         // 1️⃣ Slett gammel versjon som bakgrunnshendelse
         const deletedEvent =  {
             .oldEvent._def,
             display:  "background",
             backgroundColor:  "rgba(255, 0, 0, 0.3)",
             title:  "SLETTET - " +  oldEvent.title
        };
         fetch("/api/slett-oppgave",  {
             method:  "POST",
             headers:  {
                 "Content-Type":  "application/json"
            },
             body:  JSON.stringify(deletedEvent)
        }).then(
        () = > {
             // 2️⃣ Opprett ny versjon

            return fetch(` / api / oppgave / $ {
                taskId
            }`,  {
                 method:  "POST",
                 headers:  {
                     "Content-Type":  "application/json"
                },
                 body:  JSON.stringify(updatedEvent)
            });

        }).then(
        () = > {
             calendar.refetchEvents();
             // Oppdater kalenderen
             document.querySelector(".modal").querySelector(".btn-close").click();
             // Lukk modal

        }).
        catch(err = > {
             console.error("Feil ved lagring:",  err);
             alert("Noe gikk galt under lagring.");

        });

    }); // --- Last opp vedlegg ---
    function lastNedVedlegg(taskId) {
         console.log('Henter vedlegg for taskId:',  taskId);

        if (!taskId) {
             console.error('Ingen taskId sendt til lastNedVedlegg');

            return;

        } // Sørg for at fetch-URL matcher din backend-rute
         fetch(` / api / vedlegg / $ {
            taskId
        }`,  {
             credentials:  'include'
        }) .then(res = > {

            if (!res.ok) {

                throw new Error(`HTTP $ {
                    res.status
                } ved henting av vedlegg`);

            }
            return res.json();

        }) .then(files = > {
             const liste =  document.getElementById("vedleggListe");
             liste.innerHTML =  "";
             // Rens tidligere

            if (!Array.isArray(files) ||  files.length ===  0) {
                 const item =  document.createElement("li");
                 item.className =  "list-group-item text-muted";
                 item.textContent =  "Ingen vedlegg.";
                 liste.appendChild(item);

                return;

            } files.forEach(file = > {
                 const item =  document.createElement("li");
                 item.className =  "list-group-item d-flex justify-content-between align-items-center";
                 const span =  document.createElement("span");
                 span.textContent =  file.filename;
                 const a =  document.createElement("a");
                 // Encode filename for URL-sikkerhet
                 a.href =  ` / vedlegg / $ {
                    taskId
                }
                /${encodeURIComponent(file.filename)}`;
        a.download = file.filename;
        a.className = "btn btn-sm btn-outline-primary";
        a.textContent = "Last ned";

        item.append(span, a);
        liste.appendChild(item);
      });
    })
    .catch(err => {
      console.error('Feil ved henting av vedlegg:', err);
      const liste = document.getElementById("vedleggListe");
      liste.innerHTML = "";
      const item = document.createElement("li");
      item.className = "list-group-item text-danger";
      item.textContent = "Feil ved henting av vedlegg.";
      liste.appendChild(item);
    });
}
/ /  --- Prepend ordrenummer til opplastede filer ---document.getElementById("vedleggInput") .addEventListener("change",  function(ev) {
                     const ordre =  info.event.extendedProps.ordreNummer ||  'UkjentOrdre';
                     const files =  Array.from(ev.target.files).map(f = > new File(
                    [f],  `$ {
                        ordre
                    } - $ {
                        f.name
                    }`,  {
                         type:  f.type
                    }) );
                     const dt =  new DataTransfer();
                     files.forEach(f = > dt.items.add(f));
                     this.files =  dt.files;

                });
                 // --- ICS‐bygging og nedlasting ---
                function formatICSDate(d) {
                     const pad =  n = > n.toString().padStart(2, '0');

                    return d.getUTCFullYear() +  pad(d.getUTCMonth() + 1) +  pad(d.getUTCDate()) +  'T' +  pad(d.getUTCHours()) +  pad(d.getUTCMinutes()) +  pad(d.getUTCSeconds()) +  'Z';
                }
                function buildICS(evt,  method) {

                    return [ 'BEGIN:VCALENDAR',  'PRODID:-//DittFirma//DinApp//EN',  'VERSION:2.0',  `METHOD: $ {
                        method
                    }`,  'BEGIN:VEVENT',  `UID: $ {
                        evt.id
                    }@dittdomene`,  `DTSTAMP: $ {
                        formatICSDate(new Date())
                    }`,  `DTSTART: $ {
                        formatICSDate(evt.start)
                    }`,  `DTEND: $ {
                        formatICSDate(evt.end)
                    }`,  `SUMMARY: $ {
                        evt.title
                    }`,  `LOCATION: $ {
                        evt.extendedProps.location || ''
                    }`,  (evt.extendedProps.status ?  `STATUS : $ {
                        evt.extendedProps.status
                    }` :  ''),  'END:VEVENT',  'END:VCALENDAR' ].filter(Boolean).join('\r\n');
                }
                function downloadICS(content,  filename) {
                     const blob =  new Blob(
                    [content],  {
                        type: 'text/calendar;charset=utf-8'
                    });
                     const url =  URL.createObjectURL(blob);
                     const a =  document.createElement('a');
                     a.href =  url;
                     a.download =  filename;
                     a.click();
                     URL.revokeObjectURL(url);
                } // Knytt til modal-knapper (legg disse inn i HTML-footeren først!)
                document.getElementById('btnCancelIcs') .addEventListener('click',  () = > {
                     const id =  document.getElementById("modalTaskId").value;
                     const evt =  calendar.getEventById(id);
                     downloadICS(buildICS(evt,  'CANCEL'),  'avlys-event.ics');

                });
                document.getElementById('btnNewIcs') .addEventListener('click',  () = > {
                     const id =  document.getElementById("modalTaskId").value;
                     const evt =  calendar.getEventById(id);
                     downloadICS(buildICS(evt,  'REQUEST'),  'ny-event.ics');

                });
                 // --- Generer .ics-innvitasjon ---
                function generateICS(event) {
                     const start =  new Date(event.start);
                     const end =  new Date(event.end);
                     const formatDateForICS =  date = > {
                         const y =  date.getFullYear();
                         const m =  String(date.getMonth() +  1).padStart(2,  '0');
                         const d =  String(date.getDate()).padStart(2,  '0');
                         const h =  String(date.getHours()).padStart(2,  '0');
                         const min =  String(date.getMinutes()).padStart(2,  '0');

                        return `$ {
                            y
                        }
                        $ {
                            m
                        }
                        $ {
                            d
                        }
                        T$ {
                            h
                        }
                        $ {
                            min
                        }
                        00`;

                    };
                     const description =  `Tittel:  $ {
                        event.title
                    }
                    Ordre:  $ {
                        event.extendedProps.ordrenummer ||  "Ingen"
                    }
                    Tekniker:  $ {
                        event.extendedProps.tekniker ||  "Ikke satt"
                    }
                    Status:  $ {
                        event.extendedProps.status ||  "Planlagt"
                    }
                    Kommentar:  $ {
                        event.extendedProps.kommentar ||  "Ingen beskrivelse"
                    }`.replace(/\n/g,  "\\n");
                     const icsContent =  `BEGIN: VCALENDAR VERSION: 2.0 PRODID: - //Bedrift AS//Booking System v1.0//NO
                    BEGIN: VEVENT UID: $ {
                        event.id
                    }@dinbedrift.no DTSTAMP: $ {
                        formatDateForICS(new Date())
                    }
                    DTSTART: $ {
                        formatDateForICS(start)
                    }
                    DTEND: $ {
                        formatDateForICS(end)
                    }
                    SUMMARY: $ {
                        event.title
                    }
                    DESCRIPTION: $ {
                        description
                    }
                    LOCATION: $ {
                        event.extendedProps.location ||  "Ukjent"
                    }
                    STATUS: CONFIRMED END: VEVENT END: VCALENDAR`;
                     const blob =  new Blob(
                    [icsContent],  {
                         type:  "text/calendar;charset=utf-8"
                    });
                     const link =  document.createElement("a");
                     link.href =  URL.createObjectURL(blob);
                     link.download =  `$ {
                        event.title.replace(/\s+/g,  '_')
                    }.ics`;
                     link.click();
                } // --- Tilpass modal etter rolle ---
                function tilpassModalEtterRolle(teknikerNavn) {
                     const readOnlyFields =  [ document.getElementById("modalTitle"),  document.getElementById("modalLokasjon"),  document.getElementById("modalStartDato"),  document.getElementById("modalStartTid"),  document.getElementById("modalEndDato"),  document.getElementById("modalEndTid") ];

                    if (userRole ===  "admin") {
                         readOnlyFields.forEach(el = > el.removeAttribute("readonly"));
                         readOnlyFields.forEach(el = > el.removeAttribute("disabled"));
                         document.getElementById("modalTekniker").removeAttribute("disabled");
                         document.getElementById("modalStatus").removeAttribute("disabled");
                         document.getElementById("vedleggInput").removeAttribute("disabled");

                    }
                    else
                    if (userRole ===  "prosjektleder") {
                         readOnlyFields.forEach(el = > el.setAttribute("readonly",  "readonly"));
                         document.getElementById("modalTekniker").setAttribute("disabled",  "disabled");
                         document.getElementById("modalStatus").removeAttribute("disabled");
                         document.getElementById("vedleggInput").removeAttribute("disabled");
                         document.getElementById("modalKommentarTekniker").setAttribute("readonly",  "readonly");

                    }
                    else
                    if (userRole ===  "tekniker") {
                         readOnlyFields.forEach(el = > el.setAttribute("readonly",  "readonly"));
                         document.getElementById("modalTekniker").setAttribute("disabled",  "disabled");
                         document.getElementById("modalStatus").removeAttribute("disabled");
                         document.getElementById("vedleggInput").removeAttribute("disabled");
                         document.getElementById("modalKommentarProsjektleder").setAttribute("readonly",  "readonly");
                         document.getElementById("modalKommentarTekniker").removeAttribute("readonly");

                    }
                }
            });