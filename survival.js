"use strict";
/* ============================================================
   배틀플레이스: 생존 (Battle Place: SURVIVAL)
   ------------------------------------------------------------
   • 현실적인 지형(노이즈 기반 산/평야/해변/바다)
   • PBR 빛반사(환경맵, 톤매핑) — "고퀄 빛반사"
   • 낮/밤 사이클 + 기본 물리(중력/지형 충돌)
   • 생존: 체력/허기/갈증/스태미나/체온
   • 채집(나무·돌·열매·물) → 제작(석기시대~현대 무기 테크트리)
   • Supabase 실시간 멀티플레이(모든 플레이어 함께) + 나라 선택
   • 모던 무기는 너가 준 진짜 GLB 모델 사용
   ============================================================ */

/* ---------------- 결정론적 노이즈 (모든 접속자가 같은 지형) ---------------- */
const Noise = (function () {
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y, oct) {
    oct = oct || 5; let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * freq, y * freq); norm += amp; amp *= 0.5; freq *= 2; }
    return sum / norm;
  }
  return { fbm, vnoise };
})();

const SEA = 0;               // 해수면 높이
function heightAt(x, z) {
  const s = 0.0032;
  let h = Noise.fbm(x * s + 1000, z * s + 1000, 6);   // 0..1
  h = Math.pow(h, 1.7);                                // 저지대 평탄화
  let elev = h * 70 - 14;                              // 대략 -14 ~ 56
  // 잔잔한 디테일
  elev += (Noise.fbm(x * 0.02 + 50, z * 0.02 + 50, 3) - 0.5) * 4;
  return elev;
}
function biomeColor(h, slope) {
  const c = new THREE.Color();
  if (h < SEA + 1.2) c.setHex(0xC2B280);            // 모래 해변
  else if (slope > 0.62 || h > 42) c.setHex(0x7d7d7d); // 바위/절벽
  else if (h > 34) c.setHex(0xe8edf2);              // 설산
  else if (h > 20) c.setHex(0x4f6b3a);             // 고지대 숲
  else c.setHex(0x5f8a44);                          // 평야 풀
  return c;
}

/* ---------------- 나라 목록 ---------------- */
const COUNTRIES = [
  { f: "🇰🇷", n: "대한민국", c: 0x3b6fd4 }, { f: "🇺🇸", n: "미국", c: 0xc23b3b },
  { f: "🇯🇵", n: "일본", c: 0xd45050 }, { f: "🇨🇳", n: "중국", c: 0xd4b13b },
  { f: "🇬🇧", n: "영국", c: 0x4257b0 }, { f: "🇫🇷", n: "프랑스", c: 0x3b8ad4 },
  { f: "🇩🇪", n: "독일", c: 0x444444 }, { f: "🇧🇷", n: "브라질", c: 0x46b04a },
  { f: "🇷🇺", n: "러시아", c: 0xb04a8a }, { f: "🇮🇳", n: "인도", c: 0xd48b3b },
  { f: "🇨🇦", n: "캐나다", c: 0xc24747 }, { f: "🇦🇺", n: "호주", c: 0x3bb0a0 },
];

/* ---------------- 시대 + 제작(테크트리) ---------------- */
// 자원: wood 나무, stone 돌, fiber 섬유, iron 철, gunpowder 화약, food 음식
const AGES = ["석기 시대", "청동기·철기", "중세", "화약 시대", "현대"];
const RECIPES = [
  // 석기 (★ 나무곡괭이부터: 나무만으로 만들어 돌을 캘 수 있음 — 마크처럼)
  { id: "wood_pickaxe",  name: "나무곡괭이", age: 0, cost: { wood: 3 },                    dmg: 10, range: 3.0, kind: "melee", mine: 1, icon: "⛏️" },
  { id: "stone_pickaxe", name: "돌곡괭이",   age: 0, cost: { wood: 2, stone: 3 },          dmg: 16, range: 3.2, kind: "melee", mine: 2, icon: "⛏️" },
  { id: "stone_axe",   name: "돌도끼",   age: 0, cost: { wood: 3, stone: 2 },            dmg: 18, range: 3.2, kind: "melee", mine: 2, icon: "🪓" },
  { id: "stone_spear", name: "돌창",     age: 0, cost: { wood: 4, stone: 2, fiber: 2 },  dmg: 26, range: 4.0, kind: "melee", icon: "🗡️" },
  { id: "campfire",    name: "모닥불",   age: 0, cost: { wood: 6, stone: 4 },            kind: "build", icon: "🔥" },
  // 청동기·철기
  { id: "iron_pickaxe", name: "철곡괭이", age: 1, cost: { iron: 3, wood: 2 },            dmg: 24, range: 3.4, kind: "melee", mine: 3, icon: "⛏️" },
  { id: "iron_sword",  name: "철검",     age: 1, cost: { iron: 4, wood: 2 },             dmg: 40, range: 3.4, kind: "melee", icon: "⚔️" },
  { id: "bow",         name: "활",       age: 1, cost: { wood: 5, fiber: 4 },            dmg: 35, range: 70, kind: "ranged", proj: 55, icon: "🏹", mag: 1, reload: 1.1 },
  { id: "shield",      name: "방패",     age: 1, cost: { iron: 3, wood: 3 },             kind: "armor", armor: 0.4, icon: "🛡️" },
  // 중세
  { id: "crossbow",    name: "석궁",     age: 2, cost: { iron: 4, wood: 6, fiber: 3 },   dmg: 60, range: 90, kind: "ranged", proj: 80, icon: "🎯", mag: 1, reload: 1.8 },
  { id: "plate",       name: "판금갑옷", age: 2, cost: { iron: 10 },                      kind: "armor", armor: 0.6, icon: "🥋" },
  // 화약
  { id: "musket",      name: "머스킷",   age: 3, cost: { iron: 6, wood: 4, gunpowder: 3 }, dmg: 75, range: 120, kind: "gun", rpm: 30, mag: 1, reload: 2.6, icon: "🔫" },
  // 현대 (진짜 GLB 모델 사용)
  { id: "pistol",      name: "권총",     age: 4, cost: { iron: 4, gunpowder: 4 },        dmg: 26, range: 90,  rpm: 360, mag: 12, reload: 1.4, kind: "gun", icon: "🔫" },
  { id: "mp5k",        name: "MP5K",     age: 4, cost: { iron: 8, gunpowder: 8 },        dmg: 20, range: 80,  rpm: 900, mag: 30, reload: 2.0, kind: "gun", model: "mp5k", icon: "🔫" },
  { id: "m4a1",        name: "M4A1",     age: 4, cost: { iron: 12, gunpowder: 10 },      dmg: 28, range: 160, rpm: 660, mag: 30, reload: 2.4, kind: "gun", model: "m4a1", icon: "🔫" },
  { id: "ksr29",       name: "KSR-29",   age: 4, cost: { iron: 16, gunpowder: 14 },      dmg: 95, range: 400, rpm: 50,  mag: 5,  reload: 3.5, kind: "gun", model: "ksr29", icon: "🔫" },
  { id: "awp",         name: "AWP",      age: 4, cost: { iron: 20, gunpowder: 18 },      dmg: 120,range: 500, rpm: 41,  mag: 5,  reload: 3.8, kind: "gun", model: "awp", icon: "🔫" },
];

/* ---------------- 전역 ---------------- */
let scene, camera, renderer, clock, sun, hemi, sky, water, envRT;
let composer, gradePass, fxaaPass, useFX = false;
let raycaster = new THREE.Raycaster();

/* 시네마틱 컬러 그레이딩 + 비네트 + 필름 그레인 (TLOU 무드) */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col = (col-0.5)*1.13 + 0.5;                 // 대비
      float g = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(g), col, 0.82);              // 채도 살짝 ↓
      col *= vec3(0.97,1.04,0.95);               // 녹색 무드
      vec2 d = vUv-0.5; float v = smoothstep(0.95,0.28,length(d));
      col *= mix(0.62,1.0,v);                     // 비네트
      col += (rand(vUv*(time+1.0))-0.5)*0.035;    // 필름 그레인
      gl_FragColor = vec4(col,1.0);
    }`,
};
const glbModels = {};
let terrainMesh;
let resources = [];   // 채집물 {mesh,type,hp,x,z}
let animals = [];
let others = {};      // 다른 플레이어 {id:{group,nameSprite,hp,target,...}}
let projectiles = [];
let state = "loading";
let dayTime = 0.30;   // 0~1 (0=자정,0.5=정오)
const DAY_LEN = 480;  // 하루 길이(초)

/* 건축(블록 쌓기) */
const G = 2;                 // 블록 한 칸 크기
let blocks = [];             // {mesh,x,y,z,type}
let buildMode = false;
let buildMat = "wood";       // wood | stone
let ghost = null;
const _center = new THREE.Vector2(0, 0);

const P = {
  pos: new THREE.Vector3(0, 30, 0), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, onGround: false,
  hp: 100, hunger: 100, thirst: 100, stamina: 100, temp: 36.5,
  nick: "플레이어", country: "🌍", color: 0x66ccff,
  inv: { wood: 0, stone: 0, fiber: 0, iron: 0, gunpowder: 0, food: 0 },
  age: 0, unlocked: { fist: true }, hotbar: ["fist"], slot: 0,
  ammo: {}, armor: 0, reloading: false, reloadEnd: 0, nextAct: 0,
  heldModel: null, alive: true, kills: 0,
};
const FIST = { id: "fist", name: "맨손", dmg: 8, range: 2.6, kind: "melee", icon: "✊" };
function recipeById(id) { return id === "fist" ? FIST : RECIPES.find(r => r.id === id); }

const keys = {};
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/* ============================================================
   부팅 흐름
   ============================================================ */
window.addEventListener("load", () => {
  buildCountryGrid();
  loadModels(() => {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("start").classList.remove("hidden");
    state = "menu";
  });
});

function buildCountryGrid() {
  const grid = document.getElementById("countryGrid");
  COUNTRIES.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "country" + (i === 0 ? " sel" : "");
    d.innerHTML = `<span class="flag">${c.f}</span><span class="cn">${c.n}</span>`;
    d.onclick = () => {
      document.querySelectorAll(".country").forEach(e => e.classList.remove("sel"));
      d.classList.add("sel");
      P.country = c.f; P.color = c.c;
    };
    grid.appendChild(d);
  });
  P.country = COUNTRIES[0].f; P.color = COUNTRIES[0].c;
}

document.getElementById("startBtn").onclick = startGame;

function startGame() {
  P.nick = (document.getElementById("nick").value.trim()) || ("생존자" + Math.floor(Math.random() * 9000 + 1000));
  document.getElementById("start").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  if (isMobile) document.getElementById("touch").classList.remove("hidden");

  initThree();
  buildWorld();
  spawnAnimals(14);
  // 시작 위치: 육지 위
  let sx = 0, sz = 0, tries = 0;
  do { sx = (Math.random() - .5) * 200; sz = (Math.random() - .5) * 200; tries++; }
  while (heightAt(sx, sz) < SEA + 2 && tries < 50);
  P.pos.set(sx, heightAt(sx, sz) + 1.8, sz);

  Net.init({ nick: P.nick, country: P.country, color: P.color }, {
    onState: onPeerState, onLeave: onPeerLeave, onHit: onPeerHit, onChat: onPeerChat,
  });
  document.getElementById("netBadge").textContent = Net.online() ? "🟢 온라인" : "⚪ 혼자 모드";

  state = "playing";
  if (!isMobile) renderer.domElement.requestPointerLock();
  clock = new THREE.Clock();
  rebuildHotbar();
  animate();
}
document.addEventListener("click", () => {
  if (state === "playing" && !isMobile && !document.pointerLockElement)
    renderer.domElement.requestPointerLock();
});

/* ============================================================
   Three 초기화 (PBR 빛반사 / 톤매핑)
   ============================================================ */
function initThree() {
  scene = new THREE.Scene();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);

  sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 600;
  scene.add(sun);
  scene.add(sun.target);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5238, 0.7);
  scene.add(hemi);

  // 환경맵(빛반사) — 그라데이션 하늘을 PMREM으로 구워서 반사에 사용
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyTex = makeSkyEquirect();
  envRT = pmrem.fromEquirectangular(skyTex);
  scene.environment = envRT.texture;
  skyTex.dispose();

  // 하늘 돔
  const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x2a6bd4) }, bot: { value: new THREE.Color(0xcfe6ff) } },
    vertexShader: "varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "varying vec3 vp; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp((normalize(vp).y+0.1)*0.9,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0);}",
  });
  sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xbcd2e8, 0.0016);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
    if (fxaaPass) fxaaPass.material.uniforms.resolution.value.set(1 / innerWidth, 1 / innerHeight);
  });
  setupFX();
  bindInput();
}

/* 후처리 파이프라인 (데스크톱만 — 모바일은 성능 위해 끔) */
function setupFX() {
  useFX = false;
  if (isMobile || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.ShaderPass) return;
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.85));
    gradePass = new THREE.ShaderPass(GradeShader);
    composer.addPass(gradePass);
    if (THREE.FXAAShader) {
      fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
      fxaaPass.material.uniforms.resolution.value.set(1 / innerWidth, 1 / innerHeight);
      composer.addPass(fxaaPass);
    }
    useFX = true;
  } catch (e) { console.warn("[FX] 후처리 비활성화:", e); useFX = false; }
}

function makeSkyEquirect() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#2a6bd4"); grd.addColorStop(0.5, "#7fb0e8"); grd.addColorStop(1, "#dfeeff");
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* ============================================================
   월드: 현실적 지형 + 바다 + 채집물
   ============================================================ */
function buildWorld() {
  const SIZE = 700, SEG = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const slope = 1 - nrm.getY(i);
    const col = biomeColor(pos.getY(i), slope);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35 });
  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 바다 (빛반사)
  const wmat = new THREE.MeshStandardMaterial({
    color: 0x2b6f8f, transparent: true, opacity: 0.82,
    roughness: 0.06, metalness: 0.0, envMapIntensity: 1.0,
  });
  water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.2, SIZE * 1.2), wmat);
  water.rotation.x = -Math.PI / 2; water.position.y = SEA;
  scene.add(water);

  // 채집물 + 무성한 풀
  scatterResources();
  scatterGrass();
}

/* 우거진 풀 — InstancedMesh 1개로 수천 포기(가벼움) */
function scatterGrass() {
  const blade = new THREE.ConeGeometry(0.13, 0.75, 4); blade.translate(0, 0.37, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4c7a2e, roughness: 1, flatShading: true });
  const COUNT = 2600;
  const im = new THREE.InstancedMesh(blade, mat, COUNT);
  const o = new THREE.Object3D(); const tint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < COUNT * 4 && placed < COUNT; i++) {
    const x = (Math.random() - .5) * 660, z = (Math.random() - .5) * 660, y = heightAt(x, z);
    if (y < SEA + 0.8 || y > 30) continue;
    o.position.set(x, y, z); o.rotation.y = Math.random() * 6.28;
    const s = 0.7 + Math.random() * 1.1; o.scale.set(s, s + Math.random() * 0.6, s);
    o.updateMatrix(); im.setMatrixAt(placed, o.matrix);
    tint.setHSL(0.25 + Math.random() * 0.07, 0.45, 0.28 + Math.random() * 0.1);
    im.setColorAt(placed, tint);
    placed++;
  }
  im.count = placed; im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = false; im.receiveShadow = true;
  scene.add(im);
}

function scatterResources() {
  const place = (type, count, mk) => {
    let n = 0, tries = 0;
    while (n < count && tries < count * 30) {
      tries++;
      const x = (Math.random() - .5) * 640, z = (Math.random() - .5) * 640;
      const y = heightAt(x, z);
      if (type === "tree" && (y < SEA + 2 || y > 36)) continue;
      if (type === "rock" && y < SEA + 1) continue;
      if (type === "bush" && (y < SEA + 1.5 || y > 30)) continue;
      const m = mk(x, y, z); m.position.set(x, y, z);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(m);
      resources.push({ mesh: m, type, x, z, y, hp: type === "rock" ? 5 : type === "tree" ? 4 : 2, rad: type === "rock" ? 1.1 : type === "tree" ? 0.6 : 0 });
      n++;
    }
  };
  place("tree", 220, () => {
    const g = new THREE.Group();
    const h = 4 + Math.random() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 7),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }));
    trunk.position.y = h / 2; g.add(trunk);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + Math.random(), 0),
      new THREE.MeshStandardMaterial({ color: 0x2f6b30, roughness: 0.9, flatShading: true }));
    leaf.position.y = h + 1; g.add(leaf);
    return g;
  });
  place("rock", 120, () => new THREE.Mesh(
    new THREE.DodecahedronGeometry(1 + Math.random() * 1.2, 0),
    new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.85, metalness: 0.05, flatShading: true })));
  place("bush", 90, () => new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0x4f8b3a, roughness: 1, flatShading: true })));
}

function spawnAnimals(n) {
  for (let i = 0; i < n; i++) {
    let x, z, y, t = 0;
    do { x = (Math.random() - .5) * 500; z = (Math.random() - .5) * 500; y = heightAt(x, z); t++; }
    while (y < SEA + 2 && t < 40);
    const g = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 });
    const hide2 = new THREE.MeshStandardMaterial({ color: 0x8a5b35, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.7), hide);
    body.position.y = 1.0; g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), hide);
    neck.position.set(0.72, 1.25, 0); g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), hide2);
    head.position.set(1.0, 1.5, 0); g.add(head);
    // 다리 4개 — 엉덩이(위쪽)에서 회전하도록 지오메트리를 아래로 이동
    const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2); legGeo.translate(0, -0.4, 0);
    const legs = [];
    [[0.5, 0.25], [0.5, -0.25], [-0.5, 0.25], [-0.5, -0.25]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, hide2);
      leg.position.set(lx, 0.75, lz); g.add(leg); legs.push(leg);
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.45), hide2);
    tail.position.set(-0.78, 1.1, 0); g.add(tail);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, y, z); scene.add(g);
    animals.push({
      mesh: g, legs, x, z, hp: 30, alive: true,
      heading: Math.random() * 6.28, targetHeading: Math.random() * 6.28,
      speed: 0, state: "graze", timer: Math.random() * 3, phase: Math.random() * 6.28,
    });
  }
}

/* ============================================================
   입력
   ============================================================ */
function bindInput() {
  addEventListener("keydown", e => {
    keys[e.code] = true;
    if (state !== "playing") return;
    if (e.code === "KeyE") toggleCraft();
    if (e.code === "KeyB") toggleBuild();
    if (e.code === "KeyQ" && buildMode) toggleBuildMat();
    if (e.code === "KeyX" && buildMode) removeBlock();
    if (e.code === "KeyR") startReload();
    if (e.code === "KeyF") interact();
    if (e.code === "Space") { if (P.onGround) { P.vel.y = 8.5; P.onGround = false; } }
    if (/^Digit[1-9]$/.test(e.code)) selectSlot(parseInt(e.code.slice(5)) - 1);
    if (e.code === "Enter") openChat();
  });
  addEventListener("keyup", e => { keys[e.code] = false; });
  addEventListener("mousedown", e => {
    if (state !== "playing") return;
    if (e.button === 0) primaryAction();
  });
  addEventListener("contextmenu", e => e.preventDefault());
  addEventListener("mousemove", e => {
    if (state !== "playing" || isMobile) return;
    if (document.pointerLockElement) {
      P.yaw -= e.movementX * 0.0022;
      P.pitch -= e.movementY * 0.0022;
      P.pitch = Math.max(-1.4, Math.min(1.4, P.pitch));
    }
  });
}

/* ============================================================
   메인 루프
   ============================================================ */
function animate() {
  if (state !== "playing") return;
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  updatePlayer(dt);
  updateSurvival(dt);
  updateAnimals(dt);
  updateProjectiles(dt);
  updateOthers(dt);
  updateBuild();
  updateDayNight(dt);
  updateCamera();
  Net.sendState({
    x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, hp: P.hp,
    w: P.hotbar[P.slot], alive: P.alive,
  }, now);
  updateHUD();
  if (useFX) { gradePass.uniforms.time.value = now * 0.001; composer.render(); }
  else renderer.render(scene, camera);
}

/* ---------------- 이동 / 물리 ---------------- */
function updatePlayer(dt) {
  if (!P.alive) return;
  let mx = 0, mz = 0;
  if (keys["KeyW"]) mz += 1; if (keys["KeyS"]) mz -= 1;
  if (keys["KeyA"]) mx -= 1; if (keys["KeyD"]) mx += 1;
  const run = (keys["ShiftLeft"] || keys["ShiftRight"]) && P.stamina > 1 && (mx || mz);
  const base = keys["ControlLeft"] ? 2.5 : (run ? 8.5 : 5);
  if (run) P.stamina = Math.max(0, P.stamina - dt * 12);
  else P.stamina = Math.min(100, P.stamina + dt * 8);

  const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const right = new THREE.Vector3(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); // A=왼쪽 / D=오른쪽
  const move = new THREE.Vector3();
  move.addScaledVector(fwd, mz).addScaledVector(right, mx);
  if (move.length() > 0) move.normalize();
  P.vel.x = move.x * base; P.vel.z = move.z * base;

  P.vel.y -= 22 * dt; // 중력

  // 수평 충돌 (나무·돌·동물·블록 통과 금지, 벽 따라 미끄러짐)
  const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
  if (!blockedAt(nx, P.pos.z)) P.pos.x = nx;
  if (!blockedAt(P.pos.x, nz)) P.pos.z = nz;
  P.pos.y += P.vel.y * dt;

  // 수직 충돌 (지형 + 블록 위에 서기, 눈높이 1.8)
  const ground = supportHeight(P.pos.x, P.pos.z) + 1.8;
  if (P.pos.y <= ground) { P.pos.y = ground; P.vel.y = 0; P.onGround = true; }
  else P.onGround = false;

  const lim = 345;
  P.pos.x = Math.max(-lim, Math.min(lim, P.pos.x));
  P.pos.z = Math.max(-lim, Math.min(lim, P.pos.z));

  // 재장전 완료
  const w = recipeById(P.hotbar[P.slot]);
  if (P.reloading && performance.now() >= P.reloadEnd) {
    P.ammo[w.id] = w.mag; P.reloading = false;
  }

  // 상호작용 힌트
  const tgt = aimTarget();
  const hint = document.getElementById("hint");
  if (buildMode) { hint.classList.remove("show"); }
  else if (tgt) { hint.classList.add("show"); document.getElementById("hintTxt").innerHTML = tgt.label; }
  else hint.classList.remove("show");
}

/* ---------------- 충돌 ---------------- */
function blockedAt(x, z) {
  const pr = 0.45, feet = P.pos.y - 1.8, head = feet + 1.7;
  for (const r of resources) {
    if (!r.rad) continue;
    const dx = x - r.x, dz = z - r.z, rr = pr + r.rad;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  for (const a of animals) {
    if (!a.alive) continue;
    const dx = x - a.x, dz = z - a.z, rr = pr + 0.6;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  for (const b of blocks) {
    if (Math.abs(x - b.x) < G / 2 + pr && Math.abs(z - b.z) < G / 2 + pr) {
      const top = b.y + G / 2, bot = b.y - G / 2;
      if (top > feet + 0.6 && bot < head) return true; // 바닥/계단은 통과(그 위에 서짐)
    }
  }
  return false;
}
function supportHeight(x, z) {
  let base = heightAt(x, z); const feet = P.pos.y - 1.8;
  for (const b of blocks) {
    if (Math.abs(x - b.x) < G / 2 + 0.35 && Math.abs(z - b.z) < G / 2 + 0.35) {
      const top = b.y + G / 2;
      if (top <= feet + 0.7 && top > base) base = top;
    }
  }
  return base;
}

/* ---------------- 건축(블록) ---------------- */
function toggleBuild() {
  buildMode = !buildMode;
  document.getElementById("buildBadge").classList.toggle("hidden", !buildMode);
  if (buildMode && !ghost) makeGhost();
  if (ghost) ghost.visible = buildMode;
  updateBuildBadge();
}
function toggleBuildMat() {
  buildMat = buildMat === "wood" ? "stone" : "wood";
  updateBuildBadge();
}
function updateBuildBadge() {
  document.getElementById("buildBadge").innerHTML =
    `🏠 건축 모드 — 좌클릭 <b>설치</b> · X <b>제거</b> · Q 재료(<b>${buildMat === "wood" ? "🪵 나무" : "🪨 돌"}</b>) · B 종료`;
}
function makeGhost() {
  ghost = new THREE.Mesh(new THREE.BoxGeometry(G, G, G),
    new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(G, G, G)),
    new THREE.LineBasicMaterial({ color: 0x183 })));
  ghost.visible = false; scene.add(ghost);
}
function buildTarget() {
  raycaster.setFromCamera(_center, camera);
  const meshes = [terrainMesh]; for (const b of blocks) meshes.push(b.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length || hits[0].distance > 9) return null;
  const h = hits[0];
  if (h.object === terrainMesh) {
    const gx = Math.round(h.point.x / G) * G, gz = Math.round(h.point.z / G) * G;
    const gy = Math.round((heightAt(gx, gz) + G / 2) / G) * G;
    return new THREE.Vector3(gx, gy, gz);
  }
  const b = blocks.find(bb => bb.mesh === h.object); if (!b) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
  n.x = Math.abs(n.x) > 0.5 ? Math.sign(n.x) : 0;
  n.y = Math.abs(n.y) > 0.5 ? Math.sign(n.y) : 0;
  n.z = Math.abs(n.z) > 0.5 ? Math.sign(n.z) : 0;
  return new THREE.Vector3(b.x + n.x * G, b.y + n.y * G, b.z + n.z * G);
}
function placeBlock() {
  const t = buildTarget();
  if (!t) { toast("설치할 곳을 바라보세요"); return; }
  if (blocks.some(b => b.x === t.x && b.y === t.y && b.z === t.z)) return;
  const cost = buildMat === "wood" ? { wood: 2 } : { stone: 3 };
  if (!canAfford(cost)) { toast(`재료 부족! (${buildMat === "wood" ? "🪵2" : "🪨3"})`); return; }
  for (const k in cost) P.inv[k] -= cost[k];
  const mat = buildMat === "wood"
    ? new THREE.MeshStandardMaterial({ color: 0x9a6b35, roughness: 0.92 })
    : new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.85, metalness: 0.04 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(G, G, G), mat);
  m.position.copy(t); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  blocks.push({ mesh: m, x: t.x, y: t.y, z: t.z, type: buildMat });
}
function removeBlock() {
  raycaster.setFromCamera(_center, camera);
  const meshes = blocks.map(b => b.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length || hits[0].distance > 9) return;
  const b = blocks.find(bb => bb.mesh === hits[0].object); if (!b) return;
  scene.remove(b.mesh); blocks = blocks.filter(x => x !== b);
  addItem(b.type, 1); // 일부 환급
}
function updateBuild() {
  if (!buildMode || !ghost) { if (ghost) ghost.visible = false; return; }
  const t = buildTarget();
  if (t) { ghost.visible = true; ghost.position.copy(t); } else ghost.visible = false;
}

/* ---------------- 생존 스탯 ---------------- */
function updateSurvival(dt) {
  if (!P.alive) return;
  P.hunger = Math.max(0, P.hunger - dt * 0.55);
  P.thirst = Math.max(0, P.thirst - dt * 0.8);
  // 밤에는 체온 하락, 모닥불/낮엔 회복
  const night = dayTime < 0.25 || dayTime > 0.78;
  P.temp += (night ? -0.05 : 0.03) * dt * (nearCampfire() ? -1 : 1);
  P.temp = Math.max(28, Math.min(38, P.temp));

  let dmg = 0;
  if (P.hunger <= 0) dmg += 1.2;
  if (P.thirst <= 0) dmg += 1.6;
  if (P.temp < 33) dmg += (33 - P.temp) * 0.4;
  if (P.pos.y < SEA + 1.7) dmg += 2; // 물에 빠짐(간이)
  if (dmg > 0) damageSelf(dmg * dt, "환경");
  else if (P.hunger > 40 && P.thirst > 40) P.hp = Math.min(100, P.hp + dt * 1.5); // 회복
}

let campfires = [];
function nearCampfire() {
  for (const c of campfires) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 6) return true;
  return false;
}

/* 지금 든 게 채광 가능한 도구인지(곡괭이/도끼). 맨손=불가 */
function canMineHeld() {
  const w = recipeById(P.hotbar[P.slot]);
  return !!(w && w.kind === "melee" && w.mine);
}

/* ---------------- 조준 대상(채집물/동물/플레이어) ---------------- */
function aimTarget() {
  const w = recipeById(P.hotbar[P.slot]);
  const reach = (w.kind === "melee") ? (w.range || 3) : 4;
  // 가까운 채집물
  let best = null, bd = reach;
  for (const r of resources) {
    const d = Math.hypot(P.pos.x - r.x, P.pos.z - r.z);
    if (d < bd) {
      bd = d;
      let label;
      if (r.type === "rock") label = canMineHeld() ? `<b>F/좌클릭</b> 🪨 돌 캐기` : `🪨 <b>곡괭이 필요</b> (나무로 제작 E)`;
      else label = `<b>F/좌클릭</b> ${({ tree: "🌳 나무", bush: "🌿 채집" })[r.type]}`;
      best = { type: "res", ref: r, label };
    }
  }
  // 물가
  if (!best && heightAt(P.pos.x, P.pos.z) < SEA + 3) {
    return { type: "water", label: "<b>F</b> 💧 물 마시기" };
  }
  return best;
}

function interact() {
  const t = aimTarget();
  if (!t) return;
  if (t.type === "water") { P.thirst = Math.min(100, P.thirst + 25); toast("물을 마셨다 💧"); return; }
  if (t.type === "res") harvest(t.ref);
}

let mineWarnAt = 0;
function harvest(r) {
  if (r.type === "rock" && !canMineHeld()) {
    if (performance.now() - mineWarnAt > 1500) { toast("맨손으론 돌을 못 캐요! ⛏️ 곡괭이를 만드세요 (E)"); mineWarnAt = performance.now(); }
    return;
  }
  r.hp -= 1;
  r.mesh.position.y = r.y + Math.sin(performance.now() / 40) * 0.06; // 흔들림
  if (r.hp > 0) return;
  scene.remove(r.mesh);
  resources = resources.filter(x => x !== r);
  if (r.type === "tree") { addItem("wood", 3); addItem("fiber", 1); }
  else if (r.type === "rock") {
    addItem("stone", 3);
    if (Math.random() < 0.5) addItem("iron", 1);
    if (Math.random() < 0.25) addItem("gunpowder", 1);
  } else { addItem("fiber", 2); addItem("food", 1); }
  // 자원 리스폰(시간차)
  setTimeout(() => respawnResource(r.type), 25000);
}
function respawnResource(type) {
  let x, z, y, t = 0;
  do { x = (Math.random() - .5) * 640; z = (Math.random() - .5) * 640; y = heightAt(x, z); t++; } while (y < SEA + 2 && t < 30);
  const mk = type === "tree" ? () => {
    const g = new THREE.Group(); const h = 4 + Math.random() * 4;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 7), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }));
    tr.position.y = h / 2; g.add(tr);
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), new THREE.MeshStandardMaterial({ color: 0x2f6b30, flatShading: true })); lf.position.y = h + 1; g.add(lf); return g;
  } : type === "rock" ? () => new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0x808080, flatShading: true }))
    : () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x4f8b3a, flatShading: true }));
  const m = mk(); m.position.set(x, y, z); m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(m); resources.push({ mesh: m, type, x, z, y, hp: type === "rock" ? 5 : type === "tree" ? 4 : 2, rad: type === "rock" ? 1.1 : type === "tree" ? 0.6 : 0 });
}

function addItem(k, n) { P.inv[k] = (P.inv[k] || 0) + n; }

/* ---------------- 공격 / 사격 ---------------- */
function primaryAction() {
  if (!P.alive) return;
  if (buildMode) { placeBlock(); return; }
  const w = recipeById(P.hotbar[P.slot]);
  if (performance.now() < P.nextAct) return;
  if (w.kind === "melee" || w.kind === "build") {
    if (w.id === "campfire") { return interact(); }
    P.nextAct = performance.now() + 450;
    meleeAttack(w);
  } else if (w.kind === "gun" || w.kind === "ranged") {
    if (P.reloading) return;
    if ((P.ammo[w.id] || 0) <= 0) { startReload(); return; }
    P.nextAct = performance.now() + 60000 / (w.rpm || 60);
    P.ammo[w.id]--;
    fireRanged(w);
  }
}

function meleeAttack(w) {
  // 자원도 캘 수 있음
  const t = aimTarget();
  if (t && t.type === "res") { harvest(t.ref); return; }
  const origin = camera.position.clone();
  const dir = camDir();
  // 동물
  for (const a of animals) {
    if (!a.alive) continue;
    const c = new THREE.Vector3(a.x, heightAt(a.x, a.z) + 0.9, a.z);
    if (origin.distanceTo(c) < (w.range || 3) && dir.dot(c.clone().sub(origin).normalize()) > 0.7) {
      a.hp -= w.dmg; flash(c, 0xff5544);
      if (a.hp <= 0) { a.alive = false; scene.remove(a.mesh); addItem("food", 3); addItem("fiber", 2); toast("사냥 성공! 🍖"); }
      return;
    }
  }
  // 플레이어
  hitOtherPlayers(origin, dir, w.range || 3, w.dmg);
}

function fireRanged(w) {
  const origin = camera.position.clone();
  const dir = camDir();
  if (w.proj) { // 발사체(활/석궁)
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x553311 }));
    m.position.copy(origin); scene.add(m);
    projectiles.push({ mesh: m, vel: dir.clone().multiplyScalar(w.proj), life: 3, dmg: w.dmg, dir });
    return;
  }
  // 히트스캔 총
  tracer(origin, origin.clone().addScaledVector(dir, w.range));
  // 동물
  let hit = false;
  for (const a of animals) {
    if (!a.alive) continue;
    const c = new THREE.Vector3(a.x, heightAt(a.x, a.z) + 0.9, a.z);
    if (raySphere(origin, dir, c, 0.8) !== null) {
      a.hp -= w.dmg; if (a.hp <= 0) { a.alive = false; scene.remove(a.mesh); addItem("food", 3); }
      hit = true; break;
    }
  }
  if (!hit) hitOtherPlayers(origin, dir, w.range, w.dmg);
  recoilKick(w);
}

function hitOtherPlayers(origin, dir, range, dmg) {
  let bestId = null, bd = range;
  for (const id in others) {
    const o = others[id];
    const c = o.group.position.clone(); c.y += 1.0;
    const d = raySphere(origin, dir, c, 0.7);
    if (d !== null && d < bd) { bd = d; bestId = id; }
  }
  if (bestId) {
    Net.sendHit(bestId, dmg);
    flash(others[bestId].group.position.clone().setY(others[bestId].group.position.y + 1), 0xff3322);
    toast(`${others[bestId].nick} 타격! 💥`);
  }
}

function startReload() {
  const w = recipeById(P.hotbar[P.slot]);
  if ((w.kind !== "gun" && w.kind !== "ranged") || P.reloading) return;
  if ((P.ammo[w.id] || 0) >= w.mag) return;
  P.reloading = true; P.reloadEnd = performance.now() + (w.reload || 2) * 1000;
}

function recoilKick(w) { P.pitch = Math.min(1.4, P.pitch + (w.dmg > 80 ? 0.05 : 0.02)); }
function camDir() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return d; }
function raySphere(o, d, c, r) {
  const oc = o.clone().sub(c), b = oc.dot(d), cc = oc.dot(oc) - r * r, disc = b * b - cc;
  if (disc < 0) return null; const t = -b - Math.sqrt(disc); return t > 0 ? t : null;
}
function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffdd55 }));
  scene.add(l); setTimeout(() => scene.remove(l), 60);
}
function flash(p, col) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), new THREE.MeshBasicMaterial({ color: col }));
  m.position.copy(p); scene.add(m); setTimeout(() => scene.remove(m), 120);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.vel.y -= 9 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
    p.life -= dt;
    let dead = p.life <= 0 || p.mesh.position.y < heightAt(p.mesh.position.x, p.mesh.position.z);
    // 명중
    for (const a of animals) {
      if (!a.alive) continue;
      const c = new THREE.Vector3(a.x, heightAt(a.x, a.z) + 0.9, a.z);
      if (p.mesh.position.distanceTo(c) < 1) { a.hp -= p.dmg; if (a.hp <= 0) { a.alive = false; scene.remove(a.mesh); addItem("food", 3); } dead = true; }
    }
    for (const id in others) {
      const c = others[id].group.position.clone(); c.y += 1;
      if (p.mesh.position.distanceTo(c) < 1) { Net.sendHit(id, p.dmg); dead = true; }
    }
    if (dead) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

/* ---------------- 동물 AI ---------------- */
function animalBlocked(x, z, self) {
  for (const r of resources) { if (!r.rad) continue; const dx = x - r.x, dz = z - r.z, rr = 0.6 + r.rad; if (dx * dx + dz * dz < rr * rr) return true; }
  for (const o of animals) { if (o === self || !o.alive) continue; const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < 1.2) return true; }
  return false;
}
function updateAnimals(dt) {
  for (const a of animals) {
    if (!a.alive) continue;
    a.timer -= dt;
    const pd = Math.hypot(P.pos.x - a.x, P.pos.z - a.z);
    if (pd < 11) { // 플레이어가 가까우면 도망
      a.state = "flee"; a.targetHeading = Math.atan2(a.z - P.pos.z, a.x - P.pos.x); a.speed = 5.5; a.timer = 1;
    } else if (a.timer <= 0) { // 풀 뜯기 ↔ 어슬렁
      if (Math.random() < 0.45) { a.state = "graze"; a.speed = 0; a.timer = 2 + Math.random() * 3; }
      else { a.state = "walk"; a.targetHeading = Math.random() * Math.PI * 2; a.speed = 1.7; a.timer = 2.5 + Math.random() * 3; }
    }
    // 부드러운 방향 전환
    let dh = a.targetHeading - a.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    a.heading += dh * Math.min(1, dt * 3.5);
    // 이동(물/장애물 회피)
    if (a.speed > 0.01) {
      const nx = a.x + Math.cos(a.heading) * a.speed * dt, nz = a.z + Math.sin(a.heading) * a.speed * dt;
      if (heightAt(nx, nz) > SEA + 1 && !animalBlocked(nx, nz, a)) { a.x = nx; a.z = nz; a.phase += dt * a.speed * 2.2; }
      else { a.targetHeading = a.heading + Math.PI * (0.6 + Math.random() * 0.6); a.timer = 0.3; }
    }
    const gy = heightAt(a.x, a.z);
    a.mesh.position.set(a.x, gy + (a.speed > 0.01 ? Math.abs(Math.sin(a.phase)) * 0.07 : 0), a.z);
    a.mesh.rotation.y = -a.heading;
    if (a.legs) for (let i = 0; i < a.legs.length; i++)
      a.legs[i].rotation.x = a.speed > 0.01 ? Math.sin(a.phase + (i % 2 ? Math.PI : 0)) * 0.6 : 0;
  }
}

/* ============================================================
   제작 UI
   ============================================================ */
function toggleCraft() {
  const el = document.getElementById("craft");
  if (el.classList.contains("hidden")) { renderCraft(); el.classList.remove("hidden"); if (document.exitPointerLock) document.exitPointerLock(); }
  else { el.classList.add("hidden"); if (!isMobile) renderer.domElement.requestPointerLock(); }
}
document.getElementById("craftClose").onclick = toggleCraft;

function canAfford(c) { for (const k in c) if ((P.inv[k] || 0) < c[k]) return false; return true; }

const ICON = { wood: "🪵", stone: "🪨", fiber: "🌿", iron: "🔩", gunpowder: "💥", food: "🍖" };
const MATS = ["wood", "stone", "fiber", "iron", "gunpowder", "food"];

function renderCraft() {
  document.getElementById("ageLabel").textContent = `시대: ${AGES[P.age]}`;
  renderInv(); renderGear();
  const list = document.getElementById("recipeList"); list.innerHTML = "";
  RECIPES.forEach(r => {
    const locked = r.age > P.age;
    const afford = canAfford(r.cost);
    const div = document.createElement("div");
    div.className = "recipe" + (locked ? " locked" : afford ? "" : " poor");
    const costStr = Object.entries(r.cost).map(([k, v]) => `${ICON[k]}${v}`).join(" ");
    div.title = `${r.name} [${AGES[r.age]}]\n필요: ${costStr}`;
    div.innerHTML = `<div class="mc-slot"><span class="si">${r.icon}</span>${locked ? '<span class="lock">🔒</span>' : ''}</div>
      <span class="rn">${r.name}</span><span class="rc">${costStr}</span>`;
    if (!locked) div.onclick = () => craft(r);
    list.appendChild(div);
  });
  const adv = document.getElementById("advanceAge");
  if (P.age < AGES.length - 1) {
    const need = ageRequirement(P.age + 1);
    adv.classList.remove("hidden");
    adv.innerHTML = `⬆️ 다음 시대로 (${AGES[P.age + 1]}) — 필요: ${Object.entries(need).map(([k, v]) => ICON[k] + v).join(" ")}`;
    adv.onclick = () => advanceAge();
  } else adv.classList.add("hidden");
}

/* 가방(재료) 슬롯 */
function renderInv() {
  const g = document.getElementById("invGrid"); g.innerHTML = "";
  MATS.forEach(k => {
    const d = document.createElement("div"); d.className = "mc-slot";
    const n = P.inv[k] || 0;
    d.title = k;
    d.innerHTML = `<span class="si">${ICON[k]}</span>${n ? `<span class="sc">${n}</span>` : ""}`;
    if (!n) d.classList.add("empty");
    g.appendChild(d);
  });
}
/* 보유 도구·무기 슬롯 (클릭=장착) */
function renderGear() {
  const g = document.getElementById("gearGrid"); g.innerHTML = "";
  P.hotbar.forEach((id, i) => {
    const r = recipeById(id);
    const d = document.createElement("div");
    d.className = "mc-slot gear" + (i === P.slot ? " active" : "");
    d.title = r.name + " (장착)";
    d.innerHTML = `<span class="si">${r.icon}</span><span class="kk">${i + 1}</span>`;
    d.onclick = () => { selectSlot(i); renderGear(); };
    g.appendChild(d);
  });
}

function ageRequirement(age) {
  return [{}, { wood: 10, stone: 8 }, { iron: 6, wood: 8 }, { iron: 10, stone: 10 }, { iron: 14, gunpowder: 6 }][age] || {};
}
function advanceAge() {
  const need = ageRequirement(P.age + 1);
  if (!canAfford(need)) { toast("자원이 부족합니다!"); return; }
  for (const k in need) P.inv[k] -= need[k];
  P.age++; toast(`🎉 ${AGES[P.age]} 진입!`); renderCraft();
}

function craft(r) {
  if (r.age > P.age) return;
  if (!canAfford(r.cost)) { toast("자원이 부족합니다!"); return; }
  for (const k in r.cost) P.inv[k] -= r.cost[k];
  if (r.kind === "build" && r.id === "campfire") {
    const fire = new THREE.Group();
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f1a }));
    fire.add(logs);
    const fl = new THREE.PointLight(0xff7722, 2, 16); fl.position.y = 1; fire.add(fl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff8822 }));
    flame.position.y = 0.7; fire.add(flame);
    fire.position.set(P.pos.x, heightAt(P.pos.x, P.pos.z), P.pos.z);
    scene.add(fire); campfires.push({ x: P.pos.x, z: P.pos.z });
    toast("모닥불 설치 🔥 (체온 회복)"); renderCraft(); return;
  }
  if (r.kind === "armor") { P.armor = Math.max(P.armor, r.armor); toast(`${r.name} 장착 🛡️`); renderCraft(); return; }
  // 무기: 핫바에 추가
  if (!P.hotbar.includes(r.id)) {
    if (P.hotbar.length < 9) P.hotbar.push(r.id); else P.hotbar[P.hotbar.length - 1] = r.id;
  }
  P.unlocked[r.id] = true;
  if (r.mag) P.ammo[r.id] = r.mag;
  P.slot = P.hotbar.indexOf(r.id); // 만든 도구 바로 장착
  toast(`${r.name} 제작 완료!`); rebuildHotbar(); renderCraft();
}

/* ---------------- 핫바 ---------------- */
function rebuildHotbar() {
  const el = document.getElementById("hotbar"); el.innerHTML = "";
  P.hotbar.forEach((id, i) => {
    const r = recipeById(id);
    const d = document.createElement("div");
    d.className = "hslot" + (i === P.slot ? " active" : "");
    d.innerHTML = `<span class="hk">${i + 1}</span><span class="hi">${r.icon}</span><span class="hn">${r.name}</span>`;
    d.onclick = () => selectSlot(i);
    el.appendChild(d);
  });
  equipHeld();
}
function selectSlot(i) {
  if (i < 0 || i >= P.hotbar.length) return;
  P.slot = i; P.reloading = false; rebuildHotbar();
}

function equipHeld() {
  if (P.heldModel) { camera.remove(P.heldModel); P.heldModel = null; }
  const r = recipeById(P.hotbar[P.slot]);
  if (r && r.model && glbModels[r.model]) {
    const m = glbModels[r.model].clone(true);
    m.scale.multiplyScalar(0.85);
    m.position.set(0.32, -0.28, -0.6);
    m.rotation.y = Math.PI;
    camera.add(m); P.heldModel = m;
  }
  if (!scene.children.includes(camera)) scene.add(camera);
}

/* ============================================================
   멀티플레이 (다른 플레이어 렌더)
   ============================================================ */
function ensureOther(payload) {
  if (others[payload.id]) return others[payload.id];
  const g = new THREE.Group();
  const body = new THREE.Mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.4, 1.0, 4, 8) : new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: payload.color || 0x66ccff, roughness: 0.7 }));
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), new THREE.MeshStandardMaterial({ color: 0xd9a066 }));
  head.position.y = 1.95; g.add(head);
  const sprite = makeNameSprite(payload.country + " " + payload.nick);
  sprite.position.y = 2.6; g.add(sprite);
  scene.add(g);
  others[payload.id] = { group: g, nameSprite: sprite, nick: payload.nick, country: payload.country, hp: 100, tx: payload.x, ty: payload.y, tz: payload.z, tyaw: payload.yaw };
  document.getElementById("onlineCount").textContent = Object.keys(others).length + 1;
  return others[payload.id];
}
function onPeerState(p) {
  if (!p.alive) { onPeerLeave(p.id); return; }
  const o = ensureOther(p);
  o.tx = p.x; o.ty = p.y; o.tz = p.z; o.tyaw = p.yaw; o.hp = p.hp;
}
function onPeerLeave(id) {
  if (others[id]) { scene.remove(others[id].group); delete others[id]; document.getElementById("onlineCount").textContent = Object.keys(others).length + 1; }
}
function onPeerHit(p) { damageSelf(p.dmg, "플레이어"); }
function onPeerChat(p) { chatLine(`${p.country} ${p.nick}: ${p.text}`); }

function updateOthers(dt) {
  for (const id in others) {
    const o = others[id];
    o.group.position.x += (o.tx - o.group.position.x) * Math.min(1, dt * 10);
    o.group.position.y += (o.ty - 1.8 - o.group.position.y) * Math.min(1, dt * 10);
    o.group.position.z += (o.tz - o.group.position.z) * Math.min(1, dt * 10);
    o.group.rotation.y = o.tyaw;
  }
}

function makeNameSprite(text) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, 256, 64);
  g.font = "28px sans-serif"; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(3, 0.75, 1);
  return s;
}

/* ============================================================
   낮/밤
   ============================================================ */
function updateDayNight(dt) {
  dayTime = (dayTime + dt / DAY_LEN) % 1;
  const ang = dayTime * Math.PI * 2 - Math.PI / 2;
  const sx = Math.cos(ang), sy = Math.sin(ang);
  sun.position.set(sx * 200 + P.pos.x, sy * 200, 80 + P.pos.z);
  sun.target.position.copy(P.pos);
  const day = Math.max(0, sy);
  sun.intensity = 0.2 + day * 2.2;
  hemi.intensity = 0.25 + day * 0.6;
  const sky1 = new THREE.Color(0x0a1020).lerp(new THREE.Color(0x2a6bd4), day);
  const sky2 = new THREE.Color(0x12203a).lerp(new THREE.Color(0xcfe6ff), day);
  if (sky) { sky.material.uniforms.top.value.copy(sky1); sky.material.uniforms.bot.value.copy(sky2); }
  scene.fog.color.copy(sky2);
  renderer.toneMappingExposure = 0.55 + day * 0.6;
}

/* ============================================================
   카메라 (1인칭)
   ============================================================ */
function updateCamera() {
  camera.position.copy(P.pos);
  const d = new THREE.Vector3(
    Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
  camera.lookAt(P.pos.clone().add(d));
}

/* ============================================================
   데미지 / 죽음 / 부활
   ============================================================ */
function damageSelf(amt, by) {
  if (!P.alive) return;
  P.hp -= amt * (1 - P.armor);
  if (amt > 0.5) {
    const v = document.getElementById("dmg"); v.style.opacity = "1"; setTimeout(() => v.style.opacity = "0", 150);
  }
  if (P.hp <= 0) { P.hp = 0; P.alive = false; die(by); }
}
function die(by) {
  document.getElementById("deadBy").textContent = (by || "알 수 없음") + " 에게 사망";
  document.getElementById("dead").classList.remove("hidden");
  if (document.exitPointerLock) document.exitPointerLock();
}
document.getElementById("respawnBtn").onclick = () => {
  P.hp = 100; P.hunger = 100; P.thirst = 100; P.stamina = 100; P.temp = 36.5; P.alive = true;
  let sx, sz, t = 0; do { sx = (Math.random() - .5) * 200; sz = (Math.random() - .5) * 200; t++; } while (heightAt(sx, sz) < SEA + 2 && t < 40);
  P.pos.set(sx, heightAt(sx, sz) + 1.8, sz); P.vel.set(0, 0, 0);
  document.getElementById("dead").classList.add("hidden");
  if (!isMobile) renderer.domElement.requestPointerLock();
};

/* ============================================================
   채팅
   ============================================================ */
function openChat() {
  const box = document.getElementById("chatInput");
  if (box.classList.contains("hidden")) {
    box.classList.remove("hidden"); box.focus(); if (document.exitPointerLock) document.exitPointerLock();
  } else {
    const t = box.value.trim();
    if (t) { Net.sendChat(t); chatLine(`${P.country} ${P.nick}: ${t}`); }
    box.value = ""; box.classList.add("hidden"); if (!isMobile) renderer.domElement.requestPointerLock();
  }
}
document.getElementById("chatInput").addEventListener("keydown", e => { if (e.code === "Enter") { e.stopPropagation(); openChat(); } });
function chatLine(t) {
  const f = document.getElementById("chatLog"); const d = document.createElement("div"); d.textContent = t;
  f.appendChild(d); while (f.children.length > 6) f.firstChild.remove();
  setTimeout(() => { if (d.parentNode) d.remove(); }, 12000);
}

/* ============================================================
   HUD
   ============================================================ */
function updateHUD() {
  bar("barHp", P.hp); bar("barHunger", P.hunger); bar("barThirst", P.thirst); bar("barStamina", P.stamina);
  document.getElementById("tempVal").textContent = P.temp.toFixed(1) + "°C";
  document.getElementById("ageVal").textContent = AGES[P.age];
  const w = recipeById(P.hotbar[P.slot]);
  const ammoEl = document.getElementById("ammoVal");
  if (w.kind === "gun" || w.kind === "ranged") ammoEl.textContent = (P.reloading ? "장전중…" : (P.ammo[w.id] || 0) + " / " + w.mag);
  else ammoEl.textContent = "—";
  const t = Math.floor(dayTime * 24);
  document.getElementById("clock").textContent = `🕐 ${("0" + t).slice(-2)}:00`;
}
function bar(id, v) { const e = document.getElementById(id); if (e) e.style.width = Math.max(0, Math.min(100, v)) + "%"; }

let toastT;
function toast(msg) {
  const e = document.getElementById("toast"); e.textContent = msg; e.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("show"), 1800);
}

/* ============================================================
   GLB 로더 (외부 라이브러리 불필요) — MeshStandardMaterial로 변환(빛반사)
   ============================================================ */
function loadModels(done) {
  const list = ["m4a1", "mp5k", "ksr29", "awp"]; // 제작에 쓰는 모던 무기
  let loaded = 0; let finished = false;
  const bar = document.getElementById("loadBar"), txt = document.getElementById("loadTxt");
  const step = () => {
    loaded++; bar.style.width = (loaded / list.length * 100) + "%";
    txt.textContent = `모델 불러오는 중... (${loaded}/${list.length})`;
    if (loaded >= list.length && !finished) { finished = true; txt.textContent = "준비 완료!"; setTimeout(done, 250); }
  };
  setTimeout(() => { if (!finished) { finished = true; setTimeout(done, 150); } }, 9000);
  list.forEach(name => {
    fetch(name + ".glb").then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(buf => { try { glbModels[name] = parseGLB(buf); } catch (e) { console.warn("파싱실패", name, e); } step(); })
      .catch(() => step());
  });
}

function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not glb");
  let off = 12, json = null, bin = null;
  while (off < dv.byteLength) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true), cstart = off + 8;
    if (ctype === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, cstart, clen)));
    else if (ctype === 0x004E4942) bin = new Uint8Array(buffer, cstart, clen);
    off = cstart + clen + (clen % 4 ? 4 - clen % 4 : 0);
  }
  const typeNum = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function readAccessor(idx) {
    const acc = json.accessors[idx], bv = json.bufferViews[acc.bufferView];
    const start = (bv.byteOffset || 0) + (acc.byteOffset || 0), count = acc.count * typeNum[acc.type], ct = acc.componentType;
    if (ct === 5126) return new Float32Array(bin.buffer, bin.byteOffset + start, count);
    if (ct === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + start, count);
    if (ct === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + start, count);
    if (ct === 5121) return new Uint8Array(bin.buffer, bin.byteOffset + start, count);
    throw new Error("ct " + ct);
  }
  const group = new THREE.Group();
  json.meshes.forEach(mesh => mesh.primitives.forEach(prim => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(readAccessor(prim.attributes.POSITION), 3));
    if (prim.attributes.NORMAL !== undefined) geo.setAttribute("normal", new THREE.BufferAttribute(readAccessor(prim.attributes.NORMAL), 3));
    else geo.computeVertexNormals();
    if (prim.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(readAccessor(prim.indices), 1));
    let color = 0x888888, metal = 0.85, rough = 0.4;
    const m = json.materials && prim.material !== undefined ? json.materials[prim.material] : null;
    if (m && m.pbrMetallicRoughness) {
      const pr = m.pbrMetallicRoughness;
      if (pr.baseColorFactor) color = new THREE.Color(pr.baseColorFactor[0], pr.baseColorFactor[1], pr.baseColorFactor[2]).getHex();
      if (pr.metallicFactor !== undefined) metal = pr.metallicFactor;
      if (pr.roughnessFactor !== undefined) rough = pr.roughnessFactor;
    }
    const mat = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, envMapIntensity: 1.0 });
    group.add(new THREE.Mesh(geo, mat));
  }));
  return group;
}

/* ============================================================
   모바일 터치
   ============================================================ */
(function () {
  if (!isMobile) return;
  const joy = document.getElementById("joy"), stick = document.getElementById("joyStick");
  let joyId = null, jx = 0, jy = 0, lookId = null, lx = 0, ly = 0;
  joy && joy.addEventListener("touchstart", e => { const t = e.changedTouches[0]; joyId = t.identifier; const r = joy.getBoundingClientRect(); jx = r.left + r.width / 2; jy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
  document.addEventListener("touchstart", e => { for (const t of e.changedTouches) if (t.clientX > innerWidth * .5 && lookId === null && !t.target.classList.contains("tb")) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
  document.addEventListener("touchmove", e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - jx, dy = t.clientY - jy; const mx = 52, len = Math.hypot(dx, dy); if (len > mx) { dx *= mx / len; dy *= mx / len; }
        stick.style.transform = `translate(${dx - 26}px,${dy - 26}px)`;
        keys["KeyD"] = dx > 15; keys["KeyA"] = dx < -15; keys["KeyW"] = dy < -15; keys["KeyS"] = dy > 15;
      }
      if (t.identifier === lookId) { P.yaw -= (t.clientX - lx) * .006; P.pitch -= (t.clientY - ly) * .006; P.pitch = Math.max(-1.4, Math.min(1.4, P.pitch)); lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", e => { for (const t of e.changedTouches) { if (t.identifier === joyId) { joyId = null; keys["KeyW"] = keys["KeyS"] = keys["KeyA"] = keys["KeyD"] = false; stick.style.transform = "translate(-50%,-50%)"; } if (t.identifier === lookId) lookId = null; } });
  const bind = (id, dn, up) => { const el = document.getElementById(id); if (!el) return; el.addEventListener("touchstart", e => { dn(); e.stopPropagation(); e.preventDefault(); }, { passive: false }); if (up) el.addEventListener("touchend", e => { up(); e.preventDefault(); }, { passive: false }); };
  bind("tFire", () => primaryAction());
  bind("tJump", () => { if (P.onGround) { P.vel.y = 8.5; P.onGround = false; } });
  bind("tUse", () => interact());
  bind("tCraft", () => toggleCraft());
  bind("tReload", () => startReload());
  bind("tBuild", () => toggleBuild());
  bind("tMat", () => { if (buildMode) toggleBuildMat(); else toast("건축 버튼을 먼저 누르세요"); });
})();
