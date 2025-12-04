# Sluttfase - Project Documentation

## Overview
This is a Next.js-based project management platform for construction projects (Norwegian: "Sluttfase"). The application provides:
- Role-based access control (RBAC) with roles: ADMIN, PROJECT_LEADER, USER, READER
- Project management with document handling
- PDF annotation and commenting system
- Mass list management with TFM (Technical Facility Management) codes
- User approval workflow (PENDING users need admin approval)

## Recent Changes (Dec 4, 2024)
- **Complete Component Library Rebuild**: After incomplete GitHub import, rebuilt the entire component library
- **UI Components Created**:
  - `src/components/ui/` - card, badge, button, input, separator, dialog, select, checkbox, label, popover, textarea
- **Layout Components**:
  - `src/components/layout/app-shell.tsx` - Main app layout with responsive sidebar navigation
- **Dashboard Components**:
  - `src/components/dashboard/project-explorer.tsx` - Project browsing and navigation
  - `src/components/dashboard/backup-trigger.tsx` - Database backup interface
  - `src/components/dashboard/control-center.tsx` - Dashboard control panel
- **Project Management Components**:
  - `src/components/projects/project-sidebar.tsx` - Project document navigation
  - `src/components/projects/project-header.tsx` - Project header with actions
  - `src/components/projects/project-content-switcher.tsx` - Content tab switcher
- **Mass List Components**:
  - `src/components/mass-list/mass-list-upload.tsx` - Excel import interface
  - `src/components/mass-list/mass-list-table.tsx` - TFM data display table
- **PDF Viewer Components**:
  - `src/components/pdf-viewer/pdf-viewer-wrapper.tsx` - PDF viewing with annotations
  - `src/components/pdf-viewer/save-and-close-button.tsx` - Save annotation actions
- **Admin & Profile Components**:
  - `src/components/admin/approval-panel.tsx` - User approval interface
  - `src/components/profile/profile-form.tsx` - User profile editing
- **API Routes Created**:
  - `src/app/api/projects/route.ts` - Project CRUD operations
  - `src/app/api/mass-list/route.ts` - Mass list operations
  - `src/app/api/profile/route.ts` - User profile management
- **Infrastructure Setup**:
  - NextAuth configuration with credentials provider
  - Prisma client singleton
  - Tailwind CSS v4 configuration
  - Database connected and seeded

## Admin Accounts
The database has been seeded with two admin accounts:
- Email: tm5479@gk.no / Password: Admin123!
- Email: flytlink.app@gmail.com / Password: Admin123!

These emails are hardcoded in `src/lib/utils.ts` as `adminEmails` array and automatically get ACTIVE/ADMIN status upon registration.

## Project Architecture
- **Framework**: Next.js 16 with App Router and Turbopack
- **Database**: PostgreSQL (Replit/Neon) with Prisma ORM
- **Authentication**: NextAuth v4 with credentials provider
- **Styling**: Tailwind CSS v4
- **File Uploads**: Stored in `public/uploads/`
- **PDF Processing**: Using pdfjs-dist and react-pdf

## Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages (login, register, reset, pending)
│   ├── (app)/             # Protected app pages (dashboard, projects, profile, admin)
│   └── api/               # API routes (auth, admin, annotations, projects, mass-list)
├── components/            # React components
│   ├── ui/                # UI primitives (button, card, badge, input, etc.)
│   ├── layout/            # Layout components (app-shell)
│   ├── dashboard/         # Dashboard components (project-explorer, backup-trigger)
│   ├── projects/          # Project page components (sidebar, header, content-switcher)
│   ├── mass-list/         # Mass list components (upload, table)
│   ├── pdf-viewer/        # PDF viewer components (wrapper, save-button)
│   ├── admin/             # Admin components (approval-panel)
│   └── profile/           # Profile components (profile-form)
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── db.ts             # Prisma client
│   └── utils.ts          # Helper functions
└── types/                 # TypeScript type definitions
    └── next-auth.d.ts    # NextAuth type extensions

prisma/
├── schema.prisma         # Database schema
├── seed.ts              # Database seeding script
└── migrations/          # Database migrations
```

## Development Setup
1. Environment variables are already configured in Replit
2. Database is connected and seeded
3. Run `npm run dev` to start the development server (configured for port 5000)
4. Access the app through the Replit webview

## Database Schema
Key models:
- **User**: With status (PENDING/ACTIVE/SUSPENDED) and role (ADMIN/PROJECT_LEADER/USER/READER)
- **Project**: With members, documents, and mass lists
- **Document**: With annotations, system tags, and components
- **Annotation**: For PDF markup with comments
- **SystemAnnotation**: For system-level annotations with polygon support
- **MassList**: TFM component tracking (building, system, component, typeCode, productName, location, zone)
- **Notification**: User notification system

## User Preferences
- Language: Norwegian (Bokmål)
- Admin emails are configured in `src/lib/utils.ts`

## Deployment Notes
- Production will use same port 5000 configuration
- Requires NEXTAUTH_SECRET, NEXTAUTH_URL, and DATABASE_URL in production environment
- Run `npm run db:deploy` for production database migrations
- Build command: `npm run build`
- Start command: `npm start` (runs on 0.0.0.0:5000)
