import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
let app = readFileSync(appPath, 'utf8');

const marker = '/* TEST_NEWS_NOTIFICATION_ROUTE_V1 */';
if (!app.includes(marker)) {
  app += `\n\n${marker}\nconst __previousHandlePushRoute = window.__handlePushRoute;\nwindow.__handlePushRoute = route => {\n  const kind = String(route?.kind || '');\n  if (kind === 'news_breaking' || kind === 'news_digest') {\n    switchView('markets');\n    return true;\n  }\n  return __previousHandlePushRoute?.(route);\n};\n`;
}

writeFileSync(appPath, app);
console.log('Applied test-only news notification route to Haberler.');
