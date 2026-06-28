/* ============================================================
   input.js — 키보드 / 마우스(포인터락) / 터치 입력
   ============================================================ */
export const input = {
  move: { x: 0, y: 0 },     // x: 좌우(-1..1), y: 전후(-1..1)
  look: { dx: 0, dy: 0 },   // 마우스/터치 시점 델타 (프레임마다 소비)
  fire: false, aim: false, jump: false, run: false,
  reload: false, pick: false, swap: 0, stance: null, toggleView: false,
  locked: false,
};

const keys = {};

export function initInput(canvas) {
  /* ---- 키보드 ---- */
  addEventListener("keydown", (e) => {
    if (keys[e.code]) return;
    keys[e.code] = true;
    switch (e.code) {
      case "KeyR": input.reload = true; break;
      case "KeyF": input.pick = true; break;
      case "Digit1": input.swap = 1; break;
      case "Digit2": input.swap = 2; break;
      case "KeyC": input.stance = "crouch"; break;
      case "KeyZ": input.stance = "prone"; break;
      case "KeyV": input.toggleView = true; break;
      case "Space": input.jump = true; break;
    }
    updateMove();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; updateMove(); });

  function updateMove() {
    input.move.x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    input.move.y = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    input.run = !!(keys.ShiftLeft || keys.ShiftRight);
  }

  /* ---- 마우스 ---- */
  canvas.addEventListener("click", () => { if (!input.locked) canvas.requestPointerLock(); });
  document.addEventListener("pointerlockchange", () => {
    input.locked = document.pointerLockElement === canvas;
  });
  addEventListener("mousemove", (e) => {
    if (!input.locked) return;
    input.look.dx += e.movementX;
    input.look.dy += e.movementY;
  });
  addEventListener("mousedown", (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = true;
  });
  addEventListener("mouseup", (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.aim = false;
  });
  addEventListener("contextmenu", (e) => e.preventDefault());

  initTouch();
}

/* 한 프레임 처리 후 1회성 입력 소비 */
export function consumeFrame() {
  input.look.dx = 0; input.look.dy = 0;
  input.reload = false; input.pick = false;
  input.swap = 0; input.stance = null; input.toggleView = false; input.jump = false;
}

/* ---------- 모바일 터치 ---------- */
function initTouch() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const touch = document.getElementById("touch");
  if (!isMobile || !touch) return;
  touch.classList.remove("hidden");

  const joy = document.getElementById("joy");
  const stick = document.getElementById("joyStick");
  let joyId = null, jcx = 0, jcy = 0;

  joy.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0]; joyId = t.identifier;
    const r = joy.getBoundingClientRect(); jcx = r.left + r.width / 2; jcy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });

  addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - jcx, dy = t.clientY - jcy;
        const max = 50, len = Math.hypot(dx, dy) || 1;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        stick.style.transform = `translate(${dx - 26}px,${dy - 26}px)`;
        input.move.x = dx / max; input.move.y = -dy / max;
        input.run = len > max * 0.8;
      }
    }
  }, { passive: false });

  addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null; stick.style.transform = "translate(-50%,-50%)";
        input.move.x = 0; input.move.y = 0; input.run = false;
      }
    }
  });

  /* 시점 드래그 (오른쪽 화면) */
  let lookId = null, lx = 0, ly = 0;
  addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > innerWidth / 2 && lookId === null && t.target === touch) {
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });
  addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        input.look.dx += (t.clientX - lx) * 1.6;
        input.look.dy += (t.clientY - ly) * 1.6;
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });
  addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  });

  const bind = (id, on, off) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", (e) => { on(); e.preventDefault(); }, { passive: false });
    if (off) el.addEventListener("touchend", (e) => { off(); e.preventDefault(); }, { passive: false });
  };
  bind("tFire", () => input.fire = true, () => input.fire = false);
  bind("tAim", () => input.aim = !input.aim);
  bind("tJump", () => input.jump = true);
  bind("tReload", () => input.reload = true);
  bind("tPick", () => input.pick = true);
  bind("tStance", () => input.stance = "crouch");
}
