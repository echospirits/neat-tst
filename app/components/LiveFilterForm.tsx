'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useRef, useTransition } from 'react';

type LiveFilterFormProps = {
  action?: string;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
  label?: string;
  role?: 'search';
  urlValues?: Record<string, string>;
};

const shouldDebounce = (target: EventTarget | null) =>
  target instanceof HTMLInputElement && ['search', 'text'].includes(target.type);

export function LiveFilterForm({ action, children, className, debounceMs = 250, label, role, urlValues }: LiveFilterFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousUrlValues = useRef<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  // Opt-in URL reconciliation for clear/back/view navigation without resetting active typing.
  useEffect(() => {
    if (!urlValues || !formRef.current) return;
    for (const [name, value] of Object.entries(urlValues)) {
      if (previousUrlValues.current[name] === value) continue;
      const field = formRef.current.elements.namedItem(name);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      const editingNewerText = field instanceof HTMLInputElement && ['text', 'search'].includes(field.type)
        && document.activeElement === field && field.value !== previousUrlValues.current[name];
      if (!editingNewerText) field.value = value;
    }
    previousUrlValues.current = { ...urlValues };
  }, [urlValues]);

  const syncFilters = (form: HTMLFormElement) => {
    const destinationPathname = action ?? pathname;
    const params = destinationPathname === pathname
      ? new URLSearchParams(searchParams.toString())
      : new URLSearchParams();
    const fieldNames = Array.from(form.elements)
      .map((element) => (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.name : ''))
      .filter(Boolean);

    fieldNames.forEach((name) => params.delete(name));

    for (const [name, value] of new FormData(form).entries()) {
      const normalizedValue = String(value ?? '').trim();

      if (normalizedValue) {
        params.append(name, normalizedValue);
      }
    }

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${destinationPathname}?${query}` : destinationPathname, { scroll: false });
    });
  };

  const scheduleSync = (form: HTMLFormElement, immediate: boolean) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    if (immediate) {
      syncFilters(form);
      return;
    }

    timeoutRef.current = window.setTimeout(() => syncFilters(form), debounceMs);
  };

  const handleInput = (event: FormEvent<HTMLFormElement>) => {
    scheduleSync(event.currentTarget, !shouldDebounce(event.target));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    scheduleSync(event.currentTarget, true);
  };

  return (
    <form
      ref={formRef}
      action={action}
      aria-label={label}
      aria-busy={isPending}
      className={[className, isPending ? 'is-filtering' : null].filter(Boolean).join(' ')}
      method="get"
      onChange={handleInput}
      onInput={handleInput}
      onSubmit={handleSubmit}
      role={role}
    >
      {children}
      <span aria-live="polite" className="live-filter-status">
        {isPending ? 'Updating results...' : 'Results update as you type'}
      </span>
    </form>
  );
}
