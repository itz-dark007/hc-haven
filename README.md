# Kinetic Deflect

A 2D arena survival game where you carry **no weapon**. Your only tool is a 360° shield pulse that lasts a fraction of a second. Fire it at the right moment and incoming bullets are reversed — and become yours.

## Run it

No build step, no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrow keys | Move |
| `Space` / mouse click | Shield pulse |
| `1` `2` `3` | Pick a level-up modifier |
| `Esc` / `P` | Pause |
| `M` | Mute |
| `R` | Retry (on the game-over screen) |

## How it plays

- Enemies enter from the arena perimeter and **telegraph** a shot before firing. Bait the shot, then pulse at the last moment.
- A deflected projectile becomes friendly: it reverses direction, damages enemies, and can ricochet off walls twice before expiring.
- Get hit with the shield down and you lose hull. Enemies that touch you also hurt.
- Kills grant XP. Each level pauses the arena and offers three modifiers.
- Difficulty never stops scaling: spawn rate, enemy count, projectile speed, enemy HP, and new enemy types unlock over time.

### Gravity wells

Two black holes appear in randomly selected opposite quadrants, then slowly drift and randomly change direction during the run. Their pull reaches ~150 px and bends **every** projectile — hostile rounds curve on the way in, and your deflected shots curve on the way out. Anything that reaches the core is swallowed.

They change the geometry of every reflect: line up the shot so gravity does the rest, or watch your kill shot spiral into the void instead. Contact is dangerous too: the core deals **2 hull/sec**, tapering to **0.5 hull/sec** at the outer edge. The wells are re-rolled at the start of each run.

The arena is deliberately sparse — the alive cap starts at 5 and only reaches 12 after several minutes, so each round you fire is readable and worth baiting.

## Enemy types

| Type | Unlocks | Behaviour |
| --- | --- | --- |
| Chicken UFO | start | Keeper of range, single aimed shot |
| Dog-Rocket | 16 s | Fast, strafes wildly, leads its shots |
| Burster | 34 s | Fires 3-round bursts |
| Sniper | 58 s | Long telegraph, very fast round |
| Brute | 88 s | Tanky, slow, heavy projectile |

## Modifiers

- **Multi-Bounce** — each deflect splits into 2, then 3 projectiles.
- **Kinetic Amplifier** — bounced shots fly up to 4× faster and pierce more enemies.
- **Shield Burst** — bigger shield radius and longer active window.
- **Homing Deflection** — bounced shots curve toward the nearest enemy.
- **Quick Recovery** — shorter shield cooldown.
- **Fleet Foot** — faster movement.
- **Reinforced Hull** — more max hull, instant repair.
- **Chain Pulse** — enemies killed by bounced shots explode.
- **Patch Kit** — repeatable +35 hull.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Canvas, HUD, and menu / level-up / game-over overlays |
| `style.css` | All UI styling (scales with the stage via container units) |
| `game.js` | Entire game: loop, entities, deflection, upgrades, rendering, audio |

### Theme

The art and UI follow the [Hack Club Haven](https://haven.hackclub.com) jam look: cream paper with speckles, chunky ink borders, corner daisies, orange / butter / olive / mint accents, and the Darumadrop One + Jua typefaces. The palette lives in `C` at the top of `game.js` and as CSS custom properties in `style.css`.

Tuning lives at the top of the relevant sections in `game.js`: `TYPES` (enemy stats and unlock times), `P` (player-derived stats), `UPGRADES`, `makeWells` (well size / strength / placement), and `updateSpawn` (difficulty curve).

A `window.BounceBack` handle is exposed for debugging: `BounceBack.step(1/60)` advances one frame deterministically, and `state`, `player`, `enemies()`, `bullets()` and `wells()` are readable.
