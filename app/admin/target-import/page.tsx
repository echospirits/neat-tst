export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { formatEasternDateTime } from '../../../lib/dateTime';
import { prisma } from '../../../lib/prisma';
import { uploadTargetAccountWorkbook } from './actions';

type MappingRow = {
  sheetName: string;
  rowCount: number;
  missingRequired: string[];
  missingOptional: string[];
  columns: Array<{
    key: string;
    matchedHeader: string | null;
    required: boolean;
  }>;
};

type ImportWarning = {
  detail: string;
  sheetName?: string;
};

const statusMessages: Record<string, string> = {
  completed: 'Workbook imported and target intelligence updated.',
  dry_run: 'Dry run completed. Review the mappings and row counts before committing.',
  failed: 'Workbook validation failed. Missing required sheets or columns must be fixed before import.',
  'invalid-file': 'Upload an .xlsx workbook.',
  'missing-file': 'Choose a workbook before running the import.',
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export default async function TargetImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ importId?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const latestImports = await prisma.targetModelImport.findMany({
    orderBy: { importDate: 'desc' },
    take: 8,
  });
  const selectedImport = params.importId
    ? await prisma.targetModelImport.findUnique({ where: { id: params.importId } })
    : latestImports[0] ?? null;
  const mappings = asArray<MappingRow>(selectedImport?.sheetMappings);
  const warnings = asArray<ImportWarning>(selectedImport?.warnings);

  return (
    <>
      <div className="page-actions">
        <Link href="/targets">Target queue</Link>
        <Link href="/targets/dashboard">Accountability dashboard</Link>
      </div>

      <h1>Target Account Model Import</h1>
      <p className="muted">
        Upload the Central Ohio workbook, validate mappings, and commit the scored model into the `tst` CRM data model.
      </p>

      {params.status ? <p className="toast-notice">{statusMessages[params.status] ?? params.status}</p> : null}

      <section className="card admin-import-panel">
        <h2>Upload workbook</h2>
        <form action={uploadTargetAccountWorkbook} encType="multipart/form-data" className="target-import-form">
          <input name="workbook" type="file" accept=".xlsx" required />
          <div className="segmented-submit">
            <button name="mode" value="dry-run" type="submit">
              Dry run
            </button>
            <button name="mode" value="commit" type="submit">
              Import to tst data
            </button>
          </div>
        </form>
      </section>

      {selectedImport ? (
        <section className="dashboard-section">
          <div className="section-heading">
            <h2>Import result</h2>
            <span className="pill">{selectedImport.status}</span>
            {selectedImport.failedRows > 0 ? (
              <a className="btn compact-btn secondary" href={`/api/admin/target-imports/${selectedImport.id}/failed-rows`}>
                Download failed rows
              </a>
            ) : null}
          </div>

          <div className="grid target-import-stats">
            <div className="card metric-card">
              <h3>Account rows</h3>
              <p className="metric-value">{selectedImport.accountRows}</p>
            </div>
            <div className="card metric-card">
              <h3>Inserted / updated</h3>
              <p className="metric-value">
                {selectedImport.insertedRows}/{selectedImport.updatedRows}
              </p>
            </div>
            <div className="card metric-card">
              <h3>Opportunities</h3>
              <p className="metric-value">{selectedImport.opportunityRows}</p>
            </div>
            <div className="card metric-card">
              <h3>Failed rows</h3>
              <p className="metric-value">{selectedImport.failedRows}</p>
            </div>
          </div>

          <div className="card import-detail-card">
            <h3>{selectedImport.sourceFilename}</h3>
            <dl className="detail-list">
              <div>
                <dt>Import ID</dt>
                <dd>{selectedImport.id}</dd>
              </div>
              <div>
                <dt>Model version</dt>
                <dd>{selectedImport.modelVersion}</dd>
              </div>
              <div>
                <dt>Workbook hash</dt>
                <dd>{selectedImport.sourceWorkbookHash}</dd>
              </div>
              <div>
                <dt>Imported at</dt>
                <dd>{formatEasternDateTime(selectedImport.importDate)}</dd>
              </div>
            </dl>
          </div>

          {warnings.length > 0 ? (
            <div className="card warning-list-card">
              <h3>Warnings</h3>
              <ul className="plain-list">
                {warnings.map((warning, index) => (
                  <li key={`${warning.sheetName ?? 'workbook'}-${index}`}>
                    <strong>{warning.sheetName ?? 'Workbook'}</strong>: {warning.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="dashboard-section">
            <div className="section-heading">
              <h2>Sheet and column mappings</h2>
              <span className="pill">{mappings.length}</span>
            </div>
            <div className="mapping-grid">
              {mappings.map((mapping) => (
                <details className="card compact-details mapping-card" key={mapping.sheetName}>
                  <summary>
                    {mapping.sheetName} <span className="pill">{mapping.rowCount} rows</span>
                  </summary>
                  {mapping.missingRequired.length > 0 ? (
                    <p className="danger-text">Missing required: {mapping.missingRequired.join(', ')}</p>
                  ) : null}
                  {mapping.missingOptional.length > 0 ? (
                    <p className="muted">Missing optional: {mapping.missingOptional.join(', ')}</p>
                  ) : null}
                  <table className="responsive-table mapping-table">
                    <thead>
                      <tr>
                        <th>Target field</th>
                        <th>Workbook column</th>
                        <th>Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.columns.map((column) => (
                        <tr key={column.key}>
                          <td data-label="Target field">{column.key}</td>
                          <td data-label="Workbook column">{column.matchedHeader ?? 'Missing'}</td>
                          <td data-label="Required">{column.required ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Recent imports</h2>
        </div>
        <table className="responsive-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Imported</th>
            </tr>
          </thead>
          <tbody>
            {latestImports.map((importRow) => (
              <tr key={importRow.id}>
                <td data-label="File">
                  <Link className="table-link" href={`/admin/target-import?importId=${importRow.id}`}>
                    {importRow.sourceFilename}
                  </Link>
                </td>
                <td data-label="Status">{importRow.status}</td>
                <td data-label="Rows">{importRow.accountRows}</td>
                <td data-label="Imported">{formatEasternDateTime(importRow.importDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
