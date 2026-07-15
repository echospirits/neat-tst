export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireAdminSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';

type FailedRow = {
  message?: string;
  row?: Record<string, unknown>;
  rowNumber?: number;
  sheetName?: string;
};

const csvEscape = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  const importRow = await prisma.targetModelImport.findUnique({
    where: { id },
    select: {
      failedRowDetails: true,
      sourceFilename: true,
    },
  });

  if (!importRow) {
    return Response.json({ error: 'Import not found' }, { status: 404 });
  }

  const rows = Array.isArray(importRow.failedRowDetails) ? (importRow.failedRowDetails as FailedRow[]) : [];
  const header = ['sheetName', 'rowNumber', 'message', 'rowJson'];
  const csvRows = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.sheetName,
        row.rowNumber,
        row.message,
        JSON.stringify(row.row ?? {}),
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Disposition': `attachment; filename="${importRow.sourceFilename.replace(/\.xlsx$/i, '')}-failed-rows.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  });
}
