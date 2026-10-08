import { UserRole } from '@prisma/client';
import { AGENCY_CSV_COLUMNS, AGENCY_CSV_ERRORS } from '../../lib/agencyCsvImport';
import { SubmitButton } from '../components/SubmitButton';

export function AgencyCsvImportPanel({ role, action, status, error, count }: {
  role: UserRole;
  action: (formData: FormData) => Promise<void>;
  status?: string;
  error?: string;
  count?: string;
}) {
  if (role !== UserRole.PLATFORM_ADMIN) return null;
  const errorMessage = error && Object.hasOwn(AGENCY_CSV_ERRORS, error)
    ? AGENCY_CSV_ERRORS[error as keyof typeof AGENCY_CSV_ERRORS]
    : AGENCY_CSV_ERRORS['invalid-file'];

  return (
    <>
      {status === 'imported' ? <p className="pill" role="status">Imported/updated {count} agencies.</p> : null}
      <details className="card compact-details admin-panel desktop-admin-panel" open={status === 'invalid' || status === 'failed'}>
        <summary>Import Agencies CSV</summary>
        <p className="muted">Platform administrators can update the shared agency directory for every organization. Contact updates apply to the current organization.</p>
        <form action={action}>
          <label htmlFor="agencies-csv">Agencies CSV</label>
          <input id="agencies-csv" type="file" name="csvFile" accept=".csv,text/csv" aria-describedby="agencies-csv-help agencies-csv-columns" required />
          <p id="agencies-csv-help" className="muted">Up to 1 MB and 2,000 agencies. Include every column, with a unique Agency ID and DBA for each row. The whole file must be valid before any changes are saved.</p>
          <p id="agencies-csv-columns" className="muted">Required columns: {AGENCY_CSV_COLUMNS.join(', ')}.</p>
          {status === 'invalid' ? <p role="alert">{errorMessage} No changes were saved.</p> : null}
          {status === 'failed' ? <p role="alert">The import could not be saved. No changes were saved. Try again.</p> : null}
          <SubmitButton type="submit">Upload agencies</SubmitButton>
        </form>
      </details>
    </>
  );
}
