// textures.js — the one place the world touches image files: photo-scanned
// CC0 surface sets (Poly Haven) vendored under assets/textures/, plus the
// shader patches that put them on the ground and on masonry — triplanar
// rock for cliffs, top-projected grass/mud/trail for the valley floor, and
// world-space weathering (damp bases, rain streaks) for walls.
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

const BASE = new URL('../../assets/textures/', import.meta.url).href;
const loader = new THREE.TextureLoader();
const cache = new Map();
const pending = [];

function load(path, srgb){
  if (cache.has(path)) return cache.get(path);
  let done;
  pending.push(new Promise(r => { done = r; }));
  const t = loader.load(BASE + path, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(path, t);
  return t;
}

// {map, normalMap, roughnessMap} for one vendored set
export function pbr(id){
  return {
    map: load(`${id}/diff.jpg`, true),
    normalMap: load(`${id}/nor_gl.jpg`, false),
    roughnessMap: load(`${id}/rough.jpg`, false),
  };
}

// resolves once every texture requested so far has loaded (or failed)
export function texturesReady(){ return Promise.all(pending.slice()); }

// ---------------------------------------------------------------------------
// Shared world-space varyings for patched standard materials.
function addWorldVaryings(shader){
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWNrm;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `${GLSL_NOISE}
      #include <common>
      varying vec3 vWPos; varying vec3 vWNrm;`);
}

// ---------------------------------------------------------------- ground ---
// Terrain material. Geometry supplies vertex colours (tint) and an `aW`
// attribute: x = rock, y = mud, z = trail weight; grass is the remainder.
// Rock is triplanar so cliffs never smear; the rest is projected from above
// at two scales to hide tiling.
export function makeGroundMaterial(o = {}){
  const S = Object.assign({
    rock: 'lichen_rock', grass: 'sparse_grass', mud: 'muddy_tracks', trail: 'rocky_trail',
    rockScale: 1 / 16, groundScale: 1 / 7, normalStrength: 1.0,
  }, o);
  const rk = pbr(S.rock), gr = pbr(S.grass), md = pbr(S.mud), tr = pbr(S.trail);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const uniforms = {
    tRock: { value: rk.map }, tRockN: { value: rk.normalMap },
    tGrass: { value: gr.map }, tGrassN: { value: gr.normalMap },
    tMud: { value: md.map }, tMudN: { value: md.normalMap },
    tTrail: { value: tr.map }, tTrailN: { value: tr.normalMap },
    uRockS: { value: S.rockScale }, uGroundS: { value: S.groundScale },
    uNStr: { value: S.normalStrength }, uWet: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => 'hd-ground';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    addWorldVaryings(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aW; varying vec3 vW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vW = aW;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tRock, tRockN, tGrass, tGrassN, tMud, tMudN, tTrail, tTrailN;
        uniform float uRockS, uGroundS, uNStr, uWet;
        varying vec3 vW;
        vec3 gW; float gMacro;
        vec3 tri1(sampler2D t, vec3 p, vec3 b){
          return texture2D(t, p.zy).rgb * b.x + texture2D(t, p.xz).rgb * b.y + texture2D(t, p.xy).rgb * b.z;
        }
        // rock at two scales so a 200 m cliff never shows the repeat
        vec3 tri(sampler2D t, vec3 p, vec3 b){
          float m = smoothstep(0.25, 0.75, g_noise(p.xz * 0.21 + p.y * 0.13));
          return mix(tri1(t, p, b), tri1(t, p * 0.29 + 0.37, b), 0.35 + m * 0.4);
        }
        // two-scale sample with noise-driven blend kills visible tiling
        vec3 top2(sampler2D t, vec2 p){
          return mix(texture2D(t, p).rgb, texture2D(t, p * 0.37 + 0.21).rgb, gMacro);
        }`)
      .replace('#include <map_fragment>', `
        vec3 nW = normalize(vWNrm);
        vec3 bw = pow(abs(nW), vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
        gMacro = smoothstep(0.3, 0.7, g_noise(vWPos.xz * 0.013));
        vec3 rp = vWPos * uRockS;
        vec2 gp = vWPos.xz * uGroundS;
        float wr = clamp(vW.x, 0.0, 1.0), wm = clamp(vW.y, 0.0, 1.0), wt = clamp(vW.z, 0.0, 1.0);
        float wg = max(0.0, 1.0 - wr - wm - wt);
        gW = vec3(wr, wm, wt);
        vec3 alb = top2(tGrass, gp) * wg + top2(tMud, gp * 1.3) * wm + top2(tTrail, gp) * wt
                 + tri(tRock, rp, bw) * wr;
        // rain darkens and saturates whatever it soaks
        alb *= mix(1.0, 0.62, uWet);
        diffuseColor.rgb *= alb * 2.0;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        roughnessFactor = mix(roughnessFactor, 0.55 + wr * 0.2, uWet * (0.5 + wm * 0.5));`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 N = nW;
          vec3 tx = texture2D(tRockN, rp.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(tRockN, rp.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(tRockN, rp.xy).xyz * 2.0 - 1.0;
          tx.xy *= uNStr * 1.6; ty.xy *= uNStr * 1.6; tz.xy *= uNStr * 1.6;
          // whiteout-blended triplanar normal
          tx = vec3(tx.xy + N.zy, abs(tx.z) * N.x);
          ty = vec3(ty.xy + N.xz, abs(ty.z) * N.y);
          tz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
          vec3 nRock = normalize(tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z);
          vec3 gn = (texture2D(tGrassN, gp).xyz * 2.0 - 1.0) * (1.0 - gW.x - gW.y - gW.z)
                  + (texture2D(tMudN, gp * 1.3).xyz * 2.0 - 1.0) * gW.y
                  + (texture2D(tTrailN, gp).xyz * 2.0 - 1.0) * gW.z;
          gn.xy *= uNStr;
          vec3 nGround = normalize(vec3(gn.x + N.x, abs(gn.z) * N.y, gn.y + N.z));
          vec3 nWorld = normalize(mix(nGround, nRock, gW.x));
          normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
        }`);
  };
  return mat;
}

// -------------------------------------------------------------- masonry ----
// Standard material on world-scaled UVs, plus weathering computed in world
// space: soot/damp darkening near the ground, vertical rain streaks, and
// broad tonal patches so a 200 m wall never reads as one repeated tile.
export function makeMasonryMaterial(o = {}){
  const S = Object.assign({
    set: 'rock_wall_08', color: 0xb9b6ae, roughness: 1.0, normalScale: 1.1,
    groundY: 0, streak: 0.5, damp: 0.5, key: 'mas',
  }, o);
  const t = pbr(S.set);
  const mat = new THREE.MeshStandardMaterial({
    color: S.color, roughness: S.roughness, metalness: 0,
    map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
    normalScale: new THREE.Vector2(S.normalScale, S.normalScale),
    vertexColors: !!S.vertexColors,
  });
  const uniforms = {
    uGroundY: { value: S.groundY }, uStreak: { value: S.streak },
    uDamp: { value: S.damp }, uWet: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => 'hd-' + S.key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGroundY, uStreak, uDamp, uWet;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float patchN = g_fbm(vWPos.xz * 0.045 + vWPos.y * 0.02);
          diffuseColor.rgb *= 0.78 + patchN * 0.44;
          // greenish-grey lichen bloom on the broad faces
          float lich = smoothstep(0.58, 0.8, g_fbm(vWPos.xz * 0.11 + vWPos.y * 0.09 + 7.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.9, 0.74), lich * 0.6);
          // rain streaks: noise stretched vertically
          float st = g_noise(vec2(vWPos.x * 1.7 + vWPos.z * 1.7, vWPos.y * 0.06));
          diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.95, st) * 0.32 * uStreak;
          // damp, mossy base
          float base = 1.0 - smoothstep(uGroundY, uGroundY + 7.0, vWPos.y + (g_noise(vWPos.xz * 0.3) - 0.5) * 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.6, 0.5), base * uDamp);
          diffuseColor.rgb *= mix(1.0, 0.7, uWet);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.5, uWet);`);
  };
  return mat;
}

// plain textured material (timber, planks) with world-scaled UVs supplied
export function makeTexturedMaterial(set, o = {}){
  const t = pbr(set);
  return new THREE.MeshStandardMaterial(Object.assign({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
    roughness: 1, metalness: 0,
  }, o));
}

// set the rain-wetness of every patched material in a scene
export function setWetness(scene, w){
  scene.traverse(o => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]){
      if (m.userData && m.userData.uniforms && m.userData.uniforms.uWet) m.userData.uniforms.uWet.value = w;
    }
  });
}
