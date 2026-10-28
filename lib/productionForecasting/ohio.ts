import Papa from 'papaparse';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getDistilleryOnlyItemCodes } from '../ohlqProductEligibility';
import { dateOnly, type Classification, validDay } from './model';
export type OhioItemContext = { included: Set<string>; distilleryOnly: Set<string>; bailment: Set<string> };
export async function ohioItemContext(db: PrismaClient | Prisma.TransactionClient, organizationId: string): Promise<OhioItemContext> {
  const [products, listings, status] = await Promise.all([
    db.organizationProduct.findMany({ where: { organizationId, market: 'OH', active: true, discontinued: false, status: { in: ['OWNED', 'REPRESENTED'] } }, select: { externalItemCode: true } }),
    db.ohlqAgencyInventoryCurrent.findMany({ where: { organizationId }, distinct: ['itemCode', 'detailCodeDescription'], select: { itemCode: true, detailCodeDescription: true } }),
    db.ohlqTenantInventoryImportStatus.findFirst({ where: { organizationId, status: 'COMPLETED' }, orderBy: { reportDate: 'desc' }, select: { diagnostics: true } }),
  ]);
  const distilleryOnly = getDistilleryOnlyItemCodes(status?.diagnostics), bailment = new Set<string>();
  for (const listing of listings) {
    const detail = (listing.detailCodeDescription ?? '').trim().toUpperCase().replace('A-3A', 'A3A').replace(/\s+/g, ' ');
    if (['A3A DIST', 'A3A DISTILLERY ONLY'].includes(detail)) distilleryOnly.add(listing.itemCode);
    if (['A3A BAIL', 'A3A BAILMENT'].includes(detail)) bailment.add(listing.itemCode);
  }
  // The inventory importer already distinguishes a bailment listing from a
  // separate distillery-only listing when producing its diagnostic item set.
  for (const code of bailment) if (!getDistilleryOnlyItemCodes(status?.diagnostics).has(code)) distilleryOnly.delete(code);
  return { included: new Set(products.map(p => p.externalItemCode)), distilleryOnly, bailment };
}
export function classificationForItem(code: string, context: OhioItemContext): Classification {
  return context.distilleryOnly.has(code) ? 'A3A_DIST' : context.bailment.has(code) ? 'A3A_BAIL' : 'BAILMENT';
}
function sourceDate(value: string, field: string) {
  const trimmed = value.trim();
  if (validDay(trimmed)) return trimmed;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const iso = match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
  if (!validDay(iso)) throw new Error(`Native source has an invalid ${field}. Use MM/DD/YYYY or YYYY-MM-DD.`);
  return iso;
}
const numeric = (value: string, field: string) => {
  const cleaned = value.trim().replaceAll(',', '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Native source ${field} must be a nonnegative number.`);
  return Number(cleaned);
};
const headerKey = (value: string) => value.replace(/^\uFEFF/, '').replaceAll('\u00a0', ' ').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
export function normalizeNativeOhio(csv: string, source: string, context: OhioItemContext) {
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: 'greedy', transformHeader: headerKey }) as { data: Record<string, string>[]; errors: unknown[]; meta: { fields?: string[] } };
  if (parsed.errors.length) throw new Error('Native source CSV/TSV is malformed. Export the report as a delimited file.');
  const fields = parsed.meta.fields ?? [];
  const demand = source === 'BAILMENT_PO_INVOICE' && fields.includes('Invoice_Number');
  const guidance = source === 'DISTRIBUTION_CENTER' && fields.includes('Code');
  if (!demand && !guidance) return null;
  const required = demand ? ['Invoice_Date', 'Invoice_Number', 'PO_Number', 'Transfer_Order_Number', 'Agency', 'Transfer_Order_Ship_Date', 'Brand', 'DC_Name', 'Cases', 'Odd_Bottles', 'Cases_Bottles'] : ['Code', 'Groveport - MAX (45 Days)', 'Groveport - MIN (14 Days)', 'Green - MAX (45 Days)', 'Green - MIN (14 Days)'];
  const missing = required.filter(h => !fields.includes(h));
  if (missing.length) throw new Error(`Native source headers missing: ${missing.join(', ')}.`);
  const normalized: Record<string, string | number>[] = [];
  const evidence = new Map<string, Record<string, string>>();
  let outOfScopeRows = 0;
  for (const [index, row] of parsed.data.entries()) {
    const code = (row[demand ? 'Brand' : 'Code'] ?? '').trim().toUpperCase();
    if (!code) throw new Error(`Native source row ${index + 2} has no item code; completeness cannot be verified.`);
    // Filter by the tenant's explicit configured portfolio, never a vendor/name.
    if (!context.included.has(code)) { outOfScopeRows++; continue; }
    const classification = classificationForItem(code, context);
    if (demand) {
      if (!row.Invoice_Number?.trim() || !row.Transfer_Order_Ship_Date?.trim()) throw new Error(`Native source row ${index + 2} is not a shipped invoice. Choose a complete shipped-history export.`);
      const date = sourceDate(row.Transfer_Order_Ship_Date, 'ship date'), invoiceDate = sourceDate(row.Invoice_Date, 'invoice date');
      if (!row.Cases?.trim() && !row.Odd_Bottles?.trim()) throw new Error(`Native source row ${index + 2} has no case or bottle quantity.`);
      const cases = numeric(row.Cases?.trim() || '0', 'Cases'), odd = numeric(row.Odd_Bottles?.trim() || '0', 'Odd_Bottles');
      const pack = /^C(\d+)$/i.exec((row.Cases_Bottles ?? '').trim());
      if (odd && (!pack || Number(pack[1]) <= 0)) throw new Error(`Native source row ${index + 2}: odd bottles require a valid C6/C12/etc. case pack.`);
      const location = row.DC_Name.trim();
      if (!location) throw new Error(`Native source row ${index + 2} has no fulfillment location.`);
      const id = JSON.stringify([row.Invoice_Number.trim(), row.Transfer_Order_Number.trim(), row.Agency.trim(), code, location]);
      if (id.length > 200) throw new Error('Native source invoice identity exceeds the supported length.');
      normalized.push({ source_line_id: id, movement_date: date, available_on: invoiceDate > date ? invoiceDate : date, item_code: code, location_code: location.toUpperCase(), location_name: location, classification, transaction_status: 'SHIPPED', cases: Math.round((cases + (odd ? odd / Number(pack![1]) : 0)) * 10000) / 10000 });
      evidence.set(id, row);
    } else {
      for (const [name, codeName] of [['Groveport', 'GPT'], ['Green', 'GRN']]) {
        normalized.push({ item_code: code, location_code: codeName, location_name: name, classification, minimum_cases: row[`${name} - MIN (14 Days)`] ?? '', maximum_cases: row[`${name} - MAX (45 Days)`] ?? '' });
        evidence.set(JSON.stringify([code, codeName]), row);
      }
    }
  }
  if (!normalized.length) throw new Error('Native source contains no active owned or represented Organization items.');
  return { csv: Papa.unparse(normalized), evidence, outOfScopeRows, adapterVersion: demand ? 'ohio-bailment-invoice-v1' : 'ohio-distribution-center-v1' };
}
