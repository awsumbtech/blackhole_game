# blackhole_game

A local browser "consume the galaxy" black hole game for quick mental breaks.

## Run locally

```bash
python3 -m http.server 4173
```

Open: `http://localhost:4173`

## Controls

- Move: `WASD` or `Arrow Keys`
- Mouse steer: move your cursor in the canvas
- Audio toggle + volume in the control row
- Goal: consume every object in the current galaxy to advance

## Current gameplay model

- Objects are circles with hidden type properties (density, size, drift speed, tone)
- Galaxy biomes change object distributions and mood tint
- Satisfying consume effects: suction trails, ripple bursts, milestone events
- Milestone events trigger at 25/50/75% consumed in a galaxy
- Radius scales with mass and progress auto-saves to `localStorage`
