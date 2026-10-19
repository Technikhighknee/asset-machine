import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const form = document.getElementById('texture-form');
const materialInput = document.getElementById('material');
const seedInput = document.getElementById('seed');
const sizeInput = document.getElementById('size');
const inspectMapInput = document.getElementById('inspect-map');
const exportButton = document.getElementById('export-pbr');
const newSeedButton = document.getElementById('new-seed');
const status = document.getElementById('status');
const viewport = document.getElementById('viewport');
const imagePreview = document.getElementById('image-preview');
const tiledPreview = document.getElementById('tiled-preview');
const preview = document.querySelector('.preview');
const viewModeButtons = document.querySelectorAll('[data-preview-mode]');

const renderer = new THREE.WebGLRenderer({
  canvas: viewport,
  antialias: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171a);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 3.25);

const controls = new OrbitControls(camera, viewport);
controls.enableDamping = true;
controls.minDistance = 1.6;
controls.maxDistance = 7;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6e7583, 1.8));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
fillLight.position.set(-4, 1, -3);
scene.add(fillLight);

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
  displacementScale: 0.045,
  displacementBias: -0.0225,
});

const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 384), material);
scene.add(sphere);

const textureLoader = new THREE.TextureLoader();

new ResizeObserver(() => {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) return;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}).observe(viewport);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

function setPreviewMode(mode) {
  preview.classList.toggle('image-mode', mode === 'image');

  for (const button of viewModeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.previewMode === mode));
  }
}

for (const button of viewModeButtons) {
  button.addEventListener('click', () => setPreviewMode(button.dataset.previewMode));
}

function setStatus(message) {
  status.textContent = message;
}

function fillSelect(select, items) {
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.add(option);
  }
}

async function requestPreview(options, signal) {
  const response = await fetch('/api/textures/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Texture generation failed');
  }

  return response.json();
}

async function loadMap(base64, isColor) {
  const texture = await textureLoader.loadAsync('data:image/png;base64,' + base64);

  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  texture.needsUpdate = true;

  return texture;
}

let latestRequest = 0;
let pendingGeneration;
let activeRequest;
let previewMaps = null;

function showSelectedMap() {
  if (!previewMaps) return;

  const key = inspectMapInput.value;
  const image = previewMaps[key] || previewMaps.albedo;
  const url = 'data:image/png;base64,' + image;

  imagePreview.src = url;
  imagePreview.alt = key + ' texture preview';
  tiledPreview.style.backgroundImage = 'url("' + url + '")';
}

inspectMapInput.addEventListener('change', showSelectedMap);

function updatePreview(delay = 0) {
  clearTimeout(pendingGeneration);
  latestRequest++;
  activeRequest?.abort();

  if (!form.checkValidity()) {
    setStatus('Select valid options and enter a seed from 0 to 4294967295.');
    return;
  }

  const requestId = latestRequest;

  setStatus('Generating…');

  pendingGeneration = setTimeout(() => {
    void generate(requestId);
  }, delay);
}

async function generate(requestId) {
  const controller = new AbortController();
  activeRequest = controller;

  try {
    const options = {
      material: materialInput.value,
      seed: Number(seedInput.value),
      size: Number(sizeInput.value),
    };

    const { maps } = await requestPreview(options, controller.signal);

    if (requestId !== latestRequest) return;

    const results = await Promise.allSettled([
      loadMap(maps.albedo, true),
      loadMap(maps.normal, false),
      loadMap(maps.roughness, false),
      loadMap(maps.height, false),
    ]);

    const loaded = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    const failed = results.find((result) => result.status === 'rejected');

    if (failed || requestId !== latestRequest) {
      for (const texture of loaded) texture.dispose();

      if (failed && requestId === latestRequest) throw failed.reason;

      return;
    }

    const [albedo, normal, roughness, height] = loaded;
    const previous = [material.map, material.normalMap, material.roughnessMap, material.displacementMap];

    material.map = albedo;
    material.normalMap = normal;
    material.roughnessMap = roughness;
    material.displacementMap = height;
    material.needsUpdate = true;

    previewMaps = maps;
    showSelectedMap();

    for (const texture of previous) {
      texture?.dispose();
    }

    setStatus('Seed ' + options.seed);
  } catch (error) {
    if (requestId === latestRequest && error.name !== 'AbortError') {
      setStatus(error.message);
    }
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
    }
  }
}

materialInput.addEventListener('change', () => {
  exportButton.disabled = materialInput.value !== 'roof-thatch';
});

exportButton.addEventListener('click', async () => {
  if (!form.checkValidity() || materialInput.value !== 'roof-thatch') return;

  exportButton.disabled = true;
  setStatus('Exporting 2048 × 2048 PBR maps…');

  try {
    const seed = Number(seedInput.value);
    const response = await fetch('/api/textures/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material: 'roof-thatch', seed, size: 2048 }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'PBR export failed');
    }

    const zip = await response.blob();
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'reed-thatch-2k-' + seed + '.zip';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus('PBR ZIP ready · 2048 × 2048');
  } catch (error) {
    setStatus(error.message);
  } finally {
    exportButton.disabled = materialInput.value !== 'roof-thatch';
  }
});

for (const select of [materialInput, sizeInput]) {
  select.addEventListener('change', () => updatePreview());
}

seedInput.addEventListener('input', () => updatePreview(180));

newSeedButton.addEventListener('click', () => {
  const previous = Number(seedInput.value);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] === previous);

  seedInput.value = String(value[0]);
  updatePreview();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  updatePreview();
});

async function initialize() {
  try {
    const response = await fetch('/api/textures');

    if (!response.ok) {
      throw new Error('Failed to load materials');
    }

    const catalog = await response.json();

    fillSelect(materialInput, catalog.materials);

    materialInput.value = 'roof-thatch';
    exportButton.disabled = false;

    updatePreview();
  } catch (error) {
    setStatus(error.message);
  }
}

void initialize();
