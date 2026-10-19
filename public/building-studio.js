import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { newBuilding, validateBuilding, buildBuilding, footprintBounds, isRectangle } from './building-geometry.js';

const get = (id) => document.getElementById(id);
const svg = get('floorplan');
const canvas = get('building-view');
const status = get('building-status');
const openingList = get('opening-list');
let building = newBuilding();
let selectedVertex = 0;
let selectedEdge = 0;
let selectedOpening = -1;
let dragIndex = -1;
let redrawPending = false;
let currentGroup = null;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x192129);
const environment = new THREE.PMREMGenerator(renderer);
const studio = new RoomEnvironment();
scene.environment = environment.fromScene(studio).texture;
studio.dispose();
environment.dispose();

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const sun = new THREE.DirectionalLight(0xfff2df, 3.1);
sun.position.set(-8, 15, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -22;
sun.shadow.camera.right = sun.shadow.camera.top = 22;
scene.add(sun);
const grid = new THREE.GridHelper(70, 70, 0x476071, 0x304050);
scene.add(grid);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(12, 10, 15);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 1.6;
controls.maxDistance = 100;
controls.target.set(0, 3, 0);
controls.update();

const materials = {
  wall: new THREE.MeshStandardMaterial({ name: 'Lime plaster', color: 0xd4c5aa, roughness: 0.93, side: THREE.DoubleSide }),
  stone: new THREE.MeshStandardMaterial({ name: 'Masonry foundation', color: 0x928f80, roughness: 0.94, side: THREE.DoubleSide }),
  timber: new THREE.MeshStandardMaterial({ name: 'Oak timbers', color: 0x66402b, roughness: 0.83, side: THREE.DoubleSide }),
  roof: new THREE.MeshStandardMaterial({ name: 'Reed thatch', color: 0xb39a62, roughness: 0.94, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({
    name: 'Window glazing', color: 0x8bb8c0, roughness: 0.2,
    metalness: 0, transparent: true, opacity: 0.52, side: THREE.DoubleSide,
  }),
};

const loader = new THREE.TextureLoader();
const images = [];
async function applyPbrMaterial(material, materialId, repeat = 1) {
  const response = await fetch('/api/textures/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ material: materialId, size: 256 }),
  });

  if (!response.ok) throw new Error('Failed to generate ' + materialId);
  const { maps } = await response.json();

  for (const [name, slot] of [['albedo', 'map'], ['normal', 'normalMap'], ['roughness', 'roughnessMap']]) {
    if (!maps[name]) continue;

    const texture = await loader.loadAsync('data:image/png;base64,' + maps[name]);
    texture.name = materialId + ':' + name;
    texture.colorSpace = name === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material[slot] = texture;
    images.push(texture);
  }

  material.color.set(0xffffff);
  material.needsUpdate = true;
}

const materialsReady = Promise.allSettled([
  applyPbrMaterial(materials.roof, 'roof-thatch'),
  applyPbrMaterial(materials.timber, 'oak-wood'),
  applyPbrMaterial(materials.stone, 'rubble-stone'),
]).then((results) => {
  if (results.some((result) => result.status === 'rejected')) {
    message('Some PBR maps could not load; preview uses fallback colors.');
  }
});

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((object) => object.geometry?.dispose());
  group.parent?.remove(group);
}

function frameCamera() {
  const box = new THREE.Box3().setFromObject(currentGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 1.4 + 2;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius, radius * 0.75, radius));
  controls.update();
}

function updateBuilding(fitCamera = false) {
  const error = validateBuilding(building);
  get('export-glb').disabled = Boolean(error);

  if (error) {
    message(error, true);
    return;
  }

  try {
    const next = buildBuilding(building, materials);
    next.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    disposeGroup(currentGroup);
    currentGroup = next;
    scene.add(currentGroup);
    const bounds = footprintBounds(building.footprint);
    grid.position.set((bounds.minX + bounds.maxX) / 2, -0.05,
      (bounds.minZ + bounds.maxZ) / 2);
    if (fitCamera) frameCamera();

    let count = 0;
    currentGroup.traverse((obj) => { if (obj.isMesh) count++; });
    get('mesh-count').textContent = count + ' geometry parts';
    message('Valid building · GLB and editable JSON available');
  } catch (err) {
    message(err.message, true);
    get('export-glb').disabled = true;
  }
}

function queueUpdate() {
  if (redrawPending) return;
  redrawPending = true;
  requestAnimationFrame(() => {
    redrawPending = false;
    updateBuilding();
  });
}

const svgNS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes = {}, parent = svg) {
  const element = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  parent.append(element);
  return element;
}

function coordinate(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());

  return {
    x: Math.round(local.x * 4) / 4,
    z: Math.round(local.y * 4) / 4,
  };
}

function refreshPlan() {
  svg.replaceChildren();
  const pts = building.footprint;
  const b = footprintBounds(pts);
  const margin = 2.5;
  const minX = Math.floor(b.minX - margin);
  const minZ = Math.floor(b.minZ - margin);
  const width = Math.ceil(b.maxX + margin) - minX;
  const height = Math.ceil(b.maxZ + margin) - minZ;

  svg.setAttribute('viewBox', [minX, minZ, width, height].join(' '));
  const grid = svgElement('g', { opacity: 0.35 });
  for (let x = minX; x <= minX + width; x++) {
    svgElement('line', { x1: x, y1: minZ, x2: x, y2: minZ + height,
      stroke: '#5d7080', 'stroke-width': 0.016 }, grid);
  }
  for (let z = minZ; z <= minZ + height; z++) {
    svgElement('line', { x1: minX, y1: z, x2: minX + width, y2: z,
      stroke: '#5d7080', 'stroke-width': 0.016 }, grid);
  }

  svgElement('polygon', {
    points: pts.map((p) => p.x + ',' + p.z).join(' '),
    fill: '#40505e', 'fill-opacity': 0.8,
  });

  pts.forEach((a, index) => {
    const b = pts[(index + 1) % pts.length];
    const coords = { x1: a.x, y1: a.z, x2: b.x, y2: b.z };
    svgElement('line', {
      ...coords,
      class: 'wall-line' + (index === selectedEdge ? ' selected' : ''),
    });
    const line = svgElement('line', { ...coords, class: 'wall-hit' });
    line.addEventListener('click', () => {
      selectedEdge = index;
      selectedVertex = -1;
      refreshPlan();
    });
    const label = svgElement('text', {
      x: (a.x + b.x) / 2,
      y: (a.z + b.z) / 2 - 0.2,
      'text-anchor': 'middle', fill: '#dae4ed', 'font-size': 0.24,
      'pointer-events': 'none',
    });
    label.textContent = String(index + 1);
  });

  building.openings.forEach((opening, index) => {
    const a = pts[opening.edge], b = pts[(opening.edge + 1) % pts.length];
    const cx = a.x + (b.x - a.x) * opening.at;
    const cz = a.z + (b.z - a.z) * opening.at;
    const marker = svgElement(opening.type === 'door' ? 'rect' : 'circle',
      opening.type === 'door'
        ? { x: cx - 0.14, y: cz - 0.14, width: 0.28, height: 0.28,
            class: 'door-marker' }
        : { cx, cy: cz, r: 0.15, class: 'window-marker' });
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedOpening = index;
      selectedEdge = opening.edge;
      refreshOpeningEditor();
      refreshPlan();
    });
  });

  pts.forEach((p, index) => {
    const handle = svgElement('circle', {
      cx: p.x, cy: p.z, r: 0.15,
      class: 'vertex' + (index === selectedVertex ? ' selected' : ''),
    });

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectedVertex = index;
      selectedEdge = index;
      dragIndex = index;
      handle.setPointerCapture(event.pointerId);
      refreshPlanOnRelease = false;
    });
    handle.addEventListener('pointermove', (event) => {
      if (dragIndex !== index) return;
      const next = coordinate(event);
      building.footprint[index] = next;
      handle.setAttribute('cx', next.x);
      handle.setAttribute('cy', next.z);
      // Redrawing removes active pointer capture; defer it until release.
      refreshPlanOnRelease = true;
      queueUpdate();
    });
    handle.addEventListener('pointerup', () => {
      dragIndex = -1;
      if (refreshPlanOnRelease) {
        if (building.roof.type === 'gable' && !isRectangle(building.footprint)) {
          building.roof.type = 'shed';
          syncInputs();
        }
        refreshPlan();
        queueUpdate();
      } else {
        refreshPlan();
      }
    });
    handle.addEventListener('lostpointercapture', () => {
      dragIndex = -1;
    });
  });
}

let refreshPlanOnRelease = false;

function syncInputs() {
  for (const element of document.querySelectorAll('[data-prop]')) {
    const path = element.dataset.prop.split('.');
    let value = building;
    for (const key of path) value = value[key];
    if (element.type === 'checkbox') element.checked = value;
    else element.value = value;
  }
}

for (const input of document.querySelectorAll('[data-prop]')) {
  input.addEventListener('change', () => {
    const path = input.dataset.prop.split('.');
    let target = building;
    for (const key of path.slice(0, -1)) target = target[key];
    const value = input.type === 'checkbox' ? input.checked :
      input.type === 'number' ? Number(input.value) : input.value;
    target[path.at(-1)] = value;
    refreshPlan();
    refreshOpeningEditor();
    updateBuilding();
  });
}

function refreshOpeningEditor() {
  openingList.replaceChildren();
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = 'Choose a door or window';
  openingList.add(none);
  building.openings.forEach((opening, index) => {
    const item = document.createElement('option');
    item.value = index;
    item.textContent = (index + 1) + ' · ' + opening.type +
      ' · wall ' + (opening.edge + 1) + ', floor ' + (opening.floor + 1);
    openingList.add(item);
  });
  if (selectedOpening >= building.openings.length) selectedOpening = -1;
  openingList.value = String(selectedOpening);

  const opening = building.openings[selectedOpening];
  get('opening-editor').hidden = !opening;
  if (!opening) return;

  get('opening-floor').value = opening.floor + 1;
  get('opening-floor').max = building.floors;
  get('opening-at').value = Math.round(opening.at * 100);
  get('opening-width').value = opening.width;
  get('opening-height').value = opening.height;
  get('opening-sill').value = opening.sill;
  get('opening-sill').disabled = opening.type === 'door';
}

openingList.addEventListener('change', () => {
  selectedOpening = Number(openingList.value);
  refreshOpeningEditor();
  refreshPlan();
});

const openingFields = {
  'opening-floor': (value) => ['floor', value - 1],
  'opening-at': (value) => ['at', value / 100],
  'opening-width': (value) => ['width', value],
  'opening-height': (value) => ['height', value],
  'opening-sill': (value) => ['sill', value],
};

for (const [id, convert] of Object.entries(openingFields)) {
  get(id).addEventListener('change', () => {
    if (selectedOpening < 0) return;
    const [key, value] = convert(Number(get(id).value));
    building.openings[selectedOpening][key] = value;
    refreshOpeningEditor();
    refreshPlan();
    updateBuilding();
  });
}

function addOpening(type) {
  const error = validateBuilding(building);
  if (error) return message('Fix the building before adding openings: ' + error, true);

  const edge = selectedEdge;
  const width = type === 'door' ? 1.05 : 1.1;
  const candidates = [0.5, 0.27, 0.73, 0.13, 0.87];
  const opening = {
    edge, floor: 0, type, at: 0.5, width,
    height: type === 'door' ? 2.2 : 1.15,
    sill: type === 'door' ? 0 : 0.9,
  };

  for (const at of candidates) {
    opening.at = at;
    building.openings.push({ ...opening });
    if (!validateBuilding(building)) {
      selectedOpening = building.openings.length - 1;
      refreshOpeningEditor();
      refreshPlan();
      updateBuilding();
      return;
    }
    building.openings.pop();
  }

  message('No room on this wall for another opening', true);
}

get('add-door').addEventListener('click', () => addOpening('door'));
get('add-window').addEventListener('click', () => addOpening('window'));
get('remove-opening').addEventListener('click', () => {
  if (selectedOpening < 0) return;
  building.openings.splice(selectedOpening, 1);
  selectedOpening = -1;
  refreshOpeningEditor();
  refreshPlan();
  updateBuilding();
});

get('add-vertex').addEventListener('click', () => {
  if (building.footprint.length >= 32) return;
  const i = selectedEdge;
  const a = building.footprint[i];
  const b = building.footprint[(i + 1) % building.footprint.length];
  const point = {
    x: Math.round((a.x + b.x) * 2) / 4,
    z: Math.round((a.z + b.z) * 2) / 4,
  };

  // Preserve opening-to-wall attachment as an edge is split.
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const openings = building.openings.filter((o) => o.edge === i);
  if (openings.some((o) => o.at * distance - o.width / 2 < distance / 2 + 0.2 &&
    o.at * distance + o.width / 2 > distance / 2 - 0.2)) {
    return message('Move openings away from the split before adding a corner', true);
  }

  building.footprint.splice(i + 1, 0, point);
  for (const o of building.openings) {
    if (o.edge > i) o.edge++;
    else if (o.edge === i) {
      if (o.at >= 0.5) {
        o.edge = i + 1;
        o.at = (o.at - 0.5) * 2;
      } else o.at *= 2;
    }
  }
  selectedVertex = i + 1;
  if (building.roof.type === 'gable') building.roof.type = 'shed';
  syncInputs();
  refreshPlan();
  updateBuilding();
});

get('remove-vertex').addEventListener('click', () => {
  if (selectedVertex < 0 || building.footprint.length <= 3) return;
  const i = selectedVertex;
  const copy = structuredClone(building);
  copy.footprint.splice(i, 1);

  // Deleting a wall with openings requires relocating those elements first.
  if (copy.openings.some((o) => o.edge === i ||
    o.edge === (i + building.footprint.length - 1) % building.footprint.length)) {
    return message('Remove the openings on adjacent walls before deleting a corner', true);
  }
  for (const o of copy.openings) if (o.edge > i) o.edge--;
  if (copy.roof.type === 'gable' && !isRectangle(copy.footprint)) copy.roof.type = 'shed';
  const error = validateBuilding(copy);
  if (error) return message(error, true);
  building = copy;
  selectedVertex = -1;
  selectedEdge = 0;
  syncInputs();
  refreshPlan();
  refreshOpeningEditor();
  updateBuilding();
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

get('save-building').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify(building, null, 2)],
    { type: 'application/json' }), 'building.json');
});

get('load-building').addEventListener('click', () => get('load-file').click());
get('load-file').addEventListener('change', async () => {
  const file = get('load-file').files[0];
  if (!file) return;

  try {
    if (file.size > 150_000) throw new Error('Building JSON is too large');
    const parsed = JSON.parse(await file.text());
    if (parsed.version !== 1) throw new Error('Unsupported building format');
    const error = validateBuilding(parsed);
    if (error) throw new Error(error);

    building = parsed;
    selectedVertex = selectedOpening = -1;
    selectedEdge = 0;
    syncInputs();
    refreshPlan();
    refreshOpeningEditor();
    updateBuilding(true);
  } catch (err) {
    message('Could not load building: ' + err.message, true);
  } finally {
    get('load-file').value = '';
  }
});

get('reset-building').addEventListener('click', () => {
  building = newBuilding();
  selectedVertex = 0;
  selectedEdge = 0;
  selectedOpening = -1;
  syncInputs();
  refreshPlan();
  refreshOpeningEditor();
  updateBuilding(true);
});

get('export-glb').addEventListener('click', async () => {
  const error = validateBuilding(building);
  if (error) return message(error, true);

  const button = get('export-glb');
  button.disabled = true;
  message('Preparing PBR materials and GLB…');

  try {
    await materialsReady;
    const exportGroup = buildBuilding(building, materials);
    const buffer = await new GLTFExporter().parseAsync(exportGroup, { binary: true });
    disposeGroup(exportGroup);
    const filename = (building.name || 'building')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'building';
    downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), filename + '.glb');
    message('Exported ' + filename + '.glb');
  } catch (err) {
    message('GLB export failed: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
});

const observer = new ResizeObserver(() => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
observer.observe(canvas);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

syncInputs();
refreshPlan();
refreshOpeningEditor();
updateBuilding(true);
