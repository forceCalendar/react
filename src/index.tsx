/**
 * @forcecalendar/react — thin React adapter for the forceCalendar
 * Web Component. Maps props to attributes and DOM events to callbacks.
 * No dependencies beyond the peer React and forceCalendar packages.
 */
import { useEffect, useRef } from 'react';

export interface CalendarEventDetail {
  [key: string]: unknown;
}

export interface ForceCalendarProps {
  view?: 'month' | 'week' | 'day';
  date?: Date | string;
  locale?: string;
  timezone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  height?: string;
  className?: string;
  style?: React.CSSProperties;
  onEventAdded?: (detail: CalendarEventDetail) => void;
  onEventUpdated?: (detail: CalendarEventDetail) => void;
  onEventDeleted?: (detail: CalendarEventDetail) => void;
  onDateSelect?: (detail: CalendarEventDetail) => void;
  onViewChange?: (detail: CalendarEventDetail) => void;
  onNavigate?: (detail: CalendarEventDetail) => void;
}

const EVENT_MAP: Array<[string, keyof ForceCalendarProps]> = [
  ['calendar-event-added', 'onEventAdded'],
  ['calendar-event-updated', 'onEventUpdated'],
  ['calendar-event-deleted', 'onEventDeleted'],
  ['calendar-date-select', 'onDateSelect'],
  ['calendar-view-change', 'onViewChange'],
  ['calendar-navigate', 'onNavigate'],
];

export function ForceCalendar(props: ForceCalendarProps) {
  const ref = useRef<HTMLElement>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    // Register the custom elements client-side only — safe under SSR
    import('@forcecalendar/interface');
    const el = ref.current;
    if (!el) return;
    const listeners = EVENT_MAP.map(([eventName, propName]) => {
      const listener = (e: Event) => {
        const fn = handlers.current[propName] as
          | ((detail: CalendarEventDetail) => void)
          | undefined;
        fn?.((e as CustomEvent).detail ?? {});
      };
      el.addEventListener(eventName, listener);
      return [eventName, listener] as const;
    });
    return () => {
      for (const [eventName, listener] of listeners) {
        el.removeEventListener(eventName, listener);
      }
    };
  }, []);

  const dateAttr =
    props.date instanceof Date ? props.date.toISOString() : props.date;

  // React 19 passes unknown props on custom elements as attributes
  return (
    // @ts-expect-error custom element is not in JSX.IntrinsicElements
    <forcecal-main
      ref={ref}
      class={props.className}
      style={props.style}
      view={props.view}
      date={dateAttr}
      locale={props.locale}
      timezone={props.timezone}
      week-starts-on={props.weekStartsOn}
      height={props.height}
    />
  );
}

export default ForceCalendar;
