// Mordor — the Land of Shadow. Ash on the wind, Orodruin vomiting fire,
// the iron crown of Barad-dûr and the lidless Eye sweeping the waste,
// orc-columns marching, and two small figures climbing the burning mountain.
import * as THREE from 'three';
import { fbm, ridged, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { scatterRocks, makeParticles, makeSmoke, makeBanner, mergeGeos } from '../engine/nature.js';
import { Cast, Crowd, makePerson, makeFlyer, mat } from '../engine/characters.js';

export default {
  id: 'mordor', name: 'Mordor', subtitle: 'Orodruin, and the Dark Tower of Barad-dûr',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x241a16, 0.0035);
    const rand = mulberry32(9009);
    const updates = [];

    // Mount Doom at (-120, -60); Barad-dûr at (150, -170)
    const doom = { x: -120, z: -60, r: 130, h: 150 };
    function heightAt(x, z){
      let h = ridged(x * 0.008 + 7, z * 0.008, 4) * 22;
      const dd = Math.hypot(x - doom.x, z - doom.z);
      // the volcano cone with a carved lip and bowl
      h += Math.max(0, 1 - dd / doom.r) ** 1.4 * doom.h;
      h += smoothstep(44, 26, dd) * 12;   // crater lip
      h -= smoothstep(38, 10, dd) * 72;   // the bowl (deeper than the cone rise)
      h += fbm(x * 0.09 + 3, z * 0.09, 3) * smoothstep(70, 20, dd) * 6; // rough rim rock
      // jagged waste
      h += fbm(x * 0.03, z * 0.03, 3) * 6;
      // keep the marching road flat-ish
      const roadD = Math.abs(z - 60 - Math.sin(x * 0.01) * 20);
      h *= 1 - Math.exp(-(roadD * roadD) / (2 * 12 * 12)) * 0.5;
      return h;
    }
    const ashDark = new THREE.Color(0x2a211c), ashMid = new THREE.Color(0x3c322a), scorC = new THREE.Color(0x1c1410);
    const terr = makeTerrain({
      size: 1200, res: 300, height: heightAt, roughness: 0.95,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.02, z * 0.02, 3);
        out.copy(ashDark).lerp(ashMid, n);
        if (slope > 0.35) out.lerp(scorC, (slope - 0.35) * 2);
        const dd = Math.hypot(x - doom.x, z - doom.z);
        if (dd < doom.r * 0.9) out.lerp(new THREE.Color(0x17100c), 0.6);
      },
    });
    scene.add(terr.mesh);

    // ---- the burning sky -----------------------------------------------
    const sky = makeSky({
      zenith: 0x1a0e10, horizon: 0x6b2a14, ground: 0x1c1210,
      sunDir: new THREE.Vector3(0, 0.4, -1).normalize(),
      sunColor: 0x000000, sunSize: 0.0, sunHalo: 0, sunIntensity: 0,
      cloudColor: 0x4c2418, cloudShadow: 0x120a08, cloudCover: 0.8, cloudSharp: 0.35,
      cloudScale: 2.6, cloudSpeed: 0.02, haze: 0.9,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2600, height: 520, color: 0x201a1c, jag: 3.0, seed: 111 },
      { dist: 1800, height: 340, color: 0x191416, jag: 3.4, seed: 112 },
    ], 0x241c18));

    scene.add(new THREE.AmbientLight(0x5c3222, 1.5));
    const gloom = new THREE.DirectionalLight(0x8a4a2c, 1.35);
    gloom.position.set(-200, 260, 100);
    gloom.castShadow = true;
    gloom.shadow.mapSize.set(2048, 2048);
    gloom.shadow.camera.left = -220; gloom.shadow.camera.right = 220;
    gloom.shadow.camera.top = 220; gloom.shadow.camera.bottom = -220;
    scene.add(gloom);

    // ---- Orodruin ------------------------------------------------------
    // crater glow + eruption column
    const craterY = heightAt(doom.x, doom.z) + 4;
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(20, 20),
      mat(0x2a0c02, { emissive: 0xff5a0e, emissiveIntensity: 3.2 }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(doom.x, craterY, doom.z);
    scene.add(lake);
    const craterLight = new THREE.PointLight(0xff5a14, 2600, 420, 2);
    craterLight.position.set(doom.x, craterY + 30, doom.z);
    scene.add(craterLight);
    updates.push((t) => { craterLight.intensity = 2300 + Math.sin(t * 2.9) * 500 + Math.sin(t * 7.7) * 300; });

    // lava rivers down the flanks — glowing ribbon tubes
    const lavaCore = mat(0x3a1002, { emissive: 0xff6a12, emissiveIntensity: 4.2 });
    const lavaCrust = mat(0x1a0c06, { emissive: 0xc94008, emissiveIntensity: 2.2, roughness: 1 });
    for (let i = 0; i < 5; i++){
      const a = 0.6 + i * 1.15;
      const pts = [];
      for (let k = 0; k <= 10; k++){
        const t = k / 10;
        const r = 26 + t * (doom.r * 0.95);
        const wob = Math.sin(t * 7 + i * 3) * 5 * t;
        const x = doom.x + Math.cos(a) * r + Math.cos(a + 1.57) * wob;
        const z = doom.z + Math.sin(a) * r + Math.sin(a + 1.57) * wob;
        pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.5, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const crust = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 1.7 - i * 0.14, 6), lavaCrust);
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 1.25 - i * 0.1, 5), lavaCore);
      core.position.y = 0.55;
      scene.add(crust, core);
      // pooled, glowing terminus + light halos along the flow
      const endP = pts[pts.length - 1];
      const pool2 = new THREE.Mesh(new THREE.CircleGeometry(4.5 - i * 0.4, 12), lavaCore);
      pool2.rotation.x = -Math.PI / 2;
      pool2.position.set(endP.x, endP.y + 0.15, endP.z);
      scene.add(pool2);
      for (const k2 of [2, 5, 8]){
        const lp2 = new THREE.PointLight(0xff5a14, 160, 62, 2);
        lp2.position.set(pts[k2].x, pts[k2].y + 4, pts[k2].z);
        scene.add(lp2);
      }
    }
    // eruption smoke + fire spray
    const eruption = makeSmoke(scene, {
      x: doom.x, y: craterY + 4, z: doom.z, count: 26, rise: 130, spread: 26,
      color: 0x16100c, opacity: 0.55, size: 30, speed: 0.07,
    });
    scene.add(eruption.mesh); updates.push(eruption.update);
    const fireSpray = makeParticles(scene, 'ember', {
      cx: doom.x, cy: craterY + 2, cz: doom.z, area: [60, 120, 60],
      count: 1200, size: 3.2, fall: -14, drift: 3, color: 0xff7a1a, seed: 4,
    });
    scene.add(fireSpray.mesh); updates.push(fireSpray.update);

    // ---- Barad-dûr -----------------------------------------------------
    const tower = new THREE.Group();
    const ironM = mat(0x16141a, { roughness: 0.45, metalness: 0.6 });
    // jagged stacked shafts
    const tiersB = [[26, 60, 0], [21, 50, 0.2], [17, 46, -0.15], [13, 40, 0.1], [9, 34, -0.1]];
    let ty = 0;
    for (const [r, h, twist] of tiersB){
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 7), ironM);
      seg.position.y = ty + h / 2;
      seg.rotation.y = twist;
      tower.add(seg);
      // buttress spikes
      for (let i = 0; i < 5; i++){
        const a = (i / 5) * Math.PI * 2 + twist;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, h * 0.5, 5), ironM);
        spike.position.set(Math.cos(a) * r * 0.9, ty + h * 0.6, Math.sin(a) * r * 0.9);
        spike.rotation.z = -Math.cos(a) * 0.25;
        spike.rotation.x = Math.sin(a) * 0.25;
        tower.add(spike);
      }
      ty += h;
    }
    // the two horns cradling the Eye
    for (const s of [-1, 1]){
      const horn = new THREE.Mesh(new THREE.ConeGeometry(4.2, 52, 6), ironM);
      horn.position.set(s * 10.5, ty + 22, 0);
      horn.rotation.z = -s * 0.14;
      tower.add(horn);
    }
    // faint furnace-lights in the fortress walls
    for (let i = 0; i < 10; i++){
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6),
        mat(0x2a0c04, { emissive: 0xd84a10, emissiveIntensity: 1.6 }));
      const wa = (i / 10) * Math.PI * 2 + 0.3;
      const wr = 20 - (i % 3) * 3;
      wl.position.set(Math.cos(wa) * wr, 40 + (i % 5) * 32, Math.sin(wa) * wr);
      wl.rotation.y = -wa + Math.PI / 2;
      tower.add(wl);
    }
    tower.position.set(150, heightAt(150, -170), -170);
    tower.traverse(o => { o.castShadow = true; });
    scene.add(tower);

    // the Eye — layered glow sprites + a sweeping beam
    const eyeY = heightAt(150, -170) + ty + 30;
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(150, eyeY, -170);
    function glowSprite(size, color, opacity){
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g2 = cv.getContext('2d');
      const grad = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255,180,60,1)');
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sp.scale.setScalar(size);
      return sp;
    }
    // one sprite: flaming vertical almond with a painted dark slit
    const eyeCv = document.createElement('canvas');
    eyeCv.width = 128; eyeCv.height = 128;
    {
      const g3 = eyeCv.getContext('2d');
      const rg = g3.createRadialGradient(64, 64, 3, 64, 64, 60);
      rg.addColorStop(0, 'rgba(255,190,80,1)');
      rg.addColorStop(0.35, 'rgba(255,110,20,0.85)');
      rg.addColorStop(1, 'rgba(120,20,4,0)');
      g3.fillStyle = rg;
      g3.save(); g3.translate(64, 64); g3.scale(0.62, 1); g3.translate(-64, -64);
      g3.fillRect(0, 0, 128, 128);
      g3.restore();
      // the slit
      g3.fillStyle = 'rgba(10,4,2,0.92)';
      g3.save(); g3.translate(64, 64); g3.scale(1, 4.4);
      g3.beginPath(); g3.arc(0, 0, 4.2, 0, Math.PI * 2); g3.fill();
      g3.restore();
    }
    const eyeTex = new THREE.CanvasTexture(eyeCv);
    const eyeCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: eyeTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    eyeCore.scale.set(30, 40, 1);
    const eyeHalo = glowSprite(60, 'rgba(255,60,10,0.5)', 0.5);
    eyeHalo.scale.set(44, 40, 1);
    eyeGroup.add(eyeHalo, eyeCore);
    scene.add(eyeGroup);
    const eyePoint = new THREE.PointLight(0xff6a1a, 900, 220, 2);
    eyePoint.position.set(150, eyeY, -170);
    scene.add(eyePoint);
    const eyeLight = new THREE.SpotLight(0xff6a1a, 8000, 900, 0.16, 0.5, 1.2);
    eyeLight.position.copy(eyeGroup.position);
    const eyeTarget = new THREE.Object3D();
    scene.add(eyeTarget);
    eyeLight.target = eyeTarget;
    scene.add(eyeLight);
    updates.push((t) => {
      const sweep = t * 0.21;
      eyeTarget.position.set(150 + Math.cos(sweep) * 400, 0, -170 + Math.sin(sweep) * 400);
      eyeCore.material.opacity = 0.88 + Math.sin(t * 6.1) * 0.12;
    });

    // ---- the waste -----------------------------------------------------
    const spikes = [];
    for (let i = 0; i < 40; i++){
      const x = (rand() - 0.5) * 900, z = (rand() - 0.5) * 900;
      if (Math.hypot(x - doom.x, z - doom.z) < doom.r) continue;
      const g = new THREE.ConeGeometry(3 + rand() * 6, 14 + rand() * 30, 5);
      g.rotateZ((rand() - 0.5) * 0.4);
      g.rotateY(rand() * Math.PI);
      g.translate(x, heightAt(x, z) + 4, z);
      spikes.push(g);
    }
    const spikesM = new THREE.Mesh(mergeGeos(spikes), mat(0x201a18, { roughness: 1, flatShading: true }));
    spikesM.castShadow = true;
    scene.add(spikesM);
    scene.add(scatterRocks(
      Array.from({ length: 70 }, () => ({ x: (rand() - 0.5) * 800, z: (rand() - 0.5) * 800, s: 0.6 + rand() * 2.2 })),
      { heightAt, color: 0x241e1a, seed: 21 }));

    const ashfall = makeParticles(scene, 'ash', { cx: 0, cy: 10, cz: 0, area: [500, 160, 500], count: 2600, color: 0x6b5a4c, opacity: 0.5 });
    scene.add(ashfall.mesh); updates.push(ashfall.update);
    const embersW = makeParticles(scene, 'ember', { cx: -60, cy: 4, cz: 0, area: [300, 80, 300], count: 400, seed: 8 });
    scene.add(embersW.mesh); updates.push(embersW.update);

    // fire-light kissing the near waste
    const nearGlow = new THREE.PointLight(0xff5a1e, 900, 480, 2);
    nearGlow.position.set(-140, 60, 100);
    scene.add(nearGlow);

    // lightning in the murk
    const flash = new THREE.AmbientLight(0x8a5a3c, 0);
    scene.add(flash);
    updates.push((t) => {
      const cycle = Math.sin(t * 0.31) * Math.sin(t * 1.7) * Math.sin(t * 5.3);
      flash.intensity = cycle > 0.88 ? (cycle - 0.88) * 30 : 0;
    });

    // ---- the armies of the Eye -----------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    // marching column on the road
    const roadPts = [];
    for (let x = -320; x <= 320; x += 64){
      roadPts.push([x, 0, 60 + Math.sin(x * 0.01) * 20]);
    }
    for (let i = 0; i < 16; i++){
      const orc = i % 5 === 2
        ? (() => { const o = Cast.orc(rand); return o; })()
        : Cast.orc(rand);
      if (i % 5 === 2){
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5),
          mat(0xffa030, { emissive: 0xff7a20, emissiveIntensity: 3.0 }));
        fl.position.set(0.3, 1.9, 0.1);
        const tl = new THREE.PointLight(0xff8a3a, 14, 12, 2);
        tl.position.copy(fl.position);
        orc.add(fl, tl);
      }
      scene.add(orc);
      crowd.walk(orc, roadPts, {
        speed: 1.7, loop: 'pingpong', offset: 0.35 + (i % 8) * 0.022 + ((i / 8) | 0) * 0.011,
        animSpeed: 1.15,
      });
    }
    // banner-bearers in the column
    for (let i = 0; i < 2; i++){
      const bearer = Cast.orc(rand);
      const b = makeBanner(scene, { color: '#1a0c08', emblem: 'eye', emblemColor: '#c8471c', w: 1.1, h: 2, poleH: 3.8, wind: 1.2 });
      b.mesh.position.set(0, 0, -0.3);
      bearer.add(b.mesh);
      updates.push(b.update);
      scene.add(bearer);
      crowd.walk(bearer, roadPts, { speed: 1.7, loop: 'pingpong', offset: 0.35 + i * 0.09, animSpeed: 1.15 });
    }
    // watch-post orcs
    for (const [wx, wz] of [[-40, 120], [60, 30], [-180, 40]]){
      const orc = Cast.orc(rand);
      orc.position.set(wx, heightAt(wx, wz), wz);
      orc.rotation.y = rand() * Math.PI * 2;
      crowd.idle(orc); scene.add(orc);
      const fire = new THREE.PointLight(0xff6a20, 30, 20, 2);
      fire.position.set(wx + 1.5, heightAt(wx, wz) + 1, wz + 1.5);
      scene.add(fire);
      const fs = makeSmoke(scene, { x: wx + 1.5, y: heightAt(wx, wz), z: wz + 1.5, count: 8, rise: 8, color: 0x201a16, opacity: 0.35, size: 2 });
      scene.add(fs.mesh); updates.push(fs.update);
    }

    // distant torch-columns snaking across Gorgoroth
    {
      const torchLines = [];
      for (const [x0, z0, x1, z1, nT] of [[-260, 200, 120, 130, 60], [40, 240, 260, 40, 46]]){
        for (let k = 0; k < nT; k++){
          const tt = k / nT;
          const wob = Math.sin(tt * 9) * 14;
          const tx = x0 + (x1 - x0) * tt + wob;
          const tz = z0 + (z1 - z0) * tt + wob * 0.5;
          torchLines.push(tx, heightAt(tx, tz) + 2.2, tz);
        }
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(torchLines, 3));
      const tcv = document.createElement('canvas');
      tcv.width = tcv.height = 32;
      const tctx = tcv.getContext('2d');
      const tgrad = tctx.createRadialGradient(16, 16, 1, 16, 16, 15);
      tgrad.addColorStop(0, 'rgba(255,200,120,1)');
      tgrad.addColorStop(0.4, 'rgba(255,130,40,0.7)');
      tgrad.addColorStop(1, 'rgba(255,100,30,0)');
      tctx.fillStyle = tgrad; tctx.fillRect(0, 0, 32, 32);
      const tm = new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(tcv), size: 2.0, sizeAttenuation: true,
        transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const torchPts = new THREE.Points(tg, tm);
      scene.add(torchPts);
    }

    // Nazgûl on fell beasts circling the Dark Tower
    for (let i = 0; i < 3; i++){
      const fell = makeFlyer('fellbeast');
      scene.add(fell);
      const r = 60 + i * 26, h = eyeY - 85 + i * 24;
      const pts = [];
      for (let k = 0; k < 6; k++){
        const a = (k / 6) * Math.PI * 2;
        pts.push([150 + Math.cos(a) * r, h + Math.sin(a * 2) * 8, -170 + Math.sin(a) * r]);
      }
      crowd.fly(fell, pts, { speed: 17 + i * 2, closed: true, loop: 'loop', offset: i / 3 });
    }

    // Frodo and Sam on the slope of the mountain
    const slopePath = [];
    for (let k = 0; k <= 5; k++){
      const t = k / 5;
      const a = 1.35 + t * 0.85;
      const r = doom.r * (0.95 - t * 0.3);
      slopePath.push([doom.x + Math.cos(a) * r, 0, doom.z + Math.sin(a) * r]);
    }
    const frodo = Cast.frodo({ cloak: 0x5a5548, hoodUp: true });
    const sam = Cast.sam({ cloak: 0x5a5548, hoodUp: true });
    scene.add(frodo, sam);
    crowd.walk(frodo, slopePath, { speed: 0.42, loop: 'pingpong', offset: 0.52, animSpeed: 0.5 });
    crowd.walk(sam, slopePath, { speed: 0.42, loop: 'pingpong', offset: 0.5, animSpeed: 0.5 });

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // the hellscape wide — Doom erupting, the Tower far off
        pos: [[-380, 60, 320], [-280, 46, 240], [-190, 36, 170], [-130, 30, 120]],
        look: [[-40, 60, -80], [-30, 62, -85], [-20, 64, -90], [-10, 66, -95]],
        dur: 20,
      },
      { // the column marches beneath the burning mountain
        pos: [
          [-150, heightAt(-150, 110) + 8, 110], [-90, heightAt(-90, 104) + 7, 104],
          [-30, heightAt(-30, 100) + 6.5, 100], [40, heightAt(40, 102) + 7, 102]],
        look: [
          [-90, 44, -8], [-70, 46, -14], [-50, 48, -20], [-30, 46, -24]],
        dur: 17, ease: 'linear',
      },
      { // push-in on Barad-dûr and the lidless Eye
        pos: [[-40, 40, 60], [20, 60, -10], [70, 85, -70], [105, 110, -115]],
        look: [[150, eyeY - 20, -170], [150, eyeY - 10, -170], [150, eyeY, -170], [150, eyeY, -170]],
        dur: 18,
      },
      { // the slope of Orodruin — two small figures against the fire
        pos: [
          [-38, heightAt(-38, 66) + 8, 66], [-50, heightAt(-50, 56) + 9, 56],
          [-62, heightAt(-62, 46) + 10, 46]],
        look: [
          [-94, heightAt(-94, 8) + 10, 8], [-98, heightAt(-98, 2) + 11, 2],
          [-102, heightAt(-102, -4) + 12, -4]],
        dur: 15,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.12, 0.94, 0.86], gamma: [1.04, 1.02, 1.0], lift: [0.034, 0.016, 0.012],
        sat: 0.94, temp: 0.4, bloom: 0.62, bloomThreshold: 0.45, bloomRadius: 0.85,
        grain: 0.035, vignette: 0.36,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
