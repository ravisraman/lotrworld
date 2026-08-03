// Bree — rain on cobbles, lantern light in the dark, the Prancing Pony
// glowing warm while cloaked strangers hurry past. A black rider walks
// his horse up the street, and in the shadows a ranger watches.
import * as THREE from 'three';
import { fbm, mulberry32 } from '../engine/util.js';
import { makeSky, makeMountainBackdrop } from '../engine/sky.js';
import { makeTerrain } from '../engine/terrain.js';
import { makeParticles, makeSmoke, plantTrees } from '../engine/nature.js';
import { makeTimberHouse, makeLamppost, makeCart, glowWindowMat } from '../engine/buildings.js';
import { Cast, Crowd, makePerson, makeHorse, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'bree', name: 'Bree', subtitle: 'The Prancing Pony, at night in the rain',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x181e2a, 0.0082);
    const rand = mulberry32(888);
    const updates = [];

    // street runs north (−z) from the south gate
    const street = [[6, 74], [2, 46], [-2, 20], [-4, -6], [0, -34], [6, -60]];
    function streetDist(x, z){
      let best = 1e9;
      for (let i = 1; i < street.length; i++){
        const ax = street[i - 1][0], az = street[i - 1][1], bx = street[i][0], bz = street[i][1];
        const abx = bx - ax, abz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
        const dx = x - (ax + abx * t), dz = z - (az + abz * t);
        best = Math.min(best, dx * dx + dz * dz);
      }
      return Math.sqrt(best);
    }
    const heightAt = (x, z) => fbm(x * 0.02, z * 0.02, 3) * 2.2 - streetDist(x, z) < 4 ? fbm(x * 0.02, z * 0.02, 2) * 0.6 : fbm(x * 0.02, z * 0.02, 3) * 2.2;

    const cobble = new THREE.Color(0x2e3238), mud = new THREE.Color(0x2a2620), grassN = new THREE.Color(0x1c2418);
    const terr = makeTerrain({
      size: 500, res: 220, height: heightAt, roughness: 0.5,
      paint(x, z, h, slope, out){
        const sd = streetDist(x, z);
        const n = fbm(x * 0.3, z * 0.3, 2);
        if (sd < 5.5) out.copy(cobble).multiplyScalar(0.8 + n * 0.5);
        else if (sd < 8) out.copy(mud).multiplyScalar(0.9 + n * 0.3);
        else out.copy(grassN).multiplyScalar(0.8 + n * 0.4);
      },
    });
    scene.add(terr.mesh);

    // puddles — faint mirror strips on the street
    for (let i = 0; i < 12; i++){
      const px = street[i % street.length][0] + (rand() - 0.5) * 6;
      const pz = street[i % street.length][1] + (rand() - 0.5) * 20;
      const pud = new THREE.Mesh(
        new THREE.CircleGeometry(0.6 + rand() * 0.9, 12),
        mat(0x2c3644, { roughness: 0.05, metalness: 0.3, emissive: 0x161e2c, emissiveIntensity: 0.5 }));
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(px, heightAt(px, pz) + 0.03, pz);
      pud.scale.x = 1.3;
      scene.add(pud);
    }

    // ---- night sky -----------------------------------------------------
    const moonDir = new THREE.Vector3(-0.4, 0.55, 0.3).normalize();
    const sky = makeSky({
      zenith: 0x060a12, horizon: 0x18202c, ground: 0x0a0c10,
      sunDir: moonDir, sunColor: 0xcfd8e8, sunSize: 0.02, sunHalo: 0.12, sunIntensity: 0.5,
      cloudColor: 0x2a3240, cloudShadow: 0x0c1016, cloudCover: 0.62, cloudScale: 2.8, cloudSpeed: 0.014,
      stars: 0.5, haze: 0.35,
    });
    scene.add(sky.mesh); updates.push(sky.update);
    scene.add(makeMountainBackdrop([
      { dist: 1800, height: 150, color: 0x0c1014, jag: 2.4, seed: 61 },
    ]));

    const moon = new THREE.DirectionalLight(0x8a9cc0, 1.9);
    moon.position.copy(moonDir).multiplyScalar(250);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -90; moon.shadow.camera.right = 90;
    moon.shadow.camera.top = 90; moon.shadow.camera.bottom = -90;
    scene.add(moon);
    scene.add(new THREE.HemisphereLight(0x40507a, 0x1c1812, 1.5));

    // ---- the town ------------------------------------------------------
    const housesCfg = [
      [-14, 52, 0.5], [16, 44, -0.5], [-15, 26, 0.35], [15, 18, -0.3],
      [-16, 2, 0.2], [14, -8, -0.25], [-14, -26, 0.3], [16, -34, -0.4],
      [-12, -48, 0.4], [-30, 30, 0.9], [30, 4, -0.9], [-30, -10, 0.8],
    ];
    housesCfg.forEach(([hx, hz, ry], i) => {
      const house = makeTimberHouse({
        w: 4.5 + rand() * 2.5, d: 5.5 + rand() * 2.5, floors: rand() > 0.35 ? 2 : 1,
        plaster: [0x6b6154, 0x5f584c, 0x746a58][i % 3], timber: 0x241c14,
        roof: 0x2a241e, lit: rand() > 0.25, seed: i + 5,
      });
      house.position.set(hx, heightAt(hx, hz), hz);
      house.rotation.y = ry + (hx < 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2;
      // face street
      house.rotation.y = Math.atan2(-hx, 0) + ry * 0.2;
      scene.add(house);
      if (house.userData.chimney && rand() > 0.4){
        house.updateMatrixWorld(true);
        const cp = house.localToWorld(house.userData.chimney.clone());
        const smoke = makeSmoke(scene, { x: cp.x, y: cp.y, z: cp.z, rise: 5, opacity: 0.2, color: 0x50565e, speed: 0.25 });
        scene.add(smoke.mesh); updates.push(smoke.update);
      }
    });

    // The Prancing Pony — bigger, warmer, with its hanging sign
    const inn = makeTimberHouse({ w: 9, d: 12, floors: 3, plaster: 0x847a66, timber: 0x1e1710, roof: 0x1f1b16, lit: true, seed: 77 });
    inn.position.set(-13, 0.2, -6);
    inn.rotation.y = Math.PI / 2;
    scene.add(inn);
    // sign: pony on a board swinging
    const signCv = document.createElement('canvas');
    signCv.width = 128; signCv.height = 96;
    const sc = signCv.getContext('2d');
    sc.fillStyle = '#3a2c1a'; sc.fillRect(0, 0, 128, 96);
    sc.strokeStyle = '#c9a85a'; sc.lineWidth = 4; sc.strokeRect(4, 4, 120, 88);
    sc.fillStyle = '#d8c89a';
    sc.beginPath(); // rearing pony
    sc.moveTo(40, 70); sc.quadraticCurveTo(42, 50, 58, 46);
    sc.quadraticCurveTo(60, 30, 72, 24); sc.quadraticCurveTo(84, 20, 86, 28);
    sc.quadraticCurveTo(78, 32, 78, 40); sc.quadraticCurveTo(90, 46, 88, 58);
    sc.lineTo(78, 54); sc.lineTo(80, 70); sc.lineTo(70, 68); sc.lineTo(64, 56);
    sc.lineTo(54, 58); sc.lineTo(52, 72); sc.closePath(); sc.fill();
    sc.fillStyle = '#c9a85a'; sc.font = 'italic 13px Georgia'; sc.textAlign = 'center';
    sc.fillText('The Prancing Pony', 64, 86);
    const signTex = new THREE.CanvasTexture(signCv);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.85), signM);
    const signBack = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.85), signM);
    signBack.rotation.y = Math.PI;
    sign.add(signBack);
    sign.rotation.y = Math.PI / 2;
    const signArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), mat(0x2c2018));
    signArm.rotation.z = Math.PI / 2;
    signArm.position.set(-6.2, 4.6, -6);
    sign.position.set(-5.6, 3.7, -6);
    scene.add(signArm, sign);
    const signLamp = new THREE.PointLight(0xffc06a, 10, 7, 2);
    signLamp.position.set(-5.2, 4.6, -6.6);
    scene.add(signLamp);
    updates.push((t) => { sign.rotation.z = Math.sin(t * 1.7) * 0.08; sign.rotation.x = Math.sin(t * 2.3) * 0.05; });
    const innGlow = new THREE.PointLight(0xffb45a, 90, 34, 2);
    innGlow.position.set(-8, 3, -6);
    scene.add(innGlow);

    // south gate — arch + doors
    const gate = new THREE.Group();
    const gpostM = mat(0x2c241a);
    for (const s of [-1, 1]){
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), gpostM);
      post.position.set(6 + s * 5, 3.5, 78);
      gate.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(12.4, 1.4, 1.4), gpostM);
    lintel.position.set(6, 7.2, 78);
    gate.add(lintel);
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.6, 6.4, 0.4), mat(0x33281c));
    door.position.set(3.5, 3.2, 78.4);
    door.rotation.y = 0.7;
    gate.add(door);
    // palisade wall
    for (const s of [-1, 1]){
      const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 4.5, 1), mat(0x241e16));
      wall.position.set(6 + s * 36, 2.25, 78);
      gate.add(wall);
    }
    gate.traverse(o => { o.castShadow = true; });
    scene.add(gate);

    // soft warm pools of lamplight on the wet street
    {
      const cv2 = document.createElement('canvas');
      cv2.width = cv2.height = 128;
      const c2 = cv2.getContext('2d');
      const grad2 = c2.createRadialGradient(64, 64, 6, 64, 64, 62);
      grad2.addColorStop(0, 'rgba(255,180,90,0.4)');
      grad2.addColorStop(0.55, 'rgba(255,150,64,0.14)');
      grad2.addColorStop(1, 'rgba(255,140,60,0)');
      c2.fillStyle = grad2; c2.fillRect(0, 0, 128, 128);
      const poolTex = new THREE.CanvasTexture(cv2);
      const poolM = new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      });
      for (const [sx2, sz2, sr] of [[9.5, 59, 4], [-5, 35, 4], [8, 9, 4], [-8.5, -17, 4], [9, -43, 4], [-6.8, -6, 6.5]]){
        const pool = new THREE.Mesh(new THREE.CircleGeometry(sr, 20), poolM);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(sx2, heightAt(sx2, sz2) + 0.04, sz2);
        scene.add(pool);
      }
    }

    // lampposts along the street
    for (const [lx, lz] of [[9.5, 60], [-5, 36], [8, 10], [-8.5, -16], [9, -42]]){
      const lamp = makeLamppost(0x241f1a, 0xffb45a);
      lamp.position.set(lx, heightAt(lx, lz), lz);
      lamp.rotation.y = lx > 0 ? Math.PI : 0;
      scene.add(lamp);
    }

    // a cart, barrels, crates as street dressing
    const cart = makeCart(true);
    cart.position.set(12, 0.1, 30);
    cart.rotation.y = 0.4;
    scene.add(cart);
    for (let i = 0; i < 8; i++){
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.0, 9), mat(0x4a3a26));
      const bx = (rand() > 0.5 ? -1 : 1) * (8 + rand() * 4), bz = (rand() - 0.5) * 90;
      b.position.set(bx, heightAt(bx, bz) + 0.5, bz);
      b.castShadow = true;
      scene.add(b);
    }
    const bareSpots = Array.from({ length: 24 }, () => {
      const x = (rand() - 0.5) * 400, z = (rand() - 0.5) * 400;
      return { x: Math.abs(x) < 45 && Math.abs(z) < 90 ? x + 120 : x, z };
    });
    scene.add(plantTrees('dead', bareSpots, { heightAt, seed: 3, trunkColor: 0x241f1a }));

    // ---- weather -------------------------------------------------------
    const rain = makeParticles(scene, 'rain', { cx: 0, cy: 0, cz: 0, area: [160, 60, 180] });
    scene.add(rain.mesh); updates.push(rain.update);
    const mist = makeParticles(scene, 'ash', { count: 500, color: 0x38404c, opacity: 0.16, size: 9, fall: 0.15, drift: 0.9, cy: 0.5, area: [160, 14, 180] });
    scene.add(mist.mesh); updates.push(mist.update);

    // ---- people of Bree ------------------------------------------------
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));

    // hooded folk hurrying through the rain
    for (let i = 0; i < 5; i++){
      const villager = Cast.breeMan(rand);
      scene.add(villager);
      const dir = i % 2 === 0;
      const pathPts = street.map(([x, z]) => [x + (rand() - 0.5) * 5, 0, z]);
      if (dir) pathPts.reverse();
      crowd.walk(villager, pathPts, { speed: 1.5 + rand() * 0.5, loop: 'pingpong', offset: rand(), animSpeed: 1.2 });
    }
    // gatekeeper with a lantern
    const keeper = makePerson({
      height: 1.72, skin: 0xb89878, hair: 0x5a4a38, hairLen: 0.3, beard: 0.5,
      tunic: 0x3a342c, cloak: 0x2c2822, hoodUp: true, prop: 'lantern',
    });
    keeper.position.set(9.5, heightAt(9.5, 74), 74);
    keeper.rotation.y = Math.PI;
    crowd.idle(keeper); scene.add(keeper);

    // Strider in the shadows by the inn, pipe glowing
    const strider = Cast.aragorn({ hoodUp: true, cloak: 0x2e2a24, prop: 'pipe', pose: 'sit' });
    const benchB = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.6), mat(0x33281c));
    benchB.position.set(-7.2, 0.65, -12.5);
    scene.add(benchB);
    strider.position.set(-7.2, 0.26, -12.35);
    strider.rotation.y = 0.9;
    applyPose(strider, 'sit');
    crowd.idle(strider); scene.add(strider);
    const pipeGlow = new THREE.PointLight(0xff7a30, 1.6, 3.5, 2);
    pipeGlow.position.set(-6.9, 1.5, -12.2);
    scene.add(pipeGlow);
    updates.push((t) => { pipeGlow.intensity = 1.2 + Math.sin(t * 0.9) * 0.5 + Math.max(0, Math.sin(t * 0.23)) * 1.2; });

    // the Black Rider — walking his horse slowly up the street
    const riderG = new THREE.Group();
    const blackHorse = makeHorse({ color: 0x0e0c0a, mane: 0x080606 });
    riderG.add(blackHorse);
    const nazgul = makePerson({
      height: 1.95, skin: 0x000000, hair: 0, hairLen: 0, robe: 0x0a0908,
      cloak: 0x0a0908, hoodUp: true, pose: 'ride',
    });
    nazgul.position.set(0.05, 1.55, 0);
    applyPose(nazgul, 'ride');
    riderG.add(nazgul);
    riderG.userData.anim = blackHorse.userData.anim;
    {
      const voidM = new THREE.MeshBasicMaterial({ color: 0x070605 });
      riderG.traverse(o => { if (o.isMesh) o.material = voidM; });
    }
    scene.add(riderG);
    crowd.walk(riderG, [[6, 0, 70], [2, 0, 46], [-2, 0, 20], [-4, 0, -6], [0, 0, -34], [6, 0, -58]],
      { speed: 1.1, loop: 'pingpong', horse: true, animSpeed: 0.4 });

    // a couple more townsfolk crossing between doorways
    for (const off of [0.15, 0.7]){
      const v = Cast.breeMan(rand);
      scene.add(v);
      crowd.walk(v, [[10, 0, 54], [-4, 0, 34], [8, 0, 12], [-6, 0, -12], [8, 0, -30]],
        { speed: 1.6, loop: 'pingpong', offset: off, animSpeed: 1.25 });
    }
    const lanternWalker = makePerson({
      height: 1.7, skin: 0xb89878, hair: 0x4a3a2a, hairLen: 0.35,
      tunic: 0x3f382e, cloak: 0x302a24, hoodUp: true, prop: 'lantern',
    });
    scene.add(lanternWalker);
    crowd.walk(lanternWalker, [[7, 0, 40], [1, 0, 16], [-3, 0, -8], [2, 0, -32]],
      { speed: 1.15, loop: 'pingpong', offset: 0.45 });

    // someone dashing with a torch
    const torchMan = Cast.breeMan(rand);
    const torchMan2 = makePerson({ height: 1.68, skin: 0xb89878, hair: 0x3a2c1c, hairLen: 0.3, tunic: 0x44362a, cloak: 0x322c26, hoodUp: true, prop: 'torch' });
    scene.add(torchMan2);
    crowd.walk(torchMan2, [[-10, 0, 40], [-14, 0, 20], [-12, 0, -2], [-15, 0, -20]], { speed: 1.9, loop: 'pingpong', offset: 0.4, animSpeed: 1.3 });

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // through the gate into the rain-lit street
        pos: [[8, 3.2, 100], [7, 3.0, 84], [5, 2.8, 64], [3, 2.6, 44]],
        look: [[0, 3, 20], [-2, 3, 8], [-6, 3.5, -6], [-10, 4, -10]],
        dur: 16,
      },
      { // the Prancing Pony sign, warm light, rain streaking
        pos: [[2, 2.2, -18], [-1, 2.4, -13], [-2.5, 2.8, -9]],
        look: [[-6, 3.6, -6], [-6, 3.7, -6], [-6.2, 3.9, -6]],
        dur: 13,
      },
      { // street level — the black rider passes
        pos: [[-9, 1.7, 28], [-9, 1.7, 14], [-8, 1.8, 2]],
        look: [[4, 2.4, 30], [2, 2.4, 14], [4, 2.6, -4]],
        dur: 15,
      },
      { // over the rooftops, chimney smoke and rain
        pos: [[-32, 17, 42], [-17, 14.5, 16], [-7, 12.5, -6]],
        look: [[8, 3, 6], [3, 3, -8], [-3, 3, -22]],
        dur: 17,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [0.94, 0.99, 1.12], gamma: [1.09, 1.07, 1.03], lift: [0.014, 0.02, 0.04],
        sat: 0.82, temp: -0.35, bloom: 0.6, bloomThreshold: 0.5, bloomRadius: 0.85,
        grain: 0.032, vignette: 0.34,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
