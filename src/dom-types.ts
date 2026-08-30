/**
 * Structural types for the <forcecal-main> custom element shipped by
 * @forcecalendar/interface. Kept in sync with the element's public API
 * (methods, `events` accessor and the `calendar-*` DOM events) so that the
 * adapter and its consumers can talk to the element without `any`.
 *
 * Note: @forcecalendar/interface does not declare these itself yet; once it
 * does, this file becomes a re-export.
 */

export type CalendarView = 'month' | 'week' | 'day';

/** Minimal shape of an event held by the calendar. */
export interface CalendarEvent {
  id: string;
  title?: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  backgroundColor?: string;
  textColor?: string;
  description?: string;
  location?: string;
  recurrenceRule?: string;
  [key: string]: unknown;
}

export interface EventsSetOptions {
  /** Remove stored events that are absent from the snapshot (default true). */
  removeMissing?: boolean;
}

/** Change set reported by `setEvents()` and the `calendar-events-set` event. */
export interface EventsSetResult {
  /** All events after the snapshot was applied. */
  events: CalendarEvent[];
  added: CalendarEvent[];
  updated: Array<{ event: CalendarEvent; oldEvent: CalendarEvent }>;
  removed: CalendarEvent[];
  unchanged: CalendarEvent[];
}

/** Window of dates the current view covers; `end` is inclusive. */
export interface VisibleRange {
  start: Date;
  end: Date;
}

/** `e.detail` of every DOM event dispatched by <forcecal-main>. */
export interface ForceCalendarEventMap {
  'calendar-navigate': { action: 'next' | 'previous' | 'today' | 'goto'; date: Date };
  'calendar-view-change': { view: CalendarView };
  'calendar-date-select': { date: Date };
  'calendar-event-add': { event: CalendarEvent };
  'calendar-event-added': { event: CalendarEvent };
  'calendar-event-update': { event: CalendarEvent };
  'calendar-event-updated': { event: CalendarEvent };
  'calendar-event-remove': { eventId: string };
  'calendar-event-deleted': { eventId: string };
  'calendar-events-set': EventsSetResult;
  'calendar-range-change': VisibleRange & { view: CalendarView; date: Date };
  'calendar-range-select': { start: Date; end: Date };
}

export interface ForceCalendarElement extends HTMLElement {
  /** Declarative form of `setEvents()` (reconciles with `removeMissing: true`). */
  events: CalendarEvent[];
  setEvents(events: Iterable<CalendarEvent>, options?: EventsSetOptions): EventsSetResult | null;
  /** `null` before the element is initialised. */
  getVisibleRange(): VisibleRange | null;
  getEvents(): CalendarEvent[];
  addEvent(event: Partial<CalendarEvent>): CalendarEvent | null;
  updateEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null;
  deleteEvent(id: string): boolean;
  setView(view: CalendarView): void;
  setDate(date: Date | string): void;
  next(): void;
  previous(): void;
  today(): void;
  addEventListener<K extends keyof ForceCalendarEventMap>(
    type: K,
    listener: (ev: CustomEvent<ForceCalendarEventMap[K]>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof ForceCalendarEventMap>(
    type: K,
    listener: (ev: CustomEvent<ForceCalendarEventMap[K]>) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'forcecal-main': ForceCalendarElement;
  }
}
