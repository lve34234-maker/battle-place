/* ============================================================
   weapons.js — GLB 모델 로딩 / 뷰모델 / 탄도(물리) 총알 / 트레이서
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CFG, WEAPONS, WEAPON_IDS } from "./config.js";

const modelCache = {};        // {m4a1: THREE.Group}
export const bullets = [];     // {mesh, vel, life, dmg, fromPlayer, prev}

/* 모든 무기 GLB 로딩 (진행률 콜백) */
export async function loadWeaponModels(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(WEAPON_IDS.map((id) => new Promise((resolve) => {
    const file = WEAPONS[id].model + ".glb";
    loader.load(file, (gltf) => {
      const group = gltf.scene;
      group.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          if (o.material) {
            o.material.envMapIntensity = 1.3;   // 환경 반사 강조
            o.material.needsUpdate = true;
          }
        }
      });
      modelCache[id] = group;
      done++; onProgress && onProgress(done / WEAPON_IDS.length);
      resolve();
    }, undefined, () => { // 로드 실패 시 대체 박스
      const m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.4 })));
      modelCache[id] = m;
      done++; onProgress && onProgress(done / WEAPON_IDS.length);
      resolve();
    });
  })));
}

/* 무기 뷰모델 생성. 모델 중심을 원점에 맞추고, 가장 긴 축(=총열)을
   앞쪽(-Z)으로 정렬한 뒤 targetLen(m)으로 정규화한 래퍼를 반환.
   → GLB마다 다른 기본 축을 일관되게 보정해 항상 "들고 있는 총"으로 보임 */
export function makeViewModel(weaponId, targetLen = 0.6) {
  const src = modelCache[weaponId];
  if (!src) return null;
  const inner = src.clone(true);

  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);

  // 중심을 원점으로
  inner.position.sub(center);

  // 가장 긴 축을 Z로 회전 (총열을 앞으로)
  const align = new THREE.Group();
  align.add(inner);
  if (size.x >= size.y && size.x >= size.z) align.rotation.y = Math.PI / 2;   // X→Z
  else if (size.y >= size.x && size.y >= size.z) align.rotation.x = Math.PI / 2; // Y→Z
  // size.z 최대면 그대로

  const longest = Math.max(size.x, size.y, size.z) || 1;
  const wrap = new THREE.Group();
  wrap.add(align);
  wrap.scale.setScalar(targetLen / longest);
  return wrap;
}

/* 총알(탄도) 발사. owner: "player" 또는 bot 객체 */
export function fireBullet(scene, origin, dir, dmg, fromPlayer, owner) {
  const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5);
  const mat = new THREE.MeshBasicMaterial({ color: fromPlayer ? 0xffe07a : 0xff6a4a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(mesh);
  bullets.push({
    mesh,
    vel: dir.clone().normalize().multiplyScalar(CFG.bulletSpeed),
    prev: origin.clone(),
    life: 2.4,
    dmg,
    fromPlayer,
    owner: owner || (fromPlayer ? "player" : null),
  });
}

/* 매 프레임 총알 갱신 + 충돌 판정.
   onHitBot(bot, dmg), onHitPlayer(dmg) 콜백 */
export function updateBullets(scene, dt, solids, bots, player, cb) {
  const ray = new THREE.Raycaster();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.prev.copy(b.mesh.position);
    b.vel.y += CFG.bulletGravity * dt;       // 탄도 낙차
    b.mesh.position.addScaledVector(b.vel, dt);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.vel.clone().normalize());

    const seg = b.mesh.position.clone().sub(b.prev);
    const dist = seg.length();
    if (dist > 0.0001) {
      ray.set(b.prev, seg.clone().normalize());
      ray.far = dist;

      // 지형/건물 차폐
      const hits = ray.intersectObjects(solids, true);
      let blocked = hits.length > 0 ? hits[0].distance : Infinity;

      let hitTarget = null, hitDist = blocked;
      const ndir = seg.clone().normalize();
      // 봇 대상 (자기 자신 제외)
      for (const bot of bots) {
        if (bot.dead || bot === b.owner) continue;
        const d = rayHitsCapsule(b.prev, ndir, bot.pos, 0.5, 1.8, dist);
        if (d !== null && d < hitDist) { hitDist = d; hitTarget = bot; }
      }
      // 플레이어 대상 (플레이어가 쏜 총알은 제외)
      if (b.owner !== "player" && !player.dead) {
        const d = rayHitsCapsule(b.prev, ndir, player.pos, 0.5, 1.8, dist);
        if (d !== null && d < hitDist) { hitDist = d; hitTarget = "player"; }
      }

      if (hitTarget) {
        if (hitTarget === "player") cb.onHitPlayer(b.dmg);
        else cb.onHitBot(hitTarget, b.dmg, b.owner);
        impact(scene, b.prev.clone().addScaledVector(seg.normalize(), hitDist));
        scene.remove(b.mesh); bullets.splice(i, 1); continue;
      }
      if (blocked < Infinity) {
        impact(scene, b.prev.clone().addScaledVector(seg.normalize(), blocked));
        scene.remove(b.mesh); bullets.splice(i, 1); continue;
      }
    }

    if (b.life <= 0 || b.mesh.position.y < -2) { scene.remove(b.mesh); bullets.splice(i, 1); }
  }
}

/* 선분 vs 세로 캡슐(사람) 근사 교차 — 거리 반환 또는 null */
function rayHitsCapsule(origin, dir, center, radius, height, maxDist) {
  // 발 위치 center 기준, 몸통 중심
  const body = center.clone(); body.y += height * 0.5;
  const oc = origin.clone().sub(body);
  // 수평 거리 위주 근사: 광선상의 최근접점
  const t = -oc.dot(dir);
  if (t < 0 || t > maxDist) return null;
  const closest = origin.clone().addScaledVector(dir, t);
  const d = closest.distanceTo(body);
  // 캡슐 반경 + 세로 허용
  if (d < radius + 0.4 && Math.abs(closest.y - body.y) < height * 0.6) return t;
  return null;
}

const impactPool = [];
function impact(scene, pos) {
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 })
  );
  p.position.copy(pos);
  p.userData.life = 0.18;
  scene.add(p);
  impactPool.push(p);
}
export function updateImpacts(scene, dt) {
  for (let i = impactPool.length - 1; i >= 0; i--) {
    const p = impactPool[i];
    p.userData.life -= dt;
    p.scale.multiplyScalar(1 + dt * 6);
    p.material.opacity = Math.max(0, p.userData.life / 0.18);
    if (p.userData.life <= 0) { scene.remove(p); impactPool.splice(i, 1); }
  }
}
