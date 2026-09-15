from pathlib import Path

index = Path('public/index.html')
html = index.read_text()

anchor = '''      <div class="topbar-actions">\n        <div id="marketStatus"'''
replacement = '''      <div class="topbar-actions">\n        <button id="premiumLauncher" class="premium-launcher-btn" type="button" aria-label="Premium'u keşfet">\n          <span class="premium-launcher-crown">♛</span>\n          <span class="premium-launcher-copy"><small>PREMIUM</small><b>Pro'ya Geç</b></span>\n        </button>\n        <div id="marketStatus"'''
assert html.count(anchor) == 1, 'topbar anchor changed'
html = html.replace(anchor, replacement, 1)

old_tab = '<button id="proTab" class="nav-tab" data-view="pro" type="button"><span>✦</span><b>Gelişmiş</b></button>'
new_tab = '<button id="proTab" class="nav-tab" data-view="pro" type="button" hidden><span>✦</span><b>Gelişmiş</b></button>'
assert html.count(old_tab) == 1, 'pro tab anchor changed'
html = html.replace(old_tab, new_tab, 1)

nav_anchor = '  <nav id="bottomNav" class="bottom-nav" aria-label="Ana menü">'
overlay = '''  <div id="premiumOverlay" class="premium-overlay" hidden aria-hidden="true">\n    <div class="premium-overlay-shell">\n      <header class="premium-overlay-header">\n        <button id="premiumOverlayClose" class="premium-overlay-back" type="button" aria-label="Premium ekranını kapat">←</button>\n        <div class="premium-overlay-brand"><span>HALKA ARZ PORTFÖYÜM</span><strong>Premium</strong></div>\n        <span class="premium-overlay-demo">TÜMÜ AÇIK · DEMO</span>\n      </header>\n      <div id="premiumOverlayContent" class="premium-overlay-content"></div>\n    </div>\n  </div>\n\n'''
assert html.count(nav_anchor) == 1, 'bottom nav anchor changed'
html = html.replace(nav_anchor, overlay + nav_anchor, 1)
index.write_text(html)

app = Path('public/app.js')
text = app.read_text()

old_calendar = "  $$('[data-pro-ticker]', list).forEach(button => button.addEventListener('click', () => switchView('pro', { selectedTicker:button.dataset.proTicker })));"
new_calendar = "  $$('[data-pro-ticker]', list).forEach(button => button.addEventListener('click', () => openPremiumOverlay({ selectedTicker:button.dataset.proTicker })));"
assert text.count(old_calendar) == 1, 'calendar premium link anchor changed'
text = text.replace(old_calendar, new_calendar, 1)

old_back = '''window.__handleAndroidBack = () => {\n  if (!canHandleAppBack(window.history.state)) return false;\n  window.history.back();\n  return true;\n};'''
new_back = '''window.__handleAndroidBack = () => {\n  if (premiumOverlayIsOpen()) { window.history.back(); return true; }\n  if (!canHandleAppBack(window.history.state)) return false;\n  window.history.back();\n  return true;\n};'''
assert text.count(old_back) == 1, 'Android back anchor changed'
text = text.replace(old_back, new_back, 1)

switch_anchor = 'function switchView(view, { push = true, selectedTicker = null } = {}) {'
helpers = '''function premiumOverlayIsOpen() {\n  const overlay = $('#premiumOverlay');\n  return Boolean(overlay && overlay.hidden === false);\n}\n\nfunction premiumOverlayContext(selectedTicker = null) {\n  return {\n    portfolio:state.portfolio,\n    history:Array.isArray(state.portfolio?.history) ? state.portfolio.history : state.chartRows,\n    calendar:state.calendar,\n    ...(selectedTicker ? { selectedTicker } : {}),\n  };\n}\n\nfunction openPremiumOverlay({ selectedTicker = null, push = true } = {}) {\n  const overlay = $('#premiumOverlay');\n  const content = $('#premiumOverlayContent');\n  if (!overlay || !content || !premiumDemo.enabled) return;\n  if (!selectedTicker) premiumDemo.setSection('home');\n  overlay.hidden = false;\n  overlay.setAttribute('aria-hidden', 'false');\n  document.body.classList.add('premium-overlay-open');\n  premiumDemo.render(content, premiumOverlayContext(selectedTicker));\n  requestAnimationFrame(() => overlay.scrollTo?.({ top:0, behavior:'auto' }));\n  if (push && window.history.state?.sheet !== '#premiumOverlay') {\n    window.history.pushState(\n      nextNavigationState(window.history.state, { view:state.view, sheet:'#premiumOverlay', ...(selectedTicker ? { selectedTicker } : {}) }),\n      '',\n      `${location.pathname}${location.search}#premium`,\n    );\n  }\n}\n\nfunction closePremiumOverlay({ useHistory = true } = {}) {\n  const overlay = $('#premiumOverlay');\n  if (!overlay || overlay.hidden) return;\n  if (useHistory && window.history.state?.sheet === '#premiumOverlay') {\n    window.history.back();\n    return;\n  }\n  premiumDemo.destroy();\n  overlay.hidden = true;\n  overlay.setAttribute('aria-hidden', 'true');\n  document.body.classList.remove('premium-overlay-open');\n}\n\n'''
assert text.count(switch_anchor) == 1, 'switchView anchor changed'
text = text.replace(switch_anchor, helpers + switch_anchor, 1)

nav_state_anchor = '''  closingAddSheetHistory = false;\n  switchView(nav?.view || 'portfolio', { push:false, selectedTicker:nav?.selectedTicker || null });\n  if (nav?.sheet === '#addSheet') {'''
nav_state_replacement = '''  closingAddSheetHistory = false;\n  if (nav?.sheet !== '#premiumOverlay') closePremiumOverlay({ useHistory:false });\n  switchView(nav?.view || 'portfolio', { push:false, selectedTicker:nav?.selectedTicker || null });\n  if (nav?.sheet === '#premiumOverlay') {\n    hideSheets();\n    openPremiumOverlay({ push:false, selectedTicker:nav?.selectedTicker || null });\n    return;\n  }\n  if (nav?.sheet === '#addSheet') {'''
assert text.count(nav_state_anchor) == 1, 'navigation state anchor changed'
text = text.replace(nav_state_anchor, nav_state_replacement, 1)

listener_anchor = "[portfolioTab, calendarTab, proTab, settingsTab].filter(Boolean).forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));\n"
listener_replacement = listener_anchor + "$('#premiumLauncher')?.addEventListener('click', () => openPremiumOverlay());\n$('#premiumOverlayClose')?.addEventListener('click', () => closePremiumOverlay());\n"
assert text.count(listener_anchor) == 1, 'navigation listener anchor changed'
text = text.replace(listener_anchor, listener_replacement, 1)
app.write_text(text)

css = Path('public/premium-demo.css')
style = css.read_text()
marker = '/* Premium full-screen experience v2 */'
assert marker not in style, 'Premium overlay styles already applied'
style += '''\n\n/* Premium full-screen experience v2 */
body.premium-overlay-open{overflow:hidden;overscroll-behavior:none}
.premium-launcher-btn{min-height:44px;border:1px solid rgba(187,153,255,.38);border-radius:15px;padding:6px 11px 6px 8px;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(122,71,255,.96),rgba(75,72,216,.94));color:#fff;box-shadow:0 10px 28px rgba(87,57,218,.32),inset 0 1px rgba(255,255,255,.18)}
.premium-launcher-crown{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,214,113,.14);color:#ffd56c;font-size:18px}.premium-launcher-copy{display:grid;text-align:left;line-height:1.05}.premium-launcher-copy small{font-size:7px;letter-spacing:.14em;opacity:.72}.premium-launcher-copy b{font-size:11px;white-space:nowrap}
.premium-overlay{position:fixed;inset:0;z-index:2400;overflow:auto;overscroll-behavior:contain;background:radial-gradient(circle at 88% 5%,rgba(110,65,255,.28),transparent 32%),radial-gradient(circle at 8% 24%,rgba(42,120,255,.16),transparent 31%),#07101e;color:#edf3ff}
.premium-overlay[hidden]{display:none!important}.premium-overlay-shell{width:100%;min-height:100dvh;background:linear-gradient(180deg,rgba(13,20,42,.98),rgba(6,14,28,.995) 45%,#06101d)}
.premium-overlay-header{position:sticky;top:0;z-index:40;min-height:70px;padding:max(10px,env(safe-area-inset-top)) 16px 10px;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:10px;background:linear-gradient(180deg,rgba(8,14,31,.98),rgba(8,14,31,.89));backdrop-filter:blur(22px);border-bottom:1px solid rgba(158,124,255,.16)}
.premium-overlay-back{width:44px;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);color:#f3f5ff;font-size:24px}.premium-overlay-brand{display:grid;gap:1px;min-width:0}.premium-overlay-brand span{font-size:8px;letter-spacing:.17em;font-weight:850;color:#8e9ab0}.premium-overlay-brand strong{font-size:20px;letter-spacing:-.02em;background:linear-gradient(90deg,#f2edff,#aa83ff 56%,#78a7ff);-webkit-background-clip:text;background-clip:text;color:transparent}.premium-overlay-demo{padding:7px 9px;border-radius:999px;border:1px solid rgba(255,211,100,.2);background:rgba(255,205,91,.08);color:#ffd979;font-size:8px;font-weight:900;white-space:nowrap}
.premium-overlay-content{width:min(100%,920px);margin:0 auto;padding:14px 16px calc(110px + env(safe-area-inset-bottom));display:grid;gap:14px}
.premium-overlay .premium-status-card{margin:0;padding:20px;border-radius:26px;gap:14px}.premium-overlay .premium-crown{width:52px;height:52px;border-radius:17px;font-size:24px}.premium-overlay .premium-status-copy strong{font-size:20px}.premium-overlay .premium-status-copy p{font-size:12px;line-height:1.45;margin-top:3px}.premium-overlay .premium-kicker{font-size:10px}.premium-overlay .premium-demo-pill,.premium-overlay .premium-local-pill{font-size:9px;padding:7px 10px}
.premium-overlay .premium-section-tabs{position:sticky;top:70px;z-index:30;margin:0 -4px;padding:10px 4px 11px;background:linear-gradient(180deg,rgba(7,16,30,.97),rgba(7,16,30,.88) 75%,transparent);gap:8px}.premium-overlay .premium-section-tab{min-width:96px;min-height:62px;border-radius:18px}.premium-overlay .premium-section-tab span{font-size:19px}.premium-overlay .premium-section-tab b{font-size:10px}
.premium-overlay .premium-page{gap:16px;margin-top:4px}.premium-overlay .premium-hero-card{padding:25px 22px;border-radius:28px}.premium-overlay .premium-hero-value{font-size:46px;margin:12px 0 10px}.premium-overlay .premium-hero-pills span{font-size:11px;padding:7px 10px}.premium-overlay .premium-hero-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}
.premium-overlay .premium-block{padding:20px;border-radius:25px}.premium-overlay .premium-block-head{margin-bottom:15px}.premium-overlay .premium-block-head h3,.premium-overlay .premium-block h3{font-size:20px}.premium-overlay .premium-block-head>span{font-size:10px}.premium-overlay .premium-readable{font-size:13px;line-height:1.65}
.premium-overlay .premium-metrics-grid,.premium-overlay .premium-chart-summary-grid,.premium-overlay .premium-info-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.premium-overlay .premium-metric{padding:15px;border-radius:18px;min-height:82px;align-content:center}.premium-overlay .premium-metric>span{font-size:10px}.premium-overlay .premium-metric strong{font-size:17px}.premium-overlay .premium-metric small{font-size:9px}
.premium-overlay .premium-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.premium-overlay .premium-quick-grid button{min-height:132px;padding:17px;border-radius:21px}.premium-overlay .premium-quick-grid button>span{width:40px;height:40px;border-radius:13px;font-size:20px}.premium-overlay .premium-quick-grid strong{font-size:14px}.premium-overlay .premium-quick-grid small{font-size:10px;line-height:1.5}
.premium-overlay .premium-insight-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.premium-overlay .premium-insight{padding:15px;border-radius:19px;min-height:92px;align-content:center}.premium-overlay .premium-insight>span{font-size:10px}.premium-overlay .premium-insight strong{font-size:18px}.premium-overlay .premium-insight small{font-size:9px}
.premium-overlay .premium-title-row{padding:22px;border-radius:25px}.premium-overlay .premium-title-row h2{font-size:28px}.premium-overlay .premium-title-row p{font-size:13px;line-height:1.55}
.premium-overlay .premium-contribution-row{grid-template-columns:1fr;gap:12px;padding:15px;border-radius:19px}.premium-overlay .premium-holding-id strong{font-size:14px}.premium-overlay .premium-holding-id span{font-size:10px}.premium-overlay .premium-contribution-body>div:first-child{font-size:10px}.premium-overlay .premium-contribution-body b{font-size:12px}.premium-overlay .premium-contribution-body small{font-size:9px}.premium-overlay .premium-contribution-track{height:7px}
.premium-overlay .premium-two-column{grid-template-columns:1fr;gap:11px}.premium-overlay .premium-two-column>article{padding:20px;border-radius:23px}.premium-overlay .premium-risk-gauge strong{font-size:34px}.premium-overlay .premium-risk-gauge span,.premium-overlay .premium-two-column p{font-size:10px}.premium-overlay .premium-day-pair span,.premium-overlay .premium-day-pair small{font-size:9px}.premium-overlay .premium-day-pair strong{font-size:14px}
.premium-overlay .premium-chart-card{padding:20px;border-radius:27px}.premium-overlay .premium-segmented{gap:7px}.premium-overlay .premium-segmented button{min-height:42px;border-radius:13px;padding:0 13px;font-size:10px}.premium-overlay .premium-chart-tooltip{min-height:50px;padding:10px 12px;font-size:10px}.premium-overlay .premium-chart-tooltip b{font-size:14px}.premium-overlay .premium-chart-canvas-wrap{height:380px}.premium-overlay .premium-chart-foot{font-size:9px}.premium-overlay .premium-split-profit{gap:10px}.premium-overlay .premium-split-profit article{padding:15px}.premium-overlay .premium-split-profit span{font-size:10px}.premium-overlay .premium-split-profit strong{font-size:18px}
.premium-overlay .premium-ranked-row{grid-template-columns:minmax(110px,.9fr) minmax(80px,1.4fr) auto;gap:10px}.premium-overlay .premium-ranked-row>strong,.premium-overlay .premium-allocation-row>span,.premium-overlay .premium-allocation-row>b{font-size:10px}.premium-overlay .premium-allocation-row{grid-template-columns:auto 54px minmax(90px,1fr) 48px}
.premium-overlay .premium-alert-form{grid-template-columns:1fr;gap:11px}.premium-overlay .premium-alert-form label{font-size:11px}.premium-overlay .premium-alert-form select,.premium-overlay .premium-alert-form input{height:52px;font-size:13px}.premium-overlay .premium-rule-card{grid-template-columns:auto minmax(0,1fr) auto auto auto;padding:13px;border-radius:18px;gap:9px}.premium-overlay .premium-rule-copy strong{font-size:12px}.premium-overlay .premium-rule-copy span{font-size:9px}.premium-overlay .premium-icon-action{width:36px;height:36px}
.premium-overlay .premium-search input{height:54px;font-size:13px}.premium-overlay .premium-ipo-grid{grid-template-columns:1fr;gap:11px}.premium-overlay .premium-ipo-card{min-height:116px;padding:16px;border-radius:20px}.premium-overlay .premium-backup-text{min-height:190px;font-size:11px;line-height:1.5}.premium-overlay .premium-plan-grid{grid-template-columns:1fr;gap:11px}.premium-overlay .premium-feature-checks{gap:10px}.premium-overlay .premium-feature-checks>div{min-height:48px;font-size:12px}
.premium-overlay .stock-logo-lg{width:60px;height:60px}.premium-overlay .stock-logo-md{width:44px;height:44px}.premium-overlay .stock-logo-sm{width:38px;height:38px}
@media (min-width:700px){.premium-overlay-content{padding-left:24px;padding-right:24px}.premium-overlay .premium-hero-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.premium-overlay .premium-metrics-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.premium-overlay .premium-chart-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.premium-overlay .premium-quick-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.premium-overlay .premium-insight-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.premium-overlay .premium-two-column{grid-template-columns:1fr 1fr}.premium-overlay .premium-ipo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.premium-overlay .premium-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:540px){.topbar-actions .market-status{display:none}.premium-launcher-btn{min-height:42px;padding-right:9px}.premium-overlay-demo{display:none}.premium-overlay-header{grid-template-columns:46px minmax(0,1fr)}.premium-overlay .premium-hero-value{font-size:42px}.premium-overlay .premium-chart-canvas-wrap{height:360px}}
@media (max-width:360px){.premium-launcher-copy small{display:none}.premium-launcher-copy b{font-size:10px}.premium-overlay-content{padding-left:12px;padding-right:12px}.premium-overlay .premium-hero-value{font-size:40px}.premium-overlay .premium-quick-grid,.premium-overlay .premium-insight-grid{grid-template-columns:1fr}}
'''
css.write_text(style)
