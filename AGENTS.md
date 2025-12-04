Du opptrer nå som en Senior Full-Stack Arkitekt og Lead UI/UX Designer. Ditt oppdrag er å bygge fundamentet for applikasjonen "SLUTTFASE".

Løsningen skal kunne deployes på en DigitalOcean Droplet. All kode skal være produksjonsklar, containerisert (Docker) og følge gode sikkerhets- og arkitekturprinsipper.

GENERELLE TEKNISKE FØRINGER (UTEN Å LÅSE TECH STACK)

Velg selv programmeringsspråk, rammeverk og UI-verktøy som passer godt sammen og er egnet for en moderne, sikker, web-basert applikasjon.

Løsningen skal ha:

En web-frontend med profesjonell UI/UX.

En backend med tydelig struktur for API/endepunkter.

En relasjonsdatabase, der PostgreSQL skal brukes som database-motor (kjøres via Docker Compose).

Et egnet ORM- eller migreringsverktøy for valgt språk/rammeverk.

Et modent autentiserings- og autorisasjonsoppsett (RBAC).

Styling og interaksjon:

UI skal være responsivt, støtte lys/mørk modus, og ha et uttrykk som kan beskrives som:
"Construction Tech møter Apple" – rent, moderne, profesjonelt.

Bruk et passende komponentbibliotek og eventuelt animasjons-/overgangsbibliotek for valgt stack.

Deployment:

Generer en docker-compose.yml for både dev og prod.

Generer en Dockerfile basert på valgt runtime (språk/rammeverk), optimalisert for produksjon.

Inkluder en .env.example med nødvendige miljøvariabler.

VIKTIG: Du skal bruke dine evner til å skrive filer direkte til disk og lage en komplett mappestruktur for prosjektet (/sluttfase).

Hvis du ser en mappe som heter Base, analyser kodestilen der, men prioriter moderne "best practices" for denne nye applikasjonen.

FASE 1 – AUTENTISERING, RBAC OG DASHBOARD-GRUNNSTRUCTUR
1. Autentisering & Registrering

Registreringsfelter:

Fornavn

Etternavn

E-post

Telefon

Firma

Tittel

Alle nye brukere skal få status: PENDING.

Brukere med status PENDING:

Skal kunne logge inn, men ledes til en egen visning:
"Venter på godkjenning".

Hardkodet admin-logikk:

E-postene tm5479@gk.no og flytlink.app@gmail.com skal automatisk få:

Rolle: ADMIN

Status: ACTIVE

Dette kan løses med seeding av databasen eller logikk i autentiseringsflyten (f.eks. callback/after-register).

2. Rollemodell (RBAC)

Definer følgende roller og tillatelser:

ADMIN

Kan godkjenne brukere.

Kan tildele roller.

Kan slette alt (brukere, prosjekter, innhold).

PROSJEKTLEDER

Kan opprette prosjekter.

Kan endre prosjektstatus.

Kan kommentere.

Kan invitere brukere til prosjekter.

BRUKER

Kan endre status i prosjekter de er invitert til.

Kan kommentere.

LESER

Read-only tilgang til prosjekter de er invitert til.

3. Hoved-Dashboard (UI/UX)

Design:

Skal støtte lys/mørk modus.

Uttrykk: Construction Tech + Apple (rent, detaljfokusert, intuitivt).

Visning:

Grid- og listevisning av prosjekter.

Del inn i:

"Mine prosjekter"

"Inviterte prosjekter"

Søk:

Globalt søkefelt som filtrerer i sanntid på prosjektkort (navn, beskrivelse, status osv.).

Interaksjon:

Bruk et egnet animasjons-/overgangsbibliotek i valgt stack for smidige overganger når:

Kort åpnes/lukkes.

Faner byttes.

Filter/søk endres.

4. Prosjekt-funksjoner (CRUD)

For entiteten Project:

Opprett prosjekt.

Arkiver prosjekt (flyttes til egen Arkiv-visning).

Slett prosjekt:

KUN tillatt fra Arkiv-visning.

Inviter medlemmer:

Søkefelt for å finne andre aktive brukere i systemet.

Legg til brukere med valgt rolle i prosjektet.

Backup (mock i første omgang):

En knapp i Admin-panelet eller Dashboard:

Trigger en (foreløpig simulert) database-dump.

Lag UI rundt dette (f.eks. modal/progress).

5. Instruksjoner for generering (Fase 1)

Sett opp prosjektstrukturen i en mappe: /sluttfase.

Generer:

docker-compose.yml

.env.example

Definer databasen (f.eks. via ORM/migreringer) med entiteter som minst dekker:

User

Role (enum/felt)

Project

ProjectMember

Comment

Implementer autentiseringsflyt med:

Registrering

Login

Håndtering av PENDING–> "venter på godkjenning"-visning

Hardkodet admin-logikk for spesifikke e-poster

Lag kjernekomponenter for UI:

Global layout

Navbar

Dashboard-grid/list for prosjekter

Implementer et Godkjennings-panel for ADMIN:

Liste over PENDING-brukere.

Mulighet til å sette status til ACTIVE.

Mulighet til å sette rolle.

Når fundamentet (auth, database-schema, dashboard) er på plass:
Stopp og be om instruksjoner for "Fase 2: Prosjektinnhold".

FASE 2 – PROSJEKT-INNHOLD ("INNMATEN")

Du fortsetter i rollen som Senior Full-Stack Arkitekt og Lead UI/UX Designer for applikasjonen "SLUTTFASE".

VIKTIG KONTEKST FRA BASE-MAPPEN (ID-STRUKTUR)

I mappen "Base" (kunnskapsgrunnlaget ditt) ligger logikken for ID-struktur.

ID-mønsteret er strengt:

{byggnr}{system}{komponent}{typekode}

Eksempel (delt opp):

+1245 = bygg

=3601.0001 = system

RTA4001 = komponent

RTA0001 = type

Dette mønsteret er kjernen i applikasjonen, og skal brukes til regex-matching og videre logikk.

STEG 1 – Oppdatering av Fase 1 (User Profile)

Før vi går inn i prosjektene, må vi legge til en funksjon i hovedvisningen (prosjekt-oversikten):

Profil-meny

Legg til en dropdown-meny ved brukerens avatar/navn.

Rediger profil

Lag en /profile-side eller modal hvor innlogget bruker kan redigere:

Telefon

Tittel

Firma

Passord

Feltene E-post og rolle skal være read-only.

STEG 2 – Prosjekt-Dashboard (Layout & Navigasjon)

Når en bruker klikker seg inn på et prosjekt /projects/[projectId], skal layouten endres til et prosjekt-dashboard.

Sidebar/Meny (venstrestilt):

Menyen skal minst inneholde:

Hovedside (Dashboard)

Arbeidstegninger

Systemskjema

Masseliste

Protokoller MC

Fremdrift

Innhold på "Hovedside" (Dashboard Widgets):

Bruk et egnet graf-/visualiseringsbibliotek i valgt stack, samt animasjoner der det gir mening.

Dynamisk Fremdrift

4 cards med tall/status:

"Utførte"

"Avvik"

"Pågår"

"Kommende"

Total Fremdrift

En visuell fremdriftsindikator:

F.eks. progresjonsbar eller "donut chart".

Splittet i: Fullført vs Ikke fullført.

Siste Aktivitet

En feed som viser de siste kommentarene/aktivitetene på tvers av tegninger/dokumenter.

Nylige Dokumenter

Liste over de 5 sist opplastede/endrede filene med hurtiglenke.

Meldingssentral

Seksjon som viser om brukeren har uleste mentions (@Navn) fra tegninger/dokumenter.

STEG 3 – Dokumenthåndtering & "The Brain" (Arbeidstegninger/Systemskjema)

Dette er kjernen i applikasjonen og krever strukturert logikk.

3.1 Opplasting & System-tagging

Lag et opplastingsområde (helst med Drag & Drop).

Ved opplasting/redigering skal brukeren kunne angi hvilke {system} tegningen tilhører:

F.eks. 360, 420.

Det skal være mulig å:

Velge flere systemer per dokument.

Opprette nye tilpassede systemflagg.

Lagre metadata i databasen, f.eks. via entiteter/tabeller:

Document

SystemTag

Relasjon mellom disse.

3.2 QA Skanner-Motor (Logikk)

Lag en funksjon, f.eks.:

scanDocumentForComponents(content, systemTag)

Formål:

Finne komponenter i tekstinnhold (OCR-resultat eller PDF-tekst) som matcher mønsteret
{byggnr}{system}{komponent}{typekode}.

Filtrering:

Skanneren skal prioritere ID-er som matcher den/de {system}-taggene som er satt på dokumentet.

3.3 "Verifiser mot Masseliste" (Matrise-funksjon)

På dokument-visningen:

Legg inn en knapp "Verifiser komponenter".

Logikk:

Hent alle ID-er funnet i dokumentet.

Sjekk disse mot tabellen MassList i databasen.

UI-resultat (Matrise):

En modal/popup med to kolonner:

"Funnet i tegning"

"Funnet i Masseliste"

Avvik:

Vis rødt flagg hvis:

Komponent finnes i Masseliste, men ikke i tegning.

Komponent finnes i tegning, men ikke i Masseliste.

Override:

Legg til en knapp "Godkjenn avvik" som lar bruker manuelt sette status til OK selv om programmet ikke fant match.

Teller:

Ved siden av hvert dokument i dokumentlisten:

Vis et tall = antall unike komponenter funnet.

Klikk på tallet åpner matrisen nevnt over.

Knapp (fremtidig):

Inkluder en knapp "Eksporter til Protokoll" som foreløpig er disabled.

STEG 4 – Interaktiv PDF/Bilde-visning & Annotering

Lag en dokumentviser basert på valgt stack (f.eks. PDF-viewer eller bilde-canvas).

Annotering & Mentions

Bruker skal kunne klikke hvor som helst på tegningen for å sette en "Pin".

Status-Pin:

Åpen sak = oransje prikk (gjerne med pulserende animasjon).

Lukket sak = grønn prikk (statisk).

Kommentarfelt:

Når man trykker på en prikk, åpnes en dialog/boks for kommentarer.

@Mention-logikk:

Hvis bruker skriver @ i kommentarfeltet:

Vis en liste over prosjektmedlemmer.

Ved sending:

Lagre kommentaren.

Opprett en Notification til brukeren(e) som ble tagget.

Dette skal vises i "Meldingssentralen" på prosjekt-dashboardet.

Databasedesign – utvidelser

Utvid schema/datamodell (med passende felt/typer for valgt ORM) til å inkludere minst:

Document

url

type (tegning, skjema, masseliste, annet)

relasjon til SystemTag

relasjon til Project

SystemTag

systemkode (f.eks. 360, 420)

beskrivelse (valgfritt)

MassList

id

code (full ID, f.eks. {byggnr}{system}{komponent}{typekode})

description

system

relasjon til Project (hvis relevant)

Annotation

x, y

status [OPEN, CLOSED]

relasjon til Document

Comment

content

author (relasjon til User)

relasjon til Annotation

Notification

relasjon til mottaker (User)

relasjon til kilde (f.eks. Comment/Annotation)

lest/ulest-status

tidsstempel

Instruksjoner for generering (Fase 2)

Oppdater datamodellen først (ORM/schema/migreringer).

Generer filer/komponenter for:

Prosjekt-layout med sidebar/navigasjon.

Dashboard-widgets på prosjektnivå (fremdrift, siste aktivitet, nylige dokumenter, meldingssentral).

Implementer:

Dokument-opplasting med system-tagging.

Skanner-funksjon (kan i første omgang simuleres/stubbes, men strukturen må være på plass).

"Verifiser mot Masseliste"-matrise med avvikslogikk.

Lag dokumentvisning med:

Pins (annoteringer).

Kommentarflyt.

@mentions og tilhørende notifikasjoner.

Sørg for at UI fremstår som et showcase-produkt:

Gjennomført design.

Konsistent typografi og spacing.

God bruk av meldinger, tilbakemeldinger og states (loading, tomme lister, feil osv.).

Oppsummering til Codex CLI:

Velg selv egnet kodespråk, rammeverk og designverktøy basert på kravene over.

Oppfyll krav til:

RBAC

Autentisering

Prosjektstruktur

Dokumenthåndtering

Annotering

Regex-basert ID-logikk

Dashboard og meldingssentral

Lever en komplett, containeriserbar prosjektstruktur som kan kjøres på en DigitalOcean Droplet.