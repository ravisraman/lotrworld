// main.js — bootstraps the renderer, owns the region lifecycle, the grand
// tour, free flight, HUD, and the deterministic ME API used for testing.
import * as THREE from 'three';
import { makePost } from './engine/post.js';
import { ShotPlayer, FreeFly } from './engine/cinematics.js';
import { initMap } from './ui/map.js';

import shire from './regions/shire.js';
import bree from './regions/bree.js';
import rivendell from './regions/rivendell.js';
import caradhras from './regions/caradhras.js';
import moria from './regions/moria.js';
import lothlorien from './regions/lothlorien.js';
import rohan from './regions/rohan.js';
import helmsdeep from './regions/helmsdeep.js';
import isengard from './regions/isengard.js';
import minastirith from './regions/minastirith.js';
import mordor from './regions/mordor.js';

const REGIONS = [shire, bree, rivendell, caradhras, moria, lothlorien, rohan, helmsdeep, isengard, minastirith, mordor];

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 9000);
camera.position.set(0, 30, 80);

const post = makePost(renderer, new THREE.Scene(), camera);
post.setSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));

const shots = new ShotPlayer(camera);
const fly = new FreeFly(camera, renderer.domElement);

// ---------------------------------------------------------------- state ----
const built = new Map();       // id -> built region {scene, shots, update, ...}
let active = null;             // built region
let activeDef = null;
let shotIndex = 0;
let mode = 'ambient';          // ambient | tour | fly
let tourStage = 0;
let clockT = 0;
let frozen = false;
let speedScale = 1;

const $ = (s) => document.querySelector(s);
const veil = $('#veil'), titlecard = $('#titlecard');
const tcName = titlecard.querySelector('.tc-name'), tcSub = titlecard.querySelector('.tc-sub');
const rlName = $('#regionlabel .rl-name'), rlSub = $('#regionlabel .rl-sub');
const loader = $('#loader'), lfill = $('#lfill');

// ------------------------------------------------------------- lifecycle ---
const pmrem = new THREE.PMREMGenerator(renderer);

// Bake an IBL environment from the region's own sky dome so every PBR
// surface — armor, helms, wet stone, skin — picks up sky-colored ambient
// and reflections instead of reading flat under direct light alone.
function enhanceRegion(r){
  let skyMesh = null;
  r.scene.traverse(o => { if (!skyMesh && o.userData.isSky) skyMesh = o; });
  if (skyMesh){
    const envScene = new THREE.Scene();
    const proxy = new THREE.Mesh(skyMesh.geometry, skyMesh.material);
    proxy.frustumCulled = false;
    envScene.add(proxy);
    r.scene.environment = pmrem.fromScene(envScene, 0, 1, 5000).texture;
  }
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  r.scene.traverse(o => {
    if (o.isDirectionalLight && o.castShadow){
      o.shadow.normalBias = Math.max(o.shadow.normalBias, 0.025);
    }
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]){
      if (!m) continue;
      // the direct rigs are tuned already; env is ambient seasoning, not key
      if (m.isMeshStandardMaterial) m.envMapIntensity = 0.35;
      if (m.map && m.map.anisotropy < maxAniso){
        m.map.anisotropy = maxAniso;
        m.map.needsUpdate = true;
      }
    }
  });
}

async function buildRegion(def){
  if (built.has(def.id)) return built.get(def.id);
  lfill.style.width = '30%';
  await nextFrame();
  const ctx = { THREE, renderer, camera };
  const r = def.build(ctx);
  r.def = def;
  // regions with photographic textures resolve `ready` once they've loaded
  if (r.ready) await Promise.race([r.ready, wait(15000)]);
  // safety rail: no dolly position may ever dip below the terrain
  if (r.heightAt){
    for (const shot of r.shots){
      for (const p of shot.pos){
        p[1] = Math.max(p[1], r.heightAt(p[0], p[2]) + 2.2);
      }
    }
  }
  enhanceRegion(r);
  built.set(def.id, r);
  lfill.style.width = '90%';
  await nextFrame();
  return r;
}
function nextFrame(){ return new Promise(r => requestAnimationFrame(r)); }

async function gotoRegion(idx, opts = {}){
  const def = REGIONS[idx % REGIONS.length];
  if (activeDef === def && !opts.force) return;
  veil.classList.remove('clear');
  if (!built.has(def.id)){ loader.classList.remove('gone'); }
  await wait(opts.fast ? 60 : 650);
  const r = await buildRegion(def);
  loader.classList.add('gone');
  active = r; activeDef = def;
  shotIndex = 0;
  post.setScene(r.scene);
  post.setGrade(r.grade || {});
  renderer.toneMappingExposure = r.exposure ?? 1.0;
  if (opts.snap) post.snapGrade();
  shots.play(r.shots[0]);
  if (r.setMood) setMood(r.mood || 'dusk', !!opts.snap);
  buildPlaces(r);
  fly.heightAt = r.heightAt || null;
  rlName.textContent = def.name;
  rlSub.textContent = def.subtitle || '';
  document.querySelectorAll('#nav button').forEach((b, i) => b.classList.toggle('active', i === idx));
  if (opts.title !== false){
    tcName.textContent = def.name;
    tcSub.textContent = def.subtitle || '';
    titlecard.classList.add('show');
    setTimeout(() => titlecard.classList.remove('show'), opts.fast ? 1200 : 4200);
  }
  veil.classList.add('clear');
  // warm the pipeline once so the first visible frame is complete
  active.update(clockT, 0.016);
  post.update(clockT, 0.5);
  post.render();
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------- the tour ---
let tourRunning = false;
async function runTour(){
  tourRunning = true;
  mode = 'tour';
  document.body.classList.add('letterbox');
  $('#btn-tour').classList.add('on');
  for (let i = 0; i < REGIONS.length && tourRunning; i++){
    await gotoRegion(i, {});
    // play every shot of the region
    const r = active;
    for (let s = 0; s < r.shots.length && tourRunning && activeDef === r.def; s++){
      shotIndex = s;
      shots.play(r.shots[s]);
      await waitForShot();
    }
  }
  if (tourRunning) stopTour();
}
function stopTour(){
  tourRunning = false;
  if (mode === 'tour') mode = 'ambient';
  document.body.classList.remove('letterbox');
  $('#btn-tour').classList.remove('on');
}
function waitForShot(){
  return new Promise(res => {
    const check = () => {
      if (!tourRunning || shots.done) return res();
      requestAnimationFrame(check);
    };
    check();
  });
}

// regions with more than one look (Helm's Deep: dusk / night storm)
function setMood(name, snap = false){
  if (!active || !active.setMood) return;
  const grade = active.setMood(name);
  post.setGrade(grade || active.grade || {});
  renderer.toneMappingExposure = active.exposure ?? 1.0;
  if (snap) post.snapGrade();
  const b = $('#btn-mood');
  if (b) b.textContent = active.mood === 'night' ? 'Last Light' : 'Night Storm';
}

// ------------------------------------------------------------ interaction --
function setFly(on){
  fly.enabled = on;
  mode = on ? 'fly' : 'ambient';
  if (on){
    stopTour();
    fly.syncFromCamera();
    $('#btn-fly').classList.add('on');
  } else {
    $('#btn-fly').classList.remove('on');
    if (active) shots.play(active.shots[shotIndex % active.shots.length]);
  }
}
// glide from wherever the camera is to a viewpoint, then hand over to flight
const _fwd = new THREE.Vector3();
function glideTo(vp){
  stopTour();
  fly.enabled = false;
  $('#btn-fly').classList.remove('on');
  const p0 = camera.position.clone();
  camera.getWorldDirection(_fwd);
  const l0 = p0.clone().addScaledVector(_fwd, 60);
  const p1 = new THREE.Vector3(...vp.pos), l1 = new THREE.Vector3(...vp.look);
  const dist = p0.distanceTo(p1);
  const mid = p0.clone().lerp(p1, 0.5);
  mid.y = Math.max(mid.y, p0.y, p1.y) + Math.min(120, dist * 0.18);
  shots.play({ pos: [p0.toArray(), mid.toArray(), p1.toArray()],
    look: [l0.toArray(), l0.clone().lerp(l1, 0.6).toArray(), l1.toArray()],
    dur: clamp(dist / 90, 2.2, 6) });
  mode = 'glide';
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const places = $('#places');
function buildPlaces(r){
  places.innerHTML = '';
  places.classList.toggle('show', !!(r && r.viewpoints));
  $('#btn-mood').style.display = r && r.setMood ? '' : 'none';
  if (!r || !r.viewpoints) return;
  const h = document.createElement('div');
  h.className = 'pl-head'; h.textContent = 'Explore';
  places.appendChild(h);
  r.viewpoints.forEach((vp) => {
    const b = document.createElement('button');
    b.textContent = vp.name;
    b.addEventListener('click', () => glideTo(vp));
    places.appendChild(b);
  });
}

const worldMap = initMap({
  regions: REGIONS,
  getCurrent: () => activeDef ? activeDef.id : REGIONS[0].id,
  goto: (id) => {
    const idx = REGIONS.findIndex(r => r.id === id);
    if (idx < 0) return;
    stopTour(); setFly(false);
    gotoRegion(idx);
  },
});
$('#btn-map').addEventListener('click', () => worldMap.toggle());
$('#btn-tour').addEventListener('click', () => tourRunning ? stopTour() : runTour());
$('#btn-fly').addEventListener('click', () => setFly(!fly.enabled));
$('#btn-mood').addEventListener('click', () => setMood(active && active.mood === 'night' ? 'dusk' : 'night'));

window.addEventListener('keydown', (e) => {
  if (worldMap.isOpen() && e.code !== 'KeyM' && e.code !== 'Escape') return;
  if (e.code.startsWith('Digit') || e.code === 'Minus'){
    const n = e.code === 'Minus' ? 10 : (parseInt(e.code.slice(5), 10) + 9) % 10;
    if (n >= REGIONS.length) return;
    stopTour(); setFly(false);
    gotoRegion(n);
  }
  if (e.code === 'KeyN'){ setMood(active && active.mood === 'night' ? 'dusk' : 'night'); }
  if (e.code === 'KeyT'){ tourRunning ? stopTour() : runTour(); }
  if (e.code === 'KeyF'){ setFly(!fly.enabled); }
  if (e.code === 'KeyH'){ document.body.classList.toggle('hidehud'); }
});

// nav
const nav = $('#nav');
REGIONS.forEach((r, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span class="dot"></span><span class="nm">${r.name}</span>`;
  b.addEventListener('click', () => { stopTour(); setFly(false); gotoRegion(i); });
  nav.appendChild(b);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
});

// ------------------------------------------------------------------ loop ---
let last = performance.now();
let halted = false;   // test hook: stop the live loop so captures are exact
function frame(now){
  requestAnimationFrame(frame);
  if (halted) return;
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (frozen) dt = 0;
  clockT += dt * speedScale;

  if (!active) return;
  if (mode === 'fly') fly.update(dt);
  else {
    const finished = shots.update(dt);
    if (finished && mode === 'glide'){ setFly(true); }
    else if (finished && mode === 'ambient'){
      // ambient: cut to the next shot, looping forever
      shotIndex = (shotIndex + 1) % active.shots.length;
      shots.play(active.shots[shotIndex]);
    }
  }
  active.update(clockT, dt * speedScale);
  post.update(clockT, dt || 0.016);
  post.render();
}

// -------------------------------------------------------- deterministic API
window.ME = {
  ready: false,
  regions: REGIONS.map(r => r.id),
  async goto(id, opts = {}){
    const idx = REGIONS.findIndex(r => r.id === id);
    if (idx < 0) throw new Error('unknown region ' + id);
    stopTour(); setFly(false);
    await gotoRegion(idx, Object.assign({ fast: true, snap: true, title: false }, opts));
    return true;
  },
  shotCount(){ return active ? active.shots.length : 0; },
  setShot(i, t01 = 0.5){
    if (!active) return;
    shotIndex = i % active.shots.length;
    shots.setAt(active.shots[shotIndex], t01);
  },
  freeze(v = true){ frozen = v; },
  setTime(t){ clockT = t; if (active){ active.update(clockT, 0.016); } },
  render(){
    if (active){ active.update(clockT, 0); post.update(clockT, 0.016); post.render(); }
  },
  hideHud(v = true){ document.body.classList.toggle('hidehud', v); },
  setCam(px2, py2, pz2, lx, ly, lz){
    stopTour(); fly.enabled = false; mode = 'free';
    shots.playing = false;
    camera.position.set(px2, py2, pz2);
    camera.lookAt(lx, ly, lz);
  },
  showMap(v = true){ v ? worldMap.show() : worldMap.hide(); },
  heightAt(x, z){ return active && active.heightAt ? active.heightAt(x, z) : 0; },
  letterbox(v = true){ document.body.classList.toggle('letterbox', v); },
  setMood(name){ setMood(name, true); },
  halt(v = true){ halted = v; },
  _cam(){ return camera.position; },
  capture(type = 'image/jpeg', q = 0.9){
    if (active){ active.update(clockT, 0); post.update(clockT, 0.016); post.render(); }
    return renderer.domElement.toDataURL(type, q);
  },
  info(){
    let tris = 0, meshes = 0;
    const top = [];
    if (active) active.scene.traverseVisible(o => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      tris += n; meshes++;
      top.push([Math.round(n), (o.isInstancedMesh ? 'inst×' + o.count : '') + ' ' + g.type + ' ' + o.material.type]);
    });
    top.sort((a, b) => b[0] - a[0]);
    return { meshes, tris: Math.round(tris), top: top.slice(0, 10), calls: renderer.info.render.calls,
      stats: active && active.stats, mood: active && active.mood };
  },
};

// ------------------------------------------------------------------ boot ---
(async function boot(){
  lfill.style.width = '10%';
  // index.html#helmsdeep (or any region id) opens straight into that region
  const fromHash = REGIONS.findIndex(r => r.id === location.hash.slice(1));
  await gotoRegion(Math.max(0, fromHash), { snap: true });
  window.ME.ready = true;
  requestAnimationFrame(frame);
})();
