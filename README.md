
# Farmyard Fight Club
### A Three.js 3D Coronavirus Codealong

___


#### DEVELOPMENT SETUP

```bash
# install dependencies
npm install

# run the multiplayer websocket hub (terminal 1)
npm run server

# start the Vite dev server (terminal 2)
npm run dev
```

- Game runs at http://localhost:5173 by default.
- Multiplayer hub listens on ws://localhost:3001; override with `MULTIPLAYER_PORT` when running the server or `VITE_MULTIPLAYER_URL` for the client.
- Build for production with `npm run build` and preview with `npm run preview`.

![screenshot](screenshot.png)


## GOALS

- Make a fun game and have fun
- Learn about stuff like 3D graphics and game logic and maths and stuff
- Practice coding
- Catchup... so lonely

## Plan

- Make a 3D scene using three.js
- Create some objects: cube, land, backgrounds
- Load some 3D models
- Animate the models, switch between animations
- Animation render loop
- Controls: move character using keyboard
- Camera POV changes: from world to player

## Dreams / Wishlist

- Camera POV switching: world to player
- Collision detection!
- Sounds! Footsteps etc, dying sounds
- More actual game logic - how do you play the game?
Do you just knock over other animals?
Can you shoot them with laser beams from your eyes?
Can you push each other off the edge of a platform? Chase each other around?
- Better management of character/game state, and animation cueing
- Augmented Reality / outdoor GPS-based playing?
- More models!
- Landscape! Mountains, water, forests, bits of grass, clouds etc?
- Mobile-friendly controls? (on-screen buttons, gyro/tilt control?)
- Decent game AI?????
- Higher-res skybox images
- Huge explosions
- Networked multiplayer mode - Firebase?

## Feature Request: Mobile Controls (Touch + Motion)

**Why:** On phones the game is difficult to engage with using only desktop-style inputs. We need thumb-native controls and (optionally) motion sensors so it feels natural on mobile.

### Scope
- **Primary (Touch):**
  - **Left-thumb virtual joystick** for directional movement (relative stick: appears where the thumb lands).
  - **Right-thumb swipe** for camera/look.
  - **Action buttons** (Primary, Secondary, Jump) bottom-right with large hit areas.
- **Secondary (Motion – optional & toggleable):**
  - **Gyro aim**: use small wrist motions for “micro-aim” on top of right-thumb swipe.
  - **Tilt-to-move (experimental)**: map device pitch/roll to a small movement bias or full movement in a “casual” mode.

### Implementation Notes (idiomatic to this stack)
- **Language/stack:** TypeScript + Vite + Three.js. No new deps required.
- **File layout (suggested):**
  - `src/input/mobile/VirtualJoystick.ts`
  - `src/input/mobile/TouchLook.ts`
  - `src/input/mobile/ActionButtons.ts`
  - `src/input/mobile/mobileControls.ts` (mount + `read()` aggregator)
  - `src/input/motion/SensorInput.ts` (permission, smoothing, calibration)
  - `src/input/motion/MotionController.ts` (modes: 'off' | 'tiltMove' | 'gyroAim' | 'tiltAssist')
  - `src/styles/mobile.css`
- **Mounting:** On boot, if `navigator.maxTouchPoints > 0`, create a `#touch-layer` overlay and register pointer handlers. Keep keyboard/mouse for desktop; merge inputs in a single `InputState`.
- **Camera toggle:** Expose a top-right `Cam` utility button on mobile to mirror the desktop `C` key for cycling POV.
- **GUI toggle:** Hide dat.GUI by default; surface a `Menu` utility button on mobile and map `G` (desktop) to show/hide when needed.
- **CSS:** Add glassy circles for joystick base/knob and large tappable buttons; respect iOS safe-area insets.
- **Viewport meta:** In `index.html` add `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />`.
- **Motion permissions (iOS):** Gate `DeviceMotionEvent.requestPermission()` behind a user tap (“Enable Motion Controls”). Provide “Calibrate” to set the current pose as neutral.
- **Tuning defaults:**
  - Joystick: radius ~60 px, deadzone 10 px, smoothing EMA α≈0.25.
  - Look swipe sensitivity: start ~0.15 (px → degrees/radians as your camera expects).
  - Motion: deadzone 4–5°, clamp at 15°, gyro aim gain ~0.02 (deg/s → pixels/frame).
- **Networking:** Send **inputs only** (stick vector, look delta, action bits). No world positions.
- **Accessibility:** Provide toggles in a simple in-game Settings panel:
  - Gyro Aim (on/off, sensitivity)
  - Tilt to Move (off/assist/full, sensitivity, deadzone, “Calibrate”)
  - Invert Y, Look sensitivity

### Minimal Types (reference)
```ts
// src/input/types.ts
export type Vec2 = { x: number; y: number };
export interface InputState {
  move: Vec2;           // -1..1 movement axes
  lookDelta: Vec2;      // screen-space delta per frame
  actions: { primary: boolean; secondary: boolean; jump: boolean };
}
```

### Dev & Testing
- Local run: Keep existing scripts (`npm run server` on :3001, `npm run dev` on :5173).
- Env: Continue using `VITE_MULTIPLAYER_URL` and `MULTIPLAYER_PORT` as documented.
- Test on iOS Safari + Android Chrome in landscape. Verify multitouch (left stick + right swipe + button press simultaneously).

### How to Enable Motion Controls
1. Launch the game on a touch-capable device (controls mount automatically when `navigator.maxTouchPoints > 0`).
2. Open the in-game GUI (top-right dat.GUI panel) and expand **Mobile Controls**.
3. Tap **Enable Motion Controls** to grant motion/gyro permission, then toggle **Gyro Aim** or select a **Tilt Mode**.
4. Adjust sensitivities, invert options, and use **Calibrate Neutral Pose** to set your comfortable resting orientation. Settings persist via `localStorage`.

### Tasks (checklist)
- [x] Add mobile input modules and styles per layout above.
- [x] Auto-mount touch layer on devices with `maxTouchPoints > 0`.
- [x] Implement relative joystick with deadzone and smoothing.
- [x] Implement right-thumb swipe look with sensitivity setting.
- [x] Add action buttons (Primary, Secondary, Jump) with large hit areas + haptics (`navigator.vibrate(10)` if available).
- [x] Optional: implement MotionController (gyro aim, tilt assist/move) behind a permissioned toggle + calibrate.
- [x] Settings panel toggles + sensitivity sliders; persist to `localStorage`.
- [x] Update README with short “How to Enable Motion Controls” snippet.

### Acceptance Criteria
- On a touch device, player can move with the left thumb, look/aim with the right thumb, and trigger actions with buttons, all simultaneously.
- Controls feel stable: deadzones work, no unexpected page scroll/zoom, multitouch is reliable.
- (If enabled) Gyro aim subtly improves fine control without drift; tilt modes can be toggled off cleanly.
- Desktop inputs remain unchanged.

### Future Nice-to-Haves
- Fixed vs relative joystick toggle
- Simple aim assist (mobile-only)
- Visual HUD widget that visualizes current tilt for calibration


## Session 2
- Switch camera POVs; limit camera angle (don't go below land)
- refactor Character setup, subclass Player from Character
- Game interaction stuff: collision detection;
  raycasting ('what am i looking at?') - shooting lasers and seeing what you hit
- sound effects; walking sound, dying sounds? positional sounds??
- clean up changeState / changeAnimation code, to make it easier to
  modify the animation params - i.e. walking backwards

## Multiplayer Notes

- To find your LAN IP on macOS Wi-Fi: `ipconfig getifaddr en0`.
- macOS advertises a `.local` hostname; check System Settings → General → Sharing. Friends on the same Wi-Fi can use `http://<host>.local:5173` and `ws://<host>.local:3001`.
- For quicker commands you can export `LAN_HOST=$(ipconfig getifaddr en0)` and reference `$LAN_HOST` in your run scripts.
- For off-network play use a tunnel (ngrok, Cloudflare Tunnel, LocalTunnel, etc.) and set `VITE_MULTIPLAYER_URL` to the resulting wss URL.
- Ensure your firewall allows inbound 5173/3001 during sessions and close the servers when you wrap up.

## Review

- `src/main.ts` bootstraps the `Game` class once the page loads.
- `src/game/Game.ts` manages scene setup, animation loop, multiplayer integration, and overall orchestration.
- `src/game/Character.ts` contains `Character`, `Player`, and `RemotePlayer` logic plus animation/collision plumbing.
- `src/input/InputManager.ts`, `src/game/audio.ts`, and `src/game/Scenery.ts` wrap inputs, sounds, and environment loading (touch + motion layers live under `src/input/mobile` / `src/input/motion`).
- `src/game/MultiplayerClient.ts` talks to the WebSocket hub; run `npm run server` to start `server/index.ts`.


#### CREDITS

3D Character Models: https://opengameart.org/users/quaternius

3D Scenery Models: https://www.cgtrader.com/free-3d-models/plant/other/low-poly-trees-d9e99730-93d6-4564-a477-7ec52a990a3c

Grass texture: https://github.com/mxro/threejs-test/tree/master/test4/public/textures

Inspiring tutorial: https://threejsfundamentals.org/threejs/lessons/threejs-game.html

Backgrounds & skyboxes: https://threejsfundamentals.org/threejs/lessons/threejs-backgrounds.html
