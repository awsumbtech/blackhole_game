// ─── OBJECT TYPES (data only) ───
// Every kind of thing you can eat: size range, density, drift speed, bite tone,
// glow and palette. Spawning and motion live in js/entities.js.

export const objectTypes = [
  {
    id: "dust",
    label: "Space Dust",
    colors: ["#6b7399", "#7e86ad", "#5c647d"],
    minR: 2, maxR: 4,
    density: 0.5,
    speed: 0.3,
    tone: 280,
    glow: 0,
    sizeClass: 0  // smallest — always eatable
  },
  {
    id: "junk",
    label: "Debris",
    colors: ["#8894b7", "#7a8aaa", "#9ba4c2"],
    minR: 3, maxR: 6,
    density: 0.8,
    speed: 0.2,
    tone: 200,
    glow: 0,
    sizeClass: 1
  },
  {
    id: "meteor",
    label: "Meteor",
    colors: ["#b8ac8c", "#c4b690", "#a89c7a"],
    minR: 5, maxR: 9,
    density: 1.2,
    speed: 0.35,
    tone: 180,
    glow: 0.15,
    sizeClass: 2
  },
  {
    id: "comet",
    label: "Comet",
    colors: ["#83d7ff", "#6ec8f5", "#99e2ff"],
    minR: 4, maxR: 7,
    density: 1.0,
    speed: 0.8,
    tone: 260,
    glow: 0.4,
    sizeClass: 1,
    hasTail: true
  },
  {
    id: "craft",
    label: "Ship",
    colors: ["#c28eff", "#b07ae0", "#d4a2ff"],
    minR: 6, maxR: 11,
    density: 1.4,
    speed: 0.18,
    tone: 210,
    glow: 0.2,
    sizeClass: 3,
    shape: "polygon"
  },
  {
    id: "planet",
    label: "Planet",
    colors: ["#62c38c", "#4db87a", "#78d4a0"],
    bands: [["#4a9e6e", "#62c38c", "#88ddb0"], ["#3d7a8e", "#5ba4b8", "#82c8d8"], ["#8e6a3d", "#b88a5b", "#d8b282"]],
    minR: 10, maxR: 16,
    density: 2.0,
    speed: 0.06,
    tone: 140,
    glow: 0.1,
    sizeClass: 4
  },
  {
    id: "star",
    label: "Star",
    colors: ["#ffd86d", "#ffcc44", "#ffe599"],
    minR: 14, maxR: 22,
    density: 2.8,
    speed: 0.03,
    tone: 110,
    glow: 0.7,
    sizeClass: 5  // biggest — need large radius to eat
  },
  {
    id: "neutron",
    label: "Neutron Star",
    colors: ["#e0e8ff", "#c8d4ff", "#f0f4ff"],
    minR: 4, maxR: 6,
    density: 5.0,
    speed: 0.02,
    tone: 80,
    glow: 0.9,
    sizeClass: 3,  // small but dense — needs decent size
    minGalaxy: 4
  },
  // v5 "Vast": bigger layers of the universe for the higher scale tiers
  {
    id: "moon", label: "Moon",
    colors: ["#b9bccb", "#a7aab8", "#c8c4bc"],
    bands: [["#8d909e", "#b9bccb", "#d6d8e2"], ["#9a948a", "#c8c4bc", "#e0dcd2"]],
    minR: 8, maxR: 12, density: 1.6, speed: 0.08, tone: 160, glow: 0.05, sizeClass: 4
  },
  {
    id: "system", label: "Star System",
    colors: ["#ffd98a", "#ffc7a0", "#fff1c4"],
    minR: 14, maxR: 20, density: 3, speed: 0.03, tone: 100, glow: 0.6, sizeClass: 5
  },
  {
    id: "nebula", label: "Nebula",
    colors: ["#c48cff", "#7fd6ff", "#ff9fc8", "#9fffd0"],
    minR: 16, maxR: 24, density: 1.4, speed: 0.02, tone: 90, glow: 0.5, sizeClass: 5
  },
  {
    id: "cluster", label: "Star Cluster",
    colors: ["#ffe9b0", "#d6e4ff", "#fff6e0"],
    minR: 14, maxR: 20, density: 3.2, speed: 0.02, tone: 85, glow: 0.7, sizeClass: 5
  },
  {
    id: "galaxy", label: "Galaxy",
    colors: ["#cfc4ff", "#ffd9b0", "#b8e6ff"],
    minR: 16, maxR: 24, density: 3, speed: 0.015, tone: 75, glow: 0.6, sizeClass: 5
  }
];
