// ─── INPUT SYSTEM ───
// Keyboard, mouse, and touch. Touch uses a floating virtual thumbstick by
// default (touch anywhere on the play area, drag to steer) so your finger
// doesn't cover the action. "follow" mode keeps the v1 drift-toward-finger feel.

export const STICK_MAX_R = 56;      // px of knob travel for full speed
const STICK_DEAD_ZONE = 0.12;       // fraction of max radius ignored

export function createInput(canvas, opts = {}) {
  const keys = { up: false, down: false, left: false, right: false };

  let mouseActive = false;
  let mouseX = 0;
  let mouseY = 0;

  let touchMode = opts.touchMode === "follow" ? "follow" : "joystick";
  let enabled = true;

  // One tracked touch pointer (extra fingers are ignored)
  const stick = { id: null, active: false, bx: 0, by: 0, kx: 0, ky: 0 };

  // ─── Keyboard ───
  function onKey(key, down) {
    if (key === "ArrowUp" || key === "w" || key === "W") keys.up = down;
    if (key === "ArrowDown" || key === "s" || key === "S") keys.down = down;
    if (key === "ArrowLeft" || key === "a" || key === "A") keys.left = down;
    if (key === "ArrowRight" || key === "d" || key === "D") keys.right = down;
  }
  window.addEventListener("keydown", e => {
    onKey(e.key, true);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  });
  window.addEventListener("keyup", e => onKey(e.key, false));

  // ─── Mouse (unchanged from v1: direction from screen center) ───
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseY = (e.clientY - rect.top) / rect.height;
    mouseActive = true;
  });
  canvas.addEventListener("mouseleave", () => { mouseActive = false; });

  // ─── Touch: pointer events, one pointer id ───
  // Cancelling touchstart stops the browser from scrolling/zooming and from
  // firing emulated mouse events (which would otherwise hijack steering).
  const stopTouch = e => { if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener("touchstart", stopTouch, { passive: false });
  canvas.addEventListener("touchmove", stopTouch, { passive: false });

  function localPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  }

  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    if (!enabled || stick.id !== null) return;   // ignore extra fingers
    mouseActive = false;
    const p = localPos(e);
    stick.id = e.pointerId;
    stick.active = true;
    stick.bx = stick.kx = p.x;
    stick.by = stick.ky = p.y;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", e => {
    if (e.pointerId !== stick.id) return;
    const p = localPos(e);
    stick.kx = p.x;
    stick.ky = p.y;
    if (touchMode === "joystick") {
      // Dragging past the rim drags the base along, so the stick never "runs out"
      const dx = stick.kx - stick.bx;
      const dy = stick.ky - stick.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK_MAX_R) {
        const over = d - STICK_MAX_R;
        stick.bx += (dx / d) * over;
        stick.by += (dy / d) * over;
      }
    }
    e.preventDefault();
  });

  function release(e) {
    if (e && e.pointerId !== stick.id) return;
    stick.id = null;
    stick.active = false;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  window.addEventListener("blur", () => reset());
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });

  function stickVector() {
    if (!stick.active) return null;
    if (touchMode === "follow") {
      const rect = canvas.getBoundingClientRect();
      const dx = (stick.kx / rect.width - 0.5) * 2;
      const dy = (stick.ky / rect.height - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      if (d <= 0.06) return { x: 0, y: 0 };
      const s = Math.min(1, d);
      return { x: (dx / d) * s, y: (dy / d) * s };
    }
    const dx = stick.kx - stick.bx;
    const dy = stick.ky - stick.by;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / STICK_MAX_R);
    if (m <= STICK_DEAD_ZONE) return { x: 0, y: 0 };
    const s = (m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
    return { x: (dx / d) * s, y: (dy / d) * s };
  }

  /** Movement direction { mx, my, magnitude }, magnitude 0..1. */
  function getMovement() {
    let mx = 0;
    let my = 0;
    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;

    if (mouseActive) {
      const dx = (mouseX - 0.5) * 2;
      const dy = (mouseY - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      if (d > 0.06) {
        const strength = Math.min(1, d);
        mx += (dx / d) * strength;
        my += (dy / d) * strength;
      }
    }

    const sv = enabled ? stickVector() : null;
    if (sv) {
      mx += sv.x;
      my += sv.y;
    }

    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    return { mx, my, magnitude: Math.min(1, mag) };
  }

  /** Drop any held touch (used when menus open, on pause, on blur). */
  function reset() {
    if (stick.id !== null) {
      try { canvas.releasePointerCapture(stick.id); } catch {}
    }
    stick.id = null;
    stick.active = false;
  }

  function setEnabled(on) {
    enabled = on;
    if (!on) reset();
  }

  function setTouchMode(mode) {
    touchMode = mode === "follow" ? "follow" : "joystick";
    reset();
  }

  /** Stick state for drawing (screen px), or null when hidden. */
  function getStick() {
    if (!stick.active || touchMode !== "joystick") return null;
    return { bx: stick.bx, by: stick.by, kx: stick.kx, ky: stick.ky, maxR: STICK_MAX_R };
  }

  function isAnyInput() {
    return keys.up || keys.down || keys.left || keys.right || mouseActive || stick.active;
  }

  return { getMovement, isAnyInput, keys, reset, setEnabled, setTouchMode, getStick, getTouchMode: () => touchMode };
}
