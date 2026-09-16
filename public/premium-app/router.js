export const ROUTES = Object.freeze({
  home: { id:'home', title:'Premium', nav:'home' },
  analytics: { id:'analytics', title:'Portföy Analizi', nav:'analytics' },
  alerts: { id:'alerts', title:'Akıllı Alarmlar', nav:'alerts' },
  'alert-editor': { id:'alert-editor', title:'Alarm Oluştur', nav:'alerts', parent:'alerts' },
  ipo: { id:'ipo', title:'Halka Arz Pro', nav:'ipo' },
  'ipo-detail': { id:'ipo-detail', title:'Halka Arz Detayı', nav:'ipo', parent:'ipo' },
  menu: { id:'menu', title:'Menü', nav:'menu' },
  watchlist: { id:'watchlist', title:'Takip Listesi', nav:'menu', parent:'menu' },
  calendar: { id:'calendar', title:'Premium Takvim', nav:'menu', parent:'menu' },
  backup: { id:'backup', title:'Yedekleme & Aktarım', nav:'menu', parent:'menu' },
  membership: { id:'membership', title:'Premium Üyelik', nav:'menu', parent:'menu' },
});

export const BOTTOM_NAV = Object.freeze([
  { id:'home', label:'Ana Sayfa', icon:'⌂' },
  { id:'analytics', label:'Analiz', icon:'▥' },
  { id:'alerts', label:'Alarmlar', icon:'◉' },
  { id:'ipo', label:'Pro', icon:'◆' },
  { id:'menu', label:'Menü', icon:'≡' },
]);

export function normalizeRoute(route) {
  const id = String(route || '').trim().toLowerCase();
  return ROUTES[id] ? id : 'home';
}

export function routeMeta(route) {
  return ROUTES[normalizeRoute(route)];
}

export function routeBackTarget(route) {
  const current = routeMeta(route);
  if (current.parent) return current.parent;
  if (current.id !== 'home') return 'home';
  return null;
}
