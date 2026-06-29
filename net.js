"use strict";
/* ============================================================
   net.js — Supabase 실시간 멀티플레이 (서버 안 켜도 됨!)
   ------------------------------------------------------------
   "내 컴퓨터를 켜둘 필요 없이" Supabase가 서버 역할을 한다.
   - Realtime 'broadcast' 로 다른 플레이어 위치/상태를 주고받고
   - 'presence' 로 누가 접속/퇴장했는지 안다.
   설정값(URL, KEY)이 비어있으면 자동으로 '혼자 모드(오프라인)'로
   돌아가니까, 일단 게임은 무조건 켜진다.
   ============================================================ */

/* ▼▼▼ 여기에 본인 Supabase 프로젝트 값을 넣으세요 ▼▼▼
   Supabase 대시보드 → Project Settings → API 에서 복사.
   비워두면 혼자(봇/싱글) 모드로 실행됩니다. */
const SUPABASE_URL = "";       // 예: "https://abcd1234.supabase.co"
const SUPABASE_ANON_KEY = "";  // 예: "eyJhbGciOi..."
/* ▲▲▲ 여기까지 ▲▲▲ */

const Net = (function () {
  let client = null;
  let channel = null;
  let myId = "p_" + Math.floor(Math.random() * 1e9).toString(36);
  let connected = false;
  let lastSend = 0;
  let cbState = () => {};
  let cbLeave = () => {};
  let cbHit = () => {};
  let cbChat = () => {};
  let profile = { nick: "플레이어", country: "🌍", color: 0x66ccff };

  function online() { return connected; }
  function id() { return myId; }

  function init(prof, handlers) {
    profile = Object.assign(profile, prof || {});
    cbState = handlers.onState || cbState;
    cbLeave = handlers.onLeave || cbLeave;
    cbHit = handlers.onHit || cbHit;
    cbChat = handlers.onChat || cbChat;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof supabase === "undefined") {
      console.warn("[Net] Supabase 설정 없음 → 혼자 모드로 실행합니다.");
      connected = false;
      return false;
    }
    try {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 15 } },
      });
      channel = client.channel("world", {
        config: { broadcast: { self: false }, presence: { key: myId } },
      });

      channel.on("broadcast", { event: "state" }, ({ payload }) => {
        if (payload && payload.id !== myId) cbState(payload);
      });
      channel.on("broadcast", { event: "hit" }, ({ payload }) => {
        if (payload && payload.target === myId) cbHit(payload);
      });
      channel.on("broadcast", { event: "chat" }, ({ payload }) => {
        if (payload && payload.id !== myId) cbChat(payload);
      });
      channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
        (leftPresences || []).forEach((p) => cbLeave(p.id || p.presence_ref));
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          connected = true;
          await channel.track({ id: myId, nick: profile.nick, country: profile.country });
          console.log("[Net] 접속 완료:", myId);
        }
      });
      return true;
    } catch (e) {
      console.warn("[Net] 접속 실패 → 혼자 모드:", e);
      connected = false;
      return false;
    }
  }

  /* 내 상태 전송 (게임 루프에서 자주 호출, 내부에서 속도 제한) */
  function sendState(s, now) {
    if (!connected || !channel) return;
    if (now - lastSend < 90) return; // ~11Hz
    lastSend = now;
    channel.send({
      type: "broadcast", event: "state",
      payload: Object.assign({ id: myId, nick: profile.nick, country: profile.country, color: profile.color }, s),
    });
  }

  function sendHit(targetId, dmg) {
    if (!connected || !channel) return;
    channel.send({ type: "broadcast", event: "hit", payload: { from: myId, target: targetId, dmg } });
  }

  function sendChat(text) {
    if (!connected || !channel) return;
    channel.send({ type: "broadcast", event: "chat", payload: { id: myId, nick: profile.nick, country: profile.country, text } });
  }

  return { init, sendState, sendHit, sendChat, online, id };
})();
