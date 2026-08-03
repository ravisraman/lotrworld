// Lothlórien — Caras Galadhon by night. Mallorn trees like silver towers,
// stairways spiralling into a canopy strung with pale lights, and the Lady
// of the Wood shining on her high talan.
import * as THREE from 'three';
import { fbm, mulberry32 } from '../engine/util.js';
import { makeSky } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { plantTrees, makeParticles, makeTreeGeo, mergeGeos } from '../engine/nature.js';
import { Cast, Crowd, mat } from '../engine/characters.js';

export default {
  id: 'lothlorien', name: 'Lothlórien', subtitle: 'Caras Galadhon, heart of elvendom on earth',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101a30, 0.0045);
    const rand = mulberry32(1981);
    const updates = [];

    const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
    function heightAt(x, z){
      let h = fbm(x * 0.015, z * 0.015, 4) * 8;
      h += gauss(x, z, 0, -30, 90) * 10; // the hill of Caras Galadhon
      return h;
    }
    const terr = makeTerrain({
      size: 700, res: 240, height: heightAt,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.05, z * 0.05, 3);
        out.setRGB(0.14, 0.18, 0.17).lerp(new THREE.Color(0x37514a), n);
        // drifts of fallen gold leaves
        const gold = fbm(x * 0.03 + 40, z * 0.03 + 40, 3);
        if (gold > 0.58) out.lerp(new THREE.Color(0x8a6b28), (gold - 0.58) * 1.6);
      },
    });
    scene.add(terr.mesh);

    // ---- night sky -----------------------------------------------------
    const moonDir = new THREE.Vector3(0.3, 0.6, -0.4).normalize();
    const sky = makeSky({
      zenith: 0x060b1c, horizon: 0x18263e, ground: 0x0a0e16,
      sunDir: moonDir, sunColor: 0xd8e4f8, sunSize: 0.022, sunHalo: 0.2, sunIntensity: 0.7,
      cloudColor: 0x2a3a54, cloudShadow: 0x0a1020, cloudCover: 0.2, cloudScale: 2.6,
      stars: 1.35, haze: 0.4,
    });
    scene.add(sky.mesh); updates.push(sky.update);

    scene.add(new THREE.AmbientLight(0x24345a, 1.6));
    const moon = new THREE.DirectionalLight(0xa8c0ec, 1.15);
    moon.position.copy(moonDir).multiplyScalar(300);
    moon.castShadow = true;
    moon.shadow.radius = 13;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -140; moon.shadow.camera.right = 140;
    moon.shadow.camera.top = 140; moon.shadow.camera.bottom = -140;
    scene.add(moon);
    scene.add(new THREE.HemisphereLight(0x3a5288, 0x1a2620, 1.5));

    // ---- the great mallorns -------------------------------------------
    // hero trees around the hill, each with talan platforms + spiral stairs
    const heroTrees = [
      { x: 0, z: -30, s: 1.35 }, { x: -48, z: -12, s: 1.1 }, { x: 44, z: -52, s: 1.2 },
      { x: -26, z: -74, s: 1.0 }, { x: 58, z: 6, s: 0.95 }, { x: -70, z: -50, s: 1.05 },
    ];
    const trunkM = mat(0xb0aeb8, { roughness: 0.6, emissive: 0x2c3448, emissiveIntensity: 0.5 });
    const leafM = mat(0xc09a34, {
      roughness: 0.85, emissive: 0x7d621e, emissiveIntensity: 0.5,
    });
    const ivoryM = mat(0xd8dce4, { roughness: 0.6, emissive: 0x3a4458, emissiveIntensity: 0.3 });
    const lanternPts = [];
    for (const ht of heroTrees){
      const g = new THREE.Group();
      const tg = makeTreeGeo('mallorn', mulberry32((ht.x * 7 + ht.z) | 0));
      const trunk = new THREE.Mesh(tg.trunks, trunkM);
      const canopy = new THREE.Mesh(tg.leaves, leafM);
      trunk.castShadow = canopy.castShadow = true;
      g.add(trunk, canopy);

      // spiral stair winding the trunk
      const stairGeos = [];
      const turns = 2.0, steps = 40, baseR = 3.0;
      for (let i = 0; i < steps; i++){
        const t = i / steps;
        const a = t * Math.PI * 2 * turns;
        const y = 2 + t * 22;
        const r = baseR - t * 1.55;
        const step = new THREE.BoxGeometry(2.7, 0.14, 0.9);
        step.rotateY(-a);
        step.translate(Math.cos(a) * r, y, Math.sin(a) * r);
        stairGeos.push(step);
      }
      const stair = new THREE.Mesh(mergeGeos(stairGeos), ivoryM);
      stair.castShadow = true;
      g.add(stair);

      // talan platform with a slender rail
      const talanY = 24.5;
      const talan = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.4, 0.5, 10), ivoryM);
      talan.position.y = talanY;
      g.add(talan);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.06, 6, 20), ivoryM);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = talanY + 1.1;
      g.add(rail);
      for (let i = 0; i < 10; i++){
        const a = (i / 10) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), ivoryM);
        post.position.set(Math.cos(a) * 5.0, talanY + 0.55, Math.sin(a) * 5.0);
        g.add(post);
      }

      g.position.set(ht.x, heightAt(ht.x, ht.z), ht.z);
      g.scale.setScalar(ht.s);
      scene.add(g);

      // lantern positions in this tree's canopy + along the stair
      for (let i = 0; i < 14; i++){
        const a = rand() * Math.PI * 2, r = 2 + rand() * 5;
        lanternPts.push(new THREE.Vector3(
          ht.x + Math.cos(a) * r * ht.s,
          heightAt(ht.x, ht.z) + (14 + rand() * 16) * ht.s,
          ht.z + Math.sin(a) * r * ht.s));
      }
      lanternPts.push(new THREE.Vector3(ht.x, heightAt(ht.x, ht.z) + talanY * ht.s + 2, ht.z));
      // warm gold light glowing up into the canopy from within
      const canopyGlow = new THREE.PointLight(0xe8c05a, 90, 40 * ht.s, 2);
      canopyGlow.position.set(ht.x, heightAt(ht.x, ht.z) + 26 * ht.s, ht.z);
      scene.add(canopyGlow);
    }

    // surrounding mallorn forest
    const forestSpots = [];
    for (let i = 0; i < 60; i++){
      const x = (rand() - 0.5) * 560, z = (rand() - 0.5) * 560;
      if (Math.hypot(x, z + 30) < 40) continue;
      forestSpots.push({ x, z, s: 0.5 + rand() * 0.6 });
    }
    scene.add(plantTrees('mallorn', forestSpots, {
      heightAt, seed: 71, trunkColor: 0xa4a2ae, leafColor: 0x9a7826,
      leafEmissive: 0x8a6a1e, variants: 4,
    }));

    // ---- the lights of the city ---------------------------------------
    // hanging lamps — additive glow points
    const lampGeo = new THREE.BufferGeometry();
    const lp = new Float32Array(lanternPts.length * 3);
    const ls = new Float32Array(lanternPts.length);
    lanternPts.forEach((p, i) => { lp[i * 3] = p.x; lp[i * 3 + 1] = p.y; lp[i * 3 + 2] = p.z; ls[i] = rand() * 6.28; });
    lampGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lampGeo.setAttribute('aSeed', new THREE.BufferAttribute(ls, 1));
    const lampMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aSeed; varying float vS; uniform float uTime;
        void main(){ vS = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (560.0 + sin(uTime + aSeed) * 70.0) / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vS; uniform float uTime;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.02, d);
          float tw = 0.75 + 0.25 * sin(uTime * 1.3 + vS * 9.0);
          gl_FragColor = vec4(0.78, 0.86, 1.0, a * a * 0.95 * tw); }`,
    });
    scene.add(new THREE.Points(lampGeo, lampMat));
    updates.push((t) => { lampMat.uniforms.uTime.value = t; });
    // real point lights at a handful of them for surfaces to catch
    for (let i = 0; i < lanternPts.length; i += 5){
      const pl = new THREE.PointLight(0xaec4f0, 22, 34, 2);
      pl.position.copy(lanternPts[i]);
      scene.add(pl);
    }

    {
      const flowerM = mat(0xe8ecf4, { emissive: 0x8a94b8, emissiveIntensity: 0.7 });
      const flowerG = new THREE.SphereGeometry(0.09, 5, 4);
      const flowers = new THREE.InstancedMesh(flowerG, flowerM, 700);
      const fd = new THREE.Object3D();
      for (let i = 0; i < 700; i++){
        const fx = (rand() - 0.5) * 340, fz = (rand() - 0.5) * 340 - 20;
        fd.position.set(fx, heightAt(fx, fz) + 0.1, fz);
        fd.updateMatrix();
        flowers.setMatrixAt(i, fd.matrix);
      }
      scene.add(flowers);
    }
    // scattered warm lights in the wider forest canopy
    for (let i = 0; i < 10; i++){
      const fx = (rand() - 0.5) * 420, fz = (rand() - 0.5) * 420;
      if (Math.hypot(fx, fz + 30) < 50) continue;
      const fl2 = new THREE.PointLight(0xd8b04c, 40, 36, 2);
      fl2.position.set(fx, heightAt(fx, fz) + 22, fz);
      scene.add(fl2);
    }
    const fireflies = makeParticles(scene, 'firefly', { cx: 0, cy: 2, cz: -20, area: [240, 22, 240], count: 240, size: 2.1, color: 0xaac8f8 });
    scene.add(fireflies.mesh); updates.push(fireflies.update);
    const motes = makeParticles(scene, 'pollen', { cx: 0, cy: 12, cz: -30, area: [200, 36, 200], color: 0x9ab4e8, opacity: 0.22, count: 380, size: 1.1 });
    scene.add(motes.mesh); updates.push(motes.update);

    // ---- the Galadhrim -------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    // The Lady on the great talan — a soft white radiance
    const galadriel = Cast.galadriel();
    const hero = heroTrees[0];
    const gy = heightAt(hero.x, hero.z) + 24.5 * hero.s + 0.7;
    galadriel.position.set(hero.x + 1.5, gy, hero.z + 1.5);
    galadriel.rotation.y = 2.4;
    crowd.idle(galadriel); scene.add(galadriel);
    const gGlow = new THREE.PointLight(0xdce8ff, 170, 60, 2);
    gGlow.position.set(hero.x + 1.5, gy + 2, hero.z + 1.5);
    scene.add(gGlow);
    updates.push((t) => { gGlow.intensity = 52 + Math.sin(t * 1.1) * 10; });

    // elves with lanterns moving through the wood
    for (let i = 0; i < 5; i++){
      const elf = Cast.elf(rand, [0xcdd6e4, 0xb8c4d8, 0xd8d4e0]);
      const elfL = Cast.elf(rand);
      scene.add(elf);
      const a0 = rand() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 5; k++){
        const a = a0 + k * 1.3;
        const r = 35 + rand() * 55;
        pts.push([Math.cos(a) * r, 0, -30 + Math.sin(a) * r]);
      }
      crowd.walk(elf, pts, { speed: 0.65 + rand() * 0.25, loop: 'pingpong', offset: rand() });
    }
    // a lantern-bearer climbing the great stair (simplified as slow vertical spiral)
    const stairElf = Cast.elf(rand, [0xe8e8f0]);
    stairElf.traverse(o => { if (o.material && o.material.emissive) o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, 0.25); });
    scene.add(stairElf);
    {
      const pts = [];
      const turns = 2.2, steps = 10, baseR = 3.1 * hero.s;
      for (let i = 0; i <= steps; i++){
        const t = i / steps;
        const a = t * Math.PI * 2 * turns;
        pts.push([hero.x + Math.cos(a) * (baseR - t * 0.9), heightAt(hero.x, hero.z) + (2 + t * 22) * hero.s, hero.z + Math.sin(a) * (baseR - t * 0.9)]);
      }
      crowd.walk(stairElf, pts, { speed: 0.7, loop: 'pingpong', fly: true, animSpeed: 0.9 });
    }
    // a radiant figure on the second talan
    {
      const talanElf = Cast.elf(rand, [0xeff0f6]);
      const ht2 = heroTrees[2];
      talanElf.position.set(ht2.x + 1, heightAt(ht2.x, ht2.z) + 24.5 * ht2.s + 0.7, ht2.z + 1);
      talanElf.rotation.y = -0.8;
      talanElf.traverse(o => { if (o.material && o.material.emissive) o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, 0.4); });
      crowd.idle(talanElf); scene.add(talanElf);
      const tGlow = new THREE.PointLight(0xdce8ff, 70, 34, 2);
      tGlow.position.set(ht2.x + 1, heightAt(ht2.x, ht2.z) + 24.5 * ht2.s + 3, ht2.z + 1);
      scene.add(tGlow);
    }

    // two sentries at the hill's foot with tall bows
    for (const [sx, sz, ry] of [[-12, 8, 0.4], [14, 4, -0.5]]){
      const sentry = Cast.elf(rand, [0x4a5a4c]);
      sentry.position.set(sx, heightAt(sx, sz), sz);
      sentry.rotation.y = ry;
      crowd.idle(sentry); scene.add(sentry);
    }

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // drifting into the wood — trunks like towers, lights above
        pos: [[120, 4.5, 130], [80, 5, 80], [40, 5.5, 40], [14, 6.5, 8]],
        look: [[0, 30, -30], [0, 31, -30], [0, 32, -30], [2, 33, -32]],
        dur: 20,
      },
      { // rising up the great mallorn, past the spiral stair
        pos: [[-20, 5, -2], [-17, 13, -8], [-13, 23, -14], [-8, 31, -19]],
        look: [[2, 13, -31], [2, 19, -31], [2, 27, -31], [2, 33, -31]],
        dur: 17,
      },
      { // the Lady's talan — soft radiance among the leaves
        pos: [[13, 34.5, -13], [9, 34.8, -17], [6, 35, -21]],
        look: [[1.5, 33.6, -28.5], [1.5, 33.6, -28.5], [1.5, 33.6, -28.5]],
        dur: 13,
      },
      { // canopy wide — the city of lights at night
        pos: [[-90, 45, 70], [-50, 42, 30], [-16, 40, -4]],
        look: [[10, 24, -40], [6, 25, -40], [2, 26, -40]],
        dur: 16,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [0.94, 1.0, 1.16], gamma: [1.08, 1.08, 1.09], lift: [0.016, 0.022, 0.042],
        sat: 0.98, temp: -0.32, bloom: 0.72, bloomThreshold: 0.42, bloomRadius: 0.9,
        grain: 0.02, vignette: 0.3,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
