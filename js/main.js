// main.js — bootstraps the renderer, owns the region lifecycle, the grand
// tour, free flight, HUD, and the deterministic ME API used for testing.
import * as THREE from 'three';
import { makePost } from './engine/post.js';
import { ShotPlayer, FreeFly } from './engine/cinematics.js';

import shire from './regions/shire.js';
import bree from './regions/bree.js';
import rivendell from './regions/rivendell.js';
import caradhras from './regions/caradhras.js';
import moria from './regions/moria.js';
import lothlorien from './regions/lothlorien.js';
import rohan from './regions/rohan.js';
import isengard from './regions/isengard.js';
import minastirith from './regions/minastirith.js';
import mordor from './regions/mordor.js';

const REGIONS = [shire, bree, rivendell, caradhras, moria, lothlorien, rohan, isengard, minastirith, mordor];

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
async function buildRegion(def){
  if (built.has(def.id)) return built.get(def.id);
  lfill.style.width = '30%';
  await nextFrame();
  const ctx = { THREE, renderer, camera };
  const r = def.build(ctx);
  r.def = def;
  // safety rail: no dolly position may ever dip below the terrain
  if (r.heightAt){
    for (const shot of r.shots){
      for (const p of shot.pos){
        p[1] = Math.max(p[1], r.heightAt(p[0], p[2]) + 2.2);
      }
    }
  }
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
  if (opts.snap) post.snapGrade();
  shots.play(r.shots[0]);
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
$('#btn-tour').addEventListener('click', () => tourRunning ? stopTour() : runTour());
$('#btn-fly').addEventListener('click', () => setFly(!fly.enabled));

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')){
    const n = (parseInt(e.code.slice(5), 10) + 9) % 10;
    stopTour(); setFly(false);
    gotoRegion(n);
  }
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
function frame(now){
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (frozen) dt = 0;
  clockT += dt * speedScale;

  if (!active) return;
  if (mode === 'fly') fly.update(dt);
  else {
    const finished = shots.update(dt);
    if (finished && mode === 'ambient'){
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
  letterbox(v = true){ document.body.classList.toggle('letterbox', v); },
};

// ------------------------------------------------------------------ boot ---
(async function boot(){
  lfill.style.width = '10%';
  await gotoRegion(0, { snap: true });
  window.ME.ready = true;
  requestAnimationFrame(frame);
})();
