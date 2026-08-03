// util.js — deterministic noise, PRNG, math helpers shared by every region.
import * as THREE from 'three';

export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 2D value noise with smooth interpolation + fbm ----
const PERM = new Uint8Array(512);
{
  const r = mulberry32(1954);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--){ const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
function hash2(ix, iz){ return PERM[(PERM[ix & 255] + iz) & 255] / 255; }
function fade(t){ return t * t * t * (t * (t * 6 - 15) + 10); }

export function vnoise(x, z){
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz),     b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, oct = 5, lac = 2.02, gain = 0.5){
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++){
    sum += amp * vnoise(x * f, z * f);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

// ridged fbm — sharp mountain crests
export function ridged(x, z, oct = 5, lac = 2.1, gain = 0.5){
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++){
    const n = 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1);
    sum += amp * n * n;
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x);
};
export const DEG = Math.PI / 180;

export function v3(x = 0, y = 0, z = 0){ return new THREE.Vector3(x, y, z); }

// Catmull-Rom path with arc-length param — the backbone of camera shots and walkers.
export class Path {
  constructor(points, closed = false){
    this.curve = new THREE.CatmullRomCurve3(
      points.map(p => Array.isArray(p) ? v3(p[0], p[1], p[2]) : p),
      closed, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
  }
  at(t, out){ return this.curve.getPointAt(clamp(t, 0, 1), out); }
  tangent(t, out){ return this.curve.getTangentAt(clamp(t, 0, 1), out); }
}

// GLSL chunks reused by custom shaders --------------------------------------
export const GLSL_NOISE = /* glsl */`
  float g_hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float g_noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(g_hash(i), g_hash(i + vec2(1.,0.)), u.x),
               mix(g_hash(i + vec2(0.,1.)), g_hash(i + vec2(1.,1.)), u.x), u.y);
  }
  float g_fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * g_noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

// Manual fog identical to THREE's exp2 fog, for custom ShaderMaterials.
export const GLSL_FOG = /* glsl */`
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  vec3 applyFog(vec3 col, float dist){
    float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    return mix(col, uFogColor, clamp(f, 0.0, 1.0));
  }
`;

export function fogUniforms(scene){
  return {
    uFogColor:   { value: scene.fog ? scene.fog.color : new THREE.Color(0) },
    uFogDensity: { value: scene.fog ? scene.fog.density : 0.0 },
  };
}

export function disposeDeep(root){
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
        m.dispose();
      });
    }
  });
}
