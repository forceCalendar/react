/**
 * @forcecalendar/react — thin React adapter for the forceCalendar
 * Web Component.
 *
 * Props become attributes on <forcecal-main>, its `calendar-*` DOM events
 * become callbacks, the `events` prop is applied through the element's
 * `setEvents()` API and a ref exposes the element's methods. The custom
 * element is registered client-side only, so the component renders under SSR.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import type {
  CalendarEvent,
  CalendarView,
  EventsSetOptions,
  EventsSetResult,
  ForceCalendarElement,
  ForceCalendarEventMap,
  VisibleRange,
} from './dom-types.js';

export type {
  CalendarEvent,
  CalendarView,
  EventsSetOptions,
  EventsSetResult,
  ForceCalendarElement,
  ForceCalendarEventMap,
  VisibleRange,
} from './dom-types.js';

const TAG = 'forcecal-main';
const MIN_INTERFACE_VERSION = '1.6.0';
const LOG_PREFIX = '[@forcecalendar/react]';

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'forcecal-main': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          view?: CalendarView;
          date?: string;
          locale?: string;
          timezone?: string;
          'week-starts-on'?: number | string;
          height?: string;
          theme?: string;
          ref?: React.Ref<ForceCalendarElement>;
        };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NavigateDetail = ForceCalendarEventMap['calendar-navigate'];
export type ViewChangeDetail = ForceCalendarEventMap['calendar-view-change'];
export type DateSelectDetail = ForceCalendarEventMap['calendar-date-select'];
export type EventAddedDetail = ForceCalendarEventMap['calendar-event-added'];
export type EventUpdatedDetail = ForceCalendarEventMap['calendar-event-updated'];
export type EventDeletedDetail = ForceCalendarEventMap['calendar-event-deleted'];
export type EventsSetDetail = ForceCalendarEventMap['calendar-events-set'];
export type RangeChangeDetail = ForceCalendarEventMap['calendar-range-change'];
export type RangeSelectDetail = ForceCalendarEventMap['calendar-range-select'];

/** Kept for backwards compatibility with 0.2.x; prefer the specific *Detail types. */
export interface CalendarEventDetail {
  [key: string]: unknown;
}

export interface ForceCalendarCallbacks {
  onEventAdded?: (detail: EventAddedDetail) => void;
  onEventUpdated?: (detail: EventUpdatedDetail) => void;
  onEventDeleted?: (detail: EventDeletedDetail) => void;
  onEventsSet?: (detail: EventsSetDetail) => void;
  onDateSelect?: (detail: DateSelectDetail) => void;
  onViewChange?: (detail: ViewChangeDetail) => void;
  onNavigate?: (detail: NavigateDetail) => void;
  onRangeChange?: (detail: RangeChangeDetail) => void;
  onRangeSelect?: (detail: RangeSelectDetail) => void;
}

/**
 * Any other HTML attribute (id, role, aria-*, data-*, tabIndex, onClick, ...)
 * is passed straight through to the element.
 */
export interface ForceCalendarProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onSelect' | 'style' | 'className'>,
    ForceCalendarCallbacks {
  view?: CalendarView;
  date?: Date | string;
  locale?: string;
  timezone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  height?: string;
  /** Named theme preset (`"slds"`) or any theme name the element supports. */
  theme?: 'slds' | (string & {});
  className?: string;
  style?: CSSProperties;
  /**
   * Complete snapshot of the calendar's events. Applied through
   * `setEvents()` whenever the array identity changes, so memoise inline
   * arrays. Omit it to manage events imperatively through the ref.
   */
  events?: CalendarEvent[];
  /** Remove stored events that are absent from `events` (default true). */
  removeMissingEvents?: boolean;
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined;
}

/** Imperative API exposed through the component's ref. */
export interface ForceCalendarHandle {
  /** The underlying <forcecal-main> element (null before mount / after unmount). */
  readonly element: ForceCalendarElement | null;
  /** Resolves once @forcecalendar/interface has loaded and defined the element. */
  whenReady(): Promise<void>;
  addEvent(event: Partial<CalendarEvent>): CalendarEvent | null;
  updateEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null;
  deleteEvent(id: string): boolean;
  getEvents(): CalendarEvent[];
  setEvents(events: Iterable<CalendarEvent>, options?: EventsSetOptions): EventsSetResult | null;
  getVisibleRange(): VisibleRange | null;
  setView(view: CalendarView): void;
  setDate(date: Date | string): void;
  next(): void;
  previous(): void;
  today(): void;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type CallbackName = keyof ForceCalendarCallbacks;

/**
 * DOM event → callback. The element also dispatches the legacy
 * `calendar-event-add/-update/-remove` aliases alongside the `-added/-updated/
 * -deleted` events; only the latter are mapped so callbacks fire once.
 */
const EVENT_MAP: ReadonlyArray<readonly [keyof ForceCalendarEventMap, CallbackName]> = [
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

let interfaceLoad: Promise<unknown> | undefined;

/** Load @forcecalendar/interface once per page; a failed load is retried next time. */
function loadInterface(): Promise<unknown> {
  if (!interfaceLoad) {
    interfaceLoad = import('@forcecalendar/interface').catch((error: unknown) => {
      interfaceLoad = undefined;
      throw error;
    });
  }
  return interfaceLoad;
}

/** Resolves once the element is registered (never resolves without a DOM). */
function whenDefined(): Promise<void> {
  if (typeof customElements === 'undefined') return new Promise(() => {});
  return loadInterface().then(() => customElements.whenDefined(TAG).then(() => undefined));
}

function reportLoadFailure(error: unknown): void {
  console.error(
    `${LOG_PREFIX} failed to load @forcecalendar/interface; the calendar will not render.`,
    error
  );
}

/**
 * Hand a snapshot to the element. Before the element is upgraded (the
 * interface is still loading) `setEvents` does not exist yet; assigning the
 * `events` property instead leaves a value the element picks up on
 * initialisation (interface >= 1.6.0).
 */
function applyEvents(el: ForceCalendarElement, events: CalendarEvent[], removeMissing: boolean): void {
  if (typeof el.setEvents === 'function') {
    el.setEvents(events, { removeMissing });
  } else {
    el.events = events;
  }
}

/** Current view/date as the element reports them, for the initial range callback. */
function readViewState(el: ForceCalendarElement, range: VisibleRange): { view: CalendarView; date: Date } {
  const state = (el as { stateManager?: { getState?: () => { view?: CalendarView; currentDate?: Date } } })
    .stateManager?.getState?.();
  const view = state?.view ?? ((el.getAttribute('view') as CalendarView | null) || 'month');
  const date = state?.currentDate instanceof Date ? state.currentDate : range.start;
  return { view, date };
}

type MethodName = Exclude<keyof ForceCalendarHandle, 'element' | 'whenReady'>;

function warnUnavailable(method: MethodName): void {
  console.warn(
    `${LOG_PREFIX} ${method}() is unavailable: the <${TAG}> element is not mounted or not yet ` +
      `upgraded (await whenReady()), or @forcecalendar/interface is older than ` +
      `${MIN_INTERFACE_VERSION}.`
  );
}

/** Build the ref handle; every method is guarded so a missing element or old interface warns instead of throwing. */
function createHandle(getElement: () => ForceCalendarElement | null): ForceCalendarHandle {
  function call<M extends MethodName>(
    method: M,
    args: Parameters<ForceCalendarElement[M]>,
    fallback: ReturnType<ForceCalendarElement[M]>
  ): ReturnType<ForceCalendarElement[M]> {
    const el = getElement();
    const fn = el?.[method] as ((...a: unknown[]) => ReturnType<ForceCalendarElement[M]>) | undefined;
    if (!el || typeof fn !== 'function') {
      warnUnavailable(method);
      return fallback;
    }
    return fn.apply(el, args);
  }

  return {
    get element() {
      return getElement();
    },
    whenReady: () => whenDefined(),
    addEvent: event => call('addEvent', [event], null),
    updateEvent: (id, updates) => call('updateEvent', [id, updates], null),
    deleteEvent: id => call('deleteEvent', [id], false),
    getEvents: () => call('getEvents', [], []),
    setEvents: (events, options) => call('setEvents', [events, options], null),
    getVisibleRange: () => call('getVisibleRange', [], null),
    setView: view => call('setView', [view], undefined),
    setDate: date => call('setDate', [date], undefined),
    next: () => call('next', [], undefined),
    previous: () => call('previous', [], undefined),
    today: () => call('today', [], undefined),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ForceCalendar = forwardRef<ForceCalendarHandle, ForceCalendarProps>(function ForceCalendar(
  props,
  ref
) {
  const {
    view,
    date,
    locale,
    timezone,
    weekStartsOn,
    height,
    theme,
    className,
    style,
    events,
    removeMissingEvents = true,
    onEventAdded,
    onEventUpdated,
    onEventDeleted,
    onEventsSet,
    onDateSelect,
    onViewChange,
    onNavigate,
    onRangeChange,
    onRangeSelect,
    ...rest
  } = props;

  const elementRef = useRef<ForceCalendarElement>(null);

  // Listeners read the latest callbacks through this ref, so they are
  // attached once. It is updated in an effect (never during render).
  const callbacks = useRef<ForceCalendarCallbacks>({});
  useEffect(() => {
    callbacks.current = {
      onEventAdded,
      onEventUpdated,
      onEventDeleted,
      onEventsSet,
      onDateSelect,
      onViewChange,
      onNavigate,
      onRangeChange,
      onRangeSelect,
    };
  });

  useImperativeHandle(ref, () => createHandle(() => elementRef.current), []);

  // Wire DOM events, then register the element (client-side only).
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    let rangeChangeSeen = false;
    let cancelled = false;
    let initialRangeTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelInitialRange = () => {
      if (initialRangeTimer !== undefined) {
        clearTimeout(initialRangeTimer);
        initialRangeTimer = undefined;
      }
    };

    // Attach synchronously, before the import: an element that upgrades while
    // the interface is loading dispatches its first events right away.
    const listeners = EVENT_MAP.map(([eventName, callbackName]) => {
      const listener = (e: Event) => {
        if (eventName === 'calendar-range-change') {
          rangeChangeSeen = true;
          cancelInitialRange();
        }
        const callback = callbacks.current[callbackName] as ((detail: unknown) => void) | undefined;
        callback?.((e as CustomEvent).detail ?? {});
      };
      el.addEventListener(eventName, listener);
      return [eventName, listener] as const;
    });

    whenDefined().then(
      () => {
        if (cancelled || rangeChangeSeen) return;
        // Interface 1.7 defers its initial announcement until the next task.
        // Give that event priority before seeding a range for older interfaces,
        // or for an announcement that happened before our listeners attached.
        initialRangeTimer = setTimeout(() => {
          initialRangeTimer = undefined;
          const onRangeChange = callbacks.current.onRangeChange;
          if (cancelled || rangeChangeSeen || !onRangeChange) return;
          const range = typeof el.getVisibleRange === 'function' ? el.getVisibleRange() : null;
          if (!range) return;
          rangeChangeSeen = true;
          onRangeChange({ ...range, ...readViewState(el, range) });
        }, 0);
      },
      error => {
        if (!cancelled) reportLoadFailure(error);
      }
    );

    return () => {
      cancelled = true;
      cancelInitialRange();
      for (const [eventName, listener] of listeners) {
        el.removeEventListener(eventName, listener);
      }
    };
  }, []);

  // Declarative events: never rendered as a JSX attribute (React would
  // stringify the array before the element is upgraded); applied imperatively.
  useEffect(() => {
    const el = elementRef.current;
    if (!el || events === undefined) return;
    applyEvents(el, events, removeMissingEvents);
  }, [events, removeMissingEvents]);

  const dateAttr = date instanceof Date ? date.toISOString() : date;

  return (
    <forcecal-main
      {...rest}
      ref={elementRef}
      className={className}
      style={style}
      view={view}
      date={dateAttr}
      locale={locale}
      timezone={timezone}
      week-starts-on={weekStartsOn}
      height={height}
      theme={theme}
    />
  );
});

export default ForceCalendar;
