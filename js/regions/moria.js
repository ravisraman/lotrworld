// Moria — the Mines of Khazad-dûm. The endless pillared dark of the
// Dwarrowdelf under thin shafts of light, and at its end the Bridge over
// the abyss, where Durin's Bane rises in shadow and flame against a single
// grey wizard.
import * as THREE from 'three';
import { fbm, mulberry32 } from '../engine/util.js';
import { makeParticles, makeLightShafts, scatterRocks, mergeGeos } from '../engine/nature.js';
import { Cast, Crowd, makeBalrog, animateBalrog, applyPose, mat } from '../engine/characters.js';

export default {
  id: 'moria', name: 'Moria', subtitle: 'the Dwarrowdelf, and the Bridge of Khazad-dûm',
  build(ctx){
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1018, 0.0052);
    scene.background = new THREE.Color(0x060910);
    const rand = mulberry32(4444);
    const updates = [];

    const heightAt = () => 0;

    // ---- the great hall floor -----------------------------------------
    // polished stone, faint reflection, worn by ten thousand years
    const floorG = new THREE.PlaneGeometry(700, 750, 120, 100);
    floorG.rotateX(-Math.PI / 2);
    {
      const p = floorG.attributes.position;
      const colors = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++){
        const x = p.getX(i), z = p.getZ(i);
        const n = fbm(x * 0.02, z * 0.02, 3);
        c.setHSL(0.6, 0.08, 0.1 + n * 0.08);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      floorG.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const floor = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.32, metalness: 0.15,
    }));
    floor.receiveShadow = true;
    // hall floor covers z in [-600, 150]; the abyss lies beyond
    floor.position.z = -225;
    scene.add(floor);

    // vaulted dark ceiling — the pillars must end against stone, not void
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(760, 780, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 52.5, -220);
    scene.add(ceil);

    // ---- the pillars of the Dwarrowdelf --------------------------------
    // Colossal columns: fluted shaft, banded capital flaring to the dark.
    function pillarGeo(){
      const geos = [];
      const H = 46;
      const shaft = new THREE.CylinderGeometry(2.6, 3.4, H, 10);
      shaft.translate(0, H / 2, 0);
      geos.push(shaft);
      const base = new THREE.CylinderGeometry(4.4, 5.2, 3, 10);
      base.translate(0, 1.5, 0);
      geos.push(base);
      const band = new THREE.CylinderGeometry(3.6, 3.0, 2.2, 10);
      band.translate(0, H * 0.62, 0);
      geos.push(band);
      const cap = new THREE.CylinderGeometry(6.0, 3.2, 4.5, 10);
      cap.translate(0, H - 2, 0);
      geos.push(cap);
      const crown = new THREE.CylinderGeometry(7.2, 6.4, 2.4, 10);
      crown.translate(0, H + 1.2, 0);
      geos.push(crown);
      return mergeGeos(geos);
    }
    const pillarM = new THREE.MeshStandardMaterial({ color: 0x5a6274, roughness: 0.62, metalness: 0.12 });
    const pg = pillarGeo();
    const rows = 5, cols = 9, sx = 34, sz = 44;
    const pillars = new THREE.InstancedMesh(pg, pillarM, rows * cols);
    const dummy = new THREE.Object3D();
    let pi = 0;
    for (let r = 0; r < rows; r++){
      for (let cIdx = 0; cIdx < cols; cIdx++){
        const x = (r - (rows - 1) / 2) * sx;
        const z = -30 - cIdx * sz;
        dummy.position.set(x, 0, z);
        dummy.rotation.y = rand() * 0.4;
        const s = 0.92 + rand() * 0.16;
        dummy.scale.set(s, 1 + rand() * 0.12, s);
        dummy.updateMatrix();
        pillars.setMatrixAt(pi++, dummy.matrix);
      }
    }
    pillars.castShadow = pillars.receiveShadow = true;
    scene.add(pillars);

    // fallen pillar drums and rubble
    const drumM = mat(0x343944, { roughness: 0.9 });
    for (let i = 0; i < 9; i++){
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5 + rand() * 4, 10), drumM);
      drum.rotation.z = Math.PI / 2;
      drum.rotation.y = rand() * Math.PI;
      drum.position.set((rand() - 0.5) * 130, 1.6, -40 - rand() * 320);
      drum.castShadow = true;
      scene.add(drum);
    }
    scene.add(scatterRocks(
      Array.from({ length: 50 }, () => ({ x: (rand() - 0.5) * 180, z: -20 - rand() * 380, s: 0.4 + rand() * 1.4 })),
      { heightAt, color: 0x2c3038, seed: 9 }));

    // Balin's tomb — a single shaft of light on a white stone slab
    const tomb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 1.8), mat(0xb8b4a6, { roughness: 0.8 }));
    tomb.position.set(-38, 0.8, -122);
    tomb.castShadow = tomb.receiveShadow = true;
    scene.add(tomb);

    // dwarven doorways glowing faint blue in the far walls
    for (let i = 0; i < 6; i++){
      const arch = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 10),
        mat(0x0e1a28, { emissive: 0x14283c, emissiveIntensity: 0.8 }));
      arch.position.set(-160 + (i % 2) * 320, 6, -80 - i * 55);
      arch.rotation.y = (i % 2 === 0 ? 1 : -1) * Math.PI / 2;
      scene.add(arch);
    }

    // ---- light ---------------------------------------------------------
    scene.add(new THREE.AmbientLight(0x2a3852, 1.9));
    scene.add(new THREE.HemisphereLight(0x3c4c6a, 0x141820, 1.1));
    const keyLight = new THREE.DirectionalLight(0xaac4e8, 1.3);
    keyLight.position.set(60, 120, -100);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -160; keyLight.shadow.camera.right = 160;
    keyLight.shadow.camera.top = 160; keyLight.shadow.camera.bottom = -160;
    scene.add(keyLight);

    // shafts of pale light from unseen heights
    for (const [lx, lz] of [[-40, -120], [30, -230], [-10, -330], [55, -80]]){
      const shaft = makeLightShafts(scene, {
        count: 4, x: lx, y: 85, z: lz, spread: 14, height: 100, width: 11,
        color: 0xcfe0f4, opacity: 0.12, tilt: 0.12,
      });
      scene.add(shaft.mesh); updates.push(shaft.update);
      const pool = new THREE.PointLight(0xaac4e8, 160, 90, 2);
      pool.position.set(lx, 24, lz);
      scene.add(pool);
      const poolDecal = new THREE.Mesh(new THREE.CircleGeometry(9, 18),
        new THREE.MeshBasicMaterial({
          color: 0x9ab8dc, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }));
      poolDecal.rotation.x = -Math.PI / 2;
      poolDecal.position.set(lx, 0.06, lz);
      scene.add(poolDecal);
    }
    const dust = makeParticles(scene, 'pollen', {
      count: 700, color: 0xb0a890, opacity: 0.12, size: 1.1,
      cx: 0, cy: 10, cz: -180, area: [220, 60, 380], fall: 0.15,
    });
    scene.add(dust.mesh); updates.push(dust.update);

    // goblin eyes blinking in the far dark
    const eyeG = new THREE.BufferGeometry();
    const eyeN = 60;
    const epos = new Float32Array(eyeN * 3), eseed = new Float32Array(eyeN);
    for (let i = 0; i < eyeN; i += 2){
      const ex = (rand() - 0.5) * 300, ey = 2 + rand() * 30, ez = -150 - rand() * 300;
      epos[i * 3] = ex; epos[i * 3 + 1] = ey; epos[i * 3 + 2] = ez;
      epos[(i + 1) * 3] = ex + 0.5; epos[(i + 1) * 3 + 1] = ey; epos[(i + 1) * 3 + 2] = ez;
      eseed[i] = eseed[i + 1] = rand() * 6.28;
    }
    eyeG.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    eyeG.setAttribute('aSeed', new THREE.BufferAttribute(eseed, 1));
    const eyeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aSeed; varying float vS; uniform float uTime;
        void main(){ vS = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 90.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vS; uniform float uTime;
        void main(){
          float blink = step(0.55, fract(sin(floor(uTime * 0.4 + vS) * 91.7) * 43758.5));
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, d) * blink * 0.8;
          gl_FragColor = vec4(1.0, 0.75, 0.25, a); }`,
    });
    scene.add(new THREE.Points(eyeG, eyeMat));
    updates.push((t) => { eyeMat.uniforms.uTime.value = t; });

    // ---- the abyss and the Bridge --------------------------------------
    // beyond z = +150 the floor ends; a knife of stone spans the gulf
    const abyssGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 400),
      mat(0x1a0704, { emissive: 0xff3c08, emissiveIntensity: 1.15 }));
    abyssGlow.rotation.x = -Math.PI / 2;
    abyssGlow.position.set(0, -90, 260);
    scene.add(abyssGlow);
    const abyssLight = new THREE.PointLight(0xff5a1a, 950, 300, 2);
    abyssLight.position.set(0, -40, 260);
    scene.add(abyssLight);
    updates.push((t) => { abyssLight.intensity = 850 + Math.sin(t * 3.7) * 180 + Math.sin(t * 9.1) * 90; });
    const underBridge = new THREE.PointLight(0xff6a20, 420, 70, 2);
    underBridge.position.set(0, -18, 262);
    scene.add(underBridge);
    const bridgeFire = new THREE.PointLight(0xff7a2a, 420, 130, 2);
    bridgeFire.position.set(0, 10, 340);
    scene.add(bridgeFire);
    updates.push((t) => { bridgeFire.intensity = 560 + Math.sin(t * 5.1) * 120 + Math.sin(t * 11.3) * 60; });
    // fire-glow gradient licking up the far wall of the gulf
    {
      const cv = document.createElement('canvas');
      cv.width = 4; cv.height = 128;
      const g2 = cv.getContext('2d');
      const grad = g2.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0, 'rgba(255,100,20,0.6)');
      grad.addColorStop(0.35, 'rgba(160,36,8,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = grad; g2.fillRect(0, 0, 4, 128);
      // break the banding with vertical noise streaks
      cv.width = 64;
      g2.fillStyle = grad; g2.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 300; i++){
        const nx = Math.random() * 64, ny = 60 + Math.random() * 68;
        g2.fillStyle = 'rgba(' + (120 + Math.random() * 135 | 0) + ',' + (30 + Math.random() * 50 | 0) + ',8,' + (Math.random() * 0.2) + ')';
        g2.fillRect(nx, ny, 2, 5 + Math.random() * 12);
      }
      const gtex = new THREE.CanvasTexture(cv);
      const glowMat = new THREE.MeshBasicMaterial({
        map: gtex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      });
      const farGlow = new THREE.Mesh(new THREE.PlaneGeometry(680, 210), glowMat);
      farGlow.position.set(0, -70, 359);
      scene.add(farGlow);
      const nearGlow2 = new THREE.Mesh(new THREE.PlaneGeometry(680, 210), glowMat);
      nearGlow2.position.set(0, -70, 159);
      nearGlow2.rotation.y = Math.PI;
      scene.add(nearGlow2);
    }

    // cliff faces of the gulf
    const cliffM = mat(0x22252e, { roughness: 1 });
    const nearCliff = new THREE.Mesh(new THREE.BoxGeometry(700, 160, 8), cliffM);
    nearCliff.position.set(0, -80, 154);
    scene.add(nearCliff);
    const farCliff = new THREE.Mesh(new THREE.BoxGeometry(700, 160, 8), cliffM);
    farCliff.position.set(0, -80, 364);
    scene.add(farCliff);
    const farFloor = new THREE.Mesh(new THREE.PlaneGeometry(700, 220, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 }));
    farFloor.rotateX(-Math.PI / 2);
    farFloor.position.set(0, 0, 476);
    farFloor.receiveShadow = true;
    scene.add(farFloor);

    // rock teeth jutting from the gulf walls for depth
    for (let i = 0; i < 8; i++){
      const tx = (rand() - 0.5) * 220;
      const tz = (i % 2 === 0) ? 168 + rand() * 20 : 348 - rand() * 20;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(4 + rand() * 6, 18 + rand() * 26, 5), cliffM);
      tooth.position.set(tx, -18 - rand() * 55, tz);
      tooth.rotation.x = (i % 2 === 0 ? 0.5 : -0.5) + (rand() - 0.5) * 0.3;
      tooth.rotation.z = Math.PI;
      scene.add(tooth);
    }

    // the Bridge — a narrow arch without rail
    const bridgeG = new THREE.PlaneGeometry(214, 3.4, 40, 1);
    {
      const p = bridgeG.attributes.position;
      for (let i = 0; i < p.count; i++){
        const x = p.getX(i) / 107;
        p.setZ(i, (1 - x * x) * 6);
      }
      bridgeG.rotateX(-Math.PI / 2);
      bridgeG.rotateY(Math.PI / 2);
      bridgeG.computeVertexNormals();
    }
    const bridgeMesh = new THREE.Mesh(bridgeG, mat(0x3a3f4c, { roughness: 0.85 }));
    bridgeMesh.position.set(0, -0.6, 259);
    bridgeMesh.castShadow = bridgeMesh.receiveShadow = true;
    scene.add(bridgeMesh);
    // supporting blade of stone under the crown of the arch
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 120, 26), cliffM);
    blade.position.set(0, -64.5, 259);
    scene.add(blade);
    const bridgeHeight = (z) => {
      const x = (z - 259) / 107;
      return -0.6 + (1 - x * x) * 6;
    };

    // ---- Durin's Bane --------------------------------------------------
    const balrog = makeBalrog();
    balrog.position.set(0, 0, 388);
    balrog.scale.setScalar(1.45);
    balrog.rotation.y = Math.PI;
    scene.add(balrog);
    updates.push((t) => animateBalrog(balrog, t));
    const embers = makeParticles(scene, 'ember', { cx: 0, cy: 2, cz: 388, area: [50, 70, 50], count: 900 });
    scene.add(embers.mesh); updates.push(embers.update);
    const fireSmoke = makeParticles(scene, 'ash', {
      count: 400, color: 0x1c1410, opacity: 0.4, size: 16, fall: -3, drift: 1.5,
      cx: 0, cy: 10, cz: 390, area: [40, 80, 40],
    });
    scene.add(fireSmoke.mesh); updates.push(fireSmoke.update);

    // Gandalf at the crown of the bridge, staff raised
    const gandalf = Cast.gandalf({ pose: 'raise' });
    gandalf.position.set(0, bridgeHeight(262) + 0.05, 262);
    gandalf.rotation.y = 0;
    applyPose(gandalf, 'raise');
    scene.add(gandalf);
    const staffLight = new THREE.PointLight(0xcfe4ff, 26, 30, 2);
    staffLight.position.set(0, bridgeHeight(262) + 3.2, 262);
    scene.add(staffLight);
    updates.push((t) => { staffLight.intensity = 22 + Math.sin(t * 5.3) * 6; });

    // the Fellowship fleeing toward the near side
    const crowd = new Crowd(heightAt);
    updates.push((t, dt) => crowd.update(t, dt));
    const fleeing = [Cast.aragorn(), Cast.boromir(), Cast.legolas(), Cast.gimli(),
      Cast.frodo(), Cast.sam(), Cast.merry(), Cast.pippin()];
    fleeing.forEach((rig, i) => {
      scene.add(rig);
      const w = crowd.walk(rig, [[0, 0, 250], [0, 0, 210], [0, 0, 168], [(i % 2 ? 6 : -6), 0, 130], [(i % 2 ? 10 : -10), 0, 90]], {
        speed: 2.6, loop: 'pingpong', offset: 0.5 - i * 0.055, animSpeed: 1.6, fly: true,
      });
      // keep them on the bridge deck then the hall floor
      w.path.curve.points.forEach(p => { p.y = p.z > 155 ? bridgeHeight(p.z) : 0; });
    });

    // ---- shots ---------------------------------------------------------
    const shots = [
      { // the Dwarrowdelf reveal — low glide through endless pillars
        pos: [[-70, 7, -380], [-30, 8, -300], [10, 9, -220], [40, 10, -140]],
        look: [[0, 22, -180], [0, 24, -140], [0, 26, -100], [-20, 28, -60]],
        dur: 20,
      },
      { // light shaft moment — dust falling through pale beams
        pos: [[-70, 5, -160], [-52, 8, -140], [-36, 12, -124]],
        look: [[-40, 30, -120], [-40, 34, -120], [-42, 40, -118]],
        dur: 14,
      },
      { // the Bridge — the knife of stone over the fiery gulf
        pos: [[-46, 12, 192], [-32, 10, 212], [-19, 8, 230], [-10, 6.5, 244]],
        look: [[2, 8, 352], [2, 9, 360], [1, 10, 368], [0, 12, 376]],
        dur: 18,
      },
      { // you shall not pass — over Gandalf's shoulder at the Balrog
        pos: [[-4.5, 8.6, 244], [-3, 8.2, 250], [-2, 7.8, 255]],
        look: [[0, 14, 388], [0, 13, 388], [0, 12, 388]],
        dur: 14,
      },
    ];

    return {
      scene, heightAt, shots,
      grade: {
        gain: [0.95, 1.0, 1.15], gamma: [1.1, 1.09, 1.06], lift: [0.02, 0.026, 0.045],
        sat: 0.88, temp: -0.3, bloom: 0.55, bloomThreshold: 0.6, bloomRadius: 0.75,
        grain: 0.03, vignette: 0.3,
      },
      update(t, dt){ for (const u of updates) u(t, dt); },
    };
  },
};
