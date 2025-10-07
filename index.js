import * as THREE from 'three';
import gsap from 'gsap';

const request = await fetch('projects.json');
const projects = await request.json();

let scene, camera, renderer;
let carouselGroup;

const textureLoader = new THREE.TextureLoader();

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

let isDragging = false;
let dragStart = { x: 0, y: 0, time: 0 };

let targetState = { x: 0 };
let currentDragX = 0;

let lastMoveTime = 0;
let lastMoveX = 0;
let currentVelocity = 0;

let hoveredObject = null;
let isCarouselView = true;

const CAROUSEL_IMAGE_WIDTH = 3.75;
const CAROUSEL_IMAGE_HEIGHT = 3.75;
const CAROUSEL_SPACING = 3.0;
const CAROUSEL_DRAG_SENSITIVITY = 2.5;
const CAROUSEL_LERP_FACTOR = 0.15;
const CAROUSEL_COMPRESSION_RATE = 0.005;
const CAROUSEL_ROTATION_FACTOR = 0.225;
const CAROUSEL_MOMENTUM_FACTOR = 300;
const CAROUSEL_CENTER_SCALE_ENHANCEMENT = 1.15;
const CAROUSEL_SCALE_FALLOFF = 0.6;

const GRID_SPACING = 4.5;
const GRID_COLS = 4;
const GRID_SCALE_FACTOR = 0.5;
const GRID_SPACING_REDUCTION = 0.5;
const GRID_Z_OFFSET = -5.0;

const HOVER_ROTATION_SENSITIVITY = 0.1;
const HOVER_DEFORMATION_LERP = 0.3;
const HOVER_Z_OFFSET = -0.2;

const STAGGER_DELAY_MS = 30;
const TRANSITION_DURATION = 1000;

let cardPositionsX = [];
let minOffset, maxOffset;

let viewTransitionTimeline = null;
let isTransitioning = false;
let currentCenteredIndex = -1;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181818);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 8;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cursor = 'grab';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  const shadowLight = new THREE.DirectionalLight(0xffffff, 1.2);
  shadowLight.position.set(0, 1.5, 3);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.width = 1024;
  shadowLight.shadow.mapSize.height = 1024;
  shadowLight.shadow.camera.near = 0.5;
  shadowLight.shadow.camera.far = 50;

  const shadowCamSize = 20;
  shadowLight.shadow.camera.left = -shadowCamSize;
  shadowLight.shadow.camera.right = shadowCamSize;
  shadowLight.shadow.camera.top = shadowCamSize;
  shadowLight.shadow.camera.bottom = -shadowCamSize;

  scene.add(shadowLight);

  createCards();
  createHiddenLinks();

  minOffset = -cardPositionsX[projects.length - 1];
  maxOffset = -cardPositionsX[0];

  targetState.x = maxOffset;
  carouselGroup.position.x = maxOffset;

  window.addEventListener('resize', resizeHandler);

  renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
  renderer.domElement.addEventListener('pointermove', pointerMoveHandler);
  renderer.domElement.addEventListener('touchmove', touchMoveHandler, { passive: false });
  renderer.domElement.addEventListener('pointerup', pointerUpHandler);
  renderer.domElement.addEventListener('pointerleave', pointerUpHandler);

  document.getElementById('toggleViewButton').addEventListener('click', toggleView);
}

function createCards() {
  carouselGroup = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(CAROUSEL_IMAGE_WIDTH, CAROUSEL_IMAGE_HEIGHT);

  const numItems = projects.length;
  const centerIndex = (numItems - 1) / 2;
  cardPositionsX = new Array(numItems);

  const cols = GRID_COLS;
  const rows = Math.ceil(numItems / cols);

  const centerYOffsetIndex = (rows - 1) / 2;
  const centerXOffsetIndex = (cols - 1) / 2;

  projects.forEach((item, index) => {
    const xPos = (index - centerIndex) * CAROUSEL_SPACING;
    cardPositionsX[index] = xPos;

    const col = index % cols;
    const row = Math.floor(index / cols);

    const gridX = (col - centerXOffsetIndex) * GRID_SPACING;
    const gridY = -(row - centerYOffsetIndex) * GRID_SPACING;
    const gridZ = 0;

    const texture = textureLoader.load(item.image);
    texture.minFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.FrontSide,
      metalness: 0.1,
      roughness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(xPos, 0, 0);

    mesh.userData = {
      url: item.url,
      title: item.title,
      keywords: item.keywords,
      initialX: xPos,
      gridX: gridX,
      gridY: gridY,
      gridZ: gridZ,

      isHovered: false,
      targetRotX: 0,
      targetRotY_Hover: 0,
    };

    carouselGroup.add(mesh);
  });

  scene.add(carouselGroup);
}

function createHiddenLinks() {
  let hiddenLinks = document.getElementById('hiddenLinks');
  if (!hiddenLinks) {
    hiddenLinks = document.createElement('div');
    hiddenLinks.id = 'hiddenLinks';
    hiddenLinks.style.display = 'none';
    document.body.appendChild(hiddenLinks);
  }

  projects.forEach((item) => {
    if (item.url) {
      const a = document.createElement('a');
      a.href = item.url;
      a.textContent = item.title || item.url;
      hiddenLinks.appendChild(a);
    }
  });
}

function calculateCentralScale(worldX) {
  const distanceFromCenter = Math.abs(worldX);
  const maxCentralDistance = CAROUSEL_SPACING * CAROUSEL_SCALE_FALLOFF;
  let scaleFactor = 1.0;

  if (distanceFromCenter < maxCentralDistance) {
    const normalizedDistance = distanceFromCenter / maxCentralDistance;
    const smoothFalloff = 1 - THREE.MathUtils.smoothstep(normalizedDistance, 0, 1);
    scaleFactor = 1.0 + (CAROUSEL_CENTER_SCALE_ENHANCEMENT - 1.0) * smoothFalloff;
  }
  return scaleFactor;
}

function calculateCarouselTarget(mesh, groupFinalX) {
  const { initialX } = mesh.userData;
  const finalWorldX = initialX + groupFinalX;
  const compressionOffset = - CAROUSEL_COMPRESSION_RATE * finalWorldX * Math.abs(finalWorldX);
  const finalLocalX = initialX + compressionOffset;
  const finalRotY = -finalWorldX * CAROUSEL_ROTATION_FACTOR;
  const finalScale = calculateCentralScale(finalWorldX);

  return {
    x: finalLocalX,
    y: 0,
    z: 0,
    rotationY: finalRotY,
    scale: finalScale
  };
}

function getNearestCardIndex(xPosition) {
  let nearestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < cardPositionsX.length; i++) {
    const targetCenterPos = -cardPositionsX[i];
    const distance = Math.abs(xPosition - targetCenterPos);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

function pointerDownHandler(event) {
  isDragging = true;
  dragStart.x = event.clientX;
  dragStart.y = event.clientY;
  dragStart.time = Date.now();

  if (isCarouselView) {
    currentDragX = targetState.x;
    lastMoveTime = Date.now();
    lastMoveX = targetState.x;
    currentVelocity = 0;

    renderer.domElement.style.cursor = 'grabbing';

    gsap.killTweensOf(targetState);
  }
}

function pointerMoveHandler(event) {
  let clientX, clientY;
  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (clientY / window.innerHeight) * 2 + 1;

  if (isDragging && isCarouselView) {
    const deltaX = clientX - dragStart.x;
    let newTargetX = currentDragX + (deltaX / window.innerWidth) * projects.length * CAROUSEL_DRAG_SENSITIVITY;
    targetState.x = THREE.MathUtils.clamp(newTargetX, minOffset, maxOffset);

    const now = Date.now();
    const deltaT = now - lastMoveTime;
    if (deltaT > 16) {
      const deltaXThreeUnits = targetState.x - lastMoveX;
      currentVelocity = deltaXThreeUnits / deltaT;
      lastMoveTime = now;
      lastMoveX = targetState.x;
    }
  }
}

function touchMoveHandler(event) {
  if (isDragging) {
    event.preventDefault();
    pointerMoveHandler(event);
  }
}

function pointerUpHandler(event) {
  const dragDistance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
  const dragDuration = Date.now() - dragStart.time;

  if (isDragging) {
    if (dragDistance < 10 && dragDuration < 200) {
      handleItemClick();
    }

    if (isCarouselView) {
      const coastOffset = currentVelocity * CAROUSEL_MOMENTUM_FACTOR;
      const coastPosition = carouselGroup.position.x + coastOffset;
      const clampedCoastPosition = THREE.MathUtils.clamp(coastPosition, minOffset, maxOffset);
      const nearestIndex = getNearestCardIndex(clampedCoastPosition);
      const finalSnapTargetX = -cardPositionsX[nearestIndex];

      currentVelocity = 0;

      gsap.to(targetState, {
        x: finalSnapTargetX,
        duration: 0.8,
        ease: "expo.out"
      });
    }
  }

  isDragging = false;
  if (!isTransitioning) {
    let baseCursor = isCarouselView ? 'grab' : 'default';
    renderer.domElement.style.cursor = hoveredObject ? 'pointer' : baseCursor;
  }
}

function handleItemClick() {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(carouselGroup.children);

  if (intersects.length > 0) {
    const clickedObject = intersects[0].object;
    if (clickedObject.userData.url) {
      window.open(clickedObject.userData.url, '_blank');
    }
  }
}

function toggleView() {
  if (viewTransitionTimeline) {
    viewTransitionTimeline.kill();
  }

  const cardInfoElement = document.getElementById('cardInfoDisplay');

  isTransitioning = true;
  isCarouselView = !isCarouselView;

  const button = document.querySelector('#toggleViewButton > img');

  if (isCarouselView) {
    button.src = 'images/icon-grid.svg';
    renderer.domElement.style.cursor = 'grab';

    const nearestIndex = getNearestCardIndex(carouselGroup.position.x);
    const snapTargetX = -cardPositionsX[nearestIndex];
    const numItems = projects.length;

    let cardOrder = [];
    for (let i = 0; i < numItems; i++) {
      cardOrder.push({ mesh: carouselGroup.children[i], originalIndex: i });
    }

    viewTransitionTimeline = gsap.timeline({
      defaults: { duration: TRANSITION_DURATION / 1000, ease: "power2.out" },
      onComplete: () => {
        isTransitioning = false;
        updateCardInfoDisplay(true);
      }
    });

    viewTransitionTimeline.to(targetState, {
      x: snapTargetX,
      duration: TRANSITION_DURATION / 1000 + (numItems * STAGGER_DELAY_MS / 1000), // Match the total stagger duration
      ease: "power2.inOut"
    }, 0);

    cardOrder.forEach((item, i) => {
      const card = item.mesh;
      const finalTargets = calculateCarouselTarget(card, snapTargetX);
      const delaySeconds = i * STAGGER_DELAY_MS / 1000;

      viewTransitionTimeline.to(card.position, {
        x: finalTargets.x,
        y: finalTargets.y,
        z: finalTargets.z,
      }, delaySeconds);

      viewTransitionTimeline.to(card.rotation, {
        y: finalTargets.rotationY,
      }, delaySeconds);

      viewTransitionTimeline.to(card.scale, {
        x: finalTargets.scale,
        y: finalTargets.scale,
      }, delaySeconds);
    });

    viewTransitionTimeline.to(cardInfoElement, { autoAlpha: 1, duration: 0.5 }, 0);

  } else {
    button.src = 'images/icon-carousel.svg';
    renderer.domElement.style.cursor = 'default';

    const targetGridX = 0;
    isDragging = false;

    const duration = 0.8;
    viewTransitionTimeline = gsap.timeline({
      defaults: { duration: duration, ease: "back.out" },
      onComplete: () => { isTransitioning = false; }
    });

    gsap.to(cardInfoElement, { autoAlpha: 0, duration: 0.5 });
    viewTransitionTimeline.to(targetState, { x: targetGridX }, 0);

    let gridCenterIndex = 0;
    let minGridDistance = Infinity;

    carouselGroup.children.forEach((child, index) => {
      const { gridX, gridY } = child.userData;
      const distance = Math.hypot(gridX * GRID_SPACING_REDUCTION, gridY * GRID_SPACING_REDUCTION);

      if (distance < minGridDistance) {
        minGridDistance = distance;
        gridCenterIndex = index;
      }
    });

    let cardOrder = [];

    carouselGroup.children.forEach((mesh, index) => {
      const centerCard = carouselGroup.children[gridCenterIndex];

      const dx = mesh.userData.gridX - centerCard.userData.gridX;
      const dy = mesh.userData.gridY - centerCard.userData.gridY;
      const distFromCenterCard = Math.hypot(dx * GRID_SPACING_REDUCTION, dy * GRID_SPACING_REDUCTION);

      cardOrder.push({ mesh: mesh, dist: distFromCenterCard, originalIndex: index });
    });

    cardOrder.sort((a, b) => b.dist - a.dist);

    cardOrder.forEach((item, i) => {
      const child = item.mesh;
      const { gridX, gridY } = child.userData;
      const targetScale = GRID_SCALE_FACTOR;
      const delaySeconds = i * STAGGER_DELAY_MS / 1000;

      viewTransitionTimeline.to(child.position, {
        x: gridX * GRID_SPACING_REDUCTION,
        y: gridY * GRID_SPACING_REDUCTION,
        z: GRID_Z_OFFSET,
      }, delaySeconds);

      viewTransitionTimeline.to(child.rotation, { y: 0 }, delaySeconds);
      viewTransitionTimeline.to(child.scale, {
        x: targetScale,
        y: targetScale,
      }, delaySeconds);
    });
  }
}

function updateCardInfoDisplay(forceUpdate = false) {
  const cardInfoElement = document.getElementById('cardInfoDisplay');

  if (isCarouselView && !isTransitioning) {
    const currentGroupX = carouselGroup.position.x;
    const nearestIndex = getNearestCardIndex(currentGroupX);

    if (nearestIndex !== currentCenteredIndex || forceUpdate) {
      currentCenteredIndex = nearestIndex;
      const currentCard = projects[currentCenteredIndex];

      const keywordString = currentCard.keywords.join(' · ');

      cardInfoElement.innerHTML = /* html */ `
        <h2>${currentCard.title}</h2>
        <p>${currentCard.description}</p>
        <div class="keywords-list">${keywordString}</div>
      `;
    }
  }
}

function animate() {
  carouselGroup.position.x = THREE.MathUtils.lerp(carouselGroup.position.x, targetState.x, CAROUSEL_LERP_FACTOR);

  updateItemTransformations();
  updateHoverEffect();
  updateCardInfoDisplay();

  renderer.render(scene, camera);
}

function updateItemTransformations() {
  if (isTransitioning) return;

  carouselGroup.children.forEach(child => {
    let targetX, targetY, targetZ, targetRotY, currentScaleTarget;

    const { initialX, gridX, gridY, isHovered } = child.userData;
    const worldX = initialX + carouselGroup.position.x;
    const compressionOffset = - CAROUSEL_COMPRESSION_RATE * worldX * Math.abs(worldX);

    if (isCarouselView) {
      targetX = initialX + compressionOffset;
      const newWorldX = targetX + carouselGroup.position.x;
      targetRotY = -newWorldX * CAROUSEL_ROTATION_FACTOR; // Base carousel rotation
      targetY = 0;
      currentScaleTarget = calculateCentralScale(newWorldX);
      targetZ = currentScaleTarget / 3;
    } else {
      targetX = gridX * GRID_SPACING_REDUCTION;
      targetY = gridY * GRID_SPACING_REDUCTION;
      targetZ = GRID_Z_OFFSET;
      targetRotY = 0;
      currentScaleTarget = GRID_SCALE_FACTOR;
    }

    let targetRotX = 0;
    let finalTargetRotY = targetRotY;
    let posLerpFactor = CAROUSEL_LERP_FACTOR;
    let rotLerpFactor = CAROUSEL_LERP_FACTOR;

    if (isHovered) {
      targetZ += HOVER_Z_OFFSET;
      targetRotX = child.userData.targetRotX || 0;
      finalTargetRotY += child.userData.targetRotY_Hover || 0;
      posLerpFactor = HOVER_DEFORMATION_LERP;
      rotLerpFactor = HOVER_DEFORMATION_LERP;
    }

    child.position.x = THREE.MathUtils.lerp(child.position.x, targetX, CAROUSEL_LERP_FACTOR);
    child.position.y = THREE.MathUtils.lerp(child.position.y, targetY, CAROUSEL_LERP_FACTOR);
    child.position.z = THREE.MathUtils.lerp(child.position.z, targetZ, posLerpFactor);

    child.rotation.x = THREE.MathUtils.lerp(child.rotation.x, targetRotX, rotLerpFactor);
    child.rotation.y = THREE.MathUtils.lerp(child.rotation.y, finalTargetRotY, rotLerpFactor);

    const finalTargetScale = currentScaleTarget;
    if (Math.abs(child.scale.x - finalTargetScale) > 0.001) {
      child.scale.lerp(new THREE.Vector3(finalTargetScale, finalTargetScale, 1), 0.1);
    }
  });
}

function updateHoverEffect() {
  if (isTransitioning) return;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(carouselGroup.children);
  let nextHoveredObject = null;

  if (intersects.length > 0) {
    const intersection = intersects[0];
    const mesh = intersection.object;
    nextHoveredObject = mesh;

    const localPoint = mesh.worldToLocal(intersection.point.clone());
    const halfWidth = CAROUSEL_IMAGE_WIDTH / 2;
    const halfHeight = CAROUSEL_IMAGE_HEIGHT / 2;

    const normX = THREE.MathUtils.clamp(localPoint.x / halfWidth, -1, 1);
    const normY = THREE.MathUtils.clamp(localPoint.y / halfHeight, -1, 1);

    mesh.userData.targetRotX = -normY * HOVER_ROTATION_SENSITIVITY;
    mesh.userData.targetRotY_Hover = normX * HOVER_ROTATION_SENSITIVITY;
  }

  carouselGroup.children.forEach(child => {
    if (child === nextHoveredObject) {
      child.userData.isHovered = true;
    } else {
      child.userData.isHovered = false;
      child.userData.targetRotX = 0;
      child.userData.targetRotY_Hover = 0;
    }
  });

  if (hoveredObject !== nextHoveredObject) {
    hoveredObject = nextHoveredObject;
  }

  if (isDragging || isTransitioning) return;

  let baseCursor = isCarouselView ? 'grab' : 'default';
  renderer.domElement.style.cursor = hoveredObject ? 'pointer' : baseCursor;
}

function resizeHandler() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
renderer.setAnimationLoop(animate);