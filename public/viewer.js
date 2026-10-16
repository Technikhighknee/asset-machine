import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const form = document.getElementById('texture-form');
const materialInput = document.getElementById('material');
const styleInput = document.getElementById('style');
const seedInput = document.getElementById('seed');
const sizeInput = document.getElementById('size');
const generateButton = document.getElementById('generate');
const status = document.getElementById('status');
const viewport = document.getElementById('viewport');

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
});

const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), material);
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

async function requestPreview(options) {
  const response = await fetch('/api/textures/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
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
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
  }

  texture.needsUpdate = true;

  return texture;
}

async function generate() {
  if (generateButton.disabled) return;

  generateButton.disabled = true;
  setStatus('Generating…');

  try {
    const options = {
      material: materialInput.value,
      style: styleInput.value,
      seed: Number(seedInput.value),
      size: Number(sizeInput.value),
    };

    const { maps } = await requestPreview(options);
    const pixelated = options.style === 'retro-3d';

    const [albedo, normal, roughness] = await Promise.all([
      loadMap(maps.albedo, true, pixelated),
      loadMap(maps.normal, false, pixelated),
      loadMap(maps.roughness, false, pixelated),
    ]);

    const previous = [material.map, material.normalMap, material.roughnessMap];

    material.map = albedo;
    material.normalMap = normal;
    material.roughnessMap = roughness;
    material.needsUpdate = true;

    for (const texture of previous) {
      texture?.dispose();
    }

    setStatus('Seed ' + options.seed);
  } catch (error) {
    setStatus(error.message);
  } finally {
    generateButton.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void generate();
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

    await generate();
  } catch (error) {
    setStatus(error.message);
  }
}

void initialize();
