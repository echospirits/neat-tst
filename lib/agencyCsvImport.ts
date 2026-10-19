import { UserRole, type PrismaClient } from '@prisma/client';
import Papa from 'papaparse';
import { getGeocodeResetForAddressChange } from './location/geocode';
import { prisma } from './prisma';

export const AGENCY_CSV_MAX_BYTES = 1024 * 1024;
export const AGENCY_CSV_MAX_ROWS = 2000;
export const AGENCY_CSV_COLUMNS = [
  'Agency ID', 'DBA', 'Address', 'City', 'County', 'Zip', 'Agency Phone',
  'D-8 Permit', 'Warehouse', 'Order Day', 'Week', 'Delivery Day',
  'Primary Contact', 'Primary Contact Phone', 'Wholesale',
] as const;

export const AGENCY_CSV_ERRORS = {
  'invalid-file': 'Choose a nonempty agencies CSV file.',
  'too-large': 'The agencies CSV must be 1 MB or smaller.',
  'invalid-csv': 'The CSV has malformed quotes or rows. Correct the file and upload it again.',
  'invalid-headers': 'Include every required agency column once. Check the required CSV column names.',
  'invalid-rows': 'Every row needs a unique Agency ID and DBA, fields of at most 500 characters, and a valid D-8 Permit value (yes/no, true/false, 1/0, or blank).',
  'too-many-rows': 'Upload between 1 and 2,000 agencies at a time.',
} as const;

export class AgencyCsvValidationError extends Error {
  constructor(public readonly code: keyof typeof AGENCY_CSV_ERRORS) {
    super(AGENCY_CSV_ERRORS[code]);
  }
}

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');
const optional = (value: string) => value.trim() || null;
const trueValues = new Set(['1', 'true', 'yes', 'y']);
const falseValues = new Set(['', '0', 'false', 'no', 'n']);

export function parseAgencyCsv(csv: string) {
  if (Buffer.byteLength(csv, 'utf8') > AGENCY_CSV_MAX_BYTES) {
    throw new AgencyCsvValidationError('too-large');
  }
  // Parse arrays so duplicate normalized headers and mismatched row widths cannot
  // be silently renamed, overwritten, or ignored by the parser.
  const parsed = Papa.parse(csv, { delimiter: ',', skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw new AgencyCsvValidationError('invalid-csv');
  const [rawHeaders = [], ...records] = parsed.data as string[][];
  const headers = rawHeaders.map(normalizeHeader);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length ||
      AGENCY_CSV_COLUMNS.some((header) => !headers.includes(normalizeHeader(header)))) {
    throw new AgencyCsvValidationError('invalid-headers');
  }
  if (!records.length || records.length > AGENCY_CSV_MAX_ROWS) {
    throw new AgencyCsvValidationError('too-many-rows');
  }

  const agencyIds = new Set<string>();
  return records.map((fields) => {
    if (fields.length !== headers.length) throw new AgencyCsvValidationError('invalid-csv');
    const row: Record<string, string> = Object.fromEntries(headers.map((header, i) => [header, fields[i]]));
    const agencyId = row.agencyid.trim();
    const name = row.dba.trim();
    const d8Permit = row.d8permit.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/i.test(agencyId) || !name || agencyIds.has(agencyId) ||
        fields.some((field) => field.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(field)) ||
        (!trueValues.has(d8Permit) && !falseValues.has(d8Permit))) {
      throw new AgencyCsvValidationError('invalid-rows');
    }
    agencyIds.add(agencyId);
    return {
      agencyId,
      name,
      address: optional(row.address),
      city: optional(row.city),
      county: optional(row.county),
      zip: optional(row.zip),
      phone: optional(row.agencyphone),
      d8Permit: trueValues.has(d8Permit),
      warehouse: optional(row.warehouse),
      orderDay: optional(row.orderday),
      orderWeek: optional(row.week),
      deliveryDay: optional(row.deliveryday),
      primaryContact: optional(row.primarycontact),
      primaryContactPhone: optional(row.primarycontactphone),
      wholesaleStatus: optional(row.wholesale),
    };
  });
}

export async function importAgencyCsv({ csv, user, organizationId, db = prisma }: {
  csv: string;
  user: { id: string; role: UserRole };
  organizationId: string;
  db?: PrismaClient;
}) {
  // Keep the privilege check at the write boundary as well as in the action.
  if (user.role !== UserRole.PLATFORM_ADMIN) throw new Error('Platform administrator required.');
  if (!user.id || !organizationId) throw new Error('Import actor and organization required.');
  const rows = parseAgencyCsv(csv);

  return db.$transaction(async (tx) => {
    for (const row of rows) {
      const existing = await tx.agency.findUnique({
        where: { agencyId: row.agencyId },
        select: { address: true, city: true, state: true, zip: true },
      });
      const agency = await tx.agency.upsert({
        where: { agencyId: row.agencyId },
        create: row,
        update: {
          ...row,
          ...getGeocodeResetForAddressChange(existing, { ...row, state: 'OH' }),
        },
      });
      const contact = {
        agencyId: agency.id,
        name: row.primaryContact ?? `Agency Contact ${row.agencyId}`,
        phone: row.primaryContactPhone,
        role: 'Primary Contact',
      };
      const contactId = `${organizationId}-agency-${row.agencyId}-default`;
      await tx.locationContact.upsert({
        where: { id: contactId },
        create: { ...contact, id: contactId, organizationId, createdByUserId: user.id },
        update: contact,
      });
    }
    return rows.length;
  }, { timeout: 60000 });
}
