/* Hand-drawn chart - no library, no build step. */
window.V1Chart = function (canvas, series) {
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);
  if (!series || series.length < 2) return;
  const lo = Math.min.apply(null, series), hi = Math.max.apply(null, series);
  const span = (hi - lo) || 1;
  const x = i => (i / (series.length - 1)) * w;
  const y = v => h - 12 - ((v - lo) / span) * (h - 24);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(238,211,90,.28)');
  g.addColorStop(1, 'rgba(238,211,90,0)');
  c.beginPath(); c.moveTo(0, h);
  series.forEach((v, i) => c.lineTo(x(i), y(v)));
  c.lineTo(w, h); c.closePath(); c.fillStyle = g; c.fill();
  c.beginPath();
  series.forEach((v, i) => i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)));
  c.strokeStyle = '#eed35a'; c.lineWidth = 3; c.stroke();
  c.setLineDash([5, 5]); c.strokeStyle = '#555'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, y(series[0])); c.lineTo(w, y(series[0])); c.stroke();
  c.setLineDash([]);
};
