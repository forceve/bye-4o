import * as THREE from "https://esm.sh/three@0.161.0";
import { Fire } from "https://esm.sh/@wolffo/three-fire";

const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Canvas not found");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(new THREE.Color(0.86, 0.86, 0.88), 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(0.86, 0.86, 0.88), 8, 32);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
camera.position.set(0, 4, 12);
camera.lookAt(new THREE.Vector3(0, 2, 0));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
directionalLight.position.set(0.3, 1.0, 0.2);
scene.add(ambientLight, directionalLight);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.82, 0.82, 0.8),
  roughness: 0.9,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
scene.add(ground);

const ringMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.32, 0.32, 0.34),
  roughness: 0.6,
  metalness: 0.1,
  side: THREE.DoubleSide,
});

const ringGroup = new THREE.Group();
const ringFloor = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 96), ringMaterial);
ringFloor.rotation.x = -Math.PI / 2;
ringFloor.position.y = -0.05;
ringGroup.add(ringFloor);

const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.09, 96, 1, true), ringMaterial);
innerWall.position.y = -0.005;
ringGroup.add(innerWall);

const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.09, 96, 1, true), ringMaterial);
outerWall.position.y = -0.005;
ringGroup.add(outerWall);

ringGroup.position.y = 0.04;
scene.add(ringGroup);

const obeliskMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.05, 0.05, 0.06),
  roughness: 0.35,
  metalness: 0.2,
});
const obelisk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 1.2), obeliskMaterial);
obelisk.position.set(0, 3, 0);
obelisk.rotation.y = 0.2;
scene.add(obelisk);

const benchMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.2, 0.2, 0.22),
  roughness: 0.55,
  metalness: 0.1,
});
const benchLegMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.18, 0.18, 0.2),
  roughness: 0.65,
  metalness: 0.08,
});

const benchGroup = new THREE.Group();
const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 1.2), benchMaterial);
benchSeat.position.set(0, 0.55, 0);
benchGroup.add(benchSeat);

const benchLegGeometry = new THREE.BoxGeometry(0.5, 0.7, 0.9);
const leftLeg = new THREE.Mesh(benchLegGeometry, benchLegMaterial);
leftLeg.position.set(-1.6, 0.35, 0);
benchGroup.add(leftLeg);

const rightLeg = new THREE.Mesh(benchLegGeometry, benchLegMaterial);
rightLeg.position.set(1.6, 0.35, 0);
benchGroup.add(rightLeg);

benchGroup.position.set(0, 0, 2.3);
benchGroup.scale.setScalar(0.8);
scene.add(benchGroup);

const fireGeometry = new THREE.CylinderGeometry(0.4, 0.65, 1.6, 32, 1, true);
const fire = new Fire(fireGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  color1: new THREE.Color(1.0, 0.82, 0.45),
  color2: new THREE.Color(1.0, 0.45, 0.1),
  color3: new THREE.Color(0.25, 0.05, 0.02),
  colorBias: 0.8,
  burnRate: 1.2,
  diffuse: 1.4,
  viscosity: 0.3,
  expansion: 0.4,
  swirl: 2.6,
  drag: 0.35,
  airSpeed: 1.6,
  wind: new THREE.Vector2(0.4, 1.1),
  speed: 0.7,
  mass: 0.9,
});
fire.position.set(0, 0.6, 0);
scene.add(fire);

const fireLight = new THREE.PointLight(0xffa24a, 1.4, 8, 2.1);
fireLight.position.set(0, 0.9, 0);
scene.add(fireLight);

const clock = new THREE.Clock();

const setSize = () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

window.addEventListener("resize", setSize);
setSize();

const render = () => {
  const elapsed = clock.getElapsedTime();
  fire.update(elapsed * 0.8);
  fireLight.intensity = 1.25 + Math.sin(elapsed * 6.4) * 0.2 + Math.cos(elapsed * 11.2) * 0.1;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
};

const createAudio = () => {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }

  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 260;
  windFilter.Q.value = 0.7;

  const windGain = context.createGain();
  windGain.gain.value = 0.2;

  noiseSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  noiseSource.start();

  const triggerResonance = () => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 240 + Math.random() * 180;

    const resonanceGain = context.createGain();
    resonanceGain.gain.value = 0.0;

    osc.connect(resonanceGain);
    resonanceGain.connect(master);

    const now = context.currentTime;
    resonanceGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    resonanceGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

    osc.start();
    osc.stop(now + 2.1);
  };

  const scheduleResonance = () => {
    triggerResonance();
    const delay = 6000 + Math.random() * 8000;
    window.setTimeout(scheduleResonance, delay);
  };

  scheduleResonance();

  return context;
};

let audioContext: AudioContext | null = null;

const handleAudioStart = () => {
  if (!audioContext) {
    audioContext = createAudio();
  }
};

canvas.addEventListener("pointerdown", handleAudioStart, { once: true });

requestAnimationFrame(render);
