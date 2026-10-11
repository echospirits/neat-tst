# ABC retail-agency correction

The owner clarified that all 126 imported Florida stores are retail agencies. On 2026-10-11, an explicit transaction on neon-neat-tst created 126 Agency records and moved the existing 126 Echo Spirits contacts, 126 overlays/notes and 126 tag assignments. Shared addresses, counties, Florida state/ZIP, store phones, coordinates and geocoding values were preserved from the current records. Agency businessHours contains the complete schedule, raw directoryImport and county/research evidence. Private primary contacts remain organization-scoped; shared legacy primaryContact fields were not populated from private contacts.

[Review agencies](https://neat-tst.vercel.app/agencies?q=ABC%20Fine%20Wine). The CSV now links to /agencies/abc-fws-fl-###. Agency IDs ABC-FL-### are directory identifiers, not OHLQ agency numbers or liquor-license numbers. Chain ownership and Liquor / beverage store format are source-backed store context; buying authority remains Unknown.

## Preservation and reversibility

No existing agency collisions or linked visits, Worklist tasks, sales, deals or other activity were present. The operation checks all schema columns named wholesaleAccountId, externalAccountId or accountId for unexpected links and refuses if any appear. It copies current account values, moves tenant records in place, preserves their IDs and every content field, and only fills empty store context. A private pre-write backup remains in the operator workspace (not committed). The original 126 WholesaleAccount rows, license placeholders and research records remain intact with isActive=false, so they disappear from active Wholesale lists. Original research is unchanged; original notes retain historical import wording. No database rows were deleted.

## Validation

- Verified exact TST endpoint, health environment=test and databaseTarget=neon-neat-tst. Production untouched.
- correction-dry-run.json: all 126 ready, no agency collisions.
- correction-receipt.json: one serializable transaction completed; before/after hashes, 126 agencies, contacts, notes/overlays, tags and schedules; zero active ABC wholesale accounts. Assertions compare every migrated core field, schedule, raw source, contact/tag/note content and retained research before commit.
- correction-replay.json: completed replay preserved all records without updates.
- Existing five source/target validation tests remain applicable. No app/schema/dependency changes; full application build is not required for this operational data correction.

## Safe rerun

The original import-abc-florida-stores.cjs CLI is disabled to prevent re-creating the incorrect account type. Helpers remain for provenance and tests. verify-import.cjs is historical and also disabled.

Run correct-to-agencies.cjs with --env-file <private-tst-env-file> --data-dir <this-directory> --report <new-report-path> for read-only verification. A first application requires --apply and --backup <new-private-backup-path>; a replay makes no updates. It refuses any other database target. Later audit edits that differ from the archived source may intentionally fail source-equality verification and require review; they are never overwritten.

## Future production import

A Git push does not move database records. Any separately authorized production import must use the audited Agency records plus Echo private data, reconcile duplicates, and omit inactive wholesale audit copies. Neither the historical importer nor this correction is a production importer.

Browser acceptance: the Agencies filter rendered 126 ABC links. In the existing Echo Spirits support context, #003 displayed Agency identity, chain ownership, preserved Aurora Proctor contact and original notes/tag, and all seven daily hours. Original organization context was restored afterward.
