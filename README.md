# @forcecalendar/react

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Thin React adapter for [forceCalendar](https://forcecalendar.org) — enterprise calendar Web Components that run under Salesforce Locker Service and strict CSP.

Maps props to the `<forcecal-main>` element's attributes, its DOM events to React callbacks, a declarative `events` prop to the element's `setEvents()` API, and exposes the element's methods through a ref. SSR-safe (custom elements register client-side only), so it works in Next.js out of the box.

## Install

```bash
npm install @forcecalendar/react @forcecalendar/core @forcecalendar/interface
```

Requires `@forcecalendar/interface` 1.6 or later, `@forcecalendar/core` 2.x and React 18 or later.

## Use

```tsx
import { useMemo, useState } from 'react';
import { ForceCalendar, type CalendarEvent } from '@forcecalendar/react';

export default function Scheduling() {
  const [rows, setRows] = useState<CalendarEvent[]>([]);
  // Memoise the snapshot: the calendar re-reconciles whenever the array identity changes
  const events = useMemo(() => rows.map(toCalendarEvent), [rows]);

  return (
    <ForceCalendar
      view="month"
      timezone="America/New_York"
      height="600px"
      theme="slds"
      events={events}
      onRangeChange={({ start, end }) => loadRows(start, end).then(setRows)}
      onDateSelect={({ date }) => console.log('selected', date)}
      onEventAdded={({ event }) => console.log('added', event)}
    />
  );
}
```

## Props

| Prop | Type | Description |
| --- | --- | --- |
| `view` | `'month' \| 'week' \| 'day'` | Initial/controlled view. |
| `date` | `Date \| string` | Date the view is centred on (`Date` is serialised to ISO). |
| `locale` | `string` | BCP 47 locale, e.g. `en-AU`. |
| `timezone` | `string` | IANA time zone. |
| `weekStartsOn` | `0..6` | First day of the week (0 = Sunday). |
| `height` | `string` | CSS height of the calendar. |
| `theme` | `'slds' \| string` | Named theme preset applied as `--fc-*` custom properties. |
| `events` | `CalendarEvent[]` | Complete snapshot of events, applied through `setEvents()` (see below). |
| `removeMissingEvents` | `boolean` (default `true`) | Whether events absent from `events` are removed from the calendar. |
| `className`, `style` | | Applied to the element (`style` as an object; a string would wipe the theme tokens). |
| any other HTML attribute | `id`, `role`, `aria-*`, `data-*`, `tabIndex`, `onClick`, ... | Passed straight through to `<forcecal-main>`. |

### Callbacks

Each callback receives the `detail` of the corresponding `calendar-*` DOM event.

| Callback | DOM event | `detail` |
| --- | --- | --- |
| `onEventAdded` | `calendar-event-added` | `{ event }` |
| `onEventUpdated` | `calendar-event-updated` | `{ event }` |
| `onEventDeleted` | `calendar-event-deleted` | `{ eventId }` |
| `onEventsSet` | `calendar-events-set` | `{ events, added, updated, removed, unchanged }` |
| `onDateSelect` | `calendar-date-select` | `{ date }` |
| `onViewChange` | `calendar-view-change` | `{ view }` |
| `onNavigate` | `calendar-navigate` | `{ action, date }` |
| `onRangeChange` | `calendar-range-change` | `{ start, end, view, date }` |
| `onRangeSelect` | `calendar-range-select` | `{ start, end }` |

`onRangeChange` also reports the initial visible window right after the element is ready, so you can fetch data for it without waiting for the user to navigate. The legacy `calendar-event-add`/`-update`/`-remove` aliases are not mapped; listen to them on the element directly if you need them.

### The `events` prop

`events` is the declarative form of the element's `setEvents()`: pass the complete list and the calendar reconciles it — unchanged events are kept, changed ones replaced, new ones added and (unless `removeMissingEvents={false}`) missing ones removed. The view re-renders at most once and a single `onEventsSet` call describes the change set.

- A snapshot load does **not** emit per-event `onEventAdded` / `onEventDeleted` callbacks, so handlers that persist user edits are not triggered by your own data.
- The snapshot is re-applied whenever the array identity changes. Inline arrays (`events={[...]}`) therefore re-run the reconciliation on every render; it is cheap when nothing changed (everything lands in `unchanged`) but `onEventsSet` still fires, so wrap the array in `useMemo` or keep it in state.
- `events` is never rendered as an attribute: it is applied imperatively after mount, and is buffered by the element if it is still loading.

## Imperative handle

The ref exposes the element and all of its methods. Methods are no-ops that log a warning until the element is mounted and `@forcecalendar/interface` has loaded, so await `whenReady()` first when calling them outside an event handler.

```tsx
import { useEffect, useRef } from 'react';
import { ForceCalendar, type ForceCalendarHandle } from '@forcecalendar/react';

export function Agenda() {
  const calendar = useRef<ForceCalendarHandle>(null);

  useEffect(() => {
    let cancelled = false;
    calendar.current?.whenReady().then(async () => {
      if (cancelled) return;
      const range = calendar.current?.getVisibleRange();
      if (!range) return;
      const rows = await fetchEvents(range.start, range.end);
      calendar.current?.setEvents(rows, { removeMissing: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <button onClick={() => calendar.current?.previous()}>Previous</button>
      <button onClick={() => calendar.current?.today()}>Today</button>
      <button onClick={() => calendar.current?.next()}>Next</button>
      <button onClick={() => calendar.current?.setView('week')}>Week</button>
      <ForceCalendar ref={calendar} height="600px" />
    </>
  );
}
```

| Member | Signature |
| --- | --- |
| `element` | `ForceCalendarElement \| null` — the underlying `<forcecal-main>` |
| `whenReady()` | `Promise<void>` — resolves once the element is defined |
| `addEvent(event)` | `CalendarEvent \| null` |
| `updateEvent(id, updates)` | `CalendarEvent \| null` |
| `deleteEvent(id)` | `boolean` |
| `getEvents()` | `CalendarEvent[]` |
| `setEvents(events, { removeMissing? })` | `EventsSetResult \| null` |
| `getVisibleRange()` | `{ start, end } \| null` (`end` inclusive) |
| `setView(view)`, `setDate(date)`, `next()`, `previous()`, `today()` | `void` |

## Types

The package exports `ForceCalendarProps`, `ForceCalendarHandle`, `CalendarEvent`, `CalendarView`, `VisibleRange`, `EventsSetOptions`, `EventsSetResult`, `ForceCalendarElement`, `ForceCalendarEventMap` and one `*Detail` type per callback. It also declares `forcecal-main` in `JSX.IntrinsicElements`, so the raw element is type-checked in JSX.

The global `HTMLElementTagNameMap` mapping belongs to `@forcecalendar/interface` 1.7 and newer. Import its element type when using the raw DOM API. The adapter keeps its exported structural types, including plain `CalendarEvent` inputs, without redeclaring the global mapping:

```ts
import type { ForceCalendarElement } from '@forcecalendar/interface';

const element: ForceCalendarElement = document.createElement('forcecal-main');
```

With interface 1.6, use the adapter's exported type explicitly for direct DOM access: `document.querySelector<ForceCalendarElement>('forcecal-main')`. The React component and its ref keep the same types across supported interface versions.

Docs: [docs.forcecalendar.org](https://docs.forcecalendar.org) · License: [MIT](LICENSE)

### Read-only calendars

Pass the boolean `readOnly` prop to disable interactive editing (requires
`@forcecalendar/interface >= 1.8.0`). `false` or omission keeps editing enabled.
The adapter maps this to the `readonly` boolean attribute consistently during
server rendering, lazy element registration, and later prop changes.
Programmatic event methods remain available in read-only mode.
