/* Hand-drawn canvas chart. No library, no build step, no network. */
(function () {
  var counts = new WeakMap();
  var reduced = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  var valueOf = function (p) {
    if (!p || typeof p !== 'object') return Number(p) || 0;
    if (p.price !== undefined && p.price !== null) return Number(p.price) || 0;
    if (p.value !== undefined && p.value !== null) return Number(p.value) || 0;
    if (p.v !== undefined && p.v !== null) return Number(p.v) || 0;
    return 0;
  };

  function fit(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width || canvas.width || 320));
    var h = Math.max(1, Math.round(rect.height || canvas.height || 200));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx: ctx, w: w, h: h};
  }

  function markLabel(mark) {
    var symbol = mark.symbol || mark.coin || '';
    var amount = mark.value !== undefined && mark.value !== null
      ? '$' + Number(mark.value).toFixed(0) : '';
    if (mark.kind === 'bought') {
      return 'Bought' + (symbol ? ' ' + symbol : '') + (amount ? ' • ' + amount : '');
    }
    if (mark.kind === 'sold') {
      return 'Sold' + (symbol ? ' ' + symbol : '') + (amount ? ' • ' + amount : '');
    }
    var reason = mark.reason ? String(mark.reason) : '-';
    return reason + (amount ? ' • ' + amount : '');
  }

  function markColor(mark) {
    if (mark.kind === 'bought') return '#0a84ff';
    if (mark.kind === 'sold') {
      return mark.status === 'unverified' ? '#ff9f0a' : '#0ed35a';
    }
    return '#ff453a';
  }

  function draw(canvas, payload, opts) {
    var box = fit(canvas);
    var ctx = box.ctx, w = box.w, h = box.h;
    var points = (payload && payload.points) || [];
    var marks = (payload && payload.marks) || [];
    opts = opts || {};
    ctx.clearRect(0, 0, w, h);
    if (points.length < 2) return;

    var vals = points.map(valueOf);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = (hi - lo) || Math.max(1, Math.abs(hi) * .01);
    lo -= span * .08; hi += span * .08; span = hi - lo;
    var firstTs = Number(points[0].ts || 0), lastTs = Number(points[points.length - 1].ts || 0);
    var tsSpan = lastTs - firstTs;
    var xOf = function (i) {
      if (tsSpan > 0 && points[i].ts) {
        return ((Number(points[i].ts) - firstTs) / tsSpan) * w;
      }
      return (i / (points.length - 1)) * w;
    };
    var yOf = function (v) { return h - 14 - ((v - lo) / span) * (h - 28); };
    var progress = 1;
    var previous = counts.get(canvas) || 0;
    if (!reduced() && previous > 0 && points.length > previous) {
      progress = 0;
      var started = performance.now();
      var step = function (now) {
        var p = Math.min(1, (now - started) / 250);
        drawFrame(p);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    counts.set(canvas, points.length);

    function drawFrame(p) {
      ctx.clearRect(0, 0, w, h);
      var gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(238,211,90,.26)');
      gradient.addColorStop(1, 'rgba(238,211,90,0)');
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var i = 0; i < points.length; i++) {
        var x = xOf(i);
        var y = yOf(vals[i]);
        if (i === points.length - 1 && p < 1) {
          var px = xOf(i - 1), py = yOf(vals[i - 1]);
          x = px + (x - px) * p;
          y = py + (y - py) * p;
        }
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      for (var j = 0; j < points.length; j++) {
        var xx = xOf(j), yy = yOf(vals[j]);
        if (j === points.length - 1 && p < 1) {
          var qx = xOf(j - 1), qy = yOf(vals[j - 1]);
          xx = qx + (xx - qx) * p;
          yy = qy + (yy - qy) * p;
        }
        if (j === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = '#eed35a';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#545458';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yOf(vals[0]));
      ctx.lineTo(w, yOf(vals[0]));
      ctx.stroke();

      if (opts.exit !== undefined && opts.exit !== null && opts.exit !== '') {
        ctx.strokeStyle = '#ff9f0a';
        ctx.beginPath();
        ctx.moveTo(0, yOf(Number(opts.exit)));
        ctx.lineTo(w, yOf(Number(opts.exit)));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      var rowEnd = [];
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      marks.forEach(function (mark) {
        var ts = Number(mark.ts || 0);
        var x = tsSpan > 0 && ts
          ? ((ts - firstTs) / tsSpan) * w
          : w - 22;
        x = Math.max(18, Math.min(w - 18, x));
        var label = markLabel(mark);
        var width = ctx.measureText(label).width + 8;
        var row = 0;
        while (rowEnd[row] !== undefined && rowEnd[row] > x - 6) row++;
        rowEnd[row] = x + width;
        var y = Math.max(13, yOf(valueOf({price: mark.price, value: mark.value})) - 12 - row * 19);
        ctx.fillStyle = markColor(mark);
        ctx.fillText(label, Math.min(w - width - 4, x - width / 2), y);
        ctx.globalAlpha = .45;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x, yOf(vals[Math.min(vals.length - 1, Math.round((x / w) * (vals.length - 1)))]));
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    drawFrame(progress);
  }

  function V1Chart(canvas, series, opts) {
    if (Array.isArray(series)) series = {points: series.map(function (v) { return {price: v}; }), marks: []};
    return draw(canvas, series, opts);
  }
  V1Chart.draw = draw;
  window.V1Chart = V1Chart;
  return V1Chart;
})();
