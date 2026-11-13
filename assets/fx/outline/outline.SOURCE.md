# Big-catch outlines

These PNGs are the gold edge drawn behind a big catch. They were baked by
`node tools/bake-outlines.cjs`, which loads the game, asks `spriteFor` for
each bounded look, and runs the approved edge once: a 16-stamp dilate of
the sprite alpha, a gold `source-in` fill, the interior punched out with
`destination-out`, then a small blur. That work happens here, not in play.

The id is the silhouette, not the colour:

- Ships: `craft-<class>-<wreck 0 or 1>-<look 0-7>` for drone, shuttle,
  freighter, cruiser and capital. Galaxy light only tints the rim, so it
  is not part of the id. Wrecks are separate because the damage punches
  holes in the alpha.
- Other big-catch types: `<type>-<look>-<variant>`. Planets use all 4
  variants because rings change the shape. The other types use variant 0.
- A neutron is one file, `neutron.png` in the map as `neutron`. Its shape
  is a disc and a tilted ring. It does not grow new limbs per seed.

Looks come from the same counts the game uses (`SHIP_LOOKS` is 8, and the
look table in `js/art/sprites.js`). `map.json` records each file and the
sprite width the edge was built around, so play can scale it.

Count: 287 outlines.
