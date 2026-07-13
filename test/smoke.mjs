import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { ForceCalendar } from '../dist/index.js';

const html = renderToString(createElement(ForceCalendar, { view: 'week', height: '500px' }));
if (!html.includes('forcecal-main') || !html.includes('view="week"')) {
  throw new Error('unexpected SSR output: ' + html);
}
console.log('smoke test passed:', html.slice(0, 80));
