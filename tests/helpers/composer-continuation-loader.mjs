import { load as loadTsx } from './tsx-loader.mjs';
export { resolve } from './tsx-loader.mjs';
const hooks = new URL('./planner-hook-harness.mjs', import.meta.url).href;
export async function load(url, context, nextLoad) {
  const result = await loadTsx(url, context, nextLoad);
  if (/\/components\/planner\/(app|composer)\.tsx$/.test(url)) {
    return { ...result, source: result.source.replace(/from ['"]react['"]/, `from '${hooks}'`) };
  }
  return result;
}
