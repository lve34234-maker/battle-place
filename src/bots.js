/* ============================================================
   bots.js — AI 봇 (배회 / 추격 / 교전)
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPONS, WEAPON_IDS } from "./config.js";
import { groundHeight, resolveCollision, world } from "./world.js";
import { fireBullet } from "./weapons.js";

export const bots = [];

const NAMES = ["Ghost", "Viper", "Reaper", "Hawk", "Wolf", "Cobra", "Raven", "Bear",
  "Falcon", "Tiger", "Shadow", "Storm", "Blaze", "Frost", "Nomad", "Ace"];

const _t = new THREE.Vector3();

export function spawnBots(scene, count) {
  bots.length = 0;
  const S = CFG.mapSize;
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const col = new THREE.Color().setHSL((i * 0.13) % 1, 0.4, 0.45);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }));
    torso.position.y = 1.0; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xcaa178, roughness: 0.8 }));
    head.position.y = 1.7; head.castShadow = true;
    g.add(torso, head);
    scene.add(g);

    const x = (Math.random() - 0.5) * S * 1.8;
    const z = (Math.random() - 0.5) * S * 1.8;
    bots.push({
      pos: new THREE.Vector3(x, groundHeight(x, z), z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp: CFG.maxHealth, dead: false,
      weapon: WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)],
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ""),
      body: g, target: null, nextFire: 0,
      wanderT: 0, wanderDir: new THREE.Vector3(),
    });
  }
}

export function aliveCount() {
  return bots.filter((b) => !b.dead).length;
}

export function updateBots(scene, dt, now, player) {
  for (const bot of bots) {
    if (bot.dead) continue;

    /* ---- 표적 선정 (가장 가까운 적: 플레이어 또는 다른 봇) ---- */
    let best = null, bestD = 70 * 70;
    if (!player.dead) {
      const d = bot.pos.distanceToSquared(player.pos);
      if (d < bestD) { bestD = d; best = { pos: player.pos, isPlayer: true }; }
    }
    for (const other of bots) {
      if (other === bot || other.dead) continue;
      const d = bot.pos.distanceToSquared(other.pos);
      if (d < bestD) { bestD = d; best = { pos: other.pos, isPlayer: false }; }
    }
    bot.target = best;

    const w = WEAPONS[bot.weapon];
    let moveDir = _t.set(0, 0, 0);

    if (best) {
      const dist = Math.sqrt(bestD);
      const toT = best.pos.clone().sub(bot.pos); toT.y = 0;
      bot.yaw = Math.atan2(toT.x, toT.z);

      const inRange = dist < w.range * 0.8;
      const los = hasLOS(bot.pos, best.pos);

      if (inRange && los) {
        // 교전: 적정 거리 유지하며 사격
        if (dist > w.range * 0.4) moveDir.copy(toT).normalize().multiplyScalar(0.6);
        if (now >= bot.nextFire) {
          botShoot(scene, bot, best.pos, w);
          bot.nextFire = now + 60 / w.rpm + Math.random() * 0.15;
        }
      } else {
        // 추격
        moveDir.copy(toT).normalize();
      }
    } else {
      // 배회
      bot.wanderT -= dt;
      if (bot.wanderT <= 0) {
        bot.wanderT = 2 + Math.random() * 3;
        bot.wanderDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        bot.yaw = Math.atan2(bot.wanderDir.x, bot.wanderDir.z);
      }
      moveDir.copy(bot.wanderDir).multiplyScalar(0.5);
    }

    /* ---- 이동 물리 ---- */
    const speed = CFG.runSpeed * 0.7;
    bot.pos.x += moveDir.x * speed * dt;
    bot.pos.z += moveDir.z * speed * dt;
    const gh = groundHeight(bot.pos.x, bot.pos.z);
    bot.pos.y = gh;
    resolveCollision(bot.pos, 0.45);

    const S = CFG.mapSize;
    bot.pos.x = Math.max(-S, Math.min(S, bot.pos.x));
    bot.pos.z = Math.max(-S, Math.min(S, bot.pos.z));

    bot.body.position.copy(bot.pos);
    bot.body.rotation.y = bot.yaw;
  }
}

function botShoot(scene, bot, targetPos, w) {
  const origin = bot.pos.clone(); origin.y += 1.5;
  const aim = targetPos.clone(); aim.y += 1.0;
  const dir = aim.sub(origin).normalize();
  const spread = w.spread * 0.02 + 0.02;     // 봇은 약간 부정확
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  fireBullet(scene, origin.addScaledVector(dir, 0.6), dir.normalize(), w.dmg * 0.8, false, bot);
}

function hasLOS(a, b) {
  const from = a.clone(); from.y += 1.4;
  const to = b.clone(); to.y += 1.2;
  const dir = to.clone().sub(from);
  const dist = dir.length(); dir.normalize();
  const ray = new THREE.Raycaster(from, dir, 0.5, dist);
  return ray.intersectObjects(world.solids, true).length === 0;
}

export function killBot(scene, bot) {
  bot.dead = true;
  bot.body.visible = false;
}
