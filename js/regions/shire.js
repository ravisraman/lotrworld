// The Shire — Hobbiton on a golden late-summer morning. Rolling turf hills,
// Bag End beneath the old oak, the Party Tree in the field, the mill by the
// water, chimney smoke, and hobbits everywhere about their small good lives.
import * as THREE from 'three';
import { fbm, mulberry32, Path } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { plantTrees, scatterRocks, makeGrass, makeWater, makeParticles, makeSmoke, makeBanner, makeTreeGeo } from '../engine/nature.js';
import { makeHobbitHole, makeTimberHouse, makeBridge, makeCart, makeFenceLine } from '../engine/buildings.js';
import { Cast, Crowd, makePerson, makeHorse, makeFlyer, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'shire', name: 'The Shire', subtitle: 'Hobbiton in the Westfarthing',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xcfd8c2, 0.0028);
    const rand = mulberry32(3021);
    const updates = [];

    // ---- terrain -------------------------------------------------------
    const lane = [
      [120, 140], [78, 100], [46, 66], [18, 34], [-2, 8], [-16, -16], [-27, -34], [-33, -44],
    ];
    function laneDist(x, z){
      let best = 1e9;
      for (let i = 1; i < lane.length; i++){
        const ax = lane[i - 1][0], az = lane[i - 1][1], bx = lane[i][0], bz = lane[i][1];
        const abx = bx - ax, abz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
        const dx = x - (ax + abx * t), dz = z - (az + abz * t);
        best = Math.min(best, dx * dx + dz * dz);
      }
      return Math.sqrt(best);
    }
    const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
    function heightAt(x, z){
      let h = fbm(x * 0.011 + 5, z * 0.011 + 9, 4) * 13 - 4;
      h += fbm(x * 0.004 + 40, z * 0.004, 3) * 16 - 5;
      h += gauss(x, z, -38, -52, 34) * 13;              // Bag End hill
      h += gauss(x, z, -120, 60, 60) * 10;              // west downs
      h -= gauss(x, z, 62, 82, 20) * (h + 8) * 1.15;    // the Water basin
      h -= Math.max(0, 1 - laneDist(x, z) / 7) * 0.5;   // worn lane
      return h;
    }
    const grassC = new THREE.Color(0x527336), grassB = new THREE.Color(0x74894a);
    const dirtC = new THREE.Color(0xa8905e), darkC = new THREE.Color(0x3c5c22);
    const terr = makeTerrain({
      size: 900, res: 300, height: heightAt,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.03, z * 0.03, 3);
        out.copy(grassC).lerp(grassB, n);
        if (h < 0.2) out.lerp(darkC, 0.5);
        const ld = laneDist(x, z);
        if (ld < 3.4) out.lerp(dirtC, 0.85 * (1 - ld / 3.4) + 0.15);
        if (slope > 0.3) out.lerp(new THREE.Color(0x74683e), (slope - 0.3) * 1.6);
      },
    });
    scene.add(terr.mesh);

    // ---- sky / light ---------------------------------------------------
    const sunDir = new THREE.Vector3(0.66, 0.3, 0.5).normalize();
    const sky = makeSky({
      zenith: 0x3f74b8, horizon: 0xe8dcae, ground: 0x9aa578,
      sunDir, sunColor: 0xfff2cf, sunSize: 0.03, sunHalo: 0.4,
      cloudColor: 0xfdf8ec, cloudShadow: 0xb0aa96, cloudCover: 0.4, cloudScale: 2.2,
      haze: 0.6,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2600, height: 190, color: 0xb9c4ae, jag: 2.0, seed: 31 },
      { dist: 2100, height: 120, color: 0xa3b596, jag: 2.6, seed: 32 },
      { dist: 1500, height: 70,  color: 0x8aa87c, jag: 3.0, seed: 33 },
    ], 0x6d8a54));

    const sun = new THREE.DirectionalLight(0xffe8bc, 3.2);
    sun.position.copy(sunDir).multiplyScalar(300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbdd2e8, 0x55703a, 0.62));

    // ---- water ---------------------------------------------------------
    const water = makeWater(scene, {
      w: 74, h: 62, y: 0.15, shallow: 0x4a7a68, deep: 0x1e4a44,
      sky: 0xcfe0e8, sunDir, flow: 0.4, scale: 0.12,
    });
    // a soft-edged pool, not a rectangle — the shader only reads world position
    water.mesh.geometry.dispose();
    water.mesh.geometry = new THREE.CircleGeometry(41, 36);
    water.mesh.position.set(62, 0.15, 82);
    scene.add(water.mesh); updates.push(water.update);

    // ---- hobbit holes --------------------------------------------------
    const holes = [
      { x: 64, z: 96, door: 0xb8452c, r: 2.4 },
      { x: 34, z: 54, door: 0xc9a227, r: 2.5 },
      { x: 6, z: 26, door: 0x2e5a8a, r: 2.4 },
      { x: -12, z: -4, door: 0x7a3a6a, r: 2.5 },
      { x: -26, z: -24, door: 0xb8452c, r: 2.4 },
      { x: 42, z: 24, door: 0x8a6b2c, r: 2.3 },
      { x: -58, z: -14, door: 0x4a6b2c, r: 2.6 },
      { x: -6, z: 52, door: 0x9a4a2c, r: 2.3 },
      // Bagshot Row — terraced into the Hill below Bag End
      { x: -18, z: -34, door: 0xc9a227, r: 2.3 },
      { x: -10, z: -26, door: 0x8a3c2c, r: 2.2 },
      { x: -46, z: -34, door: 0x2e5a8a, r: 2.4 },
    ];
    const chimneys = [];
    for (const hcfg of holes){
      const hole = makeHobbitHole({ doorColor: hcfg.door, r: hcfg.r, seed: (hcfg.x | 0) });
      const y = heightAt(hcfg.x, hcfg.z);
      hole.position.set(hcfg.x, y - 0.35, hcfg.z);
      // face the lane
      let best = lane[0], bd = 1e9;
      for (const p of lane){ const d = (p[0] - hcfg.x) ** 2 + (p[1] - hcfg.z) ** 2; if (d < bd){ bd = d; best = p; } }
      hole.rotation.y = Math.atan2(best[0] - hcfg.x, best[1] - hcfg.z);
      scene.add(hole);
      const cp = hole.userData.chimney.clone().applyMatrix4(hole.matrixWorld ?? new THREE.Matrix4());
      hole.updateMatrixWorld(true);
      chimneys.push(hole.localToWorld(hole.userData.chimney.clone()));
    }
    // Bag End — grander, green door, up on the hill under the oak
    const bagEnd = makeHobbitHole({ doorColor: 0x2e6b22, r: 3.3, grass: 0x4a6828 });
    bagEnd.position.set(-38, heightAt(-38, -52) - 0.45, -52);
    bagEnd.rotation.y = Math.atan2(-33 + 38, -44 + 52);
    bagEnd.updateMatrixWorld(true);
    scene.add(bagEnd);
    chimneys.push(bagEnd.localToWorld(bagEnd.userData.chimney.clone()));
    // the oak over Bag End
    const oak = makeTreeGeo('oak', mulberry32(77));
    const oakG = new THREE.Group();
    const oakT = new THREE.Mesh(oak.trunks, mat(0x4a3626));
    const oakL = new THREE.Mesh(oak.leaves, mat(0x3f6222, { side: THREE.DoubleSide }));
    oakG.add(oakT, oakL);
    oakG.scale.setScalar(2.1);
    oakG.position.set(-42, heightAt(-42, -58), -58);
    const oakCore = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), mat(0x33511c));
    oakCore.position.set(0, 4.6, 0);
    oakCore.scale.set(1.15, 0.85, 1.15);
    oakG.add(oakCore);
    oakG.traverse(o => { o.castShadow = true; });
    scene.add(oakG);

    // ---- Party Tree + tents -------------------------------------------
    const party = new THREE.Group();
    const pt = makeTreeGeo('oak', mulberry32(4242));
    const ptT = new THREE.Mesh(pt.trunks, mat(0x54402c));
    const ptL = new THREE.Mesh(pt.leaves, mat(0x4a7026, { side: THREE.DoubleSide }));
    party.add(ptT, ptL);
    party.scale.setScalar(3.2);
    party.position.set(2, heightAt(2, 46), 46);
    const partyCore = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), mat(0x3c5c20));
    partyCore.position.set(0, 4.8, 0);
    partyCore.scale.set(1.2, 0.85, 1.2);
    party.add(partyCore);
    party.traverse(o => { o.castShadow = true; });
    scene.add(party);
    for (const [tx, tz, tc] of [[-10, 40, 0xd8cfa8], [14, 56, 0xb8452c], [-4, 62, 0xd8cfa8]]){
      const tent = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.6, 8), mat(tc, { side: THREE.DoubleSide }));
      tent.position.set(tx, heightAt(tx, tz) + 1.3, tz);
      tent.castShadow = true;
      scene.add(tent);
    }

    // ---- mill + bridge -------------------------------------------------
    const mill = makeTimberHouse({ w: 6, d: 7, floors: 2, roof: 0x6b4a34, seed: 9 });
    mill.position.set(24, Math.max(heightAt(24, 64), 0.6) - 0.2, 64);
    mill.rotation.y = 2.2;
    scene.add(mill);
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 18), mat(0x4a3826));
    wheel.add(rim);
    for (let i = 0; i < 8; i++){
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.7), mat(0x5a4632));
      const a = (i / 8) * Math.PI * 2;
      paddle.position.set(Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0);
      paddle.rotation.z = a;
      wheel.add(paddle);
    }
    {
      const side = new THREE.Vector3(-4.1, 0, 0).applyEuler(new THREE.Euler(0, 2.2, 0));
      wheel.position.set(24 + side.x, 1.3, 64 + side.z);
      wheel.rotation.y = 2.2;
    }
    wheel.traverse(o => { o.castShadow = true; });
    scene.add(wheel);
    updates.push((t) => { wheel.rotation.z = t * 0.5; });
    const bridge = makeBridge(14, 3.2, 0x8a7c64);
    bridge.position.set(40, 0.8, 56);
    bridge.rotation.y = 1.15;
    scene.add(bridge);

    // ---- vegetation ----------------------------------------------------
    const treeSpots = [];
    for (let i = 0; i < 90; i++){
      const x = (rand() - 0.5) * 700, z = (rand() - 0.5) * 700;
      if (laneDist(x, z) < 8 || heightAt(x, z) < 0.5) continue;
      if (Math.hypot(x - 62, z - 82) < 40) continue;
      treeSpots.push({ x, z, s: 0.8 + rand() * 1.2 });
    }
    scene.add(plantTrees('oak', treeSpots, { heightAt, seed: 12, leafColor: 0x3f6a24 }));
    const birchSpots = [];
    for (let i = 0; i < 40; i++){
      const x = (rand() - 0.5) * 600, z = (rand() - 0.5) * 600;
      if (laneDist(x, z) < 7 || heightAt(x, z) < 0.5) continue;
      birchSpots.push({ x, z });
    }
    scene.add(plantTrees('birch', birchSpots, { heightAt, seed: 13, leafColor: 0x6b8f30 }));
    const grass = makeGrass(scene, {
      count: 26000, area: 380, cx: 0, cz: 10, heightAt,
      mask: (x, z) => (laneDist(x, z) < 3.2 || heightAt(x, z) < 0.4) ? 0 : 1,
      colorA: 0x4a6030, colorB: 0x566b34, height: 0.5, windAmp: 0.14,
    });
    scene.add(grass.mesh); updates.push(grass.update);
    scene.add(scatterRocks(
      Array.from({ length: 24 }, () => ({ x: (rand() - 0.5) * 500, z: (rand() - 0.5) * 500, s: 0.4 + rand() })),
      { heightAt, color: 0x8a8272, seed: 8 }));

    // gardens by Bag End — rows of vegetables + flowers
    const garden = new THREE.Group();
    for (let r = 0; r < 4; r++){
      for (let i = 0; i < 7; i++){
        const veg = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), mat(r % 2 ? 0x3f6a2a : 0x568a2e));
        veg.scale.y = 0.7;
        const gx = -28 + i * 1.1, gz = -38 + r * 1.4;
        veg.position.set(gx, heightAt(gx, gz) + 0.2, gz);
        garden.add(veg);
      }
    }
    for (let i = 0; i < 26; i++){
      const fx = -20 + (rand() - 0.5) * 30, fz = -20 + (rand() - 0.5) * 30;
      if (laneDist(fx, fz) < 3) continue;
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 5, 4),
        mat([0xd85a6a, 0xe8c84a, 0xd8869a, 0xc8ccd8][i % 4]));
      fl.position.set(fx, heightAt(fx, fz) + 0.3, fz);
      garden.add(fl);
    }
    scene.add(garden);

    // fences along the lane
    const fencePts = lane.map(([x, z]) => {
      // offset perpendicular
      return [x + 4.5, z + 2.5];
    });
    scene.add(makeFenceLine(fencePts, heightAt));

    // laundry line near a hole
    for (const [lx, lz, col] of [[10, 30, '#e8e2d0'], [11.8, 30.7, '#9ab0c8']]){
      const b = makeBanner(scene, { w: 0.9, h: 1.1, color: col, emblem: 'plain', poleH: 2.2, wind: 1.4, tail: false });
      b.mesh.position.set(lx, heightAt(lx, lz), lz);
      scene.add(b.mesh); updates.push(b.update);
    }

    // ---- atmosphere ----------------------------------------------------
    for (const cp of chimneys){
      const smoke = makeSmoke(scene, { x: cp.x, y: cp.y, z: cp.z, rise: 10, speed: 0.19, opacity: 0.3, size: 2.2, count: 18, spread: 1.3, color: 0xaaa69c });
      scene.add(smoke.mesh); updates.push(smoke.update);
    }
    const pollen = makeParticles(scene, 'pollen', {
      cx: 0, cy: 2, cz: 20, area: [220, 20, 220], size: 0.9, opacity: 0.3, count: 380,
    });
    scene.add(pollen.mesh); updates.push(pollen.update);

    // ---- the living ----------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    // Sam the gardener, tending the Bag End garden
    const sam = Cast.sam({ prop: 'hoe' });
    sam.position.set(-27, heightAt(-27, -36), -36);
    sam.rotation.y = 2.6;
    crowd.idle(sam); scene.add(sam);

    // old hobbit on a bench with his pipe
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), mat(0x6a5232));
    bench.position.set(8.5, heightAt(8.5, 24) + 0.5, 24);
    bench.castShadow = true;
    scene.add(bench);
    const elder = makePerson({ height: 1.05, bulk: 1.2, skin: 0xd8b498, hair: 0xc9c2b2, hairLen: 0.4, tunic: 0x7a5c34, pose: 'sit', prop: 'pipe' });
    elder.position.set(8.5, heightAt(8.5, 24) + 0.28, 24);
    elder.rotation.y = -0.6;
    crowd.idle(elder); scene.add(elder);
    const pipeSmoke = makeSmoke(scene, { x: 8.5, y: heightAt(8.5, 24) + 1.3, z: 24.3, count: 6, rise: 2.4, spread: 0.4, opacity: 0.18, size: 0.5, speed: 0.3 });
    scene.add(pipeSmoke.mesh); updates.push(pipeSmoke.update);

    // hobbits walking the lane
    const walker1 = Cast.hobbit(rand); walker1.userData.anim.phase = 1;
    scene.add(walker1);
    crowd.walk(walker1, lane.map(([x, z]) => [x, 0, z]), { speed: 1.0, loop: 'pingpong', offset: 0.2 });
    const walker2 = makePerson({ height: 1.02, skin: 0xdcb08a, hair: 0x8a6530, hairLen: 0.6, tunic: 0x8a4a3a, pants: 0x4a3d2c, boots: 0xc8a080, prop: 'basket' });
    scene.add(walker2);
    crowd.walk(walker2, lane.map(([x, z]) => [x, 0, z]), { speed: 0.85, loop: 'pingpong', offset: 0.65 });

    // children racing around the Party Field
    for (let k = 0; k < 2; k++){
      const kid = makePerson({ height: 0.72 + k * 0.06, skin: 0xdcb08a, hair: k ? 0x8a6530 : 0x50351e, hairLen: 0.5, tunic: k ? 0xc9a227 : 0x2e5a8a, pants: 0x5a4632, boots: 0xc8a080 });
      scene.add(kid);
      crowd.walk(kid, [[-14, 0, 34], [10, 0, 32], [20, 0, 48], [6, 0, 60], [-12, 0, 54]],
        { speed: 2.3, loop: 'loop', closed: true, offset: k * 0.12, animSpeed: 1.5 });
    }

    // Gandalf arriving — horse-drawn cart down the lane, Frodo beside him
    const caravan = new THREE.Group();
    const pony = makeHorse({ color: 0x5a4632 });
    caravan.add(pony);
    const cart = makeCart(true);
    cart.position.set(-2.6, 0, 0);
    cart.rotation.y = Math.PI / 2;
    caravan.add(cart);
    const gandalf = Cast.gandalf({ pose: 'sit' });
    gandalf.position.set(-2.2, 1.05, 0.35);
    gandalf.rotation.y = Math.PI / 2;
    applyPose(gandalf, 'sit');
    caravan.add(gandalf);
    const frodo = Cast.frodo({ pose: 'sit' });
    frodo.position.set(-2.2, 1.15, -0.42);
    frodo.rotation.y = Math.PI / 2;
    applyPose(frodo, 'sit');
    caravan.add(frodo);
    caravan.userData.anim = pony.userData.anim; // crowd animates the pony's legs
    scene.add(caravan);
    crowd.walk(caravan, [[118, 0, 148], [78, 0, 100], [46, 0, 66], [18, 0, 34], [-2, 0, 8], [-16, 0, -16], [-30, 0, -40]],
      { speed: 1.6, loop: 'pingpong', horse: true, animSpeed: 0.55 });

    // miller by the mill, hobbit couple on the bridge
    const miller = Cast.hobbit(rand);
    miller.position.set(21, Math.max(heightAt(21, 58), 0.6), 58);
    miller.rotation.y = -0.8;
    crowd.idle(miller); scene.add(miller);
    const stroller = Cast.hobbit(rand);
    scene.add(stroller);
    crowd.walk(stroller, [[58, 0, 46], [46, 0, 52], [36, 0, 60], [28, 0, 68]], { speed: 0.8, loop: 'pingpong' });

    // ducks on the water
    for (let d = 0; d < 3; d++){
      const duck = new THREE.Group();
      const bd = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 6), mat(0xe8e2d0));
      bd.scale.set(1.5, 0.85, 1);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), mat(0xe8e2d0));
      neck.position.set(0.28, 0.28, 0);
      neck.rotation.z = -0.35;
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x4a6b2c));
      hd.position.set(0.36, 0.44, 0);
      const bill = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), mat(0xd8a030));
      bill.rotation.z = -Math.PI / 2;
      bill.position.set(0.48, 0.43, 0);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), mat(0xdcd4be));
      tail.rotation.z = Math.PI / 2 + 0.5;
      tail.position.set(-0.36, 0.12, 0);
      duck.add(bd, neck, hd, bill, tail);
      scene.add(duck);
      crowd.walk(duck, [[52, 0.35, 74], [66, 0.35, 70], [74, 0.35, 84], [62, 0.35, 94], [50, 0.35, 86]],
        { speed: 0.5, loop: 'loop', closed: true, fly: true, offset: d * 0.3, bob: 0.03 });
    }

    // swallows overhead
    for (let i = 0; i < 3; i++){
      const bird = makeFlyer('crow');
      bird.children.forEach(m => { if (m.material) m.material = mat(0x6a5a48); });
      scene.add(bird);
      crowd.fly(bird, [[-60, 26, -20], [20, 32, 40], [70, 24, 60], [10, 30, 90], [-50, 28, 30]],
        { speed: 9, closed: true, loop: 'loop', offset: i * 0.33 });
    }

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // the classic establishing sweep over the hills toward Bag End
        pos: [[140, 42, 200], [86, 28, 138], [36, 17, 74], [0, 12, 26]],
        look: [[-34, 22, -48], [-36, 20, -50], [-38, 18, -52], [-38, 16, -52]],
        dur: 20,
      },
      { // low glide along the lane, doors drifting past
        pos: [[64, 5.5, 92], [40, 5, 62], [16, 4.5, 32], [-4, 5, 6]],
        look: [[10, 4, 26], [-6, 4, 2], [-22, 6, -22], [-34, 9, -48]],
        dur: 18,
      },
      { // Bag End portrait — the green door beneath the oak, from the lane
        pos: [
          [-20, heightAt(-20, -26) + 2.6, -26],
          [-25, heightAt(-25, -32) + 2.2, -32],
          [-29, heightAt(-29, -38) + 2.0, -38]],
        look: [
          [-35.5, heightAt(-38, -52) + 1.8, -48],
          [-35.5, heightAt(-38, -52) + 1.7, -48.4],
          [-35.8, heightAt(-38, -52) + 1.6, -48.4]],
        dur: 14,
      },
      { // the mill across the Water, wheel turning
        pos: [[86, 3.2, 90], [76, 3.0, 99], [62, 2.8, 104]],
        look: [[22, 6.5, 62], [23, 6, 63], [25, 5.5, 64]],
        dur: 16,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.06, 1.02, 0.94], gamma: [1.02, 1.03, 1.0], lift: [0.012, 0.012, 0.004],
        sat: 1.06, temp: 0.24, bloom: 0.26, bloomThreshold: 0.8,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
