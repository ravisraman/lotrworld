// Helm's Deep — the Hornburg on its rock, the Deeping Wall across the
// mouth of the gorge, and the night the White Hand came to it. Pre-battle:
// Haldir's Galadhrim and the men of Rohan line the walls; ten thousand
// Uruk-hai stand in their ranks in the Deeping Coomb, pikes slamming the
// ground, torches guttering in the rain, the storm breaking overhead.
//
// Layout follows the films' design: the Hornburg (outer curtain, gatehouse,
// keep with the Horn of Helm, great hall) on a rock spur under the northern
// cliff; a long causeway climbing the face of the rock to the gate; the
// curving Deeping Wall with its culvert where the Deeping Stream runs out;
// the gorge narrowing behind to the Glittering Caves; Helm's Dike far out in
// the coomb; the three peaks of the Thrihyrne above it all.
import * as THREE from 'three';
import { fbm, ridged, mulberry32, smoothstep, clamp, lerp, GLSL_FOG, fogUniforms } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeParticles, makeBanner, makeSmoke, makeWater, makeGrass, scatterRocks } from '../engine/nature.js';
import { Cast, Crowd, makePerson, makeHorse, mat } from '../engine/characters.js';
import { makeGroundMaterial, makeMasonryMaterial, makeTexturedMaterial, texturesReady, setWetness } from '../engine/textures.js';
import { makeTroops, setTroopWetness } from '../engine/army.js';
import { sweep, battlements, texBox, latheTower, mergeUV } from '../engine/fortify.js';

// ------------------------------------------------------------ dimensions --
const Y_B = 31;      // the Hornburg's courtyard, on top of the Hornrock
const Y_TOP = 21;    // walkway of the Deeping Wall
const HR = { cx: 100, cz: -28, rx: 46, rz: 48 };   // the Hornrock (superellipse)
// the great hall, cut into the cliff behind the Hornburg (front at x0)
const HALL = { x0: 143, x1: 186, z0: -46, z1: 6, floor: Y_B + 4, thick: 3 };
const inHall = (x, z, m = 0) => x > HALL.x0 + HALL.thick - m && x < HALL.x1 + 1.5 + m && z > HALL.z0 - 1.5 - m && z < HALL.z1 + 1.5 + m;

// the Deeping Stream, from the caves, out through the culvert, down the coomb
const STREAM = [[4, 470], [-6, 330], [-18, 190], [-26, 80], [-30, 8], [-31, -30],
  [-36, -110], [-30, -210], [-46, -330], [-60, -480], [-44, -680], [-72, -980], [-90, -1300]];
// the old road up the coomb to the causeway foot
const ROAD = [[-120, -1400], [-80, -1000], [-55, -700], [-40, -420], [-30, -250], [-24, -170], [-22, -158]];
// paths in the Deep, wall stairs to the caves
const DEEP_PATH = [[40, 18], [10, 60], [-10, 160], [-4, 300], [6, 440]];

function distToPolyline(pts, x, z){
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++){
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

// The valley's rim. Helm's Deep is a narrow cleft in a colossal mountain
// front; the Deeping Coomb opens out of it as a broad bay whose flanks sweep
// back on both sides (as in the films' establishing shots).
function xL(z){
  // the bay flares from the gorge mouth, then runs on as a broad valley
  const fl = Math.max(0, -25 - z);
  const x = z < -25 ? -118 - 1.8 * Math.min(fl, 360) - 0.22 * Math.max(0, fl - 360) : -118 + 0.16 * Math.max(0, z);
  return x + (fbm(z * 0.011, 3.7, 3) - 0.5) * 30 * (z < -40 ? 1 : 0.3);
}
function xR(z){
  const fl = Math.max(0, -60 - z);
  const x = z < -60 ? 150 + 1.8 * Math.min(fl, 330) + 0.22 * Math.max(0, fl - 330) : (z < 40 ? 150 : 150 - (z - 40) * 0.25);
  return x + (fbm(z * 0.011, 9.1, 3) - 0.5) * 30 * (z < -90 ? 1 : 0.3);
}
// how far a point lies into the mountain (negative: out on the valley floor)
function mountainD(x, z){
  // perpendicular distance past the rim (the rim runs diagonally in the bay)
  const cL = lerp(0.98, 0.486, smoothstep(-5, -45, z) * smoothstep(-410, -360, z));
  const cR = lerp(0.98, 0.486, smoothstep(-40, -80, z) * smoothstep(-415, -365, z));
  let d = Math.max((xL(z) - x) * cL, (x - xR(z)) * cR);
  d = Math.max(d, z - (470 + (fbm(x * 0.02, 2.2, 2) - 0.5) * 40));
  // spurs and gullies, elongated down the fall line, at two scales
  d += (fbm(x * 0.03 + z * 0.012, z * 0.03 - x * 0.012, 4) - 0.5) * 22;
  d += (ridged(x * 0.0065 + z * 0.004, z * 0.016 - x * 0.006, 4) - 0.45) * 90 * smoothstep(-40, 120, d);
  return d;
}
function hornR(x, z){
  const a = Math.abs(x - HR.cx) / HR.rx, b = Math.abs(z - HR.cz) / HR.rz;
  return Math.pow(a ** 4 + b ** 4, 0.25);
}
function hornPoint(theta, inset = 0.93){
  const c = Math.cos(theta), s = Math.sin(theta);
  return [HR.cx + HR.rx * inset * Math.sign(c) * Math.sqrt(Math.abs(c)),
          HR.cz + HR.rz * inset * Math.sign(s) * Math.sqrt(Math.abs(s))];
}
function peak(x, z, cx, cz, r, H){
  const d = Math.hypot(x - cx, z - cz) / r;
  return H * Math.exp(-d * d * 1.3) * (0.8 + ridged(x * 0.008, z * 0.008, 3) * 0.4);
}

function floorH(x, z){
  // a pale gravel fan, rising gently toward the mouth of the Deep
  let h = z < 0 ? 5 + z * 0.012 : 5 + z * 0.03;
  const away = smoothstep(-30, -220, z);
  h += (fbm(x * 0.007 + 3, z * 0.007 + 1, 4) - 0.5) * 3.5 * away;
  h += (fbm(x * 0.06, z * 0.06, 2) - 0.5) * 0.6;
  // Helm's Dike: an earth rampart with its ditch, breached where the host passed
  const dz = z + 690 + Math.sin(x * 0.01) * 12;
  const breach = smoothstep(26, 50, Math.abs(x + 30));
  h += (Math.exp(-dz * dz / 50) * 4.5 - Math.exp(-((dz + 11) ** 2) / 32) * 3) * breach;
  // the stream's bed
  const sd = distToPolyline(STREAM, x, z);
  if (sd < 9) h -= 1.5 * smoothstep(9, 2.5, sd);
  return h;
}

export function heightAt(x, z){
  let h = floorH(x, z);
  const d = mountainD(x, z);
  if (d > -25){
    // sheer rock in the cleft itself; steep tussock and scree out in the bay
    // sheer only around the cleft itself, fading out along the mountain front
    const sheer = smoothstep(-120, -20, z) * (1 - smoothstep(240, 520, Math.abs(x - 16)));
    const talus = smoothstep(-25, 0, d) * 6 * (0.6 + fbm(x * 0.05, z * 0.05, 2));
    // a sheer rock wall only for the first stretch of the cleft's sides; the
    // mountain above and around climbs at a steady ~40°
    // (out in the bay the same rise comes gradually, so the range has no step)
    let cliff = 230 * (Math.pow(smoothstep(-1, 30, d), 0.8) * sheer + smoothstep(30, 420, d) * (1 - sheer));
    const q = 13, f = cliff / q;   // ledges on the cliff
    cliff = lerp(cliff, (Math.floor(f) + smoothstep(0.35, 1, f - Math.floor(f))) * q, 0.5 * smoothstep(0, 20, d));
    // concave mountain profile: steep from the valley floor, easing toward
    // crests whose height wanders along the range
    const H = 1050 * (0.62 + 0.7 * fbm(x * 0.0011 + 3, z * 0.0011 - 2, 3));
    const t = clamp(d / 2400, 0, 1);      // ~35–44° at the foot, easing above
    const slope = H * (1 - Math.pow(1 - t, 1.6)) + smoothstep(-6, 40, d) * 6;
    const face = cliff + slope;
    const crag = ridged((x * 0.8 + z * 0.6) * 0.0055 + 7, (z * 0.8 - x * 0.6) * 0.0055, 5) * 70 * smoothstep(80, 600, d);   // rotated: no grid-aligned crags
    const high = 0;
    // the mountains fall away where the coomb opens onto the Westfold
    h += (talus + face + crag + high) * lerp(0.15, 1, smoothstep(-2600, -1400, z));
  }
  // the Thrihyrne, three horns above the Deep
  h += peak(x, z, -60, 1350, 260, 900) + peak(x, z, 230, 1520, 240, 840) + peak(x, z, -330, 1460, 240, 820);
  // the Hornrock
  const hr = hornR(x, z);
  if (hr < 1.25){
    const k = smoothstep(1.17, 0.98, hr + (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 0.07);
    h = Math.max(h, lerp(h, Y_B, k));
    if (hr < 0.97) h = Y_B;
  }
  // the rock is hollowed for the great hall: a shelf just above its roof
  if (inHall(x, z, 10)){
    const shelf = HALL.floor + 25.6;
    // distance outside the hall's footprint; the shelf blends out over 10 m
    const ex = Math.max(HALL.x0 + HALL.thick - x, x - HALL.x1 - 1.5, 0);
    const ez = Math.max(HALL.z0 - 1.5 - z, z - HALL.z1 - 1.5, 0);
    const k = smoothstep(10, 0, Math.hypot(ex, ez));
    // inside the footprint the ground is exactly the roof shelf (never between
    // floor and ceiling); outside it only comes down to meet it
    if (k >= 1) h = shelf; else if (h > shelf) h = lerp(h, shelf, k);
  }
  return h;
}

// --------------------------------------------------------------- terrain --
function buildTerrain(size, res, cx, cz, ground, sinkInner){
  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const N = pos.count;
  for (let i = 0; i < N; i++){
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    let y = heightAt(x, z);
    // the coarse outer ground is dropped well below wherever the fine terrain
    // covers it, so its long triangles can never cut through anything
    if (sinkInner && sinkInner(x, z)) y -= 400;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const col = new Float32Array(N * 3), w = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    const n1 = fbm(x * 0.02 + 4, z * 0.02, 3), n2 = fbm(x * 0.004, z * 0.004, 3);
    const md = mountainD(x, z);
    // rock on the steep faces and high crags; scree bands lower down
    let rock = smoothstep(0.3, 0.46, slope + (n1 - 0.5) * 0.16);
    rock = Math.max(rock, smoothstep(260, 520, y) * 0.8);
    rock = Math.max(rock, smoothstep(0.62, 0.78, fbm(x * 0.012, z * 0.03, 3)) * smoothstep(5, 40, md) * 0.9);
    // the coomb floor: pale river gravel
    let trail = smoothstep(-2, -14, md) * 0.92;
    const td = Math.min(distToPolyline(ROAD, x, z), distToPolyline(DEEP_PATH, x, z));
    trail = Math.max(trail, smoothstep(7, 2.5, td + (n1 - 0.5) * 3));
    if (hornR(x, z) < 0.97) trail = 0.85;   // the paved courtyard
    // trampled mud where the host stands, under the walls and on the banks
    let mud = 0;
    if (z < -70 && z > -460) mud = smoothstep(-70, -110, z) * smoothstep(-460, -380, z) * 0.45;
    mud = Math.max(mud, smoothstep(40, 0, Math.abs(z + 12)) * 0.5);         // the wall's foot
    const sd = distToPolyline(STREAM, x, z);
    mud = Math.max(mud, smoothstep(10, 3, sd));
    mud *= (0.6 + n1 * 0.6) * smoothstep(10, -5, md);
    mud *= 1 - rock; trail *= 1 - rock;
    trail = Math.min(trail, 1 - rock - mud);
    w[i * 3] = rock; w[i * 3 + 1] = mud; w[i * 3 + 2] = Math.max(0, trail);
    // tint (0.5 = neutral): tawny tussock on the slopes, pale grey gravel,
    // cold grey rock, snow on the high crags
    let r = 0.5, g = 0.5, b = 0.5;
    r *= 0.98 + n2 * 0.2; g *= 0.9 + n2 * 0.08; b *= 0.72;
    const fl = smoothstep(-2, -14, md);
    // pale river gravel, patchy: darker damp hollows and old channel beds
    const pg = 0.4 + fbm(x * 0.012 + 9, z * 0.012, 4) * 0.2 - smoothstep(0.6, 0.75, fbm(x * 0.004, z * 0.02 + 3, 3)) * 0.08;
    r = lerp(r, pg, fl); g = lerp(g, pg * 1.01, fl); b = lerp(b, pg * 0.98, fl);
    // the scanned mud is red-brown; the film's wet ground is grey
    r = lerp(r, r * 0.82, mud); b = lerp(b, b * 1.12, mud);
    const rk = 0.44 + n1 * 0.16;
    r = lerp(r, rk * 1.0, rock); g = lerp(g, rk * 1.02, rock); b = lerp(b, rk * 1.05, rock);
    const snow = smoothstep(620, 820, y + (n1 - 0.5) * 140) * (1 - smoothstep(0.55, 0.8, slope));
    r = lerp(r, 1.25, snow); g = lerp(g, 1.28, snow); b = lerp(b, 1.36, snow);
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aW', new THREE.BufferAttribute(w, 3));
  const mesh = new THREE.Mesh(geo, ground);
  mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------ the gate ----
// The great doors are carved in rows of hooked, fang-like motifs (as in the
// films); painted into a canvas so the leaves read at a glance.
let DOOR_MAT = null;
function doorCarving(){
  if (DOOR_MAT) return DOOR_MAT;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 640;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#2c2016'); grd.addColorStop(0.5, '#3e2e1f'); grd.addColorStop(1, '#2a1f15');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 640);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
  for (let x = 32; x < 256; x += 32){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 640); g.stroke(); }   // planks
  g.strokeStyle = '#1a120c'; g.lineWidth = 10; g.strokeRect(10, 10, 236, 620);
  // rows of carved hooks: a light ridge over a dark cut gives relief
  for (let row = 0; row < 7; row++){
    const y = 70 + row * 82;
    for (let col = 0; col < 3; col++){
      const x = 52 + col * 76;
      for (const [c, o] of [['#120c08', 3], ['#6e5538', 0]]){
        g.strokeStyle = c; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 22 + o, y - 22 + o); g.lineTo(x - 22 + o, y + 10 + o);
        g.quadraticCurveTo(x - 22 + o, y + 30 + o, x + o, y + 30 + o);
        g.moveTo(x + 22 + o, y - 22 + o); g.lineTo(x + 22 + o, y + 10 + o);
        g.quadraticCurveTo(x + 22 + o, y + 30 + o, x + o, y + 30 + o);
        g.moveTo(x + o, y - 26 + o); g.lineTo(x + o, y + 12 + o);
        g.stroke();
      }
    }
    g.fillStyle = '#20160e'; g.fillRect(14, y + 44, 228, 8);   // iron band between rows
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  DOOR_MAT = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  return DOOR_MAT;
}

// ------------------------------------------------------------- flames ----
// Torch and brazier fire as flickering additive sprites.
function makeFlames(scene, pts, o = {}){
  const N = pts.length;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N), size = new Float32Array(N);
  pts.forEach((p, i) => {
    pos.set([p[0], p[1], p[2]], i * 3);
    seed[i] = (i * 0.6180339) % 1 * 6.28;
    size[i] = p[3] || 1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const uniforms = Object.assign({ uTime: { value: 0 }, uSize: { value: o.size || 1.2 }, uBright: { value: 1 } }, fogUniforms(scene));
  const m = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uSize;
      attribute float aSeed, aSize;
      varying float vF; varying float vDist;
      void main(){
        float f = 0.78 + 0.16 * sin(uTime * 13.0 + aSeed * 7.0) + 0.1 * sin(uTime * 29.0 + aSeed * 3.0);
        vF = f;
        vec3 p = position;
        p.y += 0.06 * sin(uTime * 17.0 + aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(uSize * aSize * f * (300.0 / max(vDist, 0.5)), 3.5, 90.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_FOG}
      uniform float uBright;
      varying float vF; varying float vDist;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        q.y *= 0.8;
        float d = length(q);
        float core = smoothstep(0.22, 0.0, d);
        float halo = smoothstep(0.5, 0.05, d);
        vec3 col = vec3(1.0, 0.42, 0.1) * halo * 0.9 + vec3(1.0, 0.82, 0.5) * core * 1.6;
        float fogK = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist * 0.45);
        col *= (1.0 - fogK * 0.85) * vF * uBright;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const p = new THREE.Points(geo, m);
  p.frustumCulled = false;
  return { mesh: p, uniforms, update(t){ uniforms.uTime.value = t; } };
}

// a jagged lightning bolt ribbon (two crossed strips)
function makeBolt(rand){
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < 18; i++){ pts.push([x, y]); y -= 30 + rand() * 30; x += (rand() - 0.5) * 70; }
  const geos = [];
  for (const rot of [0, Math.PI / 2]){
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++){
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const w0 = 5 * (1 - i / pts.length) + 1.5, w1 = 5 * (1 - (i + 1) / pts.length) + 1.5;
      pos.push(x0 - w0, y0, 0, x0 + w0, y0, 0, x1 + w1, y1, 0, x0 - w0, y0, 0, x1 + w1, y1, 0, x1 - w1, y1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.rotateY(rot);
    geos.push(g);
  }
  const g = mergeUV(geos.map(x => { x.computeVertexNormals(); return x; }));
  const m = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(g, m);
}

export default {
  id: 'helmsdeep', name: "Helm's Deep", subtitle: 'The Hornburg, on the night of the storm',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x3a404c, 0.0012);
    const rand = mulberry32(3002);
    const updates = [];
    const camera = ctx.camera;

    // ---- ground ---------------------------------------------------------
    const ground = makeGroundMaterial();
    const INNER = { size: 1500, res: 620, cx: 0, cz: -260 };
    const inner = buildTerrain(INNER.size, INNER.res, INNER.cx, INNER.cz, ground, null);
    scene.add(inner);
    const half = INNER.size / 2 - 14;
    const outer = buildTerrain(7200, 300, 0, -400, ground,
      (x, z) => Math.abs(x - INNER.cx) < half && Math.abs(z - INNER.cz) < half);
    scene.add(outer);

    // ---- sky, light, weather -------------------------------------------
    const sunDir = new THREE.Vector3(-0.7, 0.42, -0.55).normalize();   // the last light, low over the coomb's southern rim
    const sky = makeSky({
      zenith: 0x1a2130, horizon: 0x8a5a44, ground: 0x2a2a2c,
      sunDir, sunColor: 0xff9a60, sunSize: 0.012, sunHalo: 0.55, sunIntensity: 0.55,
      cloudColor: 0x4a4e58, cloudShadow: 0x141619, cloudCover: 0.78, cloudSharp: 0.7,
      cloudScale: 1.6, cloudSpeed: 0.02, haze: 0.75, stars: 0,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    // distant ranges, painted in the fog's own colour so the far ground
    // dissolves into them; tinted with the mood in applyMood()
    const backdrop = makeMountainBackdrop([
      { dist: 4600, height: 1500, color: 0x565d6a, jag: 3.4, seed: 211 },
      { dist: 4100, height: 900, color: 0x4b525f, jag: 3.0, seed: 212, gap: [Math.PI * 1.32, Math.PI * 1.68] },
    ]);
    scene.add(backdrop);
    const ringCols = [[0x5e656d, 0x13232e], [0x545b64, 0x0f1d27]];

    const hemi = new THREE.HemisphereLight(0x6f7f9a, 0x2e2a24, 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xff9e70, 1.4);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const sc = key.shadow.camera;
    sc.left = -240; sc.right = 240; sc.top = 240; sc.bottom = -240; sc.near = 10; sc.far = 1600;
    key.shadow.bias = -0.0004;
    key.target.position.set(0, 0, -60);
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x8ea6d0, 0.3);
    fill.position.set(200, 400, 300);
    scene.add(fill);
    const flash = new THREE.DirectionalLight(0xdfe8ff, 0);
    flash.position.set(-300, 700, -900);
    scene.add(flash);

    // ---- masonry ---------------------------------------------------------
    // the films' stone is pale grey-green; the scanned set is darker, so lift it
    const wallM = makeMasonryMaterial({ color: 0xbcb9b0, groundY: 5, key: 'wall' });
    const burgM = makeMasonryMaterial({ color: 0xc2beb4, groundY: Y_B - 2, key: 'burg', damp: 0.35 });
    wallM.color.setRGB(1.45, 1.55, 1.42);
    burgM.color.setRGB(1.5, 1.6, 1.46);
    const darkM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
    const ironM = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.85 });
    const gateM = makeTexturedMaterial('medieval_wood', { color: 0x9a8a78 });
    const plankM = makeTexturedMaterial('weathered_planks', { color: 0x8a8070 });
    const addMesh = (geo, m, shadow = true) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    // ---- the Deeping Wall ----------------------------------------------
    // runs from the Hornrock's flank to the southern cliff, bowing out
    // into the coomb; front (coomb) is to the right of travel.
    const WALL_PATH = [[52, -4], [26, -14], [-4, -20], [-34, -21], [-66, -16], [-98, -6], [-122, 5], [-140, 12]];
    const wallProfile = [
      { u: 3.6, ground: true, dy: -1.5 },
      { u: 2.2, y: 3.5 }, { u: 1.0, y: 6.5 }, { u: 0.3, y: 9.5 }, { u: 0.0, y: 12 },
      { u: 0.0, y: Y_TOP - 0.9 }, { u: 0.25, y: Y_TOP - 0.6 }, { u: 0.25, y: Y_TOP + 1.0 },
      { u: -0.9, y: Y_TOP + 1.0 }, { u: -0.9, y: Y_TOP },
      { u: -7.6, y: Y_TOP }, { u: -7.6, y: Y_TOP - 0.3 }, { u: -8.2, y: Y_TOP - 0.3 },
      { u: -8.2, ground: true, dy: -1.5 },
    ];
    const deeping = sweep(WALL_PATH, wallProfile, { heightAt, step: 1.5, tile: 5.5 });
    addMesh(deeping.geo, wallM);
    const WP = deeping.path;
    // where the stream passes under: the culvert
    let tCulvert = 0.5;
    { let best = 1e9;
      for (let i = 0; i <= 400; i++){ const p = WP.at(i / 400); const d = Math.abs(p.x + 31); if (d < best){ best = d; tCulvert = i / 400; } } }
    addMesh(mergeUV(battlements(WP, { u: -0.33, y: () => Y_TOP + 1.0, w: 1.2, h: 0.9, d: 1.2, spacing: 2.5 })), wallM);
    // shallow buttress strips down the face, as on the film's wall
    addMesh(mergeUV(battlements(WP, { u: 0.3, y: () => 9.6, w: 1.7, h: Y_TOP - 0.9 - 9.6, d: 0.7, spacing: 9.5, tile: 5 })), wallM);
    // rear stairs down into the Deep
    const stairGeos = [];
    for (const ts of [0.22, 0.55, 0.84]){
      const f = deeping.frame(ts);
      const steps = 30;
      for (let i = 0; i < steps; i++){
        const along = (i + 0.5) * 0.62;
        const y = Y_TOP - (i + 1) * 0.52;
        const g = texBox(0.66, Y_TOP - (i * 0.52) - 2, 2.6, 3);
        const ang = Math.atan2(f.tangent.x, f.tangent.z) + Math.PI / 2;
        g.rotateY(ang);
        const x = f.p.x - f.right.x * 9.5 + f.tangent.x * along, z = f.p.z - f.right.z * 9.5 + f.tangent.z * along;
        g.translate(x, (y + 2 + 1) / 2 + 0.5, z);
        stairGeos.push(g);
      }
    }
    addMesh(mergeUV(stairGeos), wallM);
    // the culvert: a vaulted portal at the foot of the wall, barred with iron
    {
      const f = deeping.frame(tCulvert);
      const g = new THREE.Group();
      const yb = heightAt(f.p.x + f.right.x * 2, f.p.z + f.right.z * 2) - 1;
      g.position.set(f.p.x + f.right.x * 2.6, yb, f.p.z + f.right.z * 2.6);
      g.rotation.y = Math.atan2(f.right.x, f.right.z);
      const portal = new THREE.Mesh(mergeUV([
        texBox(2.2, 8, 3.2, 4).translate(-3.6, 4, 0),
        texBox(2.2, 8, 3.2, 4).translate(3.6, 4, 0),
        texBox(9.4, 2.6, 3.2, 4).translate(0, 8.6, 0),
      ]), wallM);
      portal.castShadow = portal.receiveShadow = true;
      g.add(portal);
      // vault mouth (dark) with a round head
      const mouth = new THREE.Shape();
      mouth.moveTo(-2.5, 0); mouth.lineTo(2.5, 0); mouth.lineTo(2.5, 4.6);
      mouth.absarc(0, 4.6, 2.5, 0, Math.PI, false); mouth.lineTo(-2.5, 0);
      const mouthM = new THREE.Mesh(new THREE.ShapeGeometry(mouth), darkM);
      mouthM.position.z = 0.4;
      g.add(mouthM);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.35, 6, 18, Math.PI), wallM);
      ring.position.set(0, 4.6, 1.5);
      g.add(ring);
      for (let i = -4; i <= 4; i++){
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.8, 6), ironM);
        bar.position.set(i * 0.55, 3.4, 1.45);
        bar.castShadow = true;
        g.add(bar);
      }
      for (const yy of [1.6, 4.2]){
        const rail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 0.12), ironM);
        rail.position.set(0, yy, 1.45);
        g.add(rail);
      }
      scene.add(g);
    }
    // stairs cut into the Hornrock, from the wall-walk up to the Hornburg
    {
      const geos = [];
      for (let i = 0; i < 20; i++){
        const g = texBox(2.4, 0.5 + i * 0.5, 0.7, 3);
        g.translate(55 + i * 0.3, Y_TOP + (i * 0.5 + 0.5) / 2, 1 + i * 0.66);
        geos.push(g);
      }
      addMesh(mergeUV(geos), burgM);
    }

    // ---- the Hornburg -----------------------------------------------------
    // Following the films: a curtain of great ashlar blocks with square
    // towers and heavy merlons, the gate on the far side from the Deeping
    // Wall, a round inner ward, the great hall's arcaded front cut into the
    // cliff behind, and the tall buttressed keep rising where the Deeping
    // Wall meets the rock.
    const DEG = Math.PI / 180;
    const gateTheta = 304 * DEG;
    const arc = (a0, a1, n = 26, inset = 0.93) => {
      const out = [];
      for (let i = 0; i <= n; i++) out.push(hornPoint(lerp(a0, a1, i / n), inset));
      return out;
    };
    const curtainProfile = [
      { u: 2.2, ground: true, dy: -7 },
      { u: 0.9, y: Y_B + 1 }, { u: 0.0, y: Y_B + 4 },
      { u: 0.0, y: Y_B + 8.4 }, { u: 0.3, y: Y_B + 8.7 }, { u: 0.3, y: Y_B + 10.3 },
      { u: -1.1, y: Y_B + 10.3 }, { u: -1.1, y: Y_B + 9 },
      { u: -6.2, y: Y_B + 9 }, { u: -6.2, y: Y_B - 1 },
    ];
    // two runs either side of the gate; the near end buried in the cliff
    const runA = arc(346 * DEG, gateTheta + 6.5 * DEG, 10); runA.unshift([162, -50]);
    const runB = arc(gateTheta - 6.5 * DEG, 172 * DEG, 30);
    const curtainRuns = [];
    for (const run of [runA, runB]){
      const sw = sweep(run, curtainProfile, { heightAt, step: 1.5, tile: 5.5 });
      addMesh(sw.geo, burgM);
      addMesh(mergeUV(battlements(sw.path, { u: -0.4, y: () => Y_B + 10.3, w: 1.9, h: 1.3, d: 1.4, spacing: 3.2, cap: 0.55 })), burgM);
      curtainRuns.push(sw);
      // arrow slits down the outer face (one merged mesh per run)
      const n = Math.floor(sw.path.length / 7.5), slits = [];
      for (let i = 1; i < n; i++){
        const f = sw.frame(i / n);
        slits.push(new THREE.PlaneGeometry(0.45, 2.4).rotateY(Math.atan2(f.right.x, f.right.z))
          .translate(f.p.x + f.right.x * 0.03, Y_B + 5.6 + (i % 2) * 0.6, f.p.z + f.right.z * 0.03));
      }
      if (slits.length) scene.add(new THREE.Mesh(mergeUV(slits), darkM));
    }
    // square towers standing out from the front of the curtain
    {
      const geos = [];
      for (const th of [278, 246, 212, 184]){
        const [tx, tz] = hornPoint(th * DEG, 0.95);
        const t = texBox(11, Y_B + 16 - 4, 11, 5.5);
        t.translate(0, (Y_B + 16 + 4) / 2, 0);
        const parts = [t];
        for (let i = 0; i < 3; i++) for (const s2 of [-1, 1]){
          parts.push(texBox(2.2, 1.6, 1.2, 4).translate(-3.6 + i * 3.6, Y_B + 16.8, s2 * 4.9));
          parts.push(texBox(1.2, 1.6, 2.2, 4).translate(s2 * 4.9, Y_B + 16.8, -3.6 + i * 3.6));
        }
        const g = mergeUV(parts);
        g.rotateY(-Math.atan2(tz - HR.cz, tx - HR.cx));
        g.translate(tx, 0, tz);
        geos.push(g);
      }
      addMesh(mergeUV(geos), burgM);
    }
    // lower wall on the Deep side of the rock
    const backProfile = [
      { u: 1.5, ground: true, dy: -6 }, { u: 0, y: Y_B + 2 }, { u: 0, y: Y_B + 6 },
      { u: -0.8, y: Y_B + 6 }, { u: -0.8, y: Y_B + 5 }, { u: -3.2, y: Y_B + 5 }, { u: -3.2, y: Y_B - 1 },
    ];
    const backRun = arc(160 * DEG, 18 * DEG, 24);
    backRun.push([158, -6]);
    const backSw = sweep(backRun, backProfile, { heightAt, step: 1.5, tile: 5.5 });
    addMesh(backSw.geo, burgM);
    addMesh(mergeUV(battlements(backSw.path, { u: -0.3, y: () => Y_B + 6, w: 1.5, h: 1.2, d: 1.0, spacing: 2.8 })), burgM);

    // the round inner ward
    {
      const ring = new THREE.Mesh(latheTower([[15.5, Y_B - 1], [15.5, Y_B + 7.5], [13, Y_B + 7.5], [13, Y_B - 1]], 28, 5.5), burgM);
      ring.position.set(104, 0, -30);
      ring.castShadow = ring.receiveShadow = true;
      scene.add(ring);
      const geos = [];
      for (let i = 0; i < 18; i++){
        const a = (i / 18) * Math.PI * 2;
        if (Math.abs(a - Math.PI) < 0.25) continue;   // the ward's gate faces the curtain gate
        const g = texBox(1.8, 1.3, 2.5, 4);
        g.rotateY(-a);
        g.translate(104 + Math.cos(a) * 14.25, Y_B + 8.15, -30 + Math.sin(a) * 14.25);
        geos.push(g);
      }
      addMesh(mergeUV(geos), burgM);
    }

    const hallLight = { torches: [], shaftM: null, patchM: null };
    // the great hall: an arcaded front built into the cliff at the back, and
    // behind it the hall itself — piers and arches, light falling in shafts
    // from the high windows, torches, trestle tables (after the films' set)
    {
      const { x0: HX, x1: HXB, z0, z1 } = HALL;
      const W = z1 - z0, zc = (z0 + z1) / 2, F = HALL.floor;
      const parts = [];
      parts.push(texBox(10, 4, W + 8, 5).translate(HX - 5, Y_B + 2, zc));            // the upper courtyard terrace
      for (let i = 0; i < 8; i++) parts.push(texBox(1.2, 0.5, 12, 3).translate(HX - 10.6 - i * 1.2, Y_B + 0.25 + (7 - i) * 0.5, zc));
      for (const sz of [-1, 1]) parts.push(texBox(3.2, 3, 3.2, 4).translate(HX - 8.2, F + 1.5, zc + sz * 8.5));   // statue plinths
      parts.push(texBox(1.4, 1.2, W + 2, 4).translate(HX - 0.6, F + 24.4, zc));       // cornice
      parts.push(texBox(1.1, 0.8, W + 1, 4).translate(HX - 0.4, F + 14.6, zc));       // string course
      const fm = new THREE.Mesh(mergeUV(parts), burgM);
      fm.castShadow = fm.receiveShadow = true;
      scene.add(fm);
      // the front itself: one slab with real openings, so the hall is enterable
      const arch = (cx, w, y0, h) => {
        const p = new THREE.Path();
        p.moveTo(cx - w / 2, y0); p.lineTo(cx + w / 2, y0); p.lineTo(cx + w / 2, y0 + h - w / 2);
        p.absarc(cx, y0 + h - w / 2, w / 2, 0, Math.PI, false); p.lineTo(cx - w / 2, y0);
        return p;
      };
      const front = new THREE.Shape();
      front.moveTo(z0, -0.6); front.lineTo(z1, -0.6); front.lineTo(z1, 24); front.lineTo(z0, 24); front.lineTo(z0, -0.6);
      const bay = (W - 6) / 5;
      for (let i = 0; i < 5; i++) front.holes.push(arch(z0 + 3 + (i + 0.5) * bay, 6.2, 0, 10));
      const winZ = [];
      for (let i = 0; i < 12; i++){ const wz = z0 + 3 + (i + 0.5) * (W - 6) / 12; winZ.push(wz); front.holes.push(arch(wz, 1.7, 16.2, 3.6)); }
      const fg = new THREE.ExtrudeGeometry(front, { depth: HALL.thick, bevelEnabled: false, curveSegments: 10 });
      const fuv = fg.attributes.uv;
      for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) / 5.5, fuv.getY(i) / 5.5);
      fg.rotateY(-Math.PI / 2);          // shape x → world z, extrusion → world −x
      fg.translate(HX + HALL.thick, F, 0);
      const fmesh = new THREE.Mesh(fg, burgM);
      fmesh.castShadow = fmesh.receiveShadow = true;
      scene.add(fmesh);

      // the hall: closed box of dim stone, the floor worn flags
      const hallM = makeMasonryMaterial({ color: 0x9c9890, groundY: F, key: 'hallin', streak: 0.2, damp: 0.25 });
      hallM.color.setRGB(0.42, 0.44, 0.43);   // indoors: no sky reaches these walls
      hallM.normalScale.set(0.45, 0.45);
      const inX = HX + HALL.thick, D = HXB - inX, xc = (inX + HXB) / 2, H = 24;
      const shell = [];
      shell.push(texBox(D, 1, W, 4).translate(xc, F - 0.5, zc));                    // floor
      shell.push(texBox(D, 1.5, W, 5).translate(xc, F + H + 0.75, zc));             // ceiling
      shell.push(texBox(1.5, H, W, 5).translate(HXB + 0.75, F + H / 2, zc));        // back wall
      for (const sz of [-1, 1]) shell.push(texBox(D, H, 1.5, 5).translate(xc, F + H / 2, zc + sz * (W / 2 + 0.75)));
      // two arcades of square piers dividing nave from aisles
      const piers = [];
      for (const px of [inX + D * 0.3, inX + D * 0.72]){
        for (let i = 0; i <= 5; i++){
          const pz = z0 + 4 + i * (W - 8) / 5;
          piers.push([px, pz]);
          shell.push(texBox(2.4, 13, 2.4, 4).translate(px, F + 6.5, pz));
          shell.push(texBox(3.2, 0.8, 3.2, 4).translate(px, F + 13.4, pz));
          if (i < 5){
            const span = (W - 8) / 5;
            const ar = new THREE.TorusGeometry(span / 2, 0.9, 6, 14, Math.PI).rotateY(Math.PI / 2);
            ar.translate(px, F + 13.8, pz + span / 2);
            shell.push(ar);
            shell.push(texBox(2.0, H - 18, span, 5).translate(px, F + 18 + (H - 18) / 2, pz + span / 2));
          }
        }
      }
      for (let i = 0; i < 7; i++) shell.push(texBox(D, 0.8, 0.9, 3).translate(xc, F + H - 0.4, z0 + 2 + i * (W - 4) / 6));   // roof beams
      const hm = new THREE.Mesh(mergeUV(shell), hallM);
      hm.castShadow = hm.receiveShadow = true;
      scene.add(hm);

      // shafts of daylight from the high windows
      const shaftM = new THREE.ShaderMaterial({
        uniforms: { uOp: { value: 0.09 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uOp; varying vec2 vUv;
          void main(){
            float edge = pow(sin(vUv.x * 3.14159), 2.0);
            float fall = smoothstep(0.0, 0.08, vUv.y) * (0.45 + 0.55 * vUv.y);
            gl_FragColor = vec4(vec3(0.62, 0.78, 0.95) * edge * fall * uOp, 1.0);
          }`,
      });
      hallLight.shaftM = shaftM;
      const pc = document.createElement('canvas'); pc.width = pc.height = 64;
      { const g = pc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
      const patchM = new THREE.MeshBasicMaterial({ color: 0x9ab8d0, map: new THREE.CanvasTexture(pc), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      hallLight.patchM = patchM;
      for (const wz of winZ.filter((_, i) => i % 3 === 1)){
        const from = new THREE.Vector3(inX, F + 18, wz), to = new THREE.Vector3(inX + 20, F + 0.05, wz + 5);
        const len = from.distanceTo(to);
        for (const rot of [0, Math.PI / 2]){
          const g = new THREE.PlaneGeometry(3.4, len).rotateY(rot);
          const m = new THREE.Mesh(g, shaftM);
          m.position.copy(from).lerp(to, 0.5);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
          scene.add(m);
        }
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.6).rotateX(-Math.PI / 2), patchM);
        pm.position.copy(to).add(new THREE.Vector3(0, 0.03, 0));
        scene.add(pm);
      }
      // torches on the piers, and a few lights to make them count
      for (const [k, [px, pz]] of piers.entries()){
        if (k % 2) continue;
        const sx = px < xc ? 1.3 : -1.3;
        hallLight.torches.push([px + sx, F + 7.4, pz, 1.4]);
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.6, 6), ironM);
        br.position.set(px + sx, F + 6.9, pz);
        scene.add(br);
      }
      for (const [px, pz] of [[xc, zc - 12], [xc, zc + 12], [inX + 6, zc]]){
        const pl = new THREE.PointLight(0xffa050, 260, 30, 2);
        pl.position.set(px, F + 8, pz);
        scene.add(pl);
      }
      // trestle tables, benches, barrels and crates
      const wood = mat(0x4a3826, { roughness: 0.85 });
      const furn = [];
      const r3 = mulberry32(808);
      for (let i = 0; i < 6; i++){
        const tx = xc + (r3() - 0.5) * 12, tz = z0 + 8 + i * (W - 16) / 5, ry = (r3() - 0.5) * 0.4;
        const t = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 5.2), wood); top.position.y = 0.95; t.add(top);
        for (const [lx, lz] of [[-0.8, -2.2], [0.8, -2.2], [-0.8, 2.2], [0.8, 2.2]]){
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), wood); leg.position.set(lx, 0.45, lz); t.add(leg);
        }
        for (const bx of [-1.5, 1.5]){
          const bench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 4.4), wood); bench.position.set(bx, 0.25, 0); t.add(bench);
        }
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 6), mat(0x8a7a50, { metalness: 0.6, roughness: 0.4 }));
        cup.position.set(0.3, 1.09, 0.6); t.add(cup);
        t.position.set(tx, F, tz); t.rotation.y = ry;
        furn.push(t);
      }
      for (let i = 0; i < 12; i++){
        const near = i % 2 ? z0 + 2 + r3() * 3 : z1 - 2 - r3() * 3;
        const o = i % 3 === 0
          ? new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), wood)
          : new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12), mat(0x5a4028, { roughness: 0.8 }));
        o.position.set(inX + 3 + r3() * (D - 6), F + 0.55, near);
        furn.push(o);
      }
      for (const f of furn){ f.traverse(o => { o.castShadow = o.receiveShadow = true; }); scene.add(f); }

      // two kings in stone flank the stair to the hall
      const stoneM = new THREE.MeshStandardMaterial({ color: 0x62645e, roughness: 0.95 });
      for (const [sz, cfg] of [[-1, { prop: 'sword', beard: 0.9, cloak: 0x888888 }], [1, { prop: 'spear', beard: 0.7, helm: 'rohan' }]]){
        const king = makePerson(Object.assign({ height: 1.8, hairLen: 0.6, pose: 'guard' }, cfg));
        king.traverse(o => { if (o.isMesh) o.material = o.material.transparent ? o.material : stoneM; });
        king.scale.setScalar(2.9);
        king.position.set(HX - 8.2, F + 3, zc + sz * 8.5);
        king.rotation.y = -Math.PI / 2;
        scene.add(king);
      }
    }

    // gatehouse
    const [gx, gz] = hornPoint(gateTheta);
    const gn = (() => { // outward normal of the superellipse at the gate
      const dx = gx - HR.cx, dz = gz - HR.cz;
      const v = new THREE.Vector3(4 * dx ** 3 / HR.rx ** 4, 0, 4 * dz ** 3 / HR.rz ** 4);
      return v.normalize();
    })();
    const gt = new THREE.Vector3(-gn.z, 0, gn.x);  // along the wall
    const gate = new THREE.Group();
    gate.position.set(gx, Y_B, gz);
    gate.rotation.y = Math.atan2(gn.x, gn.z);      // local +z = outward
    {
      const parts = [];
      for (const s of [-1, 1]){
        parts.push(texBox(7, 26, 8.5, 5.5).translate(s * 6.6, 26 / 2 - 8, 0.8));
        for (let i = 0; i < 3; i++) for (const zz of [-3.6, 4.2]){
          parts.push(texBox(1.8, 1.5, 1.2, 4).translate(s * 6.6 - 2.4 + i * 2.4, 18.75, zz + 0.8));
        }
      }
      parts.push(texBox(6.4, 7.5, 8.5, 5.5).translate(0, 7.8 + 7.5 / 2, 0.8));   // over the gate passage
      parts.push(texBox(20.4, 0.6, 9.4, 5).translate(0, 18, 0.8));                // tower-top platform
      const gm = new THREE.Mesh(mergeUV(parts), burgM);
      gm.castShadow = gm.receiveShadow = true;
      gate.add(gm);
      const passage = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 7.8), darkM);
      passage.position.set(0, 3.9, -2.2);
      gate.add(passage);
      // the great doors, iron-banded timber
      for (const s of [-1, 1]){
        const door = new THREE.Mesh(texBox(3.1, 7.6, 0.45, 3.5), gateM);
        door.position.set(s * 1.56, 3.8, 3.6);
        door.castShadow = door.receiveShadow = true;
        gate.add(door);
        const carve = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 7.4), doorCarving());
        carve.position.set(s * 1.56, 3.8, 3.84);
        gate.add(carve);
      }
      // threshold arch moulding
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.4, 6, 16, Math.PI), burgM);
      arch.position.set(0, 7.8, 5.1);
      arch.scale.y = 0.35;
      gate.add(arch);
    }
    scene.add(gate);

    // the keep: a tall, buttressed square tower narrowing in stages to a spire
    const KEEP = { x: 68, z: -14 };
    const KEEP_GALLERY = Y_B + 78;
    const KS = 1.4;   // horizontal scale of the keep
    {
      const P = [];
      const at = (g, x, y, z) => { g.translate(KEEP.x + x, y, KEEP.z + z); P.push(g); };
      at(texBox(13, 56, 13, 5.5), 0, Y_B + 24, 0);                         // stage one
      for (const sx of [-1, 1]) for (const sz of [-1, 1]){
        at(texBox(3.6, 62, 3.6, 5.5), sx * 6.4, Y_B + 27, sz * 6.4);        // corner buttresses
        const cap = new THREE.ConeGeometry(2.6, 4, 4).rotateY(Math.PI / 4);
        at(cap, sx * 6.4, Y_B + 60, sz * 6.4);
      }
      for (const f of [0, 1, 2, 3]){                                         // ribs on each face
        for (const o of [-2.4, 2.4]){
          const g = texBox(1.1, 50, 0.7, 5);
          g.translate(o, 0, 6.75);
          g.rotateY(f * Math.PI / 2);
          at(g, 0, Y_B + 25, 0);
        }
      }
      at(texBox(10.4, 26, 10.4, 5.5), 0, Y_B + 65, 0);                     // stage two
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(texBox(2.4, 24, 2.4, 5), sx * 5.1, Y_B + 66, sz * 5.1);
      at(texBox(13.6, 1, 13.6, 5), 0, KEEP_GALLERY + 0.5, 0);              // gallery of the Horn
      for (let i = 0; i < 5; i++) for (const s2 of [-1, 1]){
        at(texBox(1.6, 1.4, 0.9, 4), -5.4 + i * 2.7, KEEP_GALLERY + 1.7, s2 * 6.4);
        at(texBox(0.9, 1.4, 1.6, 4), s2 * 6.4, KEEP_GALLERY + 1.7, -5.4 + i * 2.7);
      }
      at(texBox(7.4, 14, 7.4, 5), 0, KEEP_GALLERY + 7, 0);                 // stage three
      at(new THREE.ConeGeometry(5.6, 15, 4).rotateY(Math.PI / 4), 0, KEEP_GALLERY + 21.5, 0);   // spire
      // the films' keep is massive; widen the whole stack about its axis
      const kg = mergeUV(P).translate(-KEEP.x, 0, -KEEP.z).scale(KS, 1, KS).translate(KEEP.x, 0, KEEP.z);
      const k = new THREE.Mesh(kg, burgM);
      k.castShadow = k.receiveShadow = true;
      scene.add(k);
      // arrow slits, a few lit
      const winLit = new THREE.MeshBasicMaterial({ color: 0xffa050 });
      for (let f = 0; f < 4; f++){
        for (const [y, half, lit] of [[Y_B + 14, 6.55, false], [Y_B + 30, 6.55, f % 2 === 0], [Y_B + 44, 6.55, false], [Y_B + 62, 5.25, f !== 1], [KEEP_GALLERY + 8, 3.75, f === 2]]){
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), lit ? winLit : darkM);
          const a = f * Math.PI / 2;
          w.position.set(KEEP.x + Math.sin(a) * (half * KS + 0.03), y, KEEP.z + Math.cos(a) * (half * KS + 0.03));
          w.rotation.y = a;
          scene.add(w);
        }
      }
      // the Horn of Helm, on its stand in the gallery, facing out over the coomb
      const horn = new THREE.Group();
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.8, 1.6, 2.4), new THREE.Vector3(0, 1.0, 5.4));
      const hornGeo = new THREE.TubeGeometry(curve, 20, 0.3, 10, false);
      const pa = hornGeo.attributes.position;
      for (let i = 0; i < pa.count; i++){
        const t = Math.floor(i / 11) / 20;
        const c = curve.getPoint(t);
        const s = 0.35 + t * 1.9;    // flare toward the bell
        pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * s, c.y + (pa.getY(i) - c.y) * s, c.z + (pa.getZ(i) - c.z) * s);
      }
      hornGeo.computeVertexNormals();
      horn.add(new THREE.Mesh(hornGeo, mat(0xd9ccb0, { roughness: 0.45 })));
      for (const t of [0.15, 0.55, 0.9]){
        const p = curve.getPoint(t);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.34 + t * 0.6, 0.06, 6, 16), mat(0xb8913a, { roughness: 0.3, metalness: 0.9 }));
        band.position.copy(p);
        band.lookAt(curve.getPoint(Math.min(1, t + 0.05)).add(horn.position));
        horn.add(band);
      }
      for (const s of [-1, 1]){
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), plankM);
        post.position.set(s * 1.2, -0.9, 2.2);
        horn.add(post);
      }
      horn.position.set(KEEP.x - 1, KEEP_GALLERY + 3.4, KEEP.z - 4);
      horn.rotation.y = Math.PI * 0.95;
      horn.scale.setScalar(0.8);
      horn.traverse(o => { o.castShadow = true; });
      scene.add(horn);
    }

    // ---- the causeway ------------------------------------------------------
    // from the coomb floor along the toe of the northern cliff, up to the gate
    const gateOut = [gx + gn.x * 7.5, gz + gn.z * 7.5];
    const CAUSE = [[236, -196], [206, -166], [176, -134], [gateOut[0] + gn.x * 26, gateOut[1] + gn.z * 26],
      [gateOut[0] + gn.x * 10, gateOut[1] + gn.z * 10], gateOut];
    {
      const y0 = heightAt(CAUSE[0][0], CAUSE[0][1]) + 0.4;
      const ramp = (s) => lerp(y0, Y_B - 0.1, smoothstep(0.0, 0.92, s) * 0.6 + s * 0.4);
      const prof = [
        { u: 5.6, ground: true, dy: -2 }, { u: 4.3, v: -0.3 }, { u: 4.3, v: 1.1 }, { u: 3.6, v: 1.1 }, { u: 3.6, v: 0 },
        { u: -3.6, v: 0 }, { u: -3.6, v: 1.1 }, { u: -4.3, v: 1.1 }, { u: -4.3, v: -0.3 }, { u: -5.6, ground: true, dy: -2 },
      ];
      const cw = sweep(CAUSE, prof, { heightAt, step: 1.2, tile: 5, baseY: (s) => ramp(s) });
      addMesh(cw.geo, wallM);
      // the last span leaps a cleft in the rock on a single arch
      const f = cw.frame(0.955);
      const ground = heightAt(f.p.x, f.p.z), deck = ramp(0.955);
      const archH = deck - 1.6 - ground;
      if (archH > 3){
        const w = Math.min(9, archH * 1.1);
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, -4); sh.lineTo(w / 2, -4); sh.lineTo(w / 2, archH - w / 2);
        sh.absarc(0, archH - w / 2, w / 2, 0, Math.PI, false); sh.lineTo(-w / 2, -4);
        for (const side of [-1, 1]){
          const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), darkM);
          m.position.set(f.p.x + f.right.x * side * 5.75, ground, f.p.z + f.right.z * side * 5.75);
          m.rotation.y = Math.atan2(f.right.x * side, f.right.z * side);
          scene.add(m);
        }
      }
    }

    // ---- water -------------------------------------------------------------
    {
      const wDeep = makeWater(scene, { shallow: 0x2a363c, deep: 0x141c20, sky: 0x2e343c, sunDir, sunColor: 0x8a6a50, flow: 2.2, scale: 0.18, opacity: 0.86 });
      const pos = [];
      const pts = [];
      const step = 3;
      for (let i = 0; i < STREAM.length - 1; i++){
        const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
        for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
      }
      pts.push(STREAM[STREAM.length - 1]);
      for (let i = 0; i < pts.length - 1; i++){
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const tx = x1 - x0, tz = z1 - z0, L = Math.hypot(tx, tz);
        const rx = -tz / L * 2.6, rz = tx / L * 2.6;
        const y0 = floorH(x0, z0) + 0.85, y1 = floorH(x1, z1) + 0.85;
        pos.push(x0 - rx, y0, z0 - rz, x1 - rx, y1, z1 - rz, x1 + rx, y1, z1 + rz,
                 x0 - rx, y0, z0 - rz, x1 + rx, y1, z1 + rz, x0 + rx, y0, z0 + rz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      wDeep.mesh.geometry = g;
      wDeep.mesh.rotation.set(0, 0, 0);
      wDeep.mesh.position.set(0, 0, 0);
      wDeep.mesh.material.side = THREE.DoubleSide;
      scene.add(wDeep.mesh); updates.push(wDeep.update);
    }

    // ---- tussock and stones on the coomb's gravel ------------------------
    const tussock = makeGrass(scene, {
      count: 26000, area: 1400, cx: 0, cz: -560, heightAt,
      mask: (x, z) => {
        if (mountainD(x, z) > 30) return 0;
        if (z > -60 && z < 40) return 0;                    // the trampled ground under the wall
        if (z < -80 && z > -360 && x > -280 && x < 260) return 0.05;   // where the host stands
        return 0.35 * smoothstep(0.35, 0.7, fbm(x * 0.02, z * 0.02, 3));
      },
      colorA: 0x2e2a1e, colorB: 0x433b28, height: 0.75, windAmp: 0.35, windFreq: 1.6,
    });
    scene.add(tussock.mesh); updates.push(tussock.update);
    {
      const r2 = mulberry32(55), spots = [];
      while (spots.length < 900){
        const x = (r2() - 0.5) * 1400, z = -1000 + r2() * 960;
        if (mountainD(x, z) > 5 || distToPolyline(STREAM, x, z) < 6) continue;
        if (z < -80 && z > -360 && x > -280 && x < 260 && r2() > 0.15) continue;
        spots.push({ x, z, s: 0.25 + r2() * r2() * 1.6 });
      }
      scene.add(scatterRocks(spots, { heightAt, color: 0x8a8880, seed: 56 }));
    }

    // ---- the Glittering Caves --------------------------------------------
    {
      const cz = 452;
      const cy = heightAt(4, cz - 30);
      const sh = new THREE.Shape();
      sh.moveTo(-9, 0); sh.lineTo(9, 0); sh.lineTo(8, 10); sh.quadraticCurveTo(0, 21, -8, 10); sh.lineTo(-9, 0);
      const mouth = new THREE.Mesh(new THREE.ShapeGeometry(sh), darkM);
      mouth.position.set(4, cy - 1, cz - 14);
      scene.add(mouth);
      const glow = new THREE.PointLight(0xffb060, 160, 60, 2);
      glow.position.set(4, cy + 4, cz - 22);
      scene.add(glow);
    }

    // ---- banners -------------------------------------------------------------
    const banners = [];
    const banner = (x, y, z, o, ry = 0) => {
      const b = makeBanner(scene, Object.assign({ color: '#24451f', emblem: 'horse', emblemColor: '#efe9d2', w: 2.0, h: 3.8, poleH: 8, wind: 1.9 }, o));
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.y = ry;
      scene.add(b.mesh); updates.push(b.update);
      banners.push(b);
      return b;
    };
    banner(KEEP.x + 7.8, KEEP_GALLERY + 1, KEEP.z + 7.8, { w: 3.0, h: 5.6, poleH: 11 });
    for (const sw of curtainRuns){
      for (const t of [0.3, 0.75]){
        const f = sw.frame(t);
        banner(f.p.x - f.right.x * 3, Y_B + 9, f.p.z - f.right.z * 3, {}, Math.atan2(f.right.x, f.right.z));
      }
    }
    for (const s of [-1, 1]){
      const p = new THREE.Vector3(gx, Y_B + 18.3, gz).addScaledVector(gt, s * 6.6).addScaledVector(gn, 0.8);
      banner(p.x, p.y, p.z, { w: 1.8, h: 3.6, poleH: 7 }, gate.rotation.y);
    }

    // ---- defenders -----------------------------------------------------------
    const troops = [];
    const faceRight = (r) => Math.atan2(r.x, r.z);
    const HERO_T = [tCulvert - 0.035, tCulvert + 0.012];
    {
      // the Deeping Wall: Galadhrim at the parapet, men of Rohan among them
      const L = WP.length;
      const n1 = Math.floor(L / 1.12);
      for (let i = 1; i < n1 - 1; i++){
        const t = i / n1;
        if (t > HERO_T[0] && t < HERO_T[1]) continue;
        const f = deeping.frame(t);
        const isMan = (i % 9 === 4);
        const kind = isMan ? (rand() > 0.5 ? 'rohanSpear' : 'rohanLevy')
          : (rand() > 0.62 ? 'elfBowDark' : (rand() > 0.85 ? 'elfSword' : 'elfBow'));
        troops.push({ kind, x: f.p.x - f.right.x * 1.6, y: Y_TOP, z: f.p.z - f.right.z * 1.6,
          ry: faceRight(f.right) + (rand() - 0.5) * 0.12, s: isMan ? 0.98 + rand() * 0.06 : 1 + rand() * 0.04 });
      }
      const n2 = Math.floor(L / 1.6);
      for (let i = 1; i < n2 - 1; i++){
        const t = (i + 0.5) / n2;
        if (t > HERO_T[0] - 0.01 && t < HERO_T[1] + 0.01) continue;
        if ([0.22, 0.55, 0.84].some(ts => Math.abs(t - ts) < 0.012)) continue;
        const f = deeping.frame(t);
        const kind = i % 6 === 0 ? 'rohanBow' : (rand() > 0.5 ? 'elfBow' : 'elfBowDark');
        troops.push({ kind, x: f.p.x - f.right.x * 3.4, y: Y_TOP, z: f.p.z - f.right.z * 3.4,
          ry: faceRight(f.right) + (rand() - 0.5) * 0.2 });
      }
      // the Hornburg's walls: Rohirrim
      for (const sw of curtainRuns){
        const n = Math.floor(sw.path.length / 1.7);
        for (let i = 1; i < n; i++){
          const t = i / n;
          const f = sw.frame(t);
          const kind = ['rohanSpear', 'rohanBow', 'rohanOld', 'rohanLevy'][i % 4];
          troops.push({ kind, x: f.p.x - f.right.x * 1.7, y: Y_B + 9, z: f.p.z - f.right.z * 1.7, ry: faceRight(f.right) + (rand() - 0.5) * 0.3 });
        }
      }
      // reserves: an elven company drawn up in the Deep behind the wall
      for (let r = 0; r < 8; r++){
        for (let c = 0; c < 26; c++){
          const x = -96 + c * 1.3 + (rand() - 0.5) * 0.1, z = 34 + r * 1.5;
          troops.push({ kind: r === 0 ? 'elfSword' : (c % 2 ? 'elfBow' : 'elfBowDark'), x, y: heightAt(x, z), z, ry: Math.PI });
        }
      }
      // and the remaining men of the Westfold by the Hornburg stair
      for (let r = 0; r < 6; r++){
        for (let c = 0; c < 18; c++){
          const x = 6 + c * 1.25 + (rand() - 0.5) * 0.3, z = 28 + r * 1.4 + (rand() - 0.5) * 0.3;
          // old men and boys of the Westfold among the soldiers, as in the film
          const kind = ['rohanSpear', 'rohanLevy', 'rohanOld', 'rohanBow', 'rohanOld', 'rohanLevy'][(r * 7 + c) % 6];
          const boy = kind === 'rohanLevy' && rand() < 0.5;
          troops.push({ kind, x, y: heightAt(x, z), z, ry: Math.PI + (rand() - 0.5) * 0.3, s: boy ? 0.84 : 0.97 + rand() * 0.05 });
        }
      }
      // courtyard garrison
      for (let i = 0; i < 40; i++){
        const x = 70 + rand() * 18, z = -58 + rand() * 30;
        if (hornR(x, z) > 0.85) continue;
        troops.push({ kind: rand() > 0.5 ? 'rohanSpear' : 'rohanLevy', x, y: Y_B, z, ry: rand() * 6.28 });
      }
    }
    const defenderCount = troops.length;

    // ---- the host of Isengard -------------------------------------------
    const flames = [];
    const ladderSpots = [];
    const bannerSpots = [];
    {
      const free = (x, z) => {
        if (x < xL(z) + 12 || x > xR(z) - 12) return false;
        if (distToPolyline(STREAM, x, z) < 6.5) return false;
        if (distToPolyline(CAUSE, x, z) < 10) return false;
        if (hornR(x, z) < 1.32) return false;
        return true;
      };
      // One unbroken host, as in the films: a deep crescent packed shoulder to
      // shoulder before the Deeping Wall and the gate, thinning toward the
      // flanks — pikes in the front ranks, then shield-men and pikes mixed in
      // drifting patches, crossbows toward the rear, torches scattered through.
      const DX = 1.05, DZ = 1.22;
      const X0 = -250, X1 = 245, XC = -20, HALFW = 245;
      const front = (x) => -90 - (fbm(x * 0.03, 4.4, 2) - 0.5) * 6 - Math.max(0, x - 120) * 0.25;
      const depth = (x) => {
        const u = Math.min(1, Math.abs(x - XC) / HALFW);
        return 14 + 72 * (1 - u * u) + (fbm(x * 0.02, 8.8, 2) - 0.5) * 12;
      };
      let row = 0;
      for (let z = -86; z > -190; z -= DZ, row++){
        for (let x = X0 + (row % 2) * DX * 0.5; x < X1; x += DX){
          const zf = front(x), zb = zf - depth(x);
          const jx = x + (rand() - 0.5) * 0.3, jz = z + (rand() - 0.5) * 0.3;
          if (jz > zf || jz < zb) continue;
          if (!free(jx, jz)) continue;
          const intoRank = zf - jz;                    // metres back from the front
          const patch = fbm(jx * 0.035 + 2, jz * 0.035, 2);
          let k;
          if (intoRank < 3.6) k = 'urukPike';
          else if (jz - zb < 6 && rand() < 0.7) k = 'urukXbow';
          else k = patch > 0.5 ? 'urukPike' : 'urukSword';
          if (rand() < 0.006) k = 'urukCaptain';
          else if (rand() < (intoRank < 1.3 ? 0.18 : 0.05)) k = 'urukTorch';
          const ry = Math.atan2(XC * 0.4 - jx, 400 - jz) + (rand() - 0.5) * 0.12;
          const y = heightAt(jx, jz);
          troops.push({ kind: k, x: jx, y, z: jz, ry, s: 0.95 + rand() * 0.1,
            phase: jz * 0.012 + jx * 0.0015 + rand() * 0.04 });
          if (k === 'urukTorch'){
            const c2 = Math.cos(ry), s2 = Math.sin(ry);
            flames.push([jx + 0.41 * c2 + 0.2 * s2, y + 2.25, jz - 0.41 * s2 + 0.2 * c2, 0.75]);
          }
        }
      }
      // ladders raised along the second band, standards scattered through
      for (let x = X0 + 14; x < X1 - 10; x += 21 + rand() * 8){
        const z = front(x) - 9 - rand() * 4;
        if (free(x, z) && depth(x) > 18) ladderSpots.push([x, z]);
      }
      for (let x = X0 + 8; x < X1; x += 16 + rand() * 14){
        const z = front(x) - 3 - rand() * Math.max(4, depth(x) - 6);
        if (free(x, z)) bannerSpots.push([x, z]);
      }
    }
    // ladder teams
    const ladderGeo = (() => {
      const geos = [];
      for (const s of [-1, 1]) geos.push(texBox(0.2, 19, 0.24, 4).translate(s * 0.75, 9.5, 0));
      for (let i = 0; i < 30; i++) geos.push(texBox(1.5, 0.12, 0.12, 4).translate(0, 0.8 + i * 0.6, 0));
      return mergeUV(geos);
    })();
    {
      const im = new THREE.InstancedMesh(ladderGeo, plankM, ladderSpots.length);
      const d = new THREE.Object3D();
      ladderSpots.forEach(([x, z], i) => {
        d.position.set(x, heightAt(x, z) + 0.6, z);
        d.rotation.set(-0.18, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.06);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
    // White Hand standards over the regiments
    for (const [x, z] of bannerSpots){
      banner(x, heightAt(x, z), z, { color: '#141518', emblem: 'hand', emblemColor: '#e4e0d6', w: 1.4, h: 2.6, poleH: 6.4, wind: 2.1 }, 0);
    }
    // ballistae with their grapnels, and a battering ram at the causeway foot
    function ballista(x, z){
      const g = new THREE.Group();
      const wood = mat(0x4a3826);
      const parts = [[4.6, 0.5, 2.2, 0, 1.1, 0], [0.4, 0.4, 6.4, 0, 1.9, 0.6], [6.4, 0.35, 0.35, 0, 2.2, 3.4], [0.3, 1.6, 0.3, -1.2, 1.6, -0.6], [0.3, 1.6, 0.3, 1.2, 1.6, -0.6]];
      for (const [w, h, d, x2, y2, z2] of parts){
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
        m.position.set(x2, y2, z2); m.castShadow = true; g.add(m);
      }
      for (const s of [-1, 1]) for (const zz of [-0.8, 0.8]){
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 10), wood);
        wh.rotation.z = Math.PI / 2; wh.position.set(s * 2.4, 0.6, zz); g.add(wh);
      }
      const grap = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 4), ironM);
      grap.rotation.x = Math.PI / 2; grap.position.set(0, 2.2, 4.2); g.add(grap);
      g.position.set(x, heightAt(x, z), z);
      g.rotation.x = -0.08;
      scene.add(g);
      for (let k = 0; k < 5; k++){
        const ox = -2.5 + k * 1.25, oz = -2.4;
        troops.push({ kind: k === 2 ? 'urukCaptain' : 'urukXbow', x: x + ox, y: heightAt(x + ox, z + oz), z: z + oz, ry: 0 });
      }
    }
    ballista(-150, -154);
    ballista(70, -168);
    {
      const ram = new THREE.Group();
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 14, 10), mat(0x3a2c1e));
      log.rotation.x = Math.PI / 2; log.position.y = 2.0;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 8), ironM);
      head.rotation.x = Math.PI / 2; head.position.set(0, 2.0, 7.6);
      ram.add(log, head);
      ram.traverse(o => { o.castShadow = true; });
      const rx = 226, rz = -214;
      ram.position.set(rx, heightAt(rx, rz), rz);
      ram.rotation.y = Math.atan2(-20, 48);
      scene.add(ram);
      for (let k = 0; k < 12; k++){
        const side = k % 2 ? 1.05 : -1.05, along = -6 + Math.floor(k / 2) * 2.2;
        const c = Math.cos(ram.rotation.y), s = Math.sin(ram.rotation.y);
        const x = rx + side * c + along * s, z = rz - side * s + along * c;
        troops.push({ kind: 'urukSword', x, y: heightAt(x, z), z, ry: ram.rotation.y });
      }
    }
    // the blasting fire of Saruman, on litters before the culvert — and the
    // runner who will carry the torch to it
    {
      const fc = deeping.frame(tCulvert);
      for (const ox of [-4, 4]){
        const x = fc.p.x + ox, z = -84;
        const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), ironM);
        bomb.position.set(x, heightAt(x, z) + 1.5, z);
        bomb.castShadow = true;
        scene.add(bomb);
        const litter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 3.4), mat(0x3a2c1e));
        litter.position.set(x, heightAt(x, z) + 0.9, z);
        scene.add(litter);
        for (const [dx, dz] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]){
          troops.push({ kind: 'urukSword', x: x + dx, y: heightAt(x + dx, z + dz), z: z + dz, ry: 0 });
        }
      }
      // the torch-bearer stands on a boulder before the host, as in the film
      const bx = fc.p.x + 9, bz = -83;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), mat(0x4a4c4e, { roughness: 0.6, flatShading: true }));
      rock.scale.set(1.3, 0.62, 1.05);
      rock.position.set(bx, heightAt(bx, bz) + 0.25, bz);
      rock.castShadow = rock.receiveShadow = true;
      scene.add(rock);
      troops.push({ kind: 'urukBerserk', x: bx, y: heightAt(bx, bz) + 1.55, z: bz, ry: 0, s: 1.1 });
      flames.push([bx + 0.45, heightAt(bx, bz) + 1.55 + 2.6, bz + 0.2, 1.3]);
    }
    // defenders cast shadows on the stone; the host is too many to bother
    const garrison = makeTroops(troops.slice(0, defenderCount), { near: 30, mid: 130, seed: 76, shadow: true });
    const army = makeTroops(troops.slice(defenderCount), { near: 16, mid: 48, far: 150, seed: 77 });
    scene.add(garrison.group, army.group);
    // the world is built mirrored (see the end of build), so the soldiers'
    // level of detail is chosen from the camera's mirrored position
    const localCam = { position: new THREE.Vector3() };
    updates.push((t) => {
      localCam.position.set(-camera.position.x, camera.position.y, camera.position.z);
      garrison.update(t, localCam); army.update(t, localCam);
    });

    // ---- named heroes ----------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));
    // inside the great hall: the king's guard, and folk sheltering from the storm
    for (let i = 0; i < 7; i++){
      const p = i < 3 ? Cast.rohirrim({ pose: 'guard' }) : makePerson({
        height: 1.55 + rand() * 0.2, skin: 0xd8b498, hair: [0xb08c50, 0x6a4a28, 0xc9c2b2][i % 3], hairLen: 0.8,
        robe: [0x6b5838, 0x5a4a3a, 0x7a6a50, 0x4a4436][i % 4], cloak: 0x4a4030, hoodUp: i % 3 === 0,
      });
      p.position.set(HALL.x0 + 9 + rand() * 28, HALL.floor, HALL.z0 + 6 + rand() * (HALL.z1 - HALL.z0 - 12));
      p.rotation.y = rand() * Math.PI * 2;
      crowd.idle(p); scene.add(p);
    }
    const wallSpot = (t, u) => {
      const f = deeping.frame(t);
      return { x: f.p.x - f.right.x * u, z: f.p.z - f.right.z * u, ry: faceRight(f.right) };
    };
    const heroes = {};
    const place = (rig, t, u, y = Y_TOP, turn = 0) => {
      const s = wallSpot(t, u);
      rig.position.set(s.x, y, s.z);
      rig.rotation.y = s.ry + turn;
      crowd.idle(rig); scene.add(rig);
      return rig;
    };
    const tc = tCulvert;
    heroes.aragorn = place(Cast.aragorn({ pose: 'guard', cloak: 0x3c3830 }), tc - 0.004, 1.6);
    heroes.legolas = place(Cast.legolas({ pose: 'guard' }), tc - 0.011, 1.6);
    heroes.gimli = place(Cast.gimli({ pose: 'guard' }), tc + 0.003, 1.5);
    heroes.haldir = place(makePerson({
      height: 1.9, bulk: 0.88, skin: 0xe4d0b8, hair: 0xe8d8a0, hairLen: 0.95,
      tunic: 0xa8823a, pants: 0x3a3530, boots: 0x2a221a, cloak: 0x4c1f1b, prop: 'bow', glow: 0.04, pose: 'guard',
    }), tc - 0.024, 2.4, Y_TOP, -0.5);
    // Théoden and Gamling above the gate
    const gtop = new THREE.Vector3(gx, Y_B + 18.3, gz).addScaledVector(gn, 3.4);
    // dark armour edged with gold over red sleeves, as in the films
    heroes.theoden = Cast.theoden({ pose: 'guard', helm: 'rohan', tunic: 0x2a2826, pants: 0x221f1c, cloak: 0x4a1e1a });
    heroes.theoden.position.copy(gtop).addScaledVector(gt, -1);
    heroes.theoden.rotation.y = gate.rotation.y;
    const gamling = Cast.rohirrim({ pose: 'guard', beard: 0.6, hair: 0x9a8a70 });
    gamling.position.copy(gtop).addScaledVector(gt, 1.2);
    gamling.rotation.y = gate.rotation.y;
    for (const r of [heroes.theoden, gamling]){ crowd.idle(r); scene.add(r); }
    // horses in the courtyard, the last refugees going up into the caves
    for (let i = 0; i < 6; i++){
      const h = makeHorse({ color: [0x6b4a2f, 0x2f2620, 0x8a7458, 0x4a3826][i % 4], white: i === 2 });
      h.position.set(118 + (i % 3) * 3.4, Y_B, -56 + Math.floor(i / 3) * 4);
      h.rotation.y = 0.4 + rand() * 0.4;
      crowd.idle(h); scene.add(h);
    }
    for (let i = 0; i < 14; i++){
      const child = i % 4 === 0;
      const p = makePerson({
        height: child ? 1.15 : 1.62 + rand() * 0.12, bulk: child ? 0.9 : 0.95,
        skin: 0xd8b498, hair: [0xb08c50, 0x6a4a28, 0xc9c2b2][i % 3], hairLen: 0.7 + rand() * 0.3,
        robe: [0x6b5838, 0x5a4a3a, 0x7a6a50, 0x4a4436][i % 4], cloak: 0x4a4030, hoodUp: rand() > 0.6,
      });
      scene.add(p);
      crowd.walk(p, DEEP_PATH.map(([x, z]) => [x + (rand() - 0.5) * 4, 0, z]), { speed: 1.0 + rand() * 0.3, loop: 'loop', offset: i / 14 });
    }

    // ---- fire --------------------------------------------------------------
    const lights = [];
    const fireAt = (x, y, z, size = 1.8, light = 0) => {
      flames.push([x, y, z, size]);
      if (light){
        const pl = new THREE.PointLight(0xff8a3a, light, 46, 2);
        pl.position.set(x, y + 1, z);
        scene.add(pl);
        lights.push({ pl, base: light, seed: lights.length * 1.7 });
      }
    };
    // braziers along the wall-walk
    for (let i = 0; i < 7; i++){
      const t = 0.07 + i * 0.145;
      const s = wallSpot(t, 5.2);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.35, 0.7, 10, 1, true), ironM);
      bowl.position.set(s.x, Y_TOP + 1.4, s.z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 6), ironM);
      leg.position.set(s.x, Y_TOP + 0.55, s.z);
      scene.add(bowl, leg);
      fireAt(s.x, Y_TOP + 2.1, s.z, 2.4, i % 2 === 0 ? 150 : 0);
      const sm = makeSmoke(scene, { x: s.x, y: Y_TOP + 2.6, z: s.z, rise: 12, spread: 3.2, size: 2.6, count: 10, opacity: 0.07, speed: 0.22, color: 0x8a8480 });
      scene.add(sm.mesh); updates.push(sm.update);
    }
    for (const sw of curtainRuns){
      for (const t of [0.15, 0.5, 0.85]){
        const f = sw.frame(t);
        fireAt(f.p.x - f.right.x * 4, Y_B + 11, f.p.z - f.right.z * 4, 2.6, t === 0.5 ? 260 : 0);
      }
    }
    fireAt(gx + gn.x * 6 + gt.x * 4.2, Y_B + 8.5, gz + gn.z * 6 + gt.z * 4.2, 2.2, 160);
    fireAt(gx + gn.x * 6 - gt.x * 4.2, Y_B + 8.5, gz + gn.z * 6 - gt.z * 4.2, 2.2, 0);
    fireAt(KEEP.x - 7.6, KEEP_GALLERY + 2.2, KEEP.z - 7.6, 3, 220);
    // warm pools of torchlight over the host
    for (const [x, z] of [[-130, -110], [-60, -104], [10, -128], [-100, -190], [-20, -200], [60, -190]]){
      const pl = new THREE.PointLight(0xff9a50, 420, 80, 2);
      pl.position.set(x, heightAt(x, z) + 16, z);
      scene.add(pl);
      lights.push({ pl, base: 420, seed: x * 0.3 });
    }
    flames.push(...hallLight.torches);
    const fire = makeFlames(scene, flames, { size: 1.0 });
    scene.add(fire.mesh); updates.push(fire.update);
    updates.push((t) => {
      for (const L of lights){
        L.pl.intensity = L.base * (0.82 + 0.12 * Math.sin(t * 11 + L.seed) + 0.08 * Math.sin(t * 23.7 + L.seed * 3)) * fireBoost;
      }
    });

    // ---- rain, and the storm -------------------------------------------
    const rain = makeParticles(scene, 'rain', { count: 9000, area: [150, 90, 150], cy: 0, opacity: 0.3, fall: 30, size: 0.8, streakAngle: 0.12, seed: 31 });
    rain.mesh.material.uniforms.uYBase.value = 0;
    scene.add(rain.mesh); updates.push(rain.update);
    const bolt = makeBolt(mulberry32(9));
    scene.add(bolt);
    const strike = (t) => {
      // deterministic in t: one strike in each 9-second window
      const i = Math.floor(t / 9);
      const h = Math.abs(Math.sin(i * 91.17) * 43758.5453) % 1;
      const ti = i * 9 + h * 6;
      const dt = t - ti;
      if (dt < 0 || dt > 1.2) return { f: 0, i };
      const f = Math.exp(-dt * 7) * (0.55 + 0.45 * Math.sin(dt * 70) ** 2) + (dt > 0.12 && dt < 0.3 ? 0.5 * Math.exp(-(dt - 0.12) * 12) : 0);
      return { f, i, h };
    };

    // ---- mood: dusk (last light) ↔ night (the storm breaks) -------------
    const MOODS = {
      dusk: {
        fog: [0x5d646c, 0.00024], zenith: 0x34404e, horizon: 0x8a8580, sGround: 0x2a2a2c,
        cloud: 0x6a6e74, cloudSh: 0x30343a, cover: 0.8, sunI: 0.35,
        hemiSky: 0xb2bec8, hemiGround: 0x44443e, hemiI: 1.4, keyC: 0xd0d2d0, keyI: 1.9,
        fill: 0.4, fire: 0.5, wet: 0.3, rain: 0.16, bolt: 0.5,
        exposure: 1.55,
        grade: { lift: [0.01, 0.014, 0.016], gamma: [1.02, 1.03, 1.03], gain: [0.98, 1.02, 1.0], sat: 0.8, temp: -0.08, bloom: 0.4, bloomThreshold: 0.84, vignette: 0.5 },
      },
      night: {
        fog: [0x0e1c26, 0.00135], zenith: 0x06111a, horizon: 0x1a3040, sGround: 0x0b1014,
        cloud: 0x1c2d3a, cloudSh: 0x08111a, cover: 0.86, sunI: 0.0,
        hemiSky: 0x4a7898, hemiGround: 0x141a1c, hemiI: 1.0, keyC: 0x8cc4e6, keyI: 1.15,
        fill: 0.14, fire: 1.0, wet: 0.95, rain: 0.42, bolt: 1.0,
        exposure: 1.9,
        grade: { lift: [0.0, 0.01, 0.022], gamma: [1.0, 1.01, 1.04], gain: [0.94, 1.02, 1.12], sat: 0.95, temp: -0.28, bloom: 0.65, bloomThreshold: 0.7, vignette: 0.62 },
      },
    };
    let mood = 0, moodTarget = 0, fireBoost = 0.55;
    const ca = new THREE.Color(), cb = new THREE.Color();
    const lc = (a, b, t) => ca.set(a).lerp(cb.set(b), t);
    const D = MOODS.dusk, Nn = MOODS.night;
    const keyDirDusk = sunDir.clone().multiplyScalar(-1).negate();   // from the west, low
    const keyDirNight = new THREE.Vector3(0.35, 0.8, -0.45).normalize();
    function applyMood(m, flashF){
      scene.fog.color.copy(lc(D.fog[0], Nn.fog[0], m));
      scene.fog.density = lerp(D.fog[1], Nn.fog[1], m);
      const u = sky.uniforms;
      u.uZenith.value.copy(lc(D.zenith, Nn.zenith, m)).addScalar(flashF * 0.35);
      u.uHorizon.value.copy(lc(D.horizon, Nn.horizon, m)).addScalar(flashF * 0.25);
      u.uGround.value.copy(lc(D.sGround, Nn.sGround, m));
      u.uCloudCol.value.copy(lc(D.cloud, Nn.cloud, m)).addScalar(flashF * 0.55);
      u.uCloudSh.value.copy(lc(D.cloudSh, Nn.cloudSh, m)).addScalar(flashF * 0.2);
      u.uCover.value = lerp(D.cover, Nn.cover, m);
      u.uSunI.value = lerp(D.sunI, Nn.sunI, m);
      hemi.color.copy(lc(D.hemiSky, Nn.hemiSky, m));
      hemi.groundColor.copy(lc(D.hemiGround, Nn.hemiGround, m));
      hemi.intensity = lerp(D.hemiI, Nn.hemiI, m) + flashF * 1.6;
      key.color.copy(lc(D.keyC, Nn.keyC, m));
      key.intensity = lerp(D.keyI, Nn.keyI, m);
      key.position.copy(keyDirDusk).lerp(keyDirNight, m).normalize().multiplyScalar(700).add(key.target.position);
      fill.intensity = lerp(D.fill, Nn.fill, m);
      flash.intensity = flashF * 5;
      backdrop.children.forEach((r, i) => r.material.color.copy(lc(ringCols[i][0], ringCols[i][1], m)).addScalar(flashF * 0.15));
      hallLight.shaftM.uniforms.uOp.value = lerp(0.09, 0.015, m) * (1 + flashF * 2);
      hallLight.patchM.opacity = lerp(0.32, 0.04, m);
      for (const b of banners) b.uniforms.uLight.value = lerp(0.3, 0.13, m) + flashF * 0.8;
      // the tussock shader is unlit, so its colours follow the light by hand
      tussock.mesh.material.uniforms.uColA.value.copy(lc(0x2e2a1e, 0x0c1418, m)).addScalar(flashF * 0.3);
      tussock.mesh.material.uniforms.uColB.value.copy(lc(0x433b28, 0x111c20, m)).addScalar(flashF * 0.3);
      fireBoost = lerp(D.fire, Nn.fire, m);
      fire.uniforms.uBright.value = lerp(0.8, 1.15, m);
      rain.mesh.material.uniforms.uOp.value = lerp(D.rain, Nn.rain, m);
      const wet = lerp(D.wet, Nn.wet, m);
      setWetness(scene, wet);
      setTroopWetness(wet);
    }
    keyDirDusk.set(-sunDir.x, -sunDir.y, -sunDir.z).negate();
    let lastWet = -1;
    updates.push((t, dt) => {
      mood += (moodTarget - mood) * Math.min(1, (dt || 0) * 0.8);
      if (dt === 0) mood = moodTarget;
      const s = strike(t);
      const flashF = s.f * lerp(D.bolt, Nn.bolt, mood);
      bolt.material.opacity = s.f > 0.25 ? Math.min(1, s.f) * lerp(0.5, 1, mood) : 0;
      if (s.f > 0 && s.h !== undefined){
        const a = (s.h - 0.5) * 1.6;
        bolt.position.set(Math.sin(a) * 1800 - 100, 950, -Math.cos(a) * 1700 - 300);
        bolt.rotation.y = s.i;
      }
      applyMood(mood, flashF);
      // rain follows the eye
      rain.mesh.position.set(camera.position.x, camera.position.y - 45, camera.position.z);
      rain.mesh.visible = !inHall(-camera.position.x, camera.position.z, 0.5);   // no rain indoors
    });

    // ---- shots -----------------------------------------------------------
    const fc = deeping.frame(tCulvert);
    const aP = heroes.aragorn.position;
    const shots = [
      { // the host from the air, and the fortress beyond
        pos: [[-200, 120, -620], [-120, 95, -480], [-40, 78, -360]],
        look: [[30, 30, 0], [40, 32, 0], [50, 34, -10]],
        dur: 22,
      },
      { // along the Deeping Wall, behind the elven line
        pos: [[30, Y_TOP + 2.6, -4], [0, Y_TOP + 2.4, -10], [-36, Y_TOP + 2.4, -12], [-70, Y_TOP + 2.6, -7]],
        look: [[0, 12, -160], [-20, 10, -170], [-50, 10, -170], [-80, 10, -160]],
        dur: 20, ease: 'linear',
      },
      { // low, among the pikes, the wall towering ahead
        pos: [[-90, heightAt(-90, -150) + 2.2, -150], [-70, heightAt(-70, -125) + 2.4, -125], [-50, heightAt(-50, -103) + 3, -103]],
        look: [[-40, 26, 0], [-35, 26, 0], [-30, 24, 0]],
        dur: 16,
      },
      { // Aragorn at the parapet; crane up to the ten thousand
        pos: [[aP.x - 6, Y_TOP + 2, aP.z + 6], [aP.x - 9, Y_TOP + 9, aP.z + 12], [aP.x - 14, Y_TOP + 30, aP.z + 24]],
        look: [[aP.x, Y_TOP + 1.7, aP.z], [aP.x, Y_TOP + 0, aP.z - 30], [aP.x, 6, aP.z - 170]],
        dur: 18,
      },
      { // around the Hornburg: keep, hall and gate
        pos: [[200, 120, -160], [120, 110, -190], [20, 90, -150], [-30, 75, -60]],
        look: [[110, 45, -30], [110, 45, -30], [100, 40, -30], [95, 40, -30]],
        dur: 24,
      },
      { // up the causeway to the gate
        pos: [[262, heightAt(262, -226) + 6, -226], [222, 20, -182], [190, 30, -146], [gateOut[0] + gn.x * 20, Y_B + 4, gateOut[1] + gn.z * 20]],
        look: [[170, 22, -120], [gx, Y_B + 6, gz], [gx, Y_B + 8, gz], [gx, Y_B + 9, gz]],
        dur: 18,
      },
      { // the King's view from the gate tower
        pos: [[gtop.x + gn.x * 1.5 - gt.x * 3, gtop.y + 2.2, gtop.z + gn.z * 1.5 - gt.z * 3], [gtop.x + gn.x * 3, gtop.y + 3, gtop.z + gn.z * 3]],
        look: [[-40, 6, -220], [-10, 6, -260]],
        dur: 14,
      },
    ];

    // places to fly to and explore
    const viewpoints = [
      { name: 'Above the coomb', pos: [-160, 140, -560], look: [30, 30, 0] },
      { name: 'The Deeping Wall', pos: [fc.p.x - fc.right.x * 5 + 8, Y_TOP + 2.3, fc.p.z - fc.right.z * 5], look: [fc.p.x - 20, 8, -180] },
      { name: 'Aragorn, Legolas & Gimli', pos: [aP.x - 5, Y_TOP + 2.2, aP.z + 5], look: [aP.x, Y_TOP + 1.4, aP.z] },
      { name: 'Front rank of the host', pos: [-40, heightAt(-40, -92) + 2.4, -92], look: [-45, 3, -140] },
      { name: 'Among the pikes', pos: [-70, heightAt(-70, -140) + 2.2, -140], look: [-30, 22, 0] },
      { name: 'The culvert', pos: [fc.p.x + fc.right.x * 22, heightAt(fc.p.x + fc.right.x * 22, fc.p.z + fc.right.z * 22) + 3, fc.p.z + fc.right.z * 22], look: [fc.p.x, 5, fc.p.z] },
      { name: 'The causeway', pos: [252, heightAt(252, -214) + 3, -214], look: [gx, Y_B + 5, gz] },
      { name: 'Théoden above the gate', pos: [gtop.x + gn.x * 2, gtop.y + 2, gtop.z + gn.z * 2], look: [-40, 6, -220] },
      { name: 'The Horn of Helm', pos: [KEEP.x - 14, KEEP_GALLERY + 6, KEEP.z - 17], look: [KEEP.x - 1, KEEP_GALLERY + 3.4, KEEP.z - 2.5] },
      { name: 'Haldir’s company', pos: [-70, 18, 70], look: [-60, 8, 30] },
      { name: 'The great hall', pos: [HALL.x0 + 7, HALL.floor + 8, HALL.z1 - 5], look: [HALL.x1 - 8, HALL.floor + 2, HALL.z0 + 12] },
      { name: 'The Glittering Caves', pos: [4, heightAt(4, 400) + 6, 400], look: [4, heightAt(4, 440) + 6, 452] },
    ];

    // The layout above is authored in mirror image; flip it so that, seen from
    // the coomb, the Hornburg stands on the right of the Deeping Wall and the
    // causeway climbs away to the far right, as in the films.
    const world = new THREE.Group();
    world.scale.x = -1;
    for (const o of [...scene.children]) if (o !== rain.mesh) world.add(o);
    scene.add(world);
    const flipX = (p) => [-p[0], p[1], p[2]];
    for (const sh of shots){ sh.pos = sh.pos.map(flipX); sh.look = sh.look.map(flipX); }
    for (const vp of viewpoints){ vp.pos = flipX(vp.pos); vp.look = flipX(vp.look); }
    // flight may enter the hall: inside it the 'ground' is its floor
    const worldHeightAt = (x, z) => inHall(-x, z) ? HALL.floor : heightAt(-x, z);

    return {
      scene, heightAt: worldHeightAt, shots, viewpoints,
      ready: texturesReady(),
      grade: MOODS.dusk.grade, exposure: MOODS.dusk.exposure,
      moods: ['dusk', 'night'],
      get mood(){ return moodTarget ? 'night' : 'dusk'; },
      setMood(name){
        const M = MOODS[name === 'night' ? 'night' : 'dusk'];
        moodTarget = name === 'night' ? 1 : 0;
        this.grade = M.grade; this.exposure = M.exposure;
        return this.grade;
      },
      stats: { defenders: defenderCount, total: troops.length },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
