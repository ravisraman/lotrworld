// buildings.js — reusable architecture: hobbit holes, timber-framed houses,
// stone walls & towers, arched bridges, lampposts, carts, fences.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { mergeGeos } from './nature.js';
import { mat } from './characters.js';

const metalM = (c) => mat(c, { roughness: 0.4, metalness: 0.7 });
export const glowWindowMat = (color = 0xffc478, i = 1.15) =>
  mat(color, { emissive: color, emissiveIntensity: i });

// ----------------------------------------------------------- hobbit hole ---
// A turf mound with a round door, brick chimney, round windows, flower boxes.
export function makeHobbitHole(cfg = {}){
  const c = Object.assign({
    doorColor: 0x3f7a2e, grass: 0x55742e, r: 2.6, litWindows: true,
  }, cfg);
  const g = new THREE.Group();
  const R = c.r;

  // turf mound (half-dome squashed)
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(c.grass, { roughness: 1 }));
  mound.scale.set(1.25, 0.72, 1.1);
  mound.castShadow = mound.receiveShadow = true;
  g.add(mound);

  // face wall
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.16, 0.34, 18, 1, false, 0, Math.PI),
    mat(0xd8ccaa, { roughness: 1 }));
  face.rotation.z = Math.PI / 2; face.rotation.y = Math.PI / 2;
  face.position.set(0, R * 0.62, R * 1.02);
  face.scale.set(1.0, 1, 0.85);
  g.add(face);

  // round door + frame — oversized so it reads from the lane
  const frame = new THREE.Mesh(new THREE.TorusGeometry(R * 0.54, R * 0.1, 8, 22), mat(0xe4dcc2));
  frame.position.set(0, R * 0.55, R * 1.3);
  const door = new THREE.Mesh(new THREE.CircleGeometry(R * 0.54, 22), mat(c.doorColor, { roughness: 0.5 }));
  door.position.set(0, R * 0.55, R * 1.29);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(R * 0.05, 8, 6), metalM(0xc8b048));
  knob.position.set(0, R * 0.55, R * 1.36);
  g.add(frame, door, knob);

  // round windows
  const wmat = c.litWindows ? glowWindowMat() : mat(0x2a3038);
  for (const s of [-1, 1]){
    const wf = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.035, 6, 14), mat(0xe8e0cc));
    wf.position.set(s * R * 0.85, R * 0.5, R * 1.05);
    wf.rotation.y = s * 0.5;
    const win = new THREE.Mesh(new THREE.CircleGeometry(R * 0.2, 14), wmat);
    win.position.copy(wf.position);
    win.rotation.y = s * 0.5;
    g.add(wf, win);
  }

  // chimney — tall enough to read in the wide shots
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.14, R * 0.18, R * 1.15, 8), mat(0x9a6b4a));
  chim.position.set(-R * 0.4, R * 1.15, -R * 0.1);
  chim.castShadow = true;
  const chimCap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.09, 8), mat(0x7d5638));
  chimCap.position.set(-R * 0.4, R * 1.72, -R * 0.1);
  g.add(chim, chimCap);
  g.userData.chimney = new THREE.Vector3(-R * 0.4, R * 1.8, -R * 0.1);

  // flower boxes
  for (const s of [-1, 1]){
    const boxG = new THREE.Mesh(new THREE.BoxGeometry(R * 0.42, R * 0.08, R * 0.12), mat(0x6a5232));
    boxG.position.set(s * R * 0.85, R * 0.26, R * 1.12);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(R * 0.06, 6, 5),
      mat([0xd85a6a, 0xe8c84a, 0xd8869a, 0xb04a9a][(s + 1) + (cfg.seed || 0) % 2]));
    fl.position.set(s * R * 0.8, R * 0.34, R * 1.12);
    const fl2 = fl.clone(); fl2.position.x += s * R * 0.12;
    g.add(boxG, fl, fl2);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ------------------------------------------------------- timber house ------
export function makeTimberHouse(cfg = {}){
  const c = Object.assign({
    w: 5, d: 6, floors: 2, plaster: 0xd8ccae, timber: 0x4a3826,
    roof: 0x5a4a38, lit: true, sag: true, seed: 1,
  }, cfg);
  const rand = mulberry32(c.seed);
  const g = new THREE.Group();
  const fh = 2.6;
  const H = c.floors * fh;

  const body = new THREE.Mesh(new THREE.BoxGeometry(c.w, H, c.d), mat(c.plaster, { roughness: 1 }));
  body.position.y = H / 2;
  g.add(body);

  // second floor jetty
  if (c.floors > 1){
    const jetty = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.5, fh, c.d + 0.5), mat(c.plaster, { roughness: 1 }));
    jetty.position.y = fh + fh / 2;
    g.add(jetty);
  }

  // timber frame lines
  const tm = mat(c.timber);
  const beams = [];
  const addBeam = (w, h, d, x, y, z, rz = 0) => {
    const b = new THREE.BoxGeometry(w, h, d);
    if (rz) b.rotateZ(rz);
    b.translate(x, y, z);
    beams.push(b);
  };
  const zf = c.d / 2 + 0.28, wj = c.w + 0.5;
  for (let f = 0; f < c.floors; f++){
    const y0 = f * fh;
    addBeam(wj + 0.1, 0.18, 0.12, 0, y0 + 0.09, zf);
    addBeam(wj + 0.1, 0.18, 0.12, 0, y0 + fh - 0.09, zf);
    const nv = 3 + (rand() * 2 | 0);
    for (let i = 0; i <= nv; i++){
      addBeam(0.16, fh, 0.12, -wj / 2 + (i / nv) * wj, y0 + fh / 2, zf);
    }
    if (rand() > 0.4) addBeam(0.14, fh * 1.1, 0.1, -wj * 0.22, y0 + fh / 2, zf, 0.6);
    if (rand() > 0.4) addBeam(0.14, fh * 1.1, 0.1, wj * 0.22, y0 + fh / 2, zf, -0.6);
  }
  const beamMesh = new THREE.Mesh(mergeGeos(beams), tm);
  g.add(beamMesh);
  const beamBack = beamMesh.clone();
  beamBack.rotation.y = Math.PI;
  g.add(beamBack);

  // roof — gable
  const roofG = new THREE.ConeGeometry(c.w * 0.82, c.w * 0.62, 4);
  roofG.rotateY(Math.PI / 4);
  roofG.scale(1, 1, (c.d + 1.6) / (c.w * 1.15));
  const roof = new THREE.Mesh(roofG, mat(c.roof, { roughness: 1 }));
  roof.position.y = H + c.w * 0.3;
  roof.scale.x = 1.28;
  g.add(roof);

  // chimney
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), mat(0x7a6a5a));
  chim.position.set(c.w * 0.25, H + c.w * 0.32, -c.d * 0.15);
  g.add(chim);
  g.userData.chimney = chim.position.clone().add(new THREE.Vector3(0, 0.9, 0));

  // windows
  const wm = c.lit ? glowWindowMat(0xffb85c, 1.25) : mat(0x1e2226);
  for (let f = 0; f < c.floors; f++){
    const n = 2 + (rand() * 2 | 0);
    for (let i = 0; i < n; i++){
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), c.lit && rand() > 0.3 ? wm : mat(0x1e2226));
      win.position.set(-c.w * 0.32 + (i / Math.max(1, n - 1)) * c.w * 0.64, f * fh + fh * 0.55, zf + 0.08);
      g.add(win);
    }
  }
  // door
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), mat(0x3a2c1c));
  door.position.set(c.w * 0.18, 0.95, c.d / 2 + 0.29 + 0.02);
  g.add(door);

  g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

// ------------------------------------------------------------ stone kit ----
export function stoneWall(len, h, thick = 1.2, color = 0xcac4b6, battlement = true){
  const geos = [];
  const wallG = new THREE.BoxGeometry(len, h, thick);
  wallG.translate(0, h / 2, 0);
  geos.push(wallG);
  if (battlement){
    const n = Math.max(2, Math.floor(len / 1.6));
    for (let i = 0; i < n; i++){
      const m = new THREE.BoxGeometry(0.8, 0.7, thick * 0.6);
      m.translate(-len / 2 + (i + 0.5) * (len / n), h + 0.35, 0);
      geos.push(m);
    }
  }
  const mesh = new THREE.Mesh(mergeGeos(geos), mat(color, { roughness: 0.95 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function stoneTower(r, h, color = 0xcac4b6, cone = 0x3a4048){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 10), mat(color, { roughness: 0.95 }));
  body.position.y = h / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.02, h * 0.06, 10), mat(color, { roughness: 0.95 }));
  rim.position.y = h * 0.985;
  g.add(body, rim);
  if (cone !== null){
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 1.05, r * 2.1, 10), mat(cone, { roughness: 0.9 }));
    cap.position.y = h + r * 1.05;
    g.add(cap);
  } else {
    const n = 8;
    for (let i = 0; i < n; i++){
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.4), mat(color));
      m.position.set(Math.cos(a) * r * 0.98, h + 0.3, Math.sin(a) * r * 0.98);
      m.rotation.y = -a;
      g.add(m);
    }
  }
  g.traverse(o => { o.castShadow = o.receiveShadow = true; });
  return g;
}

// --------------------------------------------------------- arched bridge ---
export function makeBridge(len = 12, w = 3, color = 0x9a8f7c, opts = {}){
  const g = new THREE.Group();
  const arc = (x) => (1 - (x / (len / 2)) ** 2) * len * 0.09;
  // solid deck: a box bent along the arch, extruded downward
  const deckG = new THREE.BoxGeometry(len, 0.7, w, 24, 1, 1);
  const p = deckG.attributes.position;
  for (let i = 0; i < p.count; i++){
    p.setY(i, p.getY(i) + arc(p.getX(i)));
  }
  deckG.computeVertexNormals();
  const deck = new THREE.Mesh(deckG, mat(color, { roughness: 1 }));
  deck.position.y = 0.35;
  g.add(deck);
  // parapets following the arch
  for (const s of (opts.parapets === false ? [] : [-1, 1])){
    const parG = new THREE.BoxGeometry(len, 0.45, 0.24, 24, 1, 1);
    const pp = parG.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) + arc(pp.getX(i)));
    parG.computeVertexNormals();
    const pm = new THREE.Mesh(parG, mat(color, { roughness: 1 }));
    pm.position.set(0, 0.95, s * (w / 2 - 0.12));
    g.add(pm);
  }
  // piers under the third points, down into the water
  for (const s of [-1, 1]){
    const pier = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, len * 0.24, w * 0.9), mat(color, { roughness: 1 }));
    pier.position.set(s * len * 0.3, -len * 0.1, 0);
    pier.rotation.y = Math.PI / 2;
    g.add(pier);
  }
  g.traverse(o => { o.castShadow = o.receiveShadow = true; });
  return g;
}

// ------------------------------------------------------------- lamppost ----
export function makeLamppost(color = 0x3a3632, lightColor = 0xffc87a){
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), mat(color));
  pole.position.y = 1.6;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), mat(color));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.3, 3.1, 0);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), mat(color));
  cage.position.set(0.6, 2.92, 0);
  const glowM = glowWindowMat(lightColor, 2.6);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glowM);
  bulb.position.copy(cage.position);
  const light = new THREE.PointLight(lightColor, 16, 17, 2);
  light.position.copy(cage.position);
  g.add(pole, arm, cage, bulb, light);
  g.traverse(o => { o.castShadow = false; });
  return g;
}

// ----------------------------------------------------------------- cart ----
export function makeCart(loaded = true){
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.3), mat(0x6a5232));
  bed.position.y = 0.85;
  g.add(bed);
  for (const [x, z] of [[0.8, 0.72], [0.8, -0.72], [-0.8, 0.72], [-0.8, -0.72]]){
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14), mat(0x4a3826));
    wheel.position.set(x, 0.45, z);
    g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), mat(0x3a2c1c));
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    g.add(hub);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), mat(0x6a5232));
  shaft.rotation.z = 1.35;
  shaft.position.set(1.9, 0.75, 0.4);
  const shaft2 = shaft.clone(); shaft2.position.z = -0.4;
  g.add(shaft, shaft2);
  if (loaded){
    for (let i = 0; i < 5; i++){
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 6), mat(0xb09a6a));
      sack.scale.y = 0.8;
      sack.position.set(-0.7 + (i % 3) * 0.6, 1.25, (i > 2 ? -0.3 : 0.3));
      g.add(sack);
    }
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- fences ---
export function makeFenceLine(pts, heightAt = () => 0){
  const g = new THREE.Group();
  const postM = mat(0x6a5a42);
  const geos = [];
  for (let i = 0; i < pts.length; i++){
    const [x, z] = pts[i];
    const y = heightAt(x, z);
    const post = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    post.translate(x, y + 0.5, z);
    geos.push(post);
    if (i > 0){
      const [px, pz] = pts[i - 1];
      const py = heightAt(px, pz);
      const dx = x - px, dz = z - pz;
      const run = Math.hypot(dx, dz);
      const len = Math.hypot(run, y - py);
      for (const rh of [0.42, 0.78]){
        const rail = new THREE.BoxGeometry(len, 0.07, 0.07);
        rail.rotateZ(Math.atan2(y - py, run));
        rail.rotateY(-Math.atan2(dz, dx));
        rail.translate((x + px) / 2, (y + py) / 2 + rh, (z + pz) / 2);
        geos.push(rail);
      }
    }
  }
  const m = new THREE.Mesh(mergeGeos(geos), postM);
  m.castShadow = true;
  g.add(m);
  return g;
}
