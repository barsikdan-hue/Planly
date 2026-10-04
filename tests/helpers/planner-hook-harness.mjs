// Runs PlannerApp's own callbacks/effects without a DOM. This is lifecycle logic
// coverage, not a replacement for browser or React-renderer acceptance.
let active;
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
function slot(make) {
  const harness = active;
  const index = harness.cursor++;
  if (!(index in harness.hooks)) harness.hooks[index] = make(harness);
  return harness.hooks[index];
}
export function useState(initial) {
  const state = slot(harness => {
    const item = { value: typeof initial === 'function' ? initial() : initial };
    item.set = update => { item.value = typeof update === 'function' ? update(item.value) : update; harness.changed = true; };
    return item;
  });
  return [state.value, state.set];
}
export function useRef(value) { return slot(() => ({ current: value })); }
function memoValue(callback, deps) {
  const item = slot(() => ({}));
  if (!same(item.deps, deps)) { item.value = callback(); item.deps = deps; }
  return item.value;
}
export function useMemo(callback, deps) { return memoValue(callback, deps); }
export function useCallback(callback, deps) { return memoValue(() => callback, deps); }
export function useEffect(callback, deps) {
  const harness = active;
  const item = slot(() => ({}));
  if (!same(item.deps, deps)) {
    item.deps = deps;
    harness.effects.push(() => { item.cleanup?.(); item.cleanup = callback(); });
  }
}
function find(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.type?.name === name) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, name);
    if (result) return result;
  }
  return null;
}
export function createHarness(Component) {
  const harness = {
    hooks: [], effects: [], cursor: 0, changed: true, tree: null,
    render() {
      active = harness; harness.cursor = 0; harness.changed = false;
      harness.tree = Component(); active = null;
      const effects = harness.effects.splice(0);
      for (const effect of effects) effect();
      return harness.tree;
    },
    async settle() {
      for (let count = 0; count < 8; count++) {
        if (harness.changed) harness.render();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    },
    find(name) { return find(harness.tree, name); },
    composer() { return harness.find('Composer')?.props ?? harness.find('Dashboard')?.props.composer; },
    unmount() { for (const item of harness.hooks) item.cleanup?.(); },
  };
  return harness;
}
