# Build a 3D Endless Lane-Switching Car Game

## Role & Objective

You are a senior game developer. Build a complete, polished, playable 3D endless driving game that runs in the browser. The player drives forward on a multi-lane highway, switches lanes to dodge obstacles and traffic, collects coins, and scores points. Speed increases gradually over time until the player crashes.

The top priority is **game feel**: responsive controls, fair difficulty, smooth 60 FPS, and satisfying feedback (sound, particles, camera). Everything in scope must actually work. No placeholder features, no "TODO: implement later".

---

## Tech Stack

- **Three.js** (latest, installed via npm), **TypeScript** (strict mode), **Vite**.
- No game engine, no physics engine. Kinematic movement + AABB collision is enough.
- **No external asset files.** All 3D models are built procedurally from Three.js primitives. All sound is generated with the Web Audio API. The project must run out of the box with:
  ```
  npm install && npm run dev
  ```
- UI (HUD, menus) is HTML/CSS overlaid on the canvas, not text rendered in WebGL.
- **Vitest** for unit tests.
- No backend. High score and settings persist in `localStorage`.

---

## Project Structure

```
index.html
style.css
src/
  main.ts                 # bootstrap
  config.ts               # ALL tunable values live here
  core/
    Game.ts               # state machine + main loop
    Input.ts              # keyboard, touch/swipe, input buffering
    AudioManager.ts       # procedural Web Audio sounds
    Rng.ts                # seeded RNG (mulberry32)
  world/
    Road.ts               # recycled road tiles, lane markings
    Environment.ts        # scenery, lighting, fog, sky
  entities/
    Player.ts
    Obstacle.ts
    Coin.ts
    CarBuilder.ts         # procedural car meshes (player + traffic)
  systems/
    Spawner.ts            # row/pattern generation with fairness guarantees
    Collision.ts
    Score.ts
    Difficulty.ts
    Particles.ts
  ui/
    HUD.ts
    Screens.ts            # menu, pause, game over
  utils/
    ObjectPool.ts
    math.ts               # lerp, clamp, easing
tests/
  spawner.test.ts
  difficulty.test.ts
README.md
```

Keep classes small and focused. No god files. No `any`.

---

## Core Gameplay

### World Movement (important architectural rule)

The player car stays at a **fixed z position (z = 0)**. The world (road, obstacles, coins, scenery) moves toward the camera at the current speed. Do NOT move the car forward through the world; that causes floating-point precision drift in long runs. Use 1 world unit = 1 meter.

### Lanes

- 3 lanes, lane width `3` units, lane center x positions `[-3, 0, 3]`. Player starts in the center lane.
- Lane switching is discrete: one keypress = one lane.
- The switch is a tween over `150 ms` with ease-out. During the switch the car yaws ~10° toward the direction of travel and rolls slightly, then straightens.
- **Input buffering:** if the player presses a direction during an ongoing switch, queue exactly one input and execute it when the current switch ends.
- Pressing toward the edge in the outermost lane does nothing except a small "bump" wobble and a soft thud sound.

### Speed Progression

Speed rises smoothly and approaches a cap asymptotically:

```
speed(t) = maxSpeed - (maxSpeed - baseSpeed) * exp(-t / rampTime)
```

Defaults: `baseSpeed = 18 m/s` (~65 km/h), `maxSpeed = 65 m/s` (~234 km/h), `rampTime = 100 s`. Display speed on the HUD in km/h (`speed * 3.6`). All values are tunable in `config.ts`.

Also expose a normalized difficulty scalar `d = clamp(t / 180, 0, 1)` from `Difficulty.ts` that other systems use to scale spawn density and pattern selection.

### Obstacles

Implement these types, each with its own procedural mesh and hitbox:

| Type | Lanes | Behavior | Unlocks at |
|---|---|---|---|
| Road barrier | 1 | Static | 0 s |
| Cone cluster | 1 | Static, 3–5 cones | 0 s |
| Traffic car | 1 | Moves forward at a constant 30–50% of base speed (slower than player) | 0 s |
| Truck | 1 | Like traffic car but longer hitbox (~2.5× car length) | 20 s |
| Lane-changing car | 1 → adjacent | Blinks its turn signal for 1 s, then changes lane | 60 s |

Traffic cars get a random color from a palette. The lane-changing car may only change lanes if the spawner has verified that the move keeps the path solvable (see fairness rules).

### Spawning & Fairness (most important system)

Obstacles spawn in **rows** at `spawnDistance = 130` units ahead, beyond the fog so nothing visibly pops in.

Rules:

1. A row blocks **1 or 2 lanes, never all 3**.
2. Gaps between rows are defined in **time, not distance**:
   `minRowGap = lerp(1.1 s, 0.55 s, d)`, plus random jitter. Because traffic cars move, the spawner must schedule rows by their **predicted arrival time at the player** (using closing speed = playerSpeed − obstacleSpeed), not by spawn position. Rows must never overlap in arrival order. Obstacles within one row share the same speed. Add a ~10% safety margin because player speed keeps increasing after spawn.
3. **Reachability guarantee:** between two consecutive rows with arrival gap `g`, the player can shift at most `floor((g - reactionTime) / laneSwitchTime)` lanes, with `reactionTime = 0.35 s` and `laneSwitchTime = 0.15 s`. At least one free lane in the new row must be reachable from at least one free lane in the previous row. If a candidate row fails the check, regenerate it.
4. Rows are chosen from a **pattern library** (single block, double block, zigzag, staggered pair, coin tunnel between two blocks, etc.) using weighted random selection, where weights shift toward harder patterns as `d` increases. Early game (0–20 s) uses only single-lane blocks.
5. All randomness goes through a seeded RNG. Support a `?seed=12345` URL parameter to reproduce runs.

Document the fairness logic with clear comments; it is the part most likely to have bugs.

### Coins

- Spinning, gently bobbing gold coins (flattened cylinder, emissive material).
- Spawn in lines of 5–8 along free lanes, sometimes as arcs that guide the player into a lane change. Coins must never overlap obstacles.
- Pickup radius is generous (bigger than the visual).
- Pickup feedback: quick scale pop, sparkle particles, chime whose pitch rises with consecutive pickups.

### Scoring

- **Distance:** 1 point per meter traveled (`distance += speed * dt`).
- **Coin:** 25 points.
- **Near miss:** 50 points, with a "NEAR MISS!" popup. Definition: an obstacle passes the player's z position and the player moved **out of that obstacle's lane within the last 0.35 s**. This rewards last-second dodges only.
- **Combo multiplier:** coins and near misses build the multiplier (x1 → x5 max). It decays one step if no coin or near miss occurs for 3 s. Show the multiplier with a draining timer bar. All points are multiplied.
- **High score** persisted in `localStorage`. Show "NEW BEST!" on game over when beaten.

### Collision & Crash

- AABB collision using reusable `Box3` instances. Shrink hitboxes 10–15% relative to visuals so near-contacts feel fair.
- Only test objects within a small z-window around the player.
- On crash: 0.3 s slow-motion decel of world speed, camera shake, car spins and lifts slightly, debris/spark particle burst, crash sound, then the game over screen after ~1 s.

---

## Controls

- **Keyboard:** `A` / `←` left, `D` / `→` right, `P` / `Esc` pause, `Space` / `Enter` start and restart, `M` mute.
- **Touch:** swipe left/right (threshold ~30 px), tap to start. Also support tapping the left/right half of the screen as an alternative.
- Auto-pause on `visibilitychange` and window `blur`.
- Prevent default browser behavior for arrow keys and touch scrolling while playing.

---

## Camera

- Chase camera behind and above the car (~z +8, y +4), looking at a point a few meters ahead of the car.
- Follows the car's x position with damping so it lags slightly on lane changes.
- FOV increases from 60 to 75 as speed rises, to sell the sense of speed.
- Very subtle high-frequency shake at top speed; strong shake on crash.
- Handle window resize; cap pixel ratio at 2.

---

## Visuals & Art Direction

Stylized, bright, low-poly look. Everything built from primitives.

- **Player car:** body box, cabin, 4 wheel cylinders that rotate proportionally to speed, emissive headlights, red taillights, a small shadow. Distinct color from traffic.
- **Traffic/trucks:** same `CarBuilder` with variations (color, size, cab/trailer for trucks).
- **Road:** dark asphalt tiles (~40 units long, pool of ~8, recycled when behind the camera), dashed white lane lines, solid edge lines, shoulders, guardrails.
- **Environment:** grass on both sides, low-poly trees (cone + cylinder), streetlights, occasional simple buildings. Use `InstancedMesh` for repeated scenery. Recycle everything.
- **Lighting:** hemisphere light + directional light with shadows. Keep the shadow camera tight around the player for quality and performance.
- **Fog:** hides spawns and scenery pop-in (fog far < spawnDistance).
- **Sky:** gradient background. Optional: slow shift from day to sunset colors as distance increases.
- **Particles:** pooled, simple (points or small sprites) for coin sparkles, crash debris, and exhaust puffs.

---

## Game States

```
BOOT → MENU → COUNTDOWN → PLAYING ⇄ PAUSED
                             ↓
                         CRASHING → GAME_OVER → COUNTDOWN (restart)
```

- **Menu:** game title, "Press Space / Tap to Start", best score, controls hint. The road scrolls slowly in the background as an attract mode.
- **Countdown:** 3-2-1-GO before each run.
- **Pause:** dimmed overlay, resume and restart buttons.
- **Game Over:** final score (animated count-up), distance, coins, best score, restart button.
- Restart must fully reset without reloading the page: return every pooled object, reset all systems, no leaked listeners or meshes.

---

## HUD

HTML/CSS overlay, responsive for desktop and mobile portrait:

- Top-left: score. Top-right: coin count. Bottom or top-center: speed in km/h.
- Multiplier badge with a decay timer bar.
- Floating popups ("+25", "NEAR MISS! +50") that rise and fade.
- Clean readable font, subtle text shadow so it's legible over any background.

---

## Audio (procedural Web Audio, no files)

- **Engine:** layered oscillators through a low-pass filter; frequency and filter cutoff scale with speed.
- **Lane switch:** short filtered-noise whoosh.
- **Coin:** bright chime; pitch rises with consecutive pickups.
- **Near miss:** quick doppler-like swoosh.
- **Crash:** noise burst + low thump.
- **UI:** soft click.
- Create/resume the `AudioContext` on the first user gesture. Mute toggle persisted in `localStorage`.

---

## Game Loop & Performance

- `requestAnimationFrame` loop. Clamp `dt` to a max of `1/30 s` so tab switches don't cause tunneling or giant jumps.
- All movement and timers are `dt`-based. The game must play identically at 60 Hz and 144 Hz.
- Object pools for obstacles, coins, particles, road tiles, and scenery. **No allocations in the hot loop**: reuse `Vector3`, `Box3`, and arrays.
- Target a stable 60 FPS on a mid-range laptop and a modern phone. Keep draw calls low (aim under ~150); use `InstancedMesh` where it helps.
- Dispose geometries/materials properly on teardown.

---

## config.ts

Every tunable value lives in one exported, commented object. Example shape:

```ts
export const CONFIG = {
  lanes: { count: 3, width: 3, switchDuration: 0.15 },
  speed: { base: 18, max: 65, rampTime: 100 },
  difficulty: { fullAt: 180 },
  spawn: {
    distance: 130,
    rowGapEasy: 1.1,
    rowGapHard: 0.55,
    reactionTime: 0.35,
    safetyMargin: 0.1,
  },
  collision: { hitboxShrink: 0.12, coinRadius: 1.2 },
  score: { perMeter: 1, coin: 25, nearMiss: 50, nearMissWindow: 0.35, maxMultiplier: 5, comboDecay: 3 },
  camera: { offset: [0, 4, 8], fovMin: 60, fovMax: 75, followDamping: 8 },
  colors: { /* palette */ },
} as const;
```

---

## Debug Mode

Enabled with `?debug=1`:

- Wireframe hitboxes for all colliders.
- FPS counter and an overlay showing current speed, difficulty `d`, active pooled object counts, and RNG seed.
- Keys: `G` god mode (no crashes), `+` / `-` override speed, `N` force-spawn the next pattern.

---

## Testing

Write Vitest tests for the pure logic (keep it decoupled from Three.js so it's testable):

- **Spawner fairness:** generate 10,000 rows at `d = 1` (and at several other difficulty levels) and assert that every row leaves a free lane and that the reachability rule always holds between consecutive rows, including rows with moving traffic.
- **Difficulty/speed curve:** starts at base, is monotonic, never exceeds max.
- **Score:** multiplier build-up, decay, and cap.
- **Seeded RNG:** same seed produces the same sequence of rows.

---

## Implementation Order

Build in milestones. After each one the game must run without errors.

1. Vite + TS scaffold, scene, recycled scrolling road, player car, lane switching with buffering.
2. Speed ramp, obstacles, spawner with fairness rules, collision, crash, basic game over.
3. Coins, scoring, combo multiplier, HUD, full state machine (menu, countdown, pause, game over, restart).
4. Camera polish, particles, procedural audio, environment and scenery.
5. Touch controls, debug mode, unit tests, performance pass, README.

---

## Acceptance Criteria

- [ ] `npm install && npm run dev` works; no console errors or warnings during play.
- [ ] Controls feel instant; buffered input works; edge bump works.
- [ ] Speed rises smoothly and caps; HUD shows km/h.
- [ ] No impossible rows ever (verified by tests and by playing with god mode off at max difficulty).
- [ ] Coins, near misses, multiplier, and high score all work and persist correctly.
- [ ] Menu → play → crash → game over → restart works 10+ times in a row with no FPS drop or memory growth.
- [ ] Same behavior at 60 Hz and 144 Hz.
- [ ] Playable on mobile with swipes, in portrait orientation.
- [ ] `npm run test` passes.
- [ ] README explains how to run, controls, and how to tune `config.ts`.

---

## Stretch Goals (only after everything above is done and working)

- Power-ups: coin magnet, shield (absorbs one crash), 2× score. Each with a HUD timer.
- Garage screen: unlock car colors/body styles using collected coins (persisted).
- Day/night cycle with headlights that light the road at night.
- Gamepad support.

---

## Do NOT

- Load models, textures, or sounds from files or CDNs at runtime.
- Use a physics engine.
- Move the player car forward through world space.
- Leave stubbed or half-working features.
- Put tunable magic numbers anywhere except `config.ts`.
