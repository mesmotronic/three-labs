import * as THREE from 'three';
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

class Grid extends THREE.LineSegments {
  constructor(squareSize, divisions, color, fill) {
    const size = new THREE.Vector2(squareSize * divisions.x, squareSize * divisions.y);
    const startPos = new THREE.Vector2(-size.width / 2, -size.height / 2);
    const vertices = [];

    for (let i = 0; i <= divisions.x; i++) {
      const x = startPos.x + i * squareSize;
      vertices.push(x, startPos.y, 0, x, startPos.y + size.height, 0);
    }

    for (let j = 0; j <= divisions.y; j++) {
      const y = startPos.y + j * squareSize;
      vertices.push(startPos.x, y, 0, startPos.x + size.width, y, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({ color });
    super(geometry, material);

    this.type = 'Grid';

    if (fill) {
      const fillGeometry = new THREE.PlaneGeometry(size.x, size.y);
      const fillMaterial = new THREE.MeshBasicMaterial({ color: fill, side: THREE.DoubleSide });
      const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
      fillMesh.position.set(0, 0, -0.01);
      fillMesh.receiveShadow = true;
      this.add(fillMesh);
    }
  }
}

const sphereTilt = THREE.MathUtils.degToRad(-20);
const gridSquareSize = 0.55;
const floorGridDivisions = new THREE.Vector2(15, 3);
const wallGridDivisions = new THREE.Vector2(15, 12);

const options = {
  sound: false,
};

// Physics
const velocity = new THREE.Vector2(0.02, 0.05);
const gravity = 0.001;
const bounceDamping = 1;
const bounds = new THREE.Vector2(3, 1.7);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

// Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);
const bounceSound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('./bounce.mp3', (buffer) => {
  bounceSound.setBuffer(buffer);
  bounceSound.setVolume(0.0);
});

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setClearColor(0xaaaaaa, 1);
renderer.setPixelRatio(0.25);
renderer.setAnimationLoop(animate);
renderer.domElement.style.imageRendering = 'pixelated';
renderer.shadowMap.enabled = false; // Disable real shadows
document.body.appendChild(renderer.domElement);

function createCheckerTexture(size = 512, squares = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const sq = size / squares;

  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares * 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ff0000' : '#ffffff';
      ctx.fillRect(x * sq, y * sq, sq, sq);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}
const checkerTexture = createCheckerTexture();

// Sphere mesh
const radius = 1.25;
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(radius, 16, 8),
  new THREE.MeshBasicMaterial({
    map: checkerTexture,
  })
);
sphere.castShadow = true;

const sphereGroup = new THREE.Group();
sphereGroup.add(sphere);
sphereGroup.rotation.z = sphereTilt;
scene.add(sphereGroup);

const floorGrid = new Grid(gridSquareSize, floorGridDivisions, new THREE.Color(0xaa00aa));
floorGrid.rotation.x = -Math.PI / 2;
floorGrid.position.y = -gridSquareSize * wallGridDivisions.y / 2;
floorGrid.position.z = -2 + gridSquareSize * floorGridDivisions.y / 2;
scene.add(floorGrid);

const wallGrid = new Grid(gridSquareSize, wallGridDivisions, new THREE.Color(0xaa00aa), new THREE.Color(0xaaaaaa));
wallGrid.position.z = -2;
scene.add(wallGrid);

const shadowGeometry = new THREE.CircleGeometry(radius, 16);
const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
scene.add(shadow);


// Calculate required view size (wallGrid + padding)
const padding = 0.5;
const wallWidth = gridSquareSize * wallGridDivisions.x;
const wallHeight = gridSquareSize * wallGridDivisions.y;
const requiredWidth = wallWidth + 2 * padding;
const requiredHeight = wallHeight + 2 * padding;

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

  // Camera FOV is vertical, so calculate required z for height
  const fovRad = camera.fov * Math.PI / 180;
  const aspect = camera.aspect;
  const distanceForHeight = requiredHeight / (2 * Math.tan(fovRad / 2));
  const distanceForWidth = requiredWidth / (2 * Math.tan(fovRad / 2)) / aspect;
  camera.position.z = Math.max(distanceForHeight, distanceForWidth);
};

// Handle window resize
window.addEventListener('resize', resize);
resize();

function animate() {
  let bounced = false;
  sphereGroup.position.x += velocity.x;
  if (Math.abs(sphereGroup.position.x) > bounds.x) {
    sphereGroup.position.x = THREE.MathUtils.clamp(sphereGroup.position.x, -bounds.x, bounds.x);
    velocity.x *= -1;
    bounced = true;
  }

  velocity.y -= gravity;

  sphereGroup.position.y += velocity.y;

  const floorY = -bounds.y;
  if (sphereGroup.position.y < floorY) {
    const overshoot = floorY - sphereGroup.position.y;
    sphereGroup.position.y = floorY + overshoot;
    velocity.y *= -bounceDamping;
    bounced = true;
  }

  // Play bounce sound only if ready, user has interacted, and buffer is loaded
  if (bounced && options.sound && bounceSound?.buffer) {
    if (bounceSound.isPlaying) bounceSound.stop();
    bounceSound.play();
  }

  sphere.rotation.y += velocity.x > 0 ? -0.05 : 0.05;
  shadow.position.copy(sphereGroup.position).add(new THREE.Vector3(0.5, 0, 0));

  renderer.render(scene, camera);
}

const gui = new GUI();
gui.close();
gui.add(options, "sound").name("Sound").onChange(value => {
  if (value) {
    if (bounceSound.context && bounceSound.context.state === 'suspended') {
      bounceSound.context.resume();
    }
  }
  bounceSound.setVolume(value ? 1 : 0);
});
