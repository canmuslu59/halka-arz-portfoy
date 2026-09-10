from pathlib import Path

app_path = Path('public/app.js')
app = app_path.read_text(encoding='utf-8')

nav_import = "import { createRootNavigationState, nextNavigationState, canHandleAppBack } from './core/navigation.js';\n"
refresh_import = "import { createRefreshGate } from './core/refresh-coordinator.js';\n"
if app.count(nav_import) != 1:
    raise SystemExit(f'navigation import guard mismatch: {app.count(nav_import)}')
if refresh_import not in app:
    app = app.replace(nav_import, nav_import + refresh_import, 1)

old_block = """let portfolioRefreshPromise = null;
async function loadPortfolio({ quiet = false, force = false } = {}) {
  if (portfolioRefreshPromise) return portfolioRefreshPromise;
  const btn = $('#refreshBtn');
  const run = (async () => {
    if (!quiet) btn?.classList.add('spinning');
    try {
      const cached = await service.getPortfolio({ refresh:false });
      state.portfolio = cached;
      renderPortfolio(cached);

      const fresh = await service.getPortfolio({ refresh:true, force });
      state.portfolio = fresh;
      renderPortfolio(fresh);
      evaluateLocalAlerts(fresh);
      syncPushConfiguration();
      return fresh;
    } catch (error) {
      toast(error.message);
      return state.portfolio;
    } finally {
      if (!quiet) btn?.classList.remove('spinning');
    }
  })();
  portfolioRefreshPromise = run;
  try {
    return await run;
  } finally {
    if (portfolioRefreshPromise === run) portfolioRefreshPromise = null;
  }
}

async function refreshBackgroundHistory({ force = false, announce = false } = {}) {
  if (state.historyRefreshStarted && !force) return;
  state.historyRefreshStarted = true;
  try {
    const data = await service.refreshHistory({ force });
    state.portfolio = data;
    renderPortfolio(data);
    if (state.selected) state.selected = data.holdings.find(h => h.id === state.selected.id) || null;
    if (announce) toast('Geçmiş ve sektör verileri güncellendi.');
  } catch (error) {
    if (announce) toast(error.message);
  }
}
"""
new_block = """const portfolioRefreshGate = createRefreshGate();
const historyRefreshGate = createRefreshGate();

async function loadPortfolio({ quiet = false, force = false } = {}) {
  const btn = $('#refreshBtn');
  return portfolioRefreshGate.run(async ({ force:runForce }) => {
    if (!quiet) btn?.classList.add('spinning');
    try {
      const cached = await service.getPortfolio({ refresh:false });
      state.portfolio = cached;
      renderPortfolio(cached);

      const fresh = await service.getPortfolio({ refresh:true, force:runForce });
      state.portfolio = fresh;
      renderPortfolio(fresh);
      evaluateLocalAlerts(fresh);
      syncPushConfiguration();
      return fresh;
    } catch (error) {
      toast(error.message);
      return state.portfolio;
    } finally {
      if (!quiet) btn?.classList.remove('spinning');
    }
  }, { force });
}

async function refreshBackgroundHistory({ force = false, announce = false } = {}) {
  return historyRefreshGate.run(async ({ force:runForce }) => {
    state.historyRefreshStarted = true;
    try {
      const data = await service.refreshHistory({ force:runForce });
      state.portfolio = data;
      renderPortfolio(data);
      if (state.selected) state.selected = data.holdings.find(h => h.id === state.selected.id) || null;
      if (announce) toast('Geçmiş ve sektör verileri güncellendi.');
      return data;
    } catch (error) {
      if (announce) toast(error.message);
      return state.portfolio;
    } finally {
      state.historyRefreshStarted = false;
    }
  }, { force });
}
"""
if app.count(old_block) != 1:
    raise SystemExit(f'refresh block guard mismatch: {app.count(old_block)}')
app = app.replace(old_block, new_block, 1)
app_path.write_text(app, encoding='utf-8')

module = Path('public/core/refresh-coordinator.js')
if module.exists():
    raise SystemExit('refresh-coordinator.js already exists; refusing blind overwrite')
module.write_text("""export function createRefreshGate() {
  let active = null;
  let queuedForce = null;

  function start(task, force) {
    const promise = Promise.resolve().then(() => task({ force }));
    const entry = { promise, force };
    active = entry;
    const clearActive = () => {
      if (active === entry) active = null;
    };
    promise.then(clearActive, clearActive);
    return promise;
  }

  function run(task, { force = false } = {}) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('refresh task gerekli.'));
    const wantsForce = Boolean(force);
    if (!active) return start(task, wantsForce);
    if (!wantsForce || active.force) return active.promise;

    if (!queuedForce) {
      const current = active.promise;
      const queued = current.catch(() => undefined).then(() => start(task, true));
      queuedForce = queued;
      const clearQueued = () => {
        if (queuedForce === queued) queuedForce = null;
      };
      queued.then(clearQueued, clearQueued);
    }
    return queuedForce;
  }

  return Object.freeze({ run });
}
""", encoding='utf-8')
