// sky.js — painterly sky dome: gradient, sun + halo, drifting cloud banks,
// night stars, horizon haze. Plus layered mountain-silhouette rings that give
// each region the deep painted backdrop the films rely on.
import * as THREE from 'three';
import { GLSL_NOISE, fbm, mulberry32 } from './util.js';

export function makeSky(opts = {}){
  const o = Object.assign({
    zenith:  0x2c4a70, horizon: 0xc8ad7e, ground: 0x6b6252,
    sunDir:  new THREE.Vector3(0.5, 0.35, -0.6),
    sunColor: 0xfff2cf, sunSize: 0.028, sunHalo: 0.35, sunIntensity: 1.0,
    cloudColor: 0xf2e8d8, cloudShadow: 0x7d7466, cloudCover: 0.42, cloudSharp: 0.22,
    cloudScale: 2.6, cloudSpeed: 0.006,
    stars: 0.0, haze: 0.5, radius: 3200,
  }, opts);

  const uniforms = {
    uZenith:   { value: new THREE.Color(o.zenith) },
    uHorizon:  { value: new THREE.Color(o.horizon) },
    uGround:   { value: new THREE.Color(o.ground) },
    uSunDir:   { value: o.sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color(o.sunColor) },
    uSunSize:  { value: o.sunSize },
    uSunHalo:  { value: o.sunHalo },
    uSunI:     { value: o.sunIntensity },
    uCloudCol: { value: new THREE.Color(o.cloudColor) },
    uCloudSh:  { value: new THREE.Color(o.cloudShadow) },
    uCover:    { value: o.cloudCover },
    uSharp:    { value: o.cloudSharp },
    uCScale:   { value: o.cloudScale },
    uTime:     { value: 0 },
    uCSpeed:   { value: o.cloudSpeed },
    uStars:    { value: o.stars },
    uHaze:     { value: o.haze },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // pin to far plane
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      varying vec3 vDir;
      uniform vec3 uZenith, uHorizon, uGround, uSunColor, uCloudCol, uCloudSh;
      uniform vec3 uSunDir;
      uniform float uSunSize, uSunHalo, uSunI, uCover, uSharp, uCScale, uTime, uCSpeed, uStars, uHaze;

      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;

        // vertical gradient with hazy horizon band
        float t = smoothstep(-0.06, 0.45, h);
        vec3 col = mix(uHorizon, uZenith, pow(t, 0.78));
        col = mix(col, uGround, smoothstep(-0.02, -0.25, h));
        float hz = exp(-abs(h) * 9.0) * uHaze;
        col = mix(col, uHorizon * 1.08, hz);

        // sun disc + halo + forward scatter
        float sd = max(dot(d, uSunDir), 0.0);
        float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, sd);
        float halo = pow(sd, 22.0) * uSunHalo + pow(sd, 5.0) * uSunHalo * 0.28;
        col += uSunColor * (disc * 2.3 + halo) * uSunI;

        // cloud banks — fbm on a projected plane, lit toward the sun
        if (h > -0.02 && uCover > 0.001){
          vec2 cuv = d.xz / (abs(h) + 0.16) * uCScale;
          cuv += vec2(uTime * uCSpeed * 10.0, uTime * uCSpeed * 3.0);
          float n = g_fbm(cuv);
          float cl = smoothstep(1.0 - uCover, 1.0 - uCover + uSharp, n);
          float lit = g_fbm(cuv + uSunDir.xz * 0.5) - n;
          vec3 cc = mix(uCloudSh, uCloudCol, clamp(0.55 - lit * 3.0, 0.0, 1.0));
          cc += uSunColor * pow(sd, 6.0) * 0.35;
          float fadeH = smoothstep(0.0, 0.12, h);
          col = mix(col, cc, cl * fadeH * 0.92);
        }

        // stars
        if (uStars > 0.001 && h > 0.02){
          vec2 sp = d.xz / (h + 0.25) * 240.0;
          float s = g_hash(floor(sp));
          float star = smoothstep(0.997, 1.0, s) * uStars;
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
          col += vec3(0.9, 0.94, 1.0) * star * tw * smoothstep(0.02, 0.3, h);
        }

        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return {
    mesh, uniforms,
    update(t){ uniforms.uTime.value = t; },
  };
}

// Layered silhouette mountain rings — the painted backdrop.
// layers: [{dist, height, color, jag, seed, gap:[angleStart,angleEnd] optional opening}]
export function makeMountainBackdrop(layers, groundColor = null){
  const group = new THREE.Group();
  if (groundColor !== null){
    // annulus of distant ground closing the gap between terrain edge and hills
    const skirt = new THREE.Mesh(
      new THREE.RingGeometry(260, 3400, 48, 1),
      new THREE.MeshBasicMaterial({ color: groundColor, fog: false, side: THREE.DoubleSide }));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -2.5;
    skirt.renderOrder = -60;
    group.add(skirt);
  }
  for (const L of layers){
    const seg = 220;
    const rand = mulberry32(L.seed || 7);
    const base = rand() * 100;
    const positions = [];
    const dist = L.dist, hMax = L.height;
    for (let i = 0; i < seg; i++){
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const hAt = (a) => {
        if (L.gap){
          const ang = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let g0 = L.gap[0], g1 = L.gap[1];
          if (ang > g0 && ang < g1){
            const m = Math.min(ang - g0, g1 - ang) / ((g1 - g0) * 0.5);
            return hMax * (0.12 + 0.2 * m) * (0.4 + fbm(base + a * (L.jag || 3), 7.7) * 0.8);
          }
        }
        const n = fbm(base + Math.cos(a) * (L.jag || 3), base + Math.sin(a) * (L.jag || 3), 4);
        const n2 = fbm(base * 2 + Math.cos(a) * (L.jag || 3) * 3.7, Math.sin(a) * 3.7, 3);
        return hMax * (0.35 + n * 0.65 + n2 * 0.22);
      };
      const h0 = hAt(a0), h1 = hAt(a1);
      const x0 = Math.cos(a0) * dist, z0 = Math.sin(a0) * dist;
      const x1 = Math.cos(a1) * dist, z1 = Math.sin(a1) * dist;
      const yb = -L.height * 0.5;
      positions.push(
        x0, yb, z0,  x1, yb, z1,  x1, h1, z1,
        x0, yb, z0,  x1, h1, z1,  x0, h0, z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    // fog:false — at these distances exp2 fog would flatten every ring to one
    // colour; the layer colours ARE the aerial perspective, authored by hand.
    const m = new THREE.MeshBasicMaterial({ color: L.color, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = -50;
    group.add(mesh);
  }
  return group;
}
