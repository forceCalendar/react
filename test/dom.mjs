/**
 * Client-side behaviour under jsdom with a stub <forcecal-main> that records
 * every call, so the adapter's wiring is tested independently of the real
 * element (which the adapter still imports; its own `customElements.define`
 * is skipped because the stub is registered first).
 */
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'customElements',
  'CustomEvent',
  'Event',
  'navigator',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  if (!(key in globalThis) || key === 'navigator') {
    try {
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
    } catch {
      /* read-only in this runtime; jsdom's value is not required */
    }
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// react-dom must see the DOM globals when it is first evaluated.
const { createElement, act, createRef } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ForceCalendar } = await import('../dist/index.js');

const MAPPED_EVENTS = [
  ['calendar-event-added', 'onEventAdded'],
  ['calendar-event-updated', 'onEventUpdated'],
  ['calendar-event-deleted', 'onEventDeleted'],
  ['calendar-events-set', 'onEventsSet'],
  ['calendar-date-select', 'onDateSelect'],
  ['calendar-view-change', 'onViewChange'],
  ['calendar-navigate', 'onNavigate'],
  ['calendar-range-change', 'onRangeChange'],
  ['calendar-range-select', 'onRangeSelect'],
];

class StubCalendar extends dom.window.HTMLElement {
  /** When set, the stub announces its range on connect like the real element does on first render. */
  static announceRangeOnConnect = false;

  constructor() {
    super();
    this.calls = [];
    this.listenerCounts = new Map();
    this._events = [];
    this.stateManager = {
      getState: () => ({ view: 'week', currentDate: new Date('2026-03-04T00:00:00Z') }),
    };
  }
  connectedCallback() {
    if (StubCalendar.announceRangeOnConnect) {
      const { view, currentDate } = this.stateManager.getState();
      this.dispatchEvent(
        new dom.window.CustomEvent('calendar-range-change', {
          detail: { ...this.getVisibleRange(), view, date: currentDate, announcedBy: 'element' },
          bubbles: true,
          composed: true,
        })
      );
    }
  }
  addEventListener(type, listener, options) {
    this.listenerCounts.set(type, (this.listenerCounts.get(type) ?? 0) + 1);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listenerCounts.set(type, (this.listenerCounts.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener, options);
  }
  setEvents(events, options) {
    this.calls.push(['setEvents', Array.from(events), options]);
    this._events = Array.from(events);
    return { events: this._events, added: this._events, updated: [], removed: [], unchanged: [] };
  }
  get events() {
    return this._events;
  }
  set events(value) {
    this.calls.push(['events=', value]);
    this._events = Array.from(value ?? []);
  }
  getEvents() {
    this.calls.push(['getEvents']);
    return this._events;
  }
  addEvent(event) {
    this.calls.push(['addEvent', event]);
    return { id: 'generated', ...event };
  }
  updateEvent(id, updates) {
    this.calls.push(['updateEvent', id, updates]);
    return { id, ...updates };
  }
  deleteEvent(id) {
    this.calls.push(['deleteEvent', id]);
    return true;
  }
  getVisibleRange() {
    this.calls.push(['getVisibleRange']);
    return { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-07T23:59:59.999Z') };
  }
  setView(view) {
    this.calls.push(['setView', view]);
  }
  setDate(date) {
    this.calls.push(['setDate', date]);
  }
  next() {
    this.calls.push(['next']);
  }
  previous() {
    this.calls.push(['previous']);
  }
  today() {
    this.calls.push(['today']);
  }
}

before(() => {
  dom.window.customElements.define('forcecal-main', StubCalendar);
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    await act(() => root.unmount());
    container.remove();
  }
});

async function mount(props) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(() => root.render(createElement(ForceCalendar, props)));
  const el = container.querySelector('forcecal-main');
  const update = nextProps => act(() => root.render(createElement(ForceCalendar, nextProps)));
  const unmount = async () => {
    await act(() => root.unmount());
    mounted.splice(mounted.findIndex(m => m.root === root), 1);
    container.remove();
  };
  return { el, root, update, unmount };
}

function dispatch(el, type, detail) {
  act(() => {
    el.dispatchEvent(new dom.window.CustomEvent(type, { detail, bubbles: true, composed: true }));
  });
}

/** Let the adapter's dynamic import and whenDefined() settle. */
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

test('mounts an upgraded stub element with attributes and passthrough props', async () => {
  const { el } = await mount({
    view: 'day',
    theme: 'slds',
    id: 'cal',
    'data-testid': 'calendar',
    className: 'x',
    weekStartsOn: 1,
  });
  assert.ok(el instanceof StubCalendar);
  assert.equal(el.getAttribute('view'), 'day');
  assert.equal(el.getAttribute('theme'), 'slds');
  assert.equal(el.id, 'cal');
  assert.equal(el.getAttribute('data-testid'), 'calendar');
  assert.equal(el.getAttribute('class'), 'x');
  assert.equal(el.getAttribute('week-starts-on'), '1');
  assert.equal(el.hasAttribute('events'), false);
});

test('every mapped calendar-* event invokes its callback with e.detail', async () => {
  const received = {};
  const props = {};
  for (const [, name] of MAPPED_EVENTS) props[name] = detail => (received[name] = detail);
  const { el } = await mount(props);
  for (const [type, name] of MAPPED_EVENTS) {
    const detail = { type, stamp: Math.random() };
    dispatch(el, type, detail);
    assert.equal(received[name], detail, `${type} -> ${name}`);
  }
});

test('legacy -add/-update/-remove aliases are not mapped (no double fire)', async () => {
  let count = 0;
  const { el } = await mount({ onEventAdded: () => count++, onEventUpdated: () => count++, onEventDeleted: () => count++ });
  dispatch(el, 'calendar-event-add', {});
  dispatch(el, 'calendar-event-update', {});
  dispatch(el, 'calendar-event-remove', {});
  assert.equal(count, 0);
  dispatch(el, 'calendar-event-added', {});
  assert.equal(count, 1);
});

test('the latest callback fires after a props update', async () => {
  const seen = [];
  const { el, update } = await mount({ onDateSelect: () => seen.push('first') });
  await update({ onDateSelect: () => seen.push('second') });
  dispatch(el, 'calendar-date-select', { date: new Date() });
  assert.deepEqual(seen, ['second']);
  await update({});
  dispatch(el, 'calendar-date-select', { date: new Date() });
  assert.deepEqual(seen, ['second'], 'a removed callback is no longer invoked');
});

test('removes one listener per mapped event on unmount', async () => {
  const { el, unmount } = await mount({});
  for (const [type] of MAPPED_EVENTS) assert.equal(el.listenerCounts.get(type), 1, `${type} attached`);
  await unmount();
  for (const [type] of MAPPED_EVENTS) assert.equal(el.listenerCounts.get(type), 0, `${type} removed`);
});

test('events prop is applied through setEvents with removeMissing', async () => {
  const snapshot = [{ id: '1', title: 'A', start: '2026-03-02T09:00:00Z' }];
  const { el, update } = await mount({ events: snapshot });
  assert.deepEqual(el.calls.filter(c => c[0] === 'setEvents'), [['setEvents', snapshot, { removeMissing: true }]]);
  assert.equal(el.hasAttribute('events'), false);

  await update({ events: snapshot });
  assert.equal(el.calls.filter(c => c[0] === 'setEvents').length, 1, 'same array identity: not re-applied');

  const next = [...snapshot, { id: '2', title: 'B', start: '2026-03-03T09:00:00Z' }];
  await update({ events: next, removeMissingEvents: false });
  assert.deepEqual(el.calls.filter(c => c[0] === 'setEvents').at(-1), ['setEvents', next, { removeMissing: false }]);
});

test('falls back to the events property before the element is upgraded', async () => {
  const setEvents = StubCalendar.prototype.setEvents;
  StubCalendar.prototype.setEvents = undefined;
  try {
    const snapshot = [{ id: '1', title: 'A', start: '2026-03-02T09:00:00Z' }];
    const { el } = await mount({ events: snapshot });
    assert.deepEqual(el.calls, [['events=', snapshot]]);
    assert.deepEqual(el.events, snapshot);
  } finally {
    StubCalendar.prototype.setEvents = setEvents;
  }
});

test('ref handle proxies element methods and resolves whenReady()', async () => {
  const ref = createRef();
  const { el } = await mount({ ref });
  assert.equal(ref.current.element, el);
  await ref.current.whenReady();

  ref.current.next();
  ref.current.setView('week');
  ref.current.setDate('2026-04-01');
  assert.deepEqual(ref.current.getVisibleRange(), el.getVisibleRange());
  assert.equal(ref.current.deleteEvent('1'), true);
  assert.deepEqual(ref.current.addEvent({ title: 'New', start: '2026-04-01' }), {
    id: 'generated',
    title: 'New',
    start: '2026-04-01',
  });
  const names = el.calls.map(c => c[0]);
  for (const name of ['next', 'setView', 'setDate', 'getVisibleRange', 'deleteEvent', 'addEvent']) {
    assert.ok(names.includes(name), `${name} proxied`);
  }
  assert.deepEqual(el.calls.find(c => c[0] === 'setView'), ['setView', 'week']);
});

test('handle methods warn instead of throwing when the element is unavailable', async () => {
  const ref = createRef();
  const { unmount } = await mount({ ref });
  const handle = ref.current;
  await unmount();
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    assert.equal(handle.element, null);
    assert.equal(handle.getVisibleRange(), null);
    assert.deepEqual(handle.getEvents(), []);
    assert.equal(handle.deleteEvent('1'), false);
    handle.next();
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /getVisibleRange\(\)/);
  assert.match(warnings[0], /1\.6\.0/);
});

test('reports the initial visible range once when the element never announced it', async () => {
  const ranges = [];
  const { el } = await mount({ onRangeChange: detail => ranges.push(detail) });
  await settle();
  assert.equal(ranges.length, 1);
  assert.deepEqual(ranges[0], { ...el.getVisibleRange(), view: 'week', date: new Date('2026-03-04T00:00:00Z') });
});

test('reports the initial visible range once when the element announced it before the listeners existed', async () => {
  // The real element dispatches its first calendar-range-change synchronously
  // while upgrading, i.e. during React's commit and before any effect ran.
  StubCalendar.announceRangeOnConnect = true;
  try {
    const ranges = [];
    const { el } = await mount({ onRangeChange: detail => ranges.push(detail) });
    await settle();
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].announcedBy, undefined, 'the element-fired event was missed, the adapter seeded one');
    assert.deepEqual(ranges[0], { ...el.getVisibleRange(), view: 'week', date: new Date('2026-03-04T00:00:00Z') });
  } finally {
    StubCalendar.announceRangeOnConnect = false;
  }
});

test('does not seed a range when the element announces one while the interface is still loading', async () => {
  // Emulate an element that upgrades after the listeners were attached but
  // before whenDefined() resolves: hold whenDefined() open until the element
  // has dispatched its own calendar-range-change.
  const registry = dom.window.customElements;
  let release;
  const defined = new Promise(resolve => (release = resolve));
  Object.defineProperty(globalThis, 'customElements', {
    value: { get: name => registry.get(name), define: (...a) => registry.define(...a), whenDefined: () => defined },
    configurable: true,
    writable: true,
  });
  try {
    const ranges = [];
    const announced = { start: new Date(0), end: new Date(1), view: 'month', date: new Date(0) };
    const { el } = await mount({ onRangeChange: detail => ranges.push(detail) });
    dispatch(el, 'calendar-range-change', announced);
    release();
    await settle();
    assert.deepEqual(ranges, [announced]);
    assert.equal(el.calls.some(c => c[0] === 'getVisibleRange'), false);
  } finally {
    Object.defineProperty(globalThis, 'customElements', { value: registry, configurable: true, writable: true });
  }
});

test('does not call onRangeChange at all when it is not provided', async () => {
  const { el } = await mount({});
  await settle();
  assert.equal(el.calls.some(c => c[0] === 'getVisibleRange'), false);
});
