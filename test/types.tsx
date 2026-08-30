/**
 * Compile-time assertions, type-checked by `tsc -p tsconfig.test.json` and
 * never emitted or executed. Each `@ts-expect-error` fails the build if the
 * line below it stops being an error.
 */
import { createRef, useRef } from 'react';
import {
  ForceCalendar,
  type CalendarEvent,
  type DateSelectDetail,
  type ForceCalendarElement,
  type ForceCalendarHandle,
  type RangeChangeDetail,
} from '../src/index';

export function Accepted() {
  const handle = useRef<ForceCalendarHandle>(null);
  const events: CalendarEvent[] = [{ id: '1', title: 'Standup', start: '2026-01-05T09:00:00Z' }];
  return (
    <ForceCalendar
      ref={handle}
      view="month"
      date={new Date()}
      weekStartsOn={1}
      theme="slds"
      id="cal"
      role="application"
      aria-label="Team calendar"
      data-testid="calendar"
      tabIndex={0}
      className="cal"
      style={{ height: 600 }}
      events={events}
      removeMissingEvents={false}
      onDateSelect={(detail: DateSelectDetail) => detail.date.getTime()}
      onRangeChange={(detail: RangeChangeDetail) => detail.start.getTime() + detail.end.getTime()}
      onEventsSet={detail => detail.added.length}
      onEventDeleted={detail => detail.eventId.toUpperCase()}
      onClick={e => e.currentTarget.tagName}
    />
  );
}

export function IntrinsicAccepted() {
  const el = createRef<ForceCalendarElement>();
  return <forcecal-main ref={el} view="week" week-starts-on={1} theme="slds" data-x="1" />;
}

export function Rejected() {
  return (
    <>
      {/* @ts-expect-error unknown attribute on the raw element */}
      <forcecal-main bogus="nope" />
      {/* @ts-expect-error view must be a CalendarView */}
      <forcecal-main view={999} />
      {/* @ts-expect-error onDateSelect receives { date: Date }, not a number */}
      <ForceCalendar onDateSelect={(n: number) => n} />
      {/* @ts-expect-error events must be CalendarEvent[] (id is required) */}
      <ForceCalendar events={[{ title: 'no id', start: '2026-01-01' }]} />
      {/* @ts-expect-error weekStartsOn is 0..6 */}
      <ForceCalendar weekStartsOn={7} />
    </>
  );
}

export async function HandleTypes(handle: ForceCalendarHandle) {
  await handle.whenReady();
  const range: { start: Date; end: Date } | null = handle.getVisibleRange();
  const deleted: boolean = handle.deleteEvent('1');
  // @ts-expect-error setView only accepts a CalendarView
  handle.setView('year');
  return [range, deleted];
}
