// The colour the flagship still asks for. It does not tint a ship.
// The Flagship step replaces this when the landmark is a painted sheet.

export class FlagshipLight {
  static rgb = [150, 170, 220];
  static key = "";

  static set(rgb, key) {
    this.rgb = rgb.slice(0, 3);
    this.key = key || "";
  }

  static get() { return { rgb: this.rgb, key: this.key }; }
}
