// static/js/calendar/calendar-init.js
(function () {
  function onReady(fn){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",fn,{once:true}):fn();}
  function normalizeEvent(raw){
    if(!raw) return null;
    if(raw.title && raw.start) return raw;
    const id=raw.id||raw._id||raw.event_id||raw.order_number||String(Math.random());
    const title=raw.title||raw.name||raw.order_number||"Oppgave";
    const start=raw.start||raw.start_iso||raw.startDate||raw.start_date;
    const end=raw.end||raw.end_iso||raw.endDate||raw.end_date;
    if(!start) return null;
    const ev={id,title,start}; if(end) ev.end=end; if(raw.allDay!=null) ev.allDay=!!raw.allDay; if(raw.color) ev.color=raw.color;
    ev.extendedProps=Object.assign({},raw.extendedProps||{},{
      status:raw.status, order_number:raw.order_number, fag:raw.fag,
      lokasjon:raw.lokasjon||raw.location, plassering:raw.plassering,
      kommentar:raw.kommentar, tekniker:raw.technician||raw.tekniker,
      tekniker_fornavn:raw.tekniker_fornavn
    });
    return ev;
  }
  async function fetchEvents(params){
    if(window.apiServices?.getOppgaver){
      const raw=await window.apiServices.getOppgaver(params);
      const arr=Array.isArray(raw)?raw:(raw?.items||raw?.data||[]);
      return arr.map(normalizeEvent).filter(Boolean);
    }
    const u=new URL((window.APP_BASE_URL||"")+"/kalender/data",window.location.origin);
    if(params?.lokasjon) u.searchParams.set("lokasjon",params.lokasjon);
    if(params?.fag)      u.searchParams.set("fag",params.fag);
    if(params?.start)    u.searchParams.set("start",params.start);
    if(params?.end)      u.searchParams.set("end",params.end);
    const res=await fetch(u.toString(),{credentials:"same-origin"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const arr=Array.isArray(data)?data:(data?.items||data?.data||[]);
    return arr.map(normalizeEvent).filter(Boolean);
  }
  function cleanupTooltips(){
    try{
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el)=>{
        const inst=window.bootstrap?.Tooltip?.getInstance(el); if(inst) inst.dispose();
      });
      document.querySelectorAll(".tooltip").forEach((el)=>el.remove());
    }catch(_){}
  }

  onReady(async ()=>{
    if(!window.FullCalendar?.Calendar){console.error("FullCalendar ikke funnet.");return;}
    const filterLok=document.getElementById("filterLokasjon");
    const filterFag=document.getElementById("filterFag");
    const calendarEl=document.getElementById("calendar");
    if(!calendarEl){console.warn("Fant ikke #calendar.");return;}

    const holidayMap={};
    if(window.apiServices?.getHelligdager){
      try{
        const hds=await window.apiServices.getHelligdager();
        (hds||[]).forEach((h)=>{const d=new Date(h.start);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;holidayMap[iso]=h.title;});
      }catch(e){console.error("Helligdager feilet:",e);}
    }

    const calendar=new FullCalendar.Calendar(calendarEl,{
      timeZone:"local", height:"auto", contentHeight:"auto", expandRows:true, firstDay:1, locale:"nb",
	  weekNumbers: true,
	  weekNumberCalculation: 'ISO',
	  weekNumberContent(arg){ return { html: `Uke&nbsp;${arg.num}` }; },
      dayHeaderFormat:{weekday:"short"}, titleFormat:{year:"numeric",month:"long"},
      editable:true, eventResizableFromStart:true,
      businessHours:{daysOfWeek:[1,2,3,4,5],startTime:"08:00",endTime:"16:00"},
      headerToolbar:{left:"prev,next today",center:"title",right:"dayGridMonth,timeGridWeek,timeGridDay"},
      buttonText:{today:"I dag",month:"Måned",week:"Uke",day:"Dag"},
      initialView:"dayGridMonth", eventDisplay:"block",

      dayCellDidMount(info){
        const d=info.date;
        const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        if(holidayMap[iso]){
          info.el.style.background="#fff0f0";
          info.el.insertAdjacentHTML("beforeend",
            `<div style="position:absolute;top:2px;left:2px;font-size:0.7rem;color:#a00;font-weight:500;">${holidayMap[iso]}</div>`
          );
        } else if([0,6].includes(d.getDay())) {
          info.el.style.background="#f5f5f5";
        }
      },

      eventContent(arg){
        const status=arg.event.extendedProps?.status; let iconHtml="";
        if(status==="utført") iconHtml='<i class="bi bi-check-circle-fill text-success me-2"></i>';
        else if(status==="kansellert") iconHtml='<i class="bi bi-x-circle-fill text-danger me-2"></i>';
        const titleEl=document.createElement("div");
        titleEl.classList.add("fc-event-title","fc-sticky");
        titleEl.innerHTML=iconHtml+(arg.event.title||"");
        return { domNodes:[titleEl] };
      },

      eventDidMount(info){
        const ep=info.event.extendedProps||{};
        const tittel=info.event.title||"";
        const tekniker=ep.tekniker_fornavn||"";
        const tip=tekniker?`${tittel}\nTekniker: ${tekniker}`:tittel;
        info.el.setAttribute("title",tip);
        info.el.setAttribute("data-bs-toggle","tooltip");
        try{ new bootstrap.Tooltip(info.el,{placement:"top",trigger:"hover",container:"body"}); }catch(_){}
      },

      eventClick(info){
        info.jsEvent.preventDefault();
        if(window.modalHandlers?.open) window.modalHandlers.open(info.event);
      },

      eventDrop: handleEventUpdate,
      eventResize: handleEventUpdate,

      events(fetchInfo, success, failure){
        const params={
          lokasjon:(document.getElementById("filterLokasjon")?.value||"").trim(),
          fag:(document.getElementById("filterFag")?.value||"").trim(),
          start:fetchInfo.startStr,
          end:fetchInfo.endStr
        };
        fetchEvents(params).then((events)=>{
          success(events);
          showZeroBanner(events.length===0);
        }).catch((err)=>{
          console.error("Henting oppgaver feilet:",err);
          failure(err);
          showZeroBanner(true);
        });

        function showZeroBanner(show){
          let el=document.getElementById("cal-empty-hint");
          if(!el){ el=document.createElement("div"); el.id="cal-empty-hint"; el.className="alert alert-warning mt-2"; el.style.display="none"; el.textContent="Ingen aktiviteter i valgt periode/filtre."; (document.getElementById("calendar")?.parentElement||document.body).prepend(el); }
          el.style.display=show?"":"none";
        }
      }
    });

    calendar.render();

    // Hjelpere
    if(typeof window.initICSExport === "function") window.initICSExport(calendar);
    if(typeof window.modalHandlers?.init === "function") window.modalHandlers.init(calendar);

    if(filterLok) filterLok.addEventListener("change", ()=>calendar.refetchEvents());
    if(filterFag) filterFag.addEventListener("change", ()=>calendar.refetchEvents());

    function handleEventUpdate(info){
      cleanupTooltips();
      const event=info.event;
      const startIso=event.startStr || (event.start?event.start.toISOString():null);
      let endIso=event.endStr || (event.end?event.end.toISOString():null);
      if(event.allDay && event.end){ const e=new Date(event.end); e.setDate(e.getDate()-1); endIso=e.toISOString(); }
      const startDate=startIso?startIso.split("T")[0]:null;
      const startTime=(startIso&&startIso.includes("T"))?startIso.split("T")[1].substring(0,5):"00:00";
      const endDate=endIso?endIso.split("T")[0]:startDate;
      const endTime=(endIso&&endIso.includes("T"))?endIso.split("T")[1].substring(0,5):"00:00";
      if(!startDate){ info.revert(); return; }
      const saver=window.apiServices?.updateTaskDates;
      if(typeof saver!=="function"){ info.revert(); return; }
      saver(event.id,{ start:`${startDate}T${startTime}`, end:`${endDate}T${endTime}` })
        .then(()=>calendar.refetchEvents())
        .catch(()=>info.revert());
    }
  });
})();
