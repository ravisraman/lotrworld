// terrain.js — vertex-painted heightfield terrain. Each region supplies a
// height function and a palette function; we tessellate finely, bake color
// with slope/height/noise breakup, and hand back a ground-snap helper that
// every walking character uses.
import * as THREE from 'three';
import { fbm, clamp } from './util.js';

export function makeTerrain(opts){
  const o = Object.assign({
    size: 1200, res: 256,
    height: (x, z) => 0,
    // paint(x,z,h,slope) -> THREE.Color
    paint: null,
    roughness: 0.95, metalness: 0.0,
    receiveShadow: true, castShadow: false,
  }, opts);

  const geo = new THREE.PlaneGeometry(o.size, o.size, o.res, o.res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const N = pos.count;

  for (let i = 0; i < N; i++){
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, o.height(x, z));
  }
  geo.computeVertexNormals();

  const colors = new Float32Array(N * 3);
  const nrm = geo.attributes.normal;
  const c = new THREE.Color();
  for (let i = 0; i < N; i++){
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const slope = 1 - nrm.getY(i); // 0 flat, ~1 cliff
    if (o.paint) o.paint(x, z, h, slope, c);
    else c.setRGB(0.35, 0.4, 0.28);
    // subtle luminance breakup so large fields never look flat-shaded
    const n = fbm(x * 0.05 + 31, z * 0.05 + 17, 3) - 0.5;
    const m = 1 + n * 0.22;
    colors[i * 3] = c.r * m; colors[i * 3 + 1] = c.g * m; colors[i * 3 + 2] = c.b * m;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: o.roughness, metalness: o.metalness,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = o.receiveShadow;
  mesh.castShadow = o.castShadow;

  return {
    mesh,
    heightAt: (x, z) => o.height(x, z),
    size: o.size,
  };
}

// Convenience painter helpers -----------------------------------------------
export function bandPaint(bands){
  // bands: sorted [{upTo, color, slopeColor?}] by height
  const cols = bands.map(b => ({
    upTo: b.upTo,
    c: new THREE.Color(b.color),
    s: b.slopeColor ? new THREE.Color(b.slopeColor) : null,
    slopeAt: b.slopeAt ?? 0.35,
  }));
  const tmp = new THREE.Color();
  return (x, z, h, slope, out) => {
    let band = cols[cols.length - 1];
    let prev = null;
    for (let i = 0; i < cols.length; i++){
      if (h <= cols[i].upTo){ band = cols[i]; prev = cols[i - 1] || null; break; }
      prev = cols[i];
    }
    out.copy(band.c);
    if (prev){
      // blend across band boundary for soft transitions
      const span = (band.upTo - (prev.upTo ?? band.upTo)) || 1;
      const t = clamp((band.upTo - h) / span, 0, 1);
      if (t > 0.75) out.lerp(prev.c, (t - 0.75) * 2.5 * 0.5);
    }
    if (band.s && slope > band.slopeAt){
      tmp.copy(band.s);
      out.lerp(tmp, clamp((slope - band.slopeAt) * 3, 0, 1));
    }
  };
}
