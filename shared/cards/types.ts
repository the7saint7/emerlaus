export type CardCategoryCode = "AD" | "AM" | "A" | "O" | "E" | "S" | "CA" | "CO" | "ST" | "SO";

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

export type RollExpression =
  | { kind: "dice"; notation: string; scaleBy?: "power" | "target_power"; bonusPerPower?: number }
  | { kind: "fixed"; amount: number; scaleBy?: "power" | "target_power"; bonusPerPower?: number }
  | { kind: "current_hp_fraction"; numerator: number; denominator: number }
  | { kind: "sacrifice_amount" }
  | { kind: "total_active_players_times"; amount: number };

export type CardEffect =
  | { type: "damage"; amount: RollExpression; grantsHalfDamageOnResistance?: boolean }
  | { type: "heal"; amount: RollExpression; target: "self" | "all_opponents" }
  | { type: "lifesteal"; amount: RollExpression; powerSource: "self" | "target" }
  | { type: "set_target_hp"; amount: RollExpression }
  | { type: "instant_kill"; resurrectionBlocked?: boolean }
  | { type: "remove_target_object"; mode: "chosen_by_attacker" | "all" }
  | { type: "steal_target_object"; mode: "chosen_by_attacker" }
  | { type: "modify_resistance"; amount: number; duration: "current_action" | "until_removed" }
  | { type: "skip_turn"; target: "target"; durationTurns: number }
  | { type: "disable_riposte"; target: "target"; duration: "current_action" | "full_turn" }
  | { type: "paralyze_for_bonus_attack"; doubledDamageForForcedAttack: boolean }
  | { type: "play_extra_cards"; count: number; allowedCategories: "any" | CardCategoryCode[]; refillAtTurnEnd: boolean }
  | { type: "swap_bodies"; swapSeatOrder: boolean; swapHand: boolean; swapHp: boolean; swapObjects: boolean; swapStatuses: boolean }
  | { type: "board_reset"; keeperCards: number; attackerHpBonus: number; discardSelfToTalon: boolean; reshuffleAllOtherCards: boolean }
  | { type: "grant_attack_immunity"; durationTurns: number; onlyAgainstAttacks: boolean; bonusHeal?: RollExpression }
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
    | "all_opponents"
    | "left_opponent"
    | "target_object"
    | "single_player_or_object"
    | "none";
  requiresDefenseWindow: boolean;
  requiresResistanceCheck: boolean;
  staysInPlay: boolean;
  effects: CardEffect[];
}

export interface BaseCardDefinition {
  id: string;
  name: string;
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
  normalization: {
    textSource: string;
    needsImageReview: boolean;
  };
}
