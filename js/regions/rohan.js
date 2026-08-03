// Rohan — Edoras on its lonely hill, the Golden Hall bright against the
// White Mountains, and a sea of wind-bent grass where the horse-lords ride.
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { makeGrass, scatterRocks, makeParticles, makeBanner, makeSmoke, mergeGeos } from '../engine/nature.js';
import { makeTimberHouse, makeFenceLine } from '../engine/buildings.js';
import { Cast, Crowd, makePerson, makeHorse, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'rohan', name: 'Rohan', subtitle: 'Edoras, and the Golden Hall of Meduseld',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xd8d2b8, 0.0022);
    const rand = mulberry32(3019);
    const updates = [];

    const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
    function heightAt(x, z){
      let h = fbm(x * 0.008, z * 0.008, 4) * 9;
      // the rock of Edoras
      const d = Math.hypot(x, z);
      h += smoothstep(64, 6, d) * 34;
      h += gauss(x, z, 0, 0, 16) * 6;
      return h;
    }
    const gold = new THREE.Color(0x7d7034), goldB = new THREE.Color(0xa39344), rockC = new THREE.Color(0x5c5348);
    const terr = makeTerrain({
      size: 1100, res: 300, height: heightAt,
      paint(x, z, h, slope, out){
        const n = fbm(x * 0.02, z * 0.02, 3);
        out.copy(gold).lerp(goldB, n);
        if (slope > 0.26 || h > 12) out.lerp(rockC, Math.min(1, Math.max(slope - 0.26, (h - 12) / 22) * 2.2));
        const dHill = Math.hypot(x, z);
        // the worn climbing road: south gate road + a ring path at mid-height
        if ((Math.abs(x) < 3.2 && z < -18 && dHill < 70) || Math.abs(dHill - 27) < 2.4){
          out.lerp(new THREE.Color(0x9a8a60), 0.55);
        }
      },
    });
    scene.add(terr.mesh);

    // rocky outcrops breaking the hill's flanks
    {
      const outcropM = mat(0x6d6154, { roughness: 1, flatShading: true });
      const rand2 = mulberry32(77);
      for (let i = 0; i < 26; i++){
        const a = rand2() * Math.PI * 2;
        const r = 14 + rand2() * 40;
        const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
        if (oz < -r * 0.5 && Math.abs(ox) < 8) continue; // keep the road clear
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6 + rand2() * 4.4, 0), outcropM);
        rock.position.set(ox, heightAt(ox, oz) - 0.6, oz);
        rock.rotation.set(rand2() * 2, rand2() * 3, rand2() * 2);
        rock.scale.y = 0.6 + rand2() * 0.5;
        rock.castShadow = true;
        scene.add(rock);
      }
    }

    // ---- sky — big weather over the Mark ------------------------------
    const sunDir = new THREE.Vector3(-0.55, 0.42, -0.45).normalize();
    const sky = makeSky({
      zenith: 0x4272a8, horizon: 0xe2d5a8, ground: 0x9a9070,
      sunDir, sunColor: 0xfff0cc, sunSize: 0.026, sunHalo: 0.2,
      cloudColor: 0xf6efe0, cloudShadow: 0x8d8672, cloudCover: 0.5, cloudScale: 2.0, cloudSpeed: 0.012,
      haze: 0.6,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 2900, height: 1150, color: 0xdde4f0, jag: 3.2, seed: 81 },  // snow peaks
      { dist: 2300, height: 700, color: 0x8a94a8, jag: 3.4, seed: 82 },
      { dist: 1600, height: 300, color: 0x6d7570, jag: 3.0, seed: 83 },
    ], 0x8a7d3e));

    const sun = new THREE.DirectionalLight(0xfff0d0, 3.0);
    sun.position.copy(sunDir).multiplyScalar(400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xc2d0e8, 0x6b6034, 0.68));
    const warmFill = new THREE.DirectionalLight(0xffe0b0, 0.55);
    warmFill.position.set(-80, 60, -220);
    scene.add(warmFill);

    // ---- Edoras --------------------------------------------------------
    // palisade ring
    const ringR = 46;
    const palisadeGeos = [];
    {
      const logM = mat(0x4a3826);
      const logGeos = [];
      for (let ring = 0; ring < 2; ring++){
        const rr = ringR + ring * 0.55;
        const n = 150;
        for (let i = 0; i < n; i++){
          const a = (i + ring * 0.5) / n * Math.PI * 2;
          if (Math.abs(a - Math.PI * 1.5) < 0.1) continue; // gate opening (south)
          const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          const y = heightAt(x, z);
          const log = new THREE.CylinderGeometry(0.42, 0.5, 5.5 + (i % 3) * 0.3, 5);
          log.translate(x, y + 2.2, z);
          logGeos.push(log);
        }
      }
      const palisade = new THREE.Mesh(mergeGeos(logGeos), logM);
      palisade.castShadow = palisade.receiveShadow = true;
      scene.add(palisade);
    }
    // gate posts
    for (const s of [-1, 1]){
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 1.4), mat(0x3f3020));
      const x = s * 7, z = -Math.sqrt(ringR * ringR - 49);
      post.position.set(x, heightAt(x, z) + 3.4, z);
      post.castShadow = true;
      scene.add(post);
      // carved horse head atop
      const hh = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 5), mat(0xc9b68a));
      hh.position.set(x, heightAt(x, z) + 7.6, z);
      hh.rotation.x = 0.7;
      scene.add(hh);
    }

    // houses climbing the hill
    const housePos = [];
    for (let i = 0; i < 16; i++){
      const a = (i / 16) * Math.PI * 2 + 0.3 + rand() * 0.2;
      const r = 18 + (i % 3) * 9 + rand() * 5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z < -r * 0.55 && Math.abs(x) < 10) continue; // keep the road clear
      housePos.push([x, z, a]);
    }
    for (const [hx, hz, a] of housePos){
      const house = makeTimberHouse({
        w: 3.6 + rand() * 1.6, d: 4.5 + rand() * 2, floors: 1,
        plaster: 0x9a8a64, timber: 0x33271c, roof: 0x5c4a28, lit: rand() > 0.5, seed: (hx * 3 + hz) | 0,
      });
      house.position.set(hx, heightAt(hx, hz) - 0.55, hz);
      house.rotation.y = -a + Math.PI / 2;
      scene.add(house);
      if (rand() > 0.55){
        house.updateMatrixWorld(true);
        const cp = house.localToWorld(house.userData.chimney.clone());
        const sm = makeSmoke(scene, { x: cp.x, y: cp.y, z: cp.z, rise: 6, opacity: 0.2, speed: 0.28 });
        scene.add(sm.mesh); updates.push(sm.update);
      }
    }

    // Meduseld — the Golden Hall
    const hall = new THREE.Group();
    const hallM = mat(0x4a3826, { roughness: 0.8 });
    const goldM = mat(0xc9a234, { roughness: 0.5, metalness: 0.3 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(24, 2.4, 18), mat(0x9a917c));
    plinth.position.y = 1.2;
    hall.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 15), hallM);
    body.position.y = 2.4 + 4;
    hall.add(body);
    // great gabled golden roof — a true steep A-frame with a long ridge
    {
      const roofY = 2.4 + 8, half = 10.2, slopeW = 7.4, rise = 6.2, depth = 15.5;
      for (const sgn of [-1, 1]){
        const panel = new THREE.Mesh(new THREE.BoxGeometry(slopeW + 1.2, 0.5, depth), goldM);
        panel.position.set(sgn * slopeW * 0.35, roofY + rise * 0.5, 0);
        panel.rotation.z = sgn * -Math.atan2(rise, slopeW * 0.7);
        panel.castShadow = false;
        hall.add(panel);
      }
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, depth + 0.8), goldM);
      ridge.position.set(0, roofY + rise + 0.1, 0);
      hall.add(ridge);
      // gable triangles closing the ends
      const gShape = new THREE.Shape();
      gShape.moveTo(-slopeW * 0.72, 0); gShape.lineTo(slopeW * 0.72, 0); gShape.lineTo(0, rise);
      const gGeo = new THREE.ShapeGeometry(gShape);
      for (const sgn of [-1, 1]){
        const gable = new THREE.Mesh(gGeo, hallM);
        gable.position.set(0, roofY, sgn * depth / 2);
        if (sgn < 0) gable.rotation.y = Math.PI;
        hall.add(gable);
        // crossed horse-head finials at each gable peak
        for (const fs of [-1, 1]){
          const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 5), goldM);
          fin.position.set(fs * 0.55, roofY + rise + 0.9, sgn * (depth / 2 + 0.1));
          fin.rotation.z = fs * 0.5;
          hall.add(fin);
        }
      }
    }
    // door + pillars — facing the gate road on the south side
    const doors = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.6, 0.4), mat(0x5a3f22));
    doors.position.set(0, 2.4 + 2.3, -8.2);
    hall.add(doors);
    for (const s of [-1, 1]){
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6.5, 8), goldM);
      col.position.set(s * 3.2, 2.4 + 3.2, -8.4);
      hall.add(col);
    }
    // terrace steps
    for (let i = 0; i < 5; i++){
      const step = new THREE.Mesh(new THREE.BoxGeometry(10 - i * 0.8, 0.5, 2.2), mat(0x8a7c5c));
      step.position.set(0, 2.4 - i * 0.5, -9.9 - i * 1.1);
      hall.add(step);
    }
    const hallY = heightAt(0, 2);
    hall.position.set(0, hallY - 1.2, 0);
    hall.traverse(o => { o.castShadow = o.receiveShadow = true; });
    scene.add(hall);

    // banners of the Mark
    for (const [bx, bz] of [[-9, 9], [9, 9], [-7, -42], [7, -42], [14, -2]]){
      const b = makeBanner(scene, {
        color: '#24451f', emblem: 'horse', emblemColor: '#efe9d2',
        w: 1.8, h: 3.4, poleH: 8.0, wind: 1.5,
      });
      b.mesh.position.set(bx, heightAt(bx, bz), bz);
      scene.add(b.mesh); updates.push(b.update);
    }

    // the road winding to the gate
    // (painted into the grass mask below)
    function roadDist(x, z){
      // straight south road + spiral to hall
      const d1 = Math.abs(x) < 5 && z < -20 ? 0 : Math.hypot(Math.max(0, Math.abs(x) - 5), Math.max(0, -20 - z) * 0.001);
      const dGate = Math.abs(x) < 5 && z < -40 ? 0 : 99;
      const sp = Math.abs(Math.hypot(x, z) - Math.max(8, 44 + z * 0.4));
      return Math.min(Math.abs(x) < 4 && z < -10 ? 0 : 99, 99);
    }

    // ---- the grass sea -------------------------------------------------
    const grass = makeGrass(scene, {
      count: 52000, area: 520, cx: 0, cz: 60, heightAt,
      mask: (x, z) => {
        const d = Math.hypot(x, z);
        if (d < 56) return 0;                          // bare rock and town inside the walls
        if (Math.abs(x) < 4.5 && z < -40) return 0;    // the south road
        return 1;
      },
      colorA: 0x6b6530, colorB: 0x9a8f42, height: 0.85, windAmp: 0.3, windFreq: 1.7,
    });
    scene.add(grass.mesh); updates.push(grass.update);
    scene.add(scatterRocks(
      Array.from({ length: 30 }, () => {
        const x = (rand() - 0.5) * 700, z = (rand() - 0.5) * 700;
        return { x: Math.hypot(x, z) < 70 ? x + 200 : x, z, s: 0.5 + rand() * 1.8 };
      }), { heightAt, color: 0x7d7260, seed: 66 }));

    // pollen / seed heads drifting on the wind
    const seeds = makeParticles(scene, 'pollen', { cx: 0, cy: 2, cz: 80, area: [400, 20, 400], color: 0xe8dca0, count: 900, opacity: 0.4 });
    scene.add(seeds.mesh); updates.push(seeds.update);

    // ---- the Rohirrim --------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    function mountedRider(horseCfg, riderCfg, withBanner){
      const g = new THREE.Group();
      const horse = makeHorse(horseCfg);
      g.add(horse);
      const rider = Cast.rohirrim(riderCfg);
      rider.position.set(0.05, 1.55, 0);
      applyPose(rider, 'ride');
      g.add(rider);
      if (withBanner){
        const b = makeBanner(scene, { color: '#2c5230', emblem: 'horse', emblemColor: '#e6dfc8', w: 1.0, h: 1.8, poleH: 3.4, wind: 2.2 });
        b.mesh.position.set(-0.3, 1.4, -0.35);
        b.mesh.rotation.x = 0.15;
        g.add(b.mesh);
        updates.push(b.update);
      }
      g.userData.anim = horse.userData.anim;
      return g;
    }

    // éored at full gallop across the plain
    for (let i = 0; i < 6; i++){
      const rider = mountedRider({ color: [0x6b4a2f, 0x4a3826, 0x8a7458, 0x3a2f24][i % 4] }, {}, i === 0);
      scene.add(rider);
      const off = (i % 3 - 1) * 10, off2 = ((i / 3) | 0) * 8;
      crowd.walk(rider, [
        [-260 + off, 0, 150 + off2], [-160 + off, 0, 40 + off2], [-120 + off, 0, -120 + off2],
        [0 + off, 0, -210 + off2], [140 + off, 0, -160 + off2], [230 + off, 0, -40 + off2],
        [200 + off, 0, 90 + off2], [40 + off, 0, 170 + off2], [-120 + off, 0, 170 + off2],
      ], { speed: 13, loop: 'loop', closed: true, offset: i * 0.014, horse: true, animSpeed: 1.15 });
    }
    // horses grazing loose
    for (let i = 0; i < 7; i++){
      const h = makeHorse({ color: [0x6b4a2f, 0x2f2620, 0x8a7458, 0xdcd8d0][i % 4], white: i === 3 });
      const hx = 60 + rand() * 120, hz = (rand() - 0.5) * 200;
      h.position.set(hx, heightAt(hx, hz), hz);
      h.rotation.y = rand() * Math.PI * 2;
      crowd.idle(h); scene.add(h);
    }
    // guards at the gate, a villager climbing the road
    for (const s of [-1, 1]){
      const guard = Cast.rohirrim({ pose: 'guard' });
      const x = s * 5, z = -Math.sqrt(ringR * ringR - 25) + 2;
      guard.position.set(x, heightAt(x, z), z);
      guard.rotation.y = Math.PI;
      crowd.idle(guard); scene.add(guard);
    }
    const villager = makePerson({ height: 1.7, skin: 0xd0aa88, hair: 0xc0a060, hairLen: 0.6, tunic: 0x6b5838, pants: 0x4a3d2c, cloak: 0x5a4a34 });
    scene.add(villager);
    crowd.walk(villager, [[0, 0, -80], [0, 0, -50], [2, 0, -30], [8, 0, -12], [10, 0, 6]], { speed: 1.1, loop: 'pingpong' });

    // Éowyn before the hall doors, dress and hair in the wind
    const eowyn = Cast.eowyn({ robe: 0xd8cdb8 });
    eowyn.position.set(1.5, hallY + 2.4, -16.5);
    eowyn.rotation.y = 0;
    crowd.idle(eowyn); scene.add(eowyn);
    for (const s2 of [-1, 1]){
      const warden = Cast.rohirrim({ pose: 'guard' });
      warden.position.set(s2 * 4.2, hallY + 2.4, -11.2);
      warden.rotation.y = 0;
      crowd.idle(warden); scene.add(warden);
    }

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // riders low through the grass, camera racing beside them
        pos: [[-160, 4, 140], [-60, 3.5, 130], [40, 4, 160], [140, 5, 180]],
        look: [[-100, 3, 125], [0, 3, 140], [100, 4, 175], [200, 5, 160]],
        dur: 16, ease: 'linear',
      },
      { // Edoras establishing — the lonely hill against the mountains
        pos: [[-30, 8, -280], [-18, 14, -200], [-8, 22, -130], [0, 30, -80]],
        look: [[0, 26, 0], [0, 27, 0], [0, 28, 0], [0, 30, 0]],
        dur: 20,
      },
      { // climbing over the road to Meduseld
        pos: [[8, heightAt(8, -120) + 10, -120], [5, heightAt(5, -90) + 13, -90], [2, heightAt(2, -62) + 16, -62], [0, heightAt(0, -40) + 17, -40]],
        look: [[0, heightAt(0, 2) + 14, -4], [0, heightAt(0, 2) + 15, -4], [0, heightAt(0, 2) + 16, -4], [0, heightAt(0, 2) + 16, -6]],
        dur: 17,
      },
      { // the banner shot — Éowyn before the hall doors, plains beyond
        pos: [[-14, hallY + 6, -32], [-7, hallY + 5, -28], [0, hallY + 4.5, -26]],
        look: [[2, hallY + 3.5, -14], [2, hallY + 3.5, -15], [1.5, hallY + 3.5, -16]],
        dur: 14,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.08, 1.02, 0.9], gamma: [1.02, 1.02, 0.99], lift: [0.014, 0.012, 0.006],
        sat: 1.1, temp: 0.3, bloom: 0.3, bloomThreshold: 0.78,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
