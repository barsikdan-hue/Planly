// Accept PostCSS roots so build and isolated HTTP smoke use the same contract.
// No runtime configuration or source CSS participates in these checks.
export function collectReleaseCssChecks(roots) {
  const checks = {
    controlsLayout: false, buttonSpacing: false, tableSpacing: false,
    schedulingLayout: false, schedulingSettings: false, schedulingDiscovery: false,
    schedulingReview: false, schedulingText: false, schedulingImage: false,
    schedulingVideo: false, schedulingButtons: false, schedulingMobileHeading: false,
    schedulingMobileSettings: false,
  };
  for (const root of roots) root.walkRules(rule => {
    const selectors = rule.selector.split(',').map(s => s.trim().replace(/\s+/g, ' ').replace(/\s*>\s*/g, '>'));
    const has = (prop, value) => rule.nodes.some(d => d.type === 'decl' && d.prop === prop && d.value === value);
    const spaced = prop => rule.nodes.some(d => d.type === 'decl' && d.prop === prop && /[1-9]/.test(d.value));
    if (selectors.includes('.analytics-controls') && rule.nodes.some(d => d.type === 'decl' && d.prop === 'display' && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(d.value))) checks.controlsLayout = true;
    if (selectors.includes('.analytics-controls button') && spaced('padding')) checks.buttonSpacing = true;
    if (selectors.includes('.analytics-results td') && spaced('padding')) checks.tableSpacing = true;
    const media = [];
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') media.push(parent.params.replace(/\s/g, ''));
    if (!media.length) {
      if (selectors.includes('.scheduling-plan') && has('display', 'grid') && spaced('gap')) checks.schedulingLayout = true;
      for (const [selector, key] of [['.scheduling-settings', 'schedulingSettings'], ['.scheduling-discovery', 'schedulingDiscovery']]) {
        if (selectors.includes(selector) && has('display', 'flex') && has('flex-wrap', 'wrap') && spaced('gap')) checks[key] = true;
      }
      if (selectors.includes('.scheduling-review') && has('display', 'grid') && spaced('gap')) checks.schedulingReview = true;
      if (selectors.includes('.scheduling-full-text') && has('white-space', 'pre-wrap') && has('overflow-wrap', 'anywhere')) checks.schedulingText = true;
      for (const [selector, key] of [['.scheduling-media img', 'schedulingImage'], ['.scheduling-media video', 'schedulingVideo']]) {
        if (selectors.includes(selector) && has('width', '100%') && has('object-fit', 'contain')) checks[key] = true;
      }
      if (selectors.includes('.scheduling-selection button') && has('white-space', 'normal') && has('overflow-wrap', 'anywhere')) checks.schedulingButtons = true;
    }
    if (media.length === 1 && ['(max-width:600px)', '(width<=600px)'].includes(media[0])) {
      if (selectors.includes('.scheduling-plan .page-heading') && has('flex-direction', 'column')) checks.schedulingMobileHeading = true;
      if (selectors.includes('.scheduling-settings>label') && has('width', '100%')) checks.schedulingMobileSettings = true;
    }
  });
  return checks;
}
