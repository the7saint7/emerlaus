import { baseCardDefinitionById } from "../../shared/cards";
import type { CardCategoryCode } from "../../shared/cards";
import { getCardImageVariantUrl, getImportedCardImageUrl, type CardImageVariant } from "./cards/cardImageUrls";
import type {
  CardView,
  MatchState,
  PendingActionResponderState,
  PlayedCardState,
  SeatState
} from "../../shared/types";

export type AppLanguage = "fr" | "en";
export type { CardImageVariant } from "./cards/cardImageUrls";

const LANGUAGE_STORAGE_KEY = "emerlaus.language";

type TranslationKey =
  | "language.french"
  | "language.english"
  | "language.switch"
  | "common.cancel"
  | "annulationChoice.title"
  | "annulationChoice.body"
  | "annulationChoice.playOne"
  | "annulationChoice.playTwo"
  | "loading.match"
  | "left.title"
  | "leave.confirm.title"
  | "leave.confirm.body"
  | "leave.confirm.action"
  | "kick.confirm.title"
  | "kick.confirm.body"
  | "discard.confirm.title"
  | "discard.confirm.body"
  | "eventLog.title"
  | "eventLog.history"
  | "eventLog.empty"
  | "eventLog.expand"
  | "eventLog.minimize"
  | "replayDebug.title"
  | "replayDebug.speed"
  | "replayDebug.playing"
  | "replayDebug.paused"
  | "replayDebug.pause"
  | "replayDebug.resume"
  | "replayDebug.rewind"
  | "replayDebug.slow"
  | "replayDebug.normal"
  | "lobby.activity"
  | "lobby.title"
  | "lobby.copy"
  | "lobby.discord"
  | "lobby.browser"
  | "lobby.instance"
  | "lobby.channel"
  | "lobby.guild"
  | "lobby.seatsFilled"
  | "lobby.localPlayer"
  | "lobby.host"
  | "lobby.unassigned"
  | "lobby.hostControl"
  | "lobby.hostWaiting"
  | "lobby.refresh"
  | "lobby.addBot"
  | "lobby.startMatch"
  | "lobby.openSeat"
  | "lobby.seatAvailable"
  | "lobby.expansions"
  | "lobby.expansionsHint"
  | "lobby.expansionDisabled"
  | "lobby.expansionEnabled"
  | "lobby.expansionOff"
  | "seat.label"
  | "seat.bot"
  | "seat.connected"
  | "seat.disconnected"
  | "seat.host"
  | "seat.you"
  | "spectator.mode"
  | "spectator.list"
  | "table.serverLog"
  | "table.clientLog"
  | "table.leaveMatch"
  | "table.cardReference"
  | "table.reportBug"
  | "table.seatFx"
  | "table.currentTurn"
  | "table.thinking"
  | "table.player"
  | "table.kickPlayer"
  | "table.noPlayableDiscard"
  | "table.discard"
  | "seatFx.title"
  | "seatFx.body"
  | "seatFx.clearSeat"
  | "seatFx.clearAll"
  | "seatFx.effect.frozen"
  | "seatFx.effect.burning"
  | "seatFx.effect.poisoned"
  | "seatFx.effect.radiant"
  | "seatFx.effect.cursed"
  | "stat.power"
  | "stat.hp"
  | "response.resist"
  | "response.annulation"
  | "response.resistance_accrue"
  | "response.pass"
  | "response.mirror"
  | "response.waiting"
  | "defense.resist"
  | "defense.notAvailable"
  | "defense.yes"
  | "defense.no"
  | "defense.cancel"
  | "defense.mirror"
  | "defense.ra"
  | "card.readFace"
  | "objectChoice.removeTitle"
  | "objectChoice.stealTitle"
  | "objectChoice.discardRingTitle"
  | "objectChoice.chooserWaiting"
  | "objectChoice.waitingBody"
  | "telepathy.inProgress"
  | "telepathy.viewerTitle"
  | "telepathy.viewerBody"
  | "telepathy.waitingBody"
  | "telepathy.blocked"
  | "telepathy.empty"
  | "telepathy.close"
  | "sousGrades.title"
  | "sousGrades.body"
  | "sousGrades.empty"
  | "sousGrades.remaining"
  | "sousGrades.done"
  | "sousGrades.ready"
  | "reference.title"
  | "reference.body"
  | "reference.close"
  | "reference.searchLabel"
  | "reference.searchPlaceholder"
  | "reference.decksLabel"
  | "reference.deckBase"
  | "reference.deckAbondance"
  | "reference.deckPuissance"
  | "reference.empty"
  | "bugReport.title"
  | "bugReport.body"
  | "bugReport.descriptionLabel"
  | "bugReport.placeholder"
  | "bugReport.session"
  | "bugReport.send"
  | "bugReport.sending"
  | "bugReport.cancel"
  | "bugInbox.title"
  | "bugInbox.subtitle"
  | "bugInbox.filterLabel"
  | "bugInbox.filterAll"
  | "bugInbox.refresh"
  | "bugInbox.empty"
  | "bugInbox.loadingList"
  | "bugInbox.loadingDetail"
  | "bugInbox.noSelection"
  | "bugInbox.open"
  | "bugInbox.fixed"
  | "bugInbox.ignored"
  | "bugInbox.reportedBy"
  | "bugInbox.session"
  | "bugInbox.createdAt"
  | "bugInbox.updatedAt"
  | "bugInbox.turn"
  | "bugInbox.currentTurn"
  | "bugInbox.logs"
  | "bugInbox.description"
  | "bugInbox.copyPrompt"
  | "bugInbox.markOpen"
  | "bugInbox.markFixed"
  | "bugInbox.markIgnored"
  | "bugInbox.delete"
  | "bugInbox.deleting"
  | "bugInbox.deleteConfirm"
  | "boardReset.title"
  | "boardReset.inProgress"
  | "boardReset.body"
  | "boardReset.waitingBody"
  | "boardReset.keepAction"
  | "boardReset.blocked"
  | "boardReset.empty"
  | "deathSearch.title"
  | "deathSearch.inProgress"
  | "deathSearch.chooseCorpseBody"
  | "deathSearch.keepBody"
  | "deathSearch.waitingBody"
  | "deathSearch.keepAction"
  | "deathSearch.blocked"
  | "deathSearch.empty"
  | "deathSearch.corpseCardCount"
  | "deathSearch.sourceSelf"
  | "deathSearch.sourceCorpse"
  | "deathSearch.declineAction"
  | "deathSearch.selectedTray"
  | "pickpocket.title"
  | "pickpocket.inProgress"
  | "pickpocket.body"
  | "pickpocket.waitingBody"
  | "pickpocket.takeAction"
  | "pickpocket.blocked"
  | "pickpocket.empty"
  | "pickpocket.sourceHand"
  | "pickpocket.sourceObject"
  | "sacrifice.title"
  | "sacrifice.inProgress"
  | "sacrifice.body"
  | "sacrifice.waitingBody"
  | "sacrifice.label"
  | "sacrifice.hint"
  | "sacrifice.confirm"
  | "curse.accept"
  | "curse.pass"
  | "forced.followUp"
  | "forced.consume"
  | "forced.cursePrompt"
  | "victory.quitHint"
  | "consume.title"
  | "consume.body"
  | "consume.confirm"
  | "combat.rollResistance"
  | "combat.rollDamage"
  | "combat.rollCard"
  | "combat.response.pass"
  | "combat.response.resist"
  | "combat.response.resistance_accrue"
  | "combat.response.annulation"
  | "combat.response.ordre_demmerlaus"
  | "combat.response.mirror"
  | "combat.resistance.prepare"
  | "combat.resistance.failed"
  | "combat.resistance.failedCritical"
  | "combat.resistance.critical"
  | "combat.resistance.success"
  | "combat.attackIncoming"
  | "combat.tookDamage"
  | "combat.gainsHp"
  | "combat.actionPlayed"
  | "fallback.unknownPlayer"
  | "error.playCard"
  | "error.leaveMatch"
  | "error.sendMessage"
  | "error.addBot"
  | "error.closeInspection"
  | "error.closePublicHandReveal"
  | "error.keepCard"
  | "error.resolveDeathSearch"
  | "error.resolvePickpocket"
  | "error.sacrificeRange"
  | "error.chooseSacrifice"
  | "error.kickPlayer"
  | "error.discardCard"
  | "error.startMatch"
  | "error.passFollowUp"
  | "error.resolveCurse"
  | "error.drawCard"
  | "error.submitBugReport"
  | "error.copyBugPrompt"
  | "error.deleteBugReport"
  | "error.passResponse"
  | "error.selectObject"
  | "error.updateExpansion"
  | "left.replacedByBot"
  | "table.deck"
  | "table.discardPile"
  | "table.resolving"
  | "table.dropDefense"
  | "table.draw"
  | "table.hintPlaySlot"
  | "table.hintTargetSeat"
  | "stat.powerShort";

type TranslationTable = Record<TranslationKey, string>;

const translations: Record<AppLanguage, TranslationTable> = {
  en: {
    "language.french": "French",
    "language.english": "English",
    "language.switch": "Language switch",
    "common.cancel": "Cancel",
    "annulationChoice.title": "Use Annulation",
    "annulationChoice.body": "This attack still needs {neededCount} Annulation card(s). You currently have {maxCount}. How many do you want to commit?",
    "annulationChoice.playOne": "Play 1",
    "annulationChoice.playTwo": "Play 2",
    "loading.match": "Loading match...",
    "left.title": "You left the match",
    "leave.confirm.title": "Are you sure?",
    "leave.confirm.body": "Leaving the match will replace your seat with a bot.",
    "leave.confirm.action": "Leave Match",
    "kick.confirm.title": "Kick player?",
    "kick.confirm.body": "{playerName} will be replaced by a bot.",
    "discard.confirm.title": "Discard this card?",
    "discard.confirm.body": "This will discard the card without using its effect.",
    "eventLog.title": "Event Log",
    "eventLog.history": "Full history",
    "eventLog.empty": "No events yet.",
    "eventLog.expand": "Expand",
    "eventLog.minimize": "Minimize",
    "replayDebug.title": "Replay Debug",
    "replayDebug.speed": "Speed",
    "replayDebug.playing": "Playing",
    "replayDebug.paused": "Paused",
    "replayDebug.pause": "Pause",
    "replayDebug.resume": "Resume",
    "replayDebug.rewind": "Rewind",
    "replayDebug.slow": "Slow",
    "replayDebug.normal": "Normal",
    "lobby.activity": "Emerlaus Activity",
    "lobby.title": "Card Table Lobby",
    "lobby.copy": "Seats are fixed in match order. Your screen will always rotate the table so your own hand stays at the bottom.",
    "lobby.discord": "Discord Activity",
    "lobby.browser": "Browser Mock Mode",
    "lobby.instance": "Instance {instanceId}",
    "lobby.channel": "Channel {channelId}",
    "lobby.guild": "Guild {guildId}",
    "lobby.seatsFilled": "{filled}/{max} seats filled",
    "lobby.localPlayer": "Local Player",
    "lobby.host": "Host",
    "lobby.unassigned": "Unassigned",
    "lobby.hostControl": "You control setup actions.",
    "lobby.hostWaiting": "Waiting for host actions.",
    "lobby.refresh": "Refresh",
    "lobby.addBot": "Add Bot",
    "lobby.startMatch": "Start Match",
    "lobby.openSeat": "Open Seat",
    "lobby.seatAvailable": "Available for a player or a bot.",
    "lobby.expansions": "Expansion Decks",
    "lobby.expansionsHint": "The host can toggle Abondance here. The other expansion decks remain disabled for now.",
    "lobby.expansionDisabled": "Disabled",
    "lobby.expansionEnabled": "Enabled",
    "lobby.expansionOff": "Off",
    "seat.label": "Seat {seatNumber}",
    "seat.bot": "Bot • {difficulty}",
    "seat.connected": "Connected",
    "seat.disconnected": "Disconnected",
    "seat.host": "Host",
    "seat.you": "You",
    "spectator.mode": "Spectator Mode",
    "spectator.list": "Spectators",
    "table.serverLog": "Server Log",
    "table.clientLog": "Client Log",
    "table.leaveMatch": "Leave Match",
    "table.cardReference": "Card Guide",
    "table.reportBug": "Report Bug",
    "table.seatFx": "Seat FX",
    "table.currentTurn": "Current turn",
    "table.thinking": "Thinking",
    "table.player": "Player",
    "table.kickPlayer": "Kick Player",
    "table.noPlayableDiscard": "You cannot play any card this turn. Choose one card to discard.",
    "table.discard": "Discard",
    "seatFx.title": "Seat FX Preview",
    "seatFx.body": "Host-only visual previews. These overlays stay local to your client and do not change game or server logic.",
    "seatFx.clearSeat": "Clear seat",
    "seatFx.clearAll": "Clear all",
    "seatFx.effect.frozen": "Frozen",
    "seatFx.effect.burning": "Burning",
    "seatFx.effect.poisoned": "Poisoned",
    "seatFx.effect.radiant": "Radiant",
    "seatFx.effect.cursed": "Cursed",
    "stat.power": "Power",
    "stat.powerShort": "PWR",
    "stat.hp": "HP",
    "table.deck": "Deck",
    "table.discardPile": "Discard",
    "table.resolving": "Resolving...",
    "table.dropDefense": "Drop defense card here",
    "table.draw": "Draw",
    "table.hintPlaySlot": "Drag a card here to play it",
    "table.hintTargetSeat": "Drag over a target to attack",
    "response.resist": "Resist",
    "response.annulation": "Annulation",
    "response.resistance_accrue": "Resistance Accrue",
    "response.pass": "Pass",
    "response.mirror": "Mirror",
    "response.waiting": "Waiting",
    "defense.resist": "Resist",
    "defense.notAvailable": "No",
    "defense.yes": "Yes",
    "defense.no": "No",
    "defense.cancel": "Cancel",
    "defense.mirror": "Mirror",
    "defense.ra": "RA",
    "card.readFace": "Read the full card text on the card face.",
    "objectChoice.removeTitle": "Choose an object to remove",
    "objectChoice.stealTitle": "Choose an object to steal",
    "objectChoice.discardRingTitle": "Choose a ring to discard",
    "objectChoice.chooserWaiting": "{chooserName} is choosing an object",
    "objectChoice.waitingBody": "Waiting for {chooserName} to choose one of {ownerName}'s objects.",
    "telepathy.inProgress": "Telepathy in progress",
    "telepathy.viewerTitle": "{targetName}'s hand",
    "telepathy.viewerBody": "Review the revealed hand, then close this window to continue the game.",
    "telepathy.waitingBody": "Waiting for {viewerName} to finish viewing {targetName}'s hand.",
    "telepathy.blocked": "No other actions can continue until the viewer closes this window.",
    "telepathy.empty": "This player has no cards in hand.",
    "telepathy.close": "Close",
    "sousGrades.title": "Sous-grades",
    "sousGrades.body": "All opponent hands are revealed to everyone for 30 seconds. Click Done when you are ready to continue.",
    "sousGrades.empty": "This opponent has no cards in hand.",
    "sousGrades.remaining": "{seconds}s remaining",
    "sousGrades.done": "Done",
    "sousGrades.ready": "Ready",
    "reference.title": "Card Reference",
    "reference.body": "Browse the full card catalog. Select a card on the left to read it clearly.",
    "reference.close": "Close",
    "reference.searchLabel": "Search by name",
    "reference.searchPlaceholder": "Type a card name",
    "reference.decksLabel": "Decks",
    "reference.deckBase": "Base",
    "reference.deckAbondance": "Abondance",
    "reference.deckPuissance": "Puissance",
    "reference.empty": "No cards match this search.",
    "bugReport.title": "Report A Bug",
    "bugReport.body": "Describe what happened. Session {shortId} will be attached automatically.",
    "bugReport.descriptionLabel": "Bug description",
    "bugReport.placeholder": "What did you expect, what happened instead, and which card or action caused it?",
    "bugReport.session": "Attached session: {shortId}",
    "bugReport.send": "Send",
    "bugReport.sending": "Sending...",
    "bugReport.cancel": "Cancel",
    "bugInbox.title": "Bug Reports",
    "bugInbox.subtitle": "Review saved player reports and update their status.",
    "bugInbox.filterLabel": "Filter",
    "bugInbox.filterAll": "All",
    "bugInbox.refresh": "Refresh",
    "bugInbox.empty": "No bug reports match the current filter.",
    "bugInbox.loadingList": "Loading bug reports...",
    "bugInbox.loadingDetail": "Loading report details...",
    "bugInbox.noSelection": "Select a report to inspect its details.",
    "bugInbox.open": "Open",
    "bugInbox.fixed": "Fixed",
    "bugInbox.ignored": "Ignored",
    "bugInbox.reportedBy": "Reported by",
    "bugInbox.session": "Session",
    "bugInbox.createdAt": "Created",
    "bugInbox.updatedAt": "Updated",
    "bugInbox.turn": "Turn",
    "bugInbox.currentTurn": "Current seat",
    "bugInbox.logs": "Logs",
    "bugInbox.description": "Description",
    "bugInbox.copyPrompt": "Copy Codex Prompt",
    "bugInbox.markOpen": "Mark Open",
    "bugInbox.markFixed": "Mark Fixed",
    "bugInbox.markIgnored": "Mark Ignored",
    "bugInbox.delete": "Delete Bug",
    "bugInbox.deleting": "Deleting...",
    "bugInbox.deleteConfirm": "Delete this bug report and its saved logs?",
    "boardReset.title": "Choose {count} card{plural} to keep",
    "boardReset.inProgress": "Intervention divine in progress",
    "boardReset.body": "Select the {selectionLabel} that {stayVerb} in your hand before the rest of the board is cleared and reshuffled.",
    "boardReset.waitingBody": "Waiting for {chooserName} to choose which card to keep.",
    "boardReset.keepAction": "Keep This Card",
    "boardReset.blocked": "No other actions can continue until the keeper card is chosen.",
    "boardReset.empty": "There are no cards left in hand to keep.",
    "deathSearch.title": "Search The Dead",
    "deathSearch.inProgress": "Death search in progress",
    "deathSearch.chooseCorpseBody": "Choose which corpse to search.",
    "deathSearch.keepBody": "Choose the {count} cards you will keep from your hand and {corpseName}'s cards.",
    "deathSearch.waitingBody": "Waiting for Death Search to be resolved.",
    "deathSearch.keepAction": "Keep Selected Cards",
    "deathSearch.blocked": "No other actions can continue until the death search is resolved.",
    "deathSearch.empty": "No cards are available to keep.",
    "deathSearch.corpseCardCount": "{count} cards available",
    "deathSearch.sourceSelf": "From {ownerName}'s hand",
    "deathSearch.sourceCorpse": "From {ownerName}'s corpse",
    "deathSearch.declineAction": "Keep for Later",
    "deathSearch.selectedTray": "Cards to keep ({count} of {total})",
    "pickpocket.title": "Pickpocket",
    "pickpocket.inProgress": "Pickpocket in progress",
    "pickpocket.body": "Choose the {count} card(s) to steal from {targetName}.",
    "pickpocket.waitingBody": "Waiting for {chooserName} to resolve Pickpocket.",
    "pickpocket.takeAction": "Take Selected Cards",
    "pickpocket.blocked": "No other actions can continue until the pickpocket is resolved.",
    "pickpocket.empty": "There are no cards available to steal.",
    "pickpocket.sourceHand": "From {ownerName}'s hand",
    "pickpocket.sourceObject": "From {ownerName}'s table",
    "sacrifice.title": "Choose Sacrifice Amount",
    "sacrifice.inProgress": "Sacrifice in progress",
    "sacrifice.body": "Enter how many HP to sacrifice. Choose a whole number from 0 to {maxAmount}.",
    "sacrifice.waitingBody": "Waiting for {playerName} to choose how many HP to sacrifice.",
    "sacrifice.label": "HP to sacrifice",
    "sacrifice.hint": "Maximum: {maxAmount} HP. You may reduce yourself to 0.",
    "sacrifice.confirm": "Confirm",
    "curse.accept": "Accept",
    "curse.pass": "Pass",
    "forced.followUp": "{actorName} must play {categories} on {targetName} for {cardName}.",
    "forced.consume": "Drag a {categories} card to the center to consume it for {cardName} (or pass).",
    "forced.cursePrompt": "{actorName} may discard {count} {releaseCardName} to remove {cardName}.",
    "victory.quitHint": "To quit the game, close the activity.",
    "consume.title": "Sacrifice a card",
    "consume.body": "Choose a {categories} card to sacrifice for {cardName}.",
    "consume.confirm": "Sacrifice",
    "combat.rollResistance": "{playerName} throws {notation} for resistance{bonus} (threshold {threshold})",
    "combat.rollDamage": "{actorName} throws {notation} for damage on {targetName}",
    "combat.rollCard": "{playerName} throws {notation} for the current action",
    "combat.response.pass": "{playerName} plays no defense card",
    "combat.response.resist": "{playerName} chooses to resist",
    "combat.response.resistance_accrue": "{playerName} plays Resistance Accrue",
    "combat.response.annulation": "{playerName} plays Annulation",
    "combat.response.ordre_demmerlaus": "{playerName} plays Ordre d'Emmerlaus and cancels {cardName}",
    "combat.response.mirror": "{playerName} reflects with Mirror!",
    "combat.resistance.prepare": "{playerName} prepares a resistance roll{bonus} (threshold {threshold})",
    "combat.resistance.failed": "{playerName} threw {total}, failed resistance",
    "combat.resistance.failedCritical": "{playerName} threw {total}, failed resistance critically (double damage!)",
    "combat.resistance.critical": "{playerName} threw 1, critical resistance! No damage!",
    "combat.resistance.success": "{playerName} threw {total}, spell resisted",
    "combat.attackIncoming": "{cardName} is about to hit {targetName}",
    "combat.tookDamage": "{playerName} took {amount} damage",
    "combat.gainsHp": "{playerName} gains {amount} HP",
    "combat.actionPlayed": "{playerName} plays {cardName}",
    "fallback.unknownPlayer": "Unknown player",
    "error.playCard": "Unable to play card",
    "error.leaveMatch": "Unable to leave match",
    "error.sendMessage": "Unable to send message",
    "error.addBot": "Unable to add bot",
    "error.closeInspection": "Unable to close hand inspection",
    "error.closePublicHandReveal": "Unable to close public hand reveal",
    "error.keepCard": "Unable to keep the selected card",
    "error.resolveDeathSearch": "Unable to resolve death search",
    "error.resolvePickpocket": "Unable to resolve pickpocket",
    "error.sacrificeRange": "Enter a whole number between 0 and {maxAmount}.",
    "error.chooseSacrifice": "Unable to choose sacrifice amount",
    "error.kickPlayer": "Unable to kick player",
    "error.discardCard": "Unable to discard card",
    "error.startMatch": "Unable to start match",
    "error.passFollowUp": "Unable to pass forced follow-up",
    "error.resolveCurse": "Unable to resolve curse release",
    "error.drawCard": "Failed to draw card",
    "error.submitBugReport": "Please describe the bug before sending it.",
    "error.copyBugPrompt": "Unable to copy the Codex prompt.",
    "error.deleteBugReport": "Unable to delete bug report",
    "error.passResponse": "Unable to pass",
    "error.selectObject": "Unable to select object",
    "error.updateExpansion": "Unable to update expansion",
    "left.replacedByBot": "Your seat was replaced by a bot. Start a new Activity session to enter a new lobby."
  },
  fr: {
    "language.switch": "Choix de langue",
    "language.french": "Français",
    "language.english": "Anglais",
    "common.cancel": "Annuler",
    "annulationChoice.title": "Jouer Annulation",
    "annulationChoice.body": "Cette attaque a encore besoin de {neededCount} carte(s) Annulation. Vous en avez {maxCount}. Combien voulez-vous engager ?",
    "annulationChoice.playOne": "Jouer 1",
    "annulationChoice.playTwo": "Jouer 2",
    "loading.match": "Chargement de la partie...",
    "left.title": "Vous avez quitté la partie",
    "leave.confirm.title": "Êtes-vous certain?",
    "leave.confirm.body": "Quitter la partie remplacera votre siège par un bot.",
    "leave.confirm.action": "Quitter la partie",
    "kick.confirm.title": "Expulser le joueur?",
    "kick.confirm.body": "{playerName} sera remplacé par un bot.",
    "discard.confirm.title": "Défausser cette carte?",
    "discard.confirm.body": "Cette action défaussera la carte sans utiliser son effet.",
    "eventLog.title": "Journal",
    "replayDebug.title": "Replay debug",
    "replayDebug.speed": "Vitesse",
    "replayDebug.playing": "Lecture",
    "replayDebug.paused": "Pause",
    "replayDebug.pause": "Pause",
    "replayDebug.resume": "Reprendre",
    "replayDebug.rewind": "Revenir",
    "replayDebug.slow": "Ralenti",
    "replayDebug.normal": "Normal",
    "eventLog.history": "Historique complet",
    "eventLog.empty": "Aucun événement.",
    "eventLog.expand": "Agrandir",
    "eventLog.minimize": "Réduire",
    "lobby.activity": "Activité Emerlaus",
    "lobby.title": "Salon de la table de cartes",
    "lobby.copy": "Les sièges sont fixes dans l'ordre de la partie. Votre écran fera toujours pivoter la table pour garder votre main en bas.",
    "lobby.discord": "Activité Discord",
    "lobby.browser": "Mode navigateur",
    "lobby.instance": "Instance {instanceId}",
    "lobby.channel": "Salon {channelId}",
    "lobby.guild": "Serveur {guildId}",
    "lobby.seatsFilled": "{filled}/{max} sièges occupés",
    "lobby.localPlayer": "Joueur local",
    "lobby.host": "Hôte",
    "lobby.unassigned": "Non attribué",
    "lobby.hostControl": "Vous contrôlez les actions de mise en place.",
    "lobby.hostWaiting": "En attente des actions de l'hôte.",
    "lobby.refresh": "Actualiser",
    "lobby.addBot": "Ajouter un bot",
    "lobby.startMatch": "Démarrer la partie",
    "lobby.openSeat": "Siège libre",
    "lobby.seatAvailable": "Disponible pour un joueur ou un bot.",
    "lobby.expansions": "Extensions",
    "lobby.expansionsHint": "L'hote peut activer Abondance ici. Les autres extensions restent desactivees pour le moment.",
    "lobby.expansionDisabled": "Desactivee",
    "lobby.expansionEnabled": "Activee",
    "lobby.expansionOff": "Inactive",
    "seat.label": "Siège {seatNumber}",
    "seat.bot": "Bot • {difficulty}",
    "seat.connected": "Connecté",
    "seat.disconnected": "Déconnecté",
    "seat.host": "Hôte",
    "table.serverLog": "Journal serveur",
    "seat.you": "Vous",
    "spectator.mode": "Mode spectateur",
    "spectator.list": "Spectateurs",
    "table.clientLog": "Journal client",
    "table.leaveMatch": "Quitter la partie",
    "table.cardReference": "Guide des cartes",
    "table.reportBug": "Signaler un bug",
    "table.seatFx": "Effets siege",
    "table.currentTurn": "Tour actuel",
    "table.thinking": "Réfléchit",
    "table.player": "Joueur",
    "table.kickPlayer": "Expulser le joueur",
    "table.noPlayableDiscard": "Vous ne pouvez jouer aucune carte ce tour-ci. Choisissez une carte à défausser.",
    "table.discard": "Défausser",
    "seatFx.title": "Previsualisation des effets de siege",
    "seatFx.body": "Previsualisations visuelles reservees a l'hote. Ces effets restent locaux a votre client et ne changent ni la logique de jeu ni celle du serveur.",
    "seatFx.clearSeat": "Effacer le siege",
    "seatFx.clearAll": "Tout effacer",
    "seatFx.effect.frozen": "Gele",
    "seatFx.effect.burning": "En feu",
    "seatFx.effect.poisoned": "Empoisonne",
    "seatFx.effect.radiant": "Radieux",
    "seatFx.effect.cursed": "Maudit",
    "stat.power": "Puissance",
    "stat.powerShort": "PUI",
    "stat.hp": "PV",
    "table.deck": "Deck",
    "table.discardPile": "Défausse",
    "table.resolving": "Résolution...",
    "table.dropDefense": "Glissez une défense ici",
    "table.draw": "Piger",
    "table.hintPlaySlot": "Glissez une carte ici pour la jouer",
    "table.hintTargetSeat": "Glissez sur une cible pour attaquer",
    "response.resist": "Résistance",
    "response.annulation": "Annulation",
    "response.resistance_accrue": "Résistance accrue",
    "response.pass": "Passer",
    "response.mirror": "Miroir",
    "response.waiting": "En attente",
    "defense.resist": "Résist.",
    "defense.notAvailable": "Non",
    "defense.yes": "Oui",
    "defense.no": "Non",
    "defense.cancel": "Annul.",
    "defense.mirror": "Miroir",
    "defense.ra": "RA",
    "card.readFace": "Lisez le texte complet sur la face de la carte.",
    "objectChoice.removeTitle": "Choisissez un objet à retirer",
    "objectChoice.stealTitle": "Choisissez un objet à voler",
    "objectChoice.discardRingTitle": "Choisissez un anneau à défausser",
    "objectChoice.chooserWaiting": "{chooserName} choisit un objet",
    "objectChoice.waitingBody": "En attente que {chooserName} choisisse un des objets de {ownerName}.",
    "telepathy.inProgress": "Télépathie en cours",
    "telepathy.viewerTitle": "Main de {targetName}",
    "telepathy.viewerBody": "Examinez la main révélée, puis fermez cette fenêtre pour continuer la partie.",
    "telepathy.waitingBody": "En attente que {viewerName} termine l'inspection de la main de {targetName}.",
    "telepathy.blocked": "Aucune autre action ne peut continuer tant que cette fenêtre n'est pas fermée.",
    "telepathy.empty": "Ce joueur n'a aucune carte en main.",
    "telepathy.close": "Fermer",
    "sousGrades.title": "Sous-grades",
    "sousGrades.body": "Toutes les mains adverses sont revelees a tout le monde pendant 30 secondes. Cliquez sur Termine quand vous etes pret a continuer.",
    "sousGrades.empty": "Cet adversaire n'a aucune carte en main.",
    "sousGrades.remaining": "{seconds}s restantes",
    "sousGrades.done": "Termine",
    "sousGrades.ready": "Pret",
    "reference.title": "Reference des cartes",
    "reference.body": "Parcourez tout le catalogue. Selectionnez une carte a gauche pour la lire clairement.",
    "reference.close": "Fermer",
    "reference.searchLabel": "Rechercher par nom",
    "reference.searchPlaceholder": "Ecrire un nom de carte",
    "reference.decksLabel": "Paquets",
    "reference.deckBase": "Base",
    "reference.deckAbondance": "Abondance",
    "reference.deckPuissance": "Puissance",
    "reference.empty": "Aucune carte ne correspond a cette recherche.",
    "bugReport.title": "Signaler un bug",
    "bugReport.body": "Decrivez ce qui s'est passe. La session {shortId} sera jointe automatiquement.",
    "bugReport.descriptionLabel": "Description du bug",
    "bugReport.placeholder": "Qu'attendiez-vous, qu'est-ce qui s'est produit a la place, et quelle carte ou action a cause le probleme ?",
    "bugReport.session": "Session jointe : {shortId}",
    "bugReport.send": "Envoyer",
    "bugReport.sending": "Envoi...",
    "bugReport.cancel": "Annuler",
    "bugInbox.title": "Signalements de bugs",
    "bugInbox.subtitle": "Consultez les signalements joueurs et mettez leur statut a jour.",
    "bugInbox.filterLabel": "Filtre",
    "bugInbox.filterAll": "Tous",
    "bugInbox.refresh": "Actualiser",
    "bugInbox.empty": "Aucun signalement ne correspond au filtre actuel.",
    "bugInbox.loadingList": "Chargement des signalements...",
    "bugInbox.loadingDetail": "Chargement du detail...",
    "bugInbox.noSelection": "Selectionnez un signalement pour consulter ses details.",
    "bugInbox.open": "Ouvert",
    "bugInbox.fixed": "Corrige",
    "bugInbox.ignored": "Ignore",
    "bugInbox.reportedBy": "Signale par",
    "bugInbox.session": "Session",
    "bugInbox.createdAt": "Cree",
    "bugInbox.updatedAt": "Mis a jour",
    "bugInbox.turn": "Tour",
    "bugInbox.currentTurn": "Siege actuel",
    "bugInbox.logs": "Logs",
    "bugInbox.description": "Description",
    "bugInbox.copyPrompt": "Copier le prompt Codex",
    "bugInbox.markOpen": "Remettre ouvert",
    "bugInbox.markFixed": "Marquer corrige",
    "bugInbox.markIgnored": "Marquer ignore",
    "bugInbox.delete": "Supprimer",
    "bugInbox.deleting": "Suppression...",
    "bugInbox.deleteConfirm": "Supprimer ce signalement et ses logs sauvegardes ?",
    "boardReset.title": "Choisissez {count} carte{plural} à garder",
    "boardReset.inProgress": "Intervention divine en cours",
    "boardReset.body": "Sélectionnez {selectionLabel} qui {stayVerb} dans votre main avant que le reste du plateau soit vidé et brassé à nouveau.",
    "boardReset.waitingBody": "En attente que {chooserName} choisisse la carte à garder.",
    "boardReset.keepAction": "Garder cette carte",
    "boardReset.blocked": "Aucune autre action ne peut continuer tant que la carte à garder n'est pas choisie.",
    "boardReset.empty": "Il ne reste aucune carte en main à garder.",
    "deathSearch.title": "Fouille de mort",
    "deathSearch.inProgress": "Fouille de mort en cours",
    "deathSearch.chooseCorpseBody": "Choisissez quel cadavre fouiller.",
    "deathSearch.keepBody": "Choisissez les {count} cartes à garder parmi votre main et les cartes de {corpseName}.",
    "deathSearch.waitingBody": "En attente que Fouille de mort soit résolue.",
    "deathSearch.keepAction": "Garder les cartes sélectionnées",
    "deathSearch.blocked": "Aucune autre action ne peut continuer tant que la fouille n'est pas résolue.",
    "deathSearch.empty": "Aucune carte n'est disponible à garder.",
    "deathSearch.corpseCardCount": "{count} cartes disponibles",
    "deathSearch.sourceSelf": "Depuis la main de {ownerName}",
    "deathSearch.sourceCorpse": "Depuis le cadavre de {ownerName}",
    "deathSearch.declineAction": "Garder pour plus tard",
    "deathSearch.selectedTray": "Cartes à garder ({count} sur {total})",
    "pickpocket.title": "Pickpocket",
    "pickpocket.inProgress": "Pickpocket en cours",
    "pickpocket.body": "Choisissez les {count} carte(s) à voler à {targetName}.",
    "pickpocket.waitingBody": "En attente que {chooserName} résolve Pickpocket.",
    "pickpocket.takeAction": "Prendre les cartes sélectionnées",
    "pickpocket.blocked": "Aucune autre action ne peut continuer tant que le pickpocket n'est pas résolu.",
    "pickpocket.empty": "Aucune carte n'est disponible à voler.",
    "pickpocket.sourceHand": "Depuis la main de {ownerName}",
    "pickpocket.sourceObject": "Depuis la table de {ownerName}",
    "sacrifice.title": "Choisir le sacrifice",
    "sacrifice.inProgress": "Sacrifice en cours",
    "sacrifice.body": "Entrez combien de PV sacrifier. Choisissez un nombre entier de 0 à {maxAmount}.",
    "sacrifice.waitingBody": "En attente que {playerName} choisisse combien de PV sacrifier.",
    "sacrifice.label": "PV à sacrifier",
    "sacrifice.hint": "Maximum : {maxAmount} PV. Vous pouvez vous réduire à 0.",
    "sacrifice.confirm": "Confirmer",
    "curse.accept": "Accepter",
    "curse.pass": "Passer",
    "forced.followUp": "{actorName} doit jouer {categories} sur {targetName} à cause de {cardName}.",
    "forced.consume": "Glisser une carte {categories} au centre pour la consommer pour {cardName} (ou passer).",
    "forced.cursePrompt": "{actorName} peut défausser {count} {releaseCardName} pour retirer {cardName}.",
    "victory.quitHint": "Pour quitter la partie, fermez l'activit\u00E9.",
    "consume.title": "Sacrifier une carte",
    "consume.body": "Choisissez une carte {categories} à sacrifier pour {cardName}.",
    "consume.confirm": "Sacrifier",
    "combat.rollResistance": "{playerName} lance {notation} pour la résistance{bonus} (seuil {threshold})",
    "combat.rollDamage": "{actorName} lance {notation} pour infliger des dégâts à {targetName}",
    "combat.rollCard": "{playerName} lance {notation} pour l'action en cours",
    "combat.response.pass": "{playerName} ne joue pas de carte de defense",
    "combat.response.resist": "{playerName} choisit de résister",
    "combat.response.resistance_accrue": "{playerName} joue Résistance accrue",
    "combat.response.annulation": "{playerName} joue Annulation",
    "combat.response.ordre_demmerlaus": "{playerName} joue Ordre d'Emmerlaus et annule {cardName}",
    "combat.response.mirror": "{playerName} reflète avec Miroir!",
    "combat.resistance.prepare": "{playerName} prépare un jet de résistance{bonus} (seuil {threshold})",
    "combat.resistance.failed": "{playerName} a lancé {total} et a raté sa résistance",
    "combat.resistance.failedCritical": "{playerName} a lancé {total} et a raté sa résistance de façon critique (dégâts doublés!)",
    "combat.resistance.critical": "{playerName} a lancé 1, résistance critique! Aucun dégât!",
    "combat.resistance.success": "{playerName} a lancé {total}, sort résisté",
    "combat.attackIncoming": "{cardName} va frapper {targetName}",
    "combat.tookDamage": "{playerName} subit {amount} dégâts",
    "combat.gainsHp": "{playerName} gagne {amount} PV",
    "combat.actionPlayed": "{playerName} joue {cardName}",
    "fallback.unknownPlayer": "Joueur inconnu",
    "error.playCard": "Impossible de jouer la carte",
    "error.leaveMatch": "Impossible de quitter la partie",
    "error.sendMessage": "Impossible d'envoyer le message",
    "error.addBot": "Impossible d'ajouter un bot",
    "error.closeInspection": "Impossible de fermer l'inspection de la main",
    "error.closePublicHandReveal": "Impossible de fermer la revelation publique des mains",
    "error.keepCard": "Impossible de garder la carte sélectionnée",
    "error.resolveDeathSearch": "Impossible de résoudre Fouille de mort",
    "error.resolvePickpocket": "Impossible de résoudre Pickpocket",
    "error.sacrificeRange": "Entrez un nombre entier entre 0 et {maxAmount}.",
    "error.chooseSacrifice": "Impossible de choisir le montant du sacrifice",
    "error.kickPlayer": "Impossible d'expulser le joueur",
    "error.discardCard": "Impossible de défausser la carte",
    "error.startMatch": "Impossible de démarrer la partie",
    "error.passFollowUp": "Impossible de passer la riposte forcée",
    "error.resolveCurse": "Impossible de résoudre la levée de malédiction",
    "error.drawCard": "Impossible de piger la carte",
    "error.submitBugReport": "Decrivez le bug avant de l'envoyer.",
    "error.copyBugPrompt": "Impossible de copier le prompt Codex.",
    "error.deleteBugReport": "Impossible de supprimer le signalement",
    "error.passResponse": "Impossible de passer",
    "error.selectObject": "Impossible de sélectionner l'objet",
    "left.replacedByBot": "Votre siège a été remplacé par un bot. Démarrez une nouvelle session d'activité pour entrer dans un nouveau salon."
    , "error.updateExpansion": "Impossible de modifier l'extension"
  }
};

const categoryLabels: Record<AppLanguage, Record<CardCategoryCode, string>> = {
  en: {
    AD: "Direct Attacks",
    AM: "Mass Attacks",
    A: "Allies",
    O: "Objects",
    E: "Emmerlaus",
    S: "Spells",
    CA: "Counterattacks",
    CO: "Counterspells",
    ST: "Status",
    SO: "Ongoing Spells"
  },
  fr: {
    AD: "Attaques directes",
    AM: "Attaques de masse",
    A: "Alliés",
    O: "Objets",
    E: "Emmerlaüs",
    S: "Sorts",
    CA: "Contre-attaques",
    CO: "Contresorts",
    ST: "Statuts",
    SO: "Sorts continus"
  }
};

function interpolate(template: string, variables?: Record<string, string | number>): string {
  if (variables == null) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

export function t(language: AppLanguage, key: TranslationKey, variables?: Record<string, string | number>): string {
  return interpolate(translations[language][key], variables);
}

export function loadStoredLanguage(): AppLanguage {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "fr" || stored === "en") {
    return stored;
  }

  return "fr";
}

export function persistLanguage(language: AppLanguage): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function getLocalizedCategoryLabel(categoryCode: CardCategoryCode, language: AppLanguage): string {
  return categoryLabels[language][categoryCode];
}

export function getLocalizedCardImageUrl(
  cardId: string,
  fallbackImageUrl: string,
  language: AppLanguage,
  variant: CardImageVariant = "full"
): string {
  const baseImageUrl = (() => {
    if (language === "fr") {
      return fallbackImageUrl;
    }

    const definition = baseCardDefinitionById[cardId];
    const sourcePath = definition?.image.localSourcePath ?? definition?.image.importedAssetPath ?? "";
    const filename = sourcePath.split(/[\\/]/).pop();
    if (filename == null || filename === "") {
      return fallbackImageUrl;
    }

    return `/assets/cards/base-en/${filename}`;
  })();

  return getCardImageVariantUrl(baseImageUrl, variant);
}

export { getCardImageVariantUrl, getImportedCardImageUrl };

export function localizeCardView(card: CardView, language: AppLanguage): CardView {
  const definition = baseCardDefinitionById[card.cardId];
  const localizedText = definition?.localization?.[language];
  return {
    ...card,
    name: localizedText?.name ?? card.name,
    description: localizedText?.description ?? card.description,
    imageUrl: getLocalizedCardImageUrl(card.cardId, card.imageUrl, language),
    categoryLabel: getLocalizedCategoryLabel(card.categoryCode, language),
    disabledReason: localizeCardDisabledReason(card.disabledReason, language)
  };
}

export function localizeSeatState(seat: SeatState, language: AppLanguage): SeatState {
  return {
    ...seat,
    hand: seat.hand?.map((card) => localizeCardView(card, language)),
    objects: seat.objects?.map((card) => localizeCardView(card, language)),
    statuses: seat.statuses?.map((card) => localizeCardView(card, language))
  };
}

export function localizeCardDisabledReason(reason: string | undefined, language: AppLanguage): string | undefined {
  if (reason == null || language === "en") {
    return reason;
  }

  const exactTranslations: Record<string, string> = {
    "Game not started": "La partie n'a pas commence.",
    "Resolve the current action first": "Resolvez d'abord l'action en cours.",
    "Wait for your turn": "Attendez votre tour.",
    "Dead players cannot act": "Les joueurs morts ne peuvent pas agir.",
    "This card triggers automatically when an opponent dies": "Cette carte se declenche automatiquement quand un adversaire meurt.",
    "Only A, AD, and AM cards can be actively played this turn": "Seules les cartes A, AD et AM peuvent etre jouees activement ce tour-ci.",
    "Waiting for the forced follow-up": "En attente de la riposte forcee.",
    "Colère du magicien requires an AD card": "Colere du magicien exige une carte AD.",
    "This forced follow-up must target the paralyzed opponent": "Cette riposte forcee doit viser l'adversaire paralyse.",
    "Counter cards are only used as reactions": "Les cartes de contre ne peuvent etre utilisees qu'en reaction.",
    "This card requires another card in hand": "Cette carte exige une autre carte en main.",
    "This card requires a follow-up card that allows resistance": "Cette carte exige une carte de suivi qui permet une resistance.",
    "No valid opponent target": "Aucune cible adverse valide.",
    "The target opponent must have at least one object on the table": "L'adversaire cible doit avoir au moins un objet sur la table.",
    "No valid target": "Aucune cible valide.",
    "No left opponent available": "Aucun adversaire a gauche n'est disponible.",
    "The left opponent is protected right now": "L'adversaire de gauche est protege pour le moment.",
    "No target object available": "Aucun objet cible n'est disponible.",
    "Unsupported target mode": "Mode de ciblage non pris en charge.",
    "Choose the pending object first": "Choisissez d'abord l'objet en attente.",
    "Choose the card to keep first": "Choisissez d'abord la carte a garder.",
    "Resolve the death search first": "Resolvez d'abord la Fouille de mort.",
    "Choose the sacrifice amount first": "Choisissez d'abord le montant du sacrifice.",
    "Waiting for the current action to resolve": "En attente de la resolution de l'action en cours.",
    "Annulation is not legal for this action": "Annulation n'est pas autorisee pour cette action.",
    "Resistance accrue is not legal for this action": "Resistance accrue n'est pas autorisee pour cette action.",
    "Mirror is not legal for this action": "Miroir n'est pas autorise pour cette action.",
    "Only response cards can be used right now": "Seules les cartes de reponse peuvent etre utilisees maintenant."
  };

  if (exactTranslations[reason] != null) {
    return exactTranslations[reason];
  }

  let match = reason.match(/^Only (.+) cards can be actively played for (.+)$/);
  if (match != null) {
    return `Seules les cartes ${match[1]} peuvent etre jouees activement pour ${localizeCardNameForUi(match[2], language)}.`;
  }

  match = reason.match(/^This card requires a (.+) card in hand$/);
  if (match != null) {
    return `Cette carte exige une carte ${match[1]} en main.`;
  }

  return reason;
}

function localizePlayedCardState(playedCard: PlayedCardState | undefined, language: AppLanguage): PlayedCardState | undefined {
  if (playedCard == null) {
    return undefined;
  }

  return {
    ...playedCard,
    card: localizeCardView(playedCard.card, language)
  };
}

function localizeDealerMessage(content: string, language: AppLanguage): string {
  const localizeCardName = (cardName: string): string => {
    if (language === "fr") {
      return cardName;
    }

    const definition = Object.values(baseCardDefinitionById).find((card) => card.name === cardName);
    return definition?.localization?.en.name ?? cardName;
  };

  const patterns: Array<[(content: string) => RegExpMatchArray | null, (match: RegExpMatchArray) => string]> = [
    [/^(.+) discarded (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} défausse ${localizeCardName(match[2])}.`
      : `${match[1]} discarded ${localizeCardName(match[2])}.`],
    [/^(.+) played (.+) against everyone\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} contre tout le monde.`
      : `${match[1]} played ${localizeCardName(match[2])} against everyone.`],
    [/^(.+) played (.+) on (.+)'s object\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} sur l'objet de ${match[3]}.`
      : `${match[1]} played ${localizeCardName(match[2])} on ${match[3]}'s object.`],
    [/^(.+) played (.+) on (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} sur ${match[3]}.`
      : `${match[1]} played ${localizeCardName(match[2])} on ${match[3]}.`],
    [/^(.+) played (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])}.`
      : `${match[1]} played ${localizeCardName(match[2])}.`],
    [/^(.+) critically resisted (.+)!$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} résiste de façon critique à ${localizeCardName(match[2])} !`
      : `${match[1]} critically resisted ${localizeCardName(match[2])}!`],
    [/^(.+) resisted (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} résiste à ${localizeCardName(match[2])}.`
      : `${match[1]} resisted ${localizeCardName(match[2])}.`],
    [/^(.+) critically failed the resistance roll\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} échoue de façon critique à son jet de résistance.`
      : `${match[1]} critically failed the resistance roll.`],
    [/^(.+) canceled (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} annule ${localizeCardName(match[2])}.`
      : `${match[1]} canceled ${localizeCardName(match[2])}.`],
    [/^(.+) reflects (.+) back at (.+)!$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} renvoie ${localizeCardName(match[2])} vers ${match[3]} !`
      : `${match[1]} reflects ${localizeCardName(match[2])} back at ${match[3]}!`],
    [/^(.+) had no CA card and resisted automatically\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} n'avait pas de CA et a résisté automatiquement.`
      : `${match[1]} had no CA card and resisted automatically.`],
    [/^(.+) had no defense — passed automatically\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} n'avait aucune défense et passe automatiquement.`
      : `${match[1]} had no defense — passed automatically.`],
    [/^(.+) was restored by (.+)\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} est restauré par ${localizeCardName(match[2])}.`
      : `${match[1]} was restored by ${localizeCardName(match[2])}.`],
    [/^(.+) has fallen\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} tombe au combat.`
      : `${match[1]} has fallen.`],
    [/^(.+) is the last wizard standing\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} est le dernier magicien debout.`
      : `${match[1]} is the last wizard standing.`],
    [/^(.+) loses a turn\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} perd un tour.`
      : `${match[1]} loses a turn.`],
    [/^(.+) has no AD card for (.+) and passes\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${match[1]} n'a pas de carte AD pour ${localizeCardName(match[2])} et passe.`
      : `${match[1]} has no AD card for ${localizeCardName(match[2])} and passes.`],
    [/^(.+) was canceled before resolving\.$/.exec.bind(/^$/), (match) => language === "fr"
      ? `${localizeCardName(match[1])} est annulée avant sa résolution.`
      : `${localizeCardName(match[1])} was canceled before resolving.`],
    [/^Dealer reshuffled the discard pile into the deck\.$/.exec.bind(/^$/), () => language === "fr"
      ? "La défausse a été remélangée dans le paquet."
      : "The discard pile was reshuffled into the deck."]
  ];

  for (const [matcher, formatter] of patterns) {
    const match = matcher(content);
    if (match != null) {
      return formatter(match);
    }
  }

  return content;
}

export function localizeCardNameForUi(cardName: string, language: AppLanguage): string {
  if (language === "fr") {
    return cardName;
  }

  const definition = Object.values(baseCardDefinitionById).find((card) => card.name === cardName);
  return definition?.localization?.en.name ?? cardName;
}

export function localizeDealerMessageForUi(content: string, language: AppLanguage): string {
  const localizeCardName = (cardName: string): string => localizeCardNameForUi(cardName, language);

  const patterns: Array<{ regex: RegExp; format: (match: RegExpMatchArray) => string }> = [
    { regex: /^(.+) discarded (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} defausse ${localizeCardName(match[2])}.`
      : `${match[1]} discarded ${localizeCardName(match[2])}.` },
    { regex: /^(.+) played (.+) against everyone\.$/, format: (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} contre tout le monde.`
      : `${match[1]} played ${localizeCardName(match[2])} against everyone.` },
    { regex: /^(.+) played (.+) on (.+)'s object\.$/, format: (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} sur l'objet de ${match[3]}.`
      : `${match[1]} played ${localizeCardName(match[2])} on ${match[3]}'s object.` },
    { regex: /^(.+) played (.+) on (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])} sur ${match[3]}.`
      : `${match[1]} played ${localizeCardName(match[2])} on ${match[3]}.` },
    { regex: /^(.+) played (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} joue ${localizeCardName(match[2])}.`
      : `${match[1]} played ${localizeCardName(match[2])}.` },
    { regex: /^(.+) critically resisted (.+)!$/, format: (match) => language === "fr"
      ? `${match[1]} resiste de facon critique a ${localizeCardName(match[2])} !`
      : `${match[1]} critically resisted ${localizeCardName(match[2])}!` },
    { regex: /^(.+) resisted (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} resiste a ${localizeCardName(match[2])}.`
      : `${match[1]} resisted ${localizeCardName(match[2])}.` },
    { regex: /^(.+) critically failed the resistance roll\.$/, format: (match) => language === "fr"
      ? `${match[1]} echoue de facon critique a son jet de resistance.`
      : `${match[1]} critically failed the resistance roll.` },
    { regex: /^(.+) canceled (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} annule l'attaque.`
      : `${match[1]} canceled the attack.` },
    { regex: /^(.+) reflects (.+) back at (.+)!$/, format: (match) => language === "fr"
      ? `${match[1]} renvoie ${localizeCardName(match[2])} vers ${match[3]} !`
      : `${match[1]} reflects ${localizeCardName(match[2])} back at ${match[3]}!` },
    { regex: /^(.+) had no CA card and resisted automatically\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'avait pas de CA et a resiste automatiquement.`
      : `${match[1]} had no CA card and resisted automatically.` },
    { regex: /^(.+) had no CA card and relied on normal resistance\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'avait pas de CA et s'en remet a sa resistance normale.`
      : `${match[1]} had no CA card and relied on normal resistance.` },
    { regex: /^(.+) had no defense .* passed automatically\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'avait aucune defense et passe automatiquement.`
      : `${match[1]} had no defense and passed automatically.` },
    { regex: /^(.+) was restored by (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} est restaure par ${localizeCardName(match[2])}.`
      : `${match[1]} was restored by ${localizeCardName(match[2])}.` },
    { regex: /^(.+) has fallen\.$/, format: (match) => language === "fr"
      ? `${match[1]} tombe au combat.`
      : `${match[1]} has fallen.` },
    { regex: /^(.+) is the last wizard standing\.$/, format: (match) => language === "fr"
      ? `${match[1]} est le dernier magicien debout.`
      : `${match[1]} is the last wizard standing.` },
    { regex: /^(.+) loses a turn\.$/, format: (match) => language === "fr"
      ? `${match[1]} perd un tour.`
      : `${match[1]} loses a turn.` },
    { regex: /^(.+) has no AD card for (.+) and passes\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'a pas de carte AD pour ${localizeCardName(match[2])} et passe.`
      : `${match[1]} has no AD card for ${localizeCardName(match[2])} and passes.` },
    { regex: /^(.+)'s (.+) uses the total power of all living players \((\d+)\)\.$/, format: (match) => language === "fr"
      ? `${match[1]} utilise ${localizeCardName(match[2])} avec la puissance totale de tous les joueurs vivants (${match[3]}).`
      : `${match[1]}'s ${localizeCardName(match[2])} uses the total power of all living players (${match[3]}).` },
    { regex: /^(.+)'s (.+) deals (\d+)x damage\.$/, format: (match) => language === "fr"
      ? `${match[1]} voit ${localizeCardName(match[2])} infliger ${match[3]}x les degats.`
      : `${match[1]}'s ${localizeCardName(match[2])} deals ${match[3]}x damage.` },
    { regex: /^(.+)'s Robe miroir reflects (\d+) damage back to (.+)\.$/, format: (match) => language === "fr"
      ? `La Robe miroir de ${match[1]} renvoie ${match[2]} degats a ${match[3]}.`
      : `${match[1]}'s Robe miroir reflects ${match[2]} damage back to ${match[3]}.` },
    { regex: /^(.+)'s (.+) hits (.+) for (\d+)\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[2])} de ${match[1]} frappe ${match[3]} pour ${match[4]}.`
      : `${match[1]}'s ${localizeCardName(match[2])} hits ${match[3]} for ${match[4]}.` },
    { regex: /^(.+) uses (.+) to steal (\d+) cards? from (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} utilise ${localizeCardName(match[2])} pour voler ${match[3]} carte(s) a ${match[4]}.`
      : `${match[1]} uses ${localizeCardName(match[2])} to steal ${match[3]} card(s) from ${match[4]}.` },
    { regex: /^(.+) stole (.+) from (.+) with (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} vole ${localizeCardName(match[2])} a ${match[3]} avec ${localizeCardName(match[4])}.`
      : `${match[1]} stole ${localizeCardName(match[2])} from ${match[3]} with ${localizeCardName(match[4])}.` },
    { regex: /^(.+) removed (.+) from (.+) with (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} retire ${localizeCardName(match[2])} a ${match[3]} avec ${localizeCardName(match[4])}.`
      : `${match[1]} removed ${localizeCardName(match[2])} from ${match[3]} with ${localizeCardName(match[4])}.` },
    { regex: /^(.+) discards (.+) to equip (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} defausse ${localizeCardName(match[2])} pour equiper ${localizeCardName(match[3])}.`
      : `${match[1]} discards ${localizeCardName(match[2])} to equip ${localizeCardName(match[3])}.` },
    { regex: /^(.+) discards their hand and redraws\.$/, format: (match) => language === "fr"
      ? `${match[1]} defausse sa main et repige.`
      : `${match[1]} discards their hand and redraws.` },
    { regex: /^(.+) triggers and kills (.+)!$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[1])} se declenche et tue ${match[2]} !`
      : `${localizeCardName(match[1])} triggers and kills ${match[2]}!` },
    { regex: /^(.+)'s (.+) failed to freeze (.+)\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[2])} de ${match[1]} echoue a geler ${match[3]}.`
      : `${match[1]}'s ${localizeCardName(match[2])} failed to freeze ${match[3]}.` },
    { regex: /^(.+) freezes (.+): they lose their next turn and cannot riposte for one full turn\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[1])} gele ${match[2]} : cette personne perd son prochain tour et ne peut pas riposter pendant un tour complet.`
      : `${localizeCardName(match[1])} freezes ${match[2]}: they lose their next turn and cannot riposte for one full turn.` },
    { regex: /^(.+)'s (.+) randomly chooses (.+)\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[2])} de ${match[1]} choisit ${match[3]} au hasard.`
      : `${match[1]}'s ${localizeCardName(match[2])} randomly chooses ${match[3]}.` },
    { regex: /^(.+) loses (\d+) HP from (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} perd ${match[2]} PV a cause de ${localizeCardName(match[3])}.`
      : `${match[1]} loses ${match[2]} HP from ${localizeCardName(match[3])}.` },
    { regex: /^(.+) is reduced to (\d+) HP by (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} est reduit a ${match[2]} PV par ${localizeCardName(match[3])}.`
      : `${match[1]} is reduced to ${match[2]} HP by ${localizeCardName(match[3])}.` },
    { regex: /^(.+) uses (.+): (\d+) HP is redistributed among (\d+) living players?\.$/, format: (match) => language === "fr"
      ? `${match[1]} utilise ${localizeCardName(match[2])} : ${match[3]} PV sont redistribues entre ${match[4]} joueurs vivants.`
      : `${match[1]} uses ${localizeCardName(match[2])}: ${match[3]} HP is redistributed among ${match[4]} living players.` },
    { regex: /^(.+)'s (.+) deals (\d+) to all affected opponents\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[2])} de ${match[1]} inflige ${match[3]} a tous les adversaires affectes.`
      : `${match[1]}'s ${localizeCardName(match[2])} deals ${match[3]} to all affected opponents.` },
    { regex: /^(.+)'s Abondance ends\.$/, format: (match) => language === "fr"
      ? `L'Abondance de ${match[1]} prend fin.`
      : `${match[1]}'s Abondance ends.` },
    { regex: /^(.+)'s (.+) ends\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[2])} de ${match[1]} prend fin.`
      : `${match[1]}'s ${localizeCardName(match[2])} ends.` },
    { regex: /^(.+) paralyzed (.+) with (.+) and may immediately play an AD card\.$/, format: (match) => language === "fr"
      ? `${match[1]} paralyse ${match[2]} avec ${localizeCardName(match[3])} et peut jouer immediatement une carte AD.`
      : `${match[1]} paralyzed ${match[2]} with ${localizeCardName(match[3])} and may immediately play an AD card.` },
    { regex: /^(.+) uses (.+) to search (.+) and keeps (\d+) cards\.$/, format: (match) => language === "fr"
      ? `${match[1]} utilise ${localizeCardName(match[2])} pour fouiller ${match[3]} et garde ${match[4]} cartes.`
      : `${match[1]} uses ${localizeCardName(match[2])} to search ${match[3]} and keeps ${match[4]} cards.` },
    { regex: /^(.+) discarded (\d+) (.+) to remove (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} a defausse ${match[2]} ${localizeCardName(match[3])} pour retirer ${localizeCardName(match[4])}.`
      : `${match[1]} discarded ${match[2]} ${localizeCardName(match[3])} to remove ${localizeCardName(match[4])}.` },
    { regex: /^(.+)'s repeated (.+) fizzles\.$/, format: (match) => language === "fr"
      ? `La repetition de ${localizeCardName(match[2])} de ${match[1]} echoue.`
      : `${match[1]}'s repeated ${localizeCardName(match[2])} fizzles.` },
    { regex: /^(.+) loaded (.+) onto (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} charge ${localizeCardName(match[2])} sur ${localizeCardName(match[3])}.`
      : `${match[1]} loaded ${localizeCardName(match[2])} onto ${localizeCardName(match[3])}.` },
    { regex: /^(.+) stops time and will immediately take a second turn\.$/, format: (match) => language === "fr"
      ? `${match[1]} arrete le temps et jouera immediatement un second tour.`
      : `${match[1]} stops time and will immediately take a second turn.` },
    { regex: /^(.+) takes an extra turn with (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} joue un tour supplementaire avec ${localizeCardName(match[2])}.`
      : `${match[1]} takes an extra turn with ${localizeCardName(match[2])}.` },
    { regex: /^(.+) reveals every opponent hand for 30 seconds with (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} revele la main de chaque adversaire pendant 30 secondes avec ${localizeCardName(match[2])}.`
      : `${match[1]} reveals every opponent hand for 30 seconds with ${localizeCardName(match[2])}.` },
    { regex: /^(.+) has no eligible card to reproduce with (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'a aucune carte eligible a reproduire avec ${localizeCardName(match[2])}.`
      : `${match[1]} has no eligible card to reproduce with ${localizeCardName(match[2])}.` },
    { regex: /^(.+) has no power ring left to sacrifice for (.+)\.$/, format: (match) => language === "fr"
      ? `${match[1]} n'a plus d'anneau de puissance a sacrifier pour ${localizeCardName(match[2])}.`
      : `${match[1]} has no power ring left to sacrifice for ${localizeCardName(match[2])}.` },
    { regex: /^(.+) was canceled before resolving\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[1])} est annulee avant sa resolution.`
      : `${localizeCardName(match[1])} was canceled before resolving.` },
    { regex: /^(.+) ends\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[1])} prend fin.`
      : `${localizeCardName(match[1])} ends.` },
    { regex: /^Dealer reshuffled the discard pile into the deck\.$/, format: () => language === "fr"
      ? "La defausse a ete remelangee dans le paquet."
      : "The discard pile was reshuffled into the deck." }
  ];

  for (const { regex, format } of patterns) {
    const match = content.match(regex);
    if (match != null) {
      return format(match);
    }
  }

  return content;
}

export function localizeMatchState(match: MatchState, language: AppLanguage): MatchState {
  const localizeCardName = (cardName: string): string => {
    if (language === "fr") {
      return cardName;
    }

    const definition = Object.values(baseCardDefinitionById).find((card) => card.name === cardName);
    return definition?.localization?.en.name ?? cardName;
  };

  return {
    ...match,
    seats: match.seats.map((seat) => localizeSeatState(seat, language)),
    game: match.game == null
      ? undefined
      : {
          ...match.game,
          discardTop: match.game.discardTop == null ? undefined : localizeCardView(match.game.discardTop, language),
          viergeReplayCard: match.game.viergeReplayCard == null ? undefined : localizeCardView(match.game.viergeReplayCard, language),
          lastPlayedCard: localizePlayedCardState(match.game.lastPlayedCard, language),
          pendingAction: match.game.pendingAction == null
            ? undefined
            : {
                ...match.game.pendingAction,
                card: localizeCardView(match.game.pendingAction.card, language),
                responders: match.game.pendingAction.responders.map((responder: PendingActionResponderState) => ({
                  ...responder,
                  card: responder.card == null ? undefined : localizeCardView(responder.card, language),
                  cards: responder.cards?.map((card) => localizeCardView(card, language))
                }))
              },
          pendingObjectChoice: match.game.pendingObjectChoice == null
            ? undefined
            : {
                ...match.game.pendingObjectChoice,
                cardName: localizeCardName(match.game.pendingObjectChoice.cardName),
                objectOptions: match.game.pendingObjectChoice.objectOptions.map((card) => localizeCardView(card, language))
              },
          pendingHandInspection: match.game.pendingHandInspection == null
            ? undefined
            : {
                ...match.game.pendingHandInspection,
                cardName: localizeCardName(match.game.pendingHandInspection.cardName)
              },
          pendingPublicHandReveal: match.game.pendingPublicHandReveal == null
            ? undefined
            : {
                ...match.game.pendingPublicHandReveal,
                cardName: localizeCardName(match.game.pendingPublicHandReveal.cardName)
              },
          pendingBoardResetKeep: match.game.pendingBoardResetKeep == null
            ? undefined
            : {
                ...match.game.pendingBoardResetKeep,
                cardName: localizeCardName(match.game.pendingBoardResetKeep.cardName),
                cardOptions: match.game.pendingBoardResetKeep.cardOptions.map((card) => localizeCardView(card, language))
              },
          pendingDeathSearch: match.game.pendingDeathSearch == null
            ? undefined
            : {
                ...match.game.pendingDeathSearch,
                cardName: localizeCardName(match.game.pendingDeathSearch.cardName),
                cardOptions: match.game.pendingDeathSearch.cardOptions.map((card) => ({
                  ...card,
                  ...localizeCardView(card, language)
                }))
              },
          pendingPickpocket: match.game.pendingPickpocket == null
            ? undefined
            : {
                ...match.game.pendingPickpocket,
                cardName: localizeCardName(match.game.pendingPickpocket.cardName),
                cardOptions: match.game.pendingPickpocket.cardOptions.map((card) => ({
                  ...card,
                  ...localizeCardView(card, language)
                }))
              },
          pendingSacrificeChoice: match.game.pendingSacrificeChoice == null
            ? undefined
            : {
                ...match.game.pendingSacrificeChoice,
                cardName: localizeCardName(match.game.pendingSacrificeChoice.cardName)
              },
          pendingCurseRelease: match.game.pendingCurseRelease == null
            ? undefined
            : {
                ...match.game.pendingCurseRelease,
                cardName: localizeCardName(match.game.pendingCurseRelease.cardName),
                releaseCardName: localizeCardName(match.game.pendingCurseRelease.releaseCardName)
              },
          forcedFollowUp: match.game.forcedFollowUp == null
            ? undefined
            : {
                ...match.game.forcedFollowUp,
                sourceCardName: localizeCardName(match.game.forcedFollowUp.sourceCardName)
              }
        }
  };
}

export function renderLanguageToggle(language: AppLanguage): string {
  return `
    <div class="language-toggle" aria-label="${t(language, "language.switch")}">
      <button
        type="button"
        class="language-toggle__button ${language === "fr" ? "language-toggle__button--active" : ""}"
        data-action="set-language"
        data-language="fr"
        title="${t(language, "language.french")}"
      >
        🇫🇷
      </button>
      <button
        type="button"
        class="language-toggle__button ${language === "en" ? "language-toggle__button--active" : ""}"
        data-action="set-language"
        data-language="en"
        title="${t(language, "language.english")}"
      >
        🇬🇧
      </button>
    </div>
  `;
}
