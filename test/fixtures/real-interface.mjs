/** Isolated browser realm for real interface cold/warm and StrictMode checks. */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const warm = process.argv[2] === 'warm';
const strict = process.argv[3] === 'strict';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
for (const key of [
  'window', 'document', 'HTMLElement', 'Element', 'Node', 'customElements',
  'CustomEvent', 'Event', 'navigator', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement, createRef, act, StrictMode } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ForceCalendar } = await import('../../dist/index.js');
if (warm) await import('@forcecalendar/interface');
assert.equal(Boolean(customElements.get('forcecal-main')), warm);

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
const ref = createRef();
const ranges = [];
let element;
const props = {
  ref,
  view: 'month',
  date: '2026-03-04',
  events: [{ id: 'plain', title: 'Snapshot', start: '2026-03-04T12:00:00Z' }],
  onRangeChange: detail => ranges.push(detail),
};
const render = nextProps => {
  const calendar = createElement(ForceCalendar, nextProps);
  return strict ? createElement(StrictMode, null, calendar) : calendar;
};

try {
  await act(() => root.render(render(props)));
  await act(() => ref.current.whenReady());
  // All announcement/fallback timers are queued by readiness. Drain two task
  // turns rather than sleeping for a timing-dependent arbitrary interval.
  for (let i = 0; i < 2; i++) {
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  }
  element = ref.current.element;
  assert.ok(element instanceof customElements.get('forcecal-main'));
  assert.equal(ranges.length, 1, 'one initial callback with the real interface');
  assert.deepEqual(
    { start: ranges[0].start, end: ranges[0].end },
    ref.current.getVisibleRange()
  );
  assert.equal(ranges[0].view, 'month');
  assert.ok(ranges[0].date instanceof Date);
  assert.deepEqual(ref.current.getEvents().map(event => event.id), ['plain']);

  const first = ranges[0];
  await act(() => ref.current.next());
  assert.equal(ranges.length, 2, 'navigation callback is preserved');
  assert.notEqual(ranges[1].start.getTime(), first.start.getTime());
  await act(() => ref.current.previous());
  assert.equal(ranges.length, 3, 'returning to the initial range is not suppressed');
  assert.equal(ranges[2].start.getTime(), first.start.getTime());
  await act(() => ref.current.setView('week'));
  assert.equal(ranges.length, 4, 'view changes are preserved');
  assert.equal(ranges[3].view, 'week');

  await act(() => root.unmount());
  assert.equal(ref.current, null);
  element.dispatchEvent(new CustomEvent('calendar-range-change', { detail: first }));
  assert.equal(ranges.length, 4, 'listeners are detached on unmount');
} finally {
  if (ref.current) await act(() => root.unmount());
  // Detach intentionally preserves interface state for reattachment. Tests
  // own the element and explicitly release its background calendar resources.
  element?.destroy();
  container.remove();
  dom.window.close();
}
