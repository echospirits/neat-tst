# Location-aware account prioritization

## Architecture

- `Agency` and `WholesaleAccount` store optional coordinates, geocode status, the normalized address used for the result, and the last geocode time/error.
- Google Maps Geocoding API calls run only on the server through `lib/location/geocode.ts`. Set `GOOGLE_MAPS_GEOCODING_API_KEY`; no browser Maps key is needed.
- `npm run backfill:account-geocodes -- --limit 250` processes pending records sequentially with a small delay. Add `--retry-failed` to retry failures. Re-run batches until `attempted` is zero.
- Address changes clear coordinates and set the record back to `PENDING`. Unchanged normalized addresses keep their cached result.
- Nearby requests use a latitude/longitude bounding box in Postgres, then exact Haversine distance in the service. Results are limited to eight accounts within ten miles.
- Inactive or merged wholesale accounts never appear in Nearby. Normal text search retains the existing inactive-official activation path.

## Browser permission and privacy

The browser asks for location only after the user selects â€œUse my location to show nearby accounts.â€ It calls `getCurrentPosition` once and caches the current fix in `sessionStorage` for ten minutes. A denied permission is remembered for the browser session so pages do not prompt repeatedly. There is no `watchPosition`, location history, visit GPS field, or database write containing the user's coordinates. Other users and administrators cannot see the current location.

If permission is denied, times out, is unsupported, or the nearby request fails, existing lists and search continue unchanged. Low-accuracy fixes use rounded distance labels.

## Ranking behavior

- Empty Log Visit search: a capped Nearby section appears first, followed by the existing recent-visit list.
- Typed Log Visit search: name relevance remains primary, distance is a secondary tie-breaker, then recent visit and name.
- Agencies and Wholesale pages: Nearby is a compact section above the existing list only when the page is not text-filtered.
- Records without good coordinates remain in every normal list and search; they are merely absent from Nearby.

## Manual QA

1. Apply the migration, configure the key, and backfill a representative batch.
2. On a mobile viewport, open Log Visit and allow location; confirm nearby Wholesale accounts show distance and select in one tap.
3. Switch to Agency and repeat.
4. Search for a farther account and confirm the strong text match stays easy to find.
5. Deny permission in a fresh browser session; confirm recency lists and search still work and no repeated automatic prompt occurs.
6. Open `/wholesale` and `/agencies`; confirm compact Nearby rows, no horizontal scrolling, and normal tables below.
7. Confirm inactive official wholesale records appear only through text search/activation, never Nearby.
8. Confirm desktop pages still expose the optional control without making it dominant.

