# SysLink - Project Documentation

## Overview
This is a Next.js-based project management platform for construction projects. The application provides:
- Role-based access control (RBAC) with roles: ADMIN, PROJECT_LEADER, USER, READER
- Project management with document handling and archiving
- PDF annotation and commenting system with interactive pins
- Mass list management with TFM (Technical Facility Management) codes
- User approval workflow (PENDING users need admin approval)
- Light/dark theme support
- Real-time notifications for @mentions

## Recent Changes (Dec 5, 2024)
- **Project Archive/Restore System**:
  - Archive projects (moves to archive view)
  - Restore archived projects
  - Delete projects permanently (admin only, from archive)
  - Active/Archived tabs in dashboard

- **Member Invitation System**:
  - Search for active users by name, email, or company
  - Add members with role selection (Project Leader, User, Reader)
  - Remove members from projects
  - Authorization: Only admins and project leaders can invite

- **Project Dashboard Widgets**:
  - Progress cards (Completed, Issues, Documents, Mass List)
  - Donut chart visualization for progress
  - Activity feed showing recent comments
  - Recent documents list

- **Light/Dark Mode Toggle**:
  - Theme provider using next-themes
  - Toggle button in sidebar header
  - Persists user preference

- **Global Search**:
  - Search field in project explorer
  - Filters by project name and description

- **PDF Annotation System**:
  - Click to create new annotation pins
  - Open/Closed status with visual indicators
  - Orange pulsing pins for open issues
  - Green static pins for closed issues
  - Toggle status functionality
  - Comments on annotations

- **Notifications System**:
  - Bell icon with unread count badge
  - Dropdown with notification list
  - Mark as read / Mark all as read
  - Links to relevant documents

- **Mass List Enhancements**:
  - Excel export functionality
  - System filter dropdown
  - Improved search across all fields

- **Project Module Pages** (All functional):
  - **Arbeidstegninger**: Upload and manage work drawings with annotation tracking
  - **Systemskjema**: Full document workspace with verification and component extraction
  - **Protokoller MC**: Generate mechanical completion protocols from mass list
  - **Fremdrift**: Project progress dashboard with completion statistics

- **Systemskjema Advanced Features**:
  - **Document Workspace** (src/components/pages/project/document-workspace.tsx):
    - Table view with revision numbers, boxing status, and approved deviations
    - Search and filter by system tags
    - Verify documents against mass list
    - View extracted components with mass list matching
    - Approve deviations button with counter
  - **PDF Text Extraction** (src/lib/pdf-text-extractor.ts):
    - Extract text with coordinates from PDFs
    - TFM code pattern matching (e.g., 3200.001, 360.123)
    - Automatic system code detection from filenames
  - **Component Verification** (src/lib/scan.ts):
    - scanDocumentForComponents - finds TFM codes in PDF
    - verifyAgainstMassList - matches against project mass list
    - Reports matched/unmatched components
  - **Polygon/Geometry Support** (src/lib/geometry-utils.ts):
    - Point-in-polygon detection for system boxing
    - Polygon area and center calculations
    - Color palette for system annotations
  - **Revision Handling**:
    - Same title = new revision (auto-increment)
    - Previous versions marked as isLatest=false
    - Revision number displayed in document list
  - **Deep-link Support**:
    - URL params: annotationId, component, x, y, page
    - Links from notifications open correct page/annotation

## Admin Accounts
The database has been seeded with two admin accounts:
- Email: tm5479@gk.no / Password: Admin123!
- Email: flytlink.app@gmail.com / Password: Admin123!

These emails are hardcoded in `src/lib/utils.ts` as `adminEmails` array and automatically get ACTIVE/ADMIN status upon registration.

## Security Architecture
The application implements comprehensive security measures:

### Authentication Security
- **Status-based login blocking**: Only ACTIVE users can log in. PENDING and SUSPENDED users are rejected at authentication time with appropriate error messages.
- **Middleware protection**: All protected routes and APIs verify user status; suspended users are blocked and redirected.
- **JWT session management**: Secure session handling with NextAuth and encrypted tokens.

### Two-Factor Authentication (TOTP)
- **Authenticator app support**: Users can enable TOTP using Google Authenticator, Microsoft Authenticator, or any standard authenticator app.
- **QR code setup**: Easy setup via QR code scanning or manual secret entry.
- **Rate limiting**: After 5 failed TOTP attempts, account is locked for 15 minutes.
- **14-day activation deadline**: New users must enable TOTP within 14 days of account activation or their account will be suspended.
- **Warning banner**: Users without TOTP see a countdown banner with days remaining and links to authenticator setup guides.
- **Auto-suspension**: Accounts are automatically suspended on login if the TOTP deadline has passed.
- **API routes** (`src/app/api/totp/`):
  - `POST /api/totp/setup` - Generate new secret and QR code
  - `POST /api/totp/verify` - Verify TOTP code and enable 2FA
  - `POST /api/totp/disable` - Disable 2FA (requires valid TOTP code)
  - `GET /api/totp/status` - Get TOTP status and deadline warning
- **Profile integration**: Users can manage TOTP from their profile settings.
- **Authenticator guides**: Links to official Google and Microsoft Authenticator setup documentation.

### Secure Password Change
- **Current password verification**: Users must provide current password to change it
- **Password complexity requirements**: 8+ chars, uppercase, lowercase, number, special character
- **Password reuse prevention**: New password cannot match current password
- **TOTP verification**: Users with 2FA enabled must provide TOTP code to change password
- **Rate limiting**: 5 attempts per 15 minutes to prevent brute-force attacks
- **Audit logging**: Password change events are logged for security tracking

### Authorization (RBAC)
- **Centralized auth helpers** (`src/lib/auth-helpers.ts`):
  - `requireAuth()` - Verifies user is authenticated and ACTIVE
  - `requireAdmin()` - Requires ADMIN role
  - `requireProjectAccess()` - Verifies project membership
  - `requireProjectLeaderAccess()` - Requires PROJECT_LEADER role in project
- **Role-based permissions**: ADMIN, PROJECT_LEADER, USER, READER with granular access control

### File Security
- **Secure file storage**: Files stored in `/uploads/` directory (outside public folder)
- **Authenticated file access**: Files served via `/api/files/[...path]` with authentication and project membership verification
- **File validation** (`src/lib/file-utils.ts`):
  - Extension validation for allowed file types (PDF, Excel, images)
  - MIME type verification
  - File size limits (50MB for documents, 10MB for spreadsheets, 5MB for images)
  - Path traversal prevention

### Input Sanitization
- **HTML entity escaping** (`src/lib/sanitize.ts`): All user inputs are sanitized before storage
- **Length validation**: Input fields have maximum length constraints
- **Type validation**: Strict type checking for all API inputs

## New API Routes (Dec 5, 2024)
- `POST /api/projects/[projectId]/archive` - Archive a project
- `POST /api/projects/[projectId]/restore` - Restore archived project
- `GET/POST/DELETE /api/projects/[projectId]/members` - Member management
- `GET /api/users/search` - Search for users (authorized)
- `POST/PATCH /api/documents/[documentId]/annotations` - Annotation CRUD
- `GET/PATCH /api/notifications` - Notification management
- `POST /api/projects/[projectId]/documents/[documentId]/verify` - Verify against mass list
- `GET/POST/PATCH /api/projects/[projectId]/documents/[documentId]/components` - Component CRUD
- `GET/POST/PATCH/DELETE /api/documents/[documentId]/system-annotations` - System annotation CRUD
- `GET/POST /api/projects/[projectId]/mc` - MC protocol data

## Project Architecture
- **Framework**: Next.js 16 with App Router and Turbopack
- **Database**: PostgreSQL (Replit/Neon) with Prisma ORM
- **Authentication**: NextAuth v4 with credentials provider
- **Styling**: Tailwind CSS v4
- **Theming**: next-themes for light/dark mode
- **File Uploads**: Stored in `/uploads/` (authenticated access via API)
- **PDF Processing**: Using pdfjs-dist and react-pdf
- **Excel Processing**: Using xlsx library

## Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages (login, register, reset, pending)
│   ├── (app)/             # Protected app pages (dashboard, projects, profile, admin)
│   └── api/               # API routes
│       ├── auth/          # Authentication
│       ├── admin/         # Admin operations
│       ├── projects/      # Project CRUD + archive/restore + members
│       ├── documents/     # Document annotations
│       ├── notifications/ # Notification system
│       ├── totp/          # Two-factor auth
│       └── users/         # User search
├── components/            # React components
│   ├── ui/                # UI primitives (button, card, badge, input, theme-toggle, etc.)
│   ├── layout/            # Layout components (app-shell, notification-dropdown)
│   ├── providers/         # Context providers (session, theme)
│   ├── pages/             # Page-specific components
│   │   ├── dashboard/     # Project explorer, backup trigger
│   │   ├── project/       # Project header, sidebar, content, member-invite
│   │   ├── admin/         # Approval panel
│   │   └── profile/       # Profile form, password change, TOTP setup
│   ├── pdf-viewer/        # PDF viewer with annotation support
│   └── totp/              # TOTP warning banner
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── auth-helpers.ts   # Authorization helpers
│   ├── db.ts             # Prisma client
│   ├── sanitize.ts       # Input sanitization
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
- **User**: With status (PENDING/ACTIVE/SUSPENDED), role (ADMIN/PROJECT_LEADER/USER/READER), TOTP fields
- **Project**: With status (ACTIVE/ARCHIVED), members, documents, and mass lists
- **ProjectMember**: Links users to projects with roles
- **Document**: With annotations, system tags, and components
- **Annotation**: For PDF markup with x/y position, status (OPEN/CLOSED), and comments
- **SystemAnnotation**: For system-level annotations with polygon support
- **Comment**: On projects, annotations, or system annotations
- **MassList**: TFM component tracking (building, system, component, typeCode, productName, location, zone)
- **Notification**: User notifications with read status and metadata

## Mobile UX Features
The application is optimized for mobile use:
- **Draft Persistence**: Form data is automatically saved to localStorage while typing, protecting against page reloads and app switches
- **Navigation Guards**: Users are warned before leaving pages with unsaved changes (both browser refresh and in-app navigation)
- **Touch-Friendly UI**: All buttons and inputs have minimum 44px touch targets for easy mobile interaction
- **Responsive Layouts**: Forms stack properly on mobile with primary actions positioned for thumb reach
- **Mobile Menu**: Hamburger menu with scroll lock and safe-area padding for modern smartphones

## User Preferences
- Language: Norwegian (Bokmål)
- Admin emails are configured in `src/lib/utils.ts`
- Theme preference persisted via next-themes

## Email Configuration
SMTP is configured for password reset emails using Gmail:
- **SMTP_HOST**: smtp.gmail.com
- **SMTP_PORT**: 587
- **SMTP_USER**: flytlink.app@gmail.com (stored as secret)
- **SMTP_PASS**: Gmail app password (stored as secret)
- **SMTP_FROM**: flytlink.app@gmail.com

The email system (`src/lib/email.ts`) supports:
- Password reset emails with secure tokens
- 1-hour token expiration
- Norwegian language templates

## Deployment Notes
- Production will use same port 5000 configuration
- Requires NEXTAUTH_SECRET, NEXTAUTH_URL, and DATABASE_URL in production environment
- Requires SMTP_USER and SMTP_PASS for email functionality
- Run `npm run db:deploy` for production database migrations
- Build command: `npm run build`
- Start command: `npm start` (runs on 0.0.0.0:5000)
