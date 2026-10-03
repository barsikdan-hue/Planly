const views = ['dashboard', 'create', 'calendar', 'content', 'media', 'analytics', 'settings'] as const;
export type PlannerView = typeof views[number];

export function normalizePlannerView(view: string): PlannerView | null {
  if (view === 'socials') return 'settings';
  return views.includes(view as PlannerView) ? view as PlannerView : null;
}
