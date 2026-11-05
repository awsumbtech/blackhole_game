// ─── Display ───
// The game canvas: size, device-pixel ratio and the sharpness cap. Follows the window size.

export class Display {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.container = container;
    this.dprCap = 2;          // screen sharpness cap: 2x on High, 1.5x on Balanced ("Lite")
    this.w = 0; this.h = 0; this.dpr = 1;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h; this.dpr = dpr;
  }

  /** Returns true when the cap changed (the canvas was resized). */
  setCap(cap) {
    if (cap === this.dprCap) return false;
    this.dprCap = cap;
    this.resize();
    return true;
  }
}
