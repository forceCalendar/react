import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement',
  'Element', 'Node', 'Text', 'Comment', 'DocumentFragment', 'Event', 'CustomEvent',
  'customElements', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
const warm = process.argv[2] === 'warm';
const initial = process.argv[3] === 'omitted' ? undefined : process.argv[3] === 'true';
if (warm) await import('@forcecalendar/interface');
const { ForceCalendar } = await import('../../dist/index.js');
assert.equal(Boolean(customElements.get('forcecal-main')), warm);
const host = document.getElementById('host');
function check(el, expected) {
  assert.equal(el.hasAttribute('readonly'), Boolean(expected));
  if (expected) assert.equal(el.getAttribute('readonly'), '');
  // Legacy interfaces predate readOnly but must retain the boolean attribute contract.
  if ('readOnly' in el) assert.equal(el.readOnly, Boolean(expected));
  assert.equal(Object.hasOwn(el, 'readOnly'), false, 'no property shadowing before upgrade');
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, createRef, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const handle = createRef();
const root = createRoot(host);
let el;
try {
  await act(() => {
    flushSync(() => root.render(createElement(ForceCalendar, { ref: handle, readOnly: initial })));
    el = host.querySelector('forcecal-main');
    check(el, initial); // Explicitly before lazy import/upgrade resolves.
  });
  await act(() => handle.current.whenReady());
  check(el, initial);
  for (const value of [true, false, undefined, true, false]) {
    await act(() => root.render(createElement(ForceCalendar, { ref: handle, readOnly: value })));
    check(el, value);
  }
} finally {
  await act(() => root.unmount());
  el?.stateManager?.calendar?.destroy();
  el?.destroy?.();
  dom.window.close();
}
