// Minas Tirith — the White City of seven walls against Mount Mindolluin,
// the Tower of Ecthelion shining like a spike of pearl, banners over the
// Court of the Fountain, and far to the east the smoulder of Mordor.
import * as THREE from 'three';
import { fbm, ridged, mulberry32, smoothstep } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { scatterRocks, makeParticles, makeBanner, mergeGeos } from '../engine/nature.js';
import { stoneTower } from '../engine/buildings.js';
import { Cast, Crowd, makePerson, makeHorse, makeFlyer, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'minastirith', name: 'Minas Tirith', subtitle: 'the White City, Tower of Guard',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc4ced8, 0.00085);
    const rand = mulberry32(3430);
    const updates = [];

    // City centred at origin, its back (−z) against Mindolluin.
    function heightAt(x, z){
      let h = fbm(x * 0.006 + 2, z * 0.006, 4) * 6;
      // Mindolluin rising behind
      const massif = smoothstep(250, 700, -z);
      h += massif * (170 + ridged(x * 0.004 + 9, z * 0.004, 4) * 300);
      h += smoothstep(140, 500, Math.hypot(x + 240, z + 200)) * 0; // keep east plain low
      return h;
    }
    const field = new THREE.Color(0x7d8a4c), fieldB = new THREE.Color(0x9a9455);
    const terr = makeTerrain({
      size: 1400, res: 300, height: heightAt,
      paint(x, z, h, slope, out){
        // Pelennor patchwork
        const gx = Math.floor((x + 3000) / (58 + fbm(x * 0.001, z * 0.001, 2) * 30));
        const gz = Math.floor((z + 3000) / (44 + fbm(x * 0.0013 + 5, z * 0.0011, 2) * 26));
        const n = fbm(gx * 7.1, gz * 5.3, 2);
        out.copy(field).lerp(fieldB, n);
        if (((gx + gz) % 3) === 0) out.lerp(new THREE.Color(0xa89a54), 0.45);
        if (((gx * 2 + gz) % 5) === 0) out.lerp(new THREE.Color(0x5c7440), 0.45);
        if (((gx * 3 + gz * 2) % 7) === 0) out.lerp(new THREE.Color(0x8a9a4c), 0.35);
        const hedge = Math.min(Math.abs((x + 3000) % 58), Math.abs((z + 3000) % 44));
        if (hedge < 1.0 && Math.hypot(x, z) > 140 && h < 14 && z > -110) out.lerp(new THREE.Color(0x66703f), 0.16);
        if (slope > 0.28 || h > 26) out.lerp(new THREE.Color(0x3d3d4a), Math.min(1, Math.max(slope - 0.28, (h - 26) / 60) * 2.6));
        if (h > 390) out.lerp(new THREE.Color(0xcfd5e0), 0.6);
      },
    });
    scene.add(terr.mesh);

    // ---- clear morning sky, shadow in the east -------------------------
    const sunDir = new THREE.Vector3(0.62, 0.38, 0.5).normalize();
    const sky = makeSky({
      zenith: 0x3a6aa8, horizon: 0xd8dce0, ground: 0x8a9088,
      sunDir, sunColor: 0xfff4d8, sunSize: 0.028, sunHalo: 0.35,
      cloudColor: 0xf4f2ea, cloudShadow: 0x9a9a96, cloudCover: 0.34, cloudScale: 2.2,
      haze: 0.55,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      // the Ephel Dúath brooding on the eastern horizon
      { dist: 2700, height: 420, color: 0x3e3a44, jag: 2.8, seed: 101, gap: [3.6, 5.4] },
      { dist: 2300, height: 520, color: 0xa8b0c0, jag: 2.4, seed: 102, gap: [0.7, 2.5] },
    ], 0x7d8a54));
    // red smoulder over Mordor's rim
    {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 64;
      const g2 = cv.getContext('2d');
      const grad = g2.createLinearGradient(0, 64, 0, 0);
      grad.addColorStop(0, 'rgba(200,70,20,0.55)');
      grad.addColorStop(0.5, 'rgba(120,32,12,0.28)');
      grad.addColorStop(1, 'rgba(60,16,10,0)');
      g2.fillStyle = grad; g2.fillRect(0, 0, 256, 64);
      const smoulderTex = new THREE.CanvasTexture(cv);
      const smoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(1600, 260),
        new THREE.MeshBasicMaterial({ map: smoulderTex, transparent: true, fog: false, depthWrite: false }));
      smoulder.position.set(300, 200, 2400);
      smoulder.lookAt(0, 60, 0);
      scene.add(smoulder);
      // the far cone of Mount Doom against the glow
      const farDoom = new THREE.Mesh(new THREE.ConeGeometry(160, 240, 7),
        new THREE.MeshBasicMaterial({ color: 0x241c20, fog: false }));
      farDoom.position.set(560, 90, 2250);
      scene.add(farDoom);
    }

    const sun = new THREE.DirectionalLight(0xffeecc, 3.6);
    sun.position.copy(sunDir).multiplyScalar(500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 1100;
    sun.shadow.bias = -0.0007;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xc8d8ec, 0x6d7462, 1.0));

    // ---- the seven-tiered city ----------------------------------------
    const city = new THREE.Group();
    const whiteM = mat(0xdcd8ce, { roughness: 0.85 });
    const wallM = mat(0xcfccc2, { roughness: 0.9 });
    const roofM = mat(0x4c5158, { roughness: 0.85 });
    const tiers = 7;
    const baseR = 92, prowAngle = Math.PI / 2; // prow faces +z (east)

    const houseGeos = [];
    const roofGeos = [];
    const tierH = 15.5;
    let tierData = [];
    for (let i = 0; i < tiers; i++){
      const r = baseR - i * 11.5;
      const y = i * tierH;
      tierData.push({ r, y });
      // wall ring
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.5, tierH + 2, 42, 1, true), wallM);
      wall.position.y = y + (tierH + 2) / 2;
      city.add(wall);
      // battlement rim with merlons
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 1.1, 6, 42), whiteM);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y + tierH + 2;
      city.add(rim);
      {
        const nm = Math.floor(r * 1.1);
        for (let k = 0; k < nm; k++){
          const ma = (k / nm) * Math.PI * 2;
          const merlonG = new THREE.BoxGeometry(1.0, 1.1, 0.7);
          merlonG.rotateY(-ma);
          merlonG.translate(Math.cos(ma) * r, y + tierH + 3.2, Math.sin(ma) * r);
          houseGeos.push(merlonG);
        }
      }
      // tier floor
      const floorMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.2, 42), whiteM);
      floorMesh.position.y = y + tierH + 2.4;
      city.add(floorMesh);
      // gate towers at alternating angles (the switchback road)
      const ga = prowAngle + (i % 2 === 0 ? 0.5 : -0.5);
      for (const da of [-0.09, 0.09]){
        const gt = stoneTower(3.2, 20, 0xd4d0c6, null);
        gt.position.set(Math.cos(ga + da) * r, y, Math.sin(ga + da) * r);
        city.add(gt);
      }
      // houses on the annulus behind the wall
      if (i < 6){
        const inner = r - 11.5, outer = r - 2.5;
        const n = Math.floor(24 + (6 - i) * 9);
        for (let k = 0; k < n; k++){
          const a = rand() * Math.PI * 2;
          // keep the prow line and gate zones clear
          if (Math.abs(((a - prowAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.34) continue;
          const rr = inner + rand() * (outer - inner);
          const hw = 2.2 + rand() * 2.4, hd = 2.6 + rand() * 2.6, hh = 3.2 + rand() * 4.2;
          const hx = Math.cos(a) * rr, hz = Math.sin(a) * rr;
          const hg = new THREE.BoxGeometry(hw, hh, hd);
          hg.rotateY(-a);
          hg.translate(hx, y + tierH + 3 + hh / 2, hz);
          houseGeos.push(hg);
          const rg = new THREE.ConeGeometry(Math.max(hw, hd) * 0.68, 1.6 + rand() * 1.6, 4);
          rg.rotateY(Math.PI / 4 - a);
          rg.translate(hx, y + tierH + 3 + hh + 0.8, hz);
          roofGeos.push(rg);
        }
      }
    }
    // foundation rock — the hill the city is founded on
    const plinthG = new THREE.CylinderGeometry(baseR + 3, baseR + 26, 22, 42);
    const plinth = new THREE.Mesh(plinthG, mat(0x7d7a72, { roughness: 1 }));
    plinth.position.y = -10;
    city.add(plinth);
    const houses = new THREE.Mesh(mergeGeos(houseGeos), whiteM);
    const roofs = new THREE.Mesh(mergeGeos(roofGeos), roofM);
    houses.castShadow = houses.receiveShadow = true;
    roofs.castShadow = true;
    city.add(houses, roofs);

    // the great prow of stone splitting the city eastward, jutting past
    // the first wall like a ship's keel
    const prowG = new THREE.BoxGeometry(7, 96, 150, 1, 1, 30);
    {
      const p = prowG.attributes.position;
      for (let i = 0; i < p.count; i++){
        const z = p.getZ(i), y = p.getY(i);
        // sharpen toward the nose (+z)
        if (z > -20) p.setX(i, p.getX(i) * Math.max(0.05, 1 - (z + 20) / 100));
        // nose slopes down and out to its tip
        if (z > 30) p.setY(i, y - (z - 30) * 0.18);
      }
      prowG.computeVertexNormals();
    }
    const prow = new THREE.Mesh(prowG, mat(0xbcb8ac, { roughness: 0.95 }));
    prow.rotation.y = prowAngle - Math.PI / 2;
    prow.position.set(0, 46, 0);
    // push the mass toward the east face: centre it so the nose passes the wall
    prow.translateZ(0);
    prow.castShadow = true;
    city.add(prow);
    {
      // local +z of the prow points along prowAngle; shift so nose clears r=92
      const dir = new THREE.Vector3(Math.cos(prowAngle), 0, Math.sin(prowAngle));
      prow.position.add(dir.multiplyScalar(28));
      // sharp lit ridge down the keel's leading edge
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 96, 1.4), whiteM);
      edge.rotation.y = prowAngle - Math.PI / 2;
      edge.position.copy(prow.position).add(dir.clone().normalize().multiplyScalar(74));
      edge.position.y = 40;
      city.add(edge);
    }

    // the Citadel — Court of the Fountain + White Tower of Ecthelion
    const topY = 6 * tierH + 18;
    const court = new THREE.Mesh(new THREE.CylinderGeometry(22, 23, 1.6, 24), whiteM);
    court.position.y = topY;
    city.add(court);
    const tower = stoneTower(6.2, 66, 0xe4e0d6, null);
    tower.children[0].scale.set(0.82, 1, 0.82); // taper the shaft
    tower.position.set(0, topY, -6);
    city.add(tower);
    for (let i = 0; i < 4; i++){
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 6), whiteM);
      pin.position.set(Math.cos(a) * 5.4, topY + 68, -6 + Math.sin(a) * 5.4);
      city.add(pin);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4, 15, 10), whiteM);
    spire.position.set(0, topY + 73, -6);
    city.add(spire);
    // buttress ridges up the tower shaft
    for (let i = 0; i < 4; i++){
      const a = (i / 4) * Math.PI * 2;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 58, 0.8), whiteM);
      ridge.position.set(Math.cos(a) * 5.6, topY + 30, -6 + Math.sin(a) * 5.6);
      city.add(ridge);
    }
    // the White Tree by the fountain
    const treeG = new THREE.Group();
    const wtM = mat(0xeceade, { roughness: 0.65 });
    const wtTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.4, 7), wtM);
    wtTrunk.position.y = 1.7;
    wtTrunk.rotation.z = 0.06;
    treeG.add(wtTrunk);
    // gnarled two-segment limbs with small blossom clusters at the tips
    const blossomM = mat(0xf4f4ea, { emissive: 0xd8d8c4, emissiveIntensity: 0.2 });
    for (let i = 0; i < 9; i++){
      const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3;
      const tilt = 0.7 + (i % 3) * 0.25;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 1.7, 5), wtM);
      lower.position.set(Math.cos(a) * 0.55, 3.1 + (i % 2) * 0.5, Math.sin(a) * 0.55);
      lower.rotation.z = Math.cos(a) * tilt;
      lower.rotation.x = -Math.sin(a) * tilt;
      treeG.add(lower);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.3, 5), wtM);
      const tx = Math.cos(a) * 1.5, tz2 = Math.sin(a) * 1.5;
      tip.position.set(tx, 4.0 + (i % 2) * 0.5, tz2);
      tip.rotation.z = Math.cos(a) * (tilt + 0.4);
      tip.rotation.x = -Math.sin(a) * (tilt + 0.4);
      treeG.add(tip);
      for (let b = 0; b < 3; b++){
        const bl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 5, 4), blossomM);
        bl.position.set(tx * 1.35 + (b - 1) * 0.18, 4.6 + (i % 2) * 0.5 + b * 0.12, tz2 * 1.35 + ((b + i) % 2) * 0.16);
        treeG.add(bl);
      }
    }
    treeG.position.set(0, topY + 1.15, 10);
    treeG.traverse(o => { o.castShadow = true; });
    city.add(treeG);
    // the Fountain — raised ring with a still water disc
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.75, 16), whiteM);
    pool.position.set(0, topY + 0.95, 10);
    city.add(pool);
    const poolWater = new THREE.Mesh(new THREE.CircleGeometry(3.1, 16),
      mat(0x8fb2c4, { roughness: 0.12, metalness: 0.4, emissive: 0x2a3c48, emissiveIntensity: 0.35 }));
    poolWater.rotation.x = -Math.PI / 2;
    poolWater.position.set(0, topY + 1.36, 10);
    city.add(poolWater);

    city.traverse(o => { o.receiveShadow = true; });
    scene.add(city);

    // banners of the White Tree
    for (const [ba, br2, by] of [[prowAngle - 0.5, 88, 15], [prowAngle + 0.5, 88, 15], [0.4, 24, topY], [2.8, 24, topY]]){
      const b = makeBanner(scene, { color: '#1a1c26', emblem: 'tree', emblemColor: '#e8e6da', w: 1.4, h: 2.6, poleH: 7, wind: 1.3 });
      b.mesh.position.set(Math.cos(ba) * br2, by, Math.sin(ba) * br2);
      scene.add(b.mesh); updates.push(b.update);
    }
    const towerBanner = makeBanner(scene, { color: '#111420', emblem: 'tree', emblemColor: '#eae8dc', w: 2, h: 3.6, poleH: 9, wind: 1.6 });
    towerBanner.mesh.position.set(0, topY + 66, -6);
    scene.add(towerBanner.mesh); updates.push(towerBanner.update);

    // Pelennor detail — hayricks, hedgerows, the road to the Gate
    for (let i = 0; i < 24; i++){
      const a = prowAngle + (rand() - 0.5) * 2.4;
      const r = 150 + rand() * 380;
      const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
      const rick = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 8), mat(0xb09a54));
      rick.position.set(hx, heightAt(hx, hz) + 1.6, hz);
      rick.castShadow = true;
      scene.add(rick);
    }
    scene.add(scatterRocks(
      Array.from({ length: 30 }, () => {
        const a = rand() * Math.PI * 2, r = 160 + rand() * 300;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.5 + rand() };
      }), { heightAt, color: 0x9a988e, seed: 3 }));

    // drifting motes for air perspective
    const motes = makeParticles(scene, 'pollen', { cx: 0, cy: 60, cz: 60, area: [300, 120, 300], opacity: 0.25, count: 500 });
    scene.add(motes.mesh); updates.push(motes.update);

    // ---- the people of the City ----------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    // Citadel guards flanking the White Tree — winged helms, black and silver
    for (const [gx, gz, ry] of [[-4, 10, 1.6], [4, 10, -1.6], [0, 4, 0], [-6, 16, 1.2], [6, 16, -1.2]]){
      const guard = Cast.gondorGuard();
      guard.position.set(gx, topY + 1.7, gz);
      guard.rotation.y = ry;
      crowd.idle(guard); scene.add(guard);
    }
    // a patrol pacing the citadel court
    const patrol = Cast.gondorGuard({ pose: 'walk' });
    scene.add(patrol);
    {
      const pts = [];
      for (let k = 0; k <= 8; k++){
        const a = (k / 8) * Math.PI * 2;
        pts.push([Math.cos(a) * 17, topY + 1.7, Math.sin(a) * 17]);
      }
      crowd.walk(patrol, pts, { speed: 1.0, loop: 'loop', closed: true, fly: true });
    }
    // citizens on the sixth tier
    for (let i = 0; i < 4; i++){
      const cit = makePerson({
        height: 1.7 + rand() * 0.15, skin: 0xc8a888, hair: [0x2c2018, 0x5a4a38, 0x8a7a5a][(rand() * 3) | 0],
        hairLen: 0.5, tunic: [0x4a5568, 0x6d5a4c, 0x5c6157][(rand() * 3) | 0], cloak: rand() > 0.5 ? 0x3c4350 : null,
      });
      scene.add(cit);
      const tier = tierData[5];
      const a0 = rand() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 5; k++){
        const a = a0 + k * 0.45 * (i % 2 ? 1 : -1);
        pts.push([Math.cos(a) * (tier.r - 6), tier.y + 18.7, Math.sin(a) * (tier.r - 6)]);
      }
      crowd.walk(cit, pts, { speed: 0.9 + rand() * 0.4, loop: 'pingpong', fly: true, offset: rand() });
    }
    // wall sentries on the first wall
    for (let i = 0; i < 5; i++){
      const a = prowAngle + (i - 2) * 0.5;
      const guard = Cast.gondorGuard();
      guard.position.set(Math.cos(a) * (baseR - 2.5), 18.7, Math.sin(a) * (baseR - 2.5));
      guard.rotation.y = -a + Math.PI / 2;
      crowd.idle(guard); scene.add(guard);
    }
    // an errand-rider crossing the Pelennor toward the Great Gate
    const errandG = new THREE.Group();
    const errandHorse = makeHorse({ white: true });
    errandG.add(errandHorse);
    const errandRider = makePerson({
      height: 1.8, skin: 0xc8a888, hair: 0x2c2018, hairLen: 0.4,
      tunic: 0x2c3240, cloak: 0x1c202c, pose: 'ride',
    });
    errandRider.position.set(0.05, 1.55, 0);
    applyPose(errandRider, 'ride');
    errandG.add(errandRider);
    errandG.userData.anim = errandHorse.userData.anim;
    scene.add(errandG);
    crowd.walk(errandG, [
      [Math.cos(prowAngle) * 480, 0, Math.sin(prowAngle) * 480 + 60],
      [Math.cos(prowAngle) * 340, 0, Math.sin(prowAngle) * 340 + 20],
      [Math.cos(prowAngle) * 210, 0, Math.sin(prowAngle) * 210],
      [Math.cos(prowAngle) * 110, 0, Math.sin(prowAngle) * 110],
    ], { speed: 10, loop: 'pingpong', horse: true, animSpeed: 1.1 });

    const white = makeFlyer('eagle'); // a distant eagle over the vale
    scene.add(white);
    crowd.fly(white, [[-200, 190, 100], [-40, 210, 240], [160, 200, 260], [240, 220, 60], [40, 205, -40]],
      { speed: 22, closed: true, loop: 'loop' });

    // ---- shots ---------------------------------------------------------
    const cityLook = [0, 60, 0];
    const shots = [
      { // the grand approach — sweeping in over the Pelennor
        pos: [[420, 30, 420], [300, 40, 330], [200, 55, 230], [140, 72, 150]],
        look: [[0, 46, 0], [0, 52, 0], [0, 58, 0], [0, 64, 0]],
        dur: 21,
      },
      { // arcing around the prow, tiers rising like waves
        pos: [[150, 66, 40], [120, 74, -40], [60, 84, -100], [-30, 92, -110]],
        look: [[0, 55, 0], [0, 60, 0], [0, 66, 0], [0, 72, 0]],
        dur: 19,
      },
      { // the Court of the Fountain — the White Tree and its guards
        pos: [[28, topY + 12, 32], [17, topY + 8, 25], [8, topY + 5, 18]],
        look: [[0, topY + 2.5, 8], [0, topY + 2.2, 9], [0, topY + 2, 10]],
        dur: 15,
      },
      { // from the prow's tip — the fields below, Mordor smouldering afar
        pos: [[0, 112, 40], [0, 111, 58], [2, 110, 76]],
        look: [[40, 55, 510], [30, 54, 515], [20, 52, 520]],
        dur: 16,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [1.04, 1.02, 1.02], gamma: [1.02, 1.02, 1.03], lift: [0.01, 0.01, 0.014],
        sat: 1.0, temp: 0.04, bloom: 0.32, bloomThreshold: 0.8,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
