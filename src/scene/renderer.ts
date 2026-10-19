import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { GroundInfo, TimeOfDay } from '../data/grounds';
import { FIELD_CENTER_Z } from '../game/constants';

export function createRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Sky, sun or floodlights, image-based lighting from the sky, and a bloom
 * pass for floodlight glare at night.
 */
export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
  const sky = new Sky();
  sky.scale.setScalar(5000);
  scene.add(sky);
  const u = sky.material.uniforms;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null;

  // Daytime sky: a real photographed sky (Poly Haven, CC0) for the background
  // and the lighting. It streams in after start-up; until then, and at night,
  // the generated sky is used.
  let photoSky: THREE.DataTexture | null = null;
  let photoEnv: THREE.WebGLRenderTarget | null = null;
  let current: { info: GroundInfo; time: TimeOfDay } | null = null;
  new HDRLoader().load(
    `${import.meta.env.BASE_URL}hdri/day_sky.hdr`,
    (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      photoSky = tex;
      photoEnv = pmrem.fromEquirectangular(tex);
      if (current) api.apply(current.info, current.time);
    },
    undefined,
    (err) => console.warn('Photo sky unavailable; using the generated sky', err),
  );

  const sun = new THREE.DirectionalLight(0xfff2de, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const s = sun.shadow.camera;
  s.left = -55;
  s.right = 55;
  s.top = 55;
  s.bottom = -55;
  s.near = 10;
  s.far = 320;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0, FIELD_CENTER_Z);
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4d6b32, 0.35);
  scene.add(hemi);
  // Extra floodlight fill from the opposite side at night (no shadows, cheap).
  const fill = new THREE.DirectionalLight(0xeef3ff, 0);
  fill.target.position.set(0, 0, FIELD_CENTER_Z);
  scene.add(fill, fill.target);
  scene.fog = new THREE.Fog(0xc9d8e6, 300, 1600);

  // Multisampled HDR buffer: keeps edges anti-aliased through post-processing.
  const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const sunAt = (elevation: number, azimuth: number) =>
    new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));

  let bloomAllowed = true;
  let night = false;

  const api = {
    composer,
    /** Graphics quality: resolution, shadow detail and floodlight glare. */
    setQuality(q: 'low' | 'medium' | 'high') {
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
      composer.setPixelRatio(renderer.getPixelRatio());
      sun.castShadow = q !== 'low';
      const size = q === 'high' ? 4096 : 2048;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      bloomAllowed = q !== 'low';
      bloom.enabled = night && bloomAllowed;
      const samples = q === 'low' ? 0 : 4;
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        if (rt.samples === samples) continue;
        rt.samples = samples;
        rt.dispose();
      }
      grade.enabled = q !== 'low';
    },
    apply(info: GroundInfo, time: TimeOfDay) {
      current = { info, time };
      night = time === 'night';
      const d = info.sky.day;
      const usePhoto = time === 'day' && photoSky !== null && photoEnv !== null;
      sky.visible = !usePhoto;
      scene.background = usePhoto ? photoSky : null;
      if (usePhoto) {
        // Turn the photo so its sun sits at this ground's sun bearing; the sunlight
        // (and so every shadow) then comes from exactly where the sun is in the sky.
        const turn = THREE.MathUtils.degToRad(d.azimuth - PHOTO_SUN.azimuth);
        scene.backgroundRotation.set(0, turn, 0);
        scene.environmentRotation.set(0, turn, 0);
        const dir = sunAt(PHOTO_SUN.elevation, d.azimuth);
        sun.color.setHex(0xfff4e2);
        sun.intensity = d.sun;
        sun.position.copy(dir).multiplyScalar(140).add(new THREE.Vector3(0, 0, FIELD_CENTER_Z));
        hemi.color.setHex(0xcfe3ff);
        hemi.groundColor.setHex(0x4d6b32);
        hemi.intensity = 0.2;
        fill.intensity = 0;
        renderer.toneMappingExposure = d.exposure;
        (scene.fog as THREE.Fog).color.setHex(d.fog);
        scene.backgroundIntensity = 1;
        scene.environmentIntensity = 0.5;
        bloom.enabled = false;
        grade.uniforms.saturation.value = 1.08;
        grade.uniforms.vignette.value = 0.3;
        grade.uniforms.warmth.value = 0.02;
        scene.environment = photoEnv!.texture;
        return;
      }
      scene.backgroundRotation.set(0, 0, 0);
      scene.environmentRotation.set(0, 0, 0);
      if (time === 'day') {
        u.turbidity.value = d.turbidity;
        u.rayleigh.value = d.rayleigh;
        u.mieCoefficient.value = 0.004;
        u.mieDirectionalG.value = 0.82;
        const dir = sunAt(d.elevation, d.azimuth);
        u.sunPosition.value.copy(dir);
        sun.color.setHex(0xfff2de);
        sun.intensity = d.sun;
        sun.position.copy(dir).multiplyScalar(140).add(new THREE.Vector3(0, 0, FIELD_CENTER_Z));
        hemi.color.setHex(0xcfe3ff);
        hemi.groundColor.setHex(0x4d6b32);
        hemi.intensity = 0.35;
        fill.intensity = 0;
        renderer.toneMappingExposure = d.exposure;
        (scene.fog as THREE.Fog).color.setHex(d.fog);
        scene.environmentIntensity = 0.55;
        // The bright HDR sky would bloom into haze; glare is for floodlights only.
        bloom.enabled = false;
        grade.uniforms.saturation.value = 1.12;
        grade.uniforms.vignette.value = 0.32;
        grade.uniforms.warmth.value = 0.025;
      } else {
        // Twilight-blue sky just after sunset; floodlights do the work.
        u.turbidity.value = 1.5;
        u.rayleigh.value = 0.4;
        u.mieCoefficient.value = 0.002;
        u.sunPosition.value.copy(sunAt(-6, d.azimuth));
        sun.color.setHex(0xf2f5ff);
        sun.intensity = 2.4;
        sun.position.set(-60, 120, FIELD_CENTER_Z + 40);
        fill.intensity = 1.1;
        fill.position.set(70, 100, FIELD_CENTER_Z - 50);
        hemi.color.setHex(0x34476e);
        hemi.groundColor.setHex(0x1b2a16);
        hemi.intensity = 0.4;
        renderer.toneMappingExposure = 1.0;
        (scene.fog as THREE.Fog).color.setHex(0x0d1526);
        scene.environmentIntensity = 0.25;
        bloom.enabled = bloomAllowed;
        bloom.strength = 0.75;
        bloom.threshold = 0.82;
        bloom.radius = 0.5;
        grade.uniforms.saturation.value = 1.08;
        grade.uniforms.vignette.value = 0.45;
        grade.uniforms.warmth.value = -0.015;
      }
      // Re-bake image-based lighting from the new sky.
      const eu = envSky.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) eu[k].value = u[k].value;
      eu.sunPosition.value.copy(u.sunPosition.value);
      envRT?.dispose();
      envRT = pmrem.fromScene(envScene, 0.02);
      scene.environment = envRT.texture;
    },
    resize(w: number, h: number) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
  };
  return api;
}

/**
 * Where the sun is in public/hdri/day_sky.hdr (kloofendal_48d_partly_cloudy_puresky),
 * measured from its brightest pixel: degrees above the horizon, and bearing
 * from +z towards +x in three.js's equirectangular layout.
 */
const PHOTO_SUN = { elevation: 47.9, azimuth: 55.8 };

/** Broadcast-style finish: a touch of contrast and saturation, warmth and a soft vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.1 },
    contrast: { value: 1.06 },
    warmth: { value: 0.02 },
    vignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float warmth;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(warmth, warmth * 0.3, -warmth);
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
