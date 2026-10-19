import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const form = document.getElementById('texture-form');
const materialInput = document.getElementById('material');
const sizeInput = document.getElementById('size');
const inspectMapInput = document.getElementById('inspect-map');
const exportButton = document.getElementById('export-pbr');
const status = document.getElementById('status');
const viewport = document.getElementById('viewport');
const imagePreview = document.getElementById('image-preview');
const tiledPreview = document.getElementById('tiled-preview');
const preview = document.querySelector('.preview');
const viewModeButtons = document.querySelectorAll('[data-preview-mode]');
const tilingInput = document.getElementById('sphere-tiling');
const normalInput = document.getElementById('sphere-normal');
const displacementInput = document.getElementById('sphere-displacement');

const renderer = new THREE.WebGLRenderer({
  canvas: viewport,
  antialias: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2129);

// Broad studio reflections reveal material roughness without baking light into albedo.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const studio = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(studio, 0.04).texture;
studio.dispose();
pmremGenerator.dispose();

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0, 3.4);

const controls = new OrbitControls(camera, viewport);
controls.enableDamping = true;
controls.minDistance = 1.25;
controls.maxDistance = 7;
controls.update();

// Separate frontal, grazing and rim lighting preserves relief and shading.
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a322b, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff2df, 2.25);
keyLight.position.set(3.5, 3, 5);
scene.add(keyLight);

const grazingLight = new THREE.DirectionalLight(0xe6efff, 1.1);
grazingLight.position.set(-4, 1.2, 1);
scene.add(grazingLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.75);
rimLight.position.set(0, -1, -4);
scene.add(rimLight);

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
  normalScale: new THREE.Vector2(1, 1),
  aoMapIntensity: 0.8,
  envMapIntensity: 0.8,
  // Height must not deform the sphere until explicitly requested.
  // UV-sphere poles distort physical displacement and can mislead material QA.
  displacementScale: 0,
  displacementBias: 0,
});

// Provide a second UV channel for AO workflows as well.
const geometry = new THREE.SphereGeometry(1, 512, 384);
geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());

const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// A flat counterpart separates material-height quality from sphere UV distortion.
const planeGeometry = new THREE.PlaneGeometry(2, 2, 256, 256);
planeGeometry.setAttribute('uv1', planeGeometry.getAttribute('uv').clone());
const plane = new THREE.Mesh(planeGeometry, material);
plane.visible = false;
scene.add(plane);

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
  sphere.visible = mode === 'sphere';
  plane.visible = mode === 'plane';

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
  const tiling = Number(tilingInput.value);
  texture.repeat.set(tiling, tiling);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  texture.needsUpdate = true;

  return texture;
}

let latestRequest = 0;
let pendingGeneration;
let activeRequest;
let previewMaps = null;

// These settings affect only the sphere, never the exported material maps.
function updateSphereSurface() {
  const repeat = Number(tilingInput.value);
  const normalStrength = Number(normalInput.value);
  const geometryDisplacement = Number(displacementInput.value);

  for (const texture of [
    material.map,
    material.normalMap,
    material.roughnessMap,
    material.displacementMap,
    material.aoMap,
  ]) {
    if (texture) {
      texture.repeat.set(repeat, repeat);
      texture.needsUpdate = true;
    }
  }

  material.normalScale.set(normalStrength, normalStrength);
  material.displacementScale = geometryDisplacement;
  material.displacementBias = -geometryDisplacement * 0.5;
}

tilingInput.addEventListener('change', updateSphereSurface);
normalInput.addEventListener('input', updateSphereSurface);
displacementInput.addEventListener('input', updateSphereSurface);

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
    setStatus('Select a material and resolution.');
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
      size: Number(sizeInput.value),
    };

    const { maps } = await requestPreview(options, controller.signal);

    if (requestId !== latestRequest) return;

    const names = ['albedo', 'normal', 'roughness', 'height', 'ao'];
    const results = await Promise.allSettled(names.map((name) =>
      maps[name] ? loadMap(maps[name], name === 'albedo') : Promise.resolve(null)
    ));
    const loaded = results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value);
    const failed = results.find((result) => result.status === 'rejected');

    if (failed || requestId !== latestRequest) {
      for (const texture of loaded) texture.dispose();

      if (failed && requestId === latestRequest) throw failed.reason;

      return;
    }

    const [albedo, normal, roughness, height, ao] = results.map((result) => result.value);
    const previous = [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.displacementMap,
      material.aoMap,
    ];

    material.map = albedo;
    material.normalMap = normal;
    material.roughnessMap = roughness;
    material.displacementMap = height;
    material.aoMap = ao;
    material.needsUpdate = true;
    updateSphereSurface();

    previewMaps = maps;
    showSelectedMap();

    for (const texture of previous) {
      texture?.dispose();
    }

    setStatus('Material ready');
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
    const response = await fetch('/api/textures/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material: 'roof-thatch', size: 2048 }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'PBR export failed');
    }

    const zip = await response.blob();
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'reed-thatch-2k.zip';
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
