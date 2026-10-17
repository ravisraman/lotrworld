// weather.js — a downpour. Three layers that follow the camera:
//   streaks  — thousands of thin quads stretched along their velocity, so each
//              drop reads as a motion-blurred line, as rain does on film;
//   curtains — cylinders of scrolling streak-noise further out, the grey
//              sheets of rain seen against cliffs and walls;
//   splashes — droplets bursting where the rain meets the ground.
import * as THREE from 'three';
import { mulberry32, GLSL_NOISE } from './util.js';

export function makeRain(opts = {}){
  const o = Object.assign({
    count: 26000, box: [70, 44, 70], speed: 16, wind: [2.2, 0, 1.2],
    length: 1.1, width: 0.009, color: 0xbcd4e6,
    curtains: [24, 55, 110, 210], splashes: 2600, splashRadius: 26, seed: 71,
  }, opts);
  const rand = mulberry32(o.seed);
  const group = new THREE.Group();
  group.frustumCulled = false;
  const shared = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
    uCol: { value: new THREE.Color(o.color) }, uOp: { value: 0.4 },
    uFlash: { value: 0 },
  };

  // ---- streaks --------------------------------------------------------
  {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);   // x across, y along the drop
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const off = new Float32Array(o.count * 4);
    for (let i = 0; i < o.count; i++){
      off[i * 4] = rand() * o.box[0]; off[i * 4 + 1] = rand() * o.box[1];
      off[i * 4 + 2] = rand() * o.box[2]; off[i * 4 + 3] = rand();
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = o.count;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uBox: { value: new THREE.Vector3(...o.box) },
        uVel: { value: new THREE.Vector3(o.wind[0], -o.speed, o.wind[2]) },
        uLen: { value: o.length }, uWid: { value: o.width },
      }, shared),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform float uTime, uLen, uWid;
        uniform vec3 uBox, uVel, uCam;
        attribute vec4 aOff;
        varying float vA; varying vec2 vUv;
        void main(){
          vUv = uv;
          // each drop falls through a box centred on the camera, wrapping
          vec3 p = aOff.xyz + uVel * (uTime * (0.85 + aOff.w * 0.3));
          p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          vec3 dir = normalize(uVel);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          float len = uLen * (0.7 + aOff.w * 0.6);
          vec3 wp = p - dir * position.y * len + side * position.x * uWid * (1.0 + length(cameraPosition - p) * 0.06);
          float d = length(cameraPosition - p);
          // fade in close to the lens, fade out at the box edge
          vA = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; uniform float uOp, uFlash;
        varying float vA; varying vec2 vUv;
        void main(){
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = across * along * vA * uOp * (1.0 + uFlash * 2.5);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uCol * a, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    group.add(mesh);
  }

  // ---- curtains -------------------------------------------------------
  const curtainM = new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vR;
      void main(){ vUv = uv; vR = length(position.xz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      uniform float uTime, uOp, uFlash; uniform vec3 uCol;
      varying vec2 vUv; varying float vR;
      void main(){
        // thin vertical streaks scrolling down, broken by slow gusts
        float cols = vR * 6.2832 * 3.0;
        float x = vUv.x * cols;
        float y = vUv.y * 9.0 + uTime * 5.5 + g_hash(vec2(floor(x), 1.0)) * 40.0;
        float streak = smoothstep(0.86, 1.0, g_hash(vec2(floor(x), floor(y))));
        streak *= smoothstep(0.5, 0.0, abs(fract(x) - 0.5));
        float gust = 0.55 + 0.45 * g_noise(vec2(vUv.x * 14.0 - uTime * 0.15, vUv.y * 2.0));
        float vfade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float a = (streak * 0.55 + 0.05) * gust * vfade * uOp * 0.55 * (1.0 + uFlash * 3.0);
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
  });
  for (const r of o.curtains){
    const h = 40 + r * 0.6;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true).translate(0, h * 0.38, 0), curtainM);
    c.frustumCulled = false;
    c.renderOrder = 4;
    c.userData.isCurtain = true;
    group.add(c);
  }

  // ---- splashes ---------------------------------------------------------
  // a ring of points around the camera, snapped to the ground on the CPU
  // whenever the camera has moved; each pops on its own rhythm
  const SP = o.splashes;
  const spPos = new Float32Array(SP * 3), spSeed = new Float32Array(SP), spXZ = new Float32Array(SP * 2);
  for (let i = 0; i < SP; i++){
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * o.splashRadius;
    spXZ[i * 2] = Math.cos(a) * r; spXZ[i * 2 + 1] = Math.sin(a) * r;
    spSeed[i] = rand();
  }
  const spG = new THREE.BufferGeometry();
  spG.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spG.setAttribute('aSeed', new THREE.BufferAttribute(spSeed, 1));
  const spM = new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; attribute float aSeed; varying float vL; varying float vD;
      void main(){
        float life = fract(uTime * (1.6 + aSeed) + aSeed * 13.0);
        vL = life;
        vec3 p = position + vec3(0.0, 0.03 + life * 0.12, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vD = -mv.z;
        gl_PointSize = clamp((1.5 + life * 4.0) * 22.0 / max(vD, 0.5), 1.0, 12.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uOp, uFlash; varying float vL; varying float vD;
      void main(){
        // a soft crown of spray, not a ring: brightest low, thinning upward
        vec2 q = gl_PointCoord - 0.5; q.x *= 1.6;
        float blob = smoothstep(0.5, 0.0, length(q)) * (0.5 + 0.5 * smoothstep(-0.5, 0.3, q.y));
        float a = blob * (1.0 - vL) * (1.0 - vL) * smoothstep(0.0, 0.05, vL) * uOp * 0.28 * (1.0 + uFlash * 2.0);
        a *= 1.0 - smoothstep(14.0, 26.0, vD);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
  });
  const splash = new THREE.Points(spG, spM);
  splash.frustumCulled = false;
  group.add(splash);
  const lastSnap = new THREE.Vector3(1e9, 0, 0);

  return {
    group,
    // intensity 0..1, flash 0..1 (lightning)
    set(intensity, flash = 0){
      shared.uOp.value = intensity;
      shared.uFlash.value = flash;
      group.visible = intensity > 0.002;
    },
    update(t, camera, heightAt){
      shared.uTime.value = t;
      shared.uCam.value.copy(camera.position);
      for (const c of group.children) if (c.userData.isCurtain) c.position.set(camera.position.x, camera.position.y - 20, camera.position.z);
      if (heightAt && camera.position.distanceToSquared(lastSnap) > 9){
        lastSnap.copy(camera.position);
        const cx = camera.position.x, cz = camera.position.z;
        for (let i = 0; i < SP; i++){
          const x = cx + spXZ[i * 2], z = cz + spXZ[i * 2 + 1];
          spPos[i * 3] = x; spPos[i * 3 + 1] = heightAt(x, z); spPos[i * 3 + 2] = z;
        }
        spG.attributes.position.needsUpdate = true;
      }
    },
  };
}
