import Link from 'next/link';
import { requireSupplyActor } from '../../../lib/productionSupplies/access';
import { getSupplyOptions } from '../../../lib/productionSupplies/queries';
import { PageHeader, SectionHeading } from '../../components/PageChrome';
import { ActionForm } from '../../components/ActionForm';
import { SubmitButton } from '../../components/SubmitButton';
import { RecordPicker } from '../../components/RecordPicker';
import { CatalogForm } from '../SupplyForms';
import { saveRuleAction } from '../actions';
import { departmentLabels } from '../display';
import '../supplies.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Supply catalog & matching rules' };
export default async function CatalogPage() {
  const { actor } = await requireSupplyActor(true);
  const data = await getSupplyOptions(actor.organizationId);
  const catalogOptions = data.catalog.map(item => ({ value: item.id, label: item.name }));
  const ruleForm = (rule?: typeof data.rules[number]) => <ActionForm action={saveRuleAction} className="supply-edit-form">{rule ? <input name="id" value={rule.id} type="hidden" /> : null}<div className="form-grid"><label>Supplier<input name="supplier" defaultValue={rule?.supplier} maxLength={300} required /></label><label>Exact supplier SKU<input name="sku" defaultValue={rule?.sku} maxLength={300} required /></label><label>Unit constraint<input name="unit" defaultValue={rule?.unit ?? ''} maxLength={300} /></label><label>Department<select name="department" defaultValue={rule?.department ?? 'NEEDS_REVIEW'}>{Object.entries(departmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><RecordPicker name="catalogItemId" label="Catalog item" options={catalogOptions} defaultValue={rule?.catalogItemId ?? ''} clearLabel="No catalog mapping" placeholder="No catalog mapping" /></div><label>Evidence for this rule<input name="explanation" defaultValue={rule?.explanation} maxLength={300} required /></label><label className="supply-check"><input name="active" type="checkbox" defaultChecked={rule?.active ?? true} />Apply to future matching purchases</label><SubmitButton>Save specific matching rule</SubmitButton></ActionForm>;
  return <div className="supplies-page"><PageHeader title="Supply catalog & matching rules" actions={<Link className="btn secondary" href="/production-supplies">Back to supplies</Link>} /><section className="supply-section"><SectionHeading title="Catalog" count={data.catalog.length} />{data.catalog.map(item => <details className="supply-disclosure" key={item.id}><summary>{item.name} · {item.departments.map(key => departmentLabels[key]).join(' + ')}{item.sharedUse ? ' · Shared use' : ''}</summary>{item.productAssociation ? <p>{item.productAssociation}</p> : null}<CatalogForm item={item} /></details>)}<details className="supply-disclosure"><summary>Add a supply item</summary><CatalogForm /></details></section><section className="supply-section"><SectionHeading title="Reviewed supplier and SKU rules" count={data.rules.length} /><p className="supply-record-meta">Rules apply only to a specific supplier and SKU. Correcting a purchase does not create a rule unless you explicitly choose to remember it.</p>{data.rules.map(rule => <details className="supply-disclosure" key={rule.id}><summary>{rule.supplier} · {rule.sku} · {departmentLabels[rule.department]}{!rule.active ? ' · Inactive' : ''}</summary>{ruleForm(rule)}</details>)}<details className="supply-disclosure"><summary>Create a specific matching rule</summary>{ruleForm()}</details></section></div>;
}
