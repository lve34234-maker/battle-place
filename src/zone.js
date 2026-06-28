/* ============================================================
   zone.js — 자기장 (수축하는 안전구역)
   ============================================================ */
import * as THREE from "three";
import { CFG } from "./config.js";

export const zone = {
  center: new THREE.Vector2(0, 0),
  radius: CFG.mapSize,
  targetCenter: new THREE.Vector2(0, 0),
  targetRadius: CFG.mapSize,
  phase: 0, timer: CFG.zoneWait, shrinking: false,
  mesh: null,
};

export function initZone(scene) {
  zone.center.set(0, 0);
  zone.radius = CFG.mapSize;
  zone.targetCenter.set(0, 0);
  zone.targetRadius = CFG.mapSize;
  zone.phase = 0; zone.timer = CFG.zoneWait; zone.shrinking = false;

  const geo = new THREE.CylinderGeometry(1, 1, 260, 64, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4da6ff, transparent: true, opacity: 0.16, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 60;
  scene.add(mesh);
  zone.mesh = mesh;
  syncMesh();
}

function syncMesh() {
  zone.mesh.scale.set(zone.radius, 1, zone.radius);
  zone.mesh.position.x = zone.center.x;
  zone.mesh.position.z = zone.center.y;
}

export function updateZone(dt) {
  zone.timer -= dt;

  if (zone.shrinking) {
    const t = Math.min(1, 1 - zone.timer / CFG.zoneShrink);
    zone.radius = lerp(zone._fromR, zone.targetRadius, t);
    zone.center.x = lerp(zone._fromC.x, zone.targetCenter.x, t);
    zone.center.y = lerp(zone._fromC.y, zone.targetCenter.y, t);
    if (zone.timer <= 0) {
      zone.shrinking = false;
      zone.radius = zone.targetRadius;
      zone.center.copy(zone.targetCenter);
      zone.timer = CFG.zoneWait;
    }
  } else if (zone.timer <= 0 && zone.phase < CFG.zonePhases) {
    // 다음 자기장 시작
    zone.phase++;
    zone._fromR = zone.radius;
    zone._fromC = zone.center.clone();
    zone.targetRadius = zone.radius * 0.58;
    const ang = Math.random() * Math.PI * 2;
    const off = (zone.radius - zone.targetRadius) * 0.6 * Math.random();
    zone.targetCenter.set(zone.center.x + Math.cos(ang) * off, zone.center.y + Math.sin(ang) * off);
    zone.shrinking = true;
    zone.timer = CFG.zoneShrink;
  }
  syncMesh();
}

/* 위치가 자기장 밖인지 + 현재 데미지 */
export function zoneStatus(pos) {
  const dx = pos.x - zone.center.x, dz = pos.z - zone.center.y;
  const outside = Math.hypot(dx, dz) > zone.radius;
  const dps = CFG.zoneDPS[Math.min(zone.phase, CFG.zonePhases - 1)] || 1;
  return { outside, dps };
}

function lerp(a, b, t) { return a + (b - a) * t; }
