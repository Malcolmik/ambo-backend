-- ============================================================
-- AMBO V2 Migration: Job Broadcasting System & Admin Role
-- ============================================================
-- Run this migration after backing up your database
-- 
-- Option 1 (Recommended): Use Prisma
--   npx prisma migrate dev --name v2_job_broadcasting
--
-- Option 2: Run SQL directly
--   psql -d your_database -f 20241229_v2_job_broadcasting.sql
-- ============================================================

-- ============================================
-- 1. ADD ADMIN ROLE TO EXISTING ENUM
-- ============================================
-- Note: PostgreSQL enum values are added at the end
-- The order in Prisma schema is logical, not database order

DO $$ 
BEGIN
    -- Check if ADMIN value exists in Role enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ADMIN' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
    ) THEN
        ALTER TYPE "Role" ADD VALUE 'ADMIN';
    END IF;
END $$;

-- ============================================
-- 2. CREATE NEW ENUMS FOR JOB SYSTEM
-- ============================================

-- Job/Task Status for broadcasting
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM (
        'DRAFT',
        'OPEN',
        'REVIEWING',
        'ASSIGNED',
        'IN_PROGRESS',
        'PENDING_REVIEW',
        'COMPLETED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Application Status
DO $$ BEGIN
    CREATE TYPE "ApplicationStatus" AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'WITHDRAWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Worker Payment Status (for earnings tracking)
DO $$ BEGIN
    CREATE TYPE "WorkerPaymentStatus" AS ENUM (
        'PENDING',
        'PROCESSING',
        'PAID',
        'FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 3. ADD NEW COLUMNS TO TASK TABLE
-- ============================================

-- Job broadcasting fields
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "jobStatus" "JobStatus" DEFAULT 'DRAFT';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);

-- Worker payment/earnings fields
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "paymentAmount" DECIMAL(10, 2);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workerPaymentStatus" "WorkerPaymentStatus" DEFAULT 'PENDING';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "paidById" TEXT;

-- Add foreign key for paidById (references User who marked payment as paid)
DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_paidById_fkey" 
        FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "Task_jobStatus_isPublic_idx" ON "Task"("jobStatus", "isPublic");
CREATE INDEX IF NOT EXISTS "Task_assignedToId_status_idx" ON "Task"("assignedToId", "status");
CREATE INDEX IF NOT EXISTS "Task_workerPaymentStatus_idx" ON "Task"("workerPaymentStatus");

-- ============================================
-- 4. CREATE JOB APPLICATION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "JobApplication" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "coverNote" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one application per worker per task
DO $$ BEGIN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_taskId_workerId_key" 
        UNIQUE ("taskId", "workerId");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Foreign keys
DO $$ BEGIN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_taskId_fkey" 
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_workerId_fkey" 
        FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_reviewedById_fkey" 
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Indexes for JobApplication
CREATE INDEX IF NOT EXISTS "JobApplication_taskId_status_idx" ON "JobApplication"("taskId", "status");
CREATE INDEX IF NOT EXISTS "JobApplication_workerId_status_idx" ON "JobApplication"("workerId", "status");

-- ============================================
-- 5. CREATE PLATFORM SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "supportWhatsapp" TEXT,
    "supportEmail" TEXT,
    "supportInstagram" TEXT,
    "supportPhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- Insert default settings row if it doesn't exist
INSERT INTO "PlatformSettings" ("id", "supportWhatsapp", "supportEmail", "supportInstagram", "supportPhone")
VALUES ('default', NULL, NULL, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- ============================================
-- 6. DATA MIGRATION FOR EXISTING TASKS
-- ============================================

-- Set jobStatus based on current task state
-- Tasks with assignedToId should be ASSIGNED
-- Tasks without assignedToId that were created before V2 stay as DRAFT

UPDATE "Task" 
SET "jobStatus" = 'ASSIGNED' 
WHERE "assignedToId" IS NOT NULL 
AND "jobStatus" = 'DRAFT';

-- If task status is DONE, update jobStatus to COMPLETED
UPDATE "Task"
SET "jobStatus" = 'COMPLETED'
WHERE "status" = 'DONE'
AND "jobStatus" IN ('DRAFT', 'ASSIGNED');

-- If task status is IN_PROGRESS, update jobStatus to IN_PROGRESS
UPDATE "Task"
SET "jobStatus" = 'IN_PROGRESS'
WHERE "status" = 'IN_PROGRESS'
AND "jobStatus" IN ('DRAFT', 'ASSIGNED');

-- ============================================
-- 7. VERIFICATION QUERIES (Optional - Run manually)
-- ============================================

-- Check new enums exist:
-- SELECT typname FROM pg_type WHERE typname IN ('JobStatus', 'ApplicationStatus', 'WorkerPaymentStatus');

-- Check ADMIN role exists:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role');

-- Check new columns on Task:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'Task' AND column_name IN ('jobStatus', 'isPublic', 'paymentAmount', 'workerPaymentStatus');

-- Check JobApplication table:
-- SELECT * FROM "JobApplication" LIMIT 1;

-- Check PlatformSettings:
-- SELECT * FROM "PlatformSettings";

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Next steps:
-- 1. Run: npx prisma generate
-- 2. Test endpoints
-- 3. Deploy updated backend code
