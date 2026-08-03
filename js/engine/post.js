// post.js — the film look: bloom, per-region color grade (lift/gamma/gain +
// temperature + saturation), vignette, and fine grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1.0 },
    uTemp: { value: 0.0 },      // -1 cool .. +1 warm
    uVignette: { value: 0.42 },
    uGrain: { value: 0.055 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSat, uTemp, uVignette, uGrain;
    uniform vec2 uRes;
    uniform vec3 uLift, uGamma, uGain;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // temperature
      col.r *= 1.0 + uTemp * 0.12;
      col.b *= 1.0 - uTemp * 0.12;
      // lift gamma gain
      col = pow(max(col * uGain + uLift, vec3(0.0)), 1.0 / max(uGamma, vec3(0.01)));
      // saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // vignette
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette * 2.2;
      col *= clamp(vig, 0.0, 1.0);
      // grain
      float g = (hash(floor(vUv * uRes) + fract(uTime) * 100.0) - 0.5) * uGrain;
      col += g * (0.4 + 0.6 * (1.0 - l));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makePost(renderer, scene, camera){
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.82);
  const grade = new ShaderPass(GradeShader);
  const out = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(out);

  function setSize(w, h, pr){
    composer.setSize(w, h);
    composer.setPixelRatio(pr);
    grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  // Per-region grade presets; values tweened on region change.
  const current = {
    lift: new THREE.Vector3(0, 0, 0), gamma: new THREE.Vector3(1, 1, 1),
    gain: new THREE.Vector3(1, 1, 1), sat: 1, temp: 0,
    bloomStrength: 0.35, bloomRadius: 0.6, bloomThreshold: 0.82,
    grain: 0.045, vignette: 0.42,
  };
  const target = JSON.parse(JSON.stringify({
    lift: [0,0,0], gamma: [1,1,1], gain: [1,1,1], sat: 1, temp: 0,
    bloomStrength: 0.35, bloomRadius: 0.6, bloomThreshold: 0.82,
    grain: 0.045, vignette: 0.42,
  }));

  function setGrade(g){
    Object.assign(target, {
      lift: g.lift || [0, 0, 0], gamma: g.gamma || [1, 1, 1], gain: g.gain || [1, 1, 1],
      sat: g.sat ?? 1, temp: g.temp ?? 0,
      bloomStrength: g.bloom ?? 0.35, bloomRadius: g.bloomRadius ?? 0.6,
      bloomThreshold: g.bloomThreshold ?? 0.82,
      grain: g.grain ?? 0.045, vignette: g.vignette ?? 0.42,
    });
  }
  function snapGrade(){
    current.lift.fromArray(target.lift);
    current.gamma.fromArray(target.gamma);
    current.gain.fromArray(target.gain);
    current.sat = target.sat; current.temp = target.temp;
    current.bloomStrength = target.bloomStrength;
    current.bloomRadius = target.bloomRadius;
    current.bloomThreshold = target.bloomThreshold;
    current.grain = target.grain;
    current.vignette = target.vignette;
  }

  const tv = new THREE.Vector3();
  function update(t, dt){
    const k = Math.min(1, dt * 1.8);
    current.lift.lerp(tv.fromArray(target.lift), k);
    current.gamma.lerp(tv.fromArray(target.gamma), k);
    current.gain.lerp(tv.fromArray(target.gain), k);
    current.sat += (target.sat - current.sat) * k;
    current.temp += (target.temp - current.temp) * k;
    current.bloomStrength += (target.bloomStrength - current.bloomStrength) * k;
    current.bloomRadius += (target.bloomRadius - current.bloomRadius) * k;
    current.bloomThreshold += (target.bloomThreshold - current.bloomThreshold) * k;
    current.grain += (target.grain - current.grain) * k;
    current.vignette += (target.vignette - current.vignette) * k;
    grade.uniforms.uGrain.value = current.grain;
    grade.uniforms.uVignette.value = current.vignette;

    grade.uniforms.uTime.value = t;
    grade.uniforms.uLift.value.copy(current.lift);
    grade.uniforms.uGamma.value.copy(current.gamma);
    grade.uniforms.uGain.value.copy(current.gain);
    grade.uniforms.uSat.value = current.sat;
    grade.uniforms.uTemp.value = current.temp;
    bloom.strength = current.bloomStrength;
    bloom.radius = current.bloomRadius;
    bloom.threshold = current.bloomThreshold;
  }

  return {
    composer, renderPass, setSize, setGrade, snapGrade, update,
    setScene(s){ renderPass.scene = s; },
    render(){ composer.render(); },
  };
}
