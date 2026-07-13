# @forcecalendar/react

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Thin React adapter for [forceCalendar](https://forcecalendar.org) — enterprise calendar Web Components that run under Salesforce Locker Service and strict CSP.

Maps props to the `<forcecal-main>` element's attributes and its DOM events to React callbacks. SSR-safe (custom elements register client-side only), so it works in Next.js out of the box.

## Install

```bash
npm install @forcecalendar/react @forcecalendar/core @forcecalendar/interface
```

## Use

```tsx
import { ForceCalendar } from '@forcecalendar/react';

export default function Scheduling() {
  return (
    <ForceCalendar
      view="month"
      timezone="America/New_York"
      height="600px"
      onDateSelect={({ date }) => console.log('selected', date)}
      onEventAdded={detail => console.log('added', detail)}
    />
  );
}
```

Props: `view`, `date`, `locale`, `timezone`, `weekStartsOn`, `height`, `className`, `style`, plus callbacks `onEventAdded`, `onEventUpdated`, `onEventDeleted`, `onDateSelect`, `onViewChange`, `onNavigate`.

Docs: [docs.forcecalendar.org](https://docs.forcecalendar.org) · License: [MIT](LICENSE)
