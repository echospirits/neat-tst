import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { cookies, headers } from 'next/headers';
import { assertStateWrite, combineWhere, modelStateWhere, scopeReadArgs, stateWhere, type StateScope } from './accountStatePolicy';

const explicitScope = new AsyncLocalStorage<StateScope | null>();
const requestScopes = new WeakMap<object, Promise<StateScope | null>>();
const readOperations = new Set(['findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','findMany','count','aggregate','groupBy']);
const whereWrites = new Set(['update','updateMany','updateManyAndReturn','delete','deleteMany','upsert']);
const checkedRecords = new WeakMap<StateScope, Map<string, Set<string>>>();
function remember(scope: StateScope, model: string, result: unknown) {
  const records = checkedRecords.get(scope) ?? new Map<string, Set<string>>();
  checkedRecords.set(scope, records);
  const ids = records.get(model) ?? new Set<string>();
  records.set(model, ids);
  for (const row of Array.isArray(result) ? result : [result]) {
    if (row && typeof row === 'object' && 'id' in row && typeof row.id === 'string') ids.add(row.id);
  }
}
async function assertParentReferences(base: PrismaClient, model: string, value: unknown, scope: StateScope) {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  const metadata = Prisma.dmmf.datamodel.models.find(m => m.name === model);
  for (const relation of metadata?.fields ?? []) {
    if (relation.kind !== 'object') continue;
    const restriction = modelStateWhere(relation.type, scope);
    if (!restriction) continue;
    if (relation.relationFromFields?.length === 1 && !['agencyId','wholesaleAccountId'].includes(relation.relationFromFields[0])) {
      const field = relation.relationFromFields[0], raw = data[field];
      const id = raw && typeof raw === 'object' && 'set' in raw ? raw.set : raw;
      if (typeof id === 'string' && !checkedRecords.get(scope)?.get(relation.type)?.has(id)) {
        const key = relation.type[0].toLowerCase() + relation.type.slice(1);
        const delegate = (base as unknown as Record<string, { findFirst(args: unknown): Promise<unknown> }>)[key];
        const parent = await delegate.findFirst({ where: combineWhere({ [relation.relationToFields![0]]: id }, restriction), select: { [relation.relationToFields![0]]: true } });
        if (!parent) throw new Error('This related record is outside your organization’s states.');
        remember(scope, relation.type, parent);
      }
    }
    const nested = data[relation.name] as Record<string, unknown> | undefined;
    if (nested && typeof nested === 'object') {
      const createMany = nested.createMany as { data?: unknown } | undefined;
      const creating = nested.create ?? createMany?.data;
      if (creating) for (const row of Array.isArray(creating) ? creating : [creating]) await assertParentReferences(base, relation.type, row, scope);
    }
  }
}
const emptyScope = (): StateScope => ({states:[],agencyIds:[],restaurantIds:[],agencyNumbers:[]});

export async function loadStateScope(base: PrismaClient, organizationId: string): Promise<StateScope> {
  const organization = await base.organization.findUnique({where:{id:organizationId},select:{enabledStates:true,active:true,accountStatus:true}});
  const states = organization?.active && !['SUSPENDED','CANCELLED'].includes(organization.accountStatus) ? organization.enabledStates : [];
  const [retail, restaurants] = await Promise.all([
    base.agency.findMany({where:stateWhere(states),select:{id:true,agencyId:true}}),
    base.wholesaleAccount.findMany({where:stateWhere(states),select:{id:true}}),
  ]);
  return {states,agencyIds:retail.map(a=>a.id),agencyNumbers:retail.map(a=>a.agencyId),restaurantIds:restaurants.map(a=>a.id)};
}

async function resolveRequestScope(base: PrismaClient): Promise<StateScope | null> {
  const explicit = explicitScope.getStore();
  if (explicit !== undefined) return explicit;
  let store: Awaited<ReturnType<typeof cookies>>;
  try { store = await cookies(); }
  catch (error) {
    // Offline imports/maintenance have no Next request and curate the shared
    // directories. Do not swallow authentication/database errors in requests.
    if (/outside a request scope|requestAsyncStorage|was called outside/i.test(String(error))) return null;
    throw error;
  }
  let result = requestScopes.get(store);
  if (!result) {
    result = (async () => {
      const token = store.get('echo_session')?.value;
      if (!token) {
        const authorization=(await headers()).get('authorization');
        const expected=process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
        if(expected && authorization && Buffer.byteLength(authorization)===Buffer.byteLength(expected) && timingSafeEqual(new TextEncoder().encode(authorization),new TextEncoder().encode(expected)))return null;
        return emptyScope();
      }
      const session=await base.userSession.findFirst({where:{tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:{gt:new Date()},user:{isActive:true}},include:{user:true}});
      if(!session)return emptyScope();
      const organizationId=(session.user.role==='PLATFORM_ADMIN' ? store.get('neat_support_organization')?.value : null) || session.user.organizationId;
      return organizationId ? loadStateScope(base,organizationId) : emptyScope();
    })();
    requestScopes.set(store,result);
  }
  return result;
}

// Background tenant jobs can opt into the same policy without HTTP cookies.
export async function withOrganizationStateAccess<T>(base: PrismaClient, organizationId: string, work: () => Promise<T>) {
  return explicitScope.run(await loadStateScope(base,organizationId),work);
}
export function withAccountStateScope<T>(scope: StateScope, work: () => Promise<T>) { return explicitScope.run(scope,work); }

export function extendWithAccountStateAccess(base: PrismaClient) {
  return base.$extends({ name:'tenant-account-states', query: { $allModels: { async $allOperations({model,operation,args,query}) {
    // Auth/configuration reads must not recurse and need no directory lookup.
    if(['User','UserSession','Organization','OrganizationFeature','OrganizationAuditEvent','OrganizationVendorIdentifier','OrganizationProduct'].includes(model) && !('include' in args) && !('select' in args))return query(args);
    const scope=await resolveRequestScope(base);
    if(!scope)return query(args);
    const values=args as Record<string,unknown>;
    if(readOperations.has(operation)) {
      const result = await query(scopeReadArgs(model,values,scope) as typeof args);
      remember(scope, model, result);
      return result;
    }
    if(whereWrites.has(operation)) {
      const policy=modelStateWhere(model,scope);
      if(policy)values.where=combineWhere(values.where,policy);
    }
    for(const key of ['data','create','update']) {
      const data=values[key];
      if(data)for(const row of Array.isArray(data)?data:[data]) {
        assertStateWrite(model,row,scope,key==='create'||operation.startsWith('create'));
        await assertParentReferences(base,model,row,scope);
      }
    }
    const readSelection = scopeReadArgs(model, values, scope);
    for (const key of ['include','select']) if (key in values) (values as Record<string, unknown>)[key] = readSelection[key];
    const result=await query(args);
    remember(scope,model,result);
    if(['Agency','WholesaleAccount'].includes(model) && ['create','upsert'].includes(operation) && result && typeof result==='object' && 'id' in result && typeof result.id==='string') {
      const ids=model==='Agency'?scope.agencyIds:scope.restaurantIds;
      if(!ids.includes(result.id))ids.push(result.id);
    }
    return result;
  } } } });
}
