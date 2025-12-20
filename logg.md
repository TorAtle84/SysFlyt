docker-compose -f docker-compose.dev.yml up --build

# Endringslogg (SysFlyt)

## 2025-12-13 – Modul: Modell (BIM/IFC) – Fase 1

### Database (Prisma)
- Lagt til `ModelFormat` og `ModelStatus` enums.
- Lagt til nye modeller/tabeller: `BimModel`, `BimModelComponent`, `BimModelSession`.
- Lagt til relasjoner fra `Project` og `User` til BIM-modellene.
- Ny migrasjon: `prisma/migrations/20251212210000_add_bim_models/migration.sql`.

### Backend (API + lagring)
- Nye endepunkter:
  - `GET/POST /api/projects/[projectId]/models`
  - `GET/PATCH/DELETE /api/projects/[projectId]/models/[modelId]`
  - `GET /api/projects/[projectId]/models/[modelId]/components`
  - `GET /api/projects/[projectId]/models/jump-to-protocol?fullTag=...` (løser MC-protokoll + item for “Gå til protokoll” fra viewer)
  - Sesjoner (delt visning, polling):
    - `GET/POST /api/projects/[projectId]/models/[modelId]/sessions`
    - `GET/PATCH /api/projects/[projectId]/models/[modelId]/sessions/[sessionId]`
    - `POST /api/projects/[projectId]/models/[modelId]/sessions/[sessionId]/join`
    - `POST /api/projects/[projectId]/models/[modelId]/sessions/[sessionId]/leave`
- Filstruktur under `uploads/{projectId}/models/`:
  - `originals/{modelId}_original.ifc`
  - `converted/{modelId}/metadata.json`
  - `converted/{modelId}/components.json`
- Oppdatert `/api/files/[...path]` til å serve `models/*` (med tilgangssjekk via prosjekt + modellId).
- Konvertering: IFC støttes som “mock pipeline” (ekstraksjon av tags + generert 3D “komponent-bokser”).

### Frontend (UI/UX)
- Ny prosjektmeny-link: `Modell` (`/projects/[projectId]/models`).
- Ny side: `/projects/[projectId]/models` med:
  - Drag & drop + progress + avbryt opplasting.
  - Grid/listevisning, søk og status-badges.
  - Viewer-modal (90% viewport) med orbit-kontroller, systemfilter, søk og highlight.
- Delt visning (MVP): host kan starte sesjon og kopiere invitasjonslink; deltaker følger host via polling.
- UI-tilpasning: Modell-siden viser nå tydelig listekort med “Lastet opp”, “Størrelse” og “Komponenter funnet”, samt handlinger “Åpne viewer”, “Se komponentliste” og “Slett”.
- Ny “Komponentliste”-dialog med søk på `fullTag` og snarvei til å åpne viewer på valgt rad.
- Opplastingsmodal viser nå både opplastingsprogress og konverteringsprogress (polling via `metadata.progress`).
- Viewer: “Gå til protokoll” åpner riktig MC-protokollpunkt basert på `fullTag` og scroller/highlighter raden.
- Viewer-modal: topp-linje med vinduskontroller (skjul/vis sidepanel, fullskjerm, lukk) og skjuler standard Dialog-close.
- Viewer: toolbar oppdatert (ikonknapper + “Søk komponent…”), samt etasjefilter (klar for IFC-nivåer) og sync av filtre i delt visning.
- Protokoll: “Plassering ▼” er nå en meny med `Systemskjema`, `Arbeidstegning` og `Modell` (viser kun valg som finnes).
- Delt visning: begrensning på maks 10 deltakere + deltaker får beskjed hvis sesjonen avsluttes.

### Protokoll MC-integrasjon
- `LocationModal` viser nå “3D Modell” dersom match finnes i `BimModelComponent` (fullTag).
- Protokollvisning kan åpne modell-viewer direkte eller via valgmodal.

### Miljøvariabler
- Lagt til `MODEL_MAX_UPLOAD_MB` i `.env.example`.

### TODO / Neste iterasjon
- IFC→glTF/GLB "ekte" konvertering (IfcOpenShell/IFC.js) + reelle koordinater/bounding boxes.
- Bedre matching (fallback på systemCode+componentTag, håndtering av `:versjon`).
- Notifikasjoner/invitasjoner til delt visning (eksisterende notification-system).

## 2025-12-13 – UI/UX optimalisering (PC + mobil)

### Kartlegging (hovedfunn)
- Mobil: Prosjektmeny (sekundær sidebar) var skjult → vanskelig å navigere inne i prosjekt.
- Mobil: MC-protokoll detalj var i praksis en horisontal “desktop-tabell”.
- Mobil: Masseliste var horisontal tabell med `min-width`, krevde mye scrolling.
- Mobil: Flere modaler kunne bli høyere enn viewport uten scroll.

### Utbedringer (implementert)
- Mobil prosjektmeny:
  - Ny “prosjektmeny”-knapp (øverst til høyre) når man er inne i prosjekt-visninger.
  - Prosjektmenyen åpnes som en drawer fra høyre, og lukker seg ved navigasjon.
  - Left sidebar “collapsed”-state påvirker ikke lenger mobil (tekst/tema/varsler vises).
  - Justert topp-padding i main slik at fast meny-knapper ikke overlapper innhold på `sm`.
- MC-protokoll detalj (`/projects/[projectId]/protocols/[protocolId]`):
  - Mobil-visning er nå kortliste med “expand/collapse” pr linje, med samme funksjoner (status, plassering, ansvarlig/utførende, foto/notat/slett).
  - Desktop beholder tabell.
  - Header (periode/tilordnet/systemeier) wrap’er og går fullbredde på mobil (ingen horisontal overflow).
- Masseliste:
  - Mobil-visning er nå kortliste; desktop beholder tabell.
- Prosjekt-dashboard:
  - Fremdriftseksjon (donut + bars) stackes på mobil for bedre lesbarhet.
- Modell-viewer:
  - Sidepanel starter kollapset på små skjermer (<768px) for mer plass til 3D.
- Dialog:
  - Standard `DialogContent` har nå `max-h` + `overflow-y-auto` for trygg scrolling på mobil.
- Dokumenter (Arbeidstegninger/Systemskjema):
  - Dokumentliste har nå mobil-kortvisning med actions-meny; desktop beholder tabell.
  - Verifiseringsmodal: statistikk-grid stapler på mobil + avviksliste vises som kort.
  - Komponentdialog: kontrollene stacker på mobil, og komponentlisten har mobil-kortvisning (desktop beholder tabell).
- Modell:
  - Komponentliste-modal har mobil-kortvisning (desktop beholder tabell) og bedre høyde på små skjermer.
- FDV:
  - Supplier-/produkt-popovers skalerer nå med viewport (hindrer at 400px popover “stikker ut” på mobil).
  - Bulk-linking-liste er mer mobilvennlig (skjuler kolonne og viser “Nåværende” inline på mobil).
- PDF-visning:
  - `PDFToolbar` er gjort responsiv (kolonne-layout på mobil, fullbredde søk, skjuler tekstlabels på små skjermer).
- PratLink:
  - Mobil-header med room-select og medlemoversikt i dialog; desktop beholder sidebar.
  - Mention-dropdown skalerer med viewport på mobil.

### Verifisering
- `npm.cmd run build` (Next.js) er grønn etter endringene.

## 2025-12-13 - Prisma migrasjoner (dev-db)

### Problem
- Runtime-feil i prosjekt-layout: `The table public.BimModel does not exist`.
- `prisma migrate deploy` feilet pga. eksisterende schema (drift): `DocumentComponent.page` fantes allerede.

### Tiltak
- Baselinet eksisterende DB ved å markere migrasjoner som applied:
  - `20251126060705_init_docker_db`
  - `20251126102209_update_mass_list_schema`
- Kjørte `npx.cmd prisma migrate deploy` for å applisere:
  - `20251212210000_add_bim_models`
  - `20251212214000_add_mc_item_comment`

### Resultat
- Tabeller finnes nå i DB: `BimModel`, `BimModelComponent`, `BimModelSession`.
- `npx.cmd prisma migrate status` rapporterer: "Database schema is up to date!".

## 2025-12-13 - Tema (lys/mørk)

### Problem
- UI viste alltid mørkt tema uansett valg i temavelger.

### Tiltak
- Byttet til class-basert theming i `src/app/globals.css` (`:root.dark`) i stedet for `@media (prefers-color-scheme: dark)`.
- La til `@custom-variant dark` i `src/app/globals.css` slik at Tailwind sin `dark:`-variant følger `.dark`-klassen (ikke OS-tema).
- Oppdatert `src/components/ui/theme-toggle.tsx` til å bruke `resolvedTheme` for korrekt toggling (også når theme er `system`).

### Resultat
- Du kan nå velge mellom lyst og mørkt tema i UI.

## 2025-12-13 - PDF-visning (MC → PDF)

### Problem
- Console warning ved åpning av PDF fra MC-protokoll: `Received NaN for the ry attribute` i `AnnotationLayer`.

### Årsak
- `pageWidth/pageHeight` var 0 i første render (før PDF-side hadde målt størrelse), og beregning av aspekt-ratio ga `NaN`.

### Tiltak
- Robust håndtering i `src/components/pdf-viewer/annotation-layer.tsx`:
  - Returnerer `null` til side-størrelse er tilgjengelig.
  - Filtrerer bort markører med ugyldige koordinater.
  - Bruker safe aspect-ratio for `ry`.

## 2025-12-13 - Kalender (MC-protokoll periode)

### Problem
- Ukedagsrad (Man/Tir/...) i kalenderen var forskjøvet/feil over datoene i start/slutt-dato picker.

### Årsak
- `src/components/ui/calendar.tsx` brukte classNames-keys fra eldre `react-day-picker`, mens prosjektet kjører `react-day-picker@9`.

### Tiltak
- Oppdatert `src/components/ui/calendar.tsx` til riktige `react-day-picker@9`-nøkler (`weekday`, `day_button`, `week_number_header`, osv.) slik at header og grid bruker samme layout.

### Resultat
- Ukedagene står nå riktig over datoene i protokollens start/slutt-dato picker.

### Oppdatering
- Kalenderen viser nå måned/år med pil-knapper på hver side (navLayout "around"), tilsvarende: `< Des 2025 >`.

## 2025-12-13 - @mentions → Varsler (notifikasjonsbjelle)

### Mål
- Alle @mentions skal gi varsling til nevnte bruker.
- Klikk på varsling skal ta brukeren direkte til riktig sted (og tydelig vise kontekst).

### Implementert
- MC-korrespondanse (@mention i protokoll-linje):
  - Oppdatert API (`src/app/api/projects/[projectId]/mc-protocols/[protocolId]/items/[itemId]/comments/route.ts`) til å lage `mc_mention`-varsler med rik metadata + deep-link (`?item=...&notes=1&comment=...`).
  - Protokoll-side åpner automatisk korrespondanse-modal ved deep-link, og scroller/highlighter kommentaren (`src/components/pages/project/protocol-detail.tsx`, `src/components/pages/project/comment-thread.tsx`).
- PratLink chat (@mention i melding):
  - Varsel-link går nå direkte til rom + melding (`?room=...&message=...`) og melde-element highlightes (`src/components/pages/pratlink/chat-room-view.tsx`).
- Notifikasjonsbjelle:
  - Bedre tekst/kontekst (prosjektnavn + preview) og støtte for `mc_mention`, samt fallback for `metadata.message/link` (`src/components/layout/notification-dropdown.tsx`).

## 2025-12-13 - Oppdatering (mobil + tema + varsler)

### Prisma (stabil oppstart)
- La til `predev` og `prestart` som kjører `prisma db push --skip-generate` i `package.json` for å unngå runtime-feil ved manglende tabeller (og unngå Windows EPERM ved `prisma generate` mens appen kjører).

### Tema (lys/mørk)
- Strammet inn theming i `src/app/globals.css`: flyttet tokens til `:root` (lys) og `.dark` (mørk), samt satt `color-scheme` for riktige native UI-farger.
- Fikset feil variabel i auth-layout: `var(--background)` → `var(--color-background)` i `src/app/(auth)/layout.tsx`.
- Gjorde dashboard-hero og mode-toggle tema-aware (`src/components/pages/dashboard/dashboard-client.tsx`, `src/components/ui/mode-toggle.tsx`).
- Gjorde PDF-bakgrunn tema-aware (`src/components/pdf-viewer/pdf-viewer.tsx`, `src/components/pdf-viewer/pdf-viewer-wrapper.tsx`, `src/components/pages/project/document-viewer-modal.tsx`).
- Fjernet hardkodet `bg-white` i MC-kommentartråd (`src/components/pages/project/comment-thread.tsx`).

### Kalender (periode i MC-protokoll)
- La inn formatert caption (kort måned + år) og bedre alignment for ukedag-header i `src/components/ui/calendar.tsx`.
- Nav-knapper i caption er nå ghost-stil for tydelig `< Des 2025 >`-uttrykk.

### PDF (NaN i markører)
- Ekstra guard på aspect-ratio/ellipse-radius i `src/components/pdf-viewer/annotation-layer.tsx` for å eliminere `NaN` i SVG-attributter.

### Varsler (@mentions)
- Forbedret legacy-mentions i `src/app/api/annotations/[annotationId]/comments/route.ts`:
  - Dedupe + filtrer bort self
  - Filtrer mottakere til `ACTIVE` + prosjektmedlem/Admin
  - Rik metadata + deep-link i varsel
- Gjorde `mention`-varsler mer kontekst-rike i `src/components/layout/notification-dropdown.tsx` (prosjekt/dokument + preview + link fra metadata).

### Mobil
- Safe-area posisjonering for mobil-menyknapper i `src/components/layout/app-shell.tsx` (hindrer overlapp med notch).
- Mer robust modal-høyde på notat-dialog i MC-protokoll (`src/components/pages/project/protocol-detail.tsx`).
- Oppdatert `Textarea` til `text-base` på mobil (unngår iOS zoom) i `src/components/ui/textarea.tsx` + justert MC-kommentarinput.

### Verifisering
- `npm.cmd run build` er grønn etter endringene.
