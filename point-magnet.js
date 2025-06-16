import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

const settings = {
  enableTrails: false,
  enableColorShift: false,
  repel: true,
};

let scene, camera, renderer, points, controls, composer;
let bloomPass, afterimagePass;
let positions, velocities, originalPositions, baseColors, dynamicColors;

const POINT_COUNT = 30_000;
const SPHERE_RADIUS = 100;
const MAX_DISTANCE = 200;
const REPULSION_STRENGTH = 0.225;
const RESTORE_STRENGTH = 0.01;

const activePointers = new Map();
const raycaster = new THREE.Raycaster();

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 200;

  renderer = new THREE.WebGLRenderer({ antialias: false, canvas: document.querySelector("#container") });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomResolution = new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(0.5);
  bloomPass = new UnrealBloomPass(bloomResolution, 0.4, 0.1, 0.3);
  composer.addPass(bloomPass);

  afterimagePass = new AfterimagePass(0.85);

  const gui = new GUI();
  gui
    .add(settings, "enableTrails")
    .name("Enable Trails")
    .onChange((v) => {
      if (v) composer.addPass(afterimagePass);
      else composer.removePass(afterimagePass);
    });
  gui.add(settings, "enableColorShift").name("Enable Color Shift");
  gui.add(settings, "repel").name("Repel Points");

  const geometry = new THREE.BufferGeometry();
  positions = new Float32Array(POINT_COUNT * 3);
  originalPositions = new Float32Array(POINT_COUNT * 3);
  velocities = new Float32Array(POINT_COUNT * 3);
  baseColors = new Float32Array(POINT_COUNT * 3);
  dynamicColors = new Float32Array(POINT_COUNT * 3);

  const colorCenter = new THREE.Color(0xffffff);
  const colorEdge = new THREE.Color(0x8a2be2);

  for (let i = 0; i < POINT_COUNT; i++) {
    const phi = Math.random() * Math.PI * 2;
    const costheta = Math.random() * 2 - 1;
    const u = Math.random();
    const theta = Math.acos(costheta);
    const r = SPHERE_RADIUS * Math.cbrt(u);

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    originalPositions[i * 3] = x;
    originalPositions[i * 3 + 1] = y;
    originalPositions[i * 3 + 2] = z;

    const distanceRatio = r / SPHERE_RADIUS;
    const blendedColor = colorCenter.clone().lerp(colorEdge, distanceRatio);

    baseColors[i * 3] = blendedColor.r;
    baseColors[i * 3 + 1] = blendedColor.g;
    baseColors[i * 3 + 2] = blendedColor.b;

    dynamicColors[i * 3] = blendedColor.r;
    dynamicColors[i * 3 + 1] = blendedColor.g;
    dynamicColors[i * 3 + 2] = blendedColor.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(dynamicColors, 3));

  const circleTexture = (() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  })();

  const material = new THREE.PointsMaterial({
    size: 1.0,
    map: circleTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.7,
    sizeAttenuation: true,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);

  window.addEventListener("resize", onWindowResize);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUpOrOut);
  renderer.domElement.addEventListener("pointerout", onPointerUpOrOut);
  renderer.domElement.addEventListener("pointercancel", onPointerUpOrOut);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth * 0.5, window.innerHeight * 0.5);
}

function onPointerDown(event) {
  if (event.pointerType !== "mouse") {
    activePointers.set(event.pointerId, {
      x: (event.clientX / window.innerWidth) * 2 - 1,
      y: -(event.clientY / window.innerHeight) * 2 + 1,
    });
  }
}

function onPointerMove(event) {
  const pointerId = event.pointerType === "mouse" ? 0 : event.pointerId;
  activePointers.set(pointerId, {
    x: (event.clientX / window.innerWidth) * 2 - 1,
    y: -(event.clientY / window.innerHeight) * 2 + 1,
  });
}

function onPointerUpOrOut(event) {
  if (event.pointerType !== "mouse") {
    activePointers.delete(event.pointerId);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const rays = [];
  activePointers.forEach((coords) => {
    raycaster.setFromCamera(coords, camera);
    rays.push({
      origin: raycaster.ray.origin.clone(),
      direction: raycaster.ray.direction.clone(),
    });
  });

  const positionAttr = points.geometry.attributes.position;
  const colorAttr = points.geometry.attributes.color;

  for (let i = 0; i < POINT_COUNT; i++) {
    const ix = i * 3;
    const point = new THREE.Vector3(positions[ix], positions[ix + 1], positions[ix + 2]);
    const originPoint = new THREE.Vector3(
      originalPositions[ix],
      originalPositions[ix + 1],
      originalPositions[ix + 2]
    );

    rays.forEach(({ origin, direction }) => {
      const originToPoint = point.clone().sub(origin);
      const projectionLength = originToPoint.dot(direction);
      const closestPoint = origin.clone().add(direction.clone().multiplyScalar(projectionLength));
      const distanceToRay = point.distanceTo(closestPoint);

      if (distanceToRay < MAX_DISTANCE) {
        const falloff = 1 - distanceToRay / MAX_DISTANCE;
        const repulsionStrength = REPULSION_STRENGTH * Math.sqrt(falloff);

        const dir = settings.repel ? point.clone().sub(closestPoint) : closestPoint.clone().sub(point);

        const force = dir.normalize().multiplyScalar(repulsionStrength);
        velocities[ix] += force.x;
        velocities[ix + 1] += force.y;
        velocities[ix + 2] += force.z;
      }
    });

    velocities[ix] += (originPoint.x - point.x) * RESTORE_STRENGTH;
    velocities[ix + 1] += (originPoint.y - point.y) * RESTORE_STRENGTH;
    velocities[ix + 2] += (originPoint.z - point.z) * RESTORE_STRENGTH;

    positions[ix] += velocities[ix];
    positions[ix + 1] += velocities[ix + 1];
    positions[ix + 2] += velocities[ix + 2];

    velocities[ix] *= 0.9;
    velocities[ix + 1] *= 0.9;
    velocities[ix + 2] *= 0.9;

    if (settings.enableColorShift) {
      let interactionFalloff = 0;
      rays.forEach(({ origin, direction }) => {
        const originToPoint = point.clone().sub(origin);
        const projectionLength = originToPoint.dot(direction);
        const closestPoint = origin.clone().add(direction.clone().multiplyScalar(projectionLength));
        const distanceToRay = point.distanceTo(closestPoint);
        if (distanceToRay < MAX_DISTANCE) {
          interactionFalloff = Math.max(interactionFalloff, 1 - distanceToRay / MAX_DISTANCE);
        }
      });

      const baseR = baseColors[ix],
        baseG = baseColors[ix + 1],
        baseB = baseColors[ix + 2];
      const highlight = new THREE.Color(0xff6600);
      colorAttr.array[ix] = THREE.MathUtils.lerp(baseR, highlight.r, interactionFalloff);
      colorAttr.array[ix + 1] = THREE.MathUtils.lerp(baseG, highlight.g, interactionFalloff);
      colorAttr.array[ix + 2] = THREE.MathUtils.lerp(baseB, highlight.b, interactionFalloff);
    }
  }

  positionAttr.needsUpdate = true;
  if (settings.enableColorShift) colorAttr.needsUpdate = true;

  controls.update();
  composer.render();
}
