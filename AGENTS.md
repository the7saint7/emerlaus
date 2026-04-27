# AGENTS.md

## Project Overview

Emerlaus is a Discord Activity card game implemented as a TypeScript web app.

- `client/` contains the Vite browser client. The main user-facing renderer is PixiJS.
- `server/` contains an Express API for local/node hosting and a Cloudflare Worker adapter.
- `shared/` contains game types, seating helpers, match helpers, card definitions, and generated/manual card data used by both client and server.
- `docs/` contains rules notes, UI migration/status notes, Discord setup docs, legal pages, and generated card-band artifacts.
- `scripts/` contains Python utilities for importing and processing card assets/data.
- `bot_ai/` is a standalone Python placeholder for future bot logic; current bot behavior is implemented in TypeScript server code.

The app is dependency-light: TypeScript, Vite, Express, PixiJS, Discord Embedded App SDK, Wrangler, and a few dev utilities.

## Run And Build Commands

Use these from the repository root:

- `npm install` installs dependencies.
- `npm run dev` builds the server once, then runs server watch, server process, and Vite client together.
- `npm run dev:client` runs only Vite on port `5173`.
- `npm run dev:server` runs only the Express server/watch path.
- `npm run build` builds both server and client.
- `npm run build:server` runs `tsc -p tsconfig.server.json`.
- `npm run build:client` runs `vite build`.
- `npm run typecheck` typechecks server and client with no emit.
- `npm start` serves the built Express app from `dist/server/server/index.js`.
- `npm run preview` builds and runs `wrangler dev`.
- `npm run deploy` builds and deploys with Wrangler.

There is no dedicated test suite in `package.json` currently. Use `npm run typecheck` as the minimum verification after code changes, and run a build when changes affect bundling, assets, server output, or Cloudflare deployment.

## Environment

Copy `.env.example` to `.env` for local development.

Important variables:

- `PORT` defaults to `3001` for the Express server.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_PUBLIC_KEY` are needed for real Discord Activity OAuth flows.
- `DISCORD_REDIRECT_URI` is optional and only used if explicitly registered.
- `ENABLE_DEV_TOOLS=true` enables dev tools routes and client modes.
- `DEV_CARD_PICKER_ROLE_IDS` enables role-based dev card picker access through Discord guild member checks.
- `EMERLAUS_DATA_DIR` or `DATA_DIR` can relocate runtime data such as logs and bug reports; otherwise runtime data is written under the process working directory.

Without Discord credentials, the client uses browser mock mode with a local mock user and the fixed `local-dev-instance` match ID.

## Local Architecture

### Client

Entry point:

- `client/main.ts` loads config from `/api/config` and chooses the app mode.

Main modes:

- Default: `client/src/pixi/pixiApp.ts`.
- `?dev=band-mapper`: `client/src/dev/cardBandMapperApp.ts`.
- `?dev=bug-reports`: `client/src/dev/bugReportsApp.ts`.
- `?dev=card-editor`: `client/src/dev/cardEditorApp.ts`.

Key client modules:

- `client/src/api/gameApi.ts` is the typed fetch wrapper for API calls.
- `client/src/discord/session.ts` handles Discord SDK auth and browser mock sessions.
- `client/src/pixi/pixiApp.ts` is the main table renderer and interaction controller.
- `client/src/gameplay/interactionRules.ts` centralizes client-side play/target/response interaction rules.
- `client/src/features/dice/` contains dice notation, controller, types, and seat colors.
- `client/src/render/` contains layout/event-log helpers used by the Pixi renderer.
- `client/src/i18n.ts` handles localization and card image variant selection.
- `client/styles.css` contains global styles and HTML overlay styles layered around the Pixi stage.

The Pixi stage uses a fixed logical `1600 x 900` table and responsive scaling. Some overlays are DOM/CSS above the canvas, so visual changes can involve both `pixiApp.ts` and `client/styles.css`.

### Server

Entry points:

- `server/index.ts` is the Express app for local/node hosting.
- `server/worker.ts` imports `server/index.ts` and exposes it through Cloudflare's `cloudflare:node` handler.

Key server modules:

- `server/services/matchService.ts` owns route-facing match operations: joining, host actions, playing cards, bot scheduling, pending choices, and notifications.
- `server/services/gameEngine.ts` owns the core game rules and is the highest-risk file for behavior regressions.
- `server/services/gameEngineTypes.ts` defines stored/internal game state shapes.
- `server/store/matchStore.ts` stores matches in memory and persists logs on save.
- `server/store/playerSessionStore.ts` issues and validates player session tokens.
- `server/store/sseStore.ts` tracks SSE clients and broadcasts match/cursor updates.
- `server/services/discordOAuth.ts` handles Discord OAuth and role lookups.
- `server/services/localLogService.ts` and `server/services/bugReportService.ts` write/read runtime logs and bug reports.
- `server/services/baseCardCatalogService.ts` and `server/services/baseDefenseBandMappingService.ts` back the dev card tools.

Server state is in-memory. Restarting the server clears active matches and player sessions.

### Shared Code

Important shared modules:

- `shared/types.ts` is the main API/client/server contract. Keep request/response and state changes synchronized here first.
- `shared/matchRules.ts` contains basic match creation, host assignment, and seat helpers.
- `shared/seating.ts` contains relative seating helpers for local player perspective.
- `shared/cards/index.ts` re-exports card types and card definitions.
- `shared/cards/baseCardDefinitions.ts` combines generated/manual card data and deck catalogs.
- `shared/cards/catalog/` contains base, Abondance, and Puissance card catalogs.
- `shared/cards/generated/` contains generated source data.
- `shared/cards/manual/` contains manually curated overrides and defense band mappings.

Prefer changing shared contracts/types before wiring equivalent client and server behavior.

## API Shape

All API routes are rooted under `/api` except `/health`.

Common routes:

- `GET /api/config`
- `POST /api/token`
- `POST /api/matches/:instanceId/join`
- `GET /api/matches/:instanceId`
- `GET /api/matches/:instanceId/events` for SSE updates
- Host routes under `/api/matches/:instanceId/host/*`
- Gameplay routes such as `/play-card`, `/respond`, `/select-object`, `/dice-roll`, and pending-choice endpoints.
- Dev routes under `/api/dev/*`; most are hidden unless `ENABLE_DEV_TOOLS=true`.

Most match routes require the `x-player-session-token` header. The client obtains this from the join response and sends it through `client/src/api/gameApi.ts`.

## Card Data And Assets

Card text and behavior are split across generated data, manual overrides, TypeScript catalogs, and image assets.

Important paths:

- `shared/cards/generated/base-card-dataset.json`
- `shared/cards/manual/base-card-overrides.json`
- `shared/cards/manual/base-defense-band-mappings.json`
- `shared/cards/catalog/*.ts`
- `client/public/assets/cards/`
- `client/public/assets/cards/processed-manifest.json`
- `docs/artifacts/card-bands/base/`

External source data:

- `C:\Users\Work\Desktop\Emerlaus_scraper\V2` contains extracted original cards, expansions, and card descriptions. Check this location when planning or importing new expansion data such as Communion.

Related scripts:

- `npm run import:base-cards`
- `npm run process:english-card-alpha`
- `npm run process:card-images`

Be careful with large checked-in image directories. Do not churn generated card assets unless the task explicitly requires it.

## Runtime Data

Runtime logs and bug report artifacts are local development data. Current common directories include:

- `runtime-logs/`
- `runtime-bug-reports/`

These are useful when reproducing gameplay bugs. Check them before changing game logic if the user references a runtime issue or submitted bug report.

## Development Guidelines

- Use strict TypeScript patterns already present in the repo.
- Keep client/server/shared contracts aligned; many failures come from changing one side only.
- Prefer existing helpers in `shared/`, `client/src/gameplay/interactionRules.ts`, and `server/services/gameEngine.ts` over duplicating rule logic.
- Treat `client/src/pixi/pixiApp.ts` as high-risk because it mixes rendering, input handling, synchronization, overlays, replay, and dev UI.
- Treat `server/services/gameEngine.ts` as high-risk because it encodes card behavior, turn flow, pending actions, damage, defense, statuses, deaths, and bot decisions.
- After gameplay changes, verify both type safety and at least one local browser flow when possible.
- Do not reintroduce alternate renderer assumptions; docs indicate the Pixi migration is complete and the current renderer is Pixi only.
- Avoid committing or editing `.env`. Use `.env.example` for documented environment changes.

## Documentation To Check

- `README.md` for local and Discord setup basics.
- `docs/discord-activity-setup.md` for Discord Activity testing and publication flow.
- `docs/ui/pixi-migration-status.md` for current UI architecture and workflow.
- `docs/ui/action-response-flow.md` for response timing and UI expectations.
- `docs/rules/generic-rules.md` for generic digital rules.
- `shared/cards/README.md` for the card data pipeline status.

## Verification Checklist For Agents

Before finishing code changes:

1. Run `npm run typecheck`.
2. Run `npm run build` if changes affect bundling, Worker deployment, public assets, or server output.
3. For UI changes, run the dev app and inspect the Pixi table at `http://localhost:5173`.
4. For Discord-specific changes, validate browser mock mode still works and then follow `docs/discord-activity-setup.md` for embedded testing.
5. For game-rule changes, inspect affected state types in `shared/types.ts`, route calls in `client/src/api/gameApi.ts`, route handling in `server/index.ts`, orchestration in `server/services/matchService.ts`, and core resolution in `server/services/gameEngine.ts`.
