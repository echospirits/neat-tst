'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Secondary links share native disclosure semantics and predictable overlay dismissal. */
export function TastingMenu({ children, label, accessibleLabel, kind = 'row' }: { children: ReactNode; label: string; accessibleLabel: string; kind?: 'row' | 'manage' }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [opensAbove, setOpensAbove] = useState(false);
  const close = () => { if (details.current) details.current.open = false; };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!details.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const className = kind === 'manage' ? 'tasting-manage' : 'tasting-row-menu';
  return <details ref={details} className={className} data-opens-above={opensAbove} onToggle={event => {
    const element = event.currentTarget;
    if (element.open && kind === 'row') {
      const box = element.getBoundingClientRect();
      const panelHeight = element.querySelector(`.${className}-panel`)?.getBoundingClientRect().height ?? 0;
      const tabbar = document.querySelector('.mobile-tabbar')?.getBoundingClientRect();
      const viewportBottom = Math.min(window.innerHeight, (window.visualViewport?.height ?? window.innerHeight) + (window.visualViewport?.offsetTop ?? 0));
      const usableBottom = tabbar?.height ? Math.min(viewportBottom, tabbar.top) : viewportBottom;
      setOpensAbove(box.bottom + panelHeight + 8 > usableBottom && box.top > panelHeight + 8);
    }
    setOpen(element.open);
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }} onKeyDown={event => {
    if (event.key !== 'Escape' || !details.current?.open) return;
    event.preventDefault(); close(); details.current.querySelector('summary')?.focus();
  }}>
    <summary aria-label={accessibleLabel}>{label}</summary>
    <div className={`${className}-panel`}>{children}</div>
  </details>;
}
