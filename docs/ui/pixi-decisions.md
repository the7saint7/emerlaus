# Pixi Migration Decisions

Use this file for short ADR-style notes during implementation.

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

## 2026-04-10 - Use PixiJS For The New Fixed-Stage Renderer

- Status: accepted
- Context:
  - the current app is a stateful card-table UI, not a physics-heavy game
  - we need fixed 16:9 composition with retained scene objects and custom interaction layers
- Decision:
  - build the new gameplay renderer with PixiJS
  - keep the current DOM renderer as a fallback during migration
- Consequences:
  - we need a renderer boundary and a shared controller/view-model
  - text-heavy overlays may still use stage-anchored DOM during early phases
- Related files:
  - `docs/ui/pixi-migration-plan.md`
  - `docs/ui/pixi-migration-status.md`

## 2026-04-10 - Use A 16:9 Logical Stage

- Status: accepted
- Context:
  - the user wants identical composition across resolutions
  - physical resolution should not define layout
- Decision:
  - use a fixed 16:9 logical stage with uniform scaling and letterbox/pillarbox bars
  - prefer `1600x900` logical units as the default coordinate space
- Consequences:
  - all viewport input must be converted into stage coordinates
  - mobile portrait is not a supported gameplay layout for the table scene
- Related files:
  - `docs/ui/pixi-migration-plan.md`

## 2026-04-10 - Add A Renderer Boundary Before Pixi Implementation

- Status: accepted
- Context:
  - the existing client boot path went directly from `client/main.ts` to the DOM app
  - future Pixi work needs a safe insertion point without repeatedly rewriting bootstrap
- Decision:
  - route app boot through a renderer registry
  - keep `dom` as the active default renderer
  - allow renderer selection via query param and persisted local storage value
  - fall back to `dom` automatically if the requested renderer is unavailable
- Consequences:
  - Pixi can be introduced later without destabilizing the current boot path
  - crash output can report the active renderer
- Related files:
  - `client/main.ts`
  - `client/src/renderers/index.ts`
  - `client/src/renderers/selection.ts`
  - `client/src/renderers/domRenderer.ts`
  - `client/src/renderers/pixiRenderer.ts`

## 2026-04-10 - Use A Standalone Pixi Preview Path For Phase 1

- Status: accepted
- Context:
  - a visible Phase 1 result was needed before the deeper controller extraction was complete
  - the existing DOM app is too coupled to reuse directly for a quick fixed-stage preview
- Decision:
  - implement the first Pixi slice as a standalone preview app that joins the same match/session flow
  - keep controls in a temporary stage-aligned DOM overlay for now
- Consequences:
  - Phase 1 can ship a visible fixed 16:9 Pixi preview sooner
  - some orchestration logic is temporarily duplicated and should later move into shared controller code
- Related files:
  - `client/src/pixi/pixiApp.ts`
  - `client/src/renderers/pixiRenderer.ts`
  - `client/styles.css`

## 2026-04-10 - Phase 2 Starts With Local Hand Interaction

- Status: accepted
- Context:
  - the local hand drag system is the most renderer-specific interaction in the current UI
  - getting cards out of the hand and onto the fixed stage is the critical first usability milestone for Pixi
- Decision:
  - start Phase 2 with local hand rendering, hover, drag preview, seat targeting, and arrow drag
  - defer response-slot and object-targeting parity to later Phase 2 slices
- Consequences:
  - Pixi can now perform simple active plays and basic discard flow
  - some targeting and playability rules are temporarily duplicated and simplified in the Pixi app
- Related files:
  - `client/src/pixi/pixiApp.ts`

## 2026-04-10 - Keep Collective Annulation Explicit Until Pixi Has Count Selection

- Status: accepted
- Context:
  - Pixi now supports dragging CA response cards into a response slot during pending actions
  - collective annulation can require a player-selected card count, and auto-submitting a guessed count would be wrong
- Decision:
  - support CA response-slot drag and pass-response flow now
  - for collective annulation counts greater than one, show an explicit error banner until a dedicated count-selection UI exists
- Consequences:
  - Pixi response handling is usable for normal pass / mirror / resistance-accrue / simple annulation flows
  - collective annulation remains an acknowledged parity gap instead of a hidden rules bug
- Related files:
  - `client/src/pixi/pixiApp.ts`
  - `docs/ui/pixi-migration-status.md`

## 2026-04-10 - Anchor Overlay Controls From Rendered Pixi Geometry

- Status: accepted
- Context:
  - stage-aligned DOM overlays are still used for some temporary controls such as the pass button
  - copied slot coordinates drifted from the actual rendered response-slot position and caused visible misalignment
- Decision:
  - derive temporary overlay positions from `renderTableScene(...)` geometry results such as `currentGeometry.responseSlot`
  - avoid duplicated hardcoded slot coordinates in `redraw()` for overlay placement
- Consequences:
  - DOM overlay controls stay aligned with the live Pixi layout as the stage composition evolves
  - future center/response-slot layout changes should only require geometry updates in one place
- Related files:
  - `client/src/pixi/pixiApp.ts`
  - `client/styles.css`
  - `docs/ui/pixi-migration-status.md`
