// map.js — the traveller's map. A parchment chart of the whole world drawn
// procedurally on canvas (aged paper, ink ranges, forests, rivers, a compass
// rose), with clickable markers for every region and a zoom-away transition.

// Marker positions in normalized map space (x right, y down).
const PLACES = [
  { id: 'shire',       x: 0.155, y: 0.30, icon: 'hill',     label: 'The Shire' },
  { id: 'bree',        x: 0.295, y: 0.275, icon: 'town',    label: 'Bree' },
  { id: 'rivendell',   x: 0.455, y: 0.225, icon: 'vale',    label: 'Rivendell' },
  { id: 'caradhras',   x: 0.475, y: 0.345, icon: 'peak',    label: 'Caradhras' },
  { id: 'moria',       x: 0.465, y: 0.435, icon: 'gate',    label: 'Moria' },
  { id: 'lothlorien',  x: 0.565, y: 0.475, icon: 'wood',    label: 'Lothlórien' },
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
function inkMountain(g, x, y, s, r){
  // a little caret peak with a shadow stroke on its east face
  g.strokeStyle = INK; g.lineWidth = Math.max(1, s * 0.09); g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - s * 0.55, y + s * 0.32);
  g.quadraticCurveTo(x - s * 0.1, y - s * 0.62 - r() * s * 0.3, x + s * 0.08, y - s * 0.28);
  g.quadraticCurveTo(x + s * 0.3, y - s * 0.02, x + s * 0.55, y + s * 0.32);
  g.stroke();
  g.strokeStyle = INK_SOFT; g.lineWidth = Math.max(1, s * 0.07);
  g.beginPath();
  g.moveTo(x + s * 0.02, y - s * 0.3);
  g.lineTo(x + s * 0.2, y + s * 0.22);
  g.stroke();
}
function inkTree(g, x, y, s, r){
  g.strokeStyle = INK_SOFT; g.lineWidth = Math.max(1, s * 0.1);
  g.beginPath(); g.moveTo(x, y + s * 0.4); g.lineTo(x, y + s * 0.05); g.stroke();
  g.fillStyle = 'rgba(96,108,64,0.55)';
  g.beginPath(); g.arc(x, y - s * 0.15, s * 0.42 * (0.8 + r() * 0.4), 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK_FAINT; g.lineWidth = 1;
  g.beginPath(); g.arc(x, y - s * 0.15, s * 0.42, 0.4, Math.PI * 1.2); g.stroke();
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
    const spine = [];
    for (let i = 0; i <= 16; i++){
      const t = i / 16;
      spine.push([px(0.52 - Math.sin(t * 2.6) * 0.06 - t * 0.04), py(0.175 + t * 0.44)]);
    }
    for (let i = 0; i < spine.length; i++){
      const [sx, sy] = spine[i];
      for (let k = 0; k < 3; k++){
        inkMountain(g, sx + (k - 1) * 16 + (r() - 0.5) * 10, sy + (r() - 0.5) * 8, 13 + r() * 7, r);
      }
    }
    // the southern range, west–east
    for (let i = 0; i <= 12; i++){
      const t = i / 12;
      const sx = px(0.34 + t * 0.34), sy = py(0.72 + Math.sin(t * 2.4) * 0.025);
      inkMountain(g, sx, sy, 12 + r() * 6, r);
      if (r() > 0.5) inkMountain(g, sx + 8, sy + 10, 9 + r() * 5, r);
    }
    // Mordor's fences — a box of crags opening west
    for (let i = 0; i <= 9; i++){
      const t = i / 9;
      inkMountain(g, px(0.70 + t * 0.20), py(0.635 + Math.sin(t * 2.8) * 0.012), 11 + r() * 5, r);
      inkMountain(g, px(0.70 + t * 0.20), py(0.865), 11 + r() * 5, r);
    }
    for (let i = 0; i <= 5; i++){
      inkMountain(g, px(0.705), py(0.66 + (i / 5) * 0.18), 10 + r() * 5, r);
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

    // rivers
    g.strokeStyle = WATER; g.lineWidth = 3.2; g.lineCap = 'round';
    const river = (pts) => {
      g.beginPath();
      g.moveTo(px(pts[0][0]), py(pts[0][1]));
      for (let i = 1; i < pts.length - 1; i++){
        const xc = (px(pts[i][0]) + px(pts[i + 1][0])) / 2;
        const yc = (py(pts[i][1]) + py(pts[i + 1][1])) / 2;
        g.quadraticCurveTo(px(pts[i][0]), py(pts[i][1]), xc, yc);
      }
      g.stroke();
    };
    river([[0.56, 0.10], [0.585, 0.3], [0.61, 0.45], [0.6, 0.6], [0.63, 0.72], [0.665, 0.86], [0.62, 0.97]]);
    river([[0.44, 0.26], [0.38, 0.3], [0.3, 0.33], [0.2, 0.35], [0.08, 0.38]]);
    river([[0.42, 0.63], [0.5, 0.68], [0.56, 0.73], [0.6, 0.78]]);
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

    // compass rose
    {
      const cx = px(0.09), cy = py(0.83), R = Math.min(W, Hh) * 0.052;
      g.strokeStyle = INK; g.fillStyle = INK;
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++){
        const a = (i / 8) * Math.PI * 2;
        const long = i % 2 === 0;
        const rr = long ? R * 0.95 : R * 0.55;
        g.beginPath();
        g.moveTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr);
        g.lineTo(cx + Math.sin(a + 0.16) * R * 0.14, cy - Math.cos(a + 0.16) * R * 0.14);
        g.lineTo(cx + Math.sin(a - 0.16) * R * 0.14, cy - Math.cos(a - 0.16) * R * 0.14);
        g.closePath();
        if (long) g.fill(); else g.stroke();
      }
      g.font = `600 ${R * 0.42}px Georgia, serif`;
      g.textAlign = 'center';
      g.fillText('N', cx, cy - R * 1.18);
    }

    // scale bar
    g.strokeStyle = INK_SOFT; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(px(0.72), py(0.935)); g.lineTo(px(0.9), py(0.935)); g.stroke();
    for (let i = 0; i <= 3; i++){
      g.beginPath(); g.moveTo(px(0.72 + i * 0.06), py(0.928)); g.lineTo(px(0.72 + i * 0.06), py(0.942)); g.stroke();
    }
    g.fillStyle = INK_SOFT;
    g.font = `italic ${Math.max(9, W * 0.009)}px Georgia, serif`;
    g.fillText('a hundred leagues and more', px(0.81), py(0.958));
  }

  // ---- markers -------------------------------------------------------------
  function buildMarkers(){
    marks.innerHTML = '';
    const current = getCurrent();
    for (const pl of PLACES){
      const region = regions.find(rg => rg.id === pl.id);
      if (!region) continue;
      const b = document.createElement('button');
      b.className = 'mapmark' + (current === pl.id ? ' here' : '');
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
