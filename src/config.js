/* ============================================================
   config.js — 게임 전역 상수 (무기/맵/물리)
   ============================================================ */

/* 총기 7종 — 실제 .glb 모델 파일명과 연결 (range = 유효사거리 m) */
export const WEAPONS = {
  m4a1:   { name: "M4A1",   type: "AR",  dmg: 28,  rpm: 660, range: 220, mag: 30, reload: 2.4, mode: "auto",   recoil: 1.3, spread: 0.9, muzzle: 0.85, model: "m4a1" },
  m4a1_s: { name: "M4A1-S", type: "AR",  dmg: 30,  rpm: 600, range: 240, mag: 25, reload: 2.5, mode: "auto",   recoil: 1.1, spread: 0.7, muzzle: 0.85, model: "m4a1_s" },
  mp5k:   { name: "MP5K",   type: "SMG", dmg: 21,  rpm: 900, range: 90,  mag: 30, reload: 2.0, mode: "auto",   recoil: 0.8, spread: 1.3, muzzle: 0.6,  model: "mp5k" },
  ss55:   { name: "SS-55",  type: "AR",  dmg: 40,  rpm: 400, range: 200, mag: 20, reload: 2.8, mode: "auto",   recoil: 1.8, spread: 1.0, muzzle: 0.8,  model: "ss55" },
  ksr29:  { name: "KSR-29", type: "SR",  dmg: 95,  rpm: 50,  range: 600, mag: 5,  reload: 3.5, mode: "single", recoil: 4.0, spread: 0.05, muzzle: 1.1, model: "ksr29" },
  awp:    { name: "AWP",    type: "SR",  dmg: 120, rpm: 41,  range: 800, mag: 5,  reload: 3.8, mode: "single", recoil: 5.0, spread: 0.02, muzzle: 1.15, model: "awp" },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

/* 전역 설정 */
export const CFG = {
  mapSize: 360,          // 맵 반경(한 변의 절반)
  maxHealth: 100,
  // 이동 물리 (m/s)
  walkSpeed: 5.2, runSpeed: 9.0, crouchSpeed: 2.6, proneSpeed: 1.3,
  jumpForce: 6.8, gravity: -20, eyeHeight: 1.65,
  // 자기장
  zonePhases: 7, zoneWait: 16, zoneShrink: 22, zoneDPS: { 0:1, 1:1, 2:2, 3:3, 4:5, 5:8, 6:12 },
  // 상호작용
  pickRange: 3.2, lootCount: 60,
  // 탄도
  bulletSpeed: 320, bulletGravity: -9.0,
};

/* 자세별 카메라 높이 배율 / 이동속도 배율 / 명중 폭 보정 */
export const STANCE = {
  stand:  { h: 1.0,  speed: 1.0,  spread: 1.0,  label: "서기" },
  crouch: { h: 0.62, speed: 0.5,  spread: 0.6,  label: "앉기" },
  prone:  { h: 0.28, speed: 0.25, spread: 0.35, label: "엎드림" },
};
