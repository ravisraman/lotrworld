// fortify.js — a small kit for castle-building: swept wall sections along a
// path (with world-scaled UVs so photographic masonry tiles at true size),
// battlements, textured blocks, lathe towers, and a UV-preserving merge.
import * as THREE from 'three';
import { Path, mulberry32 } from './util.js';

// Merge non-indexed geometries keeping position / normal / uv.
export function mergeUV(list){
  const prepared = list.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv){
      n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    }
    return n;
  });
  let total = 0;
  for (const g of prepared) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]){
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of prepared){ arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// Box whose UVs are scaled to its real dimensions (tile = metres per repeat).
let boxSeed = mulberry32(404);
export function texBox(w, h, d, tile = 4){
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const ox = boxSeed(), oy = boxSeed();
  for (let f = 0; f < 6; f++){
    for (let i = 0; i < 4; i++){
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile + ox, uv.getY(k) * dims[f][1] / tile + oy);
    }
  }
  return g;
}

// Sweep a cross-section along a path.
//   path: [[x,z], ...] (polyline, smoothed by Catmull-Rom), or a Path
//   profile: [{u, y?, v?, ground?}] — u is the offset to the RIGHT of the
//     direction of travel; height is absolute `y`, or `v` above opts.baseY(s),
//     or ground: true → heightAt(x,z) + (dy || 0).
//   opts: {heightAt, step, tile, baseY(s01) -> y, closed}
// Each profile segment is its own strip, so corners stay crisp while the
// surface stays smooth along the run.
export function sweep(path, profile, opts = {}){
  const o = Object.assign({ heightAt: () => 0, step: 2, tile: 5, baseY: () => 0, closed: false }, opts);
  const P = path instanceof Path ? path
    : new Path(path.map(p => [p[0], 0, p[1]]), o.closed);
  const n = Math.max(2, Math.ceil(P.length / o.step) + 1);
  const pts = [], rights = [], dist = [];
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i < n; i++){
    const t = o.closed ? i / (n - 1) : i / (n - 1);
    P.at(t, tmp); P.tangent(t, tan);
    tan.y = 0; tan.normalize();
    pts.push(tmp.clone());
    rights.push(new THREE.Vector3(-tan.z, 0, tan.x)); // right of travel
    dist.push(t * P.length);
  }
  const at = (i, pr) => {
    const p = pts[i], r = rights[i];
    const x = p.x + r.x * pr.u, z = p.z + r.z * pr.u;
    let y;
    if (pr.ground) y = o.heightAt(x, z) + (pr.dy || 0);
    else if (pr.y !== undefined) y = pr.y;
    else y = o.baseY(dist[i] / P.length, x, z) + pr.v;
    return [x, y, z];
  };
  const strips = [];
  let vAcc = 0;
  for (let s = 0; s < profile.length - 1; s++){
    const a = profile[s], b = profile[s + 1];
    const pos = [], uv = [], idx = [];
    // nominal segment length for v-coordinates
    const A0 = at(0, a), B0 = at(0, b);
    const segLen = Math.hypot(A0[0] - B0[0], A0[1] - B0[1], A0[2] - B0[2]);
    for (let i = 0; i < n; i++){
      const A = at(i, a), B = at(i, b);
      pos.push(...A, ...B);
      const u = dist[i] / o.tile;
      uv.push(u, vAcc / o.tile, u, (vAcc + segLen) / o.tile);
    }
    for (let i = 0; i < n - 1; i++){
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    vAcc += segLen;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    strips.push(g);
  }
  const geo = mergeUV(strips);
  return { geo, path: P, frame: (t01) => {
    const p = P.at(t01, new THREE.Vector3());
    const tg = P.tangent(t01, new THREE.Vector3()); tg.y = 0; tg.normalize();
    return { p, tangent: tg, right: new THREE.Vector3(-tg.z, 0, tg.x) };
  } };
}

// Battlements along a path: merlons of size (w,h,d) every `spacing`, at
// lateral offset u, standing on height y(t01).
export function battlements(P, o){
  const c = Object.assign({ spacing: 2.4, w: 1.35, h: 1.1, d: 1.0, u: 0, y: () => 0, tile: 4, skip: () => false, cap: 0 }, o);
  const n = Math.floor(P.length / c.spacing);
  const geos = [];
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++){
    const t = (i + 0.5) / n;
    if (c.skip(t)) continue;
    P.at(t, tmp); P.tangent(t, tan); tan.y = 0; tan.normalize();
    const right = new THREE.Vector3(-tan.z, 0, tan.x);
    let g = texBox(c.w, c.h, c.d, c.tile);
    if (c.cap){
      // a low pyramid weathering the top, as on the Hornburg's merlons
      const cap = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(c.w, c.cap, c.d);
      cap.translate(0, c.h / 2 + c.cap / 2, 0);
      g = mergeUV([g, cap]);
    }
    q.setFromAxisAngle(up, Math.atan2(tan.x, tan.z) + Math.PI / 2);
    m.compose(new THREE.Vector3(tmp.x + right.x * c.u, c.y(t) + c.h / 2, tmp.z + right.z * c.u), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    geos.push(g);
  }
  return geos;
}

// Lathe tower from a radius profile [[r, y], ...] with `sides` facets.
export function latheTower(profile, sides = 12, tile = 5){
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides);
  // scale uvs to metres: u around the circumference, v along the profile
  let len = 0;
  for (let i = 1; i < profile.length; i++){
    len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
  }
  const rMax = Math.max(...profile.map(p => p[0]));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++){
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * rMax / tile, uv.getY(i) * len / tile);
  }
  g.computeVertexNormals();
  return g;
}

// A gabled roof (two slopes + ridge) for a w×d building, ridge along z.
export function gableRoof(w, d, rise, over = 0.6, thick = 0.3, tile = 3){
  const half = w / 2 + over;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const geos = [];
  for (const s of [-1, 1]){
    const g = texBox(slope, thick, d + over * 2, tile);
    g.rotateZ(s * -ang);
    g.translate(s * half / 2, rise / 2, 0);
    geos.push(g);
  }
  return geos;
}
