import Papa from 'papaparse';
import { TastingError } from './service';

const headers: Record<string, string> = {
  rowkey: 'rowKey', date: 'date', starttime: 'startTime', endtime: 'endTime', agencyid: 'agencyId',
  assignedtaster: 'assignedTaster', taster: 'assignedTaster', coverage: 'assignedTaster', status: 'status', currentstatus: 'status',
  notesfortaster: 'tasterNotes', tasternotes: 'tasterNotes', internalnotes: 'internalNotes', internaljoenotes: 'internalNotes', joenotes: 'internalNotes',
  samedaybottlesales: 'historicalBottles', retailbottlessoldatagencyondate: 'historicalBottles', historicalbottles: 'historicalBottles', responsecomment: 'responseComment', cancellationreason: 'cancellationReason',
  approvedby: 'originalApprover', eventkey: 'sourceEventKey', emailsgathered: 'emailsGathered', historicalsalesnote: 'historicalSalesNote',
};
export function parseTastingCsv(csv: string): Record<string, string>[] {
  if (!csv.trim() || csv.length > 1_000_000) throw new TastingError('Paste a CSV export of up to 1 MB and 500 rows.');
  const normalizeHeader = (header: string) => headers[header.replace(/[^a-z0-9]/gi, '').toLowerCase()] ?? header.trim();
  // Check the original header row before PapaParse renames duplicate keys.
  const headerRow = Papa.parse(csv, { preview: 1, skipEmptyLines: 'greedy' }) as { data: string[][] };
  const originalHeaders = (headerRow.data[0] ?? []).map(normalizeHeader);
  if (new Set(originalHeaders).size !== originalHeaders.length) throw new TastingError('Use one column for each field; duplicate column names are ambiguous.');
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: 'greedy', transformHeader: normalizeHeader }) as { data: Record<string, string>[]; errors: Array<{ message: string }>; meta: { fields?: string[] } };
  if (parsed.errors.length) throw new TastingError(`CSV could not be read: ${parsed.errors[0].message}`);
  if (!parsed.data.length || parsed.data.length > 500) throw new TastingError('Import between 1 and 500 rows at a time.');
  const required = ['date', 'startTime', 'endTime', 'agencyId', 'assignedTaster', 'status'];
  if (required.some(key => !parsed.meta.fields?.includes(key))) throw new TastingError('Include Date, Start Time, End Time, Agency ID, Assigned taster and Status columns.');
  if (new Set(parsed.meta.fields).size !== parsed.meta.fields?.length) throw new TastingError('Use one column for each field; duplicate column names are ambiguous.');
  return parsed.data.map(row => {
    const rawSales = row.historicalBottles?.trim();
    if (rawSales && !Number.isFinite(Number(rawSales))) return { ...row, historicalBottles: '', historicalSalesNote: [row.historicalSalesNote, rawSales].filter(Boolean).join('; ') };
    return row;
  });
}
