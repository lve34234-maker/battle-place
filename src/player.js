/* ============================================================
   player.js — 플레이어 상태 / 이동 물리 / 카메라(1·3인칭) / 사격
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPONS, STANCE } from "./config.js";
import { groundHeight, resolveCollision, world } from "./world.js";
import { fireBullet, makeViewModel } from "./weapons.js";

export const player = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  onGround: true,
  hp: CFG.maxHealth, dead: false, nick: "플레이어",
  weapons: [null, null], ammo: [0, 0], slot: 0,
  nextFire: 0, reloading: false, reloadEnd: 0,
  stance: "stand", aiming: false, tpp: false,
  recoil: 0, kick: 0, viewModel: null, bodyWeapon: null, body: null, weaponRig: null,
  kills: 0,
};

const SENS = 0.0022;
const tmpDir = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();

export function initPlayer(scene) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b5d4a, roughness: 0.7, metalness: 0.1 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 8), mat);
  torso.position.y = 1.0; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xcaa178, roughness: 0.8 }));
  head.position.y = 1.7; head.castShadow = true;
  g.add(torso, head);
  scene.add(g);
  player.body = g;
}

/* 무기 장착 (슬롯 자동) */
export function equipWeapon(scene, weaponId) {
  let slot = player.weapons.indexOf(null);
  if (slot === -1) slot = player.slot;          // 가득 차면 현재 슬롯 교체
  player.weapons[slot] = weaponId;
  player.ammo[slot] = WEAPONS[weaponId].mag;
  selectSlot(scene, slot);
}

export function selectSlot(scene, slot) {
  if (!player.weapons[slot]) return;
  player.slot = slot;
  refreshWeaponModel(scene);
}

function refreshWeaponModel() {
  const wid = player.weapons[player.slot];
  if (player.viewModel) { player.viewModel.removeFromParent(); player.viewModel = null; }
  if (player.bodyWeapon) { player.bodyWeapon.removeFromParent(); player.bodyWeapon = null; }
  if (!wid) return;

  /* 1인칭 뷰모델 (총열은 이미 -Z 정렬됨; rig에서 위치/각도 제어) */
  const vm = makeViewModel(wid, 0.5);
  if (vm) player.viewModel = vm;

  /* 3인칭: 몸체 손 위치에 부착 (총열을 앞 +Z로) */
  const bw = makeViewModel(wid, 0.55);
  if (bw) {
    bw.position.set(0.5, 1.05, 0.05);   // 오른쪽 옆구리 — 뒤 카메라에서 보임
    bw.rotation.y = 0;                  // 총열 앞(+Z)
    player.body.add(bw);
    player.bodyWeapon = bw;
  }
}

export function updatePlayer(scene, camera, input, dt, now, cb) {
  if (player.dead) return;

  /* ---- 시점 ---- */
  player.yaw -= input.look.dx * SENS;
  player.pitch -= input.look.dy * SENS;
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch));

  /* ---- 자세 토글 ---- */
  if (input.stance === "crouch") player.stance = player.stance === "crouch" ? "stand" : "crouch";
  if (input.stance === "prone") player.stance = player.stance === "prone" ? "stand" : "prone";
  if (input.toggleView) player.tpp = !player.tpp;
  player.aiming = input.aim;

  /* ---- 무기 교체/장전 ---- */
  if (input.swap) selectSlot(scene, input.swap - 1);
  if (input.reload) tryReload(now);
  if (player.reloading && now >= player.reloadEnd) {
    player.ammo[player.slot] = WEAPONS[player.weapons[player.slot]].mag;
    player.reloading = false;
  }

  /* ---- 이동 ---- */
  const st = STANCE[player.stance];
  let speed = CFG.walkSpeed;
  if (input.run && player.stance === "stand" && !player.aiming) speed = CFG.runSpeed;
  speed *= st.speed;
  if (player.aiming) speed *= 0.7;

  tmpFwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(tmpFwd.z, 0, -tmpFwd.x);
  tmpDir.set(0, 0, 0)
    .addScaledVector(tmpFwd, input.move.y)
    .addScaledVector(right, input.move.x);
  if (tmpDir.lengthSq() > 0) tmpDir.normalize();

  player.vel.x = tmpDir.x * speed;
  player.vel.z = tmpDir.z * speed;

  /* 점프 / 중력 */
  if (input.jump && player.onGround && player.stance === "stand") {
    player.vel.y = CFG.jumpForce; player.onGround = false;
  }
  player.vel.y += CFG.gravity * dt;

  player.pos.addScaledVector(player.vel, dt);

  /* 지면 충돌 */
  const gh = groundHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= gh) { player.pos.y = gh; player.vel.y = 0; player.onGround = true; }
  else player.onGround = false;

  /* 건물 충돌 */
  resolveCollision(player.pos, 0.45);

  /* 맵 경계 */
  const S = CFG.mapSize;
  player.pos.x = Math.max(-S, Math.min(S, player.pos.x));
  player.pos.z = Math.max(-S, Math.min(S, player.pos.z));

  /* ---- 사격 ---- */
  if (input.fire) tryFire(scene, camera, now, cb);

  /* 반동/킥 회복 */
  player.recoil = Math.max(0, player.recoil - dt * 4);
  player.kick = Math.max(0, player.kick - dt * 6);

  /* ---- 몸체 갱신 (자세는 높이로만 표현, 크기 왜곡 없음) ---- */
  player.body.position.copy(player.pos);
  player.body.rotation.y = player.yaw;
  player.body.position.y = player.stance === "prone" ? -0.7 : player.stance === "crouch" ? -0.4 : 0;
  player.body.position.y += player.pos.y;

  /* ---- 카메라 ---- */
  const eye = CFG.eyeHeight * st.h;
  const aimPitch = player.pitch + player.recoil * 0.04;
  if (player.tpp) {
    // 3인칭: 어깨 뒤
    const head = player.pos.clone(); head.y += eye;
    const back = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(-4.2);
    back.y = 1.8 - aimPitch * 2.2;
    const camPos = head.clone().add(back).add(right.clone().multiplyScalar(0.8));
    // 벽 통과 방지
    resolveCameraClip(head, camPos);
    camera.position.copy(camPos);
    const look = head.clone().addScaledVector(tmpFwd, 6); look.y -= aimPitch * 6;
    camera.lookAt(look);
    if (player.viewModel) player.viewModel.visible = false;
    if (player.bodyWeapon) player.bodyWeapon.visible = true;
  } else {
    camera.position.copy(player.pos); camera.position.y += eye;
    camera.rotation.set(0, 0, 0);
    camera.rotateY(player.yaw);
    camera.rotateX(aimPitch);

    // 카메라에 무기 rig 보장
    if (!player.weaponRig) { player.weaponRig = new THREE.Group(); camera.add(player.weaponRig); }
    if (player.viewModel && player.viewModel.parent !== player.weaponRig) {
      player.weaponRig.clear();
      player.weaponRig.add(player.viewModel);
    }
    if (player.viewModel) player.viewModel.visible = true;
    if (player.bodyWeapon) player.bodyWeapon.visible = false;

    // 조준 시 화면 중앙으로, 평상시 우하단. 반동 킥은 뒤(+Z)로.
    const rig = player.weaponRig;
    const tx = player.aiming ? 0.02 : 0.16;
    const ty = player.aiming ? -0.06 : -0.16;
    const tz = (player.aiming ? -0.42 : -0.4) + player.kick * 0.12;
    rig.position.x += (tx - rig.position.x) * 0.4;
    rig.position.y += (ty - rig.position.y) * 0.4;
    rig.position.z += (tz - rig.position.z) * 0.5;
    rig.rotation.y = player.aiming ? 0.04 : 0.22;   // 측면이 보이게 살짝 틀기
    rig.rotation.x = 0.05 + player.kick * 0.25;
  }
}

function resolveCameraClip(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length(); dir.normalize();
  const ray = new THREE.Raycaster(from, dir, 0.1, dist);
  const hits = ray.intersectObjects(world.solids, true);
  if (hits.length) to.copy(from).addScaledVector(dir, Math.max(0.5, hits[0].distance - 0.3));
}

function tryReload(now) {
  const wid = player.weapons[player.slot];
  if (!wid || player.reloading) return;
  if (player.ammo[player.slot] >= WEAPONS[wid].mag) return;
  player.reloading = true;
  player.reloadEnd = now + WEAPONS[wid].reload;
}

function tryFire(scene, camera, now, cb) {
  const wid = player.weapons[player.slot];
  if (!wid || player.reloading || now < player.nextFire) return;
  const w = WEAPONS[wid];
  if (player.ammo[player.slot] <= 0) { tryReload(now); return; }

  player.nextFire = now + 60 / w.rpm;
  player.ammo[player.slot]--;

  // 발사 방향 = 카메라 정면 + 확산
  camera.updateMatrixWorld();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const spread = (w.spread * STANCE[player.stance].spread * (player.aiming ? 0.35 : 1)) * 0.012;
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();

  const origin = camera.position.clone().addScaledVector(dir, 0.6);
  fireBullet(scene, origin, dir, w.dmg, true);

  // 반동 (시점 튐 + 무기 킥)
  player.recoil = Math.min(6, player.recoil + w.recoil);
  player.pitch += w.recoil * 0.004;
  player.kick = Math.min(1.2, player.kick + w.recoil * 0.18);

  cb && cb.onFire && cb.onFire(w);
}

export function damagePlayer(dmg) {
  if (player.dead) return;
  player.hp -= dmg;
  if (player.hp <= 0) { player.hp = 0; player.dead = true; }
}
