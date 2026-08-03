// The Pass of Caradhras — the cruel Redhorn in blizzard. Nine small figures
// wade through waist-deep snow along a knife-edge traverse while the mountain
// throws the storm at them.
import * as THREE from 'three';
import { fbm, ridged, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { scatterRocks, makeParticles } from '../engine/nature.js';
import { Cast, Crowd, makeHorse, makeFlyer, mat } from '../engine/characters.js';

export default {
  id: 'caradhras', name: 'Caradhras', subtitle: 'the Redhorn Pass, in the teeth of winter',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xbfc6d2, 0.0042);
    const rand = mulberry32(510);
    const updates = [];

    // A steep mountain flank rising to the east; traverse ledge cut across it.
    function ledgeDist(x, z){
      // ledge follows a gentle S from south to north at x ~ +10
      const lx = 10 + Math.sin(z * 0.018) * 16;
      return x - lx;
    }
    function heightAt(x, z){
      const d = ledgeDist(x, z);
      let h = ridged(x * 0.006 + 3, z * 0.006, 5) * 130;
      h += smoothstep(0, 130, d) * 210;            // wall above the ledge
      h -= smoothstep(0, -150, -(-d)) * 0;
      if (d < 0) h -= smoothstep(0, 120, -d) * 160; // drop below
      // flatten the ledge itself
      const onLedge = Math.exp(-(d * d) / (2 * 11 * 11));
      const base = ridged(10 * 0.006 + 3, z * 0.006, 5) * 130;
      h = h * (1 - onLedge) + (base + 2) * onLedge;
      h += fbm(x * 0.05, z * 0.05, 3) * 6 * (1 - onLedge * 0.75);
      return h;
    }
    const snowC = new THREE.Color(0xdfe4ec), snowShade = new THREE.Color(0xaebadc), rockC = new THREE.Color(0x4c4a52);
    const terr = makeTerrain({
      size: 900, res: 300, height: heightAt, roughness: 0.85,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.03, z * 0.03, 3);
        out.copy(snowC).lerp(snowShade, n * 0.7);
        if (slope > 0.34) out.lerp(rockC, Math.min(1, (slope - 0.34) * 2.8));
      },
    });
    scene.add(terr.mesh);

    // ---- storm sky -----------------------------------------------------
    const sunDir = new THREE.Vector3(-0.3, 0.42, 0.6).normalize();
    const sky = makeSky({
      zenith: 0x5a6a86, horizon: 0x9aa6ba, ground: 0x7d8698,
      sunDir, sunColor: 0xd8e0ec, sunSize: 0.02, sunHalo: 0.15, sunIntensity: 0.45,
      cloudColor: 0x8b96aa, cloudShadow: 0x3f4a5e, cloudCover: 0.8, cloudSharp: 0.3,
      cloudScale: 3.2, cloudSpeed: 0.03, haze: 0.8,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2600, height: 900, color: 0x8b94a8, jag: 2.6, seed: 51 },
      { dist: 1900, height: 640, color: 0x77809a, jag: 3.0, seed: 52 },
    ]));

    const sun = new THREE.DirectionalLight(0xd4e0f0, 2.0);
    sun.position.copy(sunDir).multiplyScalar(300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x9caac2, 0x5a6274, 1.0));

    // crags and spires along the wall
    const spireM = mat(0x494752, { roughness: 0.95, flatShading: true });
    for (let i = 0; i < 14; i++){
      const sx = 60 + rand() * 120, sz = (rand() - 0.5) * 500;
      const h = 30 + rand() * 80;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(8 + rand() * 12, h, 6), spireM);
      spire.position.set(sx, heightAt(sx, sz) + h * 0.3, sz);
      spire.rotation.z = (rand() - 0.5) * 0.2;
      spire.castShadow = true;
      scene.add(spire);
    }
    scene.add(scatterRocks(
      Array.from({ length: 60 }, () => {
        const z = (rand() - 0.5) * 500;
        return { x: 10 + Math.sin(z * 0.018) * 16 + (rand() - 0.5) * 60, z, s: 0.6 + rand() * 2.4 };
      }), { heightAt, color: 0x565460, seed: 15, sink: 0.5 }));

    // wind-carved outcrops on the wall face for scale
    for (let i = 0; i < 10; i++){
      const wx = 34 + rand() * 40, wz = (rand() - 0.5) * 440;
      const crag = new THREE.Mesh(
        new THREE.BoxGeometry(6 + rand() * 10, 3 + rand() * 5, 10 + rand() * 16),
        spireM);
      crag.position.set(wx, heightAt(wx, wz) - 1, wz);
      crag.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, 0.3 + rand() * 0.3);
      crag.castShadow = true;
      scene.add(crag);
    }

    // ---- blizzard ------------------------------------------------------
    const snow1 = makeParticles(scene, 'snow', { count: 5200, fall: 6, drift: 7, size: 1.9, cy: 40, area: [320, 130, 320], seed: 1 });
    const snow2 = makeParticles(scene, 'snow', { count: 2600, fall: 13, drift: 16, size: 2.6, opacity: 0.44, cy: 40, area: [260, 110, 260], seed: 2, streak: true, streakAngle: 1.05 });
    const spindrift = makeParticles(scene, 'ash', { count: 900, color: 0xdfe6f2, opacity: 0.22, size: 13, fall: 1.2, drift: 9, cy: 42, area: [300, 60, 300] });
    scene.add(snow1.mesh, snow2.mesh, spindrift.mesh);
    updates.push(snow1.update, snow2.update, spindrift.update);

    // ---- the Nine Walkers ---------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    const line = [];
    for (let z = 190; z >= -190; z -= 38){
      line.push([10 + Math.sin(z * 0.018) * 16, 0, z]);
    }
    const fellowship = [
      Cast.gandalf(), Cast.legolas(), Cast.boromir(), Cast.frodo(),
      Cast.sam(), Cast.merry(), Cast.pippin(), Cast.aragorn(), Cast.gimli(),
    ];
    fellowship.forEach((rig, i) => {
      scene.add(rig);
      crowd.walk(rig, line, {
        speed: 0.62, loop: 'pingpong', offset: 0.5 - i * 0.03, animSpeed: 0.55,
      });
    });
    // Bill the pony, laden, at the rear
    const bill = makeHorse({ color: 0x6b5638 });
    bill.scale.setScalar(0.8);
    const packs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.1), mat(0x8a7148));
    packs.position.set(-0.2, 1.7, 0);
    bill.add(packs);
    scene.add(bill);
    crowd.walk(bill, line, { speed: 0.62, loop: 'pingpong', offset: 0.5 - 9.4 * 0.03, horse: true, animSpeed: 0.32 });

    // an eagle riding the storm high above
    const eagle = makeFlyer('eagle');
    scene.add(eagle);
    crowd.fly(eagle, [[-80, 120, -100], [40, 140, -30], [90, 130, 80], [-20, 145, 120], [-90, 132, 10]],
      { speed: 16, closed: true, loop: 'loop' });

    // ---- shots ---------------------------------------------------------
    // Everything is placed relative to the real ledge so the storm never
    // swallows the composition.
    const ledgeAt = (z) => {
      const x = 10 + Math.sin(z * 0.018) * 16;
      return [x, heightAt(x, z), z];
    };
    const cam = (z, dx, dy) => {
      const [x, y] = [ledgeAt(z)[0], ledgeAt(z)[1]];
      return [x + dx, y + dy, z];
    };
    const shots = [
      { // vast wall, tiny line of walkers — the scale shot
        pos: [cam(150, -52, 18), cam(118, -48, 16), cam(84, -44, 15), cam(56, -42, 15)],
        look: [ledgeAt(92), ledgeAt(74), ledgeAt(58), ledgeAt(44)].map(p => [p[0], p[1] + 8, p[2]]),
        dur: 20,
      },
      { // in amongst them — snow lashing the column
        pos: [cam(84, -11, 4.2), cam(64, -10, 3.8), cam(44, -9.5, 3.6), cam(26, -10, 3.8)],
        look: [ledgeAt(56), ledgeAt(40), ledgeAt(24), ledgeAt(10)].map(p => [p[0], p[1] + 1.8, p[2]]),
        dur: 18,
      },
      { // looking back up to the spires in the storm
        pos: [cam(-120, -22, 10), cam(-70, -18, 12), cam(-20, -15, 14)],
        look: [[95, 150, 30], [100, 155, 50], [105, 160, 70]],
        dur: 15,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [0.94, 0.99, 1.1], gamma: [1.02, 1.02, 1.03], lift: [0.02, 0.025, 0.04],
        sat: 0.72, temp: -0.45, bloom: 0.3, bloomThreshold: 0.75, grain: 0.05,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
