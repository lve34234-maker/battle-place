/* ============================================================
   engine.js — 렌더러 / 씬 / 카메라 / 조명 / 환경맵(빛 반사)
   ============================================================ */
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const engine = {
  renderer: null, scene: null, camera: null, sun: null, sky: null, envRT: null,
};

export function initEngine() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 영화적 톤 → 자연스러운 빛
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcc9d6, 140, 620);

  const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 1400);

  /* ---- 하늘 (실제 대기 산란) ---- */
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;

  /* ---- 태양 위치 ---- */
  const sunDir = new THREE.Vector3();
  const elev = 32, azim = 135; // 도
  const phi = THREE.MathUtils.degToRad(90 - elev);
  const theta = THREE.MathUtils.degToRad(azim);
  sunDir.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);

  /* ---- 직사광(태양) + 그림자 ---- */
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 700; sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  /* ---- 환경광(하늘/지면 반사색) ---- */
  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x586247, 0.6));

  /* ---- 환경맵: 금속/총기 표면의 빛 반사용 (IBL) ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  engine.renderer = renderer;
  engine.scene = scene;
  engine.camera = camera;
  engine.sun = sun;
  engine.sky = sky;
  engine.envRT = envRT;

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return engine;
}

/* 태양 그림자 카메라가 플레이어를 따라가도록 */
export function followSunShadow(target) {
  const { sun } = engine;
  const dir = sun.position.clone().normalize();
  sun.position.copy(target).addScaledVector(dir, 300);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
}
