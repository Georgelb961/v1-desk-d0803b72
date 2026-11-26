/* Phone only watches. Polls instead of SSE. Opens once with a one-time desk
   link: {DATA_PATH} plus {APP_TOKEN}, both kept in this browser's localStorage.
   Every FOMO URL used here is already in state.json, built by links.py.
   This file never writes, rewrites, shortens or wraps one. */
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  var DATA_KEY = 'v1_data_path';
  var TOKEN_KEY = 'v1_app_token';
  var gate = document.getElementById('gate');
  var input = document.getElementById('deskLink');
  var button = document.getElementById('saveLink');
  var started = false;

  function clearHash() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  function parseValue(raw) {
    var s = String(raw || '').trim();
    var frag = '';
    if (s.indexOf('#') >= 0) frag = s.slice(s.indexOf('#') + 1);
    var q = new URLSearchParams(frag);
    var data = q.get('d') || '';
    var token = q.get('t') || '';
    if (!data && !token && /^[A-Za-z0-9_-]{32,}$/.test(s)) {
      // A bare private path or token, for phones that already saved the other.
      if (localStorage.getItem(DATA_KEY)) token = s;
      else data = s;
    }
    return {data: data, token: token};
  }

  function accept(raw) {
    var parsed = parseValue(raw);
    var data = parsed.data || localStorage.getItem(DATA_KEY) || '';
    var token = parsed.token || localStorage.getItem(TOKEN_KEY) || '';
    if (!data || !token) return false;
    localStorage.setItem(DATA_KEY, data.replace(/\/$/, ''));
    localStorage.setItem(TOKEN_KEY, token);
    clearHash();
    gate.hidden = true;
    start();
    return true;
  }

  function ask() {
    gate.hidden = false;
    input.value = '';
    input.focus();
  }

  // The one-time link carries both values in the fragment only. A fragment is
  // never sent to GitHub Pages, so the token never enters a server log.
  if (location.hash) {
    var fromHash = parseValue(location.hash);
    var savedData = fromHash.data || localStorage.getItem(DATA_KEY) || '';
    var savedToken = fromHash.token || localStorage.getItem(TOKEN_KEY) || '';
    if (savedData && savedToken) {
      localStorage.setItem(DATA_KEY, savedData.replace(/\/$/, ''));
      localStorage.setItem(TOKEN_KEY, savedToken);
      clearHash();
    }
  }

  button.addEventListener('click', function () {
    if (!accept(input.value)) {
      input.value = '';
      input.placeholder = 'Incomplete - paste the full one-time link';
    }
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') button.click();
  });

  if (!localStorage.getItem(DATA_KEY) || !localStorage.getItem(TOKEN_KEY)) {
    ask();
    return;
  }
  start();

  function start() {
    if (started) return;
    started = true;
    var base = localStorage.getItem(DATA_KEY) || '';

    async function get(name) {
      var r = await fetch(base + '/' + name + '.json', {cache: 'no-store'});
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    }

    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    }

    function row(label, value) {
      var node = el('div', 'row');
      node.appendChild(el('span', '', label));
      node.appendChild(el('span', '', value === undefined || value === null ? '' : value));
      return node;
    }

    function fomo(url, label) {
      var node = el('div', 'row');
      var a = el('a', 'fomo' + (url ? '' : ' off'), label || 'Open on FOMO');
      if (url) {
        a.href = String(url);          // exact string from links.py, untouched
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      node.appendChild(a);
      return node;
    }

    function botsPanel(panel, state) {
      var list = [['scanner', 'scan'], ['analyst', 'ana'], ['brain', 'brain'],
                  ['executor', 'exe'], ['risk', 'risk']];
      list.forEach(function (b) {
        var info = state.bots && state.bots[b[0]];
        var label = info && typeof info === 'object'
          ? (info.status || 'running') : (info || 'running');
        var node = el('div', 'bot ' + b[1]);
        node.appendChild(el('span', '', b[0]));
        node.appendChild(el('span', '', label));
        panel.appendChild(node);
      });
    }

    function activityPanel(panel, state) {
      var rows = (state.activity || []).slice(0, 20);
      if (!rows.length) { panel.appendChild(el('div', 'bot', 'No activity')); return; }
      rows.forEach(function (a) {
        var node = el('div', 'bot');
        node.appendChild(el('span', '', a.title || a.kind || ''));
        node.appendChild(el('span', '', a.subtitle || a.bot || ''));
        node.appendChild(el('span', '', a.value || ''));
        panel.appendChild(node);
        panel.appendChild(fomo(a.link, 'Open on FOMO'));
      });
    }

    function coinPanel(panel, state) {
      var c = state.coin || {};
      panel.appendChild(row('Coin', (c.symbol || c.name || c.mint || 'none')));
      panel.appendChild(row('Price', c.price || ''));
      panel.appendChild(row('Holders', c.holders || ''));
      panel.appendChild(row('Your position', (c.position && c.position.size_usd)
        ? '$' + c.position.size_usd : 'none'));
      panel.appendChild(fomo(c.link, 'Open on FOMO'));
    }

    function auditPanel(panel, state) {
      var a = state.audit || {};
      var layers = a.layers || {};
      panel.appendChild(row('Result', a.pass ? (a.score + ' / 8/8') : (a.reason || 'not audited')));
      Object.keys(layers).forEach(function (key) {
        panel.appendChild(row(key, layers[key]));
      });
      panel.appendChild(fomo(a.link, 'Open audit on FOMO'));
    }

    function accountPanel(panel, state) {
      var a = state.account || {};
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
      var cash = state.balanceText
        || (state.balance !== undefined ? '$' + state.balance : '$' + (state.cash || 0));
      document.getElementById('cash').textContent = cash;
      var lane = document.getElementById('lane');
      lane.textContent = state.lane || 'Idle';
      var order = document.getElementById('lastOrder');
      order.textContent = state.last_order || 'No orders yet';
      var dot = document.getElementById('dot');
      dot.className = 'dot' + ((Date.now() / 1000 - (state.ts || 0)) < 15 ? '' : ' off');
      if (window.V1Chart) V1Chart(document.getElementById('chart'), state.chart);
      var panel = document.getElementById('panel');
      panel.innerHTML = '';
      if (t === 'bots') botsPanel(panel, state);
      else if (t === 'activity') activityPanel(panel, state);
      else if (t === 'coin') coinPanel(panel, state);
      else if (t === 'audit') auditPanel(panel, state);
      else accountPanel(panel, state);
      var img = document.getElementById('screen');
      img.src = base + '/screen.jpg?_=' + Date.now();  // cache-buster, not a token
      img.hidden = false;
    }

    var tab = 'bots';
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        tab = b.dataset.tab;
        document.querySelectorAll('#tabs button').forEach(function (x) {
          x.classList.toggle('on', x === b);
        });
        get('state').then(function (s) { render(tab, s); }).catch(fail);
      });
    });

    function fail() {
      document.getElementById('dot').className = 'dot off';
      var panel = document.getElementById('panel');
      if (!panel.children.length) {
        ask();
        input.placeholder = 'Saved link did not load - paste the newest one-time link';
      }
    }

    setInterval(function () {
      get('state').then(function (s) { render(tab, s); }).catch(fail);
    }, 5000);
    get('state').then(function (s) { render(tab, s); }).catch(fail);
  }
})();
