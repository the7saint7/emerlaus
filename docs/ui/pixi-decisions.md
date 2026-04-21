# Pixi UI Decisions

Use this file for concise ADR-style notes about the current Pixi client.

## Format

```md
## YYYY-MM-DD - Decision Title

- Status: proposed | accepted | superseded
- Context:
  - short bullet
- Decision:
  - short bullet
- Consequences:
  - short bullet
- Related files:
  - path
```

## 2026-04-10 - Use PixiJS For The Activity Client

- Status: accepted
- Context:
  - the app is a state-driven multiplayer card table with layered art and custom interaction
  - the UI benefits from retained scene objects and fixed-stage composition
- Decision:
  - implement the gameplay client in PixiJS
- Consequences:
  - rendering and interaction are centered in the Pixi app
  - stage-aligned HTML overlays are still used where text input or long-form UI is more practical
- Related files:
  - `client/src/pixi/pixiApp.ts`
  - `docs/ui/pixi-migration-status.md`

## 2026-04-10 - Use A Fixed 16:9 Logical Stage

- Status: accepted
- Context:
  - the table composition should stay stable across supported landscape viewports
  - viewport size should scale the scene, not reshape it
- Decision:
  - use a fixed `1600x900` logical stage with uniform scaling and letterbox/pillarbox bars
- Consequences:
  - all interaction coordinates must be converted into stage space
  - gameplay remains landscape-first
- Related files:
  - `client/src/pixi/pixiApp.ts`

## 2026-04-10 - Keep Overlay Controls Anchored To Live Stage Geometry

- Status: accepted
- Context:
  - some controls and modal surfaces are rendered in HTML/CSS above the stage
  - copied coordinates drift when the table layout changes
- Decision:
  - derive overlay positions from live geometry produced by the Pixi table render pass
- Consequences:
  - overlays stay visually aligned with the stage
  - layout changes should be made in one place instead of duplicated across render layers
- Related files:
  - `client/src/pixi/pixiApp.ts`
  - `client/styles.css`

## 2026-04-11 - Drive Combat Playback From Live Geometry

- Status: accepted
- Context:
  - combat playback needs flights, arrows, and target cues that match the current table layout
- Decision:
  - derive playback anchors from the current rendered seat, object, and slot geometry
- Consequences:
  - playback remains aligned as the table evolves
  - timing still needs care because animation runs against live synced state
- Related files:
  - `client/src/pixi/pixiApp.ts`
