
# Farmyard Fight Club
### A Three.js 3D Coronavirus Codealong

[Changelog](CHANGELOG.md)

___


#### DEVELOPMENT SETUP

```bash
# install dependencies once
npm install

# launch websocket server + Vite together
npm run dev
```

- `npm run dev` uses [`concurrently`](https://github.com/open-cli-tools/concurrently) to start the multiplayer hub (ws://0.0.0.0:3001/ws) and Vite (http://localhost:5173) in a single terminal. Use `npm run dev:client` if you only need the Vite process running.
- When both processes are running, open `http://localhost:5173/?room=dev-room` (or your LAN IP) on each device. The client auto-sends `{ type: 'join', room }` on every connect/reconnect.
- Quickly confirm room membership via `fetch('/debug/rooms').then(r => r.json())` or by visiting `http://localhost:5173/debug/rooms`; you should see a JSON map of room IDs to client IDs.
- Override networking defaults with `MULTIPLAYER_PORT` for the server or `VITE_WS_*` (`VITE_WS_URL`, `VITE_WS_HOST`, `VITE_WS_PORT`, `VITE_WS_PATH`) for the client when deviating from the proxied `ws://localhost:5173/ws` path.
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

## Mobile Dual Sticks & Camera Modes

Touch devices now mount dual virtual joysticks plus action buttons. Desktop testers can enable them with `?joysticks=1` while keeping keyboard support intact.

### Core Behaviour
- **Left stick** drives planar movement (`x` = strafe, `y` = forward) and rotates the character toward the motion heading with exponential smoothing.
- **Right stick** adjusts yaw/pitch on the active camera rig. Chase mode orbits behind the player, FPV locks to the head. When the stick recentres, the camera gently snaps back using critically damped exponential easing.
- **Action buttons** (Primary / Secondary / Jump) sit above the right stick with a keep-out margin so the stick ignores touches inside the button cluster.
- A **Swap** pill in the top corner flips left/right handed layouts on the fly.
- Optional `?debug=1` overlays a HUD with stick vectors, yaw/pitch, and snap statistics. Console logs emit magnitude histograms every two seconds.

### Runtime Toggles & Shortcuts
- `Swap` button - swaps handedness (`Controls.leftHanded`).
- Keyboard `C` flips between chase (`cameraPOV = world`) and FPV (`cameraPOV = player`).
- The settings panel still disables game input and pointer events on the sticks while open.

### URL Overrides
- `?joysticks=1` - force-enable sticks on desktop/laptops.
- `?lefty=1` - start in left-handed layout (equivalent to pressing Swap).
- `?mode=chase|fpv` - initial camera rig mode, affects snap behaviour.
- `?invertY=1` - invert right-stick pitch.
- `?snap=off|chase|fpv` - disable snapping or restrict it to a single mode.

### Control Defaults
```
deadZone: 0.12
maxRadiusPx: 68
moveSpeed: 5.0 // units per second
yawSpeed: 2.8  // rad/s at full deflection
pitchSpeed: 2.2
invertY: false
smoothing: 0.18
snapChaseStrength: 6.0
snapFpvStrength: 3.5
safeMarginPx: 16
buttonsMarginPx: 24
```

### Test Plan
- **Desktop sanity**: `?joysticks=1&debug=1` to verify sticks, HUD, and handedness toggle while keyboard continues to operate when sticks are idle.
- **Phone UI**: portrait and landscape checks that sticks respect safe-area insets and remain clear of action buttons; try `?lefty=1` to ensure layouts swap correctly.
- **Movement**: push the left stick up-right; the character should travel NE, face the heading smoothly, and stop without jitter when released.
- **Camera**: sweep the right stick in chase and FPV; when released the camera should ease back behind or along the head direction according to the active snap mode.
- **Multiplayer**: two devices (phone plus desktop) can move independently with no input leakage.
- **Performance**: stick processing stays under about 0.4 ms per frame on a mid-range mobile device (check via devtools timeline).

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
- macOS advertises a `.local` hostname; check System Settings → General → Sharing. Friends on the same Wi-Fi can use `http://<host>.local:5173` and `ws://<host>.local:5173/ws` (proxied to the hub).
- For quicker commands you can export `LAN_HOST=$(ipconfig getifaddr en0)` and reference `$LAN_HOST` in your run scripts.
- For off-network play use a tunnel (ngrok, Cloudflare Tunnel, LocalTunnel, etc.) and set `VITE_WS_URL` (or the legacy `VITE_MULTIPLAYER_URL`) to the resulting wss URL.
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
