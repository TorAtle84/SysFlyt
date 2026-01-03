export const locale = "nb-NO";

export const labels = {
  app: {
    title: "SluPlan – fremdriftsplanlegging",
    subtitle: "Skjelettvisning med dummy-data. Dra/endre oppgaver i Gantt for å teste interaksjoner.",
    importButton: "Importer fra Excel",
    resetButton: "Tilbakestill visning",
    alertsButton: "Varsler",
    projectSelector: {
      label: "Prosjekt",
      searchPlaceholder: "Søk etter prosjekt...",
      empty: "Ingen prosjekt tilgjengelig",
      newButton: "+ Nytt prosjekt",
      dateRange: (start: string, end: string) => `Periode: ${start} – ${end}`,
      orderNumber: (order: string | null | undefined) => (order ? `Ordrenr.: ${order}` : ""),
    },
    alerts: {
      heading: "Varsler",
      refresh: "Oppdater",
      loading: "Laster...",
      errorFallback: "Kunne ikke hente varsler.",
      categories: {
        upcoming: "Forfaller snart (≤ 7 dager)",
        today: "Forfaller i dag",
        overdue: "Forfalt",
      },
      empty: "Ingen varsler.",
      notAssigned: "Ikke tildelt",
      updatedPrefix: "Oppdatert",
    },
  },
  createProject: {
    title: "Nytt SluPlan-prosjekt",
    description: "Koble til eksisterende prosjekt eller registrer et nytt.",
    fields: {
      baseProject: "Prosjekt fra database",
      baseProjectPlaceholder: "Søk etter prosjektnavn eller ordrenummer",
      name: "Prosjektnavn",
      orderNumber: "Ordrenummer",
      startDate: "Startdato",
      endDate: "Sluttdato / overlevering",
      systems: "Tilleggs-systemer (ett per linje, valgfritt)",
    },
    actions: {
      cancel: "Avbryt",
      create: "Opprett prosjekt",
      creating: "Oppretter...",
    },
    errors: {
      name: "Prosjektnavn er påkrevd.",
      dates: "Start- og sluttdato må fylles ut.",
      dateOrder: "Sluttdato kan ikke være før startdato.",
    },
    success: "Prosjekt opprettet.",
  },
  gantt: {
    heading: "Gantt",
    zoom: {
      day: "Dag",
      week: "Uke",
      month: "Måned",
    },
    noTasks: "Ingen oppgaver ennå.",
    unassigned: "Ikke tildelt",
    validation: {
      predecessor: "Kan ikke starte før forgjenger er ferdig.",
    },
    taskColumn: "Oppgave",
  },
  taskTable: {
    heading: "Oppgaveliste",
    searchPlaceholder: "Søk (navn, ressurs, kommentar)",
    columns: {
      name: "Navn",
      start: "Start",
      end: "Slutt",
      assignee: "Tildelt",
      status: "Status",
    },
    notAssigned: "–",
  },
  rightPanel: {
    heading: "Detaljer",
    close: "Lukk",
    noTask: "Velg en oppgave for detaljer.",
    task: {
      label: "Oppgave",
      statusPrefix: "Status:",
    },
    assignment: {
      title: "Tildelt ressurs",
      none: "(Ingen tildelt)",
      addPlaceholder: "Legg til ny ressurs",
      save: "Lagre",
      saving: "Lagrer...",
      errors: {
        update: "Kunne ikke oppdatere ressurs.",
        save: "Kunne ikke lagre ressurs.",
      },
    },
    comments: {
      title: "Kommentarer",
      empty: "Ingen kommentarer ennå.",
      newTitle: "Ny kommentar",
      authorPlaceholder: "Navn",
      textPlaceholder: "@navn for å nevne noen...",
      add: "Legg til",
      loading: "Lagrer...",
      mentionsPrefix: "Mentions:",
      defaultAuthor: "Prosjektleder",
      errors: {
        empty: "Skriv en kommentar først.",
        save: "Kunne ikke lagre kommentar.",
        unexpected: "Uventet feil ved lagring av kommentar.",
      },
    },
    attachments: {
      title: "Vedlegg",
      empty: "Ingen vedlegg enda.",
      info: "Filene lagres som metadata (demo).",
      uploading: "Laster opp...",
      errors: {
        upload: "Kunne ikke laste opp fil.",
      },
    },
    exportIcs: "Eksporter ICS",
  },
  importDialog: {
    title: "Importer systemoppgaver",
    description:
      "Velg en Excel-fil med kolonnen \"System\". For hvert unike system opprettes en hovedoppgave med seks standard underoppgaver.",
    label: "Excel-fil",
    selectedFile: "Valgt fil:",
    cancel: "Avbryt",
    submit: "Importer",
    submitting: "Importer...",
    selectPrompt: "Velg en Excel-fil først (kolonne 'System').",
    unexpected: "Uventet svar fra server.",
    importError: "Kunne ikke importere Excel-filen.",
    missingProject: "Velg et prosjekt før du importerer.",
  },
  reports: {
    heading: "Rapporter",
    subtitle: "Oversikt over oppgaver per fag, ressurs og valgt tidsintervall.",
    filterLabel: "Velg tidsfilter",
    refresh: "Oppdater",
    loading: "Laster...",
    error: "Kunne ikke hente rapporter.",
    perDiscipline: {
      title: "Per fag",
      summary: (count: number, totalDuration: string) =>
        `Totalt ${count.toLocaleString(locale)} fag · ${totalDuration} totalt`,
      noData: "Ingen oppgaver registrert.",
      headers: {
        discipline: "Fag",
        tasks: "Oppgaver",
        planned: "Planlagt",
        inProgress: "Pågår",
        completed: "Ferdig",
        avgDuration: "Snitt varighet",
      },
    },
    perUser: {
      title: "Per ressurs",
      summary: (count: number, totalDuration: string) =>
        `Totalt ${count.toLocaleString(locale)} ressurser · ${totalDuration} totalt`,
      noData: "Ingen oppgaver knyttet til ressurs.",
      headers: {
        user: "Ressurs",
        tasks: "Oppgaver",
        planned: "Planlagt",
        inProgress: "Pågår",
        completed: "Ferdig",
        avgDuration: "Snitt varighet",
      },
    },
    time: {
      title: "Tidsintervall",
      noData: "Ingen oppgaver i valgt tidsintervall.",
      headers: {
        task: "Oppgave",
        discipline: "Fag",
        assignee: "Ressurs",
        status: "Status",
        start: "Start",
        end: "Slutt",
        duration: "Varighet",
      },
      showing: (count: number, total: number) =>
        `Viser ${count.toLocaleString(locale)} av ${total.toLocaleString(locale)} oppgaver i perioden.`,
      summary: {
        planned: "Planlagt",
        inProgress: "Pågår",
        completed: "Ferdig",
        total: "Totalt",
      },
    },
    lastUpdated: (timestamp: string) => `Sist oppdatert ${timestamp}`,
    filters: {
      upcoming14: "Kommende 14 dager",
      upcoming30: "Kommende 30 dager",
      previous30: "Siste 30 dager",
    },
  },
  common: {
    unassigned: "Ikke tildelt",
    unknown: "Ukjent",
    unknownDate: "Ukjent",
    statusPlanned: "planlagt",
  },
};

const dateFormatter = new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso?: string): string {
  if (!iso) return labels.common.unknownDate;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return labels.common.unknownDate;
  return dateFormatter.format(date);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return labels.common.unknownDate;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return labels.common.unknownDate;
  return dateTimeFormatter.format(date);
}

export function formatDurationDays(days: number): string {
  if (!Number.isFinite(days)) return "-";
  const safeDays = Math.max(0, Math.round(days));
  return `${safeDays.toLocaleString(locale)} d`;
}

export function describeDue(daysUntilDue?: number): string {
  if (typeof daysUntilDue !== "number") return "";
  if (daysUntilDue < -1) {
    return `Forfalt for ${Math.abs(daysUntilDue)} dager siden`;
  }
  if (daysUntilDue === -1) {
    return "Forfalt i går";
  }
  if (daysUntilDue === 0) {
    return "Forfaller i dag";
  }
  if (daysUntilDue === 1) {
    return "Forfaller i morgen";
  }
  return `Forfaller om ${daysUntilDue} dager`;
}
