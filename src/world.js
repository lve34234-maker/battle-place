/* ============================================================
   world.js — 지형 / 마을·건물·담장·창고·감시탑 / 충돌 / 전리품
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPON_IDS } from "./config.js";

export const world = {
  ground: null,
  colliders: [],   // {box: THREE.Box3, mesh}  — 이동 충돌
  solids: [],      // 레이캐스트 대상 (사격 차폐)
  trees: [],
  loot: [],        // {mesh, weapon, taken}
};

/* 시드 의사난수 (맵 재현성) */
let seed = 1337;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rr(a, b) { return a + (b - a) * rand(); }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

/* 재질 팔레트 */
const MAT = {
  wall: () => new THREE.MeshStandardMaterial({ color: pick([0xc4b79a, 0xb0a282, 0xcabfa6, 0x9c8f74, 0xd8cdb4]), roughness: 0.9, metalness: 0.03 }),
  roof: () => new THREE.MeshStandardMaterial({ color: pick([0x7a4a35, 0x8a5a3a, 0x5c4030, 0x6b4a3a]), roughness: 0.85 }),
  concrete: () => new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.92, metalness: 0.02 }),
  metal: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.3 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 1 }),
};

let _scene = null;
/* 박스 추가 (충돌 등록) */
function box(x, y, z, w, h, d, mat, rotY = 0, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  _scene.add(m);
  if (collide) {
    m.updateMatrixWorld(true);
    world.colliders.push({ box: new THREE.Box3().setFromObject(m) });
  }
  world.solids.push(m);
  return m;
}

/* 단독 주택: 4벽(문 구멍) + 지붕 */
function house(cx, cz, w, d, h, rot) {
  const t = 0.3, wm = MAT.wall();
  const c = Math.cos(rot), s = Math.sin(rot);
  const place = (lx, lz, lw, ld, lh, ly) => {
    const x = cx + lx * c - lz * s;
    const z = cz + lx * s + lz * c;
    box(x, ly, z, lw, lh, ld, wm, rot);
  };
  // 좌/우 벽
  place(-w / 2, 0, t, d, h, h / 2);
  place(w / 2, 0, t, d, h, h / 2);
  // 뒷벽
  place(0, -d / 2, w, t, h, h / 2);
  // 앞벽 (문 구멍 → 양옆 기둥)
  const doorW = 1.6;
  place(-(w / 2 + doorW / 2) / 2 - doorW / 4, d / 2, (w - doorW) / 2, t, h, h / 2);
  place((w / 2 + doorW / 2) / 2 + doorW / 4, d / 2, (w - doorW) / 2, t, h, h / 2);
  // 지붕
  const rx = cx, rz = cz;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), MAT.roof());
  roof.position.set(rx, h, rz); roof.rotation.y = rot;
  roof.castShadow = true; roof.receiveShadow = true;
  _scene.add(roof); world.solids.push(roof);
}

/* 담장(벽) 라인 */
function wall(x, z, len, rot, h = 2.4) {
  box(x, h / 2, z, len, h, 0.35, MAT.concrete(), rot);
}

/* 컨테이너(반사 금속) */
function container(x, z, rot) {
  const cols = [0xc24b3a, 0x3a6ec2, 0xe0a83a, 0x3aa05a, 0xb0b4b8];
  box(x, 1.3, z, 6.1, 2.6, 2.45, MAT.metal(pick(cols)), rot);
}

/* 나무 상자 더미 */
function crates(x, z) {
  const n = Math.floor(rr(1, 4));
  for (let i = 0; i < n; i++) {
    const s = rr(0.8, 1.3);
    box(x + rr(-1, 1), s / 2 + i * 0.0, z + rr(-1, 1), s, s, s, MAT.wood(), rr(0, Math.PI));
  }
}

/* 감시탑 */
function tower(x, z) {
  const legMat = MAT.wood();
  const h = 7;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    box(x + dx, h / 2, z + dz, 0.3, h, 0.3, legMat, 0);
  }
  box(x, h, z, 3.6, 0.3, 3.6, MAT.wood());          // 바닥
  box(x, h + 1.2, z, 3.6, 0.2, 0.3, MAT.wood());    // 난간 앞
  box(x, h + 1.2, z + 1.7, 3.6, 0.2, 0.3, MAT.wood());
  box(x, h + 2.4, z, 4, 0.25, 4, MAT.roof());       // 지붕
}

/* 마을(주택 그리드) */
function town(cx, cz) {
  const cols = Math.floor(rr(3, 5)), rows = Math.floor(rr(3, 5));
  const gap = 16;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (rand() < 0.18) continue; // 빈 터
      const x = cx + (i - cols / 2) * gap + rr(-3, 3);
      const z = cz + (j - rows / 2) * gap + rr(-3, 3);
      const w = rr(7, 12), d = rr(7, 12), h = rr(4, 7);
      house(x, z, w, d, h, pick([0, Math.PI / 2]));
      if (rand() < 0.4) crates(x + rr(-6, 6), z + rr(-6, 6));
    }
  }
}

/* 벽으로 둘러싸인 군 기지 콤파운드 */
function compound(cx, cz) {
  const s = rr(26, 36);
  // 외벽 (출입구 한 칸)
  wall(cx - s / 2, cz, s, Math.PI / 2, 3);
  wall(cx + s / 2, cz, s, Math.PI / 2, 3);
  wall(cx, cz - s / 2, s, 0, 3);
  wall(cx - s / 4, cz + s / 2, s / 2, 0, 3); // 앞쪽 일부(문)
  // 내부 건물 2~3
  for (let i = 0; i < 3; i++) {
    house(cx + rr(-s / 3, s / 3), cz + rr(-s / 3, s / 3), rr(8, 12), rr(8, 12), rr(5, 8), pick([0, Math.PI / 2]));
  }
  for (let i = 0; i < 4; i++) container(cx + rr(-s / 2, s / 2), cz + rr(-s / 2, s / 2), rr(0, Math.PI));
  tower(cx + s / 2 - 3, cz - s / 2 + 3);
}

export function buildWorld(scene) {
  _scene = scene;
  seed = 20240628;
  world.colliders.length = 0; world.solids.length = 0; world.trees.length = 0; world.loot.length = 0;
  const S = CFG.mapSize;

  /* ---- 지면 (굴곡) ---- */
  const groundGeo = new THREE.PlaneGeometry(S * 2, S * 2, 100, 100);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.013) * Math.cos(y * 0.011) * 2.2 + rr(-0.3, 0.3));
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x5f7a43, roughness: 0.97 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground); world.ground = ground;

  /* ---- 도로 ---- */
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.85, metalness: 0.05 });
  for (const r of [[0, 0, 16, S * 2], [0, 0, S * 2, 16], [150, -120, 12, 260], [-160, 130, 280, 12], [-120, -150, 12, 220]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(r[0], 0.07, r[1]);
    road.receiveShadow = true; scene.add(road);
  }

  /* ---- 마을 4개 ---- */
  town(-150, -140); town(140, 130); town(-160, 120); town(150, -130);
  /* ---- 중앙 대형 마을 ---- */
  town(0, 0);
  /* ---- 군 기지 콤파운드 2 ---- */
  compound(-60, 90); compound(80, -70);
  /* ---- 외곽 단독 주택/감시탑/컨테이너 흩뿌리기 ---- */
  for (let i = 0; i < 26; i++) house(rr(-S * 0.9, S * 0.9), rr(-S * 0.9, S * 0.9), rr(7, 11), rr(7, 11), rr(4, 7), pick([0, Math.PI / 2]));
  for (let i = 0; i < 10; i++) tower(rr(-S * 0.85, S * 0.85), rr(-S * 0.85, S * 0.85));
  for (let i = 0; i < 40; i++) container(rr(-S * 0.9, S * 0.9), rr(-S * 0.9, S * 0.9), rr(0, Math.PI));
  for (let i = 0; i < 50; i++) crates(rr(-S * 0.9, S * 0.9), rr(-S * 0.9, S * 0.9));

  /* ---- 바위 ---- */
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7b7873, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const r = rr(1.5, 4);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.position.set(rr(-S, S), r * 0.4, rr(-S, S)); m.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
    m.updateMatrixWorld(true);
    world.colliders.push({ box: new THREE.Box3().setFromObject(m) });
    world.solids.push(m);
  }

  /* ---- 나무 ---- */
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3f24, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x37642c, roughness: 1 });
  for (let i = 0; i < 110; i++) {
    const g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.5, 6), trunkMat);
    tr.position.y = 2.25; tr.castShadow = true;
    const lv = new THREE.Mesh(new THREE.SphereGeometry(rr(2, 3.2), 7, 6), leafMat);
    lv.position.y = 5.3; lv.castShadow = true;
    g.add(tr, lv);
    g.position.set(rr(-S, S), 0, rr(-S, S));
    g.scale.setScalar(rr(0.8, 1.5));
    scene.add(g); world.trees.push(g); world.solids.push(tr);
  }

  return world;
}

/* 전리품(무기) 지점 */
export function spawnLoot(scene) {
  const S = CFG.mapSize;
  for (let i = 0; i < CFG.lootCount; i++) {
    const wid = WEAPON_IDS[Math.floor(rand() * WEAPON_IDS.length)];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xf2a900, roughness: 0.4, metalness: 0.7, emissive: 0x3a2600, emissiveIntensity: 0.6 })
    );
    mesh.position.set(rr(-S * 0.9, S * 0.9), 0.6, rr(-S * 0.9, S * 0.9));
    mesh.castShadow = true; scene.add(mesh);
    world.loot.push({ mesh, weapon: wid, taken: false });
  }
}

/* x,z 위치의 지면 높이 */
export function groundHeight(x, z) {
  return Math.sin(x * 0.013) * Math.cos(z * 0.011) * 2.2;
}

/* 수평 충돌 해석 */
export function resolveCollision(pos, radius) {
  for (const c of world.colliders) {
    const b = c.box;
    if (pos.y > b.max.y + 0.2) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (radius - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    }
  }
}
