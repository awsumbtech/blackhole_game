// ─── LIVING WORLD SYSTEM ───
// Gravity well, dynamic spawning, procedural events, ambient background life.
// Makes the galaxy feel alive, reactive, and surprising.

import { weightedType, createEntity, rand, getBiome, objectTypes } from "./entities.js";
import { prerenderEntitySprite } from "./render.js";
import { playEventCue } from "./audio.js";

// ─── CONFIG ───

const CFG = {
  // Gravity well
  GRAVITY_G: 0.0004,
  GRAVITY_ATTRACT_BASE: 60,
  GRAVITY_ATTRACT_MULT: 12,

  // Dynamic spawning
  SPAWN_CAP_RATIO: 1.5,
  AMBIENT_SPAWN_MIN: 300,
  AMBIENT_SPAWN_RANGE: 200,

  // Event system
  EVENT_EVAL_INTERVAL: 120,
  EVENT_GLOBAL_COOLDOWN: 180,
  EVENT_GRACE_PERIOD: 300,

  // Mass-based progression
  TARGET_MASS_BASE: 10000,
  TARGET_MASS_PER_GALAXY: "5000*g + 1000*g²"
};

// ─── MODULE STATE ───

let world = null;

function freshWorldState() {
  return {
    // Spawning
    initialCount: 0,
    depletionTimer: 0,
    ambientTimer: 0,

    // Events
    eventEvalTimer: 0,
    globalCooldown: 0,
    graceTimer: CFG.EVENT_GRACE_PERIOD,
    eventCooldowns: {},
    activeEvents: [],
    galaxyTime: 0,
    totalConsumedAtStart: 0,

    // Ambient background
    shootingStars: [],
    shootingStarTimer: 0,
    distantFlashes: [],
    energyWaves: []
  };
}

// ─── PUBLIC API ───

export function initLivingWorld(state) {
  world = freshWorldState();
  world.initialCount = state.initialCount;
  world.totalConsumedAtStart = state.totalConsumed || 0;
}

export function updateLivingWorld(state, dt) {
  if (!world) return;

  world.galaxyTime += dt;

  updateGravityWell(state, dt);
  updateDynamicSpawning(state, dt);
  updateEventSystem(state, dt);
  updateAmbientBackground(state, dt);

  // Advance spawn fade-in for all entities
  for (const e of state.entities) {
    if (e._spawnAge != null && e._spawnAge < 60) {
      e._spawnAge += dt;
      e._spawnAlpha = Math.min(1, e._spawnAge / 60);
    }
  }
}

export function drawLivingWorldBG(ctx, state, w, h) {
  if (!world) return;
  drawShootingStars(ctx, w, h);
  drawDistantFlashes(ctx, w, h);
  drawEnergyWaves(ctx, w, h);
}

export function drawLivingWorldFG(ctx, state, w, h) {
  if (!world) return;
  for (const ev of world.activeEvents) {
    if (ev.draw) ev.draw(ctx, state, w, h);
  }
}

// ─── 2A: GRAVITY WELL ───

function updateGravityWell(state, dt) {
  const attractRadius = state.radius * CFG.GRAVITY_ATTRACT_MULT + CFG.GRAVITY_ATTRACT_BASE;
  const playerMass = state.mass;
  const px = state.playerX;
  const py = state.playerY;
  const minDist = state.radius * 2;

  for (const e of state.entities) {
    if (e.consuming) continue;

    const dx = px - e.x;
    const dy = py - e.y;
    const dist = Math.hypot(dx, dy);

    if (dist > attractRadius || dist < 1) continue;

    const effectiveDist = Math.max(dist, minDist);
    let strength = CFG.GRAVITY_G * playerMass / (effectiveDist * effectiveDist);
    strength = Math.min(strength, e.baseSpeed * 0.8);

    const nx = dx / dist;
    const ny = dy / dist;
    e.vx += nx * strength * dt;
    e.vy += ny * strength * dt;
    e._attracted = true;
  }
}

// ─── 2B: DYNAMIC SPAWNING ───

function spawnEdgeEntity(state) {
  const biome = state.biome;
  if (!biome) return null;

  const type = weightedType(biome.weights, state.galaxy);
  const angle = rand(0, Math.PI * 2);
  const bounds = state.bounds;

  // Position on the boundary circle
  const x = Math.cos(angle) * (bounds - 5);
  const y = Math.sin(angle) * (bounds - 5);

  const entity = createEntity(type, x, y);

  // Aim inward with spread
  const inwardAngle = angle + Math.PI + rand(-0.6, 0.6);
  const speed = entity.baseSpeed;
  entity.vx = Math.cos(inwardAngle) * speed;
  entity.vy = Math.sin(inwardAngle) * speed;

  // Fade-in properties
  entity._spawnAge = 0;
  entity._spawnAlpha = 0;

  prerenderEntitySprite(entity);
  return entity;
}

function updateDynamicSpawning(state, dt) {
  const objectCap = Math.floor(world.initialCount * CFG.SPAWN_CAP_RATIO);

  // Depletion spawner
  const targetPop = Math.max(20, Math.floor(world.initialCount * 0.35));
  const deficit = targetPop - state.entities.length;

  if (deficit > 0) {
    const interval = Math.max(30, 120 - deficit * 5);
    world.depletionTimer += dt;
    if (world.depletionTimer >= interval) {
      world.depletionTimer = 0;
      if (state.entities.length < objectCap) {
        const e = spawnEdgeEntity(state);
        if (e) state.entities.push(e);
      }
    }
  } else {
    world.depletionTimer = 0;
  }

  // Ambient trickle
  const ambientInterval = CFG.AMBIENT_SPAWN_MIN + rand(0, CFG.AMBIENT_SPAWN_RANGE);
  world.ambientTimer += dt;
  if (world.ambientTimer >= ambientInterval) {
    world.ambientTimer = 0;
    if (state.entities.length < objectCap) {
      const e = spawnEdgeEntity(state);
      if (e) state.entities.push(e);
    }
  }
}

// ─── 2C: PROCEDURAL EVENT SYSTEM ───

function getMetrics(state) {
  const targetMass = state.targetMass || 400;
  const consumeRatio = world.initialCount > 0
    ? 1 - (state.entities.length / world.initialCount)
    : 0;
  const entityDensity = state.entities.length / Math.max(1, world.initialCount);
  const massRatio = state.mass / targetMass;

  return {
    galaxyTime: world.galaxyTime,
    consumeRatio,
    entityDensity,
    playerMass: state.mass,
    playerRadius: state.radius,
    comboActivity: state.comboCount > 0 ? 1 : 0,
    massRatio,
    galaxy: state.galaxy,
    isEarlyGame: state.mass < 60,
    isMidGame: state.mass >= 60 && massRatio < 0.6,
    isLateGame: massRatio >= 0.6
  };
}

const EVENT_DEFS = [
  {
    id: "meteorShower",
    cooldown: 900,   // 15 sec
    minGalaxy: 1,
    minMass: 0,
    hazard(m) {
      let p = 0.08;
      if (m.entityDensity < 0.5) p += 0.03;
      if (m.comboActivity) p += 0.03;
      return p;
    },
    fire: fireMeteorShower
  },
  {
    id: "cometStream",
    cooldown: 1200,  // 20 sec
    minGalaxy: 1,
    minMass: 0,
    hazard(m) {
      let p = 0.06;
      if (m.entityDensity < 0.5) p += 0.04;
      if (m.galaxyTime > 1800) p += 0.04; // 30 sec
      return p;
    },
    fire: fireCometStream
  },
  {
    id: "voidPulse",
    cooldown: 1500,  // 25 sec
    minGalaxy: 2,
    minMass: 0,
    hazard(m) {
      let p = 0.04;
      if (!m.comboActivity) p += 0.04;
      if (m.isLateGame) p += 0.06;
      return p;
    },
    fire: fireVoidPulse
  },
  {
    id: "derelictFlotilla",
    cooldown: 1800,  // 30 sec
    minGalaxy: 2,
    minMass: 40,
    hazard(m) {
      let p = 0.04;
      if (m.isMidGame) p += 0.03;
      if (m.isLateGame) p += 0.04;
      return p;
    },
    fire: fireDerelictFlotilla
  },
  {
    id: "stellarBirth",
    cooldown: 2400,  // 40 sec
    minGalaxy: 3,
    minMass: 80,
    hazard(m) {
      let p = 0.03;
      if (m.isLateGame) p += 0.04;
      if (m.consumeRatio > 0.5) p += 0.05;
      return p;
    },
    fire: fireStellarBirth
  },
  {
    id: "gravitationalWave",
    cooldown: 1980,  // 33 sec
    minGalaxy: 3,
    minMass: 0,
    hazard(m) {
      let p = 0.03;
      if (m.galaxyTime > 1500) p += 0.03; // 25 sec
      if (m.consumeRatio > 0.4) p += 0.04;
      return p;
    },
    fire: fireGravitationalWave
  }
];

function updateEventSystem(state, dt) {
  // Tick grace period
  if (world.graceTimer > 0) {
    world.graceTimer -= dt;
    // Still update active events during grace
    updateActiveEvents(state, dt);
    return;
  }

  // Tick global cooldown
  if (world.globalCooldown > 0) {
    world.globalCooldown -= dt;
  }

  // Tick per-event cooldowns
  for (const key in world.eventCooldowns) {
    if (world.eventCooldowns[key] > 0) {
      world.eventCooldowns[key] -= dt;
    }
  }

  // Evaluate events on interval
  world.eventEvalTimer += dt;
  if (world.eventEvalTimer >= CFG.EVENT_EVAL_INTERVAL) {
    world.eventEvalTimer = 0;

    if (world.globalCooldown <= 0) {
      const metrics = getMetrics(state);

      for (const def of EVENT_DEFS) {
        if (state.galaxy < def.minGalaxy) continue;
        if (state.mass < def.minMass) continue;
        if ((world.eventCooldowns[def.id] || 0) > 0) continue;

        const prob = def.hazard(metrics);
        if (Math.random() < prob) {
          def.fire(state);
          world.eventCooldowns[def.id] = def.cooldown;
          world.globalCooldown = CFG.EVENT_GLOBAL_COOLDOWN;
          break; // Only one event per evaluation
        }
      }
    }
  }

  updateActiveEvents(state, dt);
}

function updateActiveEvents(state, dt) {
  for (let i = world.activeEvents.length - 1; i >= 0; i--) {
    const ev = world.activeEvents[i];
    ev.age += dt;
    if (ev.update) ev.update(state, dt);
    if (ev.age >= ev.duration) {
      world.activeEvents.splice(i, 1);
    }
  }
}

// ─── EVENT: METEOR SHOWER ───

function fireMeteorShower(state) {
  const angle = rand(0, Math.PI * 2);
  const count = Math.floor(rand(5, 9));
  const bounds = state.bounds;

  const ev = {
    id: "meteorShower",
    age: 0,
    duration: 90,
    spawnTimer: 0,
    spawned: 0,
    count,
    angle,
    bounds,
    update(st, dt) {
      this.spawnTimer += dt;
      const interval = 60 / this.count;
      while (this.spawnTimer >= interval && this.spawned < this.count) {
        this.spawnTimer -= interval;
        this.spawned++;

        const meteorType = objectTypes.find(t => t.id === "meteor") || objectTypes[0];
        const spread = rand(-0.3, 0.3);
        const spawnAngle = this.angle + spread;
        const x = Math.cos(spawnAngle) * (this.bounds - 5);
        const y = Math.sin(spawnAngle) * (this.bounds - 5);

        const e = createEntity(meteorType, x, y);
        // Override speed for meteors — fast
        const speed = rand(0.8, 1.4);
        const inward = spawnAngle + Math.PI + rand(-0.4, 0.4);
        e.vx = Math.cos(inward) * speed;
        e.vy = Math.sin(inward) * speed;
        e.baseSpeed = speed;
        e._spawnAge = 0;
        e._spawnAlpha = 0;
        prerenderEntitySprite(e);
        st.entities.push(e);
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("meteorShower");
}

// ─── EVENT: COMET STREAM ───

function fireCometStream(state) {
  const entryAngle = rand(0, Math.PI * 2);
  const count = Math.floor(rand(4, 8));
  const bounds = state.bounds;

  const ev = {
    id: "cometStream",
    age: 0,
    duration: 120,
    spawnTimer: 0,
    spawned: 0,
    count,
    entryAngle,
    bounds,
    update(st, dt) {
      this.spawnTimer += dt;
      const interval = 90 / this.count;
      while (this.spawnTimer >= interval && this.spawned < this.count) {
        this.spawnTimer -= interval;
        this.spawned++;

        const cometType = objectTypes.find(t => t.id === "comet") || objectTypes[0];
        const spread = rand(-0.2, 0.2);
        const spawnAngle = this.entryAngle + spread;
        const x = Math.cos(spawnAngle) * (this.bounds - 5);
        const y = Math.sin(spawnAngle) * (this.bounds - 5);

        const e = createEntity(cometType, x, y);
        // Aim toward a midpoint for curved path
        const midAngle = spawnAngle + Math.PI + rand(-0.8, 0.8);
        const speed = rand(0.6, 1.0);
        e.vx = Math.cos(midAngle) * speed;
        e.vy = Math.sin(midAngle) * speed;
        e.baseSpeed = speed;
        e._spawnAge = 0;
        e._spawnAlpha = 0;
        prerenderEntitySprite(e);
        st.entities.push(e);
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("cometStream");
}

// ─── EVENT: VOID PULSE ───

function fireVoidPulse(state) {
  // Epicenter away from player
  const angle = rand(0, Math.PI * 2);
  const dist = rand(200, state.bounds * 0.6);
  const cx = state.playerX + Math.cos(angle) * dist;
  const cy = state.playerY + Math.sin(angle) * dist;

  const rings = [
    { delay: 0, radius: 0 },
    { delay: 15, radius: 0 },
    { delay: 30, radius: 0 }
  ];

  const ev = {
    id: "voidPulse",
    age: 0,
    duration: 90,
    cx, cy,
    rings,
    speed: 3.5,
    pushStrength: 0.4,
    waveBand: 40,
    update(st, dt) {
      for (const ring of this.rings) {
        if (this.age >= ring.delay) {
          ring.radius += this.speed * dt;
        }
      }

      // Push entities in the wave band
      const mainRadius = this.rings[0].radius;
      for (const e of st.entities) {
        if (e.consuming) continue;
        const dx = e.x - this.cx;
        const dy = e.y - this.cy;
        const d = Math.hypot(dx, dy);
        if (d < 1) continue;

        if (Math.abs(d - mainRadius) < this.waveBand) {
          const nx = dx / d;
          const ny = dy / d;
          e.vx += nx * this.pushStrength * dt;
          e.vy += ny * this.pushStrength * dt;
        }
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;

      for (const ring of this.rings) {
        if (ring.radius <= 0) continue;
        const progress = this.age / this.duration;
        const alpha = (1 - progress) * 0.25;
        ctx.beginPath();
        ctx.arc(sx, sy, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120, 100, 220, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("voidPulse");
}

// ─── EVENT: DERELICT FLOTILLA ───

function fireDerelictFlotilla(state) {
  const angle = rand(0, Math.PI * 2);
  const count = Math.floor(rand(3, 7));
  const bounds = state.bounds;

  const ev = {
    id: "derelictFlotilla",
    age: 0,
    duration: 60,
    spawnTimer: 0,
    spawned: 0,
    count,
    angle,
    bounds,
    update(st, dt) {
      this.spawnTimer += dt;
      const interval = 30 / this.count;
      while (this.spawnTimer >= interval && this.spawned < this.count) {
        this.spawnTimer -= interval;
        this.spawned++;

        const craftType = objectTypes.find(t => t.id === "craft") || objectTypes[0];
        const spread = rand(-0.15, 0.15);
        const spawnAngle = this.angle + spread;
        const x = Math.cos(spawnAngle) * (this.bounds - 5);
        const y = Math.sin(spawnAngle) * (this.bounds - 5);

        const e = createEntity(craftType, x, y);
        const inward = spawnAngle + Math.PI + rand(-0.2, 0.2);
        const speed = rand(0.12, 0.22);
        e.vx = Math.cos(inward) * speed;
        e.vy = Math.sin(inward) * speed;
        e.baseSpeed = speed;
        e._spawnAge = 0;
        e._spawnAlpha = 0;
        prerenderEntitySprite(e);
        st.entities.push(e);
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("derelictFlotilla");
}

// ─── EVENT: STELLAR BIRTH ───

function fireStellarBirth(state) {
  // Point in space away from player
  const angle = rand(0, Math.PI * 2);
  const dist = rand(150, state.bounds * 0.5);
  const cx = state.playerX + Math.cos(angle) * dist;
  const cy = state.playerY + Math.sin(angle) * dist;

  const ev = {
    id: "stellarBirth",
    age: 0,
    duration: 165, // 90 gathering + 15 flash + 60 explode
    cx, cy,
    phase: "gathering",
    spawned: false,
    update(st, dt) {
      if (this.age < 90) {
        this.phase = "gathering";
      } else if (this.age < 105) {
        this.phase = "flash";
        if (!this.spawned) {
          this.spawned = true;
          // Spawn a star or planet
          const type = Math.random() > 0.5
            ? objectTypes.find(t => t.id === "star")
            : objectTypes.find(t => t.id === "planet");
          if (type) {
            const star = createEntity(type, this.cx, this.cy);
            star._spawnAge = 0;
            star._spawnAlpha = 0;
            prerenderEntitySprite(star);
            st.entities.push(star);
          }

          // Eject dust fragments
          const fragCount = Math.floor(rand(3, 8));
          const dustType = objectTypes.find(t => t.id === "dust") || objectTypes[0];
          for (let i = 0; i < fragCount; i++) {
            const fragAngle = rand(0, Math.PI * 2);
            const frag = createEntity(dustType, this.cx, this.cy);
            const speed = rand(0.4, 1.0);
            frag.vx = Math.cos(fragAngle) * speed;
            frag.vy = Math.sin(fragAngle) * speed;
            frag.baseSpeed = speed;
            frag._spawnAge = 30; // Partial fade-in (born from explosion)
            frag._spawnAlpha = 0.5;
            prerenderEntitySprite(frag);
            st.entities.push(frag);
          }
        }
      } else {
        this.phase = "explode";
      }
    },
    draw(ctx, st, w, h) {
      const sx = this.cx - st.camX + w / 2;
      const sy = this.cy - st.camY + h / 2;

      if (this.phase === "gathering") {
        const brightness = this.age / 90;
        const r = 3 + brightness * 5;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, `rgba(255, 240, 200, ${brightness * 0.6})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.phase === "flash") {
        const flashProgress = (this.age - 90) / 15;
        const alpha = (1 - flashProgress) * 0.8;
        const r = 20 + flashProgress * 40;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        grad.addColorStop(0.3, `rgba(255, 240, 180, ${alpha * 0.5})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Explode: expanding ripple
        const explodeProgress = (this.age - 105) / 60;
        const alpha = (1 - explodeProgress) * 0.3;
        const r = 30 + explodeProgress * 80;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 220, 120, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("stellarBirth");
}

// ─── EVENT: GRAVITATIONAL WAVE ───

function fireGravitationalWave(state) {
  const dirAngle = rand(0, Math.PI * 2);
  const bounds = state.bounds;
  const speed = 2.5;
  const duration = Math.floor((bounds * 2) / speed + 60);
  const wavelength = 120;

  const ev = {
    id: "gravitationalWave",
    age: 0,
    duration,
    dirAngle,
    waveFront: -bounds,
    speed,
    wavelength,
    bounds,
    sineStrength: 0.3,
    update(st, dt) {
      this.waveFront += this.speed * dt;

      const dirX = Math.cos(this.dirAngle);
      const dirY = Math.sin(this.dirAngle);
      // Perpendicular direction
      const perpX = -dirY;
      const perpY = dirX;

      for (const e of st.entities) {
        if (e.consuming) continue;
        // Project entity onto wave direction
        const proj = e.x * dirX + e.y * dirY;
        const distToFront = proj - this.waveFront;

        if (Math.abs(distToFront) < this.wavelength) {
          // Sinusoidal displacement perpendicular to wave
          const sineForce = Math.sin((distToFront / this.wavelength) * Math.PI * 2) * this.sineStrength;
          e.vx += perpX * sineForce * dt;
          e.vy += perpY * sineForce * dt;
        }
      }
    },
    draw(ctx, st, w, h) {
      const dirX = Math.cos(this.dirAngle);
      const dirY = Math.sin(this.dirAngle);
      const perpX = -dirY;
      const perpY = dirX;

      const progress = this.age / this.duration;
      const alpha = Math.min(0.12, (1 - progress) * 0.15);

      // Draw a few parallel lines perpendicular to wave direction
      const lineCount = 5;
      for (let i = 0; i < lineCount; i++) {
        const offset = (i - 2) * (this.wavelength / 3);
        const lineCenterX = dirX * (this.waveFront + offset);
        const lineCenterY = dirY * (this.waveFront + offset);

        const sx = lineCenterX - st.camX + w / 2;
        const sy = lineCenterY - st.camY + h / 2;

        const halfLen = this.bounds * 1.5;
        const x1 = sx + perpX * halfLen;
        const y1 = sy + perpY * halfLen;
        const x2 = sx - perpX * halfLen;
        const y2 = sy - perpY * halfLen;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(100, 140, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };

  world.activeEvents.push(ev);
  playEventCue("gravitationalWave");
}

// ─── 2D: AMBIENT BACKGROUND LIFE ───

function updateAmbientBackground(state, dt) {
  // Shooting stars
  world.shootingStarTimer += dt;
  const shootInterval = rand(180, 420); // 3-7 sec
  if (world.shootingStarTimer >= shootInterval && world.shootingStars.length < 3) {
    world.shootingStarTimer = 0;
    world.shootingStars.push({
      x: rand(0, 1),
      y: rand(0, 1),
      angle: rand(0.2, 1.2),
      speed: rand(3, 6),
      life: 0,
      maxLife: rand(60, 100),
      brightness: rand(0.3, 0.7)
    });
  }

  for (let i = world.shootingStars.length - 1; i >= 0; i--) {
    const s = world.shootingStars[i];
    s.life += dt;
    s.x += Math.cos(s.angle) * s.speed * 0.001 * dt;
    s.y += Math.sin(s.angle) * s.speed * 0.001 * dt;
    if (s.life >= s.maxLife) {
      world.shootingStars.splice(i, 1);
    }
  }

  // Distant flashes
  if (Math.random() < 0.001 * dt && world.distantFlashes.length < 2) {
    world.distantFlashes.push({
      x: rand(0.1, 0.9),
      y: rand(0.1, 0.9),
      life: 0,
      maxLife: rand(60, 120),
      brightness: rand(0.15, 0.35)
    });
  }

  for (let i = world.distantFlashes.length - 1; i >= 0; i--) {
    const f = world.distantFlashes[i];
    f.life += dt;
    if (f.life >= f.maxLife) {
      world.distantFlashes.splice(i, 1);
    }
  }

  // Energy waves
  if (Math.random() < 0.0008 * dt && world.energyWaves.length < 3) {
    world.energyWaves.push({
      x: rand(0.2, 0.8),
      y: rand(0.2, 0.8),
      radius: 0,
      life: 0,
      maxLife: rand(180, 300),
      speed: rand(0.15, 0.3)
    });
  }

  for (let i = world.energyWaves.length - 1; i >= 0; i--) {
    const ew = world.energyWaves[i];
    ew.life += dt;
    ew.radius += ew.speed * dt;
    if (ew.life >= ew.maxLife) {
      world.energyWaves.splice(i, 1);
    }
  }
}

function drawShootingStars(ctx, w, h) {
  for (const s of world.shootingStars) {
    const progress = s.life / s.maxLife;
    // Fade in quickly, fade out slowly
    const alpha = progress < 0.2
      ? (progress / 0.2) * s.brightness
      : (1 - (progress - 0.2) / 0.8) * s.brightness;

    const headX = s.x * w;
    const headY = s.y * h;
    const tailLen = 30 + s.speed * 8;
    const tailX = headX - Math.cos(s.angle) * tailLen;
    const tailY = headY - Math.sin(s.angle) * tailLen;

    const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
    grad.addColorStop(0, `rgba(220, 230, 255, ${alpha})`);
    grad.addColorStop(1, `rgba(220, 230, 255, 0)`);

    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(tailX, tailY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawDistantFlashes(ctx, w, h) {
  for (const f of world.distantFlashes) {
    const progress = f.life / f.maxLife;
    // Quick rise (20%), slow fade (80%)
    const alpha = progress < 0.2
      ? (progress / 0.2) * f.brightness
      : (1 - (progress - 0.2) / 0.8) * f.brightness;

    const x = f.x * w;
    const y = f.y * h;
    const r = 15 + alpha * 20;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255, 240, 220, ${alpha * 0.5})`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnergyWaves(ctx, w, h) {
  for (const ew of world.energyWaves) {
    const progress = ew.life / ew.maxLife;
    const alpha = (1 - progress) * 0.08;

    const x = ew.x * w;
    const y = ew.y * h;

    ctx.beginPath();
    ctx.arc(x, y, ew.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 120, 220, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
