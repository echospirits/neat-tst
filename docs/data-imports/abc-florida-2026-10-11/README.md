# ABC Florida store import - 2026-10-11

Imported all **126 active Florida stores** in the [ABC directory](https://abcfws.com/stores) into **neat-tst**. Private contacts, notes and tags belong to **Echo Spirits Distilling Co.**, as explicitly selected by the owner. All 126 stores are now retail agencies, corrected at the owner's request. [Correction and verification](CORRECTION.md). Original wholesale records are inactive audit copies.

[Review the stores in TST](https://neat-tst.vercel.app/agencies?q=ABC%20Fine%20Wine). Select Echo Spirits Support View to see its contacts and notes. [Audit CSV](audit.csv) contains a direct account link for every store.

## Data and provenance

- 126 names, ABC store numbers, street addresses, cities, state/ZIP, store phones, source coordinates, seven-day schedules and chain ownership labels from ABC's public directory feed, https://abc.irishtitan.cloud/api/retail-locations/active. The rendered directory independently contained 126 store cards. Raw source is preserved in `stores-source.json` and each account's research identity snapshot.
- 126 counties across 39 counties from the Census geography lookup, using the exact ABC coordinates. `county-evidence.json` preserves response, source URL and retrieval timestamp. Postal city is not used to guess county: University/Tuttle has a Sarasota mailing city but lies in Manatee County; Trinity has an Odessa mailing city but lies in Pasco County.
- 123 named store-manager contacts; three store-main-line contacts where ABC reports `Unknown`: #079 34th Blvd (Gainesville), #099 Immokalee Rd. (Naples), #155 Cape Canaveral. Phone numbers are store lines, not personal/direct lines.
- Google searches for the three missing managers did not establish a verified current name. Search results for Naples and Cape Canaveral corroborated the phone/address; an AI overview for Cape Canaveral discussed a different store and was discarded. ABC's `Crosspoint` spelling for #099 is retained; Google displays `Crosspointe`. Source spelling remains available for owner audit.
- Corporate fallback `guestservices@abcfws.com` / `866-450-6622`, verified at https://abcfws.com/faq, is recorded in notes explicitly as a corporate contact. It is not assigned as a manager/store-specific email.
- Raw `phone_secondary`, `manager_secondary` and `location_zone` are retained as evidence and labelled in notes. Their roles are not inferred; the second telephone might be a fax and the secondary manager might be a district contact.
- Regular hours are not temporary/holiday-hour verification. ABC displayed a Panhandle severe-weather advisory. Stores #199, #200, #203, #210, #215, #217 and #218 carry an audit note to confirm temporary hours before a visit.

## Fields intentionally unknown

Actual Florida liquor-license identifiers, store/buyer-specific emails, buying authority, delivery day, account owner and sales history remain unknown. `MANUAL-ABC-FL-###` is a stable Neat-generated placeholder, not a license. ABC numbers remain in names and source metadata. No Ohio agency/official account link, target status, sales stage, visits, tasks, deals, ratings or purchase history was fabricated. Imported research is labelled **owner audit pending**, not a completed comprehensive assessment.

## Original import operation and validation (historical)

- Verified TST health: `ok=true`, `environment=test`, `databaseTarget=neon-neat-tst`.
- Neon project `dawn-frog-33352119` (`neat-crm-tst`), branch `br-divine-forest-avwq2b3g`; its Neon branch name `main` belongs to the isolated TST project and is unrelated to production Git `main`.
- Exact endpoint: `ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech`; database `neondb`.
- TST account total rose from 15,745 to 15,871. Florida total rose from 0 to 126. Created 126 license-ID rows, 126 research records, 126 Echo contacts, 126 Echo overlays and 126 Echo tag assignments (one chain tag).
- Five focused tests passed: wrong-target refusal, source completeness/county-coordinate consistency, duplicate/missing-row rejection, unknown field handling and unknown-manager handling.
- Dry run found no existing Florida accounts or import collisions. One serializable transaction created the batch atomically. A second apply run preserved all 126 existing records, with unchanged counts and no updates. Reports: `dry-run.json`, `import-receipt.json`, `replay-receipt.json`.
- `verify-import.cjs` compared every saved core field, license placeholder, raw source, hours schedule, contact, note scope, chain tag and unset targeting/sales status against the snapshot; all 126 passed. `verification.json` records results. No contacts were added to other organizations.
- Live browser acceptance used the existing Staging Admin session (no session/user creation): TST list showed 126 records; Echo Spirits Support View displayed the imported manager, notes, chain tag, county and all seven daily hours on #003. Mobile 390x844 had document width 375px; desktop 1440x900 had document width 1425px, with no horizontal page overflow. Sales Status remained Not set. Neat currently labels Buying State as Never purchased from its absent purchase ledger; this is not evidence that ABC has never purchased outside that ledger.
- This package changes data and operational documentation only; application code, schema and dependencies are unchanged. App-wide typecheck/build and synthetic empty/error UI tests are not applicable to this data operation.

## Original reproduction (superseded; do not run)

The original wholesale importer and verifier now refuse execution. Use [the retail correction procedure](CORRECTION.md). Commands below are retained only as historical evidence.

The script requires an explicit env file and validates the exact TST identity before constructing a Prisma client. It never loads the repository's `.env`, which may point at production. Use installed project dependencies. From the repository root:

```powershell
node --test docs/data-imports/abc-florida-2026-10-11/import-abc-florida-stores.test.cjs
node docs/data-imports/abc-florida-2026-10-11/import-abc-florida-stores.cjs --env-file <private-tst-env-file> --data-dir docs/data-imports/abc-florida-2026-10-11 --report <new-report-path>
```

Only add `--apply` for an authorized TST write. A repeated batch is insert-only and preserves audit edits; it will not refresh existing stores. New-source updates require a separately reviewed reconciliation. Do not run `enrich.cjs` to overwrite the frozen evidence while reproducing this import.

## Production boundary

Production/main was not pushed, merged or mutated. Production Git reference at preflight: `af1f396726e3b15e1167f5af2aa6ba426cae9bf9`. TST documentation base: `7db5e5a5471042d8a08be4a97da811b6c2102f73`.

**A Git promotion does not transfer these database records.** After the owner's TST audit, a separately authorized production data import must reconcile audited values and production duplicates. This script deliberately refuses production and does not run automatically during deployment or migration. Do not restore a whole TST database into production. The raw snapshot and audit CSV are evidence; owner edits in TST must be exported/reconciled before later promotion.

Google lookup URLs used for missing information:

- https://www.google.com/search?q=ABC+Fine+Wine+Spirits+Florida+store+email+contact+store+manager
- https://www.google.com/search?q=ABC+Fine+Wine+Spirits+5820+34th+Gainesville+store+manager
- https://www.google.com/search?q=ABC+Fine+Wine+Spirits+1000+Crosspoint+Naples+store+manager
- https://www.google.com/search?q=ABC+Fine+Wine+Spirits+6020+Atlantic+Cape+Canaveral+store+manager
