export type CardCategoryCode = "AD" | "AM" | "A" | "O" | "E" | "S" | "CA" | "CO" | "ST" | "SO" | "SC";

export type ResistanceColor = "blue" | "red" | "yellow";

export interface DefenseBandRules {
  resistance: {
    color: ResistanceColor;
    rollsRequired: number;
  };
  resistanceAccrueAllowed: boolean;
  annulationAllowed: boolean;
  annulationCardsRequired: number;
  mirrorAllowed: boolean;
}

export type BaseDefenseBandMappings = Record<string, DefenseBandRules>;

export interface SaveBaseDefenseBandMappingRequest {
  mapping: DefenseBandRules;
}

export type DevCardCatalogId = "base" | "abondance" | "puissance" | "communion" | "sorcellerie";

export type RollScaleMode = "power" | "target_power" | "multiply_power" | "multiply_target_power";

export type RollExpression =
  | { kind: "dice"; notation: string; scaleBy?: RollScaleMode; bonusPerPower?: number; powerBonus?: number }
  | { kind: "dice_per_power"; notation: string; powerSource: "self" | "target" | "all_living_players"; powerBonus?: number }
  | { kind: "fixed"; amount: number; scaleBy?: RollScaleMode; bonusPerPower?: number; powerBonus?: number }
  | { kind: "current_hp_fraction"; numerator: number; denominator: number }
  | { kind: "sacrifice_amount"; multiplier?: number }
  | { kind: "total_active_players_times"; amount: number };

export type CardEffect =
  | { type: "pay_hp"; amount: RollExpression }
  | { type: "damage"; amount: RollExpression; grantsHalfDamageOnResistance?: boolean; targetOverride?: "all_opponents" }
  | { type: "heal"; amount: RollExpression; target: "self" | "all_opponents" }
  | { type: "share_hp"; participants: "actor_and_target" }
  | { type: "choice_hp_or_object"; hpLoss: number }
  | { type: "choice_hp_or_redraw"; hpLoss: number }
  | { type: "choice_swap_hand_or_objects" }
  | { type: "redraw_hand"; redrawCount?: number }
  | { type: "lifesteal"; amount: RollExpression; powerSource: "self" | "target" }
  | { type: "set_target_hp"; amount: RollExpression }
  | { type: "instant_kill"; resurrectionBlocked?: boolean }
  | { type: "remove_target_object"; mode: "chosen_by_attacker" | "all"; chance?: { notation: string; successTotals: number[] }; allowedSlots?: string[] }
  | { type: "steal_target_object"; mode: "chosen_by_attacker"; allowedSlots?: string[] }
  | { type: "modify_resistance"; amount: number; duration: "current_action" | "until_removed" }
  | { type: "skip_turn"; target: "target"; durationTurns: number; durationSource?: "actor_power" }
  | { type: "disable_riposte"; target: "target"; duration: "current_action" | "full_turn" }
  | { type: "paralyze_for_bonus_attack"; doubledDamageForForcedAttack: boolean }
  | { type: "play_extra_cards"; count: number; allowedCategories: "any" | CardCategoryCode[]; refillAtTurnEnd: boolean }
  | { type: "swap_bodies"; swapSeatOrder: boolean; swapHand: boolean; swapHp: boolean; swapObjects: boolean; swapStatuses: boolean }
  | { type: "board_reset"; keeperCards: number; attackerHpBonus: number; discardSelfToTalon: boolean; reshuffleAllOtherCards: boolean }
  | { type: "grant_attack_immunity"; durationTurns: number; durationSource?: "actor_power"; onlyAgainstAttacks: boolean; bonusHeal?: RollExpression }
  | { type: "power_modifier"; amount: number }
  | { type: "resurrection_ring"; reviveHp: number; redrawCards: number; keepOtherObjects: boolean }
  | { type: "absorb_damage"; amount: RollExpression; appliesTo: "all_hp_loss_attacks" | "physical_only" }
  | { type: "look_at_hand"; target: "chosen_opponent" }
  | { type: "dealer_message"; messageKey: string };

export interface CardRules {
  selectionMode: "none" | "confirm" | "target";
  targets:
    | "self"
    | "single_opponent"
    | "self_or_single_opponent"
    | "all_opponents"
    | "left_opponent"
    | "target_object"
    | "single_player_or_object"
    | "none";
  requiresDefenseWindow: boolean;
  requiresResistanceCheck: boolean;
  resistanceMode?: "action" | "per_damage_effect";
  staysInPlay: boolean;
  effects: CardEffect[];
}

export type CardImplementationStatus = "stub" | "generic" | "manual" | "verified" | "needs_handler";

export interface CardImplementationMeta {
  status: CardImplementationStatus;
  handler?: string;
  notes?: string;
}

export interface CardEffectHints {
  targets_all_opponents: boolean;
  targets_left_player: boolean;
  targets_self: boolean;
  requires_resistance: boolean;
  half_on_successful_resistance: boolean;
  grants_healing: boolean;
  uses_opponent_power: boolean;
  moves_or_steals_object: boolean;
  stays_in_play: boolean;
  extra_turn_flow: boolean;
  dice_mentions: string[];
}

export interface CardTextLocalization {
  name: string;
  description: string;
}

export interface BaseCardDefinition {
  id: string;
  name: string;
  localization?: {
    fr: CardTextLocalization;
    en: CardTextLocalization;
  };
  category: {
    label: string;
    code: CardCategoryCode;
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
  defenseBand: DefenseBandRules | null;
  rules: CardRules;
  implementation?: CardImplementationMeta;
  effectHints?: CardEffectHints;
  normalization: {
    textSource: string;
    needsImageReview: boolean;
  };
}

export interface SaveBaseCardDefinitionRequest {
  card: BaseCardDefinition;
}
