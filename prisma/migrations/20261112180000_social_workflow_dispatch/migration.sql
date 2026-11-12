-- Durable Workflow dispatch identity; original social tables and delivery evidence remain.
ALTER TABLE "SocialDelivery" ADD COLUMN "workflowRunId" TEXT;
