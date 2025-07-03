import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from "three/addons/libs/stats.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);
camera.position.set(0.0, 0.0, 23);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: document.querySelector("#container"),
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;

const size = 21;
const dummy = new THREE.Object3D();

const loader = new THREE.BufferGeometryLoader();
const geometry = await loader.loadAsync(
  "models/json/suzanne_buffergeometry.json"
);

geometry.computeVertexNormals();
geometry.scale(0.4, 0.4, 0.4);

const material = new THREE.MeshNormalMaterial();
const mesh = new THREE.InstancedMesh(geometry, material, size * size);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

const plane = new THREE.Plane();
const planeNormal = new THREE.Vector3();
const planePoint = new THREE.Vector3();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const lookAt = new THREE.Vector3();

let pointerState = 0;

window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener("pointerout", () => pointerState = 0);
window.addEventListener("pointerover", () => pointerState = 1);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
});

const stats = new Stats();
document.body.appendChild(stats.dom);

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (pointerState < 2) {
    render();
  }

  stats.update();
}

function render() {
  let i = 0;
  const offset = (size - 1) / 2;

  raycaster.setFromCamera(pointer, camera);

  camera.getWorldDirection(planeNormal);
  planePoint.copy(planeNormal).setLength(3).add(camera.position).setZ(1);
  plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  raycaster.ray.intersectPlane(plane, lookAt);

  const useLookAt = pointerState == 1;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      dummy.position.set(offset - x, offset - y, 0);
      if (useLookAt) {
        dummy.lookAt(lookAt);
      } else {
        dummy.rotation.x = THREE.MathUtils.degToRad(Math.random() * 360);
        dummy.rotation.y = THREE.MathUtils.degToRad(Math.random() * 360);
        pointerState = 2;
      }
      dummy.updateMatrix();

      mesh.setMatrixAt(i++, dummy.matrix);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

animate();
