import { createPremiumApp } from './premium-app/index.js';

export function createPremiumDemoController(options = {}) {
  let app = null;
  let lastContext = { portfolio:null, history:[], calendar:null };

  function bridge() {
    return {
      loadCalendar: options.loadCalendar,
      loadIpoDetail: options.loadIpoDetail,
      loadPortfolioData: options.loadPortfolioData,
      savePortfolioData: options.savePortfolio,
      showToast: options.showToast,
      showLocalNotification: options.showLocalNotification,
      onExit() {
        if (window.history.state?.view === 'pro' && window.history.length > 1) {
          window.history.back();
          return;
        }
        document.getElementById('portfolioTab')?.click();
      },
    };
  }

  function ensureApp() {
    if (!app) app = createPremiumApp({ storage:options.storage || globalThis.localStorage, bridge:bridge() });
    return app;
  }

  function render(root, context = {}) {
    lastContext = { ...lastContext, ...context };
    if (root) root.replaceChildren();
    const instance = ensureApp();
    instance.update(lastContext);
    if (context.selectedTicker) instance.openIpo?.(context.selectedTicker);
    return instance;
  }

  function destroy() {
    app?.destroy?.();
    app = null;
  }

  return {
    enabled:true,
    render,
    destroy,
  };
}
