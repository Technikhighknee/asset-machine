import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const form = document.getElementById('texture-form');
const materialInput = document.getElementById('material');
const styleInput = document.getElementById('style');
const seedInput = document.getElementById('seed');
const sizeInput = document.getElementById('size');
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

async function loadMap(base64, isColor, pixelated) {
  const texture = await textureLoader.loadAsync('data:image/png;base64,' + base64);

  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
  }

  texture.needsUpdate = true;

  return texture;
}

let latestRequest = 0;
let pendingGeneration;
let activeRequest;

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
      style: styleInput.value,
      seed: Number(seedInput.value),
      size: Number(sizeInput.value),
    };

    const { maps } = await requestPreview(options, controller.signal);

    if (requestId !== latestRequest) return;

    const pixelated = options.style === 'retro-3d';
    const results = await Promise.allSettled([
      loadMap(maps.albedo, true, pixelated),
      loadMap(maps.normal, false, pixelated),
      loadMap(maps.roughness, false, pixelated),
      loadMap(maps.height, false, pixelated),
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

    const image = 'data:image/png;base64,' + maps.albedo;

    imagePreview.src = image;
    tiledPreview.style.backgroundImage = 'url("' + image + '")';

    imagePreview.classList.toggle('pixelated', pixelated);
    tiledPreview.classList.toggle('pixelated', pixelated);

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

for (const select of [materialInput, styleInput, sizeInput]) {
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
      throw new Error('Failed to load materials and styles');
    }

    const catalog = await response.json();

    fillSelect(materialInput, catalog.materials);
    fillSelect(styleInput, catalog.styles);

    materialInput.value = 'oak-wood';
    styleInput.value = 'stylized-realism';

    updatePreview();
  } catch (error) {
    setStatus(error.message);
  }
}

void initialize();
