# CRM additive migration runbook

Migration: `prisma/migrations/20261011021000_crm_activity_mail_deals/migration.sql`.

## Schema and compatibility

Extends AccountActivity enum/metadata and makes contact optional. Existing entries keep TEAM visibility, MANUAL source and meaningful=false. Creates MailboxConnection, MailboxOAuthState, ActivityAudit, DealStage, Deal and DealEvent. Composite tenant keys prevent mailbox/activity, stage/deal and history/deal cross-organization references. Source keys and submission keys are tenant-unique.

There is no data backfill, customer update, destructive table removal or cascade cleanup in the migration. PostgreSQL 18 rehearsal accepted enum additions and all constraints. Existing application code remains valid before deploying new writers. Rolling application code back after nullable/new-type entries exist requires retaining the new privacy filters and null-safe contact rendering; an unreviewed old binary is not a safe rollback.

## Deployment sequence

1. Fetch actual TST refs and verify its project/branch/host. Production is a separate project and is not authorized.
2. Inspect `_prisma_migrations`, AccountActivity count and absence/presence of the six new tables. Existing TST has a historical password-reset ledger gap; do not repair it as part of this migration.
3. Rehearse against an isolated TST child and run CRM database acceptance. Save schema/test evidence without secrets.
4. Apply only this exact reviewed SQL to verified TST using the repository environment guards/private loader. If manually applied because of historical drift, register only this name with `prisma migrate resolve --applied 20261011021000_crm_activity_mail_deals`.
5. Verify unchanged legacy activity count, new columns/tables/indexes and a successful ledger entry/checksum. Deploy tested code to staging/tst, wait for READY, and verify health says environment=test and databaseTarget=neon-neat-tst.
6. Keep CRM_MAIL_ENABLED unset/false until provider acceptance and credential configuration. Existing Worklist calendar integration stays separate.

## Recovery

Pause mailbox jobs and disable CRM_MAIL_ENABLED if integration behavior fails. Preserve new tables, activities and audit history; prefer a forward code repair. Restore only through an operator-reviewed Neon recovery process with a verified restore point and explicit target. Do not drop tables/enums to roll back.

## Integrated continuation migrations

After the original checkpoint migration, apply these exact additive migrations in order:

1. `20261011153000_integrated_account_workflows`
2. `20261011160000_contact_relationship_mail_operations`
3. `20261011170000_business_sms`
4. `20261011180000_worklist_playbooks`
5. `20261011190000_recipe_sales_materials`
6. `20261011200000_event_schedule_operations`
7. `20261011210000_field_guides_routes`
8. `20261011220000_account_profiles`
9. `20261011230000_mail_snapshot_reconciliation`

These extend existing records and create the SMS/playbook/approved-share/Eventbrite support tables. Contact phone aliases and mail providerSeenAt are included in the final migration. EventShift.organizationId remains nullable for legacy unowned rows; the new application only exposes explicitly owned events. No destructive migration, customer reassignment, directory rewrite or Deal-table removal is performed.

All nine were applied to an isolated TST child before shared-TST application. Verify checksums and register only these exact names when the existing ledger gap prevents normal deploy. Do not use db push or apply all historical pending migrations. Receipt/status is in v0.2-test-report.md. Backward-compatible schema expansion does not make an old privacy-unaware binary a safe rollback; preserve the new authorization filters and prefer a forward fix.
