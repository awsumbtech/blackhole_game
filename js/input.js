// ─── INPUT SYSTEM ───
// Keyboard, mouse, touch. Smooth, floaty movement that feels relaxing.

export function createInput(canvas) {
  const keys = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  let mouseActive = false;
  let mouseX = 0;
  let mouseY = 0;

  let touchActive = false;
  let touchX = 0;
  let touchY = 0;

  // Keyboard
  function onKey(key, down) {
    if (key === "ArrowUp" || key === "w" || key === "W") keys.up = down;
    if (key === "ArrowDown" || key === "s" || key === "S") keys.down = down;
    if (key === "ArrowLeft" || key === "a" || key === "A") keys.left = down;
    if (key === "ArrowRight" || key === "d" || key === "D") keys.right = down;
  }

  window.addEventListener("keydown", e => {
    onKey(e.key, true);
    // Prevent arrow keys scrolling the page
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", e => onKey(e.key, false));

  // Mouse
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseY = (e.clientY - rect.top) / rect.height;
    mouseActive = true;
  });
  canvas.addEventListener("mouseleave", () => {
    mouseActive = false;
  });

  // Touch
  canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    touchX = (t.clientX - rect.left) / rect.width;
    touchY = (t.clientY - rect.top) / rect.height;
    touchActive = true;
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    touchX = (t.clientX - rect.left) / rect.width;
    touchY = (t.clientY - rect.top) / rect.height;
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    touchActive = false;
  });

  canvas.addEventListener("touchcancel", () => {
    touchActive = false;
  });

  /**
   * Get movement direction. Returns { mx, my } normalized.
   * canvasW/canvasH are the logical canvas pixel dimensions.
   */
  function getMovement(canvasW, canvasH) {
    let mx = 0;
    let my = 0;

    // Keyboard input
    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;

    // Mouse input — direction from center of screen
    if (mouseActive) {
      const dx = (mouseX - 0.5) * 2;  // -1 to 1
      const dy = (mouseY - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      if (d > 0.06) {
        // Smooth ramp — close to center = gentle, edges = full speed
        const strength = Math.min(1, d);
        mx += (dx / d) * strength;
        my += (dy / d) * strength;
      }
    }

    // Touch input — same as mouse
    if (touchActive) {
      const dx = (touchX - 0.5) * 2;
      const dy = (touchY - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      if (d > 0.06) {
        const strength = Math.min(1, d);
        mx += (dx / d) * strength;
        my += (dy / d) * strength;
      }
    }

    // Normalize
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    return { mx, my, magnitude: Math.min(1, mag) };
  }

  function isAnyInput() {
    return keys.up || keys.down || keys.left || keys.right || mouseActive || touchActive;
  }

  return { getMovement, isAnyInput, keys };
}
