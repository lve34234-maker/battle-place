/* ============================================================
   world.js — 지형 / 건물 / 도로 / 나무 / 충돌박스 / 전리품 지점
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPON_IDS } from "./config.js";

export const world = {
  ground: null,
  colliders: [],   // {box: THREE.Box3, mesh}  — 이동 충돌 + 사격 차폐
  solids: [],      // 레이캐스트 대상 메시
  trees: [],
  loot: [],        // {mesh, weapon, taken}
};

/* 시드 가능한 의사난수 (맵 재현성) */
let seed = 1337;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rr(a, b) { return a + (b - a) * rand(); }

function addCollider(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  world.colliders.push({ box, mesh });
  world.solids.push(mesh);
}

export function buildWorld(scene) {
  seed = 1337;
  const S = CFG.mapSize;

  /* ---- 지면 (약간의 굴곡) ---- */
  const groundGeo = new THREE.PlaneGeometry(S * 2, S * 2, 96, 96);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const h = Math.sin(x * 0.013) * Math.cos(y * 0.011) * 2.2 + rr(-0.4, 0.4);
    pos.setZ(i, h);
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x5f7a43, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  world.ground = ground;

  /* ---- 도로 ---- */
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.8, metalness: 0.05 });
  for (const r of [[0, 0, 14, S * 2], [0, 0, S * 2, 14], [120, -90, 10, 220], [-140, 110, 200, 10]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(r[0], 0.06, r[1]);
    road.receiveShadow = true;
    scene.add(road);
  }

  /* ---- 건물 군집 (마을) ---- */
  const palette = [0xb7a98c, 0x9c8f74, 0xc9bca0, 0x8a7d63, 0x77796e];
  for (let c = 0; c < 6; c++) {
    const cx = rr(-S * 0.7, S * 0.7), cz = rr(-S * 0.7, S * 0.7);
    const count = Math.floor(rr(3, 7));
    for (let i = 0; i < count; i++) {
      const w = rr(8, 18), d = rr(8, 18), h = rr(5, 13);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: palette[Math.floor(rand() * palette.length)], roughness: 0.85, metalness: 0.04 })
      );
      m.position.set(cx + rr(-26, 26), h / 2, cz + rr(-26, 26));
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      addCollider(m);
    }
  }

  /* ---- 컨테이너(금속, 반사 강함) ---- */
  const contColors = [0xc24b3a, 0x3a6ec2, 0xe0a83a, 0x3aa05a];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(6.1, 2.6, 2.45),
      new THREE.MeshStandardMaterial({ color: contColors[i % 4], roughness: 0.35, metalness: 0.85, envMapIntensity: 1.2 })
    );
    m.position.set(rr(-S * 0.85, S * 0.85), 1.3, rr(-S * 0.85, S * 0.85));
    m.rotation.y = rr(0, Math.PI);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider(m);
  }

  /* ---- 나무 ---- */
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3f24, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x37642c, roughness: 1 });
  for (let i = 0; i < 140; i++) {
    const g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.5, 6), trunkMat);
    tr.position.y = 2.25; tr.castShadow = true;
    const lv = new THREE.Mesh(new THREE.SphereGeometry(rr(2, 3.2), 7, 6), leafMat);
    lv.position.y = 5.3; lv.castShadow = true;
    g.add(tr, lv);
    g.position.set(rr(-S, S), 0, rr(-S, S));
    g.scale.setScalar(rr(0.8, 1.5));
    scene.add(g);
    world.trees.push(g);
    world.solids.push(tr); // 나무 줄기는 사격 차폐
  }

  return world;
}

/* 전리품(무기) 지점 생성 */
export function spawnLoot(scene) {
  const S = CFG.mapSize;
  for (let i = 0; i < CFG.lootCount; i++) {
    const wid = WEAPON_IDS[Math.floor(rand() * WEAPON_IDS.length)];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xf2a900, roughness: 0.4, metalness: 0.7, emissive: 0x3a2600, emissiveIntensity: 0.5 })
    );
    mesh.position.set(rr(-S * 0.9, S * 0.9), 0.6, rr(-S * 0.9, S * 0.9));
    mesh.castShadow = true;
    scene.add(mesh);
    world.loot.push({ mesh, weapon: wid, taken: false });
  }
}

/* x,z 위치의 지면 높이 (지형 굴곡 근사) */
export function groundHeight(x, z) {
  return Math.sin(x * 0.013) * Math.cos(z * 0.011) * 2.2;
}

/* 수평 원기둥 충돌 해석 — 위치 보정 반환 */
export function resolveCollision(pos, radius) {
  for (const c of world.colliders) {
    const b = c.box;
    if (pos.y > b.max.y + 0.2) continue; // 위로 넘어감
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
}
