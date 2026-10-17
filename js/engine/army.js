// army.js — armies by the thousand. Each soldier type is one merged,
// vertex-coloured geometry whose vertices carry a body-part tag; a patched
// MeshStandardMaterial animates the parts on the GPU (breathing, glances,
// the rhythmic slam of pike-butts on stone). Soldiers are bucketed into
// spatial cells, each cell holding a near (detailed) and far (silhouette)
// InstancedMesh, swapped by camera distance.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

// part tags
const BODY = 0, HEAD = 1, ARM_R = 2, ARM_L = 3, CLOAK = 4;

// ------------------------------------------------------------- the kit ----
class Kit {
  // low: the mid-distance level — same silhouette, fewer facets, no fine detail
  constructor(low = false){ this.low = low; this.parts = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); }
  add(geo, color, o = {}){
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.s) g.scale(o.s[0], o.s[1], o.s[2]);
    if (o.r) g.applyMatrix4(this._m.makeRotationFromEuler(this._e.set(o.r[0], o.r[1], o.r[2])));
    g.translate(o.p ? o.p[0] : 0, o.p ? o.p[1] : 0, o.p ? o.p[2] : 0);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const col = new THREE.Color(color);
    const c = new Float32Array(n * 3), pm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++){
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      pm[i * 2] = o.part ?? BODY; pm[i * 2 + 1] = o.metal ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aPM', new THREE.BufferAttribute(pm, 2));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, color, o){ return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, color, o = {}){
    const seg = this.low ? Math.min(o.seg ?? 7, 5) : (o.seg ?? 7);
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open || this.low), color, o);
  }
  sph(r, color, o = {}){
    return this.add(new THREE.SphereGeometry(r, this.low ? 5 : (o.seg ?? 8), this.low ? 3 : (o.segH ?? 6)), color, o);
  }
  cone(r, h, color, o = {}){ return this.add(new THREE.ConeGeometry(r, h, this.low ? Math.min(o.seg ?? 6, 4) : (o.seg ?? 6)), color, o); }
  build(){
    let total = 0;
    for (const g of this.parts) total += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPM', 2]]){
      const arr = new Float32Array(total * size);
      let off = 0;
      for (const g of this.parts){ arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    return out;
  }
}

// ------------------------------------------------------------ palettes -----
const IRON = 0x55565b, IRON_D = 0x3a3b3f, URUK_SKIN = 0x4a3a32, LEATHER = 0x2b2320;
const GOLD = 0xa8823a, GOLD_L = 0xc49c4c;

// ---------------------------------------------------------------- uruks ----
// Saruman's sign: a palm and five splayed fingers, flat on a surface facing +z
function whiteHand(k, x, y, z, sc, part){
  const W = 0xdcd6ca;
  if (k.low){ k.box(0.1 * sc, 0.14 * sc, 0.008, W, { p: [x, y + 0.02 * sc, z], part }); return; }
  k.sph(0.05 * sc, W, { p: [x, y, z], s: [1, 1.05, 0.12], part, seg: 8, segH: 5 });
  const fingers = [[-0.056, 0.02, 0.9, 0.95], [-0.026, 0.06, 0.25, 1.1], [0.0, 0.066, 0.0, 1.2], [0.026, 0.06, -0.2, 1.1], [0.05, 0.048, -0.45, 0.9]];
  for (const [fx, fy, rot, len] of fingers){
    const L = 0.055 * sc * len;
    k.box(0.016 * sc, L, 0.008, W, { p: [x + fx * sc, y + fy * sc + L * 0.3, z], r: [0, 0, rot * 0.5], part });
  }
}
function urukBody(k, lod, o = {}){
  if (lod === 2){
    k.box(0.5, 0.9, 0.3, LEATHER, { p: [0, 0.45, 0] });
    k.box(0.62, 0.72, 0.4, IRON, { p: [0, 1.25, 0], metal: 1 });
    k.box(0.28, 0.32, 0.3, IRON_D, { p: [0, 1.76, 0.02], part: HEAD, metal: 1 });
    return;
  }
  for (const s of [-1, 1]){
    k.cyl(0.1, 0.085, 0.86, LEATHER, { p: [s * 0.13, 0.45, 0] });
    k.box(0.19, 0.13, 0.3, 0x171412, { p: [s * 0.13, 0.065, 0.05] });
    if (!k.low) k.cyl(0.11, 0.1, 0.24, IRON, { p: [s * 0.13, 0.52, 0.02], metal: 1, seg: 6 }); // greaves
  }
  k.cyl(0.27, 0.34, 0.4, IRON_D, { p: [0, 0.84, 0], metal: 1, open: true, seg: 8 });
  const chest = o.bare ? URUK_SKIN : IRON;
  k.box(0.6, 0.62, 0.38, chest, { p: [0, 1.25, 0], metal: o.bare ? 0 : 1 });
  k.box(0.5, 0.46, 0.08, o.bare ? URUK_SKIN : 0x343539, { p: [0, 1.3, 0.18], metal: o.bare ? 0 : 1 });
  if (o.bare) whiteHand(k, 0.04, 1.28, 0.226, 1.5, BODY);   // the White Hand, painted on bare skin
  k.box(0.64, 0.08, 0.42, LEATHER, { p: [0, 0.98, 0] }); // belt
  for (const s of [-1, 1]){
    k.sph(0.17, IRON, { p: [s * 0.36, 1.5, 0], s: [1.25, 0.8, 1.15], metal: 1, seg: 7, segH: 5 });
  }
  k.cyl(0.13, 0.15, 0.12, IRON_D, { p: [0, 1.6, 0], metal: 1 });
  if (o.tall){
    // the berserker's helm: a tall, smooth, pale dome, eye-holes and an open maw
    k.cyl(0.15, 0.16, 0.42, 0xb4ada0, { p: [0, 1.8, 0.02], part: HEAD, seg: 10 });
    k.sph(0.15, 0xb4ada0, { p: [0, 2.01, 0.02], s: [1, 1.3, 1], part: HEAD, seg: 10, segH: 6 });
    for (const sx of [-1, 1]) k.sph(0.025, 0x080706, { p: [sx * 0.05, 1.86, 0.165], s: [1, 1.3, 0.4], part: HEAD, seg: 6, segH: 4 });
    k.box(0.09, 0.07, 0.02, 0x0c0908, { p: [0, 1.72, 0.165], part: HEAD });
    return;
  }
  // helm: domed, face-plate with the painted white hand and eye slit
  k.cyl(0.13, 0.16, 0.3, IRON_D, { p: [0, 1.75, 0.02], part: HEAD, metal: 1, seg: 8 });
  k.sph(0.14, IRON_D, { p: [0, 1.88, 0], s: [1, 0.6, 1], part: HEAD, metal: 1, seg: 8, segH: 4 });
  k.box(0.24, 0.24, 0.05, IRON, { p: [0, 1.72, 0.14], part: HEAD, metal: 1 });
  whiteHand(k, 0, 1.7, 0.168, 0.85, HEAD);
  k.box(0.2, 0.016, 0.014, 0x050505, { p: [0, 1.775, 0.176], part: HEAD });
  if (o.crest) k.box(0.035, 0.26, 0.42, o.crest, { p: [0, 2.0, -0.02], part: HEAD });
  if (o.spikes){
    for (let i = 0; i < 5; i++) k.cone(0.03, 0.22, IRON, { p: [-0.1 + i * 0.05, 1.98, -0.02], part: HEAD, metal: 1, seg: 4 });
  }
}
function urukArms(k, lod, rightUp = 0){
  if (lod === 2){
    k.box(0.14, 0.6, 0.14, URUK_SKIN, { p: [0.4, 1.2, 0.05], part: ARM_R });
    k.box(0.14, 0.6, 0.14, URUK_SKIN, { p: [-0.4, 1.2, 0.05], part: ARM_L });
    return;
  }
  for (const [s, part] of [[1, ARM_R], [-1, ARM_L]]){
    k.cyl(0.085, 0.075, 0.34, URUK_SKIN, { p: [s * 0.4, 1.32, 0.02], part });
    k.cyl(0.085, 0.07, 0.32, IRON, { p: [s * 0.41, 1.04, 0.1], r: [-0.45, 0, 0], part, metal: 1 });
    k.sph(0.075, URUK_SKIN, { p: [s * 0.41, 0.9, 0.17 + rightUp * 0.02], part });
  }
}
function pike(k, lod){
  if (lod === 2){ k.box(0.05, 5.2, 0.05, 0x3a2e22, { p: [0.41, 2.65, 0.17], part: ARM_R }); return; }
  k.cyl(0.026, 0.03, 5.2, 0x3a2e22, { p: [0.41, 2.62, 0.17], part: ARM_R, seg: 5 });
  // the films' Uruk pike: a long blade with a barbed hook swept back on one side
  k.cone(0.06, 0.6, 0x4a4b4e, { p: [0.41, 5.5, 0.17], part: ARM_R, metal: 1, seg: 4 });
  k.box(0.035, 0.32, 0.02, 0x4a4b4e, { p: [0.5, 5.18, 0.17], r: [0, 0, -0.75], part: ARM_R, metal: 1 });
  k.box(0.12, 0.05, 0.03, 0x4a4b4e, { p: [0.41, 5.2, 0.17], part: ARM_R, metal: 1 });
}
function urukShield(k, lod){
  // tall, tapering black shield carrying the White Hand
  if (lod === 2){ k.box(0.66, 1.1, 0.06, 0x1b1a19, { p: [-0.42, 1.0, 0.24], part: ARM_L }); return; }
  const sh = new THREE.Shape();
  sh.moveTo(-0.36, 0.55); sh.lineTo(0.36, 0.55); sh.lineTo(0.3, -0.35); sh.lineTo(0, -0.62); sh.lineTo(-0.3, -0.35); sh.closePath();
  k.add(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), 0x1b1a19, { p: [-0.42, 1.0, 0.22], part: ARM_L });
  k.box(0.2, 0.2, 0.012, 0xd8d2c6, { p: [-0.42, 0.98, 0.29], part: ARM_L });
  for (let f = 0; f < 5; f++){
    const fx = -0.5 + f * 0.04, h = f === 0 ? 0.1 : 0.16;
    k.box(0.026, h, 0.012, 0xd8d2c6, { p: [f === 0 ? -0.54 : fx + 0.02, f === 0 ? 1.02 : 1.16, 0.29], r: [0, 0, f === 0 ? 0.6 : 0], part: ARM_L });
  }
  k.box(0.74, 0.04, 0.07, 0x4a4b4e, { p: [-0.42, 1.55, 0.25], part: ARM_L, metal: 1 });
}
function urukSword(k, lod){
  if (lod === 2) return;
  k.box(0.09, 0.95, 0.02, 0x5a5b5e, { p: [0.42, 0.5, 0.3], r: [0.25, 0, 0], part: ARM_R, metal: 1 });
  k.box(0.22, 0.04, 0.05, IRON, { p: [0.42, 0.95, 0.2], part: ARM_R, metal: 1 });
}
function crossbow(k, lod){
  if (lod === 2){ k.box(0.08, 0.08, 0.8, 0x3a2e22, { p: [0.15, 1.15, 0.4], part: ARM_R }); return; }
  k.box(0.07, 0.08, 0.85, 0x3a2e22, { p: [0.18, 1.12, 0.38], r: [-0.35, 0, 0], part: ARM_R });
  k.box(0.85, 0.05, 0.05, 0x4a4b4e, { p: [0.18, 1.3, 0.74], r: [-0.35, 0, 0], part: ARM_R, metal: 1 });
}
function torch(k, lod){
  k.cyl(0.035, 0.03, 1.1, 0x3a2a1a, { p: [0.41, 1.45, 0.2], part: ARM_R, seg: 5 });
  if (lod !== 2) k.cyl(0.06, 0.045, 0.2, 0x1a1410, { p: [0.41, 2.05, 0.2], part: ARM_R, seg: 6 });
}

// ---------------------------------------------------------- the elves -----
const ELF_CLOAK = 0x3a2420, ELF_HAIR = [0xd9c48c, 0x2c2018, 0xb89a62];
function elf(k, lod, o = {}){
  if (lod === 2){
    k.box(0.36, 0.95, 0.24, 0x3a3530, { p: [0, 0.48, 0] });
    k.box(0.46, 0.72, 0.3, GOLD, { p: [0, 1.3, 0], metal: 1 });
    k.box(0.52, 1.3, 0.05, ELF_CLOAK, { p: [0, 1.05, -0.18], part: CLOAK });
    k.box(0.22, 0.34, 0.24, GOLD_L, { p: [0, 1.82, 0], part: HEAD, metal: 1 });
    k.box(0.04, 1.75, 0.04, 0x5a4228, { p: [-0.34, 1.05, 0.12], part: ARM_L });
    return;
  }
  for (const s of [-1, 1]){
    k.cyl(0.075, 0.06, 0.92, 0x3a3530, { p: [s * 0.1, 0.48, 0] });
    k.box(0.12, 0.3, 0.2, 0x2a221a, { p: [s * 0.1, 0.15, 0.03] });
  }
  // dark under-robe to the knee, gold scale over the torso, split tassets
  k.cyl(0.17, 0.235, 0.5, 0x2c3036, { p: [0, 0.8, 0], open: true, seg: 9 });
  for (const s of [-1, 1]) k.box(0.16, 0.3, 0.05, GOLD, { p: [s * 0.1, 0.92, 0.15], r: [-0.12, 0, s * 0.06], metal: 1 });
  k.box(0.18, 0.32, 0.05, GOLD, { p: [0, 0.92, -0.15], r: [0.12, 0, 0], metal: 1 });
  k.cyl(0.2, 0.17, 0.6, GOLD, { p: [0, 1.33, 0], s: [1, 1, 0.72], metal: 1, seg: 9 });
  k.box(0.2, 0.36, 0.03, GOLD_L, { p: [0, 1.36, 0.135], metal: 1 });   // breastplate ridge
  k.cyl(0.15, 0.2, 0.09, GOLD_L, { p: [0, 1.66, 0], s: [1, 1, 0.8], metal: 1, seg: 9 });
  k.box(0.42, 0.06, 0.3, 0x3a2a1c, { p: [0, 1.05, 0] });
  for (const s of [-1, 1]) k.sph(0.11, GOLD_L, { p: [s * 0.23, 1.58, 0], s: [1.3, 0.7, 1.1], metal: 1, seg: 7, segH: 5 });
  // cloak hanging from the shoulders, wrapping the back
  k.add(new THREE.CylinderGeometry(0.2, 0.3, 1.38, 9, 1, true, Math.PI * 0.55, Math.PI * 0.9), ELF_CLOAK,
    { p: [0, 1.0, -0.03], part: CLOAK });
  // face, long hair, and the tall crested helm of the Galadhrim
  k.sph(0.1, 0xe2c8aa, { p: [0, 1.79, 0.03], s: [0.9, 1.15, 0.95], part: HEAD });
  const hair = o.hair ?? ELF_HAIR[0];
  k.box(0.2, 0.42, 0.05, hair, { p: [0, 1.62, -0.11], part: HEAD });
  for (const s of [-1, 1]) k.box(0.035, 0.3, 0.05, hair, { p: [s * 0.095, 1.64, 0.04], part: HEAD });
  k.sph(0.118, GOLD_L, { p: [0, 1.87, -0.005], s: [1, 1.0, 1.1], part: HEAD, metal: 1, seg: 9, segH: 6 });
  k.add(new THREE.CircleGeometry(0.2, 10, 0, Math.PI).rotateY(Math.PI / 2).scale(1, 0.85, 1.25), GOLD_L,
    { p: [0, 1.93, -0.04], r: [-0.25, 0, 0], part: HEAD, metal: 1 });
  k.add(new THREE.CircleGeometry(0.2, 10, 0, Math.PI).rotateY(-Math.PI / 2).scale(1, 0.85, 1.25), GOLD_L,
    { p: [0, 1.93, -0.04], r: [-0.25, 0, 0], part: HEAD, metal: 1 });
  for (const s of [-1, 1]) k.box(0.02, 0.13, 0.09, GOLD, { p: [s * 0.1, 1.77, 0.05], part: HEAD, metal: 1 });
  // arms
  for (const [s, part] of [[1, ARM_R], [-1, ARM_L]]){
    k.cyl(0.055, 0.05, 0.3, ELF_CLOAK, { p: [s * 0.27, 1.42, 0.0], part });
    k.cyl(0.05, 0.042, 0.3, GOLD, { p: [s * 0.29, 1.15, 0.06], r: [-0.35, 0, 0], part, metal: 1 });
    k.sph(0.045, 0xe2c8aa, { p: [s * 0.3, 1.0, 0.11], part });
  }
  // quiver + arrows
  k.cyl(0.06, 0.055, 0.6, 0x4a3220, { p: [0.12, 1.4, -0.24], r: [0, 0, -0.35], seg: 6 });
  k.box(0.1, 0.1, 0.06, 0xd8d0c0, { p: [0.23, 1.72, -0.24], r: [0, 0, -0.35] });
  if (o.sword){
    k.box(0.05, 0.85, 0.015, 0xb8b8b4, { p: [0.31, 1.32, 0.18], r: [0.1, 0, 0], part: ARM_R, metal: 1 });
  }
  // the long bow of Lórien, held upright
  const bowC = 0x5a4228;
  k.box(0.035, 0.92, 0.035, bowC, { p: [-0.33, 1.42, 0.16], r: [0, 0, -0.08], part: ARM_L });
  k.box(0.035, 0.92, 0.035, bowC, { p: [-0.33, 0.58, 0.16], r: [0, 0, 0.08], part: ARM_L });
  k.box(0.008, 1.76, 0.008, 0xd0c8b0, { p: [-0.29, 1.0, 0.16], part: ARM_L });
}

// ------------------------------------------------------- the rohirrim -----
function rohan(k, lod, o = {}){
  const tunic = o.tunic ?? 0x4f5a3a, cloak = o.cloak ?? 0x3d4a2e;
  if (lod === 2){
    k.box(0.4, 0.9, 0.26, 0x4a3a2a, { p: [0, 0.45, 0] });
    k.box(0.5, 0.7, 0.32, o.mail === false ? tunic : 0x6b6c6e, { p: [0, 1.25, 0], metal: o.mail === false ? 0 : 1 });
    k.box(0.24, 0.3, 0.26, o.helm === false ? 0xc0a060 : 0x8a8a88, { p: [0, 1.72, 0], part: HEAD, metal: 1 });
    k.box(0.04, 2.4, 0.04, 0x4a3a28, { p: [0.33, 1.3, 0.12], part: ARM_R });
    return;
  }
  for (const s of [-1, 1]){
    k.cyl(0.08, 0.07, 0.86, 0x4a3a2a, { p: [s * 0.11, 0.45, 0] });
    k.box(0.14, 0.24, 0.24, 0x2e2418, { p: [s * 0.11, 0.12, 0.03] });
  }
  const mailC = o.mail === false ? 0x5a4630 : 0x6b6c6e;
  k.cyl(0.23, 0.3, 0.5, mailC, { p: [0, 0.8, 0], metal: o.mail === false ? 0 : 0.7, open: true, seg: 8 });
  k.cyl(0.25, 0.22, 0.6, mailC, { p: [0, 1.26, 0], s: [1, 1, 0.74], metal: o.mail === false ? 0 : 0.7, seg: 8 });
  k.box(0.42, 0.48, 0.06, tunic, { p: [0, 1.22, 0.17] }); // surcoat front
  k.box(0.5, 0.06, 0.36, 0x3a2a1a, { p: [0, 1.02, 0] });
  k.box(0.08, 0.06, 0.02, 0xb89a4a, { p: [0, 1.02, 0.19], metal: 1 });
  k.add(new THREE.CylinderGeometry(0.23, 0.33, 1.28, 9, 1, true, Math.PI * 0.55, Math.PI * 0.9), cloak,
    { p: [0, 1.02, -0.03], part: CLOAK });
  k.sph(0.095, 0xd0aa88, { p: [0, 1.7, 0.02], s: [0.95, 1.12, 0.95], part: HEAD });
  if (o.helm === false){
    k.sph(0.105, o.hair ?? 0xb08c50, { p: [0, 1.75, -0.02], s: [1, 0.9, 1], part: HEAD, seg: 8, segH: 5 });
    k.box(0.16, 0.24, 0.06, o.hair ?? 0xb08c50, { p: [0, 1.62, -0.1], part: HEAD });
  } else {
    k.sph(0.115, 0x8a8a88, { p: [0, 1.76, 0], s: [1, 1.08, 1.05], part: HEAD, metal: 1, seg: 9, segH: 6 });
    k.box(0.02, 0.1, 0.26, 0xb89a4a, { p: [0, 1.88, -0.01], part: HEAD, metal: 1 });
    k.box(0.24, 0.025, 0.25, 0xb89a4a, { p: [0, 1.7, 0], part: HEAD, metal: 1 });
    for (const s of [-1, 1]) k.box(0.02, 0.14, 0.1, 0x8a8a88, { p: [s * 0.1, 1.64, 0.04], part: HEAD, metal: 1 });
  }
  for (const [s, part] of [[1, ARM_R], [-1, ARM_L]]){
    k.cyl(0.06, 0.055, 0.32, mailC, { p: [s * 0.3, 1.38, 0], part, metal: 0.6 });
    k.cyl(0.055, 0.045, 0.3, 0x3a2a1a, { p: [s * 0.31, 1.1, 0.06], r: [-0.35, 0, 0], part });
    k.sph(0.045, 0xd0aa88, { p: [s * 0.32, 0.96, 0.12], part });
  }
  if (o.bow){
    k.box(0.03, 0.75, 0.03, 0x5a4228, { p: [-0.33, 1.33, 0.14], r: [0, 0, -0.1], part: ARM_L });
    k.box(0.03, 0.75, 0.03, 0x5a4228, { p: [-0.33, 0.62, 0.14], r: [0, 0, 0.1], part: ARM_L });
  } else {
    k.cyl(0.02, 0.022, 2.6, 0x4a3a28, { p: [0.32, 1.25, 0.14], part: ARM_R, seg: 5 });
    k.cone(0.04, 0.25, 0x8a8a88, { p: [0.32, 2.66, 0.14], part: ARM_R, metal: 1, seg: 4 });
    // round shield, green with a bronze boss
    k.cyl(0.38, 0.38, 0.05, o.shieldC ?? 0x34462c, { p: [-0.36, 1.12, 0.2], r: [Math.PI / 2, 0, 0], part: ARM_L, seg: 14 });
    k.sph(0.07, 0xa88a40, { p: [-0.36, 1.12, 0.24], s: [1, 1, 0.5], part: ARM_L, metal: 1 });
  }
}

// ------------------------------------------------------------- registry ---
const KINDS = {
  urukPike:     (k, l) => { urukBody(k, l); urukArms(k, l); pike(k, l); },
  urukSword:    (k, l) => { urukBody(k, l); urukArms(k, l); urukShield(k, l); urukSword(k, l); },
  urukXbow:     (k, l) => { urukBody(k, l); urukArms(k, l); crossbow(k, l); },
  urukTorch:    (k, l) => { urukBody(k, l); urukArms(k, l); urukShield(k, l); torch(k, l); },
  urukCaptain:  (k, l) => { urukBody(k, l, { crest: 0x8a1e14 }); urukArms(k, l); urukShield(k, l); urukSword(k, l); },
  urukBerserk:  (k, l) => { urukBody(k, l, { bare: true, tall: true }); urukArms(k, l); torch(k, l); },
  elfBow:       (k, l) => elf(k, l),
  elfBowDark:   (k, l) => elf(k, l, { hair: ELF_HAIR[1] }),
  elfSword:     (k, l) => elf(k, l, { sword: true, hair: ELF_HAIR[2] }),
  rohanSpear:   (k, l) => rohan(k, l),
  rohanBow:     (k, l) => rohan(k, l, { bow: true, cloak: 0x5a4a32 }),
  rohanLevy:    (k, l) => rohan(k, l, { mail: false, helm: false, tunic: 0x6b5838, cloak: 0x4a4030, shieldC: 0x6b5032 }),
  // the old men of the Westfold, given spears (grey-headed, no mail)
  rohanOld:     (k, l) => rohan(k, l, { mail: false, helm: false, hair: 0xb6b2a8, tunic: 0x4a4436, cloak: 0x3c3a30, shieldC: 0x5a4632 }),
};
// per-kind animation: pike-thumpers slam, everyone breathes and glances
const ANIM = {
  urukPike: { thump: 0.32 }, urukSword: { thump: 0.0, shield: 1 }, urukTorch: { thump: 0.0, shield: 1 },
  urukCaptain: { thump: 0.0, shield: 1 }, urukXbow: { thump: 0.0 }, urukBerserk: { thump: 0.0 },
};
const geoCache = new Map();
function kindGeo(kind, lod){
  const key = kind + lod;
  if (!geoCache.has(key)){
    const k = new Kit(lod === 1);
    if (lod === 3){
      // the horizon level: one block of the right colour, and the pike if any
      const col = kind.startsWith('uruk') ? IRON_D : kind.startsWith('elf') ? GOLD : 0x5c5a52;
      k.box(0.55, 1.8, 0.36, col, { p: [0, 0.9, 0], metal: kind.startsWith('rohan') ? 0 : 1 });
      if (kind === 'urukPike') k.box(0.06, 5.4, 0.06, 0x3a2e22, { p: [0.41, 2.75, 0.17], part: ARM_R });
      else if (kind.includes('Spear') || kind === 'rohanOld' || kind === 'rohanLevy') k.box(0.05, 2.6, 0.05, 0x4a3a28, { p: [0.33, 1.3, 0.12], part: ARM_R });
    } else KINDS[kind](k, lod);
    geoCache.set(key, k.build());
  }
  return geoCache.get(key);
}

// one shared material per anim profile; all share the time uniform
const shared = { uTime: { value: 0 }, uBeat: { value: 0.55 }, uWet: { value: 0 } };
const matCache = new Map();
function troopMaterial(kind){
  const a = ANIM[kind] || {};
  const key = (a.thump || 0) + '|' + (a.shield || 0);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const u = Object.assign({ uThump: { value: a.thump || 0 }, uShieldSway: { value: a.shield || 0 } }, shared);
  m.userData.uniforms = u;
  m.customProgramCacheKey = () => 'troop' + key;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aPM;
        attribute float aPhase;
        uniform float uTime, uBeat, uThump, uShieldSway;
        varying float vMetal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vMetal = aPM.y;
          float part = aPM.x;
          float ph = aPhase;
          float br = sin(uTime * 1.35 + ph * 6.2832);
          // breathing and a slow shift of weight
          transformed.y *= 1.0 + br * 0.007;
          transformed.x += sin(uTime * 0.53 + ph * 17.0) * 0.025 * transformed.y * 0.5;
          if (part > 0.5 && part < 1.5){
            float yaw = sin(uTime * 0.37 + ph * 23.0) * 0.3 + sin(uTime * 0.11 + ph * 5.0) * 0.15;
            vec3 piv = vec3(0.0, 1.62, 0.0);
            vec3 q = transformed - piv;
            float c = cos(yaw), s = sin(yaw);
            q.xz = vec2(c * q.x + s * q.z, -s * q.x + c * q.z);
            transformed = q + piv;
          }
          if (part > 1.5 && part < 2.5 && uThump > 0.0){
            // lift... and slam. A wave of it rolls back through the host.
            float beat = fract(uTime * uBeat - ph);
            float lift = smoothstep(0.05, 0.45, beat) * (1.0 - smoothstep(0.82, 0.9, beat));
            transformed.y += lift * uThump;
            // every pike leans its own way: rotate about the gripping hand
            vec3 hp = vec3(0.41, 0.9, 0.17);
            vec3 q = transformed - hp;
            float az = (fract(ph * 37.13) - 0.5) * 0.34, ax = (fract(ph * 91.71) - 0.5) * 0.24;
            q.xy = vec2(cos(az) * q.x - sin(az) * q.y, sin(az) * q.x + cos(az) * q.y);
            q.zy = vec2(cos(ax) * q.z - sin(ax) * q.y, sin(ax) * q.z + cos(ax) * q.y);
            transformed = q + hp;
          }
          if (part > 2.5 && part < 3.5){
            transformed.z += sin(uTime * 0.8 + ph * 9.0) * 0.02 * (1.0 + uShieldSway);
          }
          if (part > 3.5){
            // cloaks stir in the wind, more toward the hem
            float hem = clamp(1.5 - transformed.y, 0.0, 1.5);
            transformed.z -= (sin(uTime * 2.1 + ph * 11.0 + transformed.x * 3.0) * 0.5 + 0.6) * 0.07 * hem;
          }
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vMetal;
        uniform float uWet;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.32, vMetal);
        roughnessFactor = mix(roughnessFactor, 0.48, vMetal);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, uWet);`);
  };
  matCache.set(key, m);
  return m;
}

// soft contact shadow under every soldier
let blobTex = null;
function blobMaterial(){
  if (!blobTex){
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7,
    polygonOffset: true, polygonOffsetFactor: -2 });
}
const blobGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);

// ------------------------------------------------------------ makeTroops --
// list: [{kind, x, y, z, ry, s?, phase?, tint?}] — mixed kinds welcome.
// Every kind gets three InstancedMeshes (detail / mid / far). Whenever the
// camera has moved, each soldier is re-bucketed by distance and the instance
// buffers are refilled — a dozen draw calls for the whole host, and only the
// few hundred nearest carry full detail.
export function makeTroops(list, opts = {}){
  const o = Object.assign({ near: 45, mid: 160, far: 300, blobDist: 150, shadow: false, blobs: true, seed: 5 }, opts);
  const rand = mulberry32(o.seed);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const box = new THREE.Box3();
  for (const s of list) box.expandByPoint(dummy.position.set(s.x, s.y, s.z));
  box.expandByScalar(8);
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const byKind = new Map();
  for (const s of list){
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind).push(s);
  }
  const kinds = [];
  for (const [kind, arr] of byKind){
    const n = arr.length;
    const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), phases = new Float32Array(n);
    const pos = new Float32Array(n * 3);
    arr.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, s.ry || 0, 0);
      dummy.scale.setScalar(s.s ?? 1);
      dummy.updateMatrix();
      dummy.matrix.toArray(mats, i * 16);
      const v = s.tint ?? (0.86 + rand() * 0.28);
      col.setRGB(v, v * (0.97 + rand() * 0.06), v * (0.95 + rand() * 0.08));
      cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
      phases[i] = s.phase ?? rand();
      pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z;
    });
    const levels = [0, 1, 2, 3].map(lod => {
      const src = kindGeo(kind, lod), g = new THREE.BufferGeometry();
      for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
      const ph = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      ph.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aPhase', ph);
      const im = new THREE.InstancedMesh(g, troopMaterial(kind), n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, col);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.boundingSphere = sphere.clone();
      im.castShadow = !!o.shadow && lod < 2;
      im.receiveShadow = true;
      im.count = 0;
      group.add(im);
      return im;
    });
    kinds.push({ n, mats, cols, phases, pos, levels });
  }
  let blob = null;
  if (o.blobs){
    blob = new THREE.InstancedMesh(blobGeo, blobMaterial(), list.length);
    blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blob.boundingSphere = sphere.clone();
    blob.renderOrder = 1;
    blob.count = 0;
    group.add(blob);
  }
  const last = new THREE.Vector3(1e9, 0, 0);
  const near2 = o.near * o.near, mid2 = o.mid * o.mid, far2 = o.far * o.far, blob2 = o.blobDist * o.blobDist;
  function rebucket(cam){
    const cx = cam.x, cy = cam.y, cz = cam.z;
    let nb = 0;
    const bm = blob ? blob.instanceMatrix.array : null;
    for (const K of kinds){
      const c = [0, 0, 0, 0];
      const L = K.levels;
      const M = L.map(m => m.instanceMatrix.array), C = L.map(m => m.instanceColor.array), P = L.map(m => m.geometry.attributes.aPhase.array);
      for (let i = 0; i < K.n; i++){
        const dx = K.pos[i * 3] - cx, dy = K.pos[i * 3 + 1] - cy, dz = K.pos[i * 3 + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const l = d2 < near2 ? 0 : d2 < mid2 ? 1 : d2 < far2 ? 2 : 3;
        const j = c[l]++;
        M[l].set(K.mats.subarray(i * 16, i * 16 + 16), j * 16);
        C[l][j * 3] = K.cols[i * 3]; C[l][j * 3 + 1] = K.cols[i * 3 + 1]; C[l][j * 3 + 2] = K.cols[i * 3 + 2];
        P[l][j] = K.phases[i];
        if (bm && d2 < blob2){
          // flat contact shadow under the feet: identity rotation, same scale
          const sc = Math.hypot(K.mats[i * 16], K.mats[i * 16 + 2]);
          bm.set([sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, K.pos[i * 3], K.pos[i * 3 + 1] + 0.04, K.pos[i * 3 + 2], 1], nb * 16);
          nb++;
        }
      }
      L.forEach((m, l) => {
        m.count = c[l];
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
        m.geometry.attributes.aPhase.needsUpdate = true;
      });
    }
    if (blob){ blob.count = nb; blob.instanceMatrix.needsUpdate = true; }
  }
  return {
    group, count: list.length,
    update(t, camera){
      shared.uTime.value = t;
      if (!camera) return;
      if (camera.position.distanceToSquared(last) > 4){
        last.copy(camera.position);
        rebucket(last);
      }
    },
  };
}
export function setTroopWetness(w){ shared.uWet.value = w; }
export const TROOP_KINDS = Object.keys(KINDS);
