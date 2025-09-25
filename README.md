
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
- `src/game/Keyboard.ts`, `src/game/audio.ts`, and `src/game/Scenery.ts` wrap inputs, sounds, and environment loading.
- `src/game/MultiplayerClient.ts` talks to the WebSocket hub; run `npm run server` to start `server/index.ts`.


#### CREDITS

3D Character Models: https://opengameart.org/users/quaternius

3D Scenery Models: https://www.cgtrader.com/free-3d-models/plant/other/low-poly-trees-d9e99730-93d6-4564-a477-7ec52a990a3c

Grass texture: https://github.com/mxro/threejs-test/tree/master/test4/public/textures

Inspiring tutorial: https://threejsfundamentals.org/threejs/lessons/threejs-game.html

Backgrounds & skyboxes: https://threejsfundamentals.org/threejs/lessons/threejs-backgrounds.html
