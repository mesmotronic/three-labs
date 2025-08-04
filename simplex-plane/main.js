import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createNoise3D } from 'simplex-noise';
import GUI from 'lil-gui';

const config = {
  animationSpeed: 0.1,
  noiseHeight: 0.5,
  noiseZoom: 0.3,
  dotSize: 4,
  spacingX: 1,
  spacingY: 32,
};

const gui = new GUI();
const animFolder = gui.addFolder('Animation');
animFolder.add(config, 'animationSpeed', 0, 1, 0.01).name('Speed');
animFolder.add(config, 'noiseHeight', 0, 5, 0.1).name('Height');
animFolder.add(config, 'noiseZoom', 0.01, 1, 0.01).name('Zoom');

const textureFolder = gui.addFolder('Texture');
textureFolder.add(config, 'dotSize', 1, 10, 1).name('Dot Size').onChange(regenerateTexture);
textureFolder.add(config, 'spacingX', 1, 128, 1).name('Spacing X').onChange(regenerateTexture);
textureFolder.add(config, 'spacingY', 1, 128, 1).name('Spacing Y').onChange(regenerateTexture);

const canvas = document.querySelector('#container');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), window.devicePixelRatio));
renderer.setAnimationLoop(animate);

const camera = new THREE.PerspectiveCamera(75, 2, 0.1, 100);
camera.position.x = 0;
camera.position.y = 5;
camera.position.z = 6;

const scene = new THREE.Scene();
scene.background = new THREE.Color('black');

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2;

function createGridTexture() {
  const canvasSize = 2048;

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = canvasSize;
  textureCanvas.height = canvasSize;

  const context = textureCanvas.getContext('2d');

  context.fillStyle = 'black';
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.fillStyle = 'white';
  for (let y = 0; y < canvasSize; y += config.spacingY) {
    for (let x = 0; x < canvasSize; x += config.spacingX) {
      context.fillRect(x, y, config.dotSize, config.dotSize);
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

const planeSegments = 200;
const planeGeometry = new THREE.PlaneGeometry(10, 10, planeSegments, planeSegments);
const planeMaterial = new THREE.MeshBasicMaterial({
  map: createGridTexture(),
  side: THREE.DoubleSide
});

const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

function regenerateTexture() {
  planeMaterial.map.dispose();
  planeMaterial.map = createGridTexture();
  planeMaterial.needsUpdate = true;
}

const originalPositions = plane.geometry.attributes.position.clone();
const noise = createNoise3D();
const clock = new THREE.Clock();

function animate() {
  const elapsedTime = clock.getElapsedTime();
  const positions = plane.geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = originalPositions.getX(i);
    const y = originalPositions.getY(i);

    const noiseVal = noise(
      x * config.noiseZoom,
      y * config.noiseZoom,
      elapsedTime * config.animationSpeed
    );

    positions.setZ(i, noiseVal * config.noiseHeight);
  }

  positions.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  const { innerWidth, innerHeight } = window;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}

window.addEventListener('resize', resize);
resize();