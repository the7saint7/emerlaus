# Pixi Migration Status

## Current Status

- Overall status: in progress
- Active renderer default: `dom`
- Fallback renderer available: `dom`
- Pixi renderer available: yes, Phase 2 interaction preview
- Current phase: Phase 2
- Current task: Phase 2 is implementation-complete and waiting for user confirmation before being marked complete in the tracker

## Next Recommended Task

- Validate the finished Phase 2 Pixi interaction slice with the user and, if accepted, mark Phase 2 complete and begin Phase 3 combat presentation work.
- Keep refining table composition later, but do not spend more time on the pass-button anchor unless new card/slot art changes force it.
- Remaining shared-rule cleanup is no longer the blocking item for closing Phase 2.
- Keep `dom` stable while Pixi interaction parity improves incrementally.

## Resume Checklist

Any new agent should do this first:

1. Read `docs/ui/pixi-migration-plan.md`.
2. Read this file.
3. Check git diff/status.
4. Confirm whether the app still boots in `dom` mode.
5. Continue from the current phase and task listed above.

## Phase Checklist

### Phase 0: Prep

- [x] Add renderer switch.
- [x] Keep current DOM renderer working through the new boundary.
- [ ] Extract shared controller responsibilities from DOM rendering concerns.
- [ ] Introduce a shared `AppViewModel`.
- [x] Document bootstrap and renderer selection flow.

### Phase 1: Pixi lobby + static table

- [x] Add PixiJS dependency and boot path.
- [x] Add fixed 16:9 stage shell with letterboxing.
- [x] Render static board scene.
- [x] Render seat anchors and local seat layout.
- [x] Enter a match successfully in Pixi mode.

### Phase 2: Core card interaction

- [x] Render local hand fan in Pixi.
- [x] Add hover zoom and selection behavior.
- [x] Add drag preview.
- [x] Add drop targets for seat, object, center, and discard.
- [x] Add response-slot CA drop flow.
- [x] Add minimal pass-response overlay action.
- [x] Add single-target arrow drag.
- [x] Add initial readable card inspection path.
- [x] Reduce the main duplicated interaction-rule hotspots between DOM and Pixi.

### Phase 3: Combat presentation

- [ ] Port action/response center stack.
- [ ] Port card flights.
- [ ] Port target arrows and opponent cursors.
- [ ] Port damage/heal/impact FX.
- [ ] Port victory celebration and playback presentation lock.

### Phase 4: Overlay workflows

- [ ] Leave / kick / discard / annulation flows.
- [ ] Pending object choice.
- [ ] Telepathy.
- [ ] Board reset keep.
- [ ] Death search.
- [ ] Pickpocket.
- [ ] Sacrifice amount entry.
- [ ] Card reference browser.

### Phase 5: History, dice, and tooling

- [ ] Port event-history / chat panel behavior.
- [ ] Port or replace dice presentation.
- [ ] Port host/dev tooling.
- [ ] Verify scroll retention and state persistence where still required.

### Phase 6: Default switch

- [ ] Make Pixi the default renderer.
- [ ] Keep DOM fallback selectable.
- [ ] Run stabilization pass.
- [ ] Remove DOM only when explicitly approved.

## Session Log

## Session 2026-04-10

- Phase: Phase 0
- Task: planning and migration scoping
- Completed:
  - documented the Pixi migration plan
  - documented handoff-friendly execution rules
  - created this status tracker
  - created an ADR-style decisions log placeholder
- Partial:
  - implementation has not started
- Files changed:
  - `docs/ui/pixi-migration-plan.md`
  - `docs/ui/pixi-migration-status.md`
  - `docs/ui/pixi-decisions.md`
- Verification:
  - documentation-only change
- Next step:
  - implement renderer selection boundary with `dom` as the default path
- Risks / blockers:
  - `client/src/app.ts` currently mixes controller logic and DOM rendering heavily

## Session 2026-04-10 2

- Phase: Phase 0
- Task: renderer selection boundary
- Completed:
  - added renderer registry and renderer types
  - added `dom` renderer adapter
  - added unavailable `pixi` renderer placeholder for future boot wiring
  - added query-param and local-storage based renderer selection
  - routed `client/main.ts` boot through the renderer boundary
  - preserved `dom` as the default and fallback renderer
- Partial:
  - no controller extraction yet
  - no shared `AppViewModel` yet
- Files changed:
  - `client/main.ts`
  - `client/src/renderers/index.ts`
  - `client/src/renderers/types.ts`
  - `client/src/renderers/selection.ts`
  - `client/src/renderers/domRenderer.ts`
  - `client/src/renderers/pixiRenderer.ts`
  - `docs/ui/pixi-migration-plan.md`
  - `docs/ui/pixi-migration-status.md`
  - `docs/ui/pixi-decisions.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - begin extracting renderer-agnostic controller/bootstrap responsibilities from `client/src/app.ts`
- Risks / blockers:
  - `client/src/app.ts` still owns state, DOM event wiring, render timing, and DOM querying in one module

## Session 2026-04-10 3

- Phase: Phase 1
- Task: first visible Pixi preview
- Completed:
  - installed `pixi.js`
  - enabled the `pixi` renderer path
  - added a standalone Pixi app boot path
  - added a fixed 16:9 stage with contain-scaling and letterbox/pillarbox behavior
  - added a landscape-only warning overlay for the Pixi preview
  - rendered a static Pixi lobby scene
  - rendered a static Pixi table scene with seat anchors and local seat area
  - added a temporary DOM control overlay for refresh, host lobby actions, language switching, and leave
  - added lightweight polling and participant-update refresh for the Pixi preview
- Partial:
  - Pixi mode is still mostly static and does not support gameplay interactions yet
  - controller/view-model extraction is still pending
  - overlay controls are still mostly DOM rather than Pixi
- Files changed:
  - `package.json`
  - `package-lock.json`
  - `client/styles.css`
  - `client/src/renderers/pixiRenderer.ts`
  - `client/src/pixi/pixiApp.ts`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - refine the Pixi scene and then extract shared controller logic before starting interaction-heavy migration work
- Risks / blockers:
  - Pixi adds a noticeable client bundle increase in the current single-bundle build
  - the current Pixi preview duplicates a small amount of session/match orchestration that should later move into shared controller code

## Session 2026-04-10 4

- Phase: Phase 2
- Task: local hand interaction slice in Pixi
- Completed:
  - added Pixi local hand fan rendering using actual card art
  - added card hover state in the Pixi table
  - added drag preview for hand cards
  - added seat highlight targeting for basic opponent-targeted cards
  - added single-target arrow drag flow in Pixi
  - added basic lift-to-play center slot behavior for simple active plays
  - added basic discard-by-drop behavior in Pixi when discarding is allowed
  - blocked sync refresh while active local interaction is in progress
- Partial:
  - object targeting is not implemented in Pixi yet
  - response-slot / CA flow is not implemented in Pixi yet
  - playability and targeting rules are only partially mirrored from the DOM renderer
  - controller/view-model extraction is still pending
- Files changed:
  - `client/src/pixi/pixiApp.ts`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - add response interaction and object targeting support to the Pixi renderer, or extract shared targeting helpers before doing that
- Risks / blockers:
  - Pixi interaction logic is currently duplicated and simplified compared with the DOM renderer
  - drag hit-testing is rectangle-based and not yet as nuanced as the DOM implementation

## Session 2026-04-10 5

- Phase: Phase 2
- Task: response-slot and object-targeting checkpoint in Pixi
- Completed:
  - added visible object rows for local and opponent seats in the Pixi table
  - added object-target hit geometry and play-card dispatch for object-targeted plays
  - added a visible Pixi response slot during pending actions
  - allowed CA response cards to be dragged during pending-action state
  - wired response-slot drop handling through `respondToPendingAction`
  - added a minimal pass-response overlay button when pass is available
  - kept collective annulation count handling explicit with an error banner rather than silently submitting the wrong count
- Partial:
  - Pixi still does not support choosing annulation count for collective responses
  - card inspection/readability is still incomplete
  - response visuals are functional but not yet close to DOM parity
  - controller/view-model extraction is still pending
- Files changed:
  - `client/src/pixi/pixiApp.ts`
  - `docs/ui/pixi-migration-status.md`
  - `docs/ui/pixi-decisions.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - continue Phase 2 with readable card inspection, fuller response parity, and reduction of duplicated targeting/playability rules
- Risks / blockers:
  - collective annulation count still needs a dedicated selection UI
  - object strips are functional but visually provisional and may need repositioning after parity pass
  - Pixi bundle remains large in the single-bundle build

## Session 2026-04-10 6

- Phase: Phase 2
- Task: center-card render and readable preview checkpoint in Pixi
- Completed:
  - replaced the center play slot's text-only placeholder with actual rendered card faces
  - render the active pending-action card or last played card in the center slot
  - added a fixed readable preview panel that follows the currently focused/dragged hand card and otherwise falls back to the center card
  - kept the response slot and center stack visually above seat object rows
- Partial:
  - pass-button placement is still provisional until the center region reaches stronger visual parity
  - preview panel styling is functional but not yet final
  - controller/view-model extraction is still pending
- Files changed:
  - `client/src/pixi/pixiApp.ts`
  - `docs/ui/pixi-migration-status.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - continue Phase 2 with collective annulation count handling, preview polish, and further reduction of duplicated targeting/playability rules
- Risks / blockers:
  - preview panel increases visual density on the right side of the board and may need layout iteration
  - Pixi bundle remains large in the single-bundle build

## Session 2026-04-10 7

- Phase: Phase 2
- Task: replace persistent preview with click-to-inspect and improve Pixi image loading
- Completed:
  - removed the always-visible readable preview panel approach from the board layout
  - added click-to-inspect zoom for visible table cards in the center stack, response stack, and object rows
  - added an animated DOM inspect overlay that expands from the clicked card's on-table position and closes on click
  - added explicit Pixi texture loading with redraw scheduling instead of relying only on implicit sprite loading
- Partial:
  - inspect currently targets visible table cards, not every future overlay/modal workflow
  - pass-button placement remains provisional until the center region reaches stronger parity
  - controller/view-model extraction is still pending
- Files changed:
  - `client/src/pixi/pixiApp.ts`
  - `client/styles.css`
  - `docs/ui/pixi-migration-status.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - validate whether explicit texture loading resolves the missing-card-art issue in practice and continue Phase 2 response-rule parity
- Risks / blockers:
  - Pixi bundle remains large in the single-bundle build
  - if card art still does not appear, the remaining issue is likely URL/path or asset-serving specific rather than layout

## Session 2026-04-10 8

- Phase: Phase 2
- Task: visual parity and interaction polish on the Pixi table
- Completed:
  - removed card text bars and switched table cards to image-only presentation
  - made card art fill the inner card region while preserving aspect ratio
  - added click-to-inspect for hand cards and fixed inspect hitboxes for equipped object/effect cards
  - removed the local seat panel and other provisional top-left/debug overlays from the Pixi table
  - narrowed and repositioned the local lower hand/shadow zone, enlarged the hand, and kept the discard button anchored on its left edge
  - added persistent pending-action arrows, including actor-to-center and center-to-target arrows
  - tuned the interactive target arrow with a larger centered arrowhead and curved line
  - added response-slot placeholder text for dropping defense cards
  - moved the pass button under the defense drop region and anchored it from `currentGeometry.responseSlot` instead of duplicated constants
- Partial:
  - collective annulation count choice is still not implemented in Pixi
  - seat positioning is structurally done but still expected to need later visual refinement
  - some Phase 3 presentation work has started opportunistically via persistent arrows, but card-flight / FX playback is still missing
  - controller/view-model extraction is still pending
- Files changed:
  - `client/src/pixi/pixiApp.ts`
  - `client/styles.css`
  - `docs/ui/pixi-migration-status.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - continue Phase 2 with collective annulation count UI and reduction of duplicated targeting/playability rules in Pixi
- Risks / blockers:
  - `client/src/pixi/pixiApp.ts` still owns too much duplicated renderer-specific interaction logic
  - the pass button is now correctly anchored to the defense slot, but any future center/response-slot art changes should continue to derive overlay placement from rendered geometry rather than copied coordinates

## Session 2026-04-10 9

- Phase: Phase 2
- Task: collective annulation count choice in the Pixi response flow
- Completed:
  - replaced the Pixi annulation-count error banner dead end with a real modal choice flow
  - added a stage-aligned Pixi overlay modal for annulation count selection
  - support confirming variable annulation counts instead of only the hardcoded error path
  - clear or recompute the pending annulation choice when sync updates invalidate it
  - extracted the first shared interaction-rule slice into `client/src/gameplay/interactionRules.ts`
  - pointed both `client/src/app.ts` and `client/src/pixi/pixiApp.ts` at shared helpers for lift-play, arrow-target, response-choice, discard eligibility, and collective annulation prompt logic
- Partial:
  - targeting/playability/response eligibility logic is reduced but still not fully shared between DOM and Pixi paths
  - Pixi still uses temporary DOM overlays for some controls and workflow prompts
  - seat-position and full presentation polish are still expected later
- Files changed:
  - `client/src/gameplay/interactionRules.ts`
  - `client/src/app.ts`
  - `client/src/pixi/pixiApp.ts`
  - `client/styles.css`
  - `docs/ui/pixi-migration-status.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - start extracting shared response/targeting/playability helpers so Pixi stops re-implementing DOM-side rules locally
- Risks / blockers:
  - `client/src/pixi/pixiApp.ts` is still the largest risk surface because interaction rules remain renderer-local

## Session 2026-04-11 10

- Phase: Phase 2
- Task: final shared-rule cleanup before Phase 2 closure
- Completed:
  - extracted the shared seat-target and object-target rule helpers into `client/src/gameplay/interactionRules.ts`
  - switched both `client/src/render/tableView.ts` and `client/src/pixi/pixiApp.ts` to the shared targeting helpers
  - closed the main remaining duplicated rule hotspot that was keeping Phase 2 open
- Partial:
  - `Phase 2` is now waiting on user confirmation rather than blocked by a known implementation gap
  - `Phase 3` presentation work is still pending
- Files changed:
  - `client/src/gameplay/interactionRules.ts`
  - `client/src/render/tableView.ts`
  - `client/src/pixi/pixiApp.ts`
  - `docs/ui/pixi-migration-status.md`
- Verification:
  - `npm run typecheck`
  - `npm run build:client`
- Next step:
  - get user confirmation, then mark `Phase 2` complete and start `Phase 3`
- Risks / blockers:
  - no known Phase 2 blocker remains beyond user acceptance of the current behavior
