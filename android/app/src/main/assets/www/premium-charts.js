function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function paddingValue(padding, key, fallback) {
  const n = Number(padding?.[key]);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export function buildChartGeometry(rows = [], options = {}) {
  const width = Math.max(1, Number(options.width) || 1);
  const height = Math.max(1, Number(options.height) || 1);
  const padding = options.padding || {};
  const plotLeft = paddingValue(padding, 'left', 38);
  const plotRight = Math.max(plotLeft + 1, width - paddingValue(padding, 'right', 12));
  const plotTop = paddingValue(padding, 'top', 16);
  const plotBottom = Math.max(plotTop + 1, height - paddingValue(padding, 'bottom', 28));
  const valid = (Array.isArray(rows) ? rows : []).filter(row => row && finite(row.y) != null);

  if (!valid.length) {
    return { width, height, plotLeft, plotRight, plotTop, plotBottom, points:[], minPoint:null, maxPoint:null, zeroY:null, yMin:null, yMax:null };
  }

  let yMin = Math.min(...valid.map(row => Number(row.y)));
  let yMax = Math.max(...valid.map(row => Number(row.y)));
  if (yMin === yMax) {
    const span = Math.max(1, Math.abs(yMin) * 0.04);
    yMin -= span;
    yMax += span;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
  }

  const xSpan = Math.max(1, plotRight - plotLeft);
  const ySpan = Math.max(1, plotBottom - plotTop);
  const points = valid.map((row, index) => {
    const ratioX = valid.length <= 1 ? 0.5 : index / (valid.length - 1);
    const ratioY = (Number(row.y) - yMin) / (yMax - yMin);
    return {
      index,
      row,
      x:plotLeft + ratioX * xSpan,
      y:plotBottom - ratioY * ySpan,
    };
  });

  let minPoint = points[0];
  let maxPoint = points[0];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].row.y < minPoint.row.y) minPoint = points[i];
    if (points[i].row.y > maxPoint.row.y) maxPoint = points[i];
  }

  const zeroY = yMin <= 0 && yMax >= 0
    ? plotBottom - ((0 - yMin) / (yMax - yMin)) * ySpan
    : null;

  return { width, height, plotLeft, plotRight, plotTop, plotBottom, points, minPoint, maxPoint, zeroY, yMin, yMax };
}

export function nearestChartPoint(geometry, x) {
  const points = geometry?.points || [];
  if (!points.length) return null;
  const targetX = Number(x);
  let nearest = points[0];
  let distance = Math.abs(points[0].x - targetX);
  for (let i = 1; i < points.length; i += 1) {
    const nextDistance = Math.abs(points[i].x - targetX);
    if (nextDistance < distance) {
      nearest = points[i];
      distance = nextDistance;
    }
  }
  return nearest;
}

function cssVar(name, fallback) {
  try {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function roundedLabel(ctx, text, x, y, align = 'center') {
  ctx.save();
  ctx.font = '700 10px system-ui, sans-serif';
  const width = ctx.measureText(text).width + 12;
  const height = 20;
  let left = x - width / 2;
  if (align === 'left') left = x;
  if (align === 'right') left = x - width;
  const top = y - height / 2;
  const radius = 7;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + width - radius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
  ctx.lineTo(left + width, top + height - radius);
  ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
  ctx.lineTo(left + radius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.fillStyle = 'rgba(10,18,34,.92)';
  ctx.fill();
  ctx.fillStyle = '#dbe7ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + width / 2, top + height / 2 + .5);
  ctx.restore();
}

function drawPath(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const midX = (prev.x + point.x) / 2;
    ctx.bezierCurveTo(midX, prev.y, midX, point.y, point.x, point.y);
  }
}

export function createPremiumChart(canvas, { onHover = null, valueLabel = value => String(value) } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('Canvas gerekli.');
  const ctx = canvas.getContext('2d');
  let rows = [];
  let activePoint = null;
  let geometry = buildChartGeometry([], { width:1, height:1 });
  let destroyed = false;

  function sizeCanvas() {
    const cssWidth = Math.max(280, Math.round(canvas.clientWidth || 320));
    const cssHeight = Math.max(220, Math.round(canvas.clientHeight || 270));
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geometry = buildChartGeometry(rows, { width:cssWidth, height:cssHeight });
  }

  function draw() {
    if (destroyed) return;
    sizeCanvas();
    const g = geometry;
    const width = g.width;
    const height = g.height;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = 'rgba(140,165,210,.11)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = g.plotTop + ((g.plotBottom - g.plotTop) * i / 4);
      ctx.beginPath();
      ctx.moveTo(g.plotLeft, y);
      ctx.lineTo(g.plotRight, y);
      ctx.stroke();
    }

    if (!g.points.length) {
      ctx.fillStyle = cssVar('--muted', '#8390a6');
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bu aralık için yeterli geçmiş veri yok.', width / 2, height / 2);
      ctx.restore();
      return;
    }

    if (g.zeroY != null) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(190,205,235,.28)';
      ctx.beginPath();
      ctx.moveTo(g.plotLeft, g.zeroY);
      ctx.lineTo(g.plotRight, g.zeroY);
      ctx.stroke();
      ctx.restore();
    }

    const gradient = ctx.createLinearGradient(0, g.plotTop, 0, g.plotBottom);
    gradient.addColorStop(0, 'rgba(70,236,170,.30)');
    gradient.addColorStop(.58, 'rgba(77,137,255,.13)');
    gradient.addColorStop(1, 'rgba(142,82,255,.02)');
    drawPath(ctx, g.points);
    ctx.lineTo(g.points[g.points.length - 1].x, g.plotBottom);
    ctx.lineTo(g.points[0].x, g.plotBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    drawPath(ctx, g.points);
    const lineGradient = ctx.createLinearGradient(g.plotLeft, 0, g.plotRight, 0);
    lineGradient.addColorStop(0, '#53e6aa');
    lineGradient.addColorStop(.5, '#5fa2ff');
    lineGradient.addColorStop(1, '#9b6cff');
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    for (const point of [g.minPoint, g.maxPoint]) {
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = point === g.maxPoint ? '#54e6a9' : '#ff7080';
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,11,22,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (activePoint) {
      const current = g.points[activePoint.index] || nearestChartPoint(g, activePoint.x);
      if (current) {
        activePoint = current;
        ctx.save();
        ctx.strokeStyle = 'rgba(222,232,255,.58)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(current.x, g.plotTop);
        ctx.lineTo(current.x, g.plotBottom);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#8b7cff';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const first = g.points[0];
    const last = g.points[g.points.length - 1];
    ctx.fillStyle = cssVar('--muted', '#8390a6');
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(first.row.date || '', g.plotLeft, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText(last.row.date || '', g.plotRight, height - 4);

    if (g.maxPoint && g.points.length > 1) roundedLabel(ctx, valueLabel(g.maxPoint.row.y), g.maxPoint.x, Math.max(12, g.maxPoint.y - 14));
    ctx.restore();
  }

  function pick(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const point = nearestChartPoint(geometry, x);
    activePoint = point;
    draw();
    if (typeof onHover === 'function') onHover(point ? point.row : null, point);
  }

  function onPointer(event) { pick(event.clientX); }
  function onTouch(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    event.preventDefault();
    pick(touch.clientX);
  }
  function clearActive() {
    activePoint = null;
    draw();
    if (typeof onHover === 'function') onHover(null, null);
  }

  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerleave', clearActive);
  canvas.addEventListener('touchstart', onTouch, { passive:false });
  canvas.addEventListener('touchmove', onTouch, { passive:false });
  globalThis.addEventListener?.('resize', draw);

  return {
    setData(nextRows) { rows = Array.isArray(nextRows) ? nextRows.slice() : []; activePoint = null; draw(); },
    redraw:draw,
    getGeometry() { return geometry; },
    destroy() {
      destroyed = true;
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerleave', clearActive);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
      globalThis.removeEventListener?.('resize', draw);
    },
  };
}
