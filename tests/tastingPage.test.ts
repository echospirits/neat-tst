import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import ts from 'typescript';
import { addDaysToDateInputValue, formatDateOnly, formatEasternDateTime } from '../lib/dateTime';
import { deriveTastingStatus, TASTING_STATUS_LABELS } from '../lib/tastings/model';

type Node = ReactElement<Record<string, unknown>>;
type QueryOptions = Record<string, unknown> & { from?: Date; to?: Date; today?: Date };
const TODAY = '2026-11-06';
const Link = () => null;
const PageHeader = () => null;
const LiveFilterForm = () => null;
const TastingBrowse = () => null;
const TastingStatusSelect = () => null;

function loadModule(path: string, dependencies: Record<string, unknown>) {
  const filename = resolve(path);
  const nativeRequire = createRequire(filename);
  const exports: Record<string, (...args: any[]) => any> = {};
  runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, URLSearchParams,
    require: (name: string) => {
      if (['react', 'react/jsx-runtime'].includes(name)) return nativeRequire(name);
      if (name === 'next/link') return { default: Link };
      return new Proxy(dependencies, { get: (values, key: string) => values[key] ?? (() => null) });
    },
  });
  return exports;
}

function allNodes(root: ReactNode): Node[] {
  if (Array.isArray(root)) return root.flatMap(allNodes);
  if (!isValidElement<Record<string, unknown>>(root)) return [];
  return [root, ...allNodes(root.props.children as ReactNode)];
}

function text(root: ReactNode): string {
  if (Array.isArray(root)) return root.map(text).join(' ');
  if (isValidElement<Record<string, unknown>>(root)) return text(root.props.children as ReactNode);
  return typeof root === 'string' || typeof root === 'number' ? String(root) : '';
}

function link(root: ReactNode, label: string) {
  const found = allNodes(root).find(node => node.type === Link && text(node.props.children as ReactNode).trim() === label);
  assert.ok(found, `Expected a ${label} link.`);
  assert.equal(typeof found.props.href, 'string');
  return new URL(found.props.href as string, 'https://neat.test');
}

function fixture(index = 0) {
  return {
    id: `tasting-${index}`, agencyId: 'agency-a', assignedTasterUserId: 'taster-a',
    agency: { id: 'agency-a', agencyId: '107', name: 'Market #7', city: 'Columbus' },
    assignedTaster: { id: 'taster-a', name: 'Taster A' },
    scheduledDate: new Date(`${TODAY}T00:00:00Z`),
    startsAt: new Date(`${TODAY}T22:00:00Z`), endsAt: new Date(`${TODAY}T23:00:00Z`),
    tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'NOT_SUBMITTED',
    workflowStatusOverride: null, completedAt: null,
  };
}

function pageHarness(records: ReturnType<typeof fixture>[] = [], coordinator = true) {
  const actor = { organizationId: 'org-a', userId: 'taster-a', role: coordinator ? 'ADMIN' : 'TASTER' };
  const calls: { actor: unknown; options: QueryOptions }[] = [];
  const navigation = loadModule('lib/tastings/navigation.ts', {});
  const page = loadModule('app/tastings/page.tsx', {
    ...navigation, PageHeader, LiveFilterForm, TastingBrowse, TastingStatusSelect,
    requireTastingActor: async () => ({ actor, user: { id: actor.userId }, coordinator }),
    listTastings: async (passedActor: unknown, options: QueryOptions) => { calls.push({ actor: passedActor, options }); return records; },
    formatEasternDateInputValue: () => TODAY,
    addDaysToDateInputValue, formatDateOnly, formatEasternDateTime, deriveTastingStatus, TASTING_STATUS_LABELS,
    getUserDisplayName: (user: { name: string }) => user.name,
    tastingStatusControlData: (tasting: ReturnType<typeof fixture>) => ({ id: tasting.id, status: deriveTastingStatus(tasting) }),
  });
  return {
    actor, calls,
    render: (params: Record<string, string> = {}) => page.default({ searchParams: Promise.resolve(params) }) as Promise<ReactNode>,
  };
}

test('Tastings validates the requested date order and uses the view defaults', async () => {
  for (const [view, expected] of [['upcoming', 'asc'], ['history', 'desc'], ['calendar', 'asc']] as const) {
    const page = pageHarness();
    const tree = await page.render({ view, order: 'not-an-order' });
    assert.equal(page.calls.length, 1);
    assert.equal(page.calls[0].options.order, expected);
    if (view !== 'calendar') assert.equal(page.calls[0].options.view, view);
    const filter = allNodes(tree).find(node => node.type === LiveFilterForm);
    assert.ok(filter);
    const orderField = allNodes(filter.props.children as ReactNode).find(node => node.props.name === 'order');
    if (view === 'calendar') assert.equal(orderField, undefined);
    else assert.equal(orderField?.props.defaultValue, expected);
  }
  const page = pageHarness();
  await page.render({ view: 'unknown', order: 'desc' });
  assert.equal(page.calls[0].options.view, 'upcoming');
  assert.equal(page.calls[0].options.order, 'desc');
});

test('Tastings passes the authenticated taster actor and bounded search without accepting broader URL scope', async () => {
  const page = pageHarness([], false);
  const tree = await page.render({
    view: 'history', q: '  Market #7  ', order: 'asc', page: '2',
    organizationId: 'org-other', assignedTasterUserId: 'someone-else', role: 'ADMIN',
  });
  const { actor, options } = page.calls[0];
  assert.equal(actor, page.actor);
  assert.equal(options.search, 'Market #7');
  assert.equal(options.view, 'history');
  assert.equal(options.order, 'asc');
  assert.equal(options.limit, 101);
  assert.equal(options.offset, 200);
  assert.equal(options.today?.toISOString(), `${TODAY}T00:00:00.000Z`);
  for (const key of ['organizationId', 'assignedTasterUserId', 'role']) assert.equal(options[key], undefined);
  const header = allNodes(tree).find(node => node.type === PageHeader);
  assert.ok(header);
  assert.match(String(header.props.meta), /Assigned to you/);
  assert.equal(header.props.actions, undefined);
  assert.ok(!allNodes(tree).some(node => node.type === Link && String(node.props.href).includes('/tastings/settings')));
});

test('Tasting browsing exposes only the bounded page and carries search and order through paging and clearing', async () => {
  const records = Array.from({ length: 101 }, (_, index) => fixture(index));
  const page = pageHarness(records);
  const tree = await page.render({ view: 'history', q: 'Market #7', order: 'asc', page: '2' });
  const browse = allNodes(tree).find(node => node.type === TastingBrowse);
  assert.ok(browse);
  const visible = browse.props.tastings as typeof records;
  assert.equal(visible.length, 100);
  assert.equal(visible[0], records[0]);
  assert.equal(visible[99], records[99]);
  assert.ok(!visible.includes(records[100]));
  assert.match(text(tree), /201–300 shown/i);
  assert.match(text(tree), /More available/i);
  for (const [label, expectedPage] of [['Previous 100', '1'], ['Next 100', '3']] as const) {
    const destination = link(tree, label);
    assert.equal(destination.searchParams.get('view'), 'history');
    assert.equal(destination.searchParams.get('q'), 'Market #7');
    assert.equal(destination.searchParams.get('order'), 'asc');
    assert.equal(destination.searchParams.get('page'), expectedPage);
  }
  const cleared = link(tree, 'Clear search');
  assert.equal(cleared.searchParams.has('q'), false);
  assert.equal(cleared.searchParams.get('view'), 'history');
  assert.equal(cleared.searchParams.get('order'), 'asc');
  assert.equal(cleared.searchParams.get('page') ?? '0', '0');
  const returnTo = new URL(String(browse.props.returnTo), 'https://neat.test');
  assert.equal(returnTo.searchParams.get('q'), 'Market #7');
  assert.equal(returnTo.searchParams.get('order'), 'asc');
  assert.equal(returnTo.searchParams.get('page'), '2');
  const firstPage = await pageHarness(records).render({ view: 'history' });
  assert.match(text(firstPage), /100\s+tastings shown/i);
  assert.doesNotMatch(text(firstPage), /101\s+tastings shown|tastings total|total tastings/i);
});

test('Tasting view tabs retain the search, explicit order and calendar context while resetting pagination', async () => {
  const page = pageHarness();
  const tree = await page.render({ view: 'calendar', q: 'Market #7', order: 'desc', month: '2026-12', period: 'week', date: '2026-12-16', page: '4' });
  for (const [label, view] of [['Workflow / Upcoming', 'upcoming'], ['Calendar', 'calendar'], ['History', 'history']] as const) {
    const destination = link(tree, label);
    assert.equal(destination.searchParams.get('view'), view);
    assert.equal(destination.searchParams.get('q'), 'Market #7');
    assert.equal(destination.searchParams.get('order'), 'desc');
    assert.equal(destination.searchParams.get('page') ?? '0', '0');
    if (view === 'calendar') {
      assert.equal(destination.searchParams.get('month'), '2026-12');
      assert.equal(destination.searchParams.get('period'), 'week');
      assert.equal(destination.searchParams.get('date'), '2026-12-16');
    }
  }
});

test('Calendar week navigation, search clearing and detail return preserve the current filtered scope', async () => {
  const page = pageHarness([fixture()]);
  const tree = await page.render({ view: 'calendar', q: 'Market #7', order: 'desc', month: '2026-11', period: 'week', date: TODAY });
  assert.equal(page.calls[0].options.order, 'desc');
  assert.equal(page.calls[0].options.search, 'Market #7');
  assert.equal(page.calls[0].options.limit, 250);
  assert.equal(page.calls[0].options.from?.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(page.calls[0].options.to?.toISOString(), '2026-11-08T00:00:00.000Z');
  for (const [label, expectedDate] of [['Previous', '2026-10-25'], ['Next', '2026-11-08']] as const) {
    const destination = link(tree, label);
    assert.equal(destination.searchParams.get('view'), 'calendar');
    assert.equal(destination.searchParams.get('q'), 'Market #7');
    assert.equal(destination.searchParams.get('order'), 'desc');
    assert.equal(destination.searchParams.get('period'), 'week');
    assert.equal(destination.searchParams.get('date'), expectedDate);
  }
  const cleared = link(tree, 'Clear search');
  assert.equal(cleared.searchParams.has('q'), false);
  assert.equal(cleared.searchParams.get('order'), 'desc');
  assert.equal(cleared.searchParams.get('period'), 'week');
  assert.equal(cleared.searchParams.get('date'), TODAY);
  const detailNode = allNodes(tree).find(node => node.type === Link && String(node.props.href).startsWith('/tastings/tasting-0?'));
  assert.ok(detailNode, 'Expected the calendar event to link to its detail page.');
  const detail = new URL(String(detailNode.props.href), 'https://neat.test');
  const returnTo = new URL(detail.searchParams.get('returnTo')!, 'https://neat.test');
  assert.equal(returnTo.searchParams.get('q'), 'Market #7');
  assert.equal(returnTo.searchParams.get('order'), 'desc');
  assert.equal(returnTo.searchParams.get('period'), 'week');
  assert.equal(returnTo.searchParams.get('date'), TODAY);
});

test('Calendar month navigation retains the Agency search and communicates its bounded cap', async () => {
  const page = pageHarness(Array.from({ length: 250 }, (_, index) => fixture(index)));
  const tree = await page.render({ view: 'calendar', q: 'Market #7', order: 'asc', period: 'month', month: '2026-11' });
  assert.equal(page.calls[0].options.from?.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(page.calls[0].options.to?.toISOString(), '2026-12-01T00:00:00.000Z');
  for (const [label, expectedMonth] of [['Previous', '2026-10'], ['Next', '2026-12']] as const) {
    const destination = link(tree, label);
    assert.equal(destination.searchParams.get('q'), 'Market #7');
    assert.equal(destination.searchParams.get('order'), 'asc');
    assert.equal(destination.searchParams.get('period'), 'month');
    assert.equal(destination.searchParams.get('month'), expectedMonth);
  }
  assert.match(text(tree), /250\s+tastings shown/i);
  assert.match(text(tree), /week|narrow/i);
  assert.doesNotMatch(text(tree), /250\s+tastings (?:in total|total)/i);
});
