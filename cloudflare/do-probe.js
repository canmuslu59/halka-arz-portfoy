export class ProbeState {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const current = Number(await this.state.storage.get('count') || 0);
    const next = current + 1;
    await this.state.storage.put('count', next);
    return new Response(String(next), { headers:{ 'content-type':'text/plain; charset=utf-8' } });
  }
}

export default {
  fetch(_request, env) {
    const id = env.PROBE.idFromName('global');
    return env.PROBE.get(id).fetch('https://probe.internal/');
  },
};
