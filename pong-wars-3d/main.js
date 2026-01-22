import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const Config = {
  grid: {
    size: 10,
    cubeSize: 1,
    gap: 0.1,
    opacity: 0.25
  },
  colors: {
    red: 0xFF0099,
    blue: 0x0099FF,
    background: 0x050505,
    white: 0xffffff
  },
  ball: {
    speed: 0.2,
    bias: 4.5,
    jitter: 0.05,
    radius: 0.25,
    emissiveIntensity: 3.0,
    lightIntensity: 50,
    lightDistance: 4
  },
  bloom: {
    threshold: 0.1,
    strength: 1.5,
    radius: 0.5
  },
  lighting: {
    ambientIntensity: 0.1,
    dirIntensity: 2,
    pointIntensity: 200
  }
};

const STEP = Config.grid.cubeSize + Config.grid.gap;
const TOTAL_SIZE = Config.grid.size * STEP;
const OFFSET = (TOTAL_SIZE - STEP) / 2;

const COLOR_RED = new THREE.Color(Config.colors.red);
const COLOR_BLUE = new THREE.Color(Config.colors.blue);

const scoreRedEl = document.getElementById('scoreRed');
const scoreBlueEl = document.getElementById('scoreBlue');

const toCssColor = (hex) => '#' + new THREE.Color(hex).getHexString();
scoreRedEl.style.color = toCssColor(Config.colors.red);
scoreBlueEl.style.color = toCssColor(Config.colors.blue);
document.body.style.backgroundColor = toCssColor(Config.colors.background);

let redScore = 0;
let blueScore = 0;

function updateScoreDisplay() {
  scoreRedEl.innerText = redScore;
  scoreBlueEl.innerText = blueScore;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(Config.colors.background);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, 15, 20);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  Config.bloom.strength,
  Config.bloom.radius,
  Config.bloom.threshold
);

const outputPass = new OutputPass();

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(outputPass);

const ambientLight = new THREE.AmbientLight(Config.colors.white, Config.lighting.ambientIntensity);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(Config.colors.white, Config.lighting.dirIntensity);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const pointLight1 = new THREE.PointLight(COLOR_RED, Config.lighting.pointIntensity, 50);
pointLight1.position.set(-15, 5, 15);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(COLOR_BLUE, Config.lighting.pointIntensity, 50);
pointLight2.position.set(15, 5, -15);
scene.add(pointLight2);

const geometry = new RoundedBoxGeometry(Config.grid.cubeSize, Config.grid.cubeSize, Config.grid.cubeSize, 4, 0.1);
const material = new THREE.MeshStandardMaterial({
  color: Config.colors.white,
  metalness: 0.2,
  roughness: 0.1,
  transparent: true,
  opacity: Config.grid.opacity,
});

const count = Config.grid.size * Config.grid.size * Config.grid.size;
const mesh = new THREE.InstancedMesh(geometry, material, count);
mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
scene.add(mesh);

const gridState = new Int8Array(count);
const dummy = new THREE.Object3D();
let index = 0;

for (let x = 0; x < Config.grid.size; x++) {
  for (let y = 0; y < Config.grid.size; y++) {
    for (let z = 0; z < Config.grid.size; z++) {
      dummy.position.set(
        x * STEP - OFFSET,
        y * STEP - OFFSET,
        z * STEP - OFFSET
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      const isRedSide = x < Config.grid.size / 2;
      gridState[index] = isRedSide ? 0 : 1;

      if (isRedSide) redScore++; else blueScore++;

      mesh.setColorAt(index, isRedSide ? COLOR_RED : COLOR_BLUE);

      index++;
    }
  }
}
mesh.instanceColor.needsUpdate = true;
updateScoreDisplay();

function getIndex(x, y, z) {
  return (x * Config.grid.size * Config.grid.size) + (y * Config.grid.size) + z;
}

function getGridPos(worldPos) {
  return {
    x: Math.floor((worldPos.x + OFFSET + (STEP / 2)) / STEP),
    y: Math.floor((worldPos.y + OFFSET + (STEP / 2)) / STEP),
    z: Math.floor((worldPos.z + OFFSET + (STEP / 2)) / STEP)
  };
}

class Ball {
  constructor(colorType, colorHex, startXMin, startXMax) {
    this.colorType = colorType;

    const ballGeo = new THREE.SphereGeometry(Config.ball.radius, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.1,
      roughness: 0.1,
      emissive: colorHex,
      emissiveIntensity: Config.ball.emissiveIntensity
    });
    this.mesh = new THREE.Mesh(ballGeo, ballMat);

    this.light = new THREE.PointLight(colorHex, Config.ball.lightIntensity, Config.ball.lightDistance);
    this.mesh.add(this.light);

    scene.add(this.mesh);

    this.reset(startXMin, startXMax);
  }

  reset(xMin, xMax) {
    const gx = Math.floor(Math.random() * (xMax - xMin)) + xMin;
    const gy = Math.floor(Math.random() * Config.grid.size);
    const gz = Math.floor(Math.random() * Config.grid.size);

    this.mesh.position.set(
      gx * STEP - OFFSET,
      gy * STEP - OFFSET,
      gz * STEP - OFFSET
    );

    let vx = Math.random() - 0.5;
    let vy = Math.random() - 0.5;
    let vz = Math.random() - 0.5;

    vx += (this.colorType === 0 ? Config.ball.bias : -Config.ball.bias);

    this.velocity = new THREE.Vector3(vx, vy, vz).normalize().multiplyScalar(Config.ball.speed);
  }

  applyJitter() {
    this.velocity.x += (Math.random() - 0.5) * Config.ball.jitter;
    this.velocity.y += (Math.random() - 0.5) * Config.ball.jitter;
    this.velocity.z += (Math.random() - 0.5) * Config.ball.jitter;
    this.velocity.normalize().multiplyScalar(Config.ball.speed);
  }

  update() {
    const nextPos = this.mesh.position.clone().add(this.velocity);
    const halfSize = (Config.grid.size * STEP) / 2;
    let bounced = false;

    if (nextPos.x < -halfSize || nextPos.x > halfSize) { this.velocity.x *= -1; bounced = true; }
    if (nextPos.y < -halfSize || nextPos.y > halfSize) { this.velocity.y *= -1; bounced = true; }
    if (nextPos.z < -halfSize || nextPos.z > halfSize) { this.velocity.z *= -1; bounced = true; }

    if (bounced) {
      this.applyJitter();
      return;
    }

    const gridPos = getGridPos(nextPos);

    if (gridPos.x >= 0 && gridPos.x < Config.grid.size &&
      gridPos.y >= 0 && gridPos.y < Config.grid.size &&
      gridPos.z >= 0 && gridPos.z < Config.grid.size) {

      const idx = getIndex(gridPos.x, gridPos.y, gridPos.z);
      const cellColor = gridState[idx];

      if (cellColor !== this.colorType) {
        gridState[idx] = this.colorType;

        if (this.colorType === 0) {
          redScore++;
          blueScore--;
        } else {
          blueScore++;
          redScore--;
        }
        updateScoreDisplay();

        mesh.setColorAt(idx, this.colorType === 0 ? COLOR_RED : COLOR_BLUE);
        mesh.instanceColor.needsUpdate = true;

        const prevGridPos = getGridPos(this.mesh.position);

        if (gridPos.x !== prevGridPos.x) this.velocity.x *= -1;
        if (gridPos.y !== prevGridPos.y) this.velocity.y *= -1;
        if (gridPos.z !== prevGridPos.z) this.velocity.z *= -1;

        if (gridPos.x === prevGridPos.x && gridPos.y === prevGridPos.y && gridPos.z === prevGridPos.z) {
          this.velocity.negate();
        }

        this.applyJitter();

      } else {
        this.mesh.position.copy(nextPos);
      }
    } else {
      this.velocity.negate();
      this.applyJitter();
    }
  }
}

const redBall = new Ball(0, Config.colors.red, 0, 4);
const blueBall = new Ball(1, Config.colors.blue, 5, 9);

function animate() {
  redBall.update();
  blueBall.update();

  controls.update();
  composer.render();
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});