/* Phone only watches. Polls instead of SSE. Opens once with a one-time desk
   link: {DATA_PATH} plus {APP_TOKEN}, both kept in this browser's localStorage.
   Every FOMO URL used here is already in state.json, built by links.py.
   This file never writes, rewrites, shortens or wraps one. */
(function () {
  'use strict';
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
    var apiBase = localStorage.getItem('v1_api_base') || 'http://127.0.0.1:8765';
    var token = localStorage.getItem(TOKEN_KEY) || '';
    var BOTS = ['scanner', 'analyst', 'brain', 'executor', 'risk'];
    var COLORS = {
      scanner: '#64d2ff', analyst: '#ffd60a', brain: '#bf5af2',
      executor: '#0ed35a', risk: '#ff6b9a'
    };
    var state = null, account = {}, settings = {}, clicks = {clicks: []};
    var bots = {}, activity = [], chartData = {}, coin = {}, audit = {};
    var range = 'LIVE', tab = 'home', selectedMint = '', sellPct = 0;
    var lastGoodTs = 0, retryLeft = 5, retryTimer = null, toastTimer = null;
    var screenSrc = '', bellSeen = Number(localStorage.getItem('v1_bell_seen') || 0);

    function $(id) { return document.getElementById(id); }

    async function get(name) {
      var r = await fetch(base + '/' + name + '.json', {cache: 'no-store'});
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    }

    async function api(path, body) {
      var init = {method: body ? 'POST' : 'GET', headers: {'X-App-Token': token}};
      if (body) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      var r = await fetch(apiBase + path, init);
      var data = {};
      try { data = await r.json(); } catch (e) { data = {}; }
      if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
      return data;
    }

    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    }

    function reduced() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function roll(node, value) {
      var text = value === undefined || value === null ? '' : String(value);
      if (reduced() || node.textContent === text) { node.textContent = text; return; }
      var old = node.textContent.split('');
      var frag = document.createDocumentFragment();
      text.split('').forEach(function (ch, i) {
        var span = el('span', 'digit' + (ch !== old[i] ? ' roll' : ''), ch);
        span.style.animationDelay = (i * 30) + 'ms';
        frag.appendChild(span);
      });
      node.innerHTML = '';
      node.appendChild(frag);
    }

    function money(value) {
      var n = Number(value);
      return isFinite(n) ? '$' + n.toFixed(2) : '$0.00';
    }

    function timeText(ts) {
      if (!ts) return '—';
      var d = new Date(Number(ts) * 1000);
      if (isNaN(d.getTime())) return '—';
      var h = d.getHours();
      var suffix = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return String(h).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ' ' + suffix;
    }

    function toast(text) {
      var node = $('toast');
      node.textContent = String(text);
      node.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { node.hidden = true; }, 3200);
    }

    function openLink(url) {
      var link = String(url || '');
      if (!/^https:\/\//.test(link)) return false;
      window.open(link, '_blank', 'noopener,noreferrer');
      return true;
    }

    function setError(on) {
      var row = $('errorRow');
      row.hidden = !on;
      if (on) {
        $('errorText').textContent = 'Desk offline • retrying in ' + retryLeft + 's';
        $('retryCount').textContent = 'last update ' + timeText(lastGoodTs);
        $('lastUpdate').textContent = state ? (state.mode || 'PAPER') : 'no data yet';
      }
    }

    function showDetail(title) {
      $('detailTitle').textContent = title;
      $('detail').hidden = false;
    }

    function closeSheets() {
      ['detail', 'searchSheet', 'fullScreen', 'sellSheet'].forEach(function (id) {
        $(id).hidden = true;
      });
    }

    function linkRow(url, label) {
      var node = el('button', 'miniLink', label || 'Open on FOMO');
      node.disabled = !url;
      node.addEventListener('click', function () { openLink(url); });
      return node;
    }

    function renderHeader(s) {
      var paper = /PAPER/i.test(String(s.mode || ''));
      $('paperBadge').hidden = !paper;
      $('detailBadge').hidden = !paper;
      roll($('balanceText'), s.balanceText || money(s.balance));
      var pct = Number(s.todayPct || 0);
      $('todayPct').textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      $('todayPct').style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
      $('multiplier').textContent = Number(s.multiplier || 1).toFixed(4) + 'x';
      var market = s.market || {text: 'Quiet', tone: 'grey'};
      $('marketPill').textContent = market.text || 'Quiet';
      $('marketPill').className = 'pill ' + (market.tone === 'red' ? 'red' : 'grey');
      var lane = s.lane || {text: 'Idle', color: '#8e8e93'};
      $('lane').textContent = lane.text || 'Idle';
      $('lane').style.color = lane.color || '#8e8e93';
      $('modeValue').textContent = s.mode || 'PAPER';
      $('paperBtn').classList.toggle('on', paper);
      $('liveBtn').classList.toggle('on', !paper);
      $('handleLine').textContent = (account.handle || (s.account && s.account.handle) || 'desk');
      $('cashField').value = s.balanceText || money(s.balance);
      var order = s.last_order;
      if (order && typeof order === 'object') {
        var line = el('span', '', order.text || 'No orders yet');
        $('lastOrder').innerHTML = '';
        $('lastOrder').appendChild(line);
        if (order.checks) {
          var checks = el('span', 'checks');
          [['screen', 'S'], ['api', 'A'], ['chain', 'C']].forEach(function (pair) {
            var value = order.checks[pair[0]];
            checks.appendChild(el('i', value === true ? 'ok' : (value === false ? 'no' : ''),
              pair[1] + (value === true ? '✓' : (value === false ? '×' : '—'))));
          });
          $('lastOrder').appendChild(checks);
        }
      } else {
        $('lastOrder').textContent = order || 'No orders yet';
      }
      var newest = Math.max.apply(null, [0].concat((s.activity || []).map(function (a) {
        return Number(a.ts || 0);
      })));
      $('bellBtn').classList.toggle('hasDot', newest > bellSeen);
    }

    function renderScreenMeta(s) {
      var age = Date.now() / 1000 - Number(s.screen_ts || 0);
      var dot = $('frameDot'), text = $('frameState');
      if (s.screen_ts && age < 5) {
        dot.className = 'dot live';
        text.textContent = "Live • Bot's computer";
      } else {
        dot.className = 'dot off';
        text.textContent = 'Last frame ' + timeText(s.screen_ts);
      }
      var link = (s.coin && s.coin.link) || (s.last_order && s.last_order.link) || '';
      $('openScreenFomo').disabled = !link;
      $('openScreenFomo').onclick = function () { openLink(link); };
      $('fullOpenFomo').disabled = !link;
      $('fullOpenFomo').onclick = function () { openLink(link); };
    }

    function loadScreen() {
      var url = base + '/screen.jpg?_=' + Date.now();
      var img = new Image();
      img.onload = function () {
        if (!img.naturalWidth) return;
        screenSrc = url;
        $('screen').src = url;
        $('fullImg').src = url;
      };
      img.onerror = function () { /* keep the last good frame */ };
      img.src = url;
    }

    function botLabel(name, count) {
      if (name === 'scanner') return count + ' pools';
      if (name === 'analyst') return count + ' taken apart';
      if (name === 'brain') {
        var size = settings.settings && settings.settings.brain_risk_pct
          ? settings.settings.brain_risk_pct.value : '';
        return 'Sizing' + (size !== '' ? ' • ' + size + '% of cash' : '');
      }
      if (name === 'executor') return count + ' trades';
      return 'Guarding';
    }

    function renderCarousel(s) {
      var box = $('botCarousel');
      box.innerHTML = '';
      BOTS.forEach(function (name) {
        var card = el('button', 'botCard');
        var info = s.bots && s.bots[name];
        var count = info && typeof info === 'object' ? Number(info.today || 0) : 0;
        var status = info && typeof info === 'object' ? info.status : (info || 'running');
        var nameLine = el('div', 'botName');
        nameLine.style.color = COLORS[name];
        nameLine.appendChild(el('span', '', '●'));
        nameLine.appendChild(el('span', '', name));
        card.appendChild(nameLine);
        card.appendChild(el('div', 'botMeta', botLabel(name, count)));
        card.appendChild(el('span', 'botPill', status));
        card.addEventListener('click', function () { openTab('bots'); renderBots(); });
        box.appendChild(card);
      });
    }

    function activityNode(a, full) {
      var node = el('div', 'activityRow');
      node.appendChild(el('span', 'title', a.title || a.kind || 'Decision'));
      node.appendChild(el('span', 'value', a.value || ''));
      node.appendChild(el('span', 'sub', (a.bot || '') + (a.subtitle ? ' • ' + a.subtitle : '')));
      var rejected = String(a.kind || '').indexOf('reject') >= 0;
      var button = el('button', 'miniLink', rejected ? 'Open audit' : 'Open coin');
      button.addEventListener('click', function () {
        if (a.mint) (rejected ? openAudit : openCoin)(a.mint);
      });
      node.appendChild(button);
      node.appendChild(linkRow(a.link));
      return node;
    }

    function renderActivityPreview(s) {
      var box = $('activityPreview');
      box.innerHTML = '';
      var rows = (s.activity || []).slice(0, 5);
      if (!rows.length) {
        box.appendChild(el('div', 'empty', 'Nothing yet tonight'));
        return;
      }
      rows.forEach(function (a) { box.appendChild(activityNode(a, false)); });
    }

    function renderActivity() {
      var rows = activity.length ? activity : ((state && state.activity) || []);
      var box = $('activityList');
      box.innerHTML = '';
      if (!rows.length) {
        box.appendChild(el('div', 'empty', 'Nothing yet tonight'));
        return;
      }
      rows.slice(0, 30).forEach(function (a) { box.appendChild(activityNode(a, true)); });
    }

    function renderBots() {
      var box = $('botDetail');
      box.innerHTML = '';
      BOTS.forEach(function (name) {
        var info = state && state.bots && state.bots[name];
        var count = info && typeof info === 'object' ? Number(info.today || 0) : 0;
        var paused = info && typeof info === 'object'
          ? String(info.status).indexOf('paused') >= 0 : false;
        var card = el('section', 'botMain');
        var line = el('div', 'rowLine');
        var title = el('div');
        title.style.color = COLORS[name];
        title.appendChild(el('b', '', name));
        title.appendChild(el('div', 'hint', botLabel(name, count)));
        line.appendChild(title);
        var sw = el('label', 'switch');
        var check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !paused;
        var locked = name === 'risk' && !!(state && state.positions && state.positions.length);
        check.disabled = locked;
        check.addEventListener('change', async function () {
          var action = check.checked ? 'resume' : 'pause';
          try {
            await api('/api/bots/' + name + '/' + action, {});
            toast(name + ' ' + action + 'd');
          } catch (e) {
            check.checked = !check.checked;
            toast('Pause needs the desk API; nothing changed. ' + e.message);
          }
        });
        sw.appendChild(check);
        sw.appendChild(el('span'));
        line.appendChild(sw);
        card.appendChild(line);
        if (locked) card.appendChild(el('div', 'hint', 'Risk stays on while a position is open.'));
        var pills = el('div', 'pillRow');
        if (name === 'risk') {
          var stop = settings.settings && settings.settings.stop_pct
            ? settings.settings.stop_pct.value : 25;
          pills.appendChild(el('span', 'pill red', 'stop -' + stop + '%'));
          pills.appendChild(el('span', 'pill green', 'trail 40%'));
        } else {
          pills.appendChild(el('span', 'pill grey', count + ' today'));
        }
        card.appendChild(pills);
        var decisions = (bots[name] && bots[name].decisions) || [];
        if (!decisions.length) card.appendChild(el('div', 'empty', 'No decisions yet'));
        decisions.slice(0, 20).forEach(function (d) {
          var row = el('div', 'decisionRow');
          row.appendChild(el('span', 'title', d.title || d.kind || 'Decision'));
          row.appendChild(el('span', 'value', d.value || ''));
          row.appendChild(el('span', 'sub', d.subtitle || ''));
          row.appendChild(linkRow(d.link));
          card.appendChild(row);
        });
        box.appendChild(card);
      });
    }

    function settingRow(key, rule) {
      var label = (settings.settings && settings.settings[key] && settings.settings[key].label)
        || key.replace(/_/g, ' ');
      var value = rule && rule.value;
      var min = Number(rule && rule.min), max = Number(rule && rule.max);
      var row = el('div', 'settingRow');
      row.appendChild(el('label', '', label));
      var side = el('div');
      side.style.cssText = 'display:flex;gap:6px;align-items:center';
      var rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.min = isFinite(min) ? min : 0;
      rangeInput.max = isFinite(max) ? max : 100;
      rangeInput.value = value === '' || value === undefined ? rangeInput.min : value;
      rangeInput.disabled = true;
      var exact = document.createElement('input');
      exact.type = 'number';
      exact.value = value === undefined ? '' : value;
      exact.readOnly = true;
      side.appendChild(rangeInput);
      side.appendChild(exact);
      row.appendChild(side);
      return row;
    }

    function renderAccount() {
      var box = $('settingsList');
      box.innerHTML = '';
      Object.keys(settings.settings || {}).forEach(function (key) {
        box.appendChild(settingRow(key, settings.settings[key]));
      });
      $('vaultValue').textContent = 'Vault: ' + (account.vault || 'files • Android phone');
      $('pushState').textContent = 'Push: Telegram • '
        + (account.pushConnected ? 'connected' : 'not connected');
      $('testPushBtn').disabled = !account.pushConnected;
      var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (!standalone || !account.vapidPublic) {
        $('webPushState').textContent = 'Web push: Plan B uses Telegram only';
        $('enableNotifBtn').hidden = true;
      } else {
        $('webPushState').textContent = 'Web push: home screen notifications';
        $('enableNotifBtn').hidden = false;
      }
      $('profileLink').href = account.profile || '#';
      $('profileLink').style.pointerEvents = account.profile ? '' : 'none';
    }

    function renderChart() {
      var data = chartData[range] || {points: [], marks: []};
      var empty = !(data.points && data.points.length >= 2);
      $('chartEmpty').hidden = !empty;
      if (window.V1Chart) window.V1Chart($('chart'), data);
    }

    function render(s) {
      state = s;
      lastGoodTs = Number(s.ts || 0) || lastGoodTs;
      setError(false);
      retryLeft = 5;
      renderHeader(s);
      renderScreenMeta(s);
      renderCarousel(s);
      renderActivityPreview(s);
      document.body.classList.remove('loading');
    }

    function openTab(name) {
      tab = name;
      ['home', 'bots', 'activity', 'account'].forEach(function (key) {
        $('' + key + 'View').classList.toggle('on', key === name);
      });
      document.querySelectorAll('#tabs button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.tab === name);
      });
      window.scrollTo(0, 0);
      if (name === 'bots') renderBots();
      if (name === 'activity') renderActivity();
      if (name === 'account') renderAccount();
    }

    function fmtValue(value) {
      if (value === undefined || value === null || value === '') return 'None';
      if (typeof value === 'object') {
        return Object.keys(value).map(function (k) { return k + ': ' + value[k]; }).join(', ');
      }
      return String(value);
    }

    function renderAuditBody() {
      var body = $('detailBody');
      body.innerHTML = '';
      var layers = audit.layers || [];
      if (!layers.length) {
        body.appendChild(el('div', 'empty', 'Not audited yet'));
        return;
      }
      var discs = el('div', 'discs');
      discs.appendChild(el('div', 'beam'));
      layers.slice(0, 8).forEach(function (layer, i) {
        var disc = el('div', 'disc' + (layer.ok === true ? ' ok'
          : (layer.ok === false ? ' no' : '')), layer.ok === true ? '✓'
          : (layer.ok === false ? '×' : '—'));
        disc.appendChild(el('span', 'layerName', String(i + 1)));
        discs.appendChild(disc);
      });
      body.appendChild(discs);
      var table = el('div', 'layerTable');
      layers.slice(0, 8).forEach(function (layer, i) {
        var line = el('div');
        line.appendChild(el('span', '', (i + 1) + '. ' + layer.name));
        line.appendChild(el('span', '', fmtValue(layer.value) + (layer.reason ? ' • ' + layer.reason : '')));
        table.appendChild(line);
      });
      body.appendChild(table);
      body.appendChild(el('div', 'hint', audit.social === undefined || audit.social === null
        ? 'Social: off' : 'Social: +' + audit.social));
      body.appendChild(linkRow(audit.link, 'Open on FOMO'));
    }

    async function openAudit(mint) {
      selectedMint = String(mint || '');
      showDetail('Audit');
      $('detailBody').innerHTML = '<div class="skeleton sk-row"></div>';
      try {
        audit = await get('audit/' + encodeURIComponent(selectedMint));
      } catch (e) {
        audit = (state && state.audit) || {};
      }
      renderAuditBody();
    }

    function renderCoinBody() {
      var body = $('detailBody');
      body.innerHTML = '';
      var c = coin;
      var name = c.symbol || c.name || c.mint || 'Coin';
      body.appendChild(el('div', 'coinTitle', name));
      var chipLine = el('div', 'pillRow');
      chipLine.appendChild(el('span', 'pill grey', (c.chain || 'solana') + ' shield chip'));
      chipLine.appendChild(el('span', 'pill '
        + (String(c.shield) === '8/8' ? 'green' : 'grey'), c.shield || 'not passed'));
      body.appendChild(chipLine);
      body.appendChild(el('div', 'coinAge', c.age_min !== undefined && c.age_min !== null
        ? Number(c.age_min).toFixed(0) + ' min old' : 'Age unknown'));
      body.appendChild(el('div', 'coinTitle', c.price !== undefined && c.price !== null
        ? '$' + Number(c.price).toPrecision(6) : 'Price —'));
      body.appendChild(el('div', 'hint', c.since_entry_pct !== undefined && c.since_entry_pct !== null
        ? Number(c.since_entry_pct).toFixed(2) + '% since entry' : 'No entry yet'));
      var canvas = el('canvas');
      canvas.id = 'detailCanvas';
      body.appendChild(canvas);
      if (window.V1Chart && (c.candles || []).length >= 2) {
        window.V1Chart(canvas, {points: c.candles, marks: []},
          {exit: c.position && c.position.stop_price});
      }
      var grid = el('div', 'statGrid');
      [['Market cap', c.market_cap], ['Liquidity', c.liquidity],
       ['Holders', c.holders], ['Top 10', c.top10_pct]].forEach(function (pair) {
        var cell = el('div');
        cell.appendChild(el('span', '', pair[0]));
        cell.appendChild(el('b', '', pair[1] === undefined || pair[1] === null
          ? '—' : String(pair[1])));
        grid.appendChild(cell);
      });
      body.appendChild(grid);
      var p = c.position || {};
      body.appendChild(el('div', 'hint', p.size_usd
        ? 'Your $' + p.size_usd + ' in • Executor' : 'No open position'));
      body.appendChild(linkRow(c.link, 'Open on FOMO'));
      var sell = el('button', 'primaryBtn', 'Sell now');
      sell.disabled = !p.size_usd;
      sell.addEventListener('click', function () {
        $('sellTitle').textContent = 'Sell ' + name;
        $('sellSheet').hidden = false;
      });
      body.appendChild(sell);
    }

    async function openCoin(mint) {
      selectedMint = String(mint || '');
      showDetail('Coin');
      $('detailBody').innerHTML = '<div class="skeleton sk-row"></div>';
      try {
        coin = await get('coin/' + encodeURIComponent(selectedMint));
      } catch (e) {
        coin = (state && state.coins && state.coins[selectedMint]) || {mint: selectedMint};
      }
      renderCoinBody();
    }

    function loadAux() {
      Promise.allSettled([
        get('account').then(function (v) { account = v; renderAccount(); }),
        get('settings').then(function (v) { settings = v; renderAccount(); }),
        get('clicks').then(function (v) { clicks = v; }),
        get('activity').then(function (v) {
          activity = Array.isArray(v) ? v : (v.rows || []);
          renderActivity();
        }),
        Promise.all(BOTS.map(function (name) {
          return get('bots/' + name).then(function (v) { bots[name] = v; });
        })).then(renderBots),
        get(range === 'LIVE' ? 'chart' : 'chart_' + range).then(function (v) {
          chartData[range] = v; renderChart();
        })
      ]).catch(function () {});
    }

    async function refresh() {
      try {
        var s = await get('state');
        render(s);
      } catch (e) {
        retryLeft = 5;
        setError(true);
      }
    }

    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.addEventListener('click', function () { openTab(b.dataset.tab); });
    });
    $('avatar').addEventListener('click', function () { openTab('account'); });
    $('seeAll').addEventListener('click', function () { openTab('activity'); });
    $('bellBtn').addEventListener('click', function () {
      bellSeen = Date.now() / 1000;
      localStorage.setItem('v1_bell_seen', String(Math.floor(bellSeen)));
      $('bellBtn').classList.remove('hasDot');
      openTab('activity');
    });
    $('detailBack').addEventListener('click', function () { $('detail').hidden = true; });
    $('searchClose').addEventListener('click', function () { $('searchSheet').hidden = true; });
    $('fullClose').addEventListener('click', function () { $('fullScreen').hidden = true; });
    $('screenCard').addEventListener('click', function () {
      $('fullScreen').hidden = false;
      if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
      }
    });
    $('searchBtn').addEventListener('click', function () {
      $('searchSheet').hidden = false;
      $('searchInput').value = '';
      $('searchInput').focus();
      renderSearch('');
    });
    $('searchInput').addEventListener('input', function () {
      renderSearch($('searchInput').value);
    });
    function renderSearch(query) {
      var box = $('searchResults');
      box.innerHTML = '';
      var q = String(query || '').trim().toLowerCase();
      var coins = (state && state.coins) || {};
      var rows = Object.keys(coins).map(function (k) { return coins[k]; }).filter(function (c) {
        return !q || [c.name, c.symbol, c.mint].some(function (v) {
          return String(v || '').toLowerCase().indexOf(q) >= 0;
        });
      });
      if (!rows.length) { box.appendChild(el('div', 'empty', 'No coins match')); return; }
      rows.slice(0, 20).forEach(function (c) {
        var row = el('div', 'activityRow');
        row.appendChild(el('span', 'title', c.symbol || c.name || c.mint));
        row.appendChild(el('span', 'sub', c.mint));
        row.appendChild(linkRow(c.link));
        var open = el('button', 'miniLink', 'Open coin');
        open.addEventListener('click', function () { openCoin(c.mint); });
        row.appendChild(open);
        box.appendChild(row);
      });
    }

    document.querySelectorAll('#ranges button').forEach(function (b) {
      b.addEventListener('click', async function () {
        range = b.dataset.range;
        document.querySelectorAll('#ranges button').forEach(function (x) {
          x.classList.toggle('on', x === b);
        });
        if (!chartData[range]) {
          try {
            chartData[range] = await get(range === 'LIVE' ? 'chart' : 'chart_' + range);
          } catch (e) {}
        }
        renderChart();
      });
    });

    $('paperBtn').addEventListener('click', function () {
      toast('Already PAPER. LIVE stays locked until STEP 15.');
    });
    $('liveBtn').addEventListener('click', function () { $('liveBox').hidden = false; });
    $('liveConfirm').addEventListener('click', async function () {
      if ($('liveInput').value !== 'LIVE') { toast('Type LIVE exactly'); return; }
      try {
        await api('/api/mode', {mode: 'LIVE', confirm: 'LIVE'});
        toast('LIVE armed by the desk');
      } catch (e) { toast('LIVE refused: ' + e.message); }
    });
    $('settingsShortcut').addEventListener('click', function () {
      $('settingsList').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    $('inviteBtn').addEventListener('click', async function () {
      var url = account.signup || '';
      if (!url) return;
      if (navigator.share) {
        try { await navigator.share({title: 'V1 Desk', url: url}); return; } catch (e) {}
      }
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      } catch (e) { toast('Share sheet unavailable'); }
    });
    $('testPushBtn').addEventListener('click', async function () {
      try {
        await api('/api/push/test', {});
        toast('Test push sent to owner');
      } catch (e) { toast('Test push unavailable: ' + e.message); }
    });
    $('enableNotifBtn').addEventListener('click', async function () {
      try {
        var permission = await Notification.requestPermission();
        if (permission !== 'granted') { toast('Notifications not allowed'); return; }
        var sub = await navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.subscribe({userVisibleOnly: true,
            applicationServerKey: account.vapidPublic});
        });
        var raw = sub.toJSON();
        await api('/api/push', {endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth});
        toast('Web push connected');
      } catch (e) {
        if (e && e.name === 'InvalidStateError') toast('Home screen only');
        else toast('Web push unavailable');
      }
    });
    $('previewBtn').addEventListener('click', function () {
      toast('Desk preview: dedicated Chrome on 127.0.0.1:9223');
    });

    async function sendCommand() {
      var text = $('commandInput').value.trim();
      if (!text) return;
      var box = $('commandReplies');
      box.textContent = 'Asking the desk…';
      try {
        var result = await api('/api/command', {text: text});
        box.textContent = (result.replies || []).join('\n') || 'No reply';
      } catch (e) {
        box.textContent = 'Desk API unreachable from here. Use Telegram instead. ' + e.message;
      }
    }
    $('commandSend').addEventListener('click', sendCommand);
    $('commandInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendCommand();
    });

    document.querySelectorAll('#sellChoices button').forEach(function (b) {
      b.addEventListener('click', function () {
        sellPct = Number(b.dataset.pct || 0);
        document.querySelectorAll('#sellChoices button').forEach(function (x) {
          x.classList.toggle('on', x === b);
        });
        $('sellConfirm').disabled = !sellPct;
      });
    });
    $('sellClose').addEventListener('click', function () { $('sellSheet').hidden = true; });
    $('sellConfirm').addEventListener('click', async function () {
      if (!sellPct || !selectedMint) return;
      try {
        await api('/api/sell/' + encodeURIComponent(selectedMint),
          {pct: sellPct, confirm: true});
        toast('Sell queued for ' + sellPct + '%');
        $('sellSheet').hidden = true;
      } catch (e) { toast('Sell unavailable: ' + e.message); }
    });

    setInterval(function () {
      retryLeft -= 1;
      if (retryLeft <= 0) retryLeft = 5;
      if (!document.getElementById('errorRow').hidden) setError(true);
    }, 1000);
    setInterval(refresh, 5000);
    setInterval(loadScreen, 15000);
    refresh();
    loadScreen();
    loadAux();
  }
})();
