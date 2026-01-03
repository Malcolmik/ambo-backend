-- Migration: Add postedById to Task model
-- This tracks which admin broadcasted a job

-- Add postedById column to Task table
ALTER TABLE "Task" ADD COLUMN "postedById" TEXT;

-- Add foreign key constraint
ALTER TABLE "Task" ADD CONSTRAINT "Task_postedById_fkey" 
  FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for efficient queries
CREATE INDEX "Task_postedById_idx" ON "Task"("postedById");

-- Backfill existing broadcasted tasks with createdById as the poster
-- (assumes the creator also broadcasted for existing tasks)
UPDATE "Task" 
SET "postedById" = "createdById" 
WHERE "jobStatus" != 'DRAFT' AND "postedAt" IS NOT NULL;
