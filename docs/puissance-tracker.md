# Puissance Tracker

Status: in progress
Last updated: 2026-04-16

This file is the resume point for the Puissance extension rollout. Update it at the end of each implementation slice so the session can stop and restart without re-auditing the whole repo.

## Progress

- [x] Audit Puissance card list, existing handlers, and asset coverage
- [x] Confirm PNG coverage for every Puissance card
- [x] Create resumable tracker
- [x] Wire Puissance catalog/deck/editor/reference plumbing
- [x] Add reused Puissance cards and simple generic Puissance cards
- [x] Implement shared new-handler families
- [x] Implement bespoke high-complexity Puissance mechanics
- [x] Verify deck assembly and core gameplay flows

## Current Slice

Goal: Puissance runtime smoke tests are complete. The remaining work, if any, is broader gameplay QA rather than missing Puissance implementation.

Files expected in the next slice:

- `shared/cards/catalog/puissance-cards.ts`
- `server/services/gameEngine.ts`
- `docs/puissance-tracker.md`

## Completed In Current Session

- Added `shared/cards/catalog/puissance-cards.ts` as the new Puissance catalog entry point
- Exported Puissance definitions and deck quantities from shared card registry
- Wired Puissance deck quantities into server deck creation
- Allowed Puissance through the dev card catalog API and editor deck picker
- Enabled Puissance in the card reference filters and kept the live lobby toggle gated while the deck is incomplete
- Added i18n labels for the reference filter
- Added low-risk Puissance card definitions:
  `Baies magiques`, `Extase mystique`, `Nectar supreme`, `Flamme du dragon`, `Ceinture de force 2`, `Amulette anti-attaque de masse`, `Anneau de vitalite`, `Changement vital`, `Double attaque`, `Appel de la mort`, `Cercle fantastique`, `Champ energetique diminue`, `Tornade`, `Vent du nord`
- Added the freeze-on-hit Puissance attack cards:
  `Engelure`, `Flechette glacee`, `Rayon glacial`, `Refroidissement`, `Sculpture de glace`, `Zero absolu`
- Added the timed potion Puissance cards:
  `Potion de force`, `Potion de geant`, `Potion d'invincibilite`, `Potion de rapidite`
- Added the total-power override Puissance cards:
  `Puissance`, `Puissance totale`
- Added the first resistance-control bespoke Puissance cards:
  `Robe de double resistance`, `Detonation 13`
- Added the next bespoke Puissance cards:
  `Roulette russe`, `Equilibre`
- Added the next Emmerlaus bespoke Puissance card:
  `Arret temporaire d'Emmerlaus`
- Added the next bespoke Puissance reveal card:
  `Sous-grades`
- Added the next bespoke Puissance replay card:
  `Vierge`
- Added the final bespoke Puissance cancel card:
  `Ordre d'Emmerlaus`
- Implemented isolated engine hooks:
  `Appel de la mort` minimum-power gate in active-play validation
  `Amulette anti-attaque de masse` protection against `AM` attacks
  `Anneau de vitalite` start-of-turn `1D6` heal while equipped
- Implemented the ring-sacrifice conversion family:
  `Transformation energetique d'un anneau` now pauses for a power-ring sacrifice and heals `25` HP per ring level
  `Corruption d'un anneau` now pauses after a successful hit, sacrifices a chosen power ring, and deals `25` HP loss per ring level
- Added consume-power-ring object-choice resolution and mirrored the active-play validation inside card resolution so repeated plays also fizzle correctly when the caster no longer has a valid power ring
- Implemented the freeze-on-hit family as one shared successful-hit handler:
  each of the six freeze attacks now rolls `1D12` after a successful hit, and on `1` the target loses their next turn and cannot riposte for one full turn
- Added a Pixi seat overlay for frozen targets using `client/public/assets/effects/frozen-seat-fx.png`
- Implemented the timed potion status family:
  timed front-of-seat statuses now roll their duration on play, start next turn, tick down at the end of each affected turn, and reuse shared hooks for double/triple damage, attack immunity, and extra-card turns
- Added a turn-counter badge on timed front-of-seat status cards in the Pixi table view
- Implemented the total-power override family:
  `Puissance` now creates a front-of-seat status for a number of turns equal to the caster's current power and makes hand-played non-`E` cards use the total alive power
  `Puissance totale` now uses the shared restricted extra-play flow for one immediate `A`/`AD`/`AM` follow-up card with total alive power
- Implemented the first resistance-control bespoke hooks:
  `Robe de double resistance` grants one extra resistance roll against each incoming attack while equipped
  `Detonation 13` now kills the cursed target immediately if any of their resistance rolls land exactly on `13`
- Implemented the next bespoke resolvers:
  `Roulette russe` now randomly selects one living player, respecting attack protection on opponents; opponents are reduced to `5` HP and the caster instead loses half their current HP if self-selected
  `Equilibre` now redistributes the total HP of all living players into an even split, preserving total HP by distributing any remainder in seat order before HP caps apply
- Implemented the stopped-time extra-turn hook:
  `Arret temporaire d'Emmerlaus` now queues an immediate second turn for the caster, and during that bonus turn opponents cannot use resistance rolls or `CA` responses
- Tightened response validation so the server rejects response choices that are not currently legal, which also hardens the stopped-time suppression against crafted requests
- Implemented the public hand-reveal flow:
  `Sous-grades` now reveals every living opponent hand to all players for 30 seconds in a blocking Pixi overlay, then automatically resumes the turn through a server-side timer
- Implemented the replay-from-talon flow:
  `Vierge` now reproduces the last eligible non-`CA`/non-`O` active hand card that actually reached the talon, reusing its last stored target selection at the current caster power
- Added talon replay tracking to real discard points so `Vierge` learns from direct plays, defended plays, canceled plays, and deferred-resolution plays that ultimately send the source card to the talon
- Implemented the universal cancel / object-destroy flow:
  `Ordre d'Emmerlaus` now destroys a chosen object when played actively, and as a pending response it cancels any action, including `CA`, `E`, mirror-chain actions, and cards that would normally require 2 Annulations
- Extended the response-choice pipeline so drag-and-drop responses, server validation, collective resolution, bot responses, and stopped-time edge cases all understand `Ordre d'Emmerlaus`
- Filled `puissanceDeckCardQuantities` with the full Puissance deck list from the scraper dump, including the reused base cards
- Re-enabled Puissance in the live Pixi lobby expansion selector
- Sanity-checked the Puissance quantity table: `50` total cards, `44` unique ids, and `0` missing definition references
- Ran live API smoke tests against a local built server:
  verified Puissance lobby enablement and deck startup
  verified `Vierge` replays the last eligible talon card and re-applies `Baies magiques` for another `+20` HP
  verified `Ordre d'Emmerlaus` appears as a pending universal cancel response and cleanly prevents `Flamme du dragon` damage
  verified active `Ordre d'Emmerlaus` removes a live `Anneau de vitalite` object from the board
- Verified all current changes with `npm run typecheck`

## Card Work Breakdown

### Reuse existing logic

- Reused existing definitions only: `Anneau de puissance +1`, `Anneau de puissance +2`, `Annulation`, `Depouillement`, `Dissipation d'un anneau`, `La main qui vole`, `Miroir`, `Resistance accrue`
- Generic effects: `Baies magiques`, `Extase mystique`, `Nectar supreme`, `Cercle fantastique`, `Champ energetique diminue`, `Flamme du dragon`, `Tornade`
- Existing generic/system reuse with light mapping: `Changement vital`, `Ceinture de force 2`, `Double attaque`, `Vent du nord`, `Appel de la mort`
- Isolated object hooks already implemented: `Amulette anti-attaque de masse`, `Anneau de vitalite`

### New shared handler families

- Ring-sacrifice conversion implemented: `Corruption d'un anneau`, `Transformation energetique d'un anneau`
- Freeze-on-hit family implemented: `Engelure`, `Flechette glacee`, `Rayon glacial`, `Refroidissement`, `Sculpture de glace`, `Zero absolu`
- Timed self-buffs implemented: `Potion de force`, `Potion de geant`, `Potion d'invincibilite`, `Potion de rapidite`
- Total-power overrides implemented: `Puissance`, `Puissance totale`

### New bespoke mechanics

- Implemented: `Robe de double resistance`, `Detonation 13`
- Implemented: `Roulette russe`, `Equilibre`
- Implemented: `Arret temporaire d'Emmerlaus`
- Implemented: `Sous-grades`
- Implemented: `Vierge`
- Implemented: `Ordre d'Emmerlaus`

## Resume Notes

- Asset audit result: all Puissance PNGs already exist in `client/public/assets/cards/base`
- Unique Puissance cards to define: `44`
- Already implemented cards reused by Puissance: `8`
- Net new Puissance cards still to author: `36`
- Next likely slice: optional broader regression QA across mixed-expansion matches and longer multi-turn Puissance games
