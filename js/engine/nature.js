// nature.js — instanced vegetation, rock, water, particles, smoke, banners.
// Everything here is procedural; the goal is painterly density at 60fps.
import * as THREE from 'three';
import { mulberry32, GLSL_NOISE, GLSL_FOG, fogUniforms, clamp } from './util.js';

// ---------------------------------------------------------------- trees ----
// Canopy trees built from a trunk cylinder + blobbed icosphere clusters.
// kind: 'oak' | 'pine' | 'birch' | 'mallorn' | 'dead' | 'cypress'
export function makeTreeGeo(kind, rand = Math.random){
  const g = [];
  const trunkMatIdx = 0, leafMatIdx = 1;

  function blob(r, x, y, z, squash = 1){
    const s = new THREE.IcosahedronGeometry(r, 2);
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++){
      const n = 1 + (rand() - 0.5) * 0.26;
      p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * squash, p.getZ(i) * n);
    }
    s.computeVertexNormals();
    s.translate(x, y, z);
    return s;
  }
  function cyl(rTop, rBot, h, x, y, z, tilt = 0, dir = 0){
    const s = new THREE.CylinderGeometry(rTop, rBot, h, 6);
    s.translate(0, h / 2, 0);
    if (tilt) { s.rotateZ(tilt); s.rotateY(dir); }
    s.translate(x, y, z);
    return s;
  }

  const trunks = [], leaves = [];
  if (kind === 'oak'){
    const h = 3.4 + rand() * 1.6;
    trunks.push(cyl(0.16, 0.34, h, 0, 0, 0));
    const n = 3 + (rand() * 3 | 0);
    for (let i = 0; i < n; i++){
      const a = rand() * Math.PI * 2, d = 0.5 + rand() * 1.1;
      trunks.push(cyl(0.05, 0.12, 1.6, 0, h * 0.72, 0, 0.5 + rand() * 0.5, a));
      leaves.push(blob(1.5 + rand() * 0.8, Math.cos(a) * d, h + 0.4 + rand() * 0.8, Math.sin(a) * d, 0.8));
    }
    leaves.push(blob(1.9 + rand(), 0, h + 1.1, 0, 0.85));
  } else if (kind === 'pine'){
    const h = 5 + rand() * 4;
    trunks.push(cyl(0.08, 0.3, h, 0, 0, 0));
    const tiers = 4 + (rand() * 3 | 0);
    for (let i = 0; i < tiers; i++){
      const t = i / tiers;
      const r = (1 - t) * (1.5 + rand() * 0.5) + 0.25;
      const co = new THREE.ConeGeometry(r, 1.8 + rand() * 0.6, 7);
      co.translate(0, h * (0.34 + t * 0.68), 0);
      leaves.push(co);
    }
  } else if (kind === 'birch'){
    const h = 4 + rand() * 2.2;
    trunks.push(cyl(0.07, 0.16, h, 0, 0, 0, (rand() - 0.5) * 0.12, rand() * 6));
    leaves.push(blob(1.15 + rand() * 0.5, 0, h + 0.55, 0, 1.25));
    leaves.push(blob(0.8 + rand() * 0.4, (rand() - 0.5) * 1.2, h * 0.85, (rand() - 0.5) * 1.2, 1.1));
  } else if (kind === 'mallorn'){
    const h = 26 + rand() * 14;
    trunks.push(cyl(1.1, 2.6, h, 0, 0, 0));
    // root flare
    for (let i = 0; i < 5; i++){
      const a = (i / 5) * Math.PI * 2 + rand();
      trunks.push(cyl(0.3, 1.1, 3.5, Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7, 0.5, a + Math.PI / 2));
    }
    const n = 6 + (rand() * 3 | 0);
    for (let i = 0; i < n; i++){
      const a = rand() * Math.PI * 2, d = 2.5 + rand() * 4.5;
      leaves.push(blob(4.5 + rand() * 2.5, Math.cos(a) * d, h + rand() * 4 - 1, Math.sin(a) * d, 0.74));
    }
    leaves.push(blob(6 + rand() * 2, 0, h + 3, 0, 0.6));
  } else if (kind === 'dead'){
    const h = 2.6 + rand() * 2;
    trunks.push(cyl(0.05, 0.22, h, 0, 0, 0, (rand() - 0.5) * 0.3, rand() * 6));
    const n = 2 + (rand() * 3 | 0);
    for (let i = 0; i < n; i++){
      trunks.push(cyl(0.02, 0.07, 1 + rand() * 1.2, 0, h * (0.5 + rand() * 0.4), 0, 0.6 + rand() * 0.9, rand() * Math.PI * 2));
    }
  } else if (kind === 'cypress'){
    const h = 4.5 + rand() * 2;
    trunks.push(cyl(0.06, 0.18, h * 0.25, 0, 0, 0));
    const co = new THREE.ConeGeometry(0.75 + rand() * 0.3, h, 7);
    co.translate(0, h * 0.25 + h / 2, 0);
    leaves.push(co);
  }

  return { trunks: mergeGeos(trunks), leaves: leaves.length ? mergeGeos(leaves) : null };
}

export function mergeGeos(list){
  // minimal non-indexed merge
  let total = 0;
  const prepared = list.map(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let off = 0;
  for (const g of prepared){
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// Scatter trees as a pair of InstancedMeshes (trunks + canopies).
// spots: [{x,z,s?,ry?}] — caller decides placement; heightAt snaps to ground.
export function plantTrees(kind, spots, opts = {}){
  const o = Object.assign({
    trunkColor: 0x4a3626, leafColor: 0x39531f, leafEmissive: 0x000000,
    heightAt: () => 0, seed: 11, shadow: true, leafRough: 0.9, variants: 5,
  }, opts);
  const rand = mulberry32(o.seed);
  const group = new THREE.Group();

  // several geometry variants so a forest never tiles
  const variants = [];
  for (let i = 0; i < o.variants; i++) variants.push(makeTreeGeo(kind, rand));
  const buckets = variants.map(() => []);
  spots.forEach((p, i) => buckets[i % variants.length].push(p));

  const dummy = new THREE.Object3D();
  const trunkMat = new THREE.MeshStandardMaterial({ color: o.trunkColor, roughness: 1 });
  const leafMat  = new THREE.MeshStandardMaterial({
    color: o.leafColor, roughness: o.leafRough,
    emissive: o.leafEmissive, emissiveIntensity: o.leafEmissive ? 0.75 : 0,
  });

  variants.forEach((v, vi) => {
    const pts = buckets[vi];
    if (!pts.length) return;
    const tm = new THREE.InstancedMesh(v.trunks, trunkMat, pts.length);
    const lm = v.leaves ? new THREE.InstancedMesh(v.leaves, leafMat, pts.length) : null;
    pts.forEach((p, i) => {
      const s = (p.s ?? (0.8 + rand() * 0.5));
      dummy.position.set(p.x, o.heightAt(p.x, p.z), p.z);
      dummy.rotation.set(0, p.ry ?? rand() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      tm.setMatrixAt(i, dummy.matrix);
      if (lm) lm.setMatrixAt(i, dummy.matrix);
    });
    tm.castShadow = o.shadow; tm.receiveShadow = true;
    group.add(tm);
    if (lm){ lm.castShadow = o.shadow; lm.receiveShadow = true; group.add(lm); }
  });
  return group;
}

// ---------------------------------------------------------------- rocks ----
export function scatterRocks(spots, opts = {}){
  const o = Object.assign({ color: 0x6d675f, heightAt: () => 0, seed: 5, rough: 0.95, sink: 0.25 }, opts);
  const rand = mulberry32(o.seed);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){
      const m = 0.7 + rand() * 0.6;
      p.setXYZ(i, p.getX(i) * m, p.getY(i) * (0.55 + rand() * 0.5), p.getZ(i) * m);
    }
    geo.computeVertexNormals();
  }
  const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: o.rough, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    const s = p.s ?? (0.5 + rand() * 1.6);
    dummy.position.set(p.x, o.heightAt(p.x, p.z) - s * o.sink, p.z);
    dummy.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
    dummy.scale.set(s * (0.7 + rand() * 0.7), s, s * (0.7 + rand() * 0.7));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- grass ----
// Wind-swayed crossed-quad tufts, instanced. Color fades between two tones.
export function makeGrass(scene, opts = {}){
  const o = Object.assign({
    count: 14000, area: 260, cx: 0, cz: 0,
    heightAt: () => 0, mask: null,            // mask(x,z)->0..1 keep probability
    colorA: 0x5a7a2c, colorB: 0x8a9a44, height: 0.85,
    windAmp: 0.22, windFreq: 1.4, seed: 21,
  }, opts);
  const rand = mulberry32(o.seed);

  const blade = new THREE.PlaneGeometry(1, 1, 1, 2);
  blade.translate(0, 0.5, 0);
  const cross = mergeGeos([blade, blade.clone().rotateY(Math.PI / 2)]);

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: false,
    uniforms: Object.assign({
      uTime: { value: 0 },
      uColA: { value: new THREE.Color(o.colorA) },
      uColB: { value: new THREE.Color(o.colorB) },
      uAmp: { value: o.windAmp }, uFreq: { value: o.windFreq },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    }, fogUniforms(scene)),
    vertexShader: /* glsl */`
      ${GLSL_NOISE}
      uniform float uTime, uAmp, uFreq;
      attribute float aPhase;
      attribute float aShade;
      varying float vShade;
      varying float vY;
      varying float vDist;
      void main(){
        vShade = aShade; vY = position.y;
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        float sway = sin(uTime * uFreq + aPhase + wp.x * 0.15 + wp.z * 0.11);
        float gust = g_noise(wp.xz * 0.02 + uTime * 0.07) - 0.5;
        wp.x += (sway * uAmp + gust * uAmp * 2.6) * position.y * position.y;
        wp.z += (cos(uTime * uFreq * 0.8 + aPhase) * uAmp * 0.55 + gust * uAmp) * position.y * position.y;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_FOG}
      uniform vec3 uColA, uColB;
      varying float vShade; varying float vY; varying float vDist;
      void main(){
        vec3 col = mix(uColA, uColB, vShade) * (0.55 + vY * 0.65);
        col = applyFog(col, vDist);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const pts = [];
  let guard = 0;
  while (pts.length < o.count && guard < o.count * 12){
    guard++;
    const x = o.cx + (rand() - 0.5) * o.area;
    const z = o.cz + (rand() - 0.5) * o.area;
    if (o.mask && rand() > o.mask(x, z)) continue;
    pts.push({ x, z });
  }
  const mesh = new THREE.InstancedMesh(cross, mat, pts.length);
  const dummy = new THREE.Object3D();
  const phase = new Float32Array(cross.attributes.position.count).fill(0);
  const aPhase = new Float32Array(pts.length);
  const aShade = new Float32Array(pts.length);
  pts.forEach((p, i) => {
    dummy.position.set(p.x, o.heightAt(p.x, p.z), p.z);
    dummy.rotation.y = rand() * Math.PI;
    const s = 0.6 + rand() * 0.8;
    dummy.scale.set(s * 0.22, s * o.height, s * 0.22);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    aPhase[i] = rand() * 6.28;
    aShade[i] = rand();
  });
  cross.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  cross.setAttribute('aShade', new THREE.InstancedBufferAttribute(aShade, 1));
  mesh.frustumCulled = false;
  return { mesh, update(t){ mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- water ----
export function makeWater(scene, opts = {}){
  const o = Object.assign({
    w: 300, h: 300, y: 0,
    shallow: 0x2e5d5a, deep: 0x14313c, sky: 0xbfd6e2,
    sunDir: new THREE.Vector3(0.5, 0.5, -0.5), sunColor: 0xfff0c8,
    flow: 0.5, scale: 0.08, opacity: 0.96, foam: 0,
  }, opts);
  const uniforms = Object.assign({
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(o.shallow) },
    uDeep: { value: new THREE.Color(o.deep) },
    uSky: { value: new THREE.Color(o.sky) },
    uSunDir: { value: o.sunDir.clone().normalize() },
    uSunCol: { value: new THREE.Color(o.sunColor) },
    uFlow: { value: o.flow }, uScale: { value: o.scale }, uOp: { value: o.opacity },
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying float vDist;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      ${GLSL_FOG}
      uniform float uTime, uFlow, uScale, uOp;
      uniform vec3 uShallow, uDeep, uSky, uSunDir, uSunCol;
      varying vec3 vWorld; varying float vDist;
      void main(){
        vec2 p = vWorld.xz * uScale;
        float n1 = g_fbm(p + vec2(uTime * uFlow * 0.13, uTime * uFlow * 0.07));
        float n2 = g_fbm(p * 1.9 - vec2(uTime * uFlow * 0.11, -uTime * uFlow * 0.05));
        vec3 N = normalize(vec3((n1 - 0.5) * 0.9, 1.0, (n2 - 0.5) * 0.9));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, n1 * 0.35);
        col = mix(col, uSky, fres * 0.5);
        vec3 R = reflect(-uSunDir, N);
        float spec = pow(max(dot(R, V), 0.0), 90.0);
        col += uSunCol * spec * 1.6;
        float sparkle = smoothstep(0.8, 0.98, g_noise(p * 14.0 + uTime * 0.7)) * fres;
        col += uSunCol * sparkle * 0.22;
        col = applyFog(col, vDist);
        gl_FragColor = vec4(col, uOp);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = o.y;
  return { mesh, update(t){ uniforms.uTime.value = t; } };
}

// ------------------------------------------------------------- waterfall ---
export function makeWaterfall(scene, opts = {}){
  const o = Object.assign({
    top: new THREE.Vector3(0, 30, 0), height: 30, width: 5,
    color: 0xdfeef2, speed: 1.6, opacity: 0.75,
  }, opts);
  const uniforms = Object.assign({
    uTime: { value: 0 },
    uCol: { value: new THREE.Color(o.color) },
    uSpeed: { value: o.speed }, uOp: { value: o.opacity },
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vDist;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      ${GLSL_FOG}
      uniform float uTime, uSpeed, uOp;
      uniform vec3 uCol;
      varying vec2 vUv; varying float vDist;
      void main(){
        float fall = g_fbm(vec2(vUv.x * 6.0, vUv.y * 3.0 + uTime * uSpeed));
        float streaks = g_noise(vec2(vUv.x * 24.0, vUv.y * 4.0 + uTime * uSpeed * 1.7));
        float a = smoothstep(0.25, 0.75, fall * 0.7 + streaks * 0.5);
        a *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        vec3 col = uCol * (0.75 + fall * 0.5);
        col = applyFog(col, vDist);
        gl_FragColor = vec4(col, a * uOp);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height, 1, 8), mat);
  mesh.position.copy(o.top);
  mesh.position.y -= o.height / 2;
  return { mesh, update(t){ uniforms.uTime.value = t; } };
}

// ------------------------------------------------------------- particles ---
// kind: snow | ash | ember | firefly | leaf | pollen | rain
export function makeParticles(scene, kind, opts = {}){
  const presets = {
    snow:   { count: 3200, size: 2.2, color: 0xffffff, opacity: 0.85, fall: 3.2, drift: 2.4, blink: 0, area: [220, 90, 220] },
    ash:    { count: 1600, size: 2.6, color: 0x8a8078, opacity: 0.7,  fall: 1.1, drift: 1.6, blink: 0, area: [260, 110, 260] },
    ember:  { count: 700,  size: 2.4, color: 0xff8a2a, opacity: 0.95, fall: -2.2, drift: 1.2, blink: 3, area: [130, 90, 130], additive: true },
    firefly:{ count: 260,  size: 3.0, color: 0xcfe8ff, opacity: 0.9,  fall: -0.12, drift: 0.9, blink: 1.6, area: [180, 26, 180], additive: true },
    leaf:   { count: 500,  size: 3.4, color: 0xd8a844, opacity: 0.9,  fall: 0.8, drift: 2.6, blink: 0, area: [180, 50, 180] },
    pollen: { count: 700,  size: 1.6, color: 0xfff4c8, opacity: 0.55, fall: 0.25, drift: 1.1, blink: 0.8, area: [160, 30, 160], additive: true },
    rain:   { count: 3800, size: 1.6, color: 0x9db4c2, opacity: 0.5,  fall: 34, drift: 0.4, blink: 0, area: [150, 70, 150], streak: true },
  };
  const o = Object.assign({}, presets[kind], opts);
  const rand = mulberry32(o.seed || 99);
  const N = o.count;
  const pos = new Float32Array(N * 3), seedArr = new Float32Array(N);
  for (let i = 0; i < N; i++){
    pos[i * 3]     = (rand() - 0.5) * o.area[0] + (o.cx || 0);
    pos[i * 3 + 1] = rand() * o.area[1] + (o.cy || 0);
    pos[i * 3 + 2] = (rand() - 0.5) * o.area[2] + (o.cz || 0);
    seedArr[i] = rand() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArr, 1));
  const uniforms = Object.assign({
    uTime: { value: 0 }, uSize: { value: o.size },
    uCol: { value: new THREE.Color(o.color) }, uOp: { value: o.opacity },
    uFall: { value: o.fall }, uDrift: { value: o.drift }, uBlink: { value: o.blink },
    uYBase: { value: o.cy || 0 }, uYSpan: { value: o.area[1] },
    uStreak: { value: o.streak ? 1.0 : 0.0 },
    uStreakA: { value: o.streakAngle || 0.0 },
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uSize, uFall, uDrift, uYBase, uYSpan;
      attribute float aSeed;
      varying float vSeed; varying float vDist;
      void main(){
        vSeed = aSeed;
        vec3 p = position;
        float life = mod(p.y - uYBase - uTime * uFall, uYSpan);
        p.y = uYBase + (uFall >= 0.0 ? uYSpan - life : life);
        p.x += sin(uTime * 0.7 + aSeed * 3.1) * uDrift + sin(uTime * 0.23 + aSeed) * uDrift * 1.7;
        p.z += cos(uTime * 0.6 + aSeed * 2.3) * uDrift;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = min(uSize * (240.0 / max(vDist, 1.0)), 34.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_FOG}
      uniform vec3 uCol; uniform float uOp, uBlink, uTime, uStreak, uStreakA;
      varying float vSeed; varying float vDist;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        if (uStreak > 0.5){
          float ca = cos(uStreakA), sa = sin(uStreakA);
          q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
          q.x *= 5.0;
        }
        float d = length(q);
        float a = smoothstep(0.5, 0.08, d) * uOp;
        if (uBlink > 0.0){
          a *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * uBlink + vSeed * 7.0), 2.0);
        }
        if (a < 0.01) discard;
        vec3 col = applyFog(uCol, vDist * 0.6);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { mesh: points, update(t){ uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- smoke ----
// Lazy chimney / fire smoke: a column of soft billboards rising and fading.
export function makeSmoke(scene, opts = {}){
  const o = Object.assign({
    x: 0, y: 0, z: 0, count: 14, rise: 6.5, spread: 1.2,
    color: 0xb9b4aa, size: 1.4, opacity: 0.32, speed: 0.35,
  }, opts);
  const rand = mulberry32((o.x * 13 + o.z * 7 + 100) | 0);
  const N = o.count;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++){
    pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = Object.assign({
    uTime: { value: 0 }, uRise: { value: o.rise }, uSpread: { value: o.spread },
    uCol: { value: new THREE.Color(o.color) }, uSize: { value: o.size },
    uOp: { value: o.opacity }, uSpeed: { value: o.speed },
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uRise, uSpread, uSize, uSpeed;
      attribute float aSeed;
      varying float vLife; varying float vSeed; varying float vDist;
      void main(){
        vSeed = aSeed;
        float life = fract(uTime * uSpeed + aSeed);
        vLife = life;
        vec3 p = position;
        p.y += life * uRise;
        p.x += sin(aSeed * 40.0 + life * 5.0) * uSpread * life;
        p.z += cos(aSeed * 31.0 + life * 4.0) * uSpread * life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = min(uSize * (0.5 + life * 2.2) * (240.0 / max(vDist, 1.0)), 120.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_FOG}
      uniform vec3 uCol; uniform float uOp;
      varying float vLife; varying float vSeed; varying float vDist;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * uOp;
        a *= smoothstep(0.0, 0.15, vLife) * smoothstep(1.0, 0.55, vLife);
        if (a < 0.01) discard;
        gl_FragColor = vec4(applyFog(uCol, vDist * 0.7), a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { mesh: points, update(t){ uniforms.uTime.value = t; } };
}

// --------------------------------------------------------------- banners ---
// Cloth plane waving in the wind; emblem drawn on a canvas texture.
export function makeBanner(scene, opts = {}){
  const o = Object.assign({
    w: 1.4, h: 2.2, color: '#1e4023', emblem: 'horse', emblemColor: '#e8e2d0',
    poleH: 4.2, wind: 1.0, tail: true,
  }, opts);
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 192;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = o.color; ctx.fillRect(0, 0, 128, 192);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 122, 186);
  ctx.fillStyle = o.emblemColor; ctx.strokeStyle = o.emblemColor;
  drawEmblem(ctx, o.emblem);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.PlaneGeometry(o.w, o.h, 10, 12);
  if (o.tail){
    // notch the bottom into a swallowtail
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){
      const u = (p.getX(i) / o.w) + 0.5, v = (p.getY(i) / o.h) + 0.5;
      if (v < 0.18){
        const cut = 1 - Math.abs(u - 0.5) * 2;
        p.setY(i, p.getY(i) + cut * o.h * 0.16 * (1 - v / 0.18));
      }
    }
  }
  const uniforms = Object.assign({
    uTime: { value: 0 }, uMap: { value: tex }, uWind: { value: o.wind },
    uLight: { value: o.light ?? 1 },   // unlit cloth: scale for dark scenes
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, transparent: false,
    vertexShader: /* glsl */`
      uniform float uTime, uWind;
      varying vec2 vUv; varying float vDist; varying float vWave;
      void main(){
        vUv = uv;
        vec3 p = position;
        float sway = (1.0 - uv.y) ; // hangs from top
        float w = sin(uTime * 2.2 * uWind + uv.y * 4.0 + uv.x * 2.0) * 0.5
                + sin(uTime * 3.7 * uWind + uv.y * 7.0) * 0.25;
        p.z += w * 0.22 * sway;
        p.x += sin(uTime * 1.4 * uWind + uv.y * 3.0) * 0.08 * sway;
        vWave = w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_FOG}
      uniform sampler2D uMap;
      varying vec2 vUv; varying float vDist; varying float vWave;
      uniform float uLight;
      void main(){
        vec3 col = texture2D(uMap, vUv).rgb;
        col *= (0.85 + vWave * 0.25) * uLight;
        gl_FragColor = vec4(applyFog(col, vDist), 1.0);
      }`,
  });
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.y = o.poleH - o.h / 2 - 0.1;

  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, o.poleH, 6),
    new THREE.MeshStandardMaterial({ color: 0x5d4a33, roughness: 0.9 }));
  pole.position.y = o.poleH / 2;
  const cross = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, o.w + 0.25, 6),
    pole.material);
  cross.rotation.z = Math.PI / 2;
  cross.position.y = o.poleH - 0.05;
  cloth.position.x = 0;
  group.add(pole, cross, cloth);
  return { mesh: group, uniforms, update(t){ uniforms.uTime.value = t; } };
}

function drawEmblem(ctx, kind){
  ctx.save();
  ctx.translate(64, 92);
  if (kind === 'horse'){
    // stylized running horse of Rohan
    ctx.beginPath();
    ctx.moveTo(-38, 18);
    ctx.quadraticCurveTo(-30, -6, -10, -10);
    ctx.quadraticCurveTo(2, -26, 14, -30);
    ctx.quadraticCurveTo(26, -34, 30, -24);
    ctx.quadraticCurveTo(22, -20, 20, -12);
    ctx.quadraticCurveTo(34, -6, 38, 6);
    ctx.quadraticCurveTo(30, 4, 24, 2);
    ctx.lineTo(28, 22);
    ctx.lineTo(18, 20);
    ctx.lineTo(10, 8);
    ctx.lineTo(-6, 10);
    ctx.lineTo(-12, 24);
    ctx.lineTo(-22, 22);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'tree'){
    // White Tree of Gondor with seven stars
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(0, -14); ctx.stroke();
    for (const [a, len] of [[-0.9, 22], [0.9, 22], [-0.55, 26], [0.55, 26], [-0.25, 28], [0.25, 28]]){
      ctx.beginPath(); ctx.moveTo(0, 8 - Math.abs(a) * 18);
      ctx.quadraticCurveTo(a * 18, -6 - Math.abs(a) * 10, a * len, -18 - Math.abs(a) * 8);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++){
      const a = (i / 6 - 0.5) * Math.PI * 1.15;
      const x = Math.sin(a) * 44, y = -Math.cos(a) * 34 - 18;
      star(ctx, x, y, 4);
    }
  } else if (kind === 'eye'){
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 15, 0, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'hand'){
    // white hand of Saruman
    ctx.fillRect(-16, -8, 32, 40);
    for (let i = 0; i < 5; i++) ctx.fillRect(-16 + i * 6.6, -32, 4.6, 26);
  } else if (kind === 'star'){
    star(ctx, 0, 0, 22);
  } else if (kind === 'plain'){ /* nothing */ }
  ctx.restore();
}
function star(ctx, x, y, r){
  ctx.beginPath();
  for (let i = 0; i < 8; i++){
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.38;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.sin(a) * rr, y - Math.cos(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// ------------------------------------------------------------ god rays -----
// Cheap volumetric shafts: additive tapered planes with soft noise alpha.
export function makeLightShafts(scene, opts = {}){
  const o = Object.assign({
    count: 5, x: 0, y: 40, z: 0, spread: 30, height: 60, width: 7,
    color: 0xfff3d0, opacity: 0.16, tilt: 0.22, seed: 3,
  }, opts);
  const rand = mulberry32(o.seed);
  const group = new THREE.Group();
  const uniforms = Object.assign({
    uTime: { value: 0 }, uCol: { value: new THREE.Color(o.color) }, uOp: { value: o.opacity },
  }, fogUniforms(scene));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      uniform vec3 uCol; uniform float uOp, uTime;
      varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float grad = smoothstep(0.0, 0.25, vUv.y) * (1.0 - vUv.y * 0.55);
        float n = g_noise(vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 0.04));
        gl_FragColor = vec4(uCol, edge * grad * uOp * (0.7 + n * 0.5));
      }`,
  });
  for (let i = 0; i < o.count; i++){
    const g = new THREE.PlaneGeometry(o.width * (0.7 + rand() * 0.7), o.height, 1, 1);
    // taper: narrow at top
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++){
      const v = (p.getY(j) / o.height) + 0.5;
      p.setX(j, p.getX(j) * (0.35 + (1 - v) * 0.9));
    }
    // crossed pair so the beam never vanishes edge-on
    const holder = new THREE.Group();
    const m = new THREE.Mesh(g, mat);
    const m2 = new THREE.Mesh(g, mat);
    m2.rotation.y = Math.PI / 2;
    holder.add(m, m2);
    holder.position.set(o.x + (rand() - 0.5) * o.spread, o.y - o.height / 2, o.z + (rand() - 0.5) * o.spread);
    holder.rotation.z = (rand() - 0.5) * o.tilt;
    holder.rotation.y = rand() * Math.PI;
    group.add(holder);
  }
  return { mesh: group, update(t){ uniforms.uTime.value = t; } };
}
