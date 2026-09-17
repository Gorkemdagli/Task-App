-- Phase 07: nullable task effort estimate. Existing tasks remain valid.
ALTER TABLE "tasks" ADD COLUMN "estimate_minutes" INTEGER;
