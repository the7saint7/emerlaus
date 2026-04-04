# Emerlaus Action And Response UI Flow

This document defines the planned UI behavior for:
- hovering cards
- playing cards
- targeting players and objects
- confirming all-target effects
- defending with `CA` cards
- mirror exchanges
- dealer/system chat messaging

This is the interaction spec for the generic rules layer. Card-specific visuals and text content will be expanded in phase 2.

## Core Principles

- The local player should always understand what action is currently pending.
- Hover should improve readability.
- Selection should feel explicit.
- Valid targets should be visually obvious.
- Resolution should be visible to all players.
- Dealer/system narration should appear in chat, not as a separate banner.

## Card Hover

When the user hovers:
- a card in their hand
- a revealed persistent card in play
- a visible response card during a response window

the card should:
- scale up slightly
- feel visually focused
- show a tooltip

Tooltip behavior:
- tooltip color should match the card's theme/type
- tooltip contains extracted card text
- disabled cards still show their tooltip
- disabled cards should keep a disabled look while hovered

## Playing A Card On Your Turn

On the active player's turn:

1. Hover a playable card in hand.
2. The card may show normal hover focus.
3. Click the card to arm it.
4. Once armed, render a curved arrow between the card and the mouse cursor.
5. Valid targets become selectable.
6. Invalid targets remain non-selectable.
7. Clicking a valid target commits the play immediately.

Once a card is committed, the player cannot change their mind for that action.

If a card targets the caster only:
- no target-selection UI is needed
- use a confirm/cancel flow on the card itself instead
- after confirmation, the card may still open an opponent response window if its defense band allows counters

## Valid Target Highlight

If a player, object, or other valid target is under the cursor while a card is armed:
- show a golden drop shadow
- optionally scale it slightly

Targetability depends on:
- the currently armed card
- the target card/object rules

Not every visible object is always targetable.

## Center Action Card

When a card is played and its outcome is not yet fully resolved:

- display that card in the middle of the screen for everyone
- apply a soft golden glow
- apply a subtle floating animation
- allow mouse hover for tooltip reading

The center action card remains visible until:
- all defense choices are locked in
- all mirror exchanges are resolved
- all resistance rolls are resolved
- the action is fully completed

The center card should also show:
- attacker name
- target player or targets when relevant

## Dealer/System Chat

The dealer/system posts short messages in chat for important action events, including:
- what card was played
- who played it
- who or what it targets
- object targets and object owner when relevant
- all-opponent targeting
- deck reshuffles

Dealer/system messaging should exist in chat only.

## All-Target Cards

If the played card targets everyone and does not need a specific clicked target:

- clicking the card in hand enters a confirm state
- no target selection is needed
- show confirm and cancel affordances near or on the card
- the player may confirm the play or cancel before commitment

The card should not hide the center area while waiting for confirmation.

Self-target cards should use the same confirm/cancel pattern instead of a target click.

## Discarding A Card Inactive

A player may choose to discard a card as inactive instead of using its effect.

Inactive discard flow:

1. Player arms a card.
2. The discard pile in the center becomes a valid destination.
3. The discard pile shows a golden drop shadow on hover.
4. Clicking the discard pile sends the card to discard with no effect.

For all-target cards:
- a discard shortcut may also appear near the same confirm/cancel area

## Center Piles

The center space should eventually show:
- draw pile
- discard pile
- center action card when an effect is pending

For the current interaction plan:
- discard pile must be clearly targetable for inactive discard
- center action card must remain readable and not be hidden by response controls

## Defense Window

When one or more defenders are targeted by a card:

- all targeted defenders enter their defense window at the same time
- only legal response cards remain enabled
- illegal response cards are disabled
- disabled cards still support hover and tooltip preview

Each targeted defender gets their own choice:
- play a legal `CA` card
- or pass

One defender's defense does not protect other defenders unless a future card explicitly says so.

This also applies to self-target cards that still allow counters.
In that case:
- the user confirms the self-target card
- opponents who are allowed to counter it receive their response window

## Defense Card Interaction

Defender interaction should mirror attacker interaction:

1. Hover a legal response card.
2. Show a gold glow and slight scale-up.
3. Click the response card to arm it.
4. Render a curved arrow from that response card to the center action card.
5. Click the center action card to confirm the defense.

Defense choices are final once committed.

## Pass Button

During a defense window:

- show a `Pass` button above the center action card
- do not place it over the center card itself
- clicking pass locks the defender into no response for that action

Pass should also become visible to all players once chosen.

Base-set clarification:
- if a player is under `Malédiction`, they should be allowed on their own turn to spend `2 Annulation` as a self-contained cleanse action
- that consume-removal action replaces their normal one-card turn action

## Response Visibility

While waiting for all targeted defenders to answer:

- show a small state icon over each targeted defender avatar
- this should indicate their current locked response
- examples:
  - pass
  - annulation
  - mirror
  - resistance accrue

Bots should show their icon only once they have chosen.

## Resistance Timing

If the effect allows a resistance roll:

1. defenders first resolve the `CA` response window
2. then any remaining valid resistance rolls occur
3. then the effect applies or fails as appropriate

Resistance is not the first line of defense when a `CA` window exists.

## Mirror Visualization

Mirror should have its own visible feedback.

Recommended behavior:
- draw a blue-to-white gradient arrow to represent the reflected direction
- the arrow should indicate the current direction of the effect

Example:
- first defender mirrors: arrow points from defender toward the center card / attacker-facing direction
- attacker mirrors back: attacker uses the normal selection flow, then the reflection arrow switches direction again

The mirror exchange may continue multiple times until:
- one side passes
- or one side has no mirror left to play

All mirror cards used in the exchange go to discard.

## Multi-Target Resolution UI

For effects that hit multiple defenders:

- all defenders choose responses simultaneously
- each defender's choice is shown to everyone once locked
- after everyone has locked in, resolve all outcomes

Mass attacks may therefore result in:
- some targets canceling
- some passing
- some resisting
- some mirroring
- some taking damage directly

Base-set clarification:
- `Sanctuaire d’Emmerlaüs` should remove attack-target highlighting from the protected player during its active duration
- non-attack target highlighting may still be allowed if the played card supports it

## Dead Players

Dead players remain able to watch the match unless they leave.

Dead players:
- should remain visible in the table UI
- should be skipped for turns
- should not be offered playable interaction controls

Whether dead spectators can still hover for tooltip reading on visible cards can remain enabled as a spectator convenience.

## Host Moderation

No automatic turn timer is planned for now.

Possible future moderation UI:
- host-only `Kick` button to replace a slow or disruptive human with a bot

This is not part of the current interaction implementation yet.

## Deferred To Phase 2

These are intentionally deferred:

- exact card face rendering
- exact card text extraction
- exact object target rules
- exact icon set for response states
- exact animation language for each card family
- exact reveal rules for hidden hands versus public cards
