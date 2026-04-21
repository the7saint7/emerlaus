# Pixi UI Status

## Current Status

- Overall status: active
- Renderer: Pixi only
- Table UI: live
- Dev tools: live
- Focus: gameplay bug fixes, rules correctness, and UX polish

## Current Surface Area

- Fixed 16:9 Pixi table renderer
- Discord Activity session flow with browser mock mode outside Discord
- Lobby, table, combat playback, overlays, event log, dice, and host/dev tooling
- Runtime bug-report capture plus server/client log download paths

## Recommended Workflow

1. Reproduce the bug in the Pixi client.
2. Check `runtime-logs/` and `runtime-bug-reports/` if the issue has already been captured.
3. Trace the issue through:
   - `client/src/pixi/pixiApp.ts`
   - `client/src/gameplay/interactionRules.ts`
   - `server/services/matchService.ts`
   - `server/services/gameEngine.ts`
4. Verify with `npm run typecheck`.

## Active Risks

- `client/src/pixi/pixiApp.ts` is still large and mixes rendering, input handling, sync orchestration, and replay state.
- `server/services/gameEngine.ts` remains the highest-risk file for rules regressions.
- Some overlays still rely on stage-anchored HTML/CSS above the Pixi stage, so visual regressions can span both layers.

## Notes For Future Work

- Treat the old migration as complete.
- Do not reintroduce renderer-switch assumptions in new docs.
- Keep Pixi docs focused on current architecture and bug-fix workflows.
