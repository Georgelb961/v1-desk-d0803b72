/* Phone only watches. Polls instead of SSE. Opens once as {DATA_PATH}. */
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  const KEY = 'v1_data_path';
  const frag = location.hash;
  if (frag.indexOf('#d=') === 0) {
    const incoming = decodeURIComponent(frag.slice(3));
    if (incoming.indexOf('https://') === 0) {
      localStorage.setItem(KEY, incoming.replace(/\/$/, ''));
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  let base = localStorage.getItem(KEY) || '';
  if (!base) {
    const p = prompt('Paste your desk link (DATA_PATH)');
    if (!p) return;
    base = p.replace(/\/$/, '');
    localStorage.setItem(KEY, base);
  }

  async function get(name) {
    const r = await fetch(base + '/' + name + '.json', {cache: 'no-store'});
    if (!r.ok) throw new Error(name + ' ' + r.status);
    return r.json();
  }

  function render(t, state) {
    document.getElementById('mode').textContent = state.mode || 'PAPER';
    document.getElementById('cash').textContent = '$' + (state.cash || 0);
    const lane = document.getElementById('lane');
    lane.textContent = state.lane || 'Idle';
    const order = document.getElementById('lastOrder');
    order.textContent = state.last_order || 'No orders yet';
    const dot = document.getElementById('dot');
    dot.className = 'dot' + ((Date.now() / 1000 - (state.ts || 0)) < 15 ? '' : ' off');
    if (window.V1Chart) V1Chart(document.getElementById('chart'), state.chart);
    const panel = document.getElementById('panel');
    if (t === 'bots') {
      const bots = [['scanner','scan'],['analyst','ana'],['brain','brain'],['executor','exe'],['risk','risk']];
      panel.innerHTML = bots.map(b =>
        '<div class="bot ' + b[1] + '"><span>' + b[0] + '</span><span>' +
        ((state.bots && state.bots[b[0]]) || 'running') + '</span></div>').join('');
    } else if (t === 'activity') {
      panel.innerHTML = (state.activity || []).slice(0, 20).map(a =>
        '<div class="bot"><span>' + a.title + '</span><span>' + (a.value || '') + '</span></div>').join('') || 'No activity';
    } else {
      panel.textContent = t === 'account' ? 'Vault: files • Telegram: settings' : 'Waiting for data…';
    }
    const img = document.getElementById('screen');
    if (state.screen) { img.src = base + '/screen.jpg?t=' + Date.now(); img.hidden = false; }
  }

  let tab = 'bots';
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    get('state').then(s => render(tab, s)).catch(() => {});
  }));

  setInterval(() => {
    get('state').then(s => render(tab, s)).catch(() => {
      document.getElementById('dot').className = 'dot off';
    });
  }, 5000);
  get('state').then(s => render(tab, s)).catch(() => {});
})();
