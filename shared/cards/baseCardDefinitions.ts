import baseCardDataset from "./generated/base-card-dataset.json";
import manualDefenseBands from "./manual/base-defense-band-mappings.json";
import type {
  BaseCardDefinition,
  CardCategoryCode,
  CardEffect,
  CardRules,
  DefenseBandRules,
  RollExpression
} from "./types";

interface ImportedCardRecord {
  id: string;
  name: string;
  category: {
    label: string;
    code: string;
    raw: string;
  };
  description: string;
  sourceUrl?: string;
  baseDeckQuantity: number;
  includedDecks: string[];
  image: {
    localSourcePath?: string | null;
    importedAssetPath?: string | null;
    remoteUrl?: string | null;
  };
  normalization: {
    textSource: string;
    needsImageReview: boolean;
  };
}

const DEFAULT_BANDS: Record<CardCategoryCode, DefenseBandRules | null> = {
  A: null,
  O: null,
  AD: {
    resistance: { color: "blue", rollsRequired: 1 },
    resistanceAccrueAllowed: true,
    annulationAllowed: true,
    annulationCardsRequired: 1,
    mirrorAllowed: true
  },
  AM: {
    resistance: { color: "yellow", rollsRequired: 1 },
    resistanceAccrueAllowed: true,
    annulationAllowed: true,
    annulationCardsRequired: 1,
    mirrorAllowed: true
  },
  CA: null,
  CO: {
    resistance: { color: "blue", rollsRequired: 1 },
    resistanceAccrueAllowed: true,
    annulationAllowed: true,
    annulationCardsRequired: 1,
    mirrorAllowed: true
  },
  E: {
    resistance: { color: "yellow", rollsRequired: 1 },
    resistanceAccrueAllowed: true,
    annulationAllowed: true,
    annulationCardsRequired: 2,
    mirrorAllowed: true
  },
  S: {
    resistance: { color: "blue", rollsRequired: 1 },
    resistanceAccrueAllowed: true,
    annulationAllowed: true,
    annulationCardsRequired: 1,
    mirrorAllowed: true
  },
  SO: {
    resistance: { color: "blue", rollsRequired: 1 },
    resistanceAccrueAllowed: false,
    annulationAllowed: true,
    annulationCardsRequired: 2,
    mirrorAllowed: false
  },
  ST: {
    resistance: { color: "red", rollsRequired: 0 },
    resistanceAccrueAllowed: false,
    annulationAllowed: true,
    annulationCardsRequired: 1,
    mirrorAllowed: false
  }
};

export const defaultDefenseBandByCategory = DEFAULT_BANDS;

function dice(notation: string, scaleBy?: "power" | "target_power", bonusPerPower?: number): RollExpression {
  return { kind: "dice", notation, scaleBy, bonusPerPower };
}

function fixed(amount: number, scaleBy?: "power" | "target_power", bonusPerPower?: number): RollExpression {
  return { kind: "fixed", amount, scaleBy, bonusPerPower };
}

function baseRulesForCategory(category: CardCategoryCode): CardRules {
  switch (category) {
    case "A":
      return { selectionMode: "confirm", targets: "self", requiresDefenseWindow: true, requiresResistanceCheck: false, staysInPlay: false, effects: [] };
    case "O":
      return { selectionMode: "confirm", targets: "self", requiresDefenseWindow: false, requiresResistanceCheck: false, staysInPlay: true, effects: [] };
    case "AM":
      return { selectionMode: "confirm", targets: "all_opponents", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: false, effects: [] };
    case "CA":
      return { selectionMode: "none", targets: "none", requiresDefenseWindow: false, requiresResistanceCheck: false, staysInPlay: false, effects: [] };
    case "CO":
      return { selectionMode: "target", targets: "single_player_or_object", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: false, effects: [] };
    case "SO":
      return { selectionMode: "target", targets: "single_opponent", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: true, effects: [] };
    case "ST":
      return { selectionMode: "confirm", targets: "self", requiresDefenseWindow: true, requiresResistanceCheck: false, staysInPlay: false, effects: [] };
    case "S":
      return { selectionMode: "target", targets: "single_opponent", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: false, effects: [] };
    case "E":
      return { selectionMode: "confirm", targets: "all_opponents", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: false, effects: [] };
    case "AD":
    default:
      return { selectionMode: "target", targets: "single_opponent", requiresDefenseWindow: true, requiresResistanceCheck: true, staysInPlay: false, effects: [] };
  }
}

function cloneRules(rules: CardRules): CardRules {
  return {
    ...rules,
    effects: [...rules.effects]
  };
}

const SPECIFIC_RULES: Record<string, Partial<CardRules> & { effects?: CardEffect[]; defenseBand?: DefenseBandRules | null }> = {
  "anneau-de-puissance-1": { effects: [{ type: "power_modifier", amount: 1 }] },
  "anneau-de-puissance-2": { effects: [{ type: "power_modifier", amount: 2 }] },
  "anneau-de-puissance-3": { effects: [{ type: "power_modifier", amount: 3 }] },
  "anneau-de-resurrection": {
    effects: [{ type: "resurrection_ring", reviveHp: 50, redrawCards: 5, keepOtherObjects: true }]
  },
  annulation: {
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: []
  },
  "arc-electrique": { effects: [{ type: "damage", amount: dice("1D6", "power") }] },
  "au-seuil-de-la-mort": { effects: [{ type: "set_target_hp", amount: dice("1D10") }] },
  "boule-acidifiee": {
    effects: [
      { type: "damage", amount: dice("1D8", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  "boule-de-feu": { effects: [{ type: "damage", amount: dice("1D8", "power") }] },
  "carquois-de-fleches-magiques": {
    effects: [{ type: "damage", amount: dice("1D4", "power"), grantsHalfDamageOnResistance: true }]
  },
  "cerceau-de-feu": { effects: [{ type: "damage", amount: dice("1D4", "power", 1) }] },
  "champ-declairs": {
    effects: [{ type: "damage", amount: dice("1D6", "power"), grantsHalfDamageOnResistance: true }]
  },
  "champ-vampirique-demmerlaus": {
    effects: [{ type: "lifesteal", amount: dice("1D8", "power"), powerSource: "self" }]
  },
  "colere-du-magicien": {
    effects: [
      { type: "paralyze_for_bonus_attack", doubledDamageForForcedAttack: true },
      { type: "disable_riposte", target: "target", duration: "current_action" }
    ]
  },
  "coup-de-vent": {
    effects: [
      { type: "modify_resistance", amount: -3, duration: "current_action" },
      { type: "damage", amount: dice("1D6", "power") }
    ]
  },
  cumulonimbus: {
    effects: [
      { type: "modify_resistance", amount: -3, duration: "current_action" },
      { type: "damage", amount: dice("1D10", "power") }
    ]
  },
  depouillement: { effects: [{ type: "remove_target_object", mode: "all" }] },
  desintegration: { effects: [{ type: "instant_kill", resurrectionBlocked: true }] },
  destruction: { effects: [{ type: "damage", amount: dice("1D20", "power") }] },
  "destruction-massive": {
    effects: [{ type: "damage", amount: dice("1D20", "power"), grantsHalfDamageOnResistance: true }]
  },
  "disco-laser": {
    effects: [{ type: "damage", amount: dice("1D10", "power"), grantsHalfDamageOnResistance: true }]
  },
  "dissipation-dun-anneau": { targets: "target_object", effects: [{ type: "remove_target_object", mode: "chosen_by_attacker" }] },
  dommage: { effects: [{ type: "damage", amount: fixed(5, "power") }] },
  "dommage-superieur": { effects: [{ type: "damage", amount: fixed(10, "power") }] },
  "don-adverse": { effects: [{ type: "lifesteal", amount: dice("1D8", "target_power"), powerSource: "target" }] },
  eclair: { effects: [{ type: "damage", amount: dice("1D6", "power") }] },
  "energie-acide": {
    effects: [
      { type: "damage", amount: dice("1D12", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  "eruption-acide": {
    effects: [
      { type: "damage", amount: dice("1D6", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  etouffement: {
    effects: [
      { type: "modify_resistance", amount: -4, duration: "current_action" },
      { type: "damage", amount: dice("1D4", "power") }
    ]
  },
  "explosion-energetique": { effects: [{ type: "damage", amount: dice("1D12", "power") }] },
  "fleche-magique": { effects: [{ type: "damage", amount: dice("1D4", "power") }] },
  "flechette-acide": {
    effects: [
      { type: "damage", amount: dice("1D4", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  fontaine: {
    selectionMode: "confirm",
    targets: "self",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [
      { type: "heal", amount: fixed(20), target: "all_opponents" },
      { type: "heal", amount: { kind: "total_active_players_times", amount: 20 }, target: "self" }
    ]
  },
  "fouet-enflamme": { effects: [{ type: "damage", amount: dice("1D6", "power", 1) }] },
  "globe-infernal": { effects: [{ type: "damage", amount: dice("1D8", "power") }] },
  grenacide: {
    effects: [
      { type: "damage", amount: dice("1D20", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  "intervention-divine-demmerlaus": {
    selectionMode: "confirm",
    requiresResistanceCheck: false,
    effects: [
      { type: "board_reset", keeperCards: 1, attackerHpBonus: 25, discardSelfToTalon: true, reshuffleAllOtherCards: true },
      { type: "dealer_message", messageKey: "intervention_divine_reset" }
    ]
  },
  "la-main-qui-vole": { targets: "target_object", requiresResistanceCheck: false, effects: [{ type: "steal_target_object", mode: "chosen_by_attacker" }] },
  "lance-flamme": { effects: [{ type: "damage", amount: dice("1D12", "power", 1) }] },
  "main-brulante": {
    effects: Array.from({ length: 5 }, () => ({ type: "damage", amount: dice("1D12") as RollExpression }) as CardEffect)
  },
  malediction: {
    effects: [{ type: "modify_resistance", amount: -5, duration: "until_removed" }]
  },
  miroir: {
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: []
  },
  "missile-nucleaire": { effects: [{ type: "damage", amount: dice("1D20", "power") }] },
  "pluie-de-boules-de-feu": {
    effects: [{ type: "damage", amount: dice("1D8", "power"), grantsHalfDamageOnResistance: true }]
  },
  "potion-denergie": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("4D6"), target: "self" }]
  },
  "potion-denergie-majeure": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("5D10"), target: "self" }]
  },
  "potion-denergie-superieure": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("6D12"), target: "self" }]
  },
  "potion-denergie-supreme": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("1D100"), target: "self" }]
  },
  "projectile-magique": { effects: [{ type: "damage", amount: dice("1D4", "power") }] },
  "puissance-vitale": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("1D4", "power"), target: "self" }]
  },
  "puissance-vitale-majeure": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("1D8", "power"), target: "self" }]
  },
  "puissance-vitale-superieure": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("1D10", "power"), target: "self" }]
  },
  "puissance-vitale-supreme": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "heal", amount: dice("1D12", "power"), target: "self" }]
  },
  pulverisateur: { effects: [{ type: "damage", amount: dice("1D10", "power") }] },
  "rayon-acide": {
    effects: [
      { type: "damage", amount: dice("1D10", "power") },
      { type: "remove_target_object", mode: "chosen_by_attacker" }
    ]
  },
  "rayon-laser": { effects: [{ type: "damage", amount: dice("1D10", "power") }] },
  "resistance-accrue": {
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "modify_resistance", amount: 0, duration: "current_action" }]
  },
  "robe-dabsorption": { effects: [{ type: "absorb_damage", amount: dice("1D10"), appliesTo: "all_hp_loss_attacks" }] },
  "robe-de-protection-2": {
    effects: [{ type: "modify_resistance", amount: 2, duration: "until_removed" }]
  },
  "robe-de-protection-3": {
    effects: [{ type: "modify_resistance", amount: 3, duration: "until_removed" }]
  },
  "sacrifice-demmerlaus": {
    effects: [{ type: "damage", amount: { kind: "sacrifice_amount" }, grantsHalfDamageOnResistance: true }]
  },
  "sanctuaire-demmerlaus": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    staysInPlay: true,
    effects: [
      { type: "grant_attack_immunity", durationTurns: 1, onlyAgainstAttacks: true, bonusHeal: dice("1D8", "power") },
      { type: "heal", amount: fixed(25), target: "self" }
    ]
  },
  sommeil: {
    targets: "left_opponent",
    effects: [
      { type: "skip_turn", target: "target", durationTurns: 1 },
      { type: "disable_riposte", target: "target", duration: "full_turn" }
    ]
  },
  "souffle-enflamme": { effects: [{ type: "damage", amount: dice("1D8", "power", 1) }] },
  "souffrance-empirique": {
    effects: [{ type: "damage", amount: { kind: "current_hp_fraction", numerator: 1, denominator: 2 } }]
  },
  "spirale-de-feu": { effects: [{ type: "damage", amount: dice("1D10", "power", 1) }] },
  "succion-vampirique": { effects: [{ type: "lifesteal", amount: dice("1D8", "power"), powerSource: "self" }] },
  "super-boule-de-feu": { effects: [{ type: "damage", amount: dice("1D20", "power", 1) }] },
  telepathie: {
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "look_at_hand", target: "chosen_opponent" }]
  },
  "tenebres-demmerlaus": {
    effects: [{ type: "damage", amount: dice("1D12", "power"), grantsHalfDamageOnResistance: true }]
  },
  torpille: {
    effects: [
      { type: "modify_resistance", amount: -3, duration: "current_action" },
      { type: "damage", amount: dice("1D12", "power") }
    ]
  },
  tourbillon: {
    effects: [
      { type: "modify_resistance", amount: -3, duration: "current_action" },
      { type: "damage", amount: dice("1D8", "power") }
    ]
  },
  "transfert-de-corps": {
    effects: [{ type: "swap_bodies", swapSeatOrder: true, swapHand: true, swapHp: true, swapObjects: true, swapStatuses: true }]
  },
  "transmission-vitale": { effects: [{ type: "lifesteal", amount: dice("1D10", "target_power"), powerSource: "target" }] },
  "vapeur-explosive": {
    effects: [{ type: "damage", amount: dice("1D8", "power"), grantsHalfDamageOnResistance: true }]
  },
  violence: { effects: [{ type: "damage", amount: dice("1D12", "power") }] },
  "vitesse-double": {
    selectionMode: "confirm",
    requiresDefenseWindow: false,
    requiresResistanceCheck: false,
    effects: [{ type: "play_extra_cards", count: 2, allowedCategories: "any", refillAtTurnEnd: true }]
  }
};

function buildDefinition(card: ImportedCardRecord): BaseCardDefinition {
  const categoryCode = card.category.code as CardCategoryCode;
  const baseRules = cloneRules(baseRulesForCategory(categoryCode));
  const specific = SPECIFIC_RULES[card.id];
  const mappedDefenseBand = (manualDefenseBands as Record<string, DefenseBandRules>)[card.id];

  const rules: CardRules = {
    ...baseRules,
    ...specific,
    effects: specific?.effects ?? baseRules.effects
  };

  return {
    ...card,
    category: {
      ...card.category,
      code: categoryCode
    },
    defenseBand: mappedDefenseBand ?? specific?.defenseBand ?? DEFAULT_BANDS[categoryCode],
    rules
  };
}

const importedCards = (baseCardDataset.cards as ImportedCardRecord[]).map(buildDefinition);

export const baseCardDefinitions: BaseCardDefinition[] = importedCards;

export const baseCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  baseCardDefinitions.map((card) => [card.id, card])
);
