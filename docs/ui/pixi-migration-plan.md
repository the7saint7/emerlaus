# Pixi UI Migration Plan

## Decision

Build a new **PixiJS** gameplay renderer around a fixed **16:9 virtual stage** and keep the current DOM renderer as a fallback until feature parity is reached.

Use **letterbox/pillarbox** for mismatched viewports. The scene composition stays identical across desktop and mobile Discord as long as the user is in landscape.

## Recommended Stage

- Use a **16:9 logical stage**, not a physical-pixel target.
- Recommended default: **1600x900 logical units**.
- Acceptable alternative: **1920x1080 logical units** if we want a 1:1 mapping with HD mockups.

Why `1600x900` is the better default:

- Same aspect ratio as `1920x1080`.
- Lighter coordinate space and smaller raster requirements.
- Easier to scale down on mobile without oversized textures.
- No user-visible downside once the stage is fit-scaled.

Rule: the viewport scales the stage uniformly with `contain`; unused space becomes bars.

## Why PixiJS, Not Phaser

PixiJS is the better fit for this project because the app is primarily a **state-driven card table UI** with layered art, retained scene objects, custom hit areas, and a lot of overlays/modals. Phaser is stronger when the app needs a fuller game framework, scene system, physics, tilemaps, or arcade-style input patterns. That is not this product.

## Current UI Features That Must Be Reproduced

### Global / shell

- Loading screen.
- Left-match screen.
- Crash fallback.
- Language toggle.
- Browser mock mode and Discord embedded mode.
- Real-time updates from SSE and participant updates.
- Error banners and transient error states.

### Lobby screen

- Host / local player summary.
- Filled and empty seat cards.
- Host badge and connection state.
- Add bot.
- Start match.
- Refresh.
- Expansion toggles with enabled/disabled state.
- Discord/browser status pills and instance information.

### Table layout

- Local seat fixed at the bottom from the local player perspective.
- Opponent seat layout around the table based on player count.
- Dead/alive presentation.
- Current-turn highlighting.
- HP display.
- Power level display.
- Host inspection / kick affordances.
- Table background and center play zone.

### Local hand and local objects

- Fanned hand layout.
- New-card deal animation.
- Hover zoom on hand cards.
- Stable hover state across rerenders.
- Drag preview card.
- Single-target arrow drag mode.
- Discard zone.
- Current-turn glow.
- Separate local strips for statuses, rings, and other equipment.
- Local dead-state styling.
- Return-to-hand animation and hidden-card hand masking during animation.

### Opponent seats

- Avatar, name, HP, power.
- Seat response chips.
- Seat hover / targetable / current-turn / dead / damage / heal states.
- Inline object strip near seat header.
- Full seat object and status strip.
- Inspect player button.
- Host kick button.

### Center play area

- Active action card stack.
- Response card stack.
- Slot hover zoom.
- Stack offset and lift presentation.
- Active combat/status banner.
- Forced follow-up banner and pass action.
- Pending response actions.
- Curse-release choice actions.
- Center drop targets for play/response/discard.

### Combat and playback visuals

- Action target overlay arrows.
- Live arrow drag line for the local player.
- Opponent cursor arrows from remote players.
- Card flight from seat to center.
- Card flight returning to hand.
- Seat impact shake.
- Damage burst numbers.
- Heal burst visuals.
- Victory celebration overlay.
- Presentation lock during event playback.
- Event-driven staged reveal of actions and responses.

### Dice

- Dice overlay anchored near the relevant seat.
- d4/d6/d8/d10/d12/d20 and d100 handling.
- Roll animation and final result display.
- Seat-color theming.

### Modals / overlays

- Leave confirmation.
- Kick confirmation.
- Discard confirmation.
- Annulation count choice.
- Pending object choice.
- Telepathy hand inspection.
- Board reset keep choice.
- Death search corpse selection and keep selection.
- Pickpocket selection.
- Sacrifice numeric amount entry.
- Card reference browser with preview/search/filtering.

### History / informational panels

- Current chat/event-history panel behavior.
- Scroll retention.
- Event-history derivation from game events.
- Resizable panel behavior in the legacy renderer.

### Dev / host tooling

- Server log download.
- Client log download.
- Dev draw-card panel.
- Test-dice controls if still needed during migration.

## Renderer Strategy

Keep both renderers available.

- `dom`: the current renderer, unchanged except for being mounted through a renderer switch.
- `pixi`: the new renderer, introduced behind a flag and built incrementally.

Suggested switch mechanism:

- Query param: `?renderer=dom` or `?renderer=pixi`
- Persist last choice in `localStorage`
- Default to `dom` until the Pixi renderer reaches parity

## Target Architecture

### 1. Split controller from renderer

Right now `client/src/app.ts` owns:

- data fetching
- event playback state
- animation state
- DOM rendering
- DOM event wiring

That is too coupled for a second renderer. The first migration step is to create a shared application controller that exposes:

- current app state snapshot
- renderer-agnostic actions/intents
- subscriptions for state changes
- lifecycle hooks for animation and playback events

Example responsibilities:

- match sync and SSE
- session boot
- local interaction state
- event playback sequencing
- modal open/close state
- action submission
- dice requests

### 2. Define a renderer interface

Add a small renderer contract such as:

```ts
interface GameRenderer {
  mount(root: HTMLElement): void;
  render(viewModel: AppViewModel): void;
  destroy(): void;
}
```

The DOM renderer and Pixi renderer both implement this.

### 3. Introduce a renderer-friendly view model

Do not let the Pixi layer consume raw `MatchState` directly everywhere. Build a flattened `AppViewModel` that contains:

- seat placements
- visible cards
- stateful overlays
- active animations
- modal descriptors
- button enabled/disabled states
- tooltip content
- stage-relative positions

This view model becomes the contract both renderers can use.

### 4. Use Pixi for the stage, keep selective DOM overlays

Use Pixi for:

- board art
- seats
- cards
- drag interactions
- target arrows
- combat FX
- victory FX
- hover states
- card movement
- most buttons/chips that are part of the fixed composition

Use DOM overlays only where that is materially better:

- text input fields
- searchable card reference input
- numeric input for sacrifice
- possibly long-scroll reference/inspection panels during phase 1

Important rule: DOM overlays must still be **anchored to the same 16:9 stage** so composition remains fixed.

## Stage and Scaling Rules

### Outer shell

- Root fills the Discord viewport using modern viewport units.
- Respect safe areas on mobile via `env(safe-area-inset-*)`.
- If viewport is portrait, show a landscape-required overlay instead of attempting to reflow the table.

### Scaling

- Compute `scale = min(viewportWidth / stageWidth, viewportHeight / stageHeight)`.
- Center the stage.
- Render bars around the scene.
- All hit testing converts viewport coordinates into stage coordinates.

### Asset policy

- Board background and major UI art should be authored at 2x where rasterized.
- Prefer vector or nine-slice where practical for frames/panels/chips.
- Card textures can continue to use existing card art assets.

## Scene Composition

Recommended Pixi scene graph:

- `StageRoot`
- `BackgroundLayer`
- `TableLayer`
- `SeatLayer`
- `CenterPlayLayer`
- `EffectsLayer`
- `HandLayer`
- `HudLayer`
- `OverlayLayer`
- `ModalAnchorLayer`

Within that:

- seats remain retained scene objects, not rebuilt every frame
- cards are reusable sprites/containers
- hover/selection/drag state mutates object state directly
- animations use a small scene animation manager instead of full rerender replacement

## Feature Phasing

### Phase 0: Prep

- Add renderer switch.
- Preserve current DOM renderer under `dom`.
- Extract controller and shared view model.
- Add fixed-stage shell and viewport math utilities.

Exit criteria:

- App boots in `dom` mode through the new renderer boundary with no behavior change.

### Phase 1: Pixi lobby + static table

- Render lobby in Pixi or keep it in DOM temporarily behind the same shell.
- Render fixed 16:9 table background.
- Render opponent seats and local seat at fixed stage coordinates.
- Render center zone, top-right actions, and language toggle.
- No drag/drop yet.

Exit criteria:

- Pixi mode can join a lobby and enter a match with correct seat placement and letterboxing.

### Phase 2: Core card interaction

- Local hand fan.
- Hover zoom.
- Drag preview.
- Seat/object/center hit areas.
- Single-target arrow drag.
- Discard zone.
- Local/remote target highlights.

Exit criteria:

- A normal turn can be played entirely in Pixi mode.

### Phase 3: Combat presentation

- Card flights.
- Response stack.
- Action/response banners.
- Damage/heal bursts.
- Impact FX.
- Victory celebration.
- Presentation lock sequencing.
- Opponent cursor arrows.

Exit criteria:

- Main combat loop is visually complete.

### Phase 4: Overlay workflows

- Leave/kick/discard/annulation modals.
- Telepathy.
- Board reset keep.
- Death search.
- Pickpocket.
- Sacrifice input.
- Object choice.
- Card reference browser.

Exit criteria:

- All special action flows complete without dropping back to the DOM renderer.

### Phase 5: History, dice, and tooling

- Dealer/event history panel.
- Scroll persistence where applicable.
- Dice overlay port or Pixi-native dice presentation.
- Host/dev tools in Pixi mode.

Exit criteria:

- Pixi mode covers the full current user-facing and host workflow.

### Phase 6: Default switch

- Make Pixi the default renderer.
- Keep DOM as fallback for a stabilization window.
- Remove DOM only after sustained parity and testing.

## Fallback Plan

The old UI remains available until Pixi stabilizes.

Recommended behavior:

- `dom` is the default until at least Phases 1-4 are complete.
- `pixi` is opt-in for local development and internal testing.
- If Pixi boot fails, automatically fall back to `dom` and log the error.

## Risks

### 1. `app.ts` is currently DOM-centric

The largest real risk is not Pixi itself. It is the amount of controller logic currently mixed with DOM querying and event binding.

Mitigation:

- do the controller/view-model split first
- move renderer-specific code behind an interface before large Pixi work

### 2. Text-heavy overlays are awkward in pure canvas

Search, forms, long lists, and accessibility are more expensive in a pure canvas UI.

Mitigation:

- keep a stage-anchored DOM overlay layer for those flows

### 3. Mobile landscape still has limited space

Fixed 16:9 does not create more room. It only preserves composition. Some panels that are merely acceptable on desktop may still feel dense on mobile.

Mitigation:

- design the stage for the smallest supported landscape viewport first
- use modal pagination or tabs where a desktop list would be too dense

### 4. Texture memory can grow quickly

Large art plus many card sprites can increase memory pressure on mobile.

Mitigation:

- texture atlases for UI chrome
- lazy loading for heavy preview panels
- controlled card texture caching

## Immediate Next Steps

1. Add a renderer selection boundary without changing behavior.
2. Extract a shared app controller and `AppViewModel`.
3. Introduce PixiJS and a fixed-stage shell with letterboxing.
4. Implement a static Pixi table scene with correct seat coordinates.
5. Port the local hand and drag system next, because that is the most renderer-specific interaction in the current app.

## Handoff-Friendly Execution Rules

This plan is intended to be executed across multiple interrupted sessions, including by different AI instances.

For every work session:

1. Read this file first.
2. Read the status tracker in `docs/ui/pixi-migration-status.md`.
3. Inspect the current git diff before making assumptions.
4. Continue from the first unchecked task in the current phase unless the tracker says otherwise.
5. Update the status tracker before ending the session.

Required end-of-session output:

- what phase and task was worked on
- files added or changed
- what is complete
- what is partial
- exact next recommended task
- blockers or risks discovered

Rule: do not rely on chat history for continuity. The repo must contain enough context for the next agent to resume.

## Execution Granularity

Each phase should be broken into small tasks that can be stopped safely.

Preferred task size:

- one architectural extraction
- one renderer boundary
- one visual subsystem
- one interaction flow
- one modal or overlay workflow

Avoid bundling multiple large subsystems into one uninterrupted step.

## Required Persistent Artifacts

The repo should remain self-describing during the migration.

Maintain these artifacts:

- `docs/ui/pixi-migration-plan.md`: the long-lived plan and architecture.
- `docs/ui/pixi-migration-status.md`: current progress and next-step tracker.
- `docs/ui/pixi-decisions.md`: short ADR-style notes for important architecture decisions made during implementation.

If a decision materially changes the plan, update both the status file and the decision log.

## Stop Points

Safe interruption points should exist after each of these:

- renderer switch added and old UI still boots
- controller extracted but DOM renderer still active
- view model introduced and wired to DOM renderer
- Pixi shell boots with fixed stage
- static table scene renders
- local hand renders
- drag/drop works
- center play area works
- combat FX layer works
- each modal family reaches parity
- dice layer works
- Pixi mode can complete a full match loop

Do not leave the branch at a point where the default app boot path is broken unless the user explicitly asked for a disruptive spike.

## Definition Of Done Per Task

Every task should leave behind:

- code that builds
- a short note in the status tracker
- any new commands needed to run or test the step
- a note on whether `dom` fallback still works

If tests are not available, explicitly record what was manually verified.

## Recommended Session Closeout Template

Append or update the status tracker with:

```md
## Session YYYY-MM-DD HH:MM

- Phase: Phase N
- Task: short task name
- Completed:
  - item
- Partial:
  - item
- Files changed:
  - path
- Verification:
  - command or manual check
- Next step:
  - exact next task
- Risks / blockers:
  - item
```

Use concise bullets. The next agent should be able to resume from this block without reading old chat.

## Recommended Order Inside Each Phase

Within each phase:

1. Add types and interfaces first.
2. Add scaffolding and no-op implementations second.
3. Move existing behavior behind the new abstraction third.
4. Switch one path at a time.
5. Verify fallback behavior before moving on.

This reduces the chance that an interrupted session strands the branch in an unclear intermediate state.

## Acceptance Criteria

The migration is successful when:

- the same 16:9 composition is preserved across desktop and mobile Discord in landscape
- bars are used instead of responsive reflow
- old DOM mode remains selectable until parity is reached
- gameplay can be completed end-to-end in Pixi mode
- special overlays/modals preserve current functionality
- state sync and playback remain consistent with the current backend
