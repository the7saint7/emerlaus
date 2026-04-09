import { baseCardDefinitionById } from "../../shared/cards";
import type { CardCategoryCode } from "../../shared/cards";
import type {
  CardView,
  ChatMessage,
  MatchState,
  PendingActionResponderState,
  PlayedCardState,
  SeatState
} from "../../shared/types";

export type AppLanguage = "fr" | "en";

const LANGUAGE_STORAGE_KEY = "emerlaus.language";

type TranslationKey =
  | "language.french"
  | "language.english"
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
  | "chat.empty"
  | "chat.title"
  | "chat.history.expanded"
  | "chat.history.recent"
  | "chat.open"
  | "chat.close"
  | "chat.hide"
  | "chat.placeholder"
  | "chat.send"
  | "chat.dock"
  | "lobby.activity"
  | "lobby.title"
  | "lobby.copy"
  | "lobby.discord"
  | "lobby.browser"
  | "lobby.instance"
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
  | "seat.label"
  | "seat.bot"
  | "seat.connected"
  | "seat.disconnected"
  | "seat.host"
  | "table.serverLog"
  | "table.clientLog"
  | "table.leaveMatch"
  | "table.cardReference"
  | "table.currentTurn"
  | "table.thinking"
  | "table.player"
  | "table.kickPlayer"
  | "table.noPlayableDiscard"
  | "table.discard"
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
  | "objectChoice.chooserWaiting"
  | "objectChoice.waitingBody"
  | "telepathy.inProgress"
  | "telepathy.viewerTitle"
  | "telepathy.viewerBody"
  | "telepathy.waitingBody"
  | "telepathy.blocked"
  | "telepathy.empty"
  | "telepathy.close"
  | "reference.title"
  | "reference.body"
  | "reference.close"
  | "boardReset.title"
  | "boardReset.inProgress"
  | "boardReset.body"
  | "boardReset.waitingBody"
  | "boardReset.keepAction"
  | "boardReset.blocked"
  | "boardReset.empty"
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
  | "forced.cursePrompt"
  | "combat.rollResistance"
  | "combat.rollDamage"
  | "combat.rollCard"
  | "combat.response.pass"
  | "combat.response.resist"
  | "combat.response.resistance_accrue"
  | "combat.response.annulation"
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
  | "error.keepCard"
  | "error.sacrificeRange"
  | "error.chooseSacrifice"
  | "error.kickPlayer"
  | "error.discardCard"
  | "error.startMatch"
  | "error.passFollowUp"
  | "error.resolveCurse"
  | "error.drawCard"
  | "error.passResponse"
  | "error.selectObject"
  | "left.replacedByBot";

type TranslationTable = Record<TranslationKey, string>;

const translations: Record<AppLanguage, TranslationTable> = {
  en: {
    "language.french": "French",
    "language.english": "English",
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
    "chat.empty": "No events yet.",
    "chat.title": "Event Log",
    "chat.history.expanded": "Full history",
    "chat.history.recent": "Recent events",
    "chat.open": "Expand",
    "chat.close": "Close",
    "chat.hide": "Hide",
    "chat.placeholder": "Type here. Unicode emoji works too.",
    "chat.send": "Send",
    "chat.dock": "Chat",
    "lobby.activity": "Emerlaus Activity",
    "lobby.title": "Card Table Lobby",
    "lobby.copy": "Seats are fixed in match order. Your screen will always rotate the table so your own hand stays at the bottom.",
    "lobby.discord": "Discord Activity",
    "lobby.browser": "Browser Mock Mode",
    "lobby.instance": "Instance {instanceId}",
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
    "seat.label": "Seat {seatNumber}",
    "seat.bot": "Bot • {difficulty}",
    "seat.connected": "Connected",
    "seat.disconnected": "Disconnected",
    "seat.host": "Host",
    "table.serverLog": "Server Log",
    "table.clientLog": "Client Log",
    "table.leaveMatch": "Leave Match",
    "table.cardReference": "Card Guide",
    "table.currentTurn": "Current turn",
    "table.thinking": "Thinking",
    "table.player": "Player",
    "table.kickPlayer": "Kick Player",
    "table.noPlayableDiscard": "You cannot play any card this turn. Choose one card to discard.",
    "table.discard": "Discard",
    "stat.power": "Power",
    "stat.hp": "HP",
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
    "objectChoice.chooserWaiting": "{chooserName} is choosing an object",
    "objectChoice.waitingBody": "Waiting for {chooserName} to choose one of {ownerName}'s objects.",
    "telepathy.inProgress": "Telepathy in progress",
    "telepathy.viewerTitle": "{targetName}'s hand",
    "telepathy.viewerBody": "Review the revealed hand, then close this window to continue the game.",
    "telepathy.waitingBody": "Waiting for {viewerName} to finish viewing {targetName}'s hand.",
    "telepathy.blocked": "No other actions can continue until the viewer closes this window.",
    "telepathy.empty": "This player has no cards in hand.",
    "telepathy.close": "Close",
    "reference.title": "Card Reference",
    "reference.body": "Browse the full card catalog. Select a card on the left to read it clearly.",
    "reference.close": "Close",
    "boardReset.title": "Choose {count} card{plural} to keep",
    "boardReset.inProgress": "Intervention divine in progress",
    "boardReset.body": "Select the {selectionLabel} that {stayVerb} in your hand before the rest of the board is cleared and reshuffled.",
    "boardReset.waitingBody": "Waiting for {chooserName} to choose which card to keep.",
    "boardReset.keepAction": "Keep This Card",
    "boardReset.blocked": "No other actions can continue until the keeper card is chosen.",
    "boardReset.empty": "There are no cards left in hand to keep.",
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
    "forced.cursePrompt": "{actorName} may discard {count} {releaseCardName} to remove {cardName}.",
    "combat.rollResistance": "{playerName} throws {notation} for resistance{bonus} (threshold {threshold})",
    "combat.rollDamage": "{actorName} throws {notation} for damage on {targetName}",
    "combat.rollCard": "{playerName} throws {notation} for the current action",
    "combat.response.pass": "{playerName} plays no defense card",
    "combat.response.resist": "{playerName} chooses to resist",
    "combat.response.resistance_accrue": "{playerName} plays Resistance Accrue",
    "combat.response.annulation": "{playerName} plays Annulation",
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
    "error.keepCard": "Unable to keep the selected card",
    "error.sacrificeRange": "Enter a whole number between 0 and {maxAmount}.",
    "error.chooseSacrifice": "Unable to choose sacrifice amount",
    "error.kickPlayer": "Unable to kick player",
    "error.discardCard": "Unable to discard card",
    "error.startMatch": "Unable to start match",
    "error.passFollowUp": "Unable to pass forced follow-up",
    "error.resolveCurse": "Unable to resolve curse release",
    "error.drawCard": "Failed to draw card",
    "error.passResponse": "Unable to pass",
    "error.selectObject": "Unable to select object",
    "left.replacedByBot": "Your seat was replaced by a bot. Start a new Activity session to enter a new lobby."
  },
  fr: {
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
    "chat.empty": "Aucun événement pour le moment.",
    "chat.title": "Journal des événements",
    "chat.history.expanded": "Historique complet",
    "chat.history.recent": "Événements récents",
    "chat.open": "Agrandir",
    "chat.close": "Fermer",
    "chat.hide": "Masquer",
    "chat.placeholder": "Écrivez ici. Les émojis Unicode fonctionnent aussi.",
    "chat.send": "Envoyer",
    "chat.dock": "Chat",
    "lobby.activity": "Activité Emerlaus",
    "lobby.title": "Salon de la table de cartes",
    "lobby.copy": "Les sièges sont fixes dans l'ordre de la partie. Votre écran fera toujours pivoter la table pour garder votre main en bas.",
    "lobby.discord": "Activité Discord",
    "lobby.browser": "Mode navigateur",
    "lobby.instance": "Instance {instanceId}",
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
    "seat.label": "Siège {seatNumber}",
    "seat.bot": "Bot • {difficulty}",
    "seat.connected": "Connecté",
    "seat.disconnected": "Déconnecté",
    "seat.host": "Hôte",
    "table.serverLog": "Journal serveur",
    "table.clientLog": "Journal client",
    "table.leaveMatch": "Quitter la partie",
    "table.cardReference": "Guide des cartes",
    "table.currentTurn": "Tour actuel",
    "table.thinking": "Réfléchit",
    "table.player": "Joueur",
    "table.kickPlayer": "Expulser le joueur",
    "table.noPlayableDiscard": "Vous ne pouvez jouer aucune carte ce tour-ci. Choisissez une carte à défausser.",
    "table.discard": "Défausser",
    "stat.power": "Puissance",
    "stat.hp": "PV",
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
    "objectChoice.chooserWaiting": "{chooserName} choisit un objet",
    "objectChoice.waitingBody": "En attente que {chooserName} choisisse un des objets de {ownerName}.",
    "telepathy.inProgress": "Télépathie en cours",
    "telepathy.viewerTitle": "Main de {targetName}",
    "telepathy.viewerBody": "Examinez la main révélée, puis fermez cette fenêtre pour continuer la partie.",
    "telepathy.waitingBody": "En attente que {viewerName} termine l'inspection de la main de {targetName}.",
    "telepathy.blocked": "Aucune autre action ne peut continuer tant que cette fenêtre n'est pas fermée.",
    "telepathy.empty": "Ce joueur n'a aucune carte en main.",
    "telepathy.close": "Fermer",
    "reference.title": "Reference des cartes",
    "reference.body": "Parcourez tout le catalogue. Selectionnez une carte a gauche pour la lire clairement.",
    "reference.close": "Fermer",
    "boardReset.title": "Choisissez {count} carte{plural} à garder",
    "boardReset.inProgress": "Intervention divine en cours",
    "boardReset.body": "Sélectionnez {selectionLabel} qui {stayVerb} dans votre main avant que le reste du plateau soit vidé et brassé à nouveau.",
    "boardReset.waitingBody": "En attente que {chooserName} choisisse la carte à garder.",
    "boardReset.keepAction": "Garder cette carte",
    "boardReset.blocked": "Aucune autre action ne peut continuer tant que la carte à garder n'est pas choisie.",
    "boardReset.empty": "Il ne reste aucune carte en main à garder.",
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
    "forced.cursePrompt": "{actorName} peut défausser {count} {releaseCardName} pour retirer {cardName}.",
    "combat.rollResistance": "{playerName} lance {notation} pour la résistance{bonus} (seuil {threshold})",
    "combat.rollDamage": "{actorName} lance {notation} pour infliger des dégâts à {targetName}",
    "combat.rollCard": "{playerName} lance {notation} pour l'action en cours",
    "combat.response.pass": "{playerName} ne joue pas de carte de defense",
    "combat.response.resist": "{playerName} choisit de résister",
    "combat.response.resistance_accrue": "{playerName} joue Résistance accrue",
    "combat.response.annulation": "{playerName} joue Annulation",
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
    "error.keepCard": "Impossible de garder la carte sélectionnée",
    "error.sacrificeRange": "Entrez un nombre entier entre 0 et {maxAmount}.",
    "error.chooseSacrifice": "Impossible de choisir le montant du sacrifice",
    "error.kickPlayer": "Impossible d'expulser le joueur",
    "error.discardCard": "Impossible de défausser la carte",
    "error.startMatch": "Impossible de démarrer la partie",
    "error.passFollowUp": "Impossible de passer la riposte forcée",
    "error.resolveCurse": "Impossible de résoudre la levée de malédiction",
    "error.drawCard": "Impossible de piger la carte",
    "error.passResponse": "Impossible de passer",
    "error.selectObject": "Impossible de sélectionner l'objet",
    "left.replacedByBot": "Votre siège a été remplacé par un bot. Démarrez une nouvelle session d'activité pour entrer dans un nouveau salon."
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

export function getLocalizedCardImageUrl(cardId: string, fallbackImageUrl: string, language: AppLanguage): string {
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
}

export function localizeCardView(card: CardView, language: AppLanguage): CardView {
  const definition = baseCardDefinitionById[card.cardId];
  const localizedText = definition?.localization?.[language];
  return {
    ...card,
    name: localizedText?.name ?? card.name,
    description: localizedText?.description ?? card.description,
    imageUrl: getLocalizedCardImageUrl(card.cardId, card.imageUrl, language),
    categoryLabel: getLocalizedCategoryLabel(card.categoryCode, language)
  };
}

function localizeSeatState(seat: SeatState, language: AppLanguage): SeatState {
  return {
    ...seat,
    hand: seat.hand?.map((card) => localizeCardView(card, language)),
    objects: seat.objects?.map((card) => localizeCardView(card, language)),
    statuses: seat.statuses?.map((card) => localizeCardView(card, language))
  };
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
    { regex: /^(.+) was canceled before resolving\.$/, format: (match) => language === "fr"
      ? `${localizeCardName(match[1])} est annulee avant sa resolution.`
      : `${localizeCardName(match[1])} was canceled before resolving.` },
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
    chatMessages: match.chatMessages.map((message: ChatMessage) => ({
      ...message,
      content: message.userId === "dealer" ? localizeDealerMessageForUi(message.content, language) : message.content
    })),
    game: match.game == null
      ? undefined
      : {
          ...match.game,
          discardTop: match.game.discardTop == null ? undefined : localizeCardView(match.game.discardTop, language),
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
          pendingBoardResetKeep: match.game.pendingBoardResetKeep == null
            ? undefined
            : {
                ...match.game.pendingBoardResetKeep,
                cardName: localizeCardName(match.game.pendingBoardResetKeep.cardName),
                cardOptions: match.game.pendingBoardResetKeep.cardOptions.map((card) => localizeCardView(card, language))
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
    <div class="language-toggle" aria-label="Language switch">
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
