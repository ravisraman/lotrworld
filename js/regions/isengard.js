// Isengard — the Ring of Isengard under a bruised sky. Orthanc, black and
// gleaming, rises from a wasteland of felled trees, fire-pits and toiling
// orcs, while crebain wheel about the tower's horns.
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { plantTrees, scatterRocks, makeParticles, makeSmoke, makeBanner, mergeGeos } from '../engine/nature.js';
import { Cast, Crowd, makePerson, makeFlyer, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'isengard', name: 'Isengard', subtitle: 'the Ring of Isengard, and the Tower of Orthanc',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x4c4c50, 0.0028);
    const rand = mulberry32(1119);
    const updates = [];

    const pits = [
      [40, 30, 11], [-45, 20, 9], [20, -55, 12], [-30, -50, 8],
      [65, -15, 9], [-70, -8, 10], [8, 68, 9], [55, 60, 8],
    ];
    function heightAt(x, z){
      let h = fbm(x * 0.012, z * 0.012, 4) * 5;
      const d = Math.hypot(x, z);
      // ring wall berm at r=150
      h += smoothstep(126, 152, d) * 9 * (1 - smoothstep(152, 182, d));
      // excavated pits
      for (const [px, pz, pr] of pits){
        const pd = Math.hypot(x - px, z - pz);
        h -= smoothstep(pr, 0, pd) * 9;
      }
      return h;
    }
    const scorch = new THREE.Color(0x3a352c), mudC = new THREE.Color(0x484034), ashC = new THREE.Color(0x504c44);
    const terr = makeTerrain({
      size: 900, res: 300, height: heightAt, roughness: 0.9,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.03, z * 0.03, 3);
        out.copy(scorch).lerp(mudC, n);
        const d = Math.hypot(x, z);
        if (d > 140) out.lerp(new THREE.Color(0x322e2a), 0.65);
        for (const [px, pz, pr] of pits){
          const pd = Math.hypot(x - px, z - pz);
          if (pd < pr * 1.4) out.lerp(new THREE.Color(0x241c14), 1 - pd / (pr * 1.4));
        }
        if (h < -4) out.lerp(new THREE.Color(0x1a1208), 0.6);
      },
    });
    scene.add(terr.mesh);

    // ---- glowering sky -------------------------------------------------
    const sunDir = new THREE.Vector3(-0.5, 0.35, 0.4).normalize();
    const sky = makeSky({
      zenith: 0x3a4250, horizon: 0x8a7c66, ground: 0x4c4840,
      sunDir, sunColor: 0xe8d0a0, sunSize: 0.024, sunHalo: 0.2, sunIntensity: 0.6,
      cloudColor: 0x6d6660, cloudShadow: 0x2c2a28, cloudCover: 0.72, cloudSharp: 0.28,
      cloudScale: 2.4, cloudSpeed: 0.02, haze: 0.7,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2400, height: 700, color: 0x494e5a, jag: 2.6, seed: 91 },  // Misty Mountains behind
      { dist: 1700, height: 420, color: 0x3d4049, jag: 3.0, seed: 92 },
    ], 0x413c34));

    const sun = new THREE.DirectionalLight(0xe0ccA8, 2.4);
    sun.position.copy(sunDir).multiplyScalar(400);
    sun.castShadow = true;
    sun.shadow.radius = 7;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x8f9ab0, 0x4c443a, 1.7));
    scene.add(new THREE.AmbientLight(0x55503c, 0.7));
    // cold rim from the north so Orthanc's edges catch light
    const rim = new THREE.DirectionalLight(0x9ab0d0, 0.9);
    rim.position.set(60, 120, -260);
    scene.add(rim);

    // ---- Orthanc -------------------------------------------------------
    const orthanc = new THREE.Group();
    const obsidian = mat(0x1c1e26, { roughness: 0.28, metalness: 0.6 });
    // four fused shafts that taper and split into an outward-splayed crown
    for (const [ox, oz] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]){
      // tapering corner shaft
      const shaftG = new THREE.BoxGeometry(8.6, 74, 8.6);
      { const sp = shaftG.attributes.position;
        for (let i = 0; i < sp.count; i++){
          const t = (sp.getY(i) / 74) + 0.5;
          const k = 1 - t * 0.32;
          sp.setX(i, sp.getX(i) * k); sp.setZ(i, sp.getZ(i) * k);
        }
        shaftG.computeVertexNormals(); }
      const shaft = new THREE.Mesh(shaftG, obsidian);
      shaft.position.set(ox, 37, oz);
      orthanc.add(shaft);
      // long separated horn rising from the shoulder block corner,
      // splayed outward — the signature four-pointed crown
      const hornG = new THREE.BoxGeometry(5.2, 48, 5.2);
      { const hp = hornG.attributes.position;
        for (let i = 0; i < hp.count; i++){
          const t = (hp.getY(i) / 48) + 0.5;
          const k = 1 - t * 0.6;
          hp.setX(i, hp.getX(i) * k); hp.setZ(i, hp.getZ(i) * k);
        }
        hornG.computeVertexNormals(); }
      const horn = new THREE.Mesh(hornG, obsidian);
      horn.position.set(ox * 1.7, 94, oz * 1.7);
      horn.rotation.z = -Math.sign(ox) * 0.055;
      horn.rotation.x = Math.sign(oz) * 0.055;
      orthanc.add(horn);
      // vertical rib on each outer face
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 70, 1.1), obsidian);
      rib.position.set(ox * 2.1, 35, oz * 2.1);
      orthanc.add(rib);
    }
    const waist = new THREE.Mesh(new THREE.BoxGeometry(13.5, 56, 13.5), obsidian);
    waist.position.y = 28;
    orthanc.add(waist);
    // the high balcony platform between the horns
    // the shoulder block the horns rise from
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(17, 5, 17), obsidian);
    shoulder.position.y = 73.5;
    orthanc.add(shoulder);
    const balc = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 12), obsidian);
    balc.position.y = 76.4;
    orthanc.add(balc);
    // narrow window slits set into the waist faces
    const slitM = mat(0x2a3648, { emissive: 0x3a5068, emissiveIntensity: 1.2 });
    for (let i = 0; i < 12; i++){
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 3.0), slitM);
      const face = i % 4;
      const off = (((i / 4) | 0) - 1) * 2.6;
      const fr = 6.85;
      if (face === 0) slit.position.set(off, 16 + (i % 3) * 15, fr);
      if (face === 1) slit.position.set(off, 21 + (i % 3) * 15, -fr);
      if (face === 2){ slit.position.set(fr, 18 + (i % 3) * 15, off); slit.rotation.y = Math.PI / 2; }
      if (face === 3){ slit.position.set(-fr, 23 + (i % 3) * 15, off); slit.rotation.y = -Math.PI / 2; }
      if (face === 1) slit.rotation.y = Math.PI;
      orthanc.add(slit);
    }
    // entrance stair
    for (let i = 0; i < 8; i++){
      const step = new THREE.Mesh(new THREE.BoxGeometry(9 - i * 0.6, 0.55, 2.4), obsidian);
      step.position.set(0, 0.3 + (7 - i) * 0.55, 9 + i * 1.1);
      orthanc.add(step);
    }
    orthanc.position.set(0, heightAt(0, 0), 0);
    orthanc.traverse(o => { o.castShadow = o.receiveShadow = true; });
    scene.add(orthanc);

    // Saruman the White on the pinnacle
    const saruman = Cast.saruman();
    saruman.position.set(0, heightAt(0, 0) + 77.1, 0);
    saruman.rotation.y = Math.PI * 0.8;
    scene.add(saruman);

    // ---- the industry of Isengard --------------------------------------
    // fire-pits: glow + embers + smoke + crude gantries
    for (const [px, pz, pr] of pits){
      const py = heightAt(px, pz);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(pr * 0.62, 14),
        mat(0x1c0c04, { emissive: 0xff5a14, emissiveIntensity: 2.6 }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(px, py + 0.35, pz);
      scene.add(glow);
      const pl = new THREE.PointLight(0xff6a20, 240, pr * 7, 2);
      pl.position.set(px, py + 3.5, pz);
      scene.add(pl);
      const phase = rand() * 10;
      updates.push((t) => { pl.intensity = 160 + Math.sin(t * 4.1 + phase) * 40; });
      const smoke = makeSmoke(scene, { x: px, y: py + 0.5, z: pz, count: 24, rise: 42, spread: 6, color: 0x262422, opacity: 0.5, size: 8, speed: 0.12 });
      scene.add(smoke.mesh); updates.push(smoke.update);
      const emb = makeParticles(scene, 'ember', { cx: px, cy: py + 0.5, cz: pz, area: [pr * 0.9, 30, pr * 0.9], count: 90, size: 1.1, seed: (px + 99) | 0 });
      scene.add(emb.mesh); updates.push(emb.update);
      // gantry over the pit
      const gant = new THREE.Group();
      const legM = mat(0x2c241a);
      for (const s of [-1, 1]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 9, 6), legM);
        leg.position.set(px + s * pr * 0.7, py - 4.5 + 4.5, pz);
        leg.rotation.z = s * 0.3;
        gant.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, pr * 1.7, 6), legM);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(px, py + 3.4, pz);
      gant.add(beam);
      const wheelM = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.16, 6, 12), legM);
      wheelM.position.set(px, py + 3.4, pz);
      gant.add(wheelM);
      const wheelPhase = rand() * 9;
      updates.push((t) => { wheelM.rotation.z = t * 0.7 + wheelPhase; });
      gant.traverse(o => { o.castShadow = true; });
      scene.add(gant);
    }

    // the ring wall of Isengard — a low dark rampart enclosing the pits
    {
      const rampM = mat(0x2a2724, { roughness: 1 });
      const rampGeos = [];
      for (let i = 0; i < 72; i++){
        const a0 = (i / 72) * Math.PI * 2;
        const seg = new THREE.BoxGeometry(14, 9 + ((i % 4) * 0.8), 4);
        seg.rotateY(-a0 - Math.PI / 2);
        seg.translate(Math.cos(a0) * 152, heightAt(Math.cos(a0) * 152, Math.sin(a0) * 152) + 4.2, Math.sin(a0) * 152);
        rampGeos.push(seg);
      }
      const rampart = new THREE.Mesh(mergeGeos(rampGeos), rampM);
      rampart.castShadow = rampart.receiveShadow = true;
      scene.add(rampart);
    }

    // felled forest — stumps ringing the wasteland, log piles
    const stumps = [];
    for (let i = 0; i < 90; i++){
      const a = rand() * Math.PI * 2, r = 95 + rand() * 45;
      stumps.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    for (const s of stumps.slice(0, 50)){
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + rand() * 0.4, 0.7 + rand() * 0.4, 0.8, 7), mat(0x5a4a34));
      st.position.set(s.x, heightAt(s.x, s.z) + 0.4, s.z);
      st.castShadow = true;
      scene.add(st);
    }
    for (let i = 0; i < 16; i++){
      const a = rand() * Math.PI * 2, r = 45 + rand() * 70;
      const pile = new THREE.Group();
      for (let j = 0; j < 4; j++){
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 7 + rand() * 4, 7), mat(0x4c4234));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = rand() * 0.3;
        log.position.set(0, 0.5 + (j > 1 ? 0.9 : 0), (j % 2) * 1.1 - 0.5);
        pile.add(log);
      }
      pile.position.set(Math.cos(a) * r, heightAt(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r);
      pile.rotation.y = rand() * Math.PI;
      pile.traverse(o => { o.castShadow = true; });
      scene.add(pile);
    }
    // dead trees beyond the ring
    scene.add(plantTrees('dead', Array.from({ length: 50 }, () => {
      const a = rand() * Math.PI * 2, r = 190 + rand() * 160;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }), { heightAt, seed: 7, trunkColor: 0x3a322a }));
    scene.add(scatterRocks(
      Array.from({ length: 36 }, () => ({ x: (rand() - 0.5) * 600, z: (rand() - 0.5) * 600, s: 0.5 + rand() * 1.6 })),
      { heightAt, color: 0x4c4840, seed: 13 }));

    // white hand banners
    for (const [bx, bz] of [[-14, 40], [16, 38], [-30, -20], [28, -26]]){
      const b = makeBanner(scene, { color: '#17181c', emblem: 'hand', emblemColor: '#e2ded4', w: 1.3, h: 2.4, poleH: 5.5, wind: 1.1 });
      b.mesh.position.set(bx, heightAt(bx, bz), bz);
      scene.add(b.mesh); updates.push(b.update);
    }

    // drifting ash
    const ash = makeParticles(scene, 'ash', { cx: 0, cy: 4, cz: 0, area: [340, 90, 340], count: 900, color: 0x4a4642, opacity: 0.5 });
    scene.add(ash.mesh); updates.push(ash.update);

    // ---- orc labour ----------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    for (let i = 0; i < 10; i++){
      const orc = Cast.orc(rand);
      scene.add(orc);
      const p1 = pits[i % pits.length], p2 = pits[(i + 3) % pits.length];
      crowd.walk(orc, [
        [p1[0] + 6, 0, p1[1] + 6], [(p1[0] + p2[0]) / 2 + (rand() - 0.5) * 20, 0, (p1[1] + p2[1]) / 2 + (rand() - 0.5) * 20], [p2[0] - 6, 0, p2[1] - 6],
      ], { speed: 1.3 + rand() * 0.5, loop: 'pingpong', offset: rand(), animSpeed: 1.1 });
    }
    // log-haulers on the perimeter
    for (let i = 0; i < 4; i++){
      const orc = Cast.orc(rand);
      scene.add(orc);
      const a0 = rand() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 5; k++){
        const a = a0 + k * 0.5;
        pts.push([Math.cos(a) * 110, 0, Math.sin(a) * 110]);
      }
      crowd.walk(orc, pts, { speed: 1.1, loop: 'pingpong', offset: rand() });
    }
    // pit gangs at the rims
    for (let i = 0; i < 6; i++){
      const orc = Cast.orc(rand);
      const pit = pits[i % pits.length];
      orc.position.set(pit[0] + pit[2] * 0.8, heightAt(pit[0] + pit[2] * 0.8, pit[1]), pit[1] + 1.5);
      orc.rotation.y = rand() * Math.PI * 2;
      crowd.idle(orc); scene.add(orc);
    }

    // overseers at the tower stair
    for (const [gx, gz, ry] of [[-6, 16, 0.4], [7, 15, -0.3]]){
      const orc = Cast.orc(rand);
      orc.position.set(gx, heightAt(gx, gz), gz);
      orc.rotation.y = ry;
      crowd.idle(orc); scene.add(orc);
    }

    // crebain — a wheeling flock about the tower
    for (let i = 0; i < 14; i++){
      const crow = makeFlyer('crow');
      scene.add(crow);
      const r = 22 + (i % 4) * 6, h = 55 + (i % 5) * 9;
      const pts = [];
      for (let k = 0; k < 6; k++){
        const a = (k / 6) * Math.PI * 2;
        pts.push([Math.cos(a) * r, h + Math.sin(a * 2) * 4, Math.sin(a) * r]);
      }
      crowd.fly(crow, pts, { speed: 14 + (i % 3) * 3, closed: true, loop: 'loop', offset: i / 14 });
    }

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // approach across the wasteland — the tower black against the sky
        pos: [[-210, 34, 230], [-140, 26, 150], [-72, 20, 80], [-30, 17, 34]],
        look: [[0, 48, 0], [0, 50, 0], [0, 52, 0], [0, 54, 0]],
        dur: 20,
      },
      { // rising alongside Orthanc to the pinnacle
        pos: [[30, 8, 42], [34, 34, 30], [30, 62, 16], [22, 88, 4]],
        look: [[0, 30, 0], [0, 48, 0], [0, 70, 0], [0, 84, 0]],
        dur: 18,
      },
      { // the fire-pits — smoke, embers, toiling shapes
        pos: [[64, 7, 54], [50, 6, 44], [36, 5.5, 36]],
        look: [[40, -2, 30], [38, -1, 28], [30, 0, 16]],
        dur: 14,
      },
      { // high wide — the whole scarred ring, crebain wheeling
        pos: [[-170, 120, -170], [-110, 105, -110], [-55, 92, -60]],
        look: [[10, 30, 10], [6, 34, 6], [0, 40, 0]],
        dur: 16,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.0, 0.98, 1.02], gamma: [1.05, 1.04, 1.04], lift: [0.02, 0.018, 0.02],
        sat: 0.8, temp: -0.1, bloom: 0.46, bloomThreshold: 0.55, grain: 0.028,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
