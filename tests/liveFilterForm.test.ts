import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

type Element = { type: string; props: Record<string, any> };
type UrlValues = Record<string, string>;

/** Run the real uncontrolled form's URL effect after attaching its DOM ref. */
function formHarness(initialUrlValues?: UrlValues) {
  const document: { activeElement: unknown } = { activeElement: null };
  let programmaticFocuses = 0;
  class Field {
    constructor(public name: string, public value: string) {}
    focus() { programmaticFocuses++; document.activeElement = this; }
  }
  class Input extends Field {
    constructor(name: string, value: string, public type = 'search') { super(name, value); }
  }
  class Select extends Field {}
  class Textarea extends Field {}
  const query = new Input('q', initialUrlValues?.q ?? 'Existing query');
  const view = new Input('view', initialUrlValues?.view ?? 'upcoming', 'hidden');
  const order = new Select('order', initialUrlValues?.order ?? 'asc');
  const fields = [query, view, order];
  const form = { elements: Object.assign(fields, { namedItem: (name: string) => fields.find(field => field.name === name) ?? null }) };
  const slots: any[] = [];
  let cursor = 0;
  const effects: Array<() => void | (() => void)> = [];
  const requests: { href: string; options: unknown }[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const hooks = {
    useRef(initial: unknown) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useTransition() { cursor++; return [false, (callback: () => void) => callback()]; },
    useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
      const index = cursor++;
      const previous = slots[index] as unknown[] | undefined;
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        slots[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  const jsx = (type: string, properties: Record<string, unknown>, ...children: unknown[]) => ({ type, props: { ...properties, children } });
  const module = { exports: {} as { LiveFilterForm: (props: { children: null; urlValues?: UrlValues }) => Element } };
  const source = ts.transpileModule(readFileSync('app/components/LiveFilterForm.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, URLSearchParams, FormData, document,
    HTMLInputElement: Input, HTMLSelectElement: Select, HTMLTextAreaElement: Textarea,
    React: { createElement: jsx },
    window: {
      setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); return timers.length; },
      clearTimeout() {},
    },
    require(name: string) {
      if (name === 'react') return hooks;
      if (name === 'next/navigation') return {
        usePathname: () => '/tastings',
        useSearchParams: () => new URLSearchParams(),
        useRouter: () => ({ replace(href: string, options: unknown) { requests.push({ href, options }); } }),
      };
      throw Error(`Unexpected live filter dependency ${name}`);
    },
  });
  const render = (urlValues: UrlValues | undefined = initialUrlValues) => {
    cursor = 0;
    const tree = module.exports.LiveFilterForm({ children: null, urlValues });
    assert.equal(tree.type, 'form');
    tree.props.ref.current = form;
    while (effects.length) effects.shift()!();
    return tree;
  };
  const focus = (element: unknown) => { document.activeElement = element; };
  const noSideEffects = () => {
    assert.equal(requests.length, 0, 'URL reconciliation must not make another router request.');
    assert.equal(timers.length, 0, 'URL reconciliation must not queue a search.');
    assert.equal(programmaticFocuses, 0, 'URL reconciliation must not move focus.');
  };
  return { query, view, order, document, focus, render, noSideEffects };
}

test('an opt-in live search clears a dirty no-results query after focus moves to Clear search', () => {
  const initial = { q: 'Market', view: 'upcoming', order: 'asc' };
  const h = formHarness(initial);
  h.render();
  h.focus(h.query);
  h.query.value = 'No matching Agency';
  h.render({ ...initial, q: 'No matching Agency' });
  const clearLink = { name: 'Clear search' };
  h.focus(clearLink);
  h.render({ ...initial, q: '' });
  assert.equal(h.query.value, '');
  assert.equal(h.document.activeElement, clearLink);
  h.noSideEffects();
});

test('a late URL search result preserves newer text being typed in the focused search field', () => {
  const initial = { q: 'Market', view: 'upcoming', order: 'asc' };
  const h = formHarness(initial);
  h.render();
  h.focus(h.query);
  h.query.value = 'Market North';
  h.render({ ...initial, q: 'Market N' });
  assert.equal(h.query.value, 'Market North');
  assert.equal(h.document.activeElement, h.query);
  // The following response is still older than the user's latest keystrokes.
  h.query.value = 'Market Northwest';
  h.render({ ...initial, q: 'Market North' });
  assert.equal(h.query.value, 'Market Northwest');
  assert.equal(h.document.activeElement, h.query);
  h.noSideEffects();
});

test('Back or a view change updates pristine query and order fields without disturbing focus', () => {
  const h = formHarness({ q: 'Market', view: 'upcoming', order: 'asc' });
  h.render();
  h.focus(h.query);
  h.render({ q: 'Older search', view: 'history', order: 'desc' });
  assert.equal(h.query.value, 'Older search');
  assert.equal(h.view.value, 'history');
  assert.equal(h.order.value, 'desc');
  assert.equal(h.document.activeElement, h.query);
  h.focus(h.order);
  h.render({ q: 'Older search', view: 'upcoming', order: 'asc' });
  assert.equal(h.view.value, 'upcoming');
  assert.equal(h.order.value, 'asc');
  assert.equal(h.document.activeElement, h.order);
  h.noSideEffects();
});

test('forms that do not opt into URL values retain their existing uncontrolled fields', () => {
  const h = formHarness();
  h.render();
  h.query.value = 'Unsaved typing';
  h.order.value = 'desc';
  h.focus(h.query);
  h.render();
  assert.equal(h.query.value, 'Unsaved typing');
  assert.equal(h.order.value, 'desc');
  assert.equal(h.view.value, 'upcoming');
  assert.equal(h.document.activeElement, h.query);
  h.noSideEffects();
});
