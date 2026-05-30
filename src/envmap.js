import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
fallback.needsUpdate = true;

export const fallbackEnvMap = fallback;

const HDR_URLS = [
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/equirectangular/venice_sunset_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/forest_slope_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/urban_alley_01_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/christmas_photo_studio_04_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/mossy_forest_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/neon_photostudio_1k.hdr',
];

const textures = new Array(HDR_URLS.length).fill(fallback);

let currentTime = 0;

function smoothstep(e0, e1, x) {
  const v = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return v * v * (3 - 2 * v);
}

export function initEnvMap() {
  const loader = new RGBELoader();
  HDR_URLS.forEach((url, i) => {
    loader.load(url,
      (tex) => { textures[i] = tex; },
      undefined,
      (err) => { console.error(`HDR[${i}] load failed:`, err); }
    );
  });
}

export function updateEnvMap(phase, time) {
  currentTime = time;
}

export function getEnvUniforms() {
  const interval = 5.0;
  const slot     = Math.floor(currentTime / interval);
  const curr     = slot % textures.length;
  const next     = (slot + 1) % textures.length;
  const blend    = smoothstep(0.3, 1.0, (currentTime % interval) / interval);
  return { envMap: textures[curr], envMapNext: textures[next], envBlend: blend };
}
