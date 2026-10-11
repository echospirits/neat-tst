import { Prisma } from '@prisma/client';
import { accountStateValues } from './stateOptions';

type ObjectValue = Record<string, unknown>;
export type StateScope = { states: string[]; agencyIds: string[]; restaurantIds: string[]; agencyNumbers: string[]; referencesByModel?: Record<string, { agency: string[]; restaurant: string[] }> };
const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));
const directories = new Set(['Agency', 'WholesaleAccount', 'Account']);
const ohioOnly = new Set(['OhlqAnnualSalesRow','OhlqAnnualSalesByWholesaleRow','OhlqAgencyInventoryCurrent','OhlqAgencyInventorySnapshot']);
const externalModels = new Set(['OrganizationAccountOverlay','AccountTargetingHistory','AccountSalesStatusHistory','ContactImportSession','PlaybookRun','EventShift']);
const referenceIds = (scope: StateScope, model: string, kind: 'agency' | 'restaurant', legacy = false) => {
  const allowed = kind === 'agency' ? (legacy ? [...scope.agencyIds, ...scope.agencyNumbers] : scope.agencyIds) : scope.restaurantIds;
  const references = scope.referencesByModel?.[model]?.[kind];
  if (!references) return allowed;
  const available = new Set(allowed);
  return references.filter(id => available.has(id));
};
const obj = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
export const combineWhere = (original: unknown, policy: ObjectValue) => { const existing=obj(original).AND; return { ...obj(original), AND: [...(Array.isArray(existing)?existing:existing?[existing]:[]), policy] }; };

export function stateWhere(states: readonly string[]) {
  // Legacy Ohio sources sometimes use the state name or have a blank state.
  // New writes require an explicit supported state; legacy blank rows stay Ohio.
  return { OR: [{ state: { in: accountStateValues(states), mode: 'insensitive' as const } }, ...(states.includes('OH') ? [{ state: null }, { state: '' }] : [])] };
}
export function modelHasStatePolicy(model: string): boolean {
  return Boolean(modelStateWhere(model, { states: [], agencyIds: [], restaurantIds: [], agencyNumbers: [] }));
}
export function modelStateWhere(model: string, scope: StateScope, visited = new Set<string>()): ObjectValue | null {
  if (visited.has(model)) return null;
  const nextVisited = new Set([...visited, model]);
  if (directories.has(model)) return stateWhere(scope.states);
  if (ohioOnly.has(model)) return scope.states.includes('OH') ? null : { OR: [] };
  if (externalModels.has(model)) {
    const idField = ['ContactImportSession','PlaybookRun'].includes(model) ? 'accountId' : 'externalAccountId';
    return { OR: [
      ...(model==='EventShift' ? [{externalAccountId:null,accountType:null}] : []),
      { accountType: { in: ['AGENCY'] }, [idField]: { in: referenceIds(scope, model, 'agency') } },
      { accountType: { in: ['WHOLESALE'] }, [idField]: { in: referenceIds(scope, model, 'restaurant') } },
    ] };
  }
  const metadata = models.get(model);
  const restrictions: ObjectValue[] = [];
  for (const field of metadata?.fields ?? []) {
    if (field.kind === 'object' || !['agencyId', 'wholesaleAccountId'].includes(field.name)) continue;
    // A sales event belongs to its restaurant; agencyId is the supplying OHLQ store number.
    if (model === 'AccountSalesEvent' && field.name === 'agencyId') continue;
    const relation = metadata!.fields.find(f => f.kind === 'object' && f.relationFromFields?.includes(field.name) && ['Agency','WholesaleAccount'].includes(f.type));
    const allowed = relation ? { [relation.name]: { is: stateWhere(scope.states) } } : { [field.name]: { in: field.name === 'agencyId' ? referenceIds(scope, model, 'agency', model === 'LoggedVisit') : referenceIds(scope, model, 'restaurant') } };
    restrictions.push(field.isRequired ? allowed : { OR: [{ [field.name]: null }, allowed] });
  }
  for (const relation of metadata?.fields ?? []) {
    if (relation.kind !== 'object' || !relation.relationFromFields?.length || relation.relationFromFields.some(f => ['agencyId','wholesaleAccountId'].includes(f))) continue;
    const parentPolicy = modelStateWhere(relation.type, scope, nextVisited);
    if (parentPolicy) {
      // Optional composite relations also contain non-null organizationId. A
      // relation:null filter can incorrectly require that tenant key to be null.
      const nullableKeys=(relation.relationFromFields??[]).filter(key=>metadata?.fields.some(f=>f.name===key&&!f.isRequired));
      const absent=nullableKeys.length?nullableKeys.map(key=>({[key]:null})):[{[relation.name]:null}];
      restrictions.push(relation.isRequired ? { [relation.name]: { is: parentPolicy } } : { OR: [...absent, { [relation.name]: { is: parentPolicy } }] });
    }
  }
  return restrictions.length ? { AND: restrictions } : null;
}

// Prisma extensions do not intercept nested includes. Filter those explicitly,
// including link tables underneath tags and organization dashboards.
export function scopeReadArgs(model: string, original: unknown, scope: StateScope): ObjectValue {
  const args = { ...obj(original) };
  const policy = modelStateWhere(model, scope);
  if (policy) args.where = combineWhere(args.where, policy);
  for (const key of ['include', 'select'] as const) {
    if (!args[key]) continue;
    const selection = { ...obj(args[key]) };
    for (const [name, value] of Object.entries(selection)) {
      if (!value) continue;
      const field = models.get(model)?.fields.find(f => f.name === name && f.kind === 'object');
      if (field) {
        const nested = scopeReadArgs(field.type, value === true ? {} : value, scope);
        // Required to-one includes cannot take a where clause in Prisma.
        // Their owner is already constrained through modelStateWhere above.
        if (!field.isList && field.isRequired) delete nested.where;
        selection[name] = nested;
      }
      if (name === '_count') {
        const counts = value === true ? Object.fromEntries((models.get(model)?.fields ?? []).filter(f => f.kind === 'object' && f.isList).map(f => [f.name, true])) : { ...obj(obj(value).select) };
        for (const [relationName, count] of Object.entries(counts)) {
          const relation = models.get(model)?.fields.find(f => f.name === relationName && f.kind === 'object');
          const restriction = relation && modelStateWhere(relation.type, scope);
          if (count && restriction) counts[relationName] = { ...obj(count), where: combineWhere(obj(count).where, restriction) };
        }
        selection[name] = { ...obj(value), select: counts };
      }
    }
    args[key] = selection;
  }
  return args;
}

export function assertStateWrite(model: string, value: unknown, scope: StateScope, creating = false) {
  const data = obj(value);
  if (directories.has(model) && (creating || 'state' in data)) {
    const raw = typeof data.state === 'object' ? obj(data.state).set : data.state;
    const state = raw == null ? 'OH' : String(raw).trim();
    if (!accountStateValues(scope.states).some(allowed => allowed.toUpperCase() === state.toUpperCase())) throw new Error('This account state is not enabled for your organization.');
  }
  if (ohioOnly.has(model) && !scope.states.includes('OH')) throw new Error('Ohio access is required.');
  for (const field of ['agencyId','wholesaleAccountId'] as const) {
    if (directories.has(model) || ohioOnly.has(model) || (model === 'AccountSalesEvent' && field === 'agencyId')) continue;
    const raw = typeof data[field] === 'object' ? obj(data[field]).set : data[field];
    if (typeof raw === 'string' && !(field === 'agencyId' ? (model === 'LoggedVisit' ? [...scope.agencyIds, ...scope.agencyNumbers] : scope.agencyIds) : scope.restaurantIds).includes(raw)) throw new Error('This account is outside your organization’s states.');
  }
  if (externalModels.has(model)) {
    const id = data[['ContactImportSession','PlaybookRun'].includes(model) ? 'accountId' : 'externalAccountId'];
    if (typeof id === 'string') {
      const allowed = ['AGENCY','agency'].includes(String(data.accountType)) ? scope.agencyIds : ['WHOLESALE','wholesale'].includes(String(data.accountType)) ? scope.restaurantIds : [];
      if (!allowed.includes(id)) throw new Error('This account is outside your organization’s states.');
    }
  }
  for (const field of models.get(model)?.fields.filter(f => f.kind === 'object') ?? []) {
    const nested = obj(data[field.name]);
    if (!Object.keys(nested).length) continue;
    // Nested writes bypass query extensions. Account mutations must use their
    // checked top-level services; do not accept an unscoped nested connect/write.
    if (modelHasStatePolicy(field.type)) {
      for (const operation of Object.keys(nested)) {
        if (operation === 'create' || operation === 'createMany') {
          const raw = operation === 'createMany' ? obj(nested[operation]).data : nested[operation];
          for (const row of Array.isArray(raw) ? raw : [raw]) assertStateWrite(field.type, row, scope, true);
        } else if (operation === 'connect' && directories.has(field.type)) {
          for (const row of Array.isArray(nested.connect) ? nested.connect : [nested.connect]) {
            const id = obj(row).id;
            if (typeof id !== 'string' || !(field.type === 'Agency' ? scope.agencyIds : scope.restaurantIds).includes(id)) throw new Error('This account is outside your organization’s states.');
          }
        } else throw new Error('Use the account service to change state-scoped relationships.');
      }
    }
  }
}
