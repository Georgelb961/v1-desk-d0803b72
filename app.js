/* Phone only watches. Polls instead of SSE. Opens once as {DATA_PATH}.
   Every FOMO URL used here is already in state.json, built by links.py.
   This file never writes, rewrites, shortens or wraps one. */
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

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function row(label, value) {
    const node = el('div', 'row');
    node.appendChild(el('span', '', label));
    node.appendChild(el('span', '', value === undefined || value === null ? '' : value));
    return node;
  }

  function fomo(url, label) {
    const node = el('div', 'row');
    const a = el('a', 'fomo' + (url ? '' : ' off'), label || 'Open on FOMO');
    if (url) {
      a.href = String(url);          // exact string from links.py, untouched
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    node.appendChild(a);
    return node;
  }

  function botsPanel(panel, state) {
    const list = [['scanner', 'scan'], ['analyst', 'ana'], ['brain', 'brain'],
                  ['executor', 'exe'], ['risk', 'risk']];
    list.forEach(function (b) {
      const node = el('div', 'bot ' + b[1]);
      node.appendChild(el('span', '', b[0]));
      node.appendChild(el('span', '', (state.bots && state.bots[b[0]]) || 'running'));
      panel.appendChild(node);
    });
  }

  function activityPanel(panel, state) {
    const rows = (state.activity || []).slice(0, 20);
    if (!rows.length) { panel.appendChild(el('div', 'bot', 'No activity')); return; }
    rows.forEach(function (a) {
      const node = el('div', 'bot');
      node.appendChild(el('span', '', a.title || a.kind || ''));
      node.appendChild(el('span', '', a.subtitle || a.bot || ''));
      node.appendChild(el('span', '', a.value || ''));
      panel.appendChild(node);
      panel.appendChild(fomo(a.link, 'Open on FOMO'));
    });
  }

  function coinPanel(panel, state) {
    const c = state.coin || {};
    panel.appendChild(row('Coin', (c.symbol || c.name || c.mint || 'none')));
    panel.appendChild(row('Price', c.price || ''));
    panel.appendChild(row('Holders', c.holders || ''));
    panel.appendChild(row('Your position', (c.position && c.position.size_usd)
      ? '$' + c.position.size_usd : 'none'));
    panel.appendChild(fomo(c.link, 'Open on FOMO'));
  }

  function auditPanel(panel, state) {
    const a = state.audit || {};
    const layers = a.layers || {};
    panel.appendChild(row('Result', a.pass ? (a.score + ' / 8/8') : (a.reason || 'not audited')));
    Object.keys(layers).forEach(function (key) {
      panel.appendChild(row(key, layers[key]));
    });
    panel.appendChild(fomo(a.link, 'Open audit on FOMO'));
  }

  function accountPanel(panel, state) {
    const a = state.account || {};
    panel.appendChild(row('Handle', a.handle || ''));
    panel.appendChild(row('Telegram', a.telegram || ''));
    panel.appendChild(row('Vault', a.vault || ''));
    panel.appendChild(fomo(a.profile, 'Open profile on FOMO'));
    panel.appendChild(el('div', 'bot', 'Copy picks'));
    (state.picks || []).forEach(function (p) {
      panel.appendChild(row('#' + p.rank, p.handle || p.user_id || ''));
      panel.appendChild(fomo(p.link, 'Open pick on FOMO'));
    });
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
    panel.innerHTML = '';
    if (t === 'bots') botsPanel(panel, state);
    else if (t === 'activity') activityPanel(panel, state);
    else if (t === 'coin') coinPanel(panel, state);
    else if (t === 'audit') auditPanel(panel, state);
    else accountPanel(panel, state);
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
