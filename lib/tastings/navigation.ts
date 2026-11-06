export type TastingPageState = {
  view: 'upcoming' | 'calendar' | 'history'; q?: string; order?: 'asc' | 'desc';
  month?: string; period?: 'month' | 'week'; date?: string; page?: number;
};

/** Carry the user's scope across views, calendar navigation and record round trips. */
export function tastingPageHref(state: TastingPageState, changes: Partial<TastingPageState> = {}) {
  const next = { ...state, ...changes };
  if ('view' in changes || 'q' in changes || 'order' in changes) next.page = changes.page ?? 0;
  const params = new URLSearchParams({ view: next.view });
  for (const key of ['q', 'order', 'month', 'period', 'date'] as const) {
    if (next[key]) params.set(key, next[key]);
  }
  if (next.page && next.page > 0) params.set('page', String(next.page));
  return `/tastings?${params}`;
}
