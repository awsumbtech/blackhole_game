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
- Goal: consume every object in the current galaxy to advance to the next one

## Current gameplay model

- Objects are circles with hidden type properties (density, size, drift speed)
- Different colors represent different future object categories (planet, star, junk, etc.)
- Your black hole radius scales with mass
- Progress auto-saves to `localStorage`
