# SysLink - Project Documentation

## Overview
SysLink is a Next.js-based project management platform designed for construction projects. It aims to streamline project workflows, enhance communication, and provide robust document handling capabilities. Key features include role-based access control, comprehensive project and document management, advanced PDF annotation, mass list management with TFM codes, and a user approval system. The platform also integrates PratLink, a communication module offering real-time chat, task management, and seamless switching between document and communication views. The overall vision is to provide a unified and secure environment for construction project stakeholders, facilitating efficient collaboration and reducing operational complexities.

## User Preferences
- Language: Norwegian (Bokmål)
- Admin emails are configured in `src/lib/utils.ts`
- Theme preference persisted via next-themes

## System Architecture
SysLink is built on Next.js 16 with the App Router and Turbopack. It utilizes a PostgreSQL database with Prisma ORM for data management and NextAuth v4 for authentication, featuring a credentials provider. Styling is handled by Tailwind CSS v4, with `next-themes` for light/dark mode functionality.

**UI/UX Decisions:**
The application supports light/dark themes, with user preferences persisted. Mobile optimization is a core design principle, featuring draft persistence for forms, navigation guards for unsaved changes, touch-friendly UI elements (44px minimum touch targets), responsive layouts, and a mobile-specific hamburger menu.

**Technical Implementations & Feature Specifications:**
- **Role-Based Access Control (RBAC):** Supports ADMIN, PROJECT_LEADER, USER, and READER roles with granular permissions.
- **Project Management:** Includes project creation, archiving, restoration, and permanent deletion (admin only). Features a dashboard with progress cards, activity feed, and recent documents.
- **Document Management:** Upload, manage, and track work drawings and system schemas. Supports revision handling, where documents with the same title create new revisions.
- **PDF Annotation System:** Allows creation of interactive pins on PDFs to mark issues. Pins have Open/Closed statuses with visual indicators (orange pulsing for open, green static for closed). Comments can be added to annotations.
- **Mass List Management:** Manages TFM (Technical Facility Management) codes, with Excel export and improved search capabilities.
- **PratLink Communication Module:**
    - **Chat System:** Teams-like chat rooms per project with real-time messaging, @mention support, threads, and file attachments (PDF, Excel, images, docs up to 10MB).
    - **Task/ToDo Management:** Create tasks from chat or directly, assign to members with email notifications, track status (Open, In Progress, Done, Cancelled), and set due dates with priority.
    - **Mode Switcher:** Seamless toggle between SysLink (document management) and PratLink (communication) views.
- **User Management:** Includes user approval workflow for PENDING users, member invitation system for projects, and global user search.
- **Notifications System:** Real-time notifications for @mentions and task assignments, with a bell icon indicating unread counts and direct links to relevant content.
- **PDF Processing & Verification:** Utilizes `pdfjs-dist` and `react-pdf` for PDF rendering. Features text extraction with coordinate data, TFM code pattern matching, and automatic system code detection from filenames. Documents can be verified against the project mass list, reporting matched/unmatched components.
- **Security Architecture:**
    - **Authentication:** Status-based login blocking (ACTIVE users only), middleware protection for all routes, and JWT session management via NextAuth.
    - **Two-Factor Authentication (TOTP):** Support for authenticator apps (Google, Microsoft), QR code setup, rate limiting (5 failed attempts locks for 15 mins), and a 14-day activation deadline with warnings and auto-suspension.
    - **Secure Password Change:** Requires current password verification, enforces complexity rules (8+ chars, uppercase, lowercase, number, special character), prevents reuse, requires TOTP if enabled, rate limits attempts, and logs changes.
    - **Authorization (RBAC):** Centralized helpers (`requireAuth()`, `requireAdmin()`, `requireProjectAccess()`, `requireProjectLeaderAccess()`) enforce role-based and project-scoped access.
    - **File Security:** Secure storage outside public folders, authenticated access via API, file validation (extension, MIME type, size limits), and path traversal prevention.
    - **Input Sanitization:** HTML entity escaping for user inputs, length validation, and strict type checking for API inputs.

**System Design Choices:**
- **Framework:** Next.js with App Router for modern web development.
- **Database:** PostgreSQL with Prisma ORM for type-safe database interactions.
- **Authentication:** NextAuth for robust authentication flows.
- **Styling:** Tailwind CSS for utility-first styling.
- **File Uploads:** Stored securely with authenticated access.
- **PDF Processing:** `pdfjs-dist` and `react-pdf` for efficient PDF handling.
- **Excel Processing:** `xlsx` library for mass list functionalities.

## External Dependencies
- **Database:** PostgreSQL (Replit/Neon)
- **ORM:** Prisma
- **Authentication:** NextAuth v4
- **Styling:** Tailwind CSS v4
- **Theming:** `next-themes`
- **PDF Processing:** `pdfjs-dist`, `react-pdf`
- **Excel Processing:** `xlsx`
- **Email Service:** Gmail SMTP (via environment variables for `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)