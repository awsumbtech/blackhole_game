// ─── ZEN SESSIONS (v7) ───
// Zen is a short, calm refocus tool, not a game to keep playing. Pick 3, 5 or
// 10 minutes. The session settles in (food gathers), flows, then winds down
// (food thins, the music resolves to one held note). The only time cue is a
// faint arc at the top. Then: three slow guided breaths, an optional "what's
// the one thing you're doing next?", and a closing screen that sends you off
// to do it. No "one more", no streaks, no rewards. It only returns to title.

export const ARC = { SETTLE: 0.15, WIND: 0.75 };
const $ = id => document.getElementById(id);

/** Session density curve: settle in, flow, then thin out. */
export function zenDensity(p) {
  if (p < ARC.SETTLE) return 0.55 + 0.45 * (p / ARC.SETTLE);
  if (p < ARC.WIND) return 1;
  return Math.max(0.3, 1 - 0.7 * ((p - ARC.WIND) / (1 - ARC.WIND)));
}

/** Breath-paced pull: eases on the inhale (food drifts), deepens on the exhale. */
export function zenBreathPull(now, breathMs) {
  const s = Math.sin((now % breathMs) / breathMs * Math.PI * 2);   // >0 inhale, <0 exhale
  return 1 - 0.6 * s;
}

export function setArc(p) {
  const fg = $("zen-arc-fg");
  if (!fg) return;
  fg.setAttribute("pathLength", "100");
  fg.style.strokeDasharray = `${(p * 100).toFixed(2)} 100`;
}

// ─── Picker ───
export function openPicker(onPick, onCancel) {
  const el = $("zen-picker");
  el.classList.remove("hidden");
  el.querySelectorAll(".zen-choice").forEach(b => {
    b.onclick = () => { el.classList.add("hidden"); onPick(Number(b.dataset.min)); };
  });
  $("btn-zen-cancel").onclick = () => { el.classList.add("hidden"); onCancel?.(); };
}

// ─── Exit flow ───
let timers = [];
function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
function clear() { timers.forEach(clearTimeout); timers = []; }

/** opts: { reduceMotion, onBreath(i), onDone(text|null) } */
export function runExit(opts) {
  clear();
  const el = $("zen-exit");
  const show = id => ["zx-breathe", "zx-ask", "zx-close"].forEach(s => $(s).classList.toggle("hidden", s !== id));
  el.classList.remove("hidden");
  el.style.opacity = "1";
  show("zx-breathe");
  const circle = $("zx-circle"), cue = $("zx-cue"), count = $("zx-count");
  const rm = !!opts.reduceMotion;
  // A quiet way out of the breaths too (never trap)
  let skip = $("zx-skip-breaths");
  if (!skip) {
    skip = document.createElement("button");
    skip.id = "zx-skip-breaths"; skip.className = "title-link"; skip.textContent = "Skip";
    skip.style.marginTop = "28px";
    $("zx-breathe").appendChild(skip);
  }
  const ask = () => {
    clear();
    show("zx-ask");
    const inp = $("zx-input");
    inp.value = "";
    $("btn-zx-done").onclick = () => close(inp.value.trim() || null);
    $("btn-zx-skip").onclick = () => close(null);
    inp.onkeydown = e => { if (e.key === "Enter") close(inp.value.trim() || null); };
  };
  const close = text => {
    show("zx-close");
    $("zx-go").textContent = text ? "Go do it." : "Go gently.";
    $("zx-thing").textContent = text ? `“${text}”` : "";
    $("btn-zx-title").onclick = () => {
      el.style.opacity = "0";
      setTimeout(() => el.classList.add("hidden"), 900);
      opts.onDone?.(text);
    };
  };
  skip.onclick = ask;
  // 3 breaths: 4s in, 6s out (6 breaths a minute)
  const IN = 4000, OUT = 6000;
  for (let i = 0; i < 3; i++) {
    const t = i * (IN + OUT) + 800;
    later(() => {
      count.textContent = `${i + 1} of 3`;
      cue.textContent = "Breathe in…";
      opts.onBreath?.(i);
      circle.style.transition = rm ? "opacity 4s ease" : `transform ${IN}ms ease-in-out, opacity 4s ease`;
      if (rm) circle.style.opacity = "1"; else circle.style.transform = "scale(1.35)";
    }, t);
    later(() => {
      cue.textContent = "…and out";
      circle.style.transition = rm ? "opacity 6s ease" : `transform ${OUT}ms ease-in-out, opacity 6s ease`;
      if (rm) circle.style.opacity = "0.45"; else circle.style.transform = "scale(0.7)";
    }, t + IN);
  }
  circle.style.transition = "none"; circle.style.transform = "scale(0.7)"; circle.style.opacity = "0.45";
  cue.textContent = "Three slow breaths";
  count.textContent = "";
  later(ask, 800 + 3 * (IN + OUT) + 600);
}
export function exitOpen() { return !$("zen-exit").classList.contains("hidden"); }
