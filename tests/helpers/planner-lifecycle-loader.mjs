import { load as loadTsx } from './tsx-loader.mjs';
export { resolve } from './tsx-loader.mjs';
const hooks = new URL('./planner-hook-harness.mjs', import.meta.url).href;
export async function load(url, context, nextLoad) {
  const result = await loadTsx(url, context, nextLoad);
  if (url.endsWith('/components/planner/managed-user-posts.tsx') || url.endsWith('/components/planner/approval-cancellation.tsx') || url.endsWith('/components/planner/admin-entry.tsx') || url.endsWith('/components/planner/shared-library.tsx') || url.endsWith('/components/planner/user-management.tsx') || url.endsWith('/components/planner/settings.tsx') || url.endsWith('/components/planner/app.tsx') || url.endsWith('/components/planner/content-library.tsx') || url.endsWith('/components/planner/swipe-planner.tsx') || url.endsWith('/components/planner/scheduling-plan.tsx')) {
    return { ...result, source: result.source.replace(/from ['"]react['"]/, `from '${hooks}'`) };
  }
  return result;
}
