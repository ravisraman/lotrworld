// characters.js — the living cast. Procedural low-poly rigs whose silhouettes
// read correctly at cinematic distance: robes, cloaks, hats, spears, banners.
// A Crowd system walks them along paths, snapped to terrain, with idle poses.
import * as THREE from 'three';
import { mulberry32, Path, clamp, lerp } from './util.js';

const MAT_CACHE = new Map();
export function mat(color, opts = {}){
  const key = color + '|' + JSON.stringify(opts);
  if (!MAT_CACHE.has(key)){
    MAT_CACHE.set(key, new THREE.MeshStandardMaterial(Object.assign({
      color, roughness: 0.92, metalness: 0.0,
    }, opts)));
  }
  return MAT_CACHE.get(key);
}
const metal = (c) => mat(c, { roughness: 0.35, metalness: 0.85 });

function box(w, h, d, material){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  return m;
}
function sph(r, material, ws = 1, hs = 1){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material);
  m.scale.set(ws, hs, ws);
  m.castShadow = true;
  return m;
}
function cone(r, h, material, seg = 8){
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, material, seg = 7){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ rig ----
// makePerson(cfg) -> Group with .anim = {mode, speed, phase, parts...}
// Proportions are parameterized on height so hobbits/dwarves/elves read right.
export function makePerson(cfg = {}){
  const c = Object.assign({
    height: 1.8,
    bulk: 1.0,               // width multiplier — dwarves 1.35, elves 0.9
    skin: 0xc8a080, hair: 0x4a3520, hairLen: 0.5,   // 0 none .. 1 long
    beard: 0, beardColor: null,
    tunic: 0x5a4a35, pants: 0x3a3028, boots: 0x2a2018,
    robe: null,              // full-length robe color (wizards, elves)
    cloak: null, hood: false, hoodUp: false,
    hat: null,               // 'wizard'
    helm: null,              // 'gondor' | 'rohan' | 'orc'
    prop: null,              // 'staff'|'spear'|'sword'|'axe'|'bow'|'lantern'|'pitchfork'|'basket'|'pipe'|'torch'
    shield: null,            // color -> round shield on back
    glow: 0,                 // elven shimmer emissive
    pose: 'walk',
  }, cfg);

  const H = c.height, B = c.bulk;
  const legH = H * 0.46, torsoH = H * 0.34, headR = H * 0.085;
  const shoulderW = H * 0.24 * B;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = legH;
  root.add(body);

  const skinM = mat(c.skin);
  const tunicM = c.robe ? mat(c.robe) : mat(c.tunic);
  if (c.glow){ tunicM.emissive = new THREE.Color(c.robe || c.tunic); tunicM.emissiveIntensity = c.glow; }

  // torso
  const torso = box(shoulderW, torsoH, shoulderW * 0.55, tunicM);
  torso.position.y = torsoH / 2;
  torso.geometry.translate(0, 0, 0);
  body.add(torso);

  // head
  const headG = new THREE.Group();
  headG.position.y = torsoH + headR * 0.9;
  const head = sph(headR, skinM, 0.92, 1.05);
  headG.add(head);
  if (c.hairLen > 0 && !c.hoodUp && c.hat !== 'wizard' && !c.helm){
    const hair = sph(headR * 1.06, mat(c.hair), 0.95, 0.9 + c.hairLen * 0.35);
    hair.position.y = headR * 0.12; hair.position.z = -headR * 0.12;
    headG.add(hair);
    if (c.hairLen > 0.6){
      const back = box(headR * 1.5, headR * 2.4 * c.hairLen, headR * 0.5, mat(c.hair));
      back.position.set(0, -headR * 0.9 * c.hairLen, -headR * 0.75);
      headG.add(back);
    }
  }
  if (c.beard > 0){
    const bm = mat(c.beardColor ?? c.hair);
    const beard = cone(headR * 0.75, headR * 2.6 * c.beard, bm, 6);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -headR * (0.4 + c.beard * 0.85), headR * 0.42);
    headG.add(beard);
  }
  if (c.hat === 'wizard'){
    const brim = cyl(headR * 2.1, headR * 2.3, headR * 0.28, mat(c.cloak || 0x59544c));
    brim.position.y = headR * 0.62;
    const peak = cone(headR * 1.15, headR * 3.4, brim.material, 8);
    peak.position.y = headR * 2.1;
    peak.rotation.x = 0.16;
    headG.add(brim, peak);
  }
  if (c.helm === 'gondor'){
    const hm = metal(0xb8bcc4);
    const cap = sph(headR * 1.12, hm, 0.95, 1.05);
    cap.position.y = headR * 0.15;
    const crest = box(headR * 0.16, headR * 1.1, headR * 1.6, hm);
    crest.position.y = headR * 1.1;
    // white wings
    const wm = mat(0xe8e6df);
    for (const s of [-1, 1]){
      const wing = box(headR * 0.1, headR * 0.85, headR * 1.3, wm);
      wing.position.set(s * headR * 0.95, headR * 0.55, -headR * 0.2);
      wing.rotation.z = s * -0.5; wing.rotation.y = s * 0.3;
      headG.add(wing);
    }
    headG.add(cap, crest);
  } else if (c.helm === 'rohan'){
    const hm = metal(0x9a8a5a);
    const cap = sph(headR * 1.1, hm, 0.95, 1.0);
    cap.position.y = headR * 0.2;
    const tail = cyl(headR * 0.2, headR * 0.05, headR * 1.6, mat(0xd8cfb8));
    tail.position.set(0, headR * 0.4, -headR * 1.0);
    tail.rotation.x = 0.9;
    headG.add(cap, tail);
  } else if (c.helm === 'orc'){
    const hm = mat(0x3a3632, { roughness: 0.6, metalness: 0.5 });
    const cap = cone(headR * 1.15, headR * 1.6, hm, 6);
    cap.position.y = headR * 0.45;
    headG.add(cap);
  }
  if (c.hoodUp){
    const hood = cone(headR * 1.5, headR * 2.6, mat(c.cloak || 0x3a4034), 7);
    hood.position.y = headR * 0.45;
    hood.rotation.x = 0.22;
    headG.add(hood);
  }
  body.add(headG);

  // arms
  const armL = H * 0.36, armR2 = H * 0.03 * B;
  function makeArm(side){
    const g = new THREE.Group();
    g.position.set(side * (shoulderW / 2 + armR2 * 0.8), torsoH * 0.92, 0);
    const upper = cyl(armR2, armR2 * 0.9, armL * 0.52, tunicM);
    upper.position.y = -armL * 0.26;
    const fore = cyl(armR2 * 0.85, armR2 * 0.7, armL * 0.48, c.robe ? tunicM : skinM);
    fore.position.y = -armL * 0.52 - armL * 0.24;
    const hand = sph(armR2 * 1.1, skinM);
    hand.position.y = -armL * 1.02;
    g.add(upper, fore, hand);
    return g;
  }
  const armLG = makeArm(-1), armRG = makeArm(1);
  body.add(armLG, armRG);

  // legs (hidden under a robe but still animate the hem via sway)
  const legR3 = H * 0.035 * B;
  function makeLeg(side){
    const g = new THREE.Group();
    g.position.set(side * shoulderW * 0.22, 0, 0);
    const thigh = cyl(legR3, legR3 * 0.9, legH * 0.52, mat(c.pants));
    thigh.position.y = -legH * 0.26;
    const shin = cyl(legR3 * 0.85, legR3 * 0.7, legH * 0.46, mat(c.pants));
    shin.position.y = -legH * 0.75;
    const foot = box(legR3 * 2.2, legR3 * 1.1, legR3 * 3.4, mat(c.boots));
    foot.position.set(0, -legH * 0.98, legR3 * 0.9);
    g.add(thigh, shin, foot);
    return g;
  }
  const legLG = makeLeg(-1), legRG = makeLeg(1);
  legLG.position.y = legH; legRG.position.y = legH;
  root.add(legLG, legRG);

  // robe skirt
  if (c.robe){
    const skirt = cone(shoulderW * 0.72, legH * 1.06, tunicM, 9);
    skirt.position.y = legH * 0.5;
    root.add(skirt);
    legLG.visible = legRG.visible = false;
  }

  // cloak
  if (c.cloak){
    const ck = new THREE.Mesh(
      new THREE.PlaneGeometry(shoulderW * 1.35, H * 0.62, 4, 6),
      mat(c.cloak, { side: THREE.DoubleSide }));
    const p = ck.geometry.attributes.position;
    for (let i = 0; i < p.count; i++){
      const v = p.getY(i) / (H * 0.62) + 0.5;
      p.setZ(i, -(1 - v) * H * 0.1);
      p.setX(i, p.getX(i) * (1 + (1 - v) * 0.5));
    }
    ck.geometry.computeVertexNormals();
    ck.castShadow = true;
    ck.position.set(0, torsoH * 0.62, -shoulderW * 0.3);
    body.add(ck);
  }

  // props
  let prop = null;
  const woodM = mat(0x5a442e);
  if (c.prop === 'staff'){
    prop = cyl(0.022, 0.03, H * 0.98, woodM, 6);
    const knot = sph(0.05, woodM);
    knot.position.y = H * 0.5;
    prop.add(knot);
    prop.position.set(0, -H * 0.18, 0.03);
    armRG.add(prop); armRG.rotation.x = -0.5;
  } else if (c.prop === 'spear'){
    prop = cyl(0.018, 0.024, H * 1.35, woodM, 6);
    const tip = cone(0.045, 0.18, metal(0xc0c4cc), 6);
    tip.position.y = H * 0.7;
    prop.add(tip);
    prop.position.set(0, -H * 0.1, 0.02);
    armRG.add(prop); armRG.rotation.x = -0.12;
  } else if (c.prop === 'sword'){
    prop = box(0.035, H * 0.42, 0.012, metal(0xc8ccd4));
    const guard = box(0.12, 0.025, 0.03, metal(0x8a7a4a));
    guard.position.y = -H * 0.2;
    prop.add(guard);
    prop.position.set(0, -armL * 1.0 - H * 0.18, 0.05);
    prop.rotation.x = 0.4;
    armRG.add(prop);
  } else if (c.prop === 'axe'){
    prop = cyl(0.02, 0.026, H * 0.5, woodM, 6);
    const blade = box(0.05, 0.16, 0.26, metal(0xaab0b8));
    blade.position.y = H * 0.2;
    prop.add(blade);
    prop.position.set(0, -armL * 0.9, 0.06);
    prop.rotation.x = 0.5;
    armRG.add(prop);
  } else if (c.prop === 'bow'){
    prop = new THREE.Mesh(new THREE.TorusGeometry(H * 0.26, 0.014, 5, 12, Math.PI), woodM);
    prop.rotation.z = Math.PI / 2;
    prop.position.set(0, torsoH * 0.5, -shoulderW * 0.42);
    body.add(prop); prop = null;
  } else if (c.prop === 'lantern'){
    prop = new THREE.Group();
    const cage = box(0.1, 0.14, 0.1, metal(0x6a6258));
    const lite = sph(0.045, mat(0xffe8b0, { emissive: 0xffc86a, emissiveIntensity: 2.4 }));
    const light = new THREE.PointLight(0xffc87a, 3.2, 9, 2);
    prop.add(cage, lite, light);
    prop.position.set(0, -armL * 1.05, 0.05);
    armLG.add(prop); armLG.rotation.x = -0.35;
  } else if (c.prop === 'torch'){
    prop = cyl(0.02, 0.028, H * 0.35, woodM, 6);
    const fl = cone(0.06, 0.16, mat(0xffa030, { emissive: 0xff7a20, emissiveIntensity: 3.0 }), 6);
    fl.position.y = H * 0.22;
    const light = new THREE.PointLight(0xff9040, 4, 10, 2);
    light.position.y = H * 0.22;
    prop.add(fl, light);
    prop.position.set(0, -armL * 0.85, 0.04);
    prop.rotation.x = 0.35;
    armRG.add(prop);
  } else if (c.prop === 'pitchfork' || c.prop === 'hoe'){
    prop = cyl(0.016, 0.02, H * 0.8, woodM, 6);
    const headBox = box(0.16, 0.03, 0.03, metal(0x8a8378));
    headBox.position.y = H * 0.4;
    prop.add(headBox);
    prop.position.set(0, -H * 0.12, 0.03);
    armRG.add(prop); armRG.rotation.x = -0.4;
  } else if (c.prop === 'basket'){
    prop = cyl(0.11, 0.08, 0.12, mat(0x9a7a4a), 8);
    prop.position.set(0, -armL * 1.05, 0.02);
    armLG.add(prop); armLG.rotation.x = -0.3;
  } else if (c.prop === 'pipe'){
    prop = cyl(0.008, 0.008, 0.16, woodM, 5);
    prop.rotation.x = -1.1;
    prop.position.set(headR * 0.3, torsoH + headR * 0.5, headR * 0.9);
    body.add(prop); prop = null;
  }
  if (c.shield){
    const sh = cyl(H * 0.14, H * 0.14, 0.03, mat(c.shield), 12);
    sh.rotation.x = Math.PI / 2;
    sh.position.set(0, torsoH * 0.45, -shoulderW * 0.45);
    body.add(sh);
  }

  root.traverse(o => { o.castShadow = true; });

  root.userData.anim = {
    mode: c.pose, phase: Math.random() * 6.28, speedMul: 1,
    body, headG, armLG, armRG, legLG, legRG, legH, H,
  };
  applyPose(root, c.pose);
  return root;
}

export function applyPose(rig, pose){
  const a = rig.userData.anim;
  a.mode = pose;
  if (pose === 'sit'){
    a.body.position.y = a.legH * 0.55;
    a.legLG.rotation.x = -1.5; a.legRG.rotation.x = -1.5;
    a.legLG.position.y = a.legH * 0.55; a.legRG.position.y = a.legH * 0.55;
  } else if (pose === 'ride'){
    a.legLG.rotation.x = -0.9; a.legRG.rotation.x = -0.9;
    a.legLG.rotation.z = 0.35; a.legRG.rotation.z = -0.35;
  } else if (pose === 'raise'){ // staff raised — YOU SHALL NOT PASS
    a.armRG.rotation.x = -2.6;
    a.armLG.rotation.x = -0.7; a.armLG.rotation.z = 0.5;
  } else if (pose === 'kneel'){
    a.body.position.y = a.legH * 0.7;
    a.legLG.rotation.x = -1.7; a.legRG.rotation.x = 0.5;
  }
}

// Per-frame animation of one rig.
export function animatePerson(rig, t, walking, speed = 1){
  const a = rig.userData.anim;
  if (!a) return;
  if (a.mode === 'sit' || a.mode === 'kneel') return;
  if (a.mode === 'ride'){
    a.body.position.y = a.legH + Math.sin(t * 9) * 0.03;
    return;
  }
  if (walking){
    const f = t * 6.4 * speed + a.phase;
    const s = Math.sin(f), cS = Math.cos(f);
    const amp = 0.55;
    a.legLG.rotation.x = s * amp;
    a.legRG.rotation.x = -s * amp;
    if (a.mode !== 'raise'){
      a.armLG.rotation.x = -s * amp * 0.7 + (a.armLG.rotation.x_base || 0);
      if (!a.armRG.children.length || a.mode === 'walk') a.armRG.rotation.x = s * amp * 0.55;
    }
    a.body.position.y = a.legH + Math.abs(cS) * 0.045 * a.H;
    a.body.rotation.z = s * 0.03;
  } else {
    const f = t * 1.6 + a.phase;
    a.body.position.y = a.legH + Math.sin(f) * 0.008 * a.H;
    a.body.rotation.z = Math.sin(f * 0.7) * 0.015;
    if (a.mode === 'walk'){ a.legLG.rotation.x = a.legRG.rotation.x = 0; }
  }
}

// ---------------------------------------------------------------- horses ---
export function makeHorse(cfg = {}){
  const c = Object.assign({ color: 0x6b4a2f, mane: 0x2a1d12, white: false }, cfg);
  if (c.white){ c.color = 0xdcd8d0; c.mane = 0xbdb8ae; }
  const g = new THREE.Group();
  const bodyM = mat(c.color);
  const maneM = mat(c.mane);

  const body = new THREE.Group();
  body.position.y = 1.15;
  const barrel = sph(0.52, bodyM, 1.55, 0.95);
  barrel.rotation.z = 0; barrel.scale.z = 0.85;
  const chest = sph(0.4, bodyM, 1, 1);
  chest.position.set(0.62, 0.08, 0);
  const rump = sph(0.42, bodyM, 1, 1);
  rump.position.set(-0.62, 0.04, 0);
  const neck = cyl(0.16, 0.26, 0.85, bodyM);
  neck.position.set(0.88, 0.5, 0);
  neck.rotation.z = -0.7;
  const headG = new THREE.Group();
  headG.position.set(1.18, 0.86, 0);
  const skull = sph(0.17, bodyM, 1, 1.1);
  const muzzle = cyl(0.09, 0.13, 0.34, bodyM);
  muzzle.rotation.z = -1.9;
  muzzle.position.set(0.22, -0.08, 0);
  const earL = cone(0.045, 0.14, bodyM, 5); earL.position.set(-0.04, 0.2, 0.08);
  const earR = earL.clone(); earR.position.z = -0.08;
  headG.add(skull, muzzle, earL, earR);
  const mane = box(0.1, 0.5, 0.16, maneM);
  mane.position.set(0.82, 0.72, 0);
  mane.rotation.z = -0.7;
  const tail = cone(0.09, 0.75, maneM, 6);
  tail.rotation.x = Math.PI; tail.rotation.z = -0.45;
  tail.position.set(-1.05, 0.05, 0);
  body.add(barrel, chest, rump, neck, headG, mane, tail);
  g.add(body);

  const legs = [];
  for (const [x, z] of [[0.55, 0.22], [0.55, -0.22], [-0.55, 0.22], [-0.55, -0.22]]){
    const lg = new THREE.Group();
    lg.position.set(x, 1.05, z);
    const upper = cyl(0.09, 0.07, 0.55, bodyM);
    upper.position.y = -0.27;
    const lower = cyl(0.055, 0.045, 0.5, bodyM);
    lower.position.y = -0.78;
    const hoof = cyl(0.06, 0.07, 0.1, mat(0x241a10));
    hoof.position.y = -1.06;
    lg.add(upper, lower, hoof);
    legs.push(lg);
    g.add(lg);
  }
  g.traverse(o => { o.castShadow = true; });
  g.userData.anim = { legs, body, headG, phase: Math.random() * 6.28 };
  g.userData.mount = new THREE.Group();
  g.userData.mount.position.set(0.05, 1.72, 0);
  g.add(g.userData.mount);
  return g;
}

export function animateHorse(h, t, moving, gallop = 1){
  const a = h.userData.anim;
  if (!a) return;
  if (moving){
    const f = t * 11 * gallop + a.phase;
    a.legs[0].rotation.x = Math.sin(f) * 0.75;
    a.legs[1].rotation.x = Math.sin(f + 0.4) * 0.75;
    a.legs[2].rotation.x = Math.sin(f + Math.PI) * 0.7;
    a.legs[3].rotation.x = Math.sin(f + Math.PI + 0.4) * 0.7;
    a.body.position.y = 1.15 + Math.abs(Math.sin(f * 0.5)) * 0.1;
    a.headG.rotation.z = Math.sin(f * 0.5) * 0.12;
  } else {
    const f = t * 1.2 + a.phase;
    a.body.position.y = 1.15 + Math.sin(f) * 0.012;
    a.headG.rotation.z = Math.sin(f * 0.5) * 0.05 - (Math.sin(f * 0.13 + a.phase) > 0.55 ? 0.5 : 0); // graze dip
  }
}

// ---------------------------------------------------------------- balrog ---
export function makeBalrog(){
  const g = new THREE.Group();
  const S = 7.2; // ~13m tall demon
  // pure silhouette black — no light touches the body of Durin's Bane
  const coreM = new THREE.MeshBasicMaterial({ color: 0x080403 });
  const fireM = new THREE.MeshStandardMaterial({
    color: 0x1a0d05, emissive: 0xff6a1a, emissiveIntensity: 2.6, roughness: 1,
  });

  const torso = sph(S * 0.34, coreM, 1.15, 1.35);
  torso.position.y = S * 1.05;
  const head = sph(S * 0.16, coreM, 0.9, 1.1);
  head.position.y = S * 1.62;
  // horns — the great backswept crown
  for (const s of [-1, 1]){
    const horn = cone(S * 0.05, S * 0.5, coreM, 6);
    horn.position.set(s * S * 0.16, S * 1.72, -S * 0.06);
    horn.rotation.z = s * 1.15; horn.rotation.x = -0.5;
    g.add(horn);
    const horn2 = cone(S * 0.035, S * 0.3, coreM, 6);
    horn2.position.set(s * S * 0.1, S * 1.78, S * 0.02);
    horn2.rotation.z = s * 0.7; horn2.rotation.x = -0.3;
    g.add(horn2);
  }
  // burning eyes + maw + mane of flame + chest cracks
  for (const s of [-1, 1]){
    const eye = sph(S * 0.042, fireM);
    eye.position.set(s * S * 0.065, S * 1.65, S * 0.13);
    g.add(eye);
  }
  const maw = box(S * 0.14, S * 0.035, S * 0.05, fireM);
  maw.position.set(0, S * 1.55, S * 0.13);
  g.add(maw);
  for (let i = 0; i < 7; i++){
    const flame = cone(S * 0.045, S * 0.28, fireM, 5);
    const a = (i / 6 - 0.5) * 2.4;
    flame.position.set(Math.sin(a) * S * 0.2, S * 1.78 + Math.cos(a) * S * 0.06, -S * 0.08);
    flame.rotation.z = -a * 0.5;
    flame.rotation.x = -0.4;
    g.add(flame);
  }
  for (const [cx2, cy2, rz] of [[-0.1, 1.18, 0.5], [0.08, 1.05, -0.4], [0.0, 1.28, 0.1]]){
    const crack = box(S * 0.03, S * 0.3, S * 0.02, fireM);
    crack.position.set(cx2 * S, cy2 * S, S * 0.36);
    crack.rotation.z = rz;
    g.add(crack);
  }

  // arms
  const arms = [];
  for (const s of [-1, 1]){
    const arm = new THREE.Group();
    arm.position.set(s * S * 0.4, S * 1.34, 0);
    const upper = cyl(S * 0.09, S * 0.11, S * 0.55, coreM);
    upper.position.y = -S * 0.27;
    const fore = cyl(S * 0.07, S * 0.09, S * 0.5, coreM);
    fore.position.y = -S * 0.75;
    const fist = sph(S * 0.11, coreM);
    fist.position.y = -S * 1.0;
    arm.add(upper, fore, fist);
    arm.rotation.z = s * 0.35;
    arms.push(arm);
    g.add(arm);
  }
  // legs
  for (const s of [-1, 1]){
    const leg = cyl(S * 0.11, S * 0.15, S * 0.72, coreM);
    leg.position.set(s * S * 0.2, S * 0.36, 0);
    g.add(leg);
  }
  g.add(torso, head);

  // wings of shadow — noise-alpha planes
  const wingMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; uniform float uTime;
      void main(){ vUv = uv;
        vec3 p = position;
        p.z += sin(uTime * 1.1 + uv.x * 4.0) * 0.5 * uv.x;
        p.y += sin(uTime * 0.8 + uv.x * 3.0) * 0.8 * uv.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      varying vec2 vUv; uniform float uTime;
      void main(){
        float n = n2(vUv * 5.0 + vec2(uTime * 0.25, 0.0)) * 0.6
                + n2(vUv * 11.0 - vec2(0.0, uTime * 0.4)) * 0.4;
        float a = smoothstep(0.25, 0.7, n) * (1.0 - vUv.x * 0.55);
        a *= smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        vec3 col = mix(vec3(0.03,0.015,0.01), vec3(0.55,0.16,0.03), n * 0.55);
        gl_FragColor = vec4(col, a * 0.85);
      }`,
  });
  const wings = [];
  for (const s of [-1, 1]){
    const wg = new THREE.Mesh(new THREE.PlaneGeometry(S * 2.7, S * 1.8, 8, 4), wingMat);
    wg.position.set(s * S * 0.28, S * 1.45, -S * 0.25);
    wg.rotation.y = s * -0.9 + (s > 0 ? Math.PI : 0);
    wg.rotation.z = s * 0.35;
    wings.push(wg);
    g.add(wg);
  }

  // fire whip
  const whipPts = [];
  for (let i = 0; i <= 10; i++) whipPts.push(new THREE.Vector3(S * 0.4 + i * S * 0.22, S * 0.4 - Math.sin(i * 0.4) * S * 0.3, i * S * 0.06));
  const whipCurve = new THREE.CatmullRomCurve3(whipPts);
  const whip = new THREE.Mesh(new THREE.TubeGeometry(whipCurve, 24, S * 0.03, 5), fireM);
  g.add(whip);

  // inner fire glow
  const light = new THREE.PointLight(0xff5a1a, 260, S * 14, 2);
  light.position.y = S * 1.2;
  g.add(light);

  g.userData.anim = { arms, wings, wingMat, torso, light, S };
  return g;
}
export function animateBalrog(b, t){
  const a = b.userData.anim;
  a.wingMat.uniforms.uTime.value = t;
  a.arms[0].rotation.x = Math.sin(t * 0.9) * 0.2 - 0.15;
  a.arms[1].rotation.x = Math.sin(t * 0.9 + 1.5) * 0.25 - 0.55;
  b.position.y += 0; // breathing handled via torso
  a.torso.scale.y = 1.35 + Math.sin(t * 1.7) * 0.03;
  a.light.intensity = 220 + Math.sin(t * 7.3) * 40 + Math.sin(t * 13.7) * 25;
}

// ---------------------------------------------------------------- flyers ---
// eagle / fellbeast / crow — simple flapping silhouettes for the sky.
export function makeFlyer(kind = 'eagle'){
  const cfgs = {
    eagle:     { body: 0x6a4a2a, wing: 0x7d5c38, size: 1.0, span: 3.4 },
    fellbeast: { body: 0x2c2a30, wing: 0x38343c, size: 3.6, span: 13.0 },
    crow:      { body: 0x181818, wing: 0x222222, size: 0.24, span: 0.8 },
  };
  const c = cfgs[kind];
  const g = new THREE.Group();
  const bm = mat(c.body);
  const body = sph(c.size * 0.32, bm, 1.9, 0.8);
  const head = sph(c.size * 0.16, bm);
  head.position.set(c.size * 0.62, c.size * 0.1, 0);
  g.add(body, head);
  if (kind === 'fellbeast'){
    const neck = cyl(c.size * 0.07, c.size * 0.12, c.size * 0.8, bm);
    neck.position.set(c.size * 0.45, c.size * 0.12, 0);
    neck.rotation.z = -1.1;
    const tail = cyl(c.size * 0.02, c.size * 0.09, c.size * 1.5, bm);
    tail.position.set(-c.size * 0.85, 0, 0);
    tail.rotation.z = 1.35;
    head.position.set(c.size * 0.85, c.size * 0.34, 0);
    g.add(neck, tail);
  }
  const wings = [];
  const wm = mat(c.wing, { side: THREE.DoubleSide });
  for (const s of [-1, 1]){
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(c.span / 2, c.size * 0.85, 4, 1), wm);
    wing.geometry.translate(s * c.span / 4, 0, 0);
    wing.rotation.x = -Math.PI / 2;
    wing.position.y = c.size * 0.1;
    wings.push(wing);
    g.add(wing);
  }
  g.traverse(o => { o.castShadow = kind !== 'crow'; });
  g.userData.anim = { wings, phase: Math.random() * 6.28, flap: kind === 'crow' ? 14 : kind === 'eagle' ? 3.2 : 2.1 };
  return g;
}
export function animateFlyer(f, t){
  const a = f.userData.anim;
  const w = Math.sin(t * a.flap + a.phase) * 0.55;
  a.wings[0].rotation.y = w;
  a.wings[1].rotation.y = -w;
}

// ------------------------------------------------------------- named cast --
export const Cast = {
  gandalf: (o = {}) => makePerson(Object.assign({
    height: 1.8, skin: 0xd0b090, hair: 0xb8b2a6, hairLen: 0.85,
    beard: 1.0, beardColor: 0xc5bfb4, robe: 0x59544c, cloak: 0x59544c,
    hat: 'wizard', prop: 'staff',
  }, o)),
  gandalfWhite: (o = {}) => makePerson(Object.assign({
    height: 1.8, skin: 0xd0b090, hair: 0xe0dcd4, hairLen: 0.85,
    beard: 1.0, beardColor: 0xe6e2da, robe: 0xdfdbd2, cloak: 0xdfdbd2,
    prop: 'staff', glow: 0.12,
  }, o)),
  frodo: (o = {}) => makePerson(Object.assign({
    height: 1.06, skin: 0xd8b498, hair: 0x50351e, hairLen: 0.55,
    tunic: 0x3f4a2e, pants: 0x5a4632, boots: 0xc8a080, cloak: 0x4a5844, hoodUp: false,
  }, o)),
  sam: (o = {}) => makePerson(Object.assign({
    height: 1.08, bulk: 1.15, skin: 0xdcb08a, hair: 0x9a6b38, hairLen: 0.5,
    tunic: 0x8a6b3c, pants: 0x5f4d35, boots: 0xc8a080, cloak: 0x4a5844,
  }, o)),
  merry: (o = {}) => makePerson(Object.assign({
    height: 1.1, skin: 0xd8b498, hair: 0x8a6530, hairLen: 0.5,
    tunic: 0x6b6b3a, pants: 0x4a3d2c, boots: 0xc8a080, cloak: 0x4a5844,
  }, o)),
  pippin: (o = {}) => makePerson(Object.assign({
    height: 1.04, skin: 0xd8b498, hair: 0x6a4a28, hairLen: 0.55,
    tunic: 0x4a5a6a, pants: 0x3a3028, boots: 0xc8a080, cloak: 0x4a5844,
  }, o)),
  aragorn: (o = {}) => makePerson(Object.assign({
    height: 1.85, skin: 0xc0987a, hair: 0x3a2c1c, hairLen: 0.7, beard: 0.25,
    tunic: 0x3a352c, pants: 0x2c2620, boots: 0x241e16, cloak: 0x3c3830, prop: 'sword',
  }, o)),
  boromir: (o = {}) => makePerson(Object.assign({
    height: 1.83, bulk: 1.1, skin: 0xc8a080, hair: 0x8a6034, hairLen: 0.6, beard: 0.2,
    tunic: 0x5a3428, pants: 0x3a2c20, cloak: 0x4a2c20, shield: 0x6b5434, prop: 'sword',
  }, o)),
  legolas: (o = {}) => makePerson(Object.assign({
    height: 1.85, bulk: 0.88, skin: 0xe0c8a8, hair: 0xe8d8a0, hairLen: 0.9,
    tunic: 0x3a4630, pants: 0x303626, boots: 0x2c2a20, cloak: 0x424c3c, prop: 'bow',
  }, o)),
  gimli: (o = {}) => makePerson(Object.assign({
    height: 1.35, bulk: 1.45, skin: 0xc89078, hair: 0x8a3c1a, hairLen: 0.6,
    beard: 1.1, beardColor: 0x9a4520, tunic: 0x4c4438, pants: 0x35302a,
    helm: 'rohan', prop: 'axe',
  }, o)),
  galadriel: (o = {}) => makePerson(Object.assign({
    height: 1.82, bulk: 0.85, skin: 0xeedcc4, hair: 0xf0e2b0, hairLen: 1.0,
    robe: 0xf6f3ea, glow: 0.85,
  }, o)),
  elrond: (o = {}) => makePerson(Object.assign({
    height: 1.85, bulk: 0.95, skin: 0xd8bc9c, hair: 0x2c2018, hairLen: 0.95,
    robe: 0x6a2c2c, cloak: 0x8a5c2c,
  }, o)),
  arwen: (o = {}) => makePerson(Object.assign({
    height: 1.75, bulk: 0.82, skin: 0xecd4bc, hair: 0x241a12, hairLen: 1.0,
    robe: 0x5c6a8a, glow: 0.08,
  }, o)),
  eowyn: (o = {}) => makePerson(Object.assign({
    height: 1.7, bulk: 0.85, skin: 0xe8d0b4, hair: 0xe2cf9a, hairLen: 1.0,
    robe: 0xe8e2d4, cloak: 0x8a8578,
  }, o)),
  theoden: (o = {}) => makePerson(Object.assign({
    height: 1.8, skin: 0xd0aa88, hair: 0xc9c2b2, hairLen: 0.8, beard: 0.5,
    tunic: 0x5a4a2c, cloak: 0x6b3a2a, prop: 'sword',
  }, o)),
  saruman: (o = {}) => makePerson(Object.assign({
    height: 1.86, skin: 0xd8c4ac, hair: 0xe8e4dc, hairLen: 1.0,
    beard: 1.2, beardColor: 0xeceae2, robe: 0xe8e6e0, prop: 'staff',
  }, o)),
  gollum: (o = {}) => {
    const g = makePerson(Object.assign({
      height: 0.95, bulk: 0.62, skin: 0x9aa08a, hair: 0x6a6a5a, hairLen: 0.12,
      tunic: 0x8a8878, pants: 0x8a8878, boots: 0x9aa08a, pose: 'kneel',
    }, o));
    return g;
  },
  // generics ---------------------------------------------------------------
  hobbit(rand){
    const skins = [0xd8b498, 0xdcb08a, 0xd0a880];
    const tunics = [0x7a5c34, 0x5a6b3a, 0x8a4a3a, 0x4a5a6a, 0x9a7a3c, 0x6b4a5a];
    return makePerson({
      height: 1.0 + rand() * 0.14, bulk: 1.0 + rand() * 0.2,
      skin: skins[(rand() * skins.length) | 0],
      hair: [0x50351e, 0x8a6530, 0x3a281a, 0xa88a50][(rand() * 4) | 0],
      hairLen: 0.45 + rand() * 0.2,
      tunic: tunics[(rand() * tunics.length) | 0],
      pants: [0x5a4632, 0x4a3d2c, 0x3a3028][(rand() * 3) | 0],
      boots: 0xc8a080,
    });
  },
  elf(rand, robeCols = [0xb8c4d4, 0x9aa8c0, 0xc8c2d8, 0xa8b8a8]){
    return makePerson({
      height: 1.8 + rand() * 0.1, bulk: 0.85,
      skin: 0xe4d0b8, hair: rand() > 0.5 ? 0xe8d8a0 : 0x2c2018, hairLen: 0.95,
      robe: robeCols[(rand() * robeCols.length) | 0], glow: 0.1,
    });
  },
  gondorGuard: (o = {}) => makePerson(Object.assign({
    height: 1.82, skin: 0xc8a080, hair: 0x2c2018, hairLen: 0.2,
    tunic: 0x24282e, pants: 0x1c1e24, helm: 'gondor', prop: 'spear',
    cloak: 0x14161c, pose: 'guard',
  }, o)),
  rohirrim: (o = {}) => makePerson(Object.assign({
    height: 1.8, skin: 0xd0aa88, hair: 0xc0a060, hairLen: 0.75,
    tunic: 0x5c4426, pants: 0x3c3020, helm: 'rohan', prop: 'spear', cloak: 0x4a5a3a,
  }, o)),
  orc(rand){
    return makePerson({
      height: 1.5 + rand() * 0.25, bulk: 1.2 + rand() * 0.25,
      skin: [0x4a4438, 0x55503c, 0x3c3a30][(rand() * 3) | 0],
      hair: 0x1a1814, hairLen: 0.1,
      tunic: [0x2c2620, 0x33291e, 0x241f1a][(rand() * 3) | 0],
      pants: 0x1e1a14, helm: rand() > 0.4 ? 'orc' : null,
      prop: rand() > 0.5 ? 'spear' : 'sword',
    });
  },
  breeMan(rand){
    return makePerson({
      height: 1.7 + rand() * 0.15, skin: 0x9a8270, hair: 0x3a2c1c,
      hairLen: 0.4 + rand() * 0.3, beard: rand() > 0.6 ? 0.4 : 0,
      tunic: [0x3a3024, 0x302c28, 0x403626][(rand() * 3) | 0],
      cloak: [0x2c2822, 0x24211c][(rand() * 2) | 0], hoodUp: true,
    });
  },
};

// ----------------------------------------------------------------- crowd ---
// Crowd: manages walkers on paths + idlers + horses; one update() per region.
export class Crowd {
  constructor(heightAt = () => 0){
    this.heightAt = heightAt;
    this.walkers = [];
    this.idlers = [];
    this.horses = [];
    this.flyers = [];
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }
  // rig walks path forever. opts: {speed m/s, loop:'loop'|'pingpong', offset, fly:false, faceOffset}
  walk(rig, pathPoints, opts = {}){
    const path = pathPoints instanceof Path ? pathPoints : new Path(pathPoints, opts.closed);
    const w = {
      rig, path,
      speed: opts.speed ?? 1.2,
      mode: opts.loop ?? 'loop',
      t: opts.offset ?? Math.random(),
      dir: 1, fly: !!opts.fly,
      bob: opts.bob ?? 0, yOff: opts.yOff ?? 0,
      animSpeed: opts.animSpeed ?? 1,
      horse: opts.horse ?? null,
    };
    this.walkers.push(w);
    return w;
  }
  idle(rig){ this.idlers.push(rig); return rig; }
  fly(flyer, pathPoints, opts = {}){
    const w = this.walk(flyer, pathPoints, Object.assign({ fly: true, speed: opts.speed ?? 8 }, opts));
    w.isFlyer = true;
    return w;
  }
  update(t, dt){
    for (const w of this.walkers){
      const L = w.path.length;
      w.t += (w.speed * dt / L) * w.dir;
      if (w.mode === 'loop'){ w.t = ((w.t % 1) + 1) % 1; }
      else if (w.mode === 'pingpong'){
        if (w.t > 1){ w.t = 1; w.dir = -1; }
        if (w.t < 0){ w.t = 0; w.dir = 1; }
      } else { w.t = clamp(w.t, 0, 1); }
      w.path.at(w.t, this._tmp);
      w.path.tangent(w.t, this._tmp2);
      if (!w.fly) this._tmp.y = this.heightAt(this._tmp.x, this._tmp.z) + w.yOff;
      else if (w.bob) this._tmp.y += Math.sin(t * 1.3 + w.t * 20) * w.bob;
      w.rig.position.copy(this._tmp);
      const ang = Math.atan2(this._tmp2.x * w.dir, this._tmp2.z * w.dir);
      w.rig.rotation.y = ang;
      if (w.isFlyer){
        animateFlyer(w.rig, t);
        w.rig.rotation.z = -this._tmp2.y * 0.8;
      } else if (w.horse){
        animateHorse(w.rig, t, true, w.animSpeed);
      } else {
        animatePerson(w.rig, t, true, w.animSpeed);
      }
    }
    for (const r of this.idlers){
      if (r.userData.anim?.legs) animateHorse(r, t, false);
      else if (r.userData.anim?.wings) animateFlyer(r, t);
      else animatePerson(r, t, false);
    }
  }
}
