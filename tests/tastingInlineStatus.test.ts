import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { getTastingStatusActions, tastingStatusControlData } from '../lib/tastings/statusActions';
import { TASTING_STATUS_LABELS, type TastingState } from '../lib/tastings/model';

const rawTasting = (overrides: Partial<TastingState> = {}) => ({
  id: 'tasting-a', version: 7, assignedTasterUserId: 'taster-a',
  tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'NOT_SUBMITTED',
  cancelledAt: null, completedAt: null, endsAt: new Date('2026-11-20T23:00:00Z'),
  ...overrides,
});
const control = (overrides: Partial<TastingState> = {}) => tastingStatusControlData(rawTasting(overrides));
type ControlData = ReturnType<typeof tastingStatusControlData>;
const coordinator = { userId: 'coordinator-a', coordinator: true };
const taster = { userId: 'taster-a', coordinator: false };
const actions = (value: ControlData, actor = coordinator) => getTastingStatusActions(value, actor).map(option => option.action);

test('inline status payload contains only serializable identity, version and workflow facts', () => {
  const data = tastingStatusControlData({ ...rawTasting(), internalNotes: 'Private coordinator text', importMetadata: { originalTaster: 'Original name' } } as ReturnType<typeof rawTasting>);
  assert.equal(data.id, 'tasting-a');
  assert.equal(data.version, 7);
  assert.equal(data.status, 'NEEDS_TASTER_RESPONSE');
  assert.equal(data.terminal, false);
  assert.equal('internalNotes' in data, false);
  assert.equal('importMetadata' in data, false);
  assert.equal('endsAt' in data, false);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

test('inline response choices belong only to the assigned taster, including administrators assigned as taster', () => {
  assert.deepEqual(actions(control(), taster), ['TASTER_APPROVE', 'TASTER_NEEDS_EDIT']);
  assert.deepEqual(actions(control(), { userId: 'another-taster', coordinator: false }), []);
  assert.deepEqual(actions(control()), ['CANCEL']);
  const assignedAdmin = actions(control(), { userId: 'taster-a', coordinator: true });
  assert.ok(assignedAdmin.includes('TASTER_APPROVE'));
  assert.ok(assignedAdmin.includes('TASTER_NEEDS_EDIT'));
  assert.ok(assignedAdmin.includes('CANCEL'));
  const approved = actions(control({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'APPROVED' }), taster);
  assert.ok(approved.includes('TASTER_NEEDS_EDIT'));
  assert.equal(approved.includes('TASTER_APPROVE'), false);
});

test('coordinator dropdown choices follow the current approval milestones and cannot skip prerequisites', () => {
  const tasterApproved = control({ tasterResponse: 'APPROVED' });
  assert.ok(actions(tasterApproved).includes('REQUEST_AGENCY_APPROVAL'));
  assert.equal(actions(tasterApproved).includes('AGENCY_APPROVE'), false);
  assert.equal(actions(tasterApproved).includes('SUBMIT_TO_STATE'), false);
  const requested = control({ tasterResponse: 'APPROVED', agencyApproval: 'REQUESTED' });
  assert.ok(actions(requested).includes('AGENCY_APPROVE'));
  assert.ok(actions(requested).includes('AGENCY_DENY'));
  assert.equal(actions(requested).includes('SUBMIT_TO_STATE'), false);
  const agencyApproved = control({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED' });
  assert.ok(actions(agencyApproved).includes('SUBMIT_TO_STATE'));
  assert.equal(actions(agencyApproved).includes('STATE_APPROVE'), false);
  assert.equal(actions(control({ agencyApproval: 'APPROVED' })).includes('SUBMIT_TO_STATE'), false);
  const submitted = control({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'SUBMITTED' });
  assert.ok(actions(submitted).includes('STATE_APPROVE'));
  assert.ok(actions(submitted).includes('STATE_DENY'));
  assert.equal(actions(submitted, taster).includes('STATE_APPROVE'), false);
});

test('comment requirements remain explicit and terminal/completed rows cannot be manually rewritten', () => {
  const response = getTastingStatusActions(control(), taster);
  assert.equal(response.find(option => option.action === 'TASTER_NEEDS_EDIT')?.comment, 'required');
  assert.equal(getTastingStatusActions(control(), coordinator).find(option => option.action === 'CANCEL')?.comment, 'required');
  const agencyRequested = control({ tasterResponse: 'APPROVED', agencyApproval: 'REQUESTED' });
  assert.equal(getTastingStatusActions(agencyRequested, coordinator).find(option => option.action === 'AGENCY_DENY')?.comment, 'optional');
  const submitted = control({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'SUBMITTED' });
  assert.equal(getTastingStatusActions(submitted, coordinator).find(option => option.action === 'STATE_DENY')?.comment, 'optional');
  for (const terminal of [{ cancelledAt: new Date() }, { completedAt: new Date() }, { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' }]) {
    assert.deepEqual(actions(control(terminal)), []);
    assert.deepEqual(actions(control(terminal), taster), []);
  }
  const forbidden = new Set(['COMPLETED', 'DRAFT', 'SAVE_FEEDBACK']);
  for (const state of [control(), control({ tasterResponse: 'APPROVED' }), agencyRequested, submitted]) {
    assert.ok(actions(state).every(action => !forbidden.has(action)));
  }
});

type Element = { type: any; props: Record<string, any> };
type ActionResult = { error?: string; success?: string };

/** Exercise the actual component's handlers using the repository's existing VM hook pattern. */
function loadStatusSelect(initial: ControlData, action: (data: FormData) => Promise<ActionResult>, actor = coordinator) {
  const slots: any[] = [];
  let cursor = 0;
  let props = initial;
  let refreshes = 0;
  const notices: Array<{ type: string; detail: unknown }> = [];
  const effects: Array<() => void> = [];
  const hooks = {
    useState(initialValue: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initialValue: any) { const index = cursor++; return slots[index] ??= { current: initialValue }; },
    useId() { const index = cursor++; return `inline-status-${index}`; },
    useCallback(callback: any) { return callback; },
    useMemo(factory: () => any) { return factory(); },
    useEffect(callback: () => void, dependencies: unknown[]) {
      const index = cursor++;
      const previous = slots[index] as unknown[] | undefined;
      if (!previous || dependencies.some((value, i) => value !== previous[i])) { slots[index] = dependencies; effects.push(callback); }
    },
  };
  const jsx = (type: any, properties: any, ...children: any[]) => ({ type, props: { ...properties, children } });
  const module = { exports: {} as Record<string, (value: any) => Element | null> };
  const source = ts.transpileModule(readFileSync('app/tastings/TastingStatusSelect.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, FormData, Set, Error, React: { createElement: jsx },
    CustomEvent: class { type: string; detail: unknown; constructor(type: string, options: { detail?: unknown } = {}) { this.type = type; this.detail = options.detail; } },
    window: { dispatchEvent(event: { type: string; detail: unknown }) { notices.push(event); return true; } },
    require(name: string) {
      if (name === 'react') return hooks;
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() { refreshes++; }, push() { throw Error('Inline change must not navigate'); }, replace() { throw Error('Inline change must not navigate'); } }) };
      if (name.endsWith('/statusActions')) return { getTastingStatusActions, tastingStatusControlData };
      if (name.endsWith('/model')) return { TASTING_STATUS_LABELS };
      if (name === './actions') return { transitionTastingAction: action };
      if (name.endsWith('.css')) return {};
      throw Error(`Unexpected inline status dependency ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    const tree = module.exports.TastingStatusSelect({ tasting: props, currentUserId: actor.userId, coordinator: actor.coordinator, label: 'Status for Synthetic Market' });
    while (effects.length) effects.shift()!();
    return tree;
  };
  const elements = (node: any): Element[] => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const select = (tree = render()) => elements(tree).find(node => node.type === 'select')!;
  const comment = (tree = render()) => elements(tree).find(node => node.type === 'textarea' && node.props.name === 'comment') ?? elements(tree).find(node => node.type === 'textarea');
  const submit = async (tree = render()) => {
    const form = elements(tree).find(node => node.type === 'form');
    if (form) await form.props.onSubmit({ preventDefault() {}, currentTarget: { reportValidity: () => true } });
    else {
      const button = elements(tree).find(node => node.type === 'button' && /Save|Update|Confirm/.test(text(node.props.children)));
      assert.ok(button, 'Inline comment change must offer an explicit confirmation');
      await button.props.onClick();
    }
  };
  return { render, elements, text, select, comment, submit, notices, refreshes: () => refreshes, update(data: ControlData) { props = data; }, change(value: string) { return select().props.onChange({ target: { value }, currentTarget: { value } }); } };
}

test('simple inline status saves the exact record/version/action, refreshes in place and emits a persistent success notice', async () => {
  const calls: FormData[] = [];
  const h = loadStatusSelect(control({ tasterResponse: 'APPROVED' }), async data => { calls.push(data); return { success: 'Tasting updated.' }; });
  h.change('REQUEST_AGENCY_APPROVAL');
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].get('id'), 'tasting-a');
  assert.equal(calls[0].get('version'), '7');
  assert.equal(calls[0].get('action'), 'REQUEST_AGENCY_APPROVAL');
  assert.equal(h.refreshes(), 1);
  assert.ok(h.notices.some(event => event.type === 'neat-action-success' && typeof event.detail === 'string' && event.detail.length > 0));
});

test('Needs Edit requires an inline comment before the existing transition action is called', async () => {
  const calls: FormData[] = [];
  const h = loadStatusSelect(control(), async data => { calls.push(data); return { success: 'Tasting updated.' }; }, taster);
  h.change('TASTER_NEEDS_EDIT');
  await new Promise(setImmediate);
  assert.equal(calls.length, 0);
  let tree = h.render();
  const field = h.comment(tree);
  assert.ok(field);
  assert.equal(field.props.required, true);
  await h.submit(tree);
  assert.equal(calls.length, 0);
  field.props.onChange({ target: { value: 'I can work after five.' }, currentTarget: { value: 'I can work after five.' } });
  tree = h.render();
  await h.submit(tree);
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].get('action'), 'TASTER_NEEDS_EDIT');
  assert.equal(calls[0].get('comment'), 'I can work after five.');
});

test('rejected inline changes retain the current workflow status and entered reason without navigation or success notice', async () => {
  const h = loadStatusSelect(control(), async () => ({ error: 'This tasting changed. Reload before saving.' }));
  h.change('CANCEL');
  const field = h.comment();
  assert.ok(field);
  field.props.onChange({ target: { value: 'Store cancelled the tasting.' }, currentTarget: { value: 'Store cancelled the tasting.' } });
  await h.submit(h.render());
  await new Promise(setImmediate);
  const tree = h.render();
  assert.equal(h.comment(tree)?.props.value, 'Store cancelled the tasting.');
  assert.ok(h.elements(tree).some(node => node.props?.role === 'alert' && h.text(node).includes('changed')));
  assert.ok(h.text(tree).includes('Needs Taster Response'));
  assert.equal(h.refreshes(), 0);
  assert.equal(h.notices.length, 0);
});

test('in-flight inline status saves cannot be submitted a second time and terminal rows expose no editable select', async () => {
  let calls = 0, resolve: (result: ActionResult) => void = () => {};
  const h = loadStatusSelect(control({ tasterResponse: 'APPROVED' }), async () => { calls++; return new Promise<ActionResult>(done => { resolve = done; }); });
  h.change('REQUEST_AGENCY_APPROVAL');
  h.change('REQUEST_AGENCY_APPROVAL');
  assert.equal(calls, 1);
  assert.equal(h.select().props.disabled, true);
  resolve({ success: 'Tasting updated.' });
  await new Promise(setImmediate);
  const terminal = loadStatusSelect(control({ completedAt: new Date() }), async () => { throw Error('Completed tasting cannot be changed'); });
  assert.equal(terminal.elements(terminal.render()).filter(node => node.type === 'select').length, 0);
});
