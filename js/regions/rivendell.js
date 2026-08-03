// Rivendell — the Last Homely House East of the Sea. An autumn gorge filled
// with waterfalls, terraced elven pavilions catching low golden light, and
// the fair folk walking unhurried beneath the turning birches.
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { plantTrees, scatterRocks, makeWater, makeWaterfall, makeParticles, makeLightShafts, mergeGeos } from '../engine/nature.js';
import { makeBridge } from '../engine/buildings.js';
import { Cast, Crowd, mat } from '../engine/characters.js';

function makePavilion(cfg = {}){
  const c = Object.assign({ r: 6, cols: 8, h: 5.5, roof: 0xa87848, ivory: 0xe6ded0 }, cfg);
  const g = new THREE.Group();
  const ivoryM = mat(c.ivory, { roughness: 0.75 });
  const roofM = mat(c.roof, { roughness: 0.55, metalness: 0.15, emissive: 0x2a1c10, emissiveIntensity: 0.35 });

  const plat = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 1.1, c.r * 1.2, 0.8, 12), ivoryM);
  plat.position.y = 0.4;
  g.add(plat);
  for (let i = 0; i < c.cols; i++){
    const a = (i / c.cols) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, c.h, 7), ivoryM);
    col.position.set(Math.cos(a) * c.r * 0.85, 0.8 + c.h / 2, Math.sin(a) * c.r * 0.85);
    g.add(col);
    // graceful arch between columns
    const arch = new THREE.Mesh(new THREE.TorusGeometry(c.r * 0.85 * Math.sin(Math.PI / c.cols), 0.09, 6, 10, Math.PI), ivoryM);
    const mid = a + Math.PI / c.cols;
    arch.position.set(Math.cos(mid) * c.r * 0.85 * Math.cos(Math.PI / c.cols), 0.8 + c.h, Math.sin(mid) * c.r * 0.85 * Math.cos(Math.PI / c.cols));
    arch.rotation.y = -mid + Math.PI / 2;
    g.add(arch);
  }
  // sweeping conical shell roof with upturned rim + finial
  const roofG = new THREE.ConeGeometry(c.r * 1.18, c.r * 0.62, 12, 3);
  const rp = roofG.attributes.position;
  for (let i = 0; i < rp.count; i++){
    const y = rp.getY(i);
    const d = Math.hypot(rp.getX(i), rp.getZ(i)) / (c.r * 1.18);
    rp.setY(i, y + Math.pow(d, 2.2) * c.r * 0.22);
  }
  roofG.computeVertexNormals();
  const roof = new THREE.Mesh(roofG, roofM);
  roof.position.y = 0.8 + c.h + c.r * 0.3;
  g.add(roof);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 6), roofM);
  fin.position.y = 0.8 + c.h + c.r * 0.62;
  g.add(fin);
  g.traverse(o => { o.castShadow = o.receiveShadow = true; });
  roof.castShadow = false; // a hard black roof-disc shadow reads as a hole
  return g;
}

export default {
  id: 'rivendell', name: 'Rivendell', subtitle: 'the Last Homely House East of the Sea',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xd0ccc0, 0.0019);
    const rand = mulberry32(1408);
    const updates = [];

    // gorge running roughly north–south; river at the floor, terraces east
    const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
    function heightAt(x, z){
      const gorge = Math.abs(x + Math.sin(z * 0.02) * 14);
      let h = smoothstep(8, 90, gorge) * 55;                 // valley walls
      h += fbm(x * 0.02, z * 0.02, 4) * 12;
      h += smoothstep(24, 70, gorge) * fbm(x * 0.05 + 9, z * 0.05, 4) * 20;
      h -= gauss(x, z, 0, 0, 200) * 4;
      if (gorge < 11) h = -3 + fbm(x * 0.1, z * 0.1, 2) * 1.2; // river bed
      return h;
    }
    const autumnA = new THREE.Color(0x55663a), rockC = new THREE.Color(0x8a8272), cliffC = new THREE.Color(0x6d685c);
    const terr = makeTerrain({
      size: 800, res: 280, height: heightAt,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.04, z * 0.04, 3);
        out.copy(autumnA).lerp(new THREE.Color(0x8a7c3c), n);
        const warm = fbm(x * 0.008 + 60, z * 0.008, 3);
        if (h > 2 && h < 40) out.lerp(new THREE.Color(0x9a7c34), warm * 0.55);
        if (slope > 0.28) out.lerp(cliffC, Math.min(1, (slope - 0.28) * 2.4));
        if (h > 40) out.lerp(rockC, 0.5);
        if (h < 0.5) out.lerp(new THREE.Color(0x4c5540), 0.7);
      },
    });
    scene.add(terr.mesh);

    // ---- golden hour sky -----------------------------------------------
    const sunDir = new THREE.Vector3(-0.62, 0.3, -0.35).normalize();
    const sky = makeSky({
      zenith: 0x4a6ba0, horizon: 0xe4d2ac, ground: 0x8a8570,
      sunDir, sunColor: 0xffe8b8, sunSize: 0.034, sunHalo: 0.62,
      cloudColor: 0xf8ead0, cloudShadow: 0xa89478, cloudCover: 0.3, cloudScale: 2.4,
      haze: 0.5,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2800, height: 420, color: 0x8a92a4, jag: 2.2, seed: 41 },
      { dist: 2200, height: 300, color: 0x7d8290, jag: 2.8, seed: 42 },
      { dist: 1500, height: 190, color: 0x6d7280, jag: 3.2, seed: 43 },
    ], 0x6d6b48));

    const sun = new THREE.DirectionalLight(0xffe0a8, 2.6);
    sun.position.copy(sunDir).multiplyScalar(400);
    sun.castShadow = true;
    sun.shadow.radius = 9;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xc4ccd8, 0x8a7a5c, 1.2));

    // ---- river + falls -------------------------------------------------
    const river = makeWater(scene, {
      w: 60, h: 600, y: -2.2, shallow: 0x5a8a8c, deep: 0x27555c,
      sky: 0xe8dcbc, sunDir, flow: 1.4, scale: 0.1,
    });
    scene.add(river.mesh); updates.push(river.update);

    const fallSpots = [
      { side: 1, z: -120, w: 8 }, { side: 1, z: -58, w: 6 },
      { side: 1, z: 34, w: 10 }, { side: -1, z: -92, w: 7 },
      { side: -1, z: 62, w: 6 }, { side: 1, z: 112, w: 9 },
    ];
    for (const f of fallSpots){
      // lay the fall sheet along the actual slope: from a notch on the wall
      // down to the river's edge
      const xw = f.side * 30 - Math.sin(f.z * 0.02) * 14;
      const xb = f.side * 12 - Math.sin(f.z * 0.02) * 14;
      const pTop = new THREE.Vector3(xw, heightAt(xw + f.side * 6, f.z) + 1.5, f.z);
      const pBase = new THREE.Vector3(xb, -2.0, f.z);
      const len = pTop.distanceTo(pBase);
      const wf = makeWaterfall(scene, {
        top: new THREE.Vector3(), height: len, width: f.w, opacity: 0.62,
      });
      wf.mesh.position.copy(pTop).add(pBase).multiplyScalar(0.5);
      {
        const up = new THREE.Vector3().subVectors(pTop, pBase).normalize();
        const outN = new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, outN).normalize();
        const n2 = new THREE.Vector3().crossVectors(right, up).normalize();
        wf.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n2));
      }
      scene.add(wf.mesh); updates.push(wf.update);

      // mist where it strikes the river
      const mist = makeParticles(scene, 'pollen', {
        count: 80, color: 0xe8f0f2, opacity: 0.24, size: 4.5,
        cx: xb, cy: 0.5, cz: f.z, area: [12, 7, 12], fall: -0.4,
      });
      scene.add(mist.mesh); updates.push(mist.update);
    }

    // ---- the house of Elrond -------------------------------------------
    const terraceCfg = [
      { x: 34, z: -30, y: null, r: 7, h: 6 },   // main hall terrace
      { x: 48, z: -66, y: null, r: 5.5, h: 5 },
      { x: 42, z: 8, y: null, r: 5, h: 5 },
      { x: 60, z: -34, y: null, r: 4.5, h: 4.5 },
      { x: 30, z: 42, y: null, r: 5.5, h: 5.5 },
      { x: -38, z: -50, y: null, r: 5, h: 5 },
    ];
    const pavilions = [];
    for (const tc of terraceCfg){
      const p = makePavilion({ r: tc.r, h: tc.h });
      const y = heightAt(tc.x, tc.z);
      p.position.set(tc.x, y - 0.9, tc.z);
      tc.y = y - 0.9;
      scene.add(p);
      // carved stone terrace footing rooting it into the slope
      const footing = new THREE.Mesh(
        new THREE.CylinderGeometry(tc.r * 1.35, tc.r * 1.7, 5, 12),
        mat(0xb9b098, { roughness: 1 }));
      footing.position.set(tc.x, y - 3.2, tc.z);
      footing.castShadow = footing.receiveShadow = true;
      scene.add(footing);
      pavilions.push({ ...tc, y: y - 0.9 });
    }
    // slender bridge across the gorge — the iconic approach
    const bridge = makeBridge(36, 2.0, 0xcabfa4, { parapets: false });
    bridge.position.set(8, 4.0, -30);
    scene.add(bridge);
    const bridge2 = makeBridge(34, 1.8, 0xcabfa4, { parapets: false });
    bridge2.position.set(-11, 3.6, 46);
    bridge2.rotation.y = 0.15;
    scene.add(bridge2);
    // connecting walkways between close terraces
    const walkM = mat(0xe0d8c6, { roughness: 0.8 });
    function walkway(a, b){
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const w = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 1.8), walkM);
      w.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.8, (a.z + b.z) / 2);
      w.rotation.y = -Math.atan2(dz, dx);
      w.rotation.z = Math.atan2(b.y - a.y, len) * 0.9;
      w.castShadow = true;
      scene.add(w);
    }
    walkway(pavilions[0], pavilions[3]);

    // ---- autumn woods --------------------------------------------------
    const birchSpots = [], redSpots = [];
    for (let i = 0; i < 950; i++){
      const x = (rand() - 0.5) * 640, z = (rand() - 0.5) * 640;
      const h = heightAt(x, z);
      if (h < 0.5 || h > 52) continue;
      (rand() > 0.4 ? birchSpots : redSpots).push({ x, z, s: 0.9 + rand() });
    }
    // thick golden bands along the river banks
    for (let i = 0; i < 200; i++){
      const z = (rand() - 0.5) * 600;
      const side = rand() > 0.5 ? 1 : -1;
      const x = side * (13 + rand() * 16) - Math.sin(z * 0.02) * 14;
      const h = heightAt(x, z);
      if (h < 0.5 || h > 40) continue;
      (rand() > 0.5 ? birchSpots : redSpots).push({ x, z, s: 0.8 + rand() * 0.9 });
    }
    scene.add(plantTrees('birch', birchSpots, { heightAt, seed: 21, leafColor: 0xc9992c, trunkColor: 0xcfc8ba }));
    scene.add(plantTrees('oak', redSpots, { heightAt, seed: 22, leafColor: 0x9a5224 }));
    scene.add(scatterRocks(
      Array.from({ length: 40 }, () => ({ x: (rand() - 0.5) * 500, z: (rand() - 0.5) * 500 })),
      { heightAt, color: 0x9a927e, seed: 4 }));

    // falling golden leaves + god rays down the gorge
    const leaves = makeParticles(scene, 'leaf', { cx: 10, cy: 4, cz: -20, area: [200, 45, 260], color: 0xc09a40, size: 1.5, count: 340, opacity: 0.8 });
    scene.add(leaves.mesh); updates.push(leaves.update);
    const shafts = makeLightShafts(scene, { count: 7, x: -20, y: 70, z: -40, spread: 90, height: 90, width: 12, color: 0xffe8c0, opacity: 0.1, tilt: 0.5 });
    shafts.mesh.rotation.z = 0.35;
    scene.add(shafts.mesh); updates.push(shafts.update);

    // ---- the fair folk -------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    const elrond = Cast.elrond();
    elrond.position.set(34, pavilions[0].y + 0.8, -24);
    elrond.rotation.y = Math.PI + 0.4;
    crowd.idle(elrond); scene.add(elrond);

    const arwen = Cast.arwen();
    scene.add(arwen);
    {
      const deckY = (x) => 4.75 + (1 - ((x - 8) / 18) ** 2) * 3.24;
      crowd.walk(arwen, [
        [-6, deckY(-6), -30], [0, deckY(0), -30], [8, deckY(8), -30],
        [16, deckY(16), -30], [22, deckY(22), -30]],
        { speed: 0.75, loop: 'pingpong', fly: true });
    }

    for (let i = 0; i < 6; i++){
      const elf = Cast.elf(rand);
      scene.add(elf);
      const tc = pavilions[i % pavilions.length];
      const a0 = rand() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 4; k++){
        const a = a0 + k * 1.6;
        pts.push([tc.x + Math.cos(a) * (tc.r + 4 + rand() * 6), 0, tc.z + Math.sin(a) * (tc.r + 4 + rand() * 6)]);
      }
      crowd.walk(elf, pts, { speed: 0.6 + rand() * 0.3, loop: 'pingpong', offset: rand() });
    }
    // two elves in quiet conversation on the main terrace
    for (const [ex, ez, ry] of [[30, -33, 0.8], [31.6, -31.8, -2.2]]){
      const elf = Cast.elf(rand);
      elf.position.set(ex, pavilions[0].y + 0.8, ez);
      elf.rotation.y = ry;
      crowd.idle(elf); scene.add(elf);
    }

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // the reveal — descending into the gorge, falls on every side
        pos: [[-110, 70, 150], [-60, 44, 80], [-16, 26, 20], [4, 16, -8]],
        look: [[40, 18, -40], [40, 15, -40], [38, 12, -36], [36, 10, -32]],
        dur: 20,
      },
      { // gliding along the bridge toward the house
        pos: [[-4, 9.5, -20], [4, 9, -24], [12, 8.6, -28], [18, 8.6, -30]],
        look: [[30, 11, -31], [34, 11, -31], [36, 11.5, -32], [40, 12, -34]],
        dur: 16,
      },
      { // terrace life — pavilions, elves, golden light
        pos: [
          [20, heightAt(20, 2) + 9, 2], [24, heightAt(24, -10) + 8, -10],
          [27, heightAt(27, -20) + 7.5, -20], [29, heightAt(29, -40) + 8, -40]],
        look: [[36, heightAt(34, -30) + 5, -28], [37, heightAt(34, -30) + 5, -30], [38, heightAt(34, -30) + 5.5, -34], [46, heightAt(48, -66) + 6, -58]],
        dur: 17,
      },
      { // down the valley from the terrace line — falls on both walls
        pos: [
          [12, heightAt(12, 96) + 10, 96], [8, heightAt(8, 70) + 11, 70],
          [4, heightAt(4, 44) + 12, 44]],
        look: [[-2, 6, -20], [0, 7, -30], [2, 8, -40]],
        dur: 15,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.05, 1.01, 0.94], gamma: [1.03, 1.02, 1.0], lift: [0.016, 0.012, 0.008],
        sat: 1.06, temp: 0.16, bloom: 0.38, bloomThreshold: 0.74,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
