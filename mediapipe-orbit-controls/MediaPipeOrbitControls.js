import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

function getScriptDir() {
  if (document.currentScript?.src) {
    return document.currentScript.src.replace(/\/[^\/]*$/, '/');
  }
  if (import.meta?.url) {
    return import.meta.url.replace(/\/[^\/]*$/, '/');
  }
  return './';
}

export class MediaPipeOrbitControls extends THREE.EventDispatcher {
  constructor({
    camera, cursor = null, video = null, statusElement = null, errorElement = null, target = new THREE.Vector3(0, 0, 0), assetRoot = null, numHands = 1
  }) {
    if (!camera) {
      throw new Error('MediaPipeOrbitControls] camera is required');
    }

    super();

    this.camera = camera;
    this.target = target; // Point the camera looks at
    this.handLandmarker = null;
    this.hasHandControl = false;
    this.isPinching = Array(numHands).fill(false); // Track pinch state per hand
    this.lastThumbX = 0;
    this.lastThumbY = 0;
    this.lastThumbZ = 0;
    this.smoothedThumbX = 0;
    this.smoothedThumbY = 0;
    this.smoothedThumbZ = 0;
    this.assetRoot = assetRoot ?? getScriptDir();
    this.numHands = numHands;

    // Initialize cursor if not provided
    this.cursor = cursor || this.createDefaultCursor();

    this.camera.add(this.cursor);
    this.camera.lookAt(this.target);

    // Initialize video element if not provided
    this.video = video || this.createDefaultVideoElement();

    // Initialize status and error elements if not provided
    this.statusElement = statusElement || this.createDefaultStatusElement();
    this.errorElement = errorElement || this.createDefaultErrorElement();
  }

  // Create default cursor (sphere) with MeshBasicMaterial
  createDefaultCursor() {
    const cursorGeometry = new THREE.SphereGeometry(0.1, 16, 16); // Smaller cursor size
    const cursorMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000 // Default red
    });
    const cursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
    // Remove shadow properties since MeshBasicMaterial doesn't need them
    return cursor;
  }

  // Create default video element
  createDefaultVideoElement() {
    const video = document.createElement('video');
    video.className = 'video-element';
    video.autoplay = true;
    video.playsInline = true;
    video.style.transform = 'scaleX(-1)';
    return video;
  }

  // Create default status element
  createDefaultStatusElement() {
    const status = document.createElement('div');
    status.className = 'status-element';
    status.textContent = 'Initializing...';
    return status;
  }

  // Create default error element
  createDefaultErrorElement() {
    const error = document.createElement('div');
    error.className = 'error-element';
    return error;
  }

  // Show error message
  showError(msg) {
    this.errorElement.textContent = msg;
  }

  // Setup webcam
  async setupCamera() {
    try {
      console.log('Requesting webcam...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      this.video.srcObject = stream;
      await new Promise(resolve => {
        this.video.onloadedmetadata = () => {
          console.log('Webcam ready');
          this.video.play();
          resolve(null);
        };
      });
      this.statusElement.textContent = 'Webcam active. Loading hand detection...';
      return true;
    } catch (err) {
      console.error('Webcam error:', err);
      this.showError(`Webcam access denied: ${err.message}. Cursor and cylinder will rotate statically.`);
      return false;
    }
  }

  // Setup MediaPipe Hand Landmarker
  async setupHandLandmarker() {
    try {
      console.log('Loading MediaPipe Hand Landmarker...');
      const vision = await FilesetResolver.forVisionTasks(this.assetRoot + 'wasm');
      console.log('Vision fileset loaded');

      const modelPath = this.assetRoot + 'hand_landmarker.task';
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: this.numHands,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      console.log('Hand Landmarker ready');
      this.hasHandControl = true;
      this.statusElement.textContent = 'Pinch to rotate and zoom';
    } catch (err) {
      console.error('Hand Landmarker setup failed:', err);
      this.showError(`Hand detection unavailable: ${err.message}. Ensure 'hand_landmarker.task' and WASM files ('vision_wasm_internal.js', 'vision_wasm_internal.wasm') are in ./wasm/. Cursor will rotate statically.`);
      this.hasHandControl = false;
    }
  }

  // Hand detection callback
  onHandResults(results) {
    let spherical = null;
    const numHands = this.numHands;
    const landmarksArr = results.landmarks || [];
    let pinchDetected = Array(numHands).fill(false);
    for (let handIndex = 0; handIndex < Math.min(numHands, landmarksArr.length); handIndex++) {
      const landmarks = landmarksArr[handIndex];
      if (!landmarks) continue;
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

      if (dist < 0.05) {
        pinchDetected[handIndex] = true;
        // Dispatch pinchstart event for each hand
        if (!this.isPinching[handIndex]) {
          this.dispatchEvent({ type: 'pinchstart', handIndex });
        }
        this.isPinching[handIndex] = true;
        if (handIndex === 0) {
          // Only first hand controls camera and cursor
          const smoothingFactor = 0.2;
          this.smoothedThumbX = this.smoothedThumbX * (1 - smoothingFactor) + thumbTip.x * smoothingFactor;
          this.smoothedThumbY = this.smoothedThumbY * (1 - smoothingFactor) + thumbTip.y * smoothingFactor;
          this.smoothedThumbZ = this.smoothedThumbZ * (1 - smoothingFactor) + thumbTip.z * smoothingFactor;
          const cursorDistance = 5;
          this.cursor.position.set(
            (0.5 - thumbTip.x) * 10,
            -(thumbTip.y - 0.5) * 7.5,
            -cursorDistance
          );
          this.cursor.material.color.set(0x00ff00);
          const deltaX = this.smoothedThumbX - this.lastThumbX;
          const deltaY = this.smoothedThumbY - this.lastThumbY;
          const deltaZ = this.smoothedThumbZ - this.lastThumbZ;
          const deadZone = 0.0005;
          const rotationSpeed = 15;
          if (Math.abs(deltaX) > deadZone || Math.abs(deltaY) > deadZone) {
            const offset = this.camera.position.clone().sub(this.target);
            spherical = new THREE.Spherical();
            spherical.setFromVector3(offset);
            if (Math.abs(deltaX) > deadZone) {
              spherical.theta += deltaX * rotationSpeed;
            }
            if (Math.abs(deltaY) > deadZone) {
              spherical.phi -= deltaY * rotationSpeed;
            }
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            const newPosition = new THREE.Vector3().setFromSpherical(spherical);
            this.camera.position.copy(this.target).add(newPosition);
            this.camera.lookAt(this.target);
          }
          const zoomSpeed = 200;
          if (Math.abs(deltaZ) > deadZone) {
            const offset = this.camera.position.clone().sub(this.target);
            spherical = spherical || new THREE.Spherical();
            spherical.setFromVector3(offset);
            spherical.radius -= deltaZ * zoomSpeed;
            spherical.radius = Math.max(10, Math.min(50, spherical.radius));
            const newPosition = new THREE.Vector3().setFromSpherical(spherical);
            this.camera.position.copy(this.target).add(newPosition);
            this.camera.lookAt(this.target);
          }
          this.lastThumbX = this.smoothedThumbX;
          this.lastThumbY = this.smoothedThumbY;
          this.lastThumbZ = this.smoothedThumbZ;
        }
      } else {
        this.isPinching[handIndex] = false;
      }
    }
    // If no pinch detected on first hand, set cursor to red
    if (!pinchDetected[0]) {
      this.cursor.material.color.set(0xff0000);
    }
    // If no hands detected at all, reset all pinch states
    if (landmarksArr.length === 0) {
      for (let i = 0; i < this.isPinching.length; i++) {
        this.isPinching[i] = false;
      }
      this.cursor.material.color.set(0xff0000);
    }
  }

  // Process video frames
  async processFrames() {
    if (!this.handLandmarker || !this.video.videoWidth) return;
    const results = await this.handLandmarker.detectForVideo(this.video, performance.now());
    this.onHandResults(results);
    requestAnimationFrame(() => this.processFrames());
  }

  // Initialize controls
  async init() {
    try {
      console.log('Starting MediaPipeOrbitControls init...');
      const camReady = await this.setupCamera();
      await this.setupHandLandmarker();
      if (this.hasHandControl && camReady) {
        this.processFrames();
      }
    } catch (err) {
      this.showError('MediaPipeOrbitControls init failed: ' + err.message);
      console.error('MediaPipeOrbitControls init error:', err);
    }
  }

  // Update animation (called externally)
  update() {
    if (!this.hasHandControl) {
      this.cursor.rotation.x += 0.01;
      this.cursor.rotation.y += 0.01;
    } else if (!this.isPinching[0]) {
      this.cursor.rotation.z += 0.005;
    }
  }
}
