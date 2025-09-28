# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- `/debug/rooms` endpoint showing active client IDs per room for quick diagnostics.

### Changed
- WebSocket server now waits for an explicit `join` before sending `init`, scopes broadcasts per room, and echoes the joined room ID.
- Client auto-joins on every connect/reconnect and reconnects automatically before sending state updates.
- Local dev workflow simplified to a single `npm run dev` command that launches both the server and Vite.

## [0.1.0] - 2025-09-26
### Added
- Full mobile control suite with virtual joystick, swipe look, action buttons, and optional motion controls.
- Touch-friendly utility buttons for camera toggling and dat.GUI access, plus mobile-first styling.
- Unified input manager and TypeScript input types to merge keyboard, touch, and motion data.

### Changed
- Game loop refactored to rely on the new `InputManager` and touch-aware GUI toggling.
- dat.GUI positioned as a mobile overlay with safe-area aware layout and scrollable content.
- README expanded with mobile enablement guidance and updated task checklist.

## [0.0.1] - 2020-04-26
### Added
- Initial Three.js prototype with multiplayer hub scaffolding.
- Keyboard controls for movement, jumping, and camera POV switching.
- Asset updates including additional audio effects and README documentation.
