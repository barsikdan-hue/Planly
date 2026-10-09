export async function load(url, context, nextLoad) {
  if (url.endsWith('/lib/server/scheduler/tick.ts')) throw new Error('Scheduling routes must not import the publication tick');
  if (url.endsWith('/lib/server/connectors/registry.ts')) throw new Error('Scheduling routes must not import provider connectors');
  if (url.endsWith('/lib/server/scheduler/reconcile.ts')) return {
    format: 'module', shortCircuit: true,
    source: 'export async function applyPublicationQueueChanges(changes) { globalThis.__schedulingQueueCalls = (globalThis.__schedulingQueueCalls ?? 0) + 1; }',
  };
  return nextLoad(url, context);
}
