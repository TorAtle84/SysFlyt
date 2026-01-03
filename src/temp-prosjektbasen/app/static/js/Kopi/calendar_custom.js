import { initDomHelpers }      from './utils/dom.js';
import { initApiServices }     from './calendar/api-services.js';
import { initFileUpload }      from './calendar/file-upload.js';
import { initICSButtons }      from './calendar/ics-builder.js';
import { initModalHandlers }   from './calendar/modal-handlers.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Finn kalender‐elementet og opprett FullCalendar
  const calendarEl = document.getElementById('calendar');
  const calendar   = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  'dayGridMonth,timeGridWeek,timeGridDay'
    },
    // andre globale opsjoner…
  });

  // 2) Knytt på all delt logikk
  initDomHelpers();           // setValue, createOption osv.
  initApiServices();          // window.alleTeknikere/statusverdier eller fetch-wrappere
  initFileUpload();           // prepend order-prefix på <input id="vedleggInput">
  initICSButtons(calendar);   // bygger og laster ned .ics for CANCEL/REQUEST
  initModalHandlers(calendar); // eventClick → prefyll modal + save + close

  // 3) Render kalenderen
  calendar.render();
});