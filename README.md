# SLUTTFASE

Next.js (App Router) + Prisma/PostgreSQL + NextAuth-basert plattform med RBAC, prosjektoversikt, dokumenthåndtering, annotasjoner og mock-backup for DigitalOcean deploy.

## Kjapp oversikt
- Autentisering/registrering med PENDING-flow, hardkodet admin-e-post (tm5479@gk.no, flytlink.app@gmail.com) settes automatisk til ACTIVE/ADMIN.
- Roller: ADMIN, PROJECT_LEADER, USER, READER. PENDING kan logge inn men ser egen venteside.
- Dashboard: grid/list-visning, live-søk, mine/inviterte prosjekter, backup-knapp (mock).
- Prosjektside: sidebar-navigasjon, fremdriftswidgets, dokumentliste med system-tagging, skanne/verifisere mot masseliste (regex {byggnr}{system}{komponent}{typekode}), annoteringer med pins og @mentions, meldingssentral-stub.
- Database: Prisma med entiteter for User/Project/ProjectMember/Document/SystemTag/MassList/Annotation/Comment/Notification + NextAuth-tabeller.

## Komme i gang (lokalt)
```bash
npm install
npx prisma db push
npx prisma db seed   # oppretter admin-brukere og demo-data
npm run dev
```
Miljøvariabler finnes i `.env.example` (kopier til `.env`). `DEFAULT_ADMIN_PASSWORD` brukes i seeding.

## Docker
- Dev: `docker compose -f docker-compose.dev.yml up --build`
- Prod: `docker compose -f docker-compose.prod.yml up --build`
Begge starter Postgres og kjører `npm run db:push` før appen (`NEXTAUTH_URL` settes fra .env i prod).

## Viktige filer/mapper
- `prisma/schema.prisma` – datamodell inkl. enums for roller/status.
- `prisma/seed.ts` – admin-seeding, demo-prosjekt, system-tagger 360/420, masselisteeksempler.
- `src/lib/id-pattern.ts` – regex for komponent-ID `{byggnr}{system}{komponent}{typekode}`.
- `src/app/(auth)/*` – login, register, pending.
- `src/app/(app)/dashboard` – hoveddashboard med prosjektgrid/list.
- `src/app/(app)/admin/approvals` – adminpanel for PENDING-brukere.
- `src/app/(app)/projects/[id]` – prosjektlayout med sidebar, widgets, dokument-/annotasjonsflyt.
- `docker-compose.dev.yml` / `docker-compose.prod.yml`, `Dockerfile`, `.env.example`.

## ID-/QA-logikk
- Regex matcher ID-mønsteret (+1245=3601.0001RTA4001RTA0001 osv).
- `scanDocumentForComponents` og `verifyAgainstMassList` brukes i API og UI for å telle komponenter og markere avvik.

## Sikkerhet/RBAC
- Middleware beskytter `/dashboard`, `/projects`, `/admin`, `/profile` og relevante API-ruter; PENDING omdirigeres til `/pending`.
- ADMIN kan godkjenne/rolle-sette brukere, trigge backup (mock), arkivere/slette prosjekter.

## Deploy-notater
- Prod kjører `npm run db:push && npm run start` i containeren. Legg inn `NEXTAUTH_SECRET`, `NEXTAUTH_URL` og `DATABASE_URL` i `.env`.
- Appen bruker `node:20-alpine` i Dockerfile. Volumer i compose holder Postgres-data persistente.
