-- 1. Create Enums if they don't exist
DO $$ BEGIN
    CREATE TYPE "AppCode" AS ENUM ('SYSLINK', 'FLYTLINK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AppAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Application Table
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "code" "AppCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- Create unique index on code (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "Application_code_key" ON "Application"("code");

-- 3. Create UserAppAccess Table
CREATE TABLE IF NOT EXISTS "UserAppAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "AppAccessStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAppAccess_pkey" PRIMARY KEY ("id")
);

-- Note: We add foreign keys assuming User table exists. 
-- In pure SQL Editor, if User/Application tables exist, this works.
-- IF NOT EXISTS clauses for constraints are tricky in Postgres, so we wrap in DO blocks or just try.

DO $$ BEGIN
    ALTER TABLE "UserAppAccess" ADD CONSTRAINT "UserAppAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserAppAccess" ADD CONSTRAINT "UserAppAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserAppAccess" ADD CONSTRAINT "UserAppAccess_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create indexes for UserAppAccess
CREATE UNIQUE INDEX IF NOT EXISTS "UserAppAccess_userId_applicationId_key" ON "UserAppAccess"("userId", "applicationId");
CREATE INDEX IF NOT EXISTS "UserAppAccess_userId_idx" ON "UserAppAccess"("userId");
CREATE INDEX IF NOT EXISTS "UserAppAccess_applicationId_idx" ON "UserAppAccess"("applicationId");


-- 4. Seed Data (Now that tables exist)
INSERT INTO "Application" ("id", "code", "name", "description", "isActive", "updatedAt")
VALUES 
  (gen_random_uuid(), 'SYSLINK', 'SysLink', 'Kvalitetssikring og dokumenthåndtering', true, NOW()),
  (gen_random_uuid(), 'FLYTLINK', 'FlytLink', 'Kravsporing og planlegging', true, NOW())
ON CONFLICT ("code") DO NOTHING;

-- Verification
SELECT * FROM "Application";
