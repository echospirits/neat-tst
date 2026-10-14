# Ohio wholesale city corrections

The versioned rules live in `lib/ohioWholesaleCities.ts`. They combine the 24 city pairs recovered from `tmp/city-corrections-2026-09-19.json` with the owner's October 14 additions. `W CHESTER` now means **West Chester**, replacing the older **Westchester** output; that older output is also repaired. The historical `GENEVA ON THE LAKE` to `Geneva` rule is retained as requested.

Account Master parsing normalizes these cities before selecting locations or creating official/wholesale accounts. Existing wholesale imports retain protected manual city values. Address matching recognizes aliases even when ZIP is absent. Matching ignores case, punctuation and repeated whitespace; unlisted cities and explicitly non-Ohio accounts retain their values. Null/blank state follows the existing Ohio directory default.

| Imported city | Saved city |
| --- | --- |
| ARLINGTON HGTS | Arlington Heights |
| BEDFORD HGTS | Bedford Heights |
| BERLIN HGTS | Berlin Heights |
| BROADVIEW HGTS | Broadview Heights |
| CLEVELAND HGTS | Cleveland Heights |
| CUYAHOGA HGTS | Cuyahoga Heights |
| GARFIELD HGTS | Garfield Heights |
| GENEVA ON THE LAKE | Geneva |
| GRANDVIEW HGTS | Grandview Heights |
| HIGHLAND HGTS | Highland Heights |
| HUBER HGTS | Huber Heights |
| LEWIS CTR | Lewis Center |
| LINCOLN HGTS | Lincoln Heights |
| MAPLE HGTS | Maple Heights |
| MAYFIELD HGTS | Mayfield Heights |
| MIDDLEBURG HGTS | Middleburg Heights |
| MT VERNON | Mount Vernon |
| PARMA HGTS | Parma Heights |
| RICHMOND HGTS | Richmond Heights |
| SHAKER HGTS | Shaker Heights |
| UNIVERSITY HGTS | University Heights |
| W CHESTER / WESTCHESTER | West Chester |
| WARRENSVILLE HGTS | Warrensville Heights |
| WASHINGTON CT HOUSE / WASHINGTON CH | Washington Court House |
| STONE CRK | Stone Creek |
| ST HENRY | Saint Henry |
| MINGO JCT | Mingo Junction |
| Black Lick | Blacklick |
| FAIRFIELD TWP | Fairfield Township |

## Repair and research retries

Preview with `npx tsx scripts/repair-wholesale-cities.ts --environment test --evidence <new-local-json-file>`. Applying also requires `--apply`; use `--environment production` for the separately authorized production repair. The environment, expected host and database target checks must pass. `--print-sql` produces the same statement for execution through the connected database tool.

The atomic repair corrects non-merged Ohio wholesale accounts and sets city import protection, including already-corrected cities whose protection was not previously recorded. A changed city clears stale geocodes; unchanged cities retain them. It marks unsuccessful/rejected research attempts for active corrected accounts for retry, regardless of failure reason or missing input snapshot, except attempts already superseded by successful research. New failures on a previously corrected city can also be retried. Replaying without new failures makes no changes.

The error list excludes marked attempts, and the prioritized research queue explicitly includes them even if existing research is fresh. Historical job status, input, result, error, provider response, token usage, costs, organization ownership and original review text are retained. A new successful research refresh clears retry eligibility. Existing daily scheduling, spending limits and in-flight-job exclusions govern submission; the repair does not itself call a research provider.

Recovery JSON contains account city/protection/geocode preimages and job review-note/timestamp preimages. The CLI saves it inside the transaction and rolls back if saving fails. Keep it private and outside Git. Restore only rows whose current values still match this repair; do not overwrite intervening account edits or new research.
