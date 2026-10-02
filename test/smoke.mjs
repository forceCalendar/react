import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { ForceCalendar } from '../dist/index.js';

const events = [{ id: '1', title: 'Standup', start: '2026-01-05T09:00:00Z' }];

test('renders <forcecal-main> with mapped attributes under SSR', () => {
  const html = renderToString(
    createElement(ForceCalendar, {
      view: 'week',
      height: '500px',
      weekStartsOn: 1,
      date: new Date('2026-01-05T00:00:00Z'),
      className: 'cal',
    })
  );
  assert.match(html, /^<forcecal-main /);
  assert.match(html, /view="week"/);
  assert.match(html, /height="500px"/);
  assert.match(html, /week-starts-on="1"/);
  assert.match(html, /date="2026-01-05T00:00:00.000Z"/);
  assert.match(html, /class="cal"/);
});

test('passes theme and unknown attributes through', () => {
  const html = renderToString(
    createElement(ForceCalendar, {
      theme: 'slds',
      id: 'team-calendar',
      'data-testid': 'calendar',
      'aria-label': 'Team calendar',
      role: 'application',
    })
  );
  assert.match(html, /theme="slds"/);
  assert.match(html, /id="team-calendar"/);
  assert.match(html, /data-testid="calendar"/);
  assert.match(html, /aria-label="Team calendar"/);
  assert.match(html, /role="application"/);
});

test('never serialises events or callbacks as attributes', () => {
  const html = renderToString(
    createElement(ForceCalendar, {
      events,
      removeMissingEvents: false,
      onDateSelect: () => {},
      onRangeChange: () => {},
    })
  );
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.doesNotMatch(html, /events=/);
  assert.doesNotMatch(html, /remove-?missing/i);
  assert.doesNotMatch(html, /on[A-Z][a-zA-Z]*=/);
});

test('a forwarded ref does not break server rendering', () => {
  const ref = { current: null };
  const html = renderToString(createElement(ForceCalendar, { ref }));
  assert.match(html, /forcecal-main/);
});

for (const readOnly of [true, false, undefined]) {
  test(`SSR readOnly=${readOnly} uses boolean attribute presence`, async () => {
    const html = renderToString(createElement(ForceCalendar, { readOnly }));
    if (readOnly) assert.match(html, /\sreadonly(?:="")?(?:\s|>)/i);
    else assert.doesNotMatch(html, /\sreadonly(?:=|\s|>)/i);
  });
}
