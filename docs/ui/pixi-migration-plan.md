# Pixi UI Architecture

## Summary

The Discord Activity client now runs on a Pixi-based table UI with a fixed 16:9 logical stage.

The old migration is complete. This document is now a current-state architecture note rather than a migration checklist.

## Core Principles

- Keep the gameplay table on a fixed `1600x900` logical stage.
- Scale the stage uniformly with `contain`.
- Preserve composition with letterboxing or pillarboxing instead of responsive table reflow.
- Use Pixi for the table, seats, cards, arrows, and combat presentation.
- Use stage-anchored HTML/CSS overlays only for workflows that are materially easier outside the canvas.

## Main Client Entry Points

- `client/main.ts`
  - boots the Pixi app or a dev tool view
- `client/src/discord/session.ts`
  - handles Discord/browser session setup
- `client/src/pixi/pixiApp.ts`
  - owns the main activity renderer and most client-side orchestration
- `client/src/gameplay/interactionRules.ts`
  - shared targeting and interaction helpers used by the Pixi client

## Server-Side Counterparts

- `server/index.ts`
  - HTTP routes, SSE endpoint, and dev endpoints
- `server/services/matchService.ts`
  - request orchestration, permissions, bot scheduling, reconnect/kick/disconnect logic
- `server/services/gameEngine.ts`
  - turn resolution, rules, pending flows, and public-state projection
- `shared/types.ts`
  - match/game protocol between server and client

## Client Responsibilities

`client/src/pixi/pixiApp.ts` currently handles:

- match join and sync
- SSE subscription
- stage rendering
- pointer input and drag targeting
- replay/presentation state
- overlay/modal state
- bug-report and log-download wiring

That file is the main maintenance hotspot. Bugs in interaction timing, replay locking, modal visibility, and rendering state commonly land there.

## Stage Layout Rules

- Local seat remains fixed at the bottom.
- Opponent layout is derived relative to the local seat.
- Portrait gameplay is not a supported primary layout; show a warning instead.
- All viewport pointer coordinates must be mapped into stage coordinates before hit testing.

## Render Layer Guidance

Prefer Pixi for:

- seats and avatars
- card stacks and hand rendering
- arrows and target indicators
- combat flights and impact effects
- turn highlighting and board-state presentation

Use stage-anchored HTML/CSS when it is the pragmatic choice:

- text input
- long scrollable lists
- some confirmation modals
- bug-report form surfaces

## Debugging Guidance

When a bug is reported:

1. Confirm whether it is visual-only, interaction-only, or rules-related.
2. Check the latest `MatchState` shape involved.
3. Inspect the client path in `client/src/pixi/pixiApp.ts`.
4. Inspect the matching server path in `server/services/matchService.ts` and `server/services/gameEngine.ts`.
5. Review `runtime-logs/` and bug-report artifacts when available.

## Verification Baseline

Use these checks after UI or rules changes:

- `npm run typecheck`
- manual table smoke test in browser mock mode
- manual multiplayer smoke test in Discord when the change affects session, sync, or presentation timing

## Maintenance Rule

Keep this document current with the live Pixi architecture. Do not document retired renderer workflows here.
