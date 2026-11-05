import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/PageChrome';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { TastingImportForm } from './TastingImportForm';
export default async function TastingImportPage() {
  const { coordinator } = await requireTastingActor();
  if (!coordinator) notFound();
  return <div className="tastings-page"><PageHeader title="Import tasting schedule" actions={<Link href="/tastings">Back to tastings</Link>} /><section className="card tasting-editor"><p>Preview before importing. Existing Neat tastings are preserved; repeat the same source and row keys to skip previously imported records.</p><details className="tasting-support"><summary>Prepare the export</summary><p>Remove month headers and blank separators. Use one event per row. Convert ambiguous spreadsheet dates and times explicitly. Add a stable Row Key column when corrections may change date, time or assignment. Names that do not match a user ID or email stay flagged for administrator review.</p><p>Historical bottle counts are retained as spreadsheet evidence. Verified retail imports determine the sales outcome shown in Neat. The spreadsheet is used only for this import.</p></details><TastingImportForm /></section></div>;
}
