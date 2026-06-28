/* ============================================================
   main.js — 게임 오케스트레이션 / 메인 루프
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPON_IDS, WEAPONS } from "./config.js";
import { initEngine, engine, followSunShadow } from "./engine.js";
import { buildWorld, spawnLoot, world } from "./world.js";
import { initInput, input, consumeFrame } from "./input.js";
import { loadWeaponModels, bullets, updateBullets, updateImpacts } from "./weapons.js";
import { player, initPlayer, updatePlayer, equipWeapon, damagePlayer } from "./player.js";
import { bots, spawnBots, updateBots, aliveCount, killBot } from "./bots.js";
import { zone, initZone, updateZone, zoneStatus } from "./zone.js";
import * as UI from "./ui.js";

let state = "loading";
let clock;
let botTotal = 19;
let zoneTick = 0;

async function boot() {
  UI.initUI();
  UI.showScreen("loading");

  initEngine();
  clock = new THREE.Clock();

  buildWorld(engine.scene);
  spawnLoot(engine.scene);
  initPlayer(engine.scene);
  initZone(engine.scene);

  UI.setLoad(0.1, "총기 모델 불러오는 중...");
  await loadWeaponModels((p) => UI.setLoad(0.1 + p * 0.85, `총기 모델 ${Math.round(p * 100)}%`));
  UI.setLoad(1, "준비 완료");

  initInput(engine.renderer.domElement);
  bindStartUI();

  state = "start";
  UI.showScreen("start");
  renderLoop();
}

function bindStartUI() {
  document.getElementById("startBtn").addEventListener("click", startMatch);
  document.getElementById("againBtn").addEventListener("click", () => location.reload());
}

function startMatch() {
  const nick = document.getElementById("nick").value.trim() || "플레이어";
  botTotal = parseInt(document.getElementById("botCount").value, 10) || 19;
  player.nick = nick;

  // 플레이어 시작 위치 + 시작 무기
  const sx = (Math.random() - 0.5) * CFG.mapSize;
  const sz = (Math.random() - 0.5) * CFG.mapSize;
  player.pos.set(sx, 0, sz);
  equipWeapon(engine.scene, WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]);

  spawnBots(engine.scene, botTotal);

  state = "play";
  UI.showScreen("play");
  engine.renderer.domElement.requestPointerLock();
}

/* ---------- 메인 루프 ---------- */
function renderLoop() {
  requestAnimationFrame(renderLoop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;

  if (state === "play") tick(dt, now);

  engine.renderer.render(engine.scene, engine.camera);
}

function tick(dt, now) {
  const cb = {
    onHitBot: (bot, dmg, owner) => {
      bot.hp -= dmg;
      if (bot.hp <= 0 && !bot.dead) {
        killBot(engine.scene, bot);
        const killer = owner === "player" ? player.nick : (owner ? owner.name : "?");
        UI.addKillfeed(killer, bot.name);
        if (owner === "player") player.kills++;
      }
    },
    onHitPlayer: (dmg) => {
      damagePlayer(dmg);
      UI.damageFlash();
    },
    onFire: () => {},
  };

  updatePlayer(engine.scene, engine.camera, input, dt, now, cb);
  updateBots(engine.scene, dt, now, player);
  updateBullets(engine.scene, dt, world.solids, bots, player, cb);
  updateImpacts(engine.scene, dt);
  updateZone(dt);

  /* 자기장 데미지 (1초마다) */
  zoneTick += dt;
  if (zoneTick >= 1) {
    zoneTick = 0;
    const ps = zoneStatus(player.pos);
    if (ps.outside && !player.dead) { damagePlayer(ps.dps); UI.damageFlash(); }
    for (const bot of bots) {
      if (bot.dead) continue;
      const bs = zoneStatus(bot.pos);
      if (bs.outside) {
        bot.hp -= bs.dps;
        if (bot.hp <= 0) {
          killBot(engine.scene, bot);
          UI.addKillfeed("자기장", bot.name);
        }
      }
    }
  }

  followSunShadow(player.pos);
  handlePickup();

  /* ---- HUD ---- */
  const alive = aliveCount() + (player.dead ? 0 : 1);
  UI.updateHUD(player, alive, zone);
  UI.setCrosshair(player.aiming);
  UI.showZoneWarn(zoneStatus(player.pos).outside && !player.dead);
  UI.drawMinimap(player, bots, zone);

  consumeFrame();

  checkEnd(alive);
}

/* 가장 가까운 전리품 줍기 */
function handlePickup() {
  let nearest = null, nd = CFG.pickRange * CFG.pickRange;
  for (const l of world.loot) {
    if (l.taken) continue;
    const d = player.pos.distanceToSquared(l.mesh.position);
    if (d < nd) { nd = d; nearest = l; }
  }
  if (nearest) {
    UI.showPickHint(WEAPONS[nearest.weapon] ? WEAPONS[nearest.weapon].name : "무기");
    if (input.pick) {
      equipWeapon(engine.scene, nearest.weapon);
      nearest.taken = true;
      nearest.mesh.visible = false;
      UI.showPickHint(null);
    }
  } else {
    UI.showPickHint(null);
  }
}

function checkEnd(alive) {
  if (player.dead) {
    document.exitPointerLock();
    UI.showResult(false, player.kills, alive + 1, botTotal + 1);
    state = "result";
  } else if (aliveCount() === 0) {
    document.exitPointerLock();
    UI.showResult(true, player.kills, 1, botTotal + 1);
    state = "result";
  }
}

boot();
