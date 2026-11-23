# Web Swatter

A web-slinging hero sits in his office chair and shoots webs at mosquitoes before they bite him.

## Run locally
- **Easiest:** double-click `index.html` (opens in your browser).
- **Or with a local server:** in this folder run `python -m http.server 8000` and open http://localhost:8000

## Controls
- Move mouse / finger: aim (dashed line + crosshair)
- Click / tap / Space: shoot web
- P or Esc: pause · M: mute

## Mosquitoes
| Type | Look | Points |
|---|---|---|
| Normal | grey | +1 |
| Girlfriend | pink with bow — killing her makes the others ANGRY (faster) for 4s | +3 |
| Big | large, needs 2 hits | +2 |

You have 3 lives; each bite costs one. Best score is saved in the browser.

## Sounds (`sounds/` folder)
| File | When it plays | Included? |
|---|---|---|
| `mosquito1.mp3` | 1st mosquito flying across (video 0–3 s); repeats for the 4th, 7th… | yes |
| `mosquito2.mp3` | 2nd mosquito (video 8–9 s); repeats for the 5th, 8th… | yes |
| `mosquito3.mp3` | 3rd mosquito (video 17–18 s); repeats for the 6th, 9th… | yes |
| `shotdown.mp3` | mosquito shot down (video 26–27 s) | yes |
| `miss.mp3` | shot missed — web flew off-screen (video 17.6 s, the missed shot) | yes |
| `near.mp3` | a mosquito comes close to the hero (each mosquito once, with a cooldown) | yes |
| `shoot.mp3` | every web shot (cut from the reference video) | yes |
| `kill.mp3` | a mosquito is shot down — the "bzzzt" zap (cut from the reference video) | yes |
| `mosquito.mp3` | looping buzz, louder as they get closer — replaces the built-in ~190 Hz drone (matched to the video) | optional, drop it in |

Use exactly these file names. Change how close counts as "near" with `CONFIG.nearDistance`.

## Where to edit
- `game.js` → `CONFIG` at the top: lives, web speed, spawn rate, difficulty, colours.
- `drawHero()` / `drawHead()` / `drawArm()` → the hero, chair and suit.
- `drawMosquito()` → the mosquito look; `spawnMosquito()` → which types appear.
- `style.css` → menus, buttons, score text.

## Hero face and room
- `images/face.png` is the hero's face: a cut-out with a transparent background. Replace it with another cut-out PNG to change the face.
- In `CONFIG` (top of `game.js`): `faceSize` makes the head bigger/smaller, `faceOffsetX` / `faceOffsetY` nudge it. Set `faceImage: ""` for the masked head.
- The room (window, lamp, plant, table, rug, floor) is painted in `buildBackground()`; the animated bits (coil smoke, lamp glow, stars) are in `drawRoom()`.

## Big mosquito with a face
- `images/mosquito_face.png` is the face on the big mosquito (`CONFIG.bigFaceImage`, size `CONFIG.bigFaceSize`).
- `sounds/bite.mp3` (Elvish clip) loops while the big mosquito is flying; it stops when it bites or is shot.
- Order is fixed: 2 normal mosquitoes, then the big face one, repeating (`CONFIG.normalsBeforeBig`).
- `sounds/elvish_kill.mp3` ("chup tmkc") plays when the face mosquito is shot down; normal mosquitoes still use `shotdown.mp3`.

## Rounds
- Play → **VS screen** ("Mosquito vs <hero>") → round starts. Click or Space skips the VS screen.
- Round 1: hero is Amitabh, the big mosquito wears Elvish's face. Round 2: swapped. More rounds keep alternating, getting harder (more kills needed, faster mosquitoes).
- Clear a round → `sounds/sheru.mp3` (Sheru Bhai) plays, then the lion video (`videos/win.webm`, green screen removed, `CONFIG.winVideo`) walks onto the empty room stage, then **Next round**.
- Dying retries the same round.
- Add more characters in the `FACES` list near the top of `game.js` (a cut-out PNG + a name).
- Difficulty per round: `CONFIG.roundBaseTarget`, `roundTargetGrowth`, and `roundGoal()` in `game.js`.
