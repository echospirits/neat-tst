import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

type Element = { type: any; props: Record<string, any> };
type Result = { success?: string; error?: string };
type Props = {
  id: string; version: number; assignedTasterUserId: string | null; currentTasterName: string;
  label: string; canAssign: boolean; options: Array<{ value: string; label: string }>; unavailableReason?: string;
};
const initial: Props = {
  id: 'tasting-a', version: 7, assignedTasterUserId: 'taster-a', currentTasterName: 'Jamie Taster',
  label: 'Synthetic Market on Nov 20', canAssign: true,
  options: [{ value: 'taster-a', label: 'Jamie Taster' }, { value: 'taster-b', label: 'Jordan Taster' }],
};
const RecordPicker = () => null;

/** Exercise the real component handlers; the shared picker's browser behavior is checked separately. */
function harness(action: (data: FormData) => Promise<Result>, overrides: Partial<Props> = {}) {
  let props = { ...initial, ...overrides };
  const slots: any[] = [];
  let cursor = 0, refreshes = 0, focusReturns = 0;
  const body = {};
  const document = { body, activeElement: body };
  const effects: Array<() => void> = [];
  const notices: Array<{ type: string; detail: unknown }> = [];
  const hooks = {
    useState(value: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(value: any) { const index = cursor++; return slots[index] ??= { current: value }; },
    useEffect(callback: () => void, dependencies: unknown[]) {
      const index = cursor++;
      const previous = slots[index] as unknown[] | undefined;
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        slots[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  const jsx = (type: any, properties: any, ...children: any[]) => {
    if (typeof type === 'string' && properties?.ref) {
      const summary = { focus() { focusReturns++; document.activeElement = summary; } };
      properties.ref.current = {
        ownerDocument: document,
        contains: (element: unknown) => element === summary,
        querySelector: (selector: string) => selector === 'summary' ? summary : null,
      };
    }
    return { type, props: { ...properties, children } };
  };
  const module = { exports: {} as Record<string, (props: Props) => Element> };
  const source = ts.transpileModule(readFileSync('app/tastings/TastingAssigneeSelect.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, FormData, React: { createElement: jsx, Fragment: Symbol('Fragment') },
    CustomEvent: class {
      type: string; detail: unknown;
      constructor(type: string, options: { detail?: unknown } = {}) { this.type = type; this.detail = options.detail; }
    },
    window: { dispatchEvent(event: { type: string; detail: unknown }) { notices.push(event); return true; } },
    require(name: string) {
      if (name === 'react') return hooks;
      if (name === 'next/navigation') return { useRouter: () => ({
        refresh() { refreshes++; }, push() { throw Error('Assignment must save in place'); }, replace() { throw Error('Assignment must save in place'); },
      }) };
      if (name === '../components/RecordPicker') return { RecordPicker };
      if (name === './actions') return { reassignTastingAction: action };
      throw Error(`Unexpected assignment control dependency ${name}`);
    },
  });
  const elements = (node: any): Element[] => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join('')
    : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const render = () => {
    cursor = 0;
    const tree = module.exports.TastingAssigneeSelect(props);
    while (effects.length) effects.shift()!();
    return tree;
  };
  const picker = (tree = render()) => elements(tree).find(node => node.type === RecordPicker);
  return { render, elements, text, picker, notices, refreshes: () => refreshes, focusReturns: () => focusReturns,
    remount(next: Partial<Props>, active: 'body' | 'other' = 'body') {
      props = { ...props, ...next };
      slots.length = 0;
      effects.length = 0;
      document.activeElement = active === 'body' ? body : {};
    },
    change(value: string) { const control = picker(); assert.ok(control); control.props.onChange(value); } };
}
const settled = () => new Promise(setImmediate);

test('Taster-only read view preserves the current identity and never exposes reassignment', () => {
  const h = harness(async () => { throw Error('Read view must not write'); }, { canAssign: false });
  const tree = h.render();
  assert.equal(h.picker(tree), undefined);
  assert.match(h.text(tree), /Jamie Taster/);
  assert.equal(h.refreshes(), 0);
});

test('locked assignments retain their identity and explain the unavailable action', () => {
  for (const unavailableReason of ['Visit logged · assignment locked', 'Reopen status to reassign']) {
    const h = harness(async () => { throw Error('Locked view must not write'); }, { unavailableReason });
    const tree = h.render();
    assert.equal(h.picker(tree), undefined);
    assert.match(h.text(tree), /Jamie Taster/);
    assert.ok(h.text(tree).includes(unavailableReason));
  }
});

test('inline reassignment sends only identity, expected version and the selected assignee, then refreshes in place', async () => {
  const calls: FormData[] = [];
  const h = harness(async data => { calls.push(data); return { success: 'Taster updated.' }; });
  const picker = h.picker();
  assert.ok(picker);
  assert.equal(picker.props.allowEmpty, false);
  assert.equal(picker.props.defaultValue, 'taster-a');
  assert.equal(picker.props.placeholder, 'Jamie Taster');
  assert.match(picker.props.label, /Assigned taster.*Synthetic Market/);
  h.change('taster-b');
  await settled();
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.fromEntries(calls[0]), { id: 'tasting-a', version: '7', assignedTasterUserId: 'taster-b' });
  assert.equal(h.refreshes(), 1);
  assert.ok(h.notices.some(event => event.type === 'neat-action-success' && /taster/i.test(String(event.detail))));
});

test('unchanged, empty or unoffered values cannot start an assignment write', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { success: 'Taster updated.' }; });
  for (const value of ['taster-a', '', 'other-tenant-user']) h.change(value);
  await settled();
  assert.equal(calls, 0);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.notices.length, 0);
});

test('pending reassignment disables the picker and prevents a duplicate save', async () => {
  let calls = 0, complete: (result: Result) => void = () => {};
  const h = harness(async () => { calls++; return new Promise<Result>(resolve => { complete = resolve; }); });
  h.change('taster-b');
  h.change('taster-b');
  assert.equal(calls, 1);
  const tree = h.render();
  assert.equal(tree.props['aria-busy'], true);
  assert.equal(h.picker(tree)?.props.disabled, true);
  assert.ok(h.elements(tree).some(node => node.props.role === 'status' && /Saving taster/.test(h.text(node))));
  complete({ success: 'Taster updated.' });
  await settled();
  assert.equal(h.picker()?.props.disabled, false);
});

test('a rejected assignment restores the saved picker value, surfaces the server error and returns focus without false success', async () => {
  const h = harness(async () => ({ error: 'This tasting changed. Reload before saving.' }));
  const before = h.picker();
  h.change('taster-b');
  await settled();
  const after = h.picker();
  assert.ok(before && after);
  assert.notEqual(after.props.key, before.props.key, 'Remount the shared picker so its selection returns to persisted data.');
  assert.equal(after.props.defaultValue, 'taster-a');
  assert.match(after.props.error, /changed/);
  assert.equal(h.focusReturns(), 1);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.notices.length, 0);
});

test('an unexpected request failure retains the last known identity, explains how to confirm the outcome and never announces success', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw Error('Offline'); });
  h.change('taster-b');
  await settled();
  const picker = h.picker();
  assert.ok(picker);
  assert.equal(picker.props.defaultValue, 'taster-a');
  assert.equal(picker.props.disabled, false);
  assert.match(picker.props.error, /Could not confirm.*Refresh.*saved assignment/i);
  assert.equal(h.focusReturns(), 1);
  h.change('taster-b');
  await settled();
  assert.equal(calls, 2);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.notices.length, 0);
});

test('an unmapped assignment stays truthful and an empty eligible list explains why no taster can be chosen', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { success: 'Taster updated.' }; }, {
    assignedTasterUserId: null, currentTasterName: 'Needs identity mapping', options: [],
  });
  const tree = h.render(), picker = h.picker(tree);
  assert.ok(picker);
  assert.equal(picker.props.defaultValue, '');
  assert.equal(picker.props.placeholder, 'Needs identity mapping');
  assert.equal(picker.props.allowEmpty, false);
  assert.equal(picker.props.disabled, true);
  assert.match(h.text(tree), /No active tasters available/);
  h.change('');
  await settled();
  assert.equal(calls, 0);
});

test('the refreshed replacement receives focus even before the save response resolves, and the handoff is record-specific and consumed once', async () => {
  let complete: (result: Result) => void = () => {};
  const h = harness(async () => new Promise<Result>(resolve => { complete = resolve; }));
  h.change('taster-b');
  h.remount({ id: 'other-tasting', version: 8, assignedTasterUserId: 'taster-b', currentTasterName: 'Jordan Taster' });
  h.render();
  assert.equal(h.focusReturns(), 0, 'An unrelated refreshed row must not claim the handoff.');
  h.remount({ id: 'tasting-a', version: 8 });
  h.render();
  assert.equal(h.focusReturns(), 1, 'The matching refreshed row restores focus after its previous DOM was replaced.');
  h.remount({ version: 9 });
  h.render();
  assert.equal(h.focusReturns(), 1, 'A later refresh must not repeat an already consumed focus handoff.');
  complete({ success: 'Taster updated.' });
  await settled();
  assert.equal(h.refreshes(), 1);
});

test('successful refresh preserves a deliberate move to another control instead of stealing focus', async () => {
  const h = harness(async () => ({ success: 'Taster updated.' }));
  h.change('taster-b');
  await settled();
  h.remount({ version: 8, assignedTasterUserId: 'taster-b', currentTasterName: 'Jordan Taster' }, 'other');
  h.render();
  assert.equal(h.focusReturns(), 0);
  h.remount({ version: 9 });
  h.render();
  assert.equal(h.focusReturns(), 0, 'An intentionally declined handoff must not steal focus on a later refresh.');
});

test('rejected and unconfirmed saves clear their focus handoff before unrelated later assignment updates', async () => {
  for (const action of [async () => ({ error: 'Assignment rejected.' }), async (): Promise<Result> => { throw Error('Offline'); }]) {
    const h = harness(action);
    h.change('taster-b');
    await settled();
    h.render();
    assert.equal(h.focusReturns(), 1, 'Failure returns focus to the current saved picker.');
    h.remount({ version: 8, assignedTasterUserId: 'taster-b', currentTasterName: 'Jordan Taster' });
    h.render();
    assert.equal(h.focusReturns(), 1, 'A failed save must not leave a bookmark that later steals focus.');
    assert.equal(h.refreshes(), 0);
    assert.equal(h.notices.length, 0);
  }
});
