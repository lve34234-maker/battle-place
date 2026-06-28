/* ============================================================
   ui.js — HUD / 미니맵 / 화면 전환 / 알림
   ============================================================ */
import { WEAPONS, CFG } from "./config.js";

const $ = (id) => document.getElementById(id);

export const ui = {
  loadBar: null, loadTxt: null, minimap: null, mmCtx: null,
};

export function initUI() {
  ui.loadBar = $("loadBar"); ui.loadTxt = $("loadTxt");
  ui.minimap = $("minimap"); ui.mmCtx = ui.minimap.getContext("2d");
}

export function setLoad(p, txt) {
  if (ui.loadBar) ui.loadBar.style.width = Math.round(p * 100) + "%";
  if (txt && ui.loadTxt) ui.loadTxt.textContent = txt;
}

export function showScreen(name) {
  $("loading").classList.toggle("hidden", name !== "loading");
  $("start").classList.toggle("hidden", name !== "start");
  $("hud").classList.toggle("hidden", name !== "play");
  $("result").classList.toggle("hidden", name !== "result");
}

/* HUD 갱신 */
export function updateHUD(player, aliveTotal, zone) {
  // 체력
  $("hpbar").style.width = player.hp + "%";
  $("hpNum").textContent = Math.ceil(player.hp);
  // 자세
  $("stanceLbl").textContent = { stand: "서기", crouch: "앉기", prone: "엎드림" }[player.stance];
  // 생존 수
  $("aliveNum").textContent = aliveTotal;
  // 무기 슬롯
  for (let i = 0; i < 2; i++) {
    const wid = player.weapons[i];
    const slot = $("slot" + i);
    slot.querySelector(".n").textContent = wid ? WEAPONS[wid].name : "-";
    slot.classList.toggle("active", player.slot === i && !!wid);
  }
  // 탄약
  const wid = player.weapons[player.slot];
  $("ammoNow").textContent = wid ? player.ammo[player.slot] : 0;
  $("ammoMag").textContent = wid ? WEAPONS[wid].mag : 0;
  // 자기장 정보
  $("phaseInfo").textContent = zone.shrinking
    ? `자기장 수축 중 (${zone.phase})`
    : `자기장 ${zone.phase} 대기 ${Math.ceil(zone.timer)}s`;
}

/* 조준 시 크로스헤어 좁힘 */
export function setCrosshair(aiming) {
  $("crosshair").style.width = aiming ? "12px" : "30px";
  $("crosshair").style.height = aiming ? "12px" : "30px";
}

export function showZoneWarn(on) {
  $("zoneWarn").classList.toggle("show", on);
}

export function showPickHint(name) {
  const el = $("pickHint");
  if (name) { $("pickName").textContent = name; el.classList.add("show"); }
  else el.classList.remove("show");
}

let feed = [];
export function addKillfeed(killer, victim) {
  feed.unshift(`${killer} ▸ ${victim}`);
  feed = feed.slice(0, 5);
  $("killfeed").innerHTML = feed.map((f) => `<div>${f}</div>`).join("");
}

export function damageFlash() {
  const f = $("dmgflash"), v = $("dmgVignette");
  f.style.background = "rgba(231,64,46,.28)";
  v.style.opacity = "1";
  setTimeout(() => { f.style.background = "rgba(231,64,46,0)"; v.style.opacity = "0"; }, 120);
}

/* 미니맵 그리기 */
export function drawMinimap(player, bots, zone) {
  const ctx = ui.mmCtx, size = ui.minimap.width;
  const S = CFG.mapSize;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#1a2014";
  ctx.fillRect(0, 0, size, size);

  const toMap = (x, z) => [((x + S) / (2 * S)) * size, ((z + S) / (2 * S)) * size];

  // 자기장
  const [zx, zy] = toMap(zone.center.x, zone.center.y);
  const zr = (zone.radius / (2 * S)) * size;
  ctx.strokeStyle = "#4da6ff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2); ctx.stroke();

  // 봇
  ctx.fillStyle = "#e7402e";
  for (const b of bots) {
    if (b.dead) continue;
    const [bx, by] = toMap(b.pos.x, b.pos.z);
    ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
  }

  // 플레이어
  const [px, py] = toMap(player.pos.x, player.pos.z);
  ctx.fillStyle = "#f2a900";
  ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
  // 시야 방향
  ctx.strokeStyle = "#f2a900";
  ctx.beginPath(); ctx.moveTo(px, py);
  ctx.lineTo(px + Math.sin(player.yaw) * 8, py + Math.cos(player.yaw) * 8);
  ctx.stroke();
}

export function showResult(win) {
  showScreen("result");
  $("resTitle").textContent = win ? "최후 생존! 오늘 저녁은 치킨!" : "사망";
  $("resTitle").className = "res-title " + (win ? "res-win" : "res-lose");
  $("resStat").innerHTML = win
    ? `모든 자기장 단계를 <span>생존</span>했습니다`
    : `자기장에 휩쓸렸습니다`;
}
