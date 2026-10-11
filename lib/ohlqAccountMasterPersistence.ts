import type { Prisma } from '@prisma/client';
import type { AccountMasterRow } from './ohlqAccountMasterImport';

// Resolve protected values inside the UPDATE, using the row's current values.
// A correction saved after import preflight must survive this import as well.
export async function updateWholesaleAccountFromAccountMaster(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  id: string,
  row: AccountMasterRow,
  officialAccountId: string | null,
) {
  const changed = await tx.$executeRaw`
    WITH current_account AS (
      SELECT * FROM "WholesaleAccount"
      WHERE id = ${id} AND "mergedIntoId" IS NULL
      FOR UPDATE
    ), next_address AS (
      SELECT id,
        CASE WHEN "addressImportProtected" THEN address ELSE COALESCE(${row.address}::text, address) END AS address,
        CASE WHEN "cityImportProtected" THEN city ELSE COALESCE(${row.city}::text, city) END AS city,
        CASE WHEN "zipImportProtected" THEN zip ELSE COALESCE(${row.zip}::text, zip) END AS zip,
        ${row.state}::text AS state
      FROM current_account
    ), resolved AS (
      SELECT n.*, (
        btrim(regexp_replace(upper(concat_ws(', ', nullif(btrim(c.address), ''), nullif(btrim(c.city), ''), nullif(btrim(c.state), ''), nullif(btrim(c.zip), ''))), '[^A-Z0-9]+', ' ', 'g'))
        IS DISTINCT FROM
        btrim(regexp_replace(upper(concat_ws(', ', nullif(btrim(n.address), ''), nullif(btrim(n.city), ''), nullif(btrim(n.state), ''), nullif(btrim(n.zip), ''))), '[^A-Z0-9]+', ' ', 'g'))
      ) AS address_changed
      FROM next_address n JOIN current_account c ON c.id = n.id
    )
    UPDATE "WholesaleAccount" AS w SET
      address = r.address, city = r.city, zip = r.zip, state = r.state,
      "agencyId" = COALESCE(${row.agencyId}::text, w."agencyId"),
      county = COALESCE(${row.county}::text, w.county),
      "deliveryDay" = COALESCE(${row.deliveryDay}::text, w."deliveryDay"),
      "districtId" = COALESCE(${row.districtId}::text, w."districtId"),
      ownership = COALESCE(${row.ownership}::text, w.ownership),
      phone = COALESCE(${row.phone}::text, w.phone),
      "isActive" = true,
      "officialAccountId" = COALESCE(w."officialAccountId", ${officialAccountId}::text),
      latitude = CASE WHEN r.address_changed THEN NULL ELSE w.latitude END,
      longitude = CASE WHEN r.address_changed THEN NULL ELSE w.longitude END,
      "geocodedAt" = CASE WHEN r.address_changed THEN NULL ELSE w."geocodedAt" END,
      "geocodeStatus" = CASE WHEN r.address_changed THEN 'PENDING'::"GeocodeStatus" ELSE w."geocodeStatus" END,
      "normalizedGeocodeAddress" = CASE WHEN r.address_changed THEN NULL ELSE w."normalizedGeocodeAddress" END,
      "geocodeError" = CASE WHEN r.address_changed THEN NULL ELSE w."geocodeError" END,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM resolved r WHERE w.id = r.id
  `;
  if (changed !== 1) throw new Error('Wholesale account changed during Account Master import. Recheck its identity before retrying.');
}
