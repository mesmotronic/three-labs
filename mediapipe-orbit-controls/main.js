import * as THREE from 'three';
import { FilesetResolver } from '@mediapipe/tasks-vision';
import { MediaPipeOrbitControls } from './MediaPipeOrbitControls.js';

// Check WebGL
if (!navigator.gpu || !THREE.WebGLRenderer) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-element';
  errorElement.textContent = 'WebGL or GPU not supported. Try Chrome with hardware acceleration enabled.';
  document.body.appendChild(errorElement);
  throw new Error('WebGL not supported');
}

// Check FilesetResolver
if (typeof FilesetResolver === 'undefined') {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-element';
  errorElement.textContent = 'FilesetResolver not found. Check MediaPipe Tasks Vision script load.';
  document.body.appendChild(errorElement);
  throw new Error('FilesetResolver undefined');
}

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Darker gray background
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 30; // Adjusted for larger cylinder
camera.lookAt(0, 0, 0); // Look at origin
scene.add(camera); // Explicitly add camera to scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 512;
directionalLight.shadow.mapSize.height = 512;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.375);
scene.add(ambientLight);

// Point light for cylinder interior
const pointLightInterior = new THREE.PointLight(0xffffff, 0.5, 20, 2);
pointLightInterior.position.set(0, 0, 0); // Center of cylinder
scene.add(pointLightInterior);

// Point light at screen center
const pointLightScreen = new THREE.PointLight(0xffffff, 0.3, 30, 2);
pointLightScreen.position.set(0, 0, 15); // Center of screen (halfway to camera)
scene.add(pointLightScreen);

// Cylinder setup (open-ended, light blue, horizontal, wireframe, 20 height segments)
const cylinderGeometry = new THREE.CylinderGeometry(5, 5, 20, 32, 20, true); // Open-ended, 20 height segments
cylinderGeometry.computeVertexNormals();
const cylinderMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x87ceeb, // Light blue
  roughness: 0.4,
  metalness: 0.1,
  clearcoat: 0.8,
  clearcoatRoughness: 0.2,
  side: THREE.DoubleSide, // Render inside and outside
});
const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
cylinder.castShadow = true;
cylinder.receiveShadow = true;
cylinder.position.set(0, 0, 0); // Locked to center
cylinder.rotation.x = Math.PI / 2; // Rotate 90° around x-axis to align with camera
scene.add(cylinder);

cylinder.add(new THREE.Mesh(
  cylinderGeometry,
  new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true })
));

// Initialize orbit controls with defaults (no pre-existing elements)
const orbitControls = new MediaPipeOrbitControls({ camera });
document.body.appendChild(orbitControls.video);
document.body.appendChild(orbitControls.statusElement);
document.body.appendChild(orbitControls.errorElement);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  orbitControls.update();
  if (!orbitControls.hasHandControl) {
    cylinder.rotation.x += 0.01;
    cylinder.rotation.y += 0.01;
  }
  renderer.render(scene, camera);
}

// Init
async function init() {
  try {
    console.log('Starting init...');
    await orbitControls.init();
    animate();
  } catch (err) {
    orbitControls.showError('Init failed: ' + err.message);
    console.error('Init error:', err);
    animate(); // Run anyway
  }
}

init();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});