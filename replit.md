# Sluttfase - Project Documentation

## Overview
This is a Next.js-based project management platform for construction projects (Norwegian: "Sluttfase"). The application provides:
- Role-based access control (RBAC) with roles: ADMIN, PROJECT_LEADER, USER, READER
- Project management with document handling
- PDF annotation and commenting system
- Mass list management with TFM (Technical Facility Management) codes
- User approval workflow (PENDING users need admin approval)

## Recent Changes (Dec 4, 2024)
- **GitHub Import Setup**: Configured the project to run in Replit environment
- **Created missing infrastructure files**:
  - `src/lib/auth.ts` - NextAuth configuration with credentials provider
  - `src/lib/db.ts` - Prisma client singleton
  - `src/lib/utils.ts` - Utility functions including adminEmails array
  - `src/types/next-auth.d.ts` - TypeScript type extensions for NextAuth
  - `src/app/api/auth/[...nextauth]/route.ts` - NextAuth route handler
- **Created basic UI components** (GitHub import was missing the full components directory):
  - `src/components/ui/button.tsx` - Basic button component
  - `src/components/ui/input.tsx` - Basic input component with label and hint support
- **Configured Tailwind CSS v4**: Updated `src/app/globals.css` to use Tailwind v4's @theme syntax
- **Database Setup**: Connected to Replit PostgreSQL (Neon), ran migrations and seeding
- **Environment Configuration**:
  - NEXTAUTH_SECRET - Generated secure secret
  - NEXTAUTH_URL - Set to Replit dev domain
  - DATABASE_URL - Replit PostgreSQL connection
  - DEFAULT_ADMIN_PASSWORD - Set for admin seeding (Admin123!)
- **Next.js Configuration**: Updated for Replit (port 5000, host 0.0.0.0, allowedDevOrigins for proxy)
- **Workflow**: Configured to run `npm run dev` on port 5000 with webview output

## Known Issues and Limitations
⚠️ **IMPORTANT**: The GitHub import was incomplete and missing the entire `src/components` directory except for the basic UI components created above. The application will have limited functionality until the full component library is restored. Missing components include:
- AppShell layout components
- ProjectExplorer, ProjectHeader, ProjectSidebar, ProjectContentSwitcher
- MassListUpload, MassListTable
- PDFViewerWrapper, SaveAndCloseButton
- ApprovalPanel
- BackupTrigger
- Card, CardContent, CardHeader, CardTitle, Badge
- And many other page-specific components

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
│   └── api/               # API routes (auth, admin, annotations)
├── components/            # React components (⚠️ mostly missing from import)
│   └── ui/                # Basic UI components (button, input)
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
- **MassList**: TFM component tracking
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
