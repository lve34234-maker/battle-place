/* ============================================================
   main.js — 게임 오케스트레이션 / 메인 루프 (AI 없음: 탐험·사격·자기장)
   ============================================================ */
import * as THREE from "three";
import { CFG, WEAPON_IDS, WEAPONS } from "./config.js";
import { initEngine, engine, followSunShadow } from "./engine.js";
import { buildWorld, spawnLoot, world } from "./world.js";
import { initInput, input, consumeFrame } from "./input.js";
import { updateBullets, updateImpacts, loadWeaponModels } from "./weapons.js";
import { player, initPlayer, updatePlayer, equipWeapon, damagePlayer } from "./player.js";
import { zone, initZone, updateZone, zoneStatus } from "./zone.js";
import * as UI from "./ui.js";

const NO_BOTS = [];   // AI 제거 — 빈 적 목록

let state = "loading";
let clock;
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
  player.nick = document.getElementById("nick").value.trim() || "플레이어";

  // 시작 위치(맵 중앙 마을 근처) + 시작 무기
  player.pos.set(20, 0, 20);
  equipWeapon(engine.scene, WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]);

  // AI가 없으므로 생존 수/킬피드 UI 숨김
  document.getElementById("aliveTop").style.display = "none";
  document.getElementById("killfeed").style.display = "none";

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
    onHitBot: () => {},
    onHitPlayer: (dmg) => { damagePlayer(dmg); UI.damageFlash(); },
    onFire: () => {},
  };

  updatePlayer(engine.scene, engine.camera, input, dt, now, cb);
  updateBullets(engine.scene, dt, world.solids, NO_BOTS, player, cb);
  updateImpacts(engine.scene, dt);
  updateZone(dt);

  /* 자기장 데미지 (1초마다) */
  zoneTick += dt;
  if (zoneTick >= 1) {
    zoneTick = 0;
    const ps = zoneStatus(player.pos);
    if (ps.outside && !player.dead) { damagePlayer(ps.dps); UI.damageFlash(); }
  }

  followSunShadow(player.pos);
  handlePickup();

  /* ---- HUD ---- */
  UI.updateHUD(player, 1, zone);
  UI.setCrosshair(player.aiming);
  UI.showZoneWarn(zoneStatus(player.pos).outside && !player.dead);
  UI.drawMinimap(player, NO_BOTS, zone);

  consumeFrame();
  checkEnd();
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

function checkEnd() {
  if (player.dead) {
    document.exitPointerLock();
    UI.showResult(false);
    state = "result";
  } else if (zone.phase >= CFG.zonePhases && !zone.shrinking) {
    // 모든 자기장 단계 생존 → 승리
    document.exitPointerLock();
    UI.showResult(true);
    state = "result";
  }
}

boot();
