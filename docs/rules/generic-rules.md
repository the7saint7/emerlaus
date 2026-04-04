# Emerlaus Generic Rules

This document defines the generic game rules for the digital version of Emerlaus.

It covers:
- turn flow
- hand flow
- targeting and defense timing
- resistance and rounding
- death and spectating
- draw/discard behavior

It does not cover:
- card-specific effects
- object-specific text
- exact card data extraction

Those belong to phase 2.

## Sources

Base public rules:
- https://emmerlaus.ca/reglements

Digital clarifications:
- user-provided decisions captured during implementation planning

## Match Basics

- Supported player count: `2` to `10`
- Turn order is clockwise.
- Every player starts at `50 HP`.
- HP can go above `50`.
- A player dies when their HP reaches `0` or less.
- Dead players are skipped in turn order immediately.
- Dead players may remain in the match as spectators or click `Leave Match`.
- The winner is the last player still alive.

## Hand Size

Minimum hand size depends on deck size:

- `100` cards: `5`
- `200+` cards: `6`
- `300` cards: `7`

At the end of a living player's turn, they refill their hand back to the minimum required hand size.

A player does not refill outside their own turn. This means they may lose cards to defense responses before their turn comes around.

If a player dies, they do not refill.

## Turn Structure

On a living player's turn:

1. Resolve all start-of-turn effects from cards already in play.
2. Resolve them from oldest to newest.
3. The player must then discard or play exactly one card from hand.
4. The player may choose to play that card as inactive.
5. If played inactive, the card goes directly to discard and does nothing.
6. If the card creates an effect, follow the defense/response flow.
7. After the played card and all resulting effects are fully resolved, if the player is still alive, refill back to the minimum hand size.
8. Advance to the next living player clockwise.

If a player has only defensive cards in hand and cannot meaningfully attack, they still must discard one card on their turn, then refill.

## Draw And Discard

- Played cards normally go to the discard pile unless their text says they remain in play.
- Inactive cards go to the discard pile immediately.
- Defensive response cards used during an action also go to the discard pile.
- All `Miroir` cards used in a mirror exchange go to the discard pile.
- When the draw pile is empty, reshuffle the discard pile to form a new draw pile.
- When a reshuffle happens, the dealer/system posts a short chat message announcing it.

## Cards That Stay In Play

Some cards remain in play instead of going directly to discard.

These include persistent cards such as objects:
- rings
- amulets
- staffs
- other similar equipment or ongoing cards

Some stay for a duration.
Some stay indefinitely.

Exact persistence and removal rules are card-specific and belong to phase 2.

Base-set clarification:
- some persistent hostile effects, such as `Malédiction`, remain until specifically removed
- in the base set, a cursed player may spend `2 Annulation` on their own turn to remove that curse
- removing that curse is that player's only action for the turn

## Death

When a player dies:

- they remain visible in the match unless they leave manually
- they stop taking turns
- they stop drawing cards
- their hand goes to the discard pile
- their in-play cards and objects go to the discard pile unless a future card rule explicitly says otherwise

If a player kills themselves by sacrificing HP, they die normally and the same cleanup applies.

Base-set clarification:
- `Anneau de résurrection` overrides normal death cleanup
- when it triggers, only the resurrection ring and the dead player's hand are discarded
- the player's other objects remain in play
- the player returns with `50 HP` and draws `5` new cards

## Fractions And Minimum Values

All fractions round up.

Examples:
- `12.5` becomes `13`
- `0.5` becomes `1`

Values should not be reduced below `1` when the rule calls for the result to remain positive.

## Resistance Roll

Resistance is only allowed when the card's defense band allows it.

Base resistance rule:
- roll `1d20`
- `1` to `10`: success
- `11` or more: failure

Special resistance outcomes:
- natural `1`: full success
- natural `20`: fatal failure and the attack deals double damage

Natural `1` and natural `20` always keep these meanings unless a specific card explicitly overrides them in phase 2.

If a card causes partial damage on successful resistance, all rounding still rounds up.

## Power Level

- Every magician has a minimum power level of `1`.
- Power level modifies effects when a card says so.
- Power level may increase during play through future card/object rules.

Exact power-level interactions are card-specific and belong to phase 2.

## Targeting Categories

A played card may target:
- the caster
- one opponent
- multiple opponents
- all opponents
- an object or revealed card in play
- another valid target specified by the card text

Whether an object or in-play card is targetable depends on the played card and the target card's own rules.

Base-set clarification:
- `Sanctuaire d’Emmerlaüs` prevents attacks against the protected player for one full turn
- it does not prevent non-attack hostile actions such as object theft or other non-attack effects

## Defense And Response Windows

When a card is played against one or more defenders:

- all targeted defenders receive their defense window at the same time
- all responses lock in before resolution
- one defender's defense affects only that defender unless a later card rule explicitly says otherwise

If a defender chooses to pass, that pass is final for that action.

If a defender plays a response card, that choice is final for that action.

There is no response timer for human players in the current plan.

Future moderation option:
- the host may get a `Kick` action to replace a slow or disruptive human with a bot

## CA Card Limits

Normal rule:
- only one `CA` card may be played against an incoming effect

Special exception:
- if the effect requires `2 Annulation`, then the defender must spend exactly `2 Annulation` cards together or spend none

For attacks or effects that target all opponents or affect multiple opponents:
- each defender protects only themselves
- one defender's `Annulation` does not cancel the effect for other defenders

Website-specific mass-effect exception:
- for effects that require `2 Annulation`, those two cancellation cards may come from one or two opponents when the public rule text explicitly says so

This rule was chosen to match the website text rather than memory-based recollection.

## Order Of Resolution

For a standard attack that allows defense and resistance:

1. attacker plays the card
2. targeted defenders choose and lock their `CA` responses or pass
3. resolve `CA` outcomes
4. if resistance is still allowed and still relevant for a target, that target rolls resistance
5. resolve final damage/effects
6. discard temporary played/response cards as needed

The played center card remains active and visible until the full action is resolved.

## Mirror Rules

`Miroir` has special handling.

- A mirror can only be answered by another mirror.
- It can bounce back and forth multiple times.
- The exchange continues until one side passes or runs out of playable mirror cards.
- Every mirror card used in that exchange goes to the discard pile.
- If a mirrored attack comes back to a player, that reflected copy affects only the specific mirror exchange that created it.

For mass-target attacks:
- multiple defenders may successfully mirror the same mass attack
- the attacker may therefore receive multiple reflected copies
- each successful mirroring defender creates their own reflected copy against the attacker

Mirror exchanges are resolved after defenders have locked their response choices for the action.

Base-set clarification:
- if a card such as `Colère du magicien` is mirrored, the mirrored target becomes the player forced to play the follow-up `AD` card
- the original attacker becomes the paralyzed target who takes double damage from that forced follow-up attack

## Multi-Target Attacks

For cards that target multiple players or all opponents:

- each targeted defender gets an independent defense choice
- each targeted defender may independently cancel, mirror, resist, or pass if allowed
- outcomes are evaluated per defender
- if one target dies, the card may continue resolving against other targets

## Bots

Initial bot behavior for generic rule flow:

- bots should pause briefly before acting to feel more human
- initial think time: `2` to `5` seconds
- the initial easy bot will simply pick the first playable option available in hand
- this applies both to normal turn play and defense response windows

Bot sophistication and difficulty tuning belong to later phases.

## Deferred To Phase 2

The following are intentionally not finalized in this document:

- exact card database
- exact defense bands per card
- object-specific rules
- status-specific rules
- exact damage formulas per named card
- exact tooltip text extraction
- exact reveal/hidden information rules per card
- exact defense-band machine mapping for imported card data
