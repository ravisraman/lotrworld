// map.js — the traveller's map. A parchment chart of the whole world drawn
// procedurally on canvas (aged paper, ink ranges, forests, rivers, a compass
// rose), with clickable markers for every region and a zoom-away transition.

// Marker positions in normalized map space (x right, y down).
const PLACES = [
  { id: 'shire',       x: 0.155, y: 0.30, icon: 'hill',     label: 'The Shire' },
  { id: 'bree',        x: 0.295, y: 0.275, icon: 'town',    label: 'Bree' },
  { id: 'rivendell',   x: 0.455, y: 0.225, icon: 'vale',    label: 'Rivendell', side: 'right' },
  { id: 'caradhras',   x: 0.475, y: 0.345, icon: 'peak',    label: 'Caradhras', side: 'right' },
  { id: 'moria',       x: 0.465, y: 0.435, icon: 'gate',    label: 'Moria', side: 'left' },
  { id: 'lothlorien',  x: 0.565, y: 0.475, icon: 'wood',    label: 'Lothlórien', side: 'right' },
  { id: 'isengard',    x: 0.415, y: 0.615, icon: 'tower',   label: 'Isengard' },
  { id: 'rohan',       x: 0.545, y: 0.675, icon: 'hall',    label: 'Edoras' },
  { id: 'minastirith', x: 0.645, y: 0.795, icon: 'city',    label: 'Minas Tirith' },
  { id: 'mordor',      x: 0.80,  y: 0.745, icon: 'eye',     label: 'Mordor' },
];

const INK = '#4a3a26', INK_SOFT = 'rgba(74,58,38,0.55)', INK_FAINT = 'rgba(74,58,38,0.3)';
const WATER = 'rgba(90,110,118,0.5)';

function mulberry(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- ink glyphs ------------------------------------------------------------
function inkMountain(g, x, y, s, r, rot = 0){
  // a drawn peak: varied silhouette, tilted, hachured on the shade side
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const apexX = (r() - 0.5) * s * 0.3;
  const apexY = -s * (0.55 + r() * 0.4);
  g.strokeStyle = INK; g.lineWidth = Math.max(1, s * (0.07 + r() * 0.05)); g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-s * (0.45 + r() * 0.25), s * 0.3);
  g.quadraticCurveTo(apexX - s * 0.18, apexY * 0.55, apexX, apexY);
  g.quadraticCurveTo(apexX + s * 0.12, apexY * 0.4 + (r() - 0.5) * s * 0.2, s * (0.45 + r() * 0.25), s * 0.3);
  g.stroke();
  // hachure strokes on the south-east face
  g.strokeStyle = INK_SOFT; g.lineWidth = 1;
  const nH = 2 + (r() * 2 | 0);
  for (let i = 0; i < nH; i++){
    const t = (i + 1) / (nH + 1);
    g.beginPath();
    g.moveTo(apexX + t * s * 0.28, apexY + t * (s * 0.3 - apexY) * 0.9);
    g.lineTo(apexX + t * s * 0.5, s * 0.26);
    g.stroke();
  }
  g.restore();
}
// a ridge of peaks along a curved spine — never a stamped row
function inkRange(g, r, pts, base){
  for (let i = 0; i < pts.length - 1; i++){
    const t = i / (pts.length - 1);
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const rot = Math.atan2(y1 - y0, x1 - x0) * 0.35;
    const n = 1 + (r() * 2 | 0);
    for (let k = 0; k < n; k++){
      inkMountain(g,
        x0 + (x1 - x0) * (k / n) + (r() - 0.5) * base * 0.7,
        y0 + (y1 - y0) * (k / n) + (r() - 0.5) * base * 0.55,
        base * (0.65 + r() * 0.7), r, rot + (r() - 0.5) * 0.2);
    }
  }
}
function inkTree(g, x, y, s, r){
  const cr = s * 0.42 * (0.8 + r() * 0.4);
  // green wash under an ink outline, cartographic style
  g.fillStyle = 'rgba(104,116,70,0.45)';
  g.beginPath(); g.arc(x, y - s * 0.15, cr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK; g.lineWidth = Math.max(0.8, s * 0.06);
  g.beginPath();
  // slightly lumpy crown outline
  for (let i = 0; i <= 8; i++){
    const a = (i / 8) * Math.PI * 2;
    const rr = cr * (0.9 + Math.sin(a * 3 + s) * 0.12);
    const pxx = x + Math.cos(a) * rr, pyy = y - s * 0.15 + Math.sin(a) * rr;
    i === 0 ? g.moveTo(pxx, pyy) : g.lineTo(pxx, pyy);
  }
  g.closePath(); g.stroke();
  // trunk tick + ground stroke
  g.beginPath(); g.moveTo(x, y + s * 0.42); g.lineTo(x, y + cr * 0.2); g.stroke();
  g.strokeStyle = INK_FAINT;
  g.beginPath(); g.moveTo(x - s * 0.22, y + s * 0.42); g.lineTo(x + s * 0.22, y + s * 0.42); g.stroke();
}

export function initMap(opts){
  const { regions, goto, getCurrent } = opts;

  // ---- DOM -----------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.id = 'mapoverlay';
  overlay.innerHTML = `
    <div id="mapframe">
      <canvas id="mapcanvas"></canvas>
      <div id="mapmarks"></div>
      <div id="mapclose" title="close">✕</div>
    </div>`;
  document.body.appendChild(overlay);
  const frame = overlay.querySelector('#mapframe');
  const canvas = overlay.querySelector('#mapcanvas');
  const marks = overlay.querySelector('#mapmarks');
  overlay.querySelector('#mapclose').addEventListener('click', () => hide());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

  let open = false;

  // ---- parchment art -------------------------------------------------------
  function draw(){
    const W = frame.clientWidth, Hh = frame.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const r = mulberry(1937);
    const px = (nx) => nx * W, py = (ny) => ny * Hh;

    // aged paper
    const bg = g.createRadialGradient(W * 0.5, Hh * 0.45, Math.min(W, Hh) * 0.2, W * 0.5, Hh * 0.5, Math.max(W, Hh) * 0.75);
    bg.addColorStop(0, '#e9dab4');
    bg.addColorStop(0.72, '#dcc99c');
    bg.addColorStop(1, '#c3ab7c');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    // blotches + fibers
    for (let i = 0; i < 260; i++){
      g.fillStyle = `rgba(120,96,60,${0.02 + r() * 0.045})`;
      const bx = r() * W, by = r() * Hh, br = 2 + r() * 26;
      g.beginPath(); g.ellipse(bx, by, br, br * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 900; i++){
      g.fillStyle = `rgba(90,70,44,${0.03 + r() * 0.05})`;
      g.fillRect(r() * W, r() * Hh, 1 + r() * 2, 1);
    }
    // burnt edge vignette
    g.strokeStyle = 'rgba(96,72,40,0.5)';
    for (let i = 0; i < 3; i++){
      g.lineWidth = 10 - i * 3;
      g.globalAlpha = 0.12 - i * 0.03;
      g.strokeRect(6 + i * 5, 6 + i * 5, W - 12 - i * 10, Hh - 12 - i * 10);
    }
    g.globalAlpha = 1;

    // double ink border
    g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(16, 16, W - 32, Hh - 32);
    g.lineWidth = 1; g.strokeRect(22, 22, W - 44, Hh - 44);

    // ------- geography (a stylized fan-chart, drawn from scratch) ----------
    // the great north–south mountain spine
    {
      const spine = [];
      for (let i = 0; i <= 14; i++){
        const t = i / 14;
        spine.push([px(0.52 - Math.sin(t * 2.6) * 0.06 - t * 0.04 + (r() - 0.5) * 0.012), py(0.185 + t * 0.42)]);
      }
      inkRange(g, r, spine, 15);
      const spine2 = spine.map(([x2, y2]) => [x2 + 17, y2 + 9]);
      inkRange(g, r, spine2, 11);
    }
    // the southern range — a curved wall west–east
    {
      const ridge = [];
      for (let i = 0; i <= 10; i++){
        const t = i / 10;
        ridge.push([px(0.33 + t * 0.35), py(0.715 + Math.sin(t * 2.9 + 0.4) * 0.03 + (r() - 0.5) * 0.015)]);
      }
      inkRange(g, r, ridge, 13);
    }
    // Mordor's fences — two arcs of crag meeting at the northwest corner
    {
      const north = [], west = [];
      for (let i = 0; i <= 8; i++){
        const t = i / 8;
        north.push([px(0.705 + t * 0.20), py(0.64 + Math.sin(t * 3.1) * 0.018 + (r() - 0.5) * 0.012)]);
        west.push([px(0.702 + Math.sin(t * 2.2) * 0.008), py(0.655 + t * 0.2)]);
      }
      inkRange(g, r, north, 12);
      inkRange(g, r, west, 11);
      const south = [];
      for (let i = 0; i <= 8; i++){
        const t = i / 8;
        south.push([px(0.705 + t * 0.20), py(0.862 + (r() - 0.5) * 0.014)]);
      }
      inkRange(g, r, south, 12);
    }
    // fire glyph at Orodruin
    {
      const ox = px(0.795), oy = py(0.75);
      g.strokeStyle = 'rgba(150,60,26,0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ox - 7, oy + 5); g.lineTo(ox, oy - 9); g.lineTo(ox + 7, oy + 5); g.stroke();
      g.beginPath(); g.moveTo(ox, oy - 9); g.quadraticCurveTo(ox + 3, oy - 15, ox, oy - 19); g.stroke();
    }

    // forests
    const woods = [
      { cx: 0.585, cy: 0.475, rx: 0.045, ry: 0.04, n: 16 },   // the Golden Wood
      { cx: 0.475, cy: 0.585, rx: 0.035, ry: 0.045, n: 12 },  // Fangorn
      { cx: 0.17, cy: 0.24, rx: 0.05, ry: 0.03, n: 10 },      // Shire woods
      { cx: 0.68, cy: 0.175, rx: 0.08, ry: 0.035, n: 18 },    // the great wood NE
    ];
    for (const w of woods){
      for (let i = 0; i < w.n; i++){
        const a = r() * Math.PI * 2, rr = Math.sqrt(r());
        inkTree(g, px(w.cx) + Math.cos(a) * rr * px(w.rx), py(w.cy) + Math.sin(a) * rr * py(w.ry), 11 + r() * 5, r);
      }
    }

    // rivers — tapering dark-ink lines with a hand wobble
    const river = (pts, w0, w1) => {
      // resample the polyline smoothly, then stroke in segments with growing width
      const P = pts.map(([nx, ny]) => [px(nx), py(ny)]);
      const seg = 46;
      const pt = (t) => {
        const f = t * (P.length - 1), i = Math.min(P.length - 2, f | 0), u = f - i;
        const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
        const cr = (p0, p1, p2, p3) =>
          0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
        return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])];
      };
      g.strokeStyle = 'rgba(74,84,96,0.7)'; g.lineCap = 'round';
      let prev = pt(0);
      for (let i = 1; i <= seg; i++){
        const t = i / seg;
        const [cx2, cy2] = pt(t);
        const wob = Math.sin(t * 26 + P[0][0]) * 1.1;
        g.lineWidth = w0 + (w1 - w0) * t;
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(cx2 + wob * 0.4, cy2 + wob * 0.3);
        g.stroke();
        prev = [cx2 + wob * 0.4, cy2 + wob * 0.3];
      }
    };
    // the Great River rises in the mountains and runs to the southern sea
    river([[0.575, 0.165], [0.585, 0.3], [0.61, 0.45], [0.6, 0.6], [0.63, 0.72], [0.665, 0.86], [0.62, 0.985]], 1.0, 3.6);
    // the western river flows out to the sea
    river([[0.455, 0.245], [0.38, 0.3], [0.3, 0.33], [0.2, 0.35], [0.06, 0.4]], 0.9, 2.8);
    river([[0.425, 0.635], [0.5, 0.68], [0.56, 0.73], [0.605, 0.77]], 0.8, 2.0),
    // the western sea hint
    g.strokeStyle = WATER;
    for (let i = 0; i < 8; i++){
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(px(0.03), py(0.5 + i * 0.055));
      g.quadraticCurveTo(px(0.05), py(0.52 + i * 0.055), px(0.075 - i * 0.004), py(0.5 + i * 0.055));
      g.stroke();
    }

    // journey route — a dotted red thread through all ten places
    g.strokeStyle = 'rgba(140,50,30,0.75)';
    g.lineWidth = 2; g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(px(PLACES[0].x), py(PLACES[0].y));
    for (let i = 1; i < PLACES.length; i++){
      const a = PLACES[i - 1], b = PLACES[i];
      g.quadraticCurveTo(
        px((a.x + b.x) / 2 + 0.018), py((a.y + b.y) / 2 - 0.012),
        px(b.x), py(b.y));
    }
    g.stroke();
    g.setLineDash([]);

    // title + rule
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.font = `600 ${Math.max(20, W * 0.026)}px Georgia, serif`;
    const spaced = (s) => s.split('').join('  ');
    g.fillText(spaced('M I D D L E - E A R T H'), W / 2, py(0.085));
    g.font = `italic ${Math.max(10, W * 0.011)}px Georgia, serif`;
    g.fillStyle = INK_SOFT;
    g.fillText('being a chart of the road from the Shire unto the Land of Shadow', W / 2, py(0.115));
    g.strokeStyle = INK_SOFT; g.lineWidth = 1;
    g.beginPath(); g.moveTo(W * 0.32, py(0.13)); g.lineTo(W * 0.68, py(0.13)); g.stroke();

    // compass rose — eight slender points, half filled, over a ticked ring
    {
      const cx = px(0.09), cy = py(0.8), R = Math.min(W, Hh) * 0.058;
      g.strokeStyle = INK; g.fillStyle = INK;
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, R * 0.98, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 0.9;
      g.beginPath(); g.arc(cx, cy, R * 0.84, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 32; i++){
        const a = (i / 32) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.sin(a) * R * 0.84, cy - Math.cos(a) * R * 0.84);
        g.lineTo(cx + Math.sin(a) * R * (i % 4 === 0 ? 0.72 : 0.78), cy - Math.cos(a) * R * (i % 4 === 0 ? 0.72 : 0.78));
        g.stroke();
      }
      // long cardinal points (filled half / open half), short intercardinals
      const point = (a, len, wHalf) => {
        const tipX = cx + Math.sin(a) * len, tipY = cy - Math.cos(a) * len;
        const lX = cx + Math.sin(a - Math.PI / 2) * wHalf, lY = cy - Math.cos(a - Math.PI / 2) * wHalf;
        const rX = cx + Math.sin(a + Math.PI / 2) * wHalf, rY = cy - Math.cos(a + Math.PI / 2) * wHalf;
        g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(lX, lY); g.lineTo(cx, cy); g.closePath();
        g.fillStyle = INK; g.fill();
        g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(rX, rY); g.lineTo(cx, cy); g.closePath();
        g.fillStyle = 'rgba(238,224,186,0.9)'; g.fill();
        g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      };
      for (let i = 0; i < 4; i++) point((i / 4) * Math.PI * 2 + Math.PI / 4, R * 0.6, R * 0.1);
      for (let i = 0; i < 4; i++) point((i / 4) * Math.PI * 2, R * 0.95, R * 0.13);
      g.fillStyle = INK;
      g.font = `600 ${R * 0.5}px Georgia, serif`;
      g.textAlign = 'center';
      g.fillText('N', cx, cy - R * 1.22);
      g.font = `${R * 0.3}px Georgia, serif`;
      g.fillText('S', cx, cy + R * 1.42);
      g.fillText('E', cx + R * 1.32, cy + R * 0.1);
      g.fillText('W', cx - R * 1.32, cy + R * 0.1);
    }

    // the names of the lands, filling the open country in faded italic caps
    g.fillStyle = 'rgba(74,58,38,0.34)';
    g.textAlign = 'center';
    const land = (t, nx, ny, sz) => {
      g.font = `italic ${Math.max(11, W * sz)}px Georgia, serif`;
      g.fillText(t.split('').join(' '), px(nx), py(ny));
    };
    land('ERIADOR', 0.24, 0.475, 0.016);
    land('WILDERLAND', 0.76, 0.315, 0.015);
    land('ROHAN', 0.56, 0.585, 0.015);
    land('GONDOR', 0.55, 0.845, 0.015);
    land('MORDOR', 0.815, 0.815, 0.015);
    g.font = `italic ${Math.max(10, W * 0.011)}px Georgia, serif`;
    g.fillStyle = 'rgba(80,96,104,0.5)';
    g.fillText('the  Sundering  Seas', px(0.075), py(0.62));

    // scale bar in a small cartouche
    {
      const cx0 = px(0.705), cy0 = py(0.905), cw = px(0.215), chh = py(0.07);
      g.fillStyle = 'rgba(238,224,186,0.55)';
      g.fillRect(cx0, cy0, cw, chh);
      g.strokeStyle = INK_SOFT; g.lineWidth = 1.2;
      g.strokeRect(cx0, cy0, cw, chh);
      g.strokeRect(cx0 + 3, cy0 + 3, cw - 6, chh - 6);
      g.strokeStyle = INK; g.lineWidth = 1.6;
      const bx = cx0 + cw * 0.1, bw = cw * 0.8, byy = cy0 + chh * 0.42;
      g.beginPath(); g.moveTo(bx, byy); g.lineTo(bx + bw, byy); g.stroke();
      for (let i = 0; i < 4; i++){
        if (i % 2 === 0){
          g.fillStyle = INK;
          g.fillRect(bx + (i / 4) * bw, byy - 2.4, bw / 4, 4.8);
        }
      }
      for (let i = 0; i <= 4; i++){
        g.beginPath(); g.moveTo(bx + (i / 4) * bw, byy - 5); g.lineTo(bx + (i / 4) * bw, byy + 5); g.stroke();
      }
      g.fillStyle = INK_SOFT;
      g.font = `italic ${Math.max(9, W * 0.0088)}px Georgia, serif`;
      g.fillText('a hundred leagues and more', cx0 + cw / 2, cy0 + chh * 0.82);
    }
  }

  // ---- markers -------------------------------------------------------------
  function buildMarkers(){
    marks.innerHTML = '';
    const current = getCurrent();
    for (const pl of PLACES){
      const region = regions.find(rg => rg.id === pl.id);
      if (!region) continue;
      const b = document.createElement('button');
      b.className = 'mapmark' + (current === pl.id ? ' here' : '') + (pl.side ? ' lab-' + pl.side : '');
      b.style.left = (pl.x * 100) + '%';
      b.style.top = (pl.y * 100) + '%';
      b.innerHTML = `<span class="mm-dot"></span><span class="mm-name">${pl.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        travel(pl);
      });
      marks.appendChild(b);
    }
  }

  function travel(pl){
    // zoom the chart toward the chosen place, then ride away
    frame.style.transformOrigin = `${pl.x * 100}% ${pl.y * 100}%`;
    overlay.classList.add('zooming');
    setTimeout(() => {
      hide(true);
      goto(pl.id);
    }, 620);
  }

  function show(){
    open = true;
    overlay.classList.add('open');
    overlay.classList.remove('zooming');
    frame.style.transformOrigin = '50% 50%';
    draw();
    buildMarkers();
  }
  function hide(instant){
    open = false;
    overlay.classList.remove('open');
    if (!instant) overlay.classList.remove('zooming');
    setTimeout(() => overlay.classList.remove('zooming'), 700);
  }
  function toggle(){ open ? hide() : show(); }

  window.addEventListener('resize', () => { if (open) { draw(); } });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') toggle();
    if (e.code === 'Escape' && open) hide();
  });

  return { show, hide, toggle, isOpen: () => open };
}
