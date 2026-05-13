import type { BaseCardDefinition, CardCategoryCode, CardRules, DefenseBandRules } from "../types.js";
import { defaultDefenseBandByCategory } from "./base-cards.js";

const CATEGORY_LABEL_BY_CODE: Record<CardCategoryCode, string> = {
  AD: "Attaques directes",
  AM: "Attaques massives",
  A: "Attributs",
  O: "Objets",
  E: "Emmerlaüs",
  S: "Spéciales",
  CA: "Contre-attaques",
  CO: "Contre-objets",
  ST: "Stratégies",
  SO: "Sortilèges",
  SC: "Sorcellerie"
};

const englishLocalizationByFile: Record<string, { name: string; description: string }> = {
  "Baies_magiques.png": {
    name: "Magic Berries",
    description: "The Wizard gains 20 Life points."
  },
  "Extase_mystique.png": {
    name: "Mystic Ecstasy",
    description: "The Wizard receives a bonus of 100 Life points."
  },
  "Nectar_supreme.png": {
    name: "Supreme Nectar",
    description: "The wizard gains life points. Life points: 3D12 + 1D6"
  },
  "Flamme_du_dragon.png": {
    name: "Dragon Flame",
    description: "The Wizard subtracts Life points from the Opponent of their choice. Damage: 1D100"
  },
  "Engelure.png": {
    name: "Frostbite",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D8 per power level\nAdditionally, if the attack is successful, the wizard rolls 1D12. If they roll 1, the opponent skips their next turn and cannot retaliate for one full turn."
  },
  "Flechette_glacee.png": {
    name: "Ice Dart",
    description: "The Wizard subtracts Life points from the Opponent of their choice. Damage: 1D4 per power level. Additionally, if the attack is successful, the Wizard rolls 1D12. If they roll a 1, the Opponent skips their next turn and has no right of retaliation for one full turn."
  },
  "Rayon_glacial.png": {
    name: "Glacial Ray",
    description: "The Wizard subtracts Life points from the Opponent of their choice.\nDamage: 1D12 per Power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If they roll a 1, the Opponent skips their next turn and has no right of retaliation for a full turn."
  },
  "Refroidissement.png": {
    name: "Chilling",
    description: "The Wizard subtracts life points from the opponent of their choice.\nDamage: 1D6 per power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If they roll 1, the opponent skips their next turn and has no right of retaliation for a full turn."
  },
  "Sculpture_de_glace.png": {
    name: "Ice Sculpture",
    description: "The Wizard subtracts Life points from the Opponent of their choice.\nDamage: 1D20 per power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If it's 1, the Opponent skips their next turn and has no right of retaliation for a full turn."
  },
  "Zero_absolu.png": {
    name: "Absolute Zero",
    description: "The wizard subtracts Life points from the opponent of their choice.\nDamage: 1D10 per power level\nAdditionally, if the attack is successful, the wizard rolls 1D12. If they roll a 1, the opponent skips their next turn and has no right of retaliation for a full turn."
  },
  "Potion_de_force.png": {
    name: "Potion of Strength",
    description: "The wizard places this card in front of him. He rolls 1D6, and the result indicates the number of turns he will deal double damage starting from the next turn; afterwards, he discards this card."
  },
  "Potion_de_geant.png": {
    name: "Giant Potion",
    description: "The Wizard places this card in front of him. He rolls 1D4, and the result indicates the number of turns he will deal triple damage points starting from the next turn; afterward, he discards this card to the discard pile."
  },
  "Potion_de_rapidite.png": {
    name: "Potion of Speed",
    description: "The Wizard places this card in front of them. They roll 1D6, and the result indicates the number of turns they can play 2 cards from hand instead of one starting next turn; afterwards, they discard this card to the discard pile."
  },
  "Potion_dinvincibilite.png": {
    name: "Potion of Invincibility",
    description: "The wizard places this card in front of them. They roll 1D4, and the result will indicate the number of turns that they will deal double damage points starting from the next turn. No opponent can attack them during these turns; afterwards, they discard this card to the discard pile."
  },
  "Puissance.png": {
    name: "Power",
    description: "The Wizard places this card in front of them. For a number of turns equal to their power level, they will use the total power level of all players on their next spells. Does not work with « E » cards."
  },
  "Ceinture_de_force_2.png": {
    name: "Belt of Strength 2",
    description: "This card must be placed in front of you to be active. Each time the Wizard uses an « AD » or « AM » card, he adds 2 power level for the card used, as long as he wears the belt."
  },
  "Amulette_anti-attaque_de_masse.png": {
    name: "Anti-Mass Attack Amulet",
    description: "This card must be placed in front of you to be active. « AM » cards are impossible against the wizard as long as he wears the amulet."
  },
  "Anneau_de_vitalite.png": {
    name: "Ring of Vitality",
    description: "This card must be placed in front of you to be active. Starting from their next turn and as long as they wear the ring, the wizard adds 1D6 life points at the beginning of each turn."
  },
  "Robe_de_double_resistance.png": {
    name: "Robe of Double Resistance",
    description: "This card must be placed in front of you to be active. It allows you to get a 2nd resistance roll against each attack directed against you."
  },
  "Transformation_energetique_dun_anneau.png": {
    name: "Energetic Transformation of a Ring",
    description: "The Wizard discards a ring of power that he already wears. He gains 25 Life points per power level of the sacrificed ring."
  },
  "Changement_vital.png": {
    name: "Vital Change",
    description: "The Wizard swaps places with the Opponent of their choice. Additionally, the Opponent loses Life points.\nDamage: 1D4 per power level"
  },
  "Corruption_dun_anneau.png": {
    name: "Corruption of a Ring",
    description: "The Wizard sacrifices a ring of power that he already wears. He subtracts 25 Life points per Power level of the sacrificed ring from the Opponent of his choice."
  },
  "Double_attaque.png": {
    name: "Double Attack",
    description: "The Wizard who uses this spell can make 2 attacks one after the other with the category \"AD\". The Power level is increased by 2 on the 2 \"AD\" cards."
  },
  "Puissance_totale.png": {
    name: "Total Power",
    description: "The wizard who uses this spell immediately discards a 2nd stone. The Damage or Life points are equal to the total Power level of all players for this 2nd stone. Only « A », « AD » and « AM » cards are allowed."
  },
  "Appel_de_la_mort.png": {
    name: "Call of Death",
    description: "Requires a minimum of 4 power level to use this spell. The wizard decides the death of one of their opponents."
  },
  "Cercle_fantastique.png": {
    name: "Fantastic Circle",
    description: "All opponents receive damage.\nDamage: the result of 1D8 multiplied by the power level"
  },
  "Champ_energetique_diminue.png": {
    name: "Diminished Energy Field",
    description: "All opponents receive damage. Damage: the result of 1D10 multiplied by the power level."
  },
  "Tornade.png": {
    name: "Tornado",
    description: "All opponents failing their Resistance roll take Damage.\nDamage: 1D4 + 1D6 + 1D8 + 1D10 + 1D12 + 1D20"
  },
  "Vent_du_nord.png": {
    name: "North Wind",
    description: "The Wizard places this card in front of them. All Opponents receive 1D6 damage per turn, for a number of turns equal to the Wizard's power level. Then, they discard this card to the discard pile."
  },
  "Detonation_13.png": {
    name: "Detonation 13",
    description: "The wizard places this card in front of the opponent of their choice. If the opponent rolls a 13 on any of their Resistance rolls, they die. This card remains active until the opponent is freed from this spell."
  },
  "Roulette_russe.png": {
    name: "Russian Roulette",
    description: "The Wizard rolls a die to determine a random player (including themselves). If chance chooses an Opponent, they descend to 5 Life points; if chance chooses the Wizard, they lose half of their Life points."
  },
  "Equilibre.png": {
    name: "Balance",
    description: "Sum the total life points of all players and divide the result equally among the players."
  },
  "Arret_temporaire_dEmmerlaus.png": {
    name: "Emmerlaus's Temporary Halt",
    description: "The wizard stops time. All opponents are paralyzed. The wizard takes a 2nd turn and no opponent has the right to counterattack (resistance roll, « CA » cards) during this turn."
  },
  "Sous-grades.png": {
    name: "Underlings",
    description: "All opponents must reveal their hands for 30 seconds."
  },
  "Vierge.png": {
    name: "Virgin",
    description: "This stone reproduces the last stone discarded to the heel (without considering \"CA\" and \"O\" cards), at the wizard's power level (if applicable)."
  },
  "Ordre_dEmmerlaus.png": {
    name: "Order of Emmerlaus",
    description: "Cancel any cast spell. Destroy an object. Cancel any effect, even \"CA\", \"E\" cards, or those requiring 2 cancellations."
  },
};

const SELF_HEAL_DEFENSE_BAND: DefenseBandRules = {
  resistance: {
    color: "red",
    rollsRequired: 0
  },
  resistanceAccrueAllowed: false,
  annulationAllowed: false,
  annulationCardsRequired: 0,
  mirrorAllowed: false
};

const STRATEGY_FOLLOW_UP_DEFENSE_BAND: DefenseBandRules = {
  resistance: {
    color: "red",
    rollsRequired: 0
  },
  resistanceAccrueAllowed: false,
  annulationAllowed: false,
  annulationCardsRequired: 1,
  mirrorAllowed: false
};

const PERSISTENT_MASS_DAMAGE_DEFENSE_BAND: DefenseBandRules = {
  resistance: {
    color: "red",
    rollsRequired: 0
  },
  resistanceAccrueAllowed: false,
  annulationAllowed: true,
  annulationCardsRequired: 2,
  mirrorAllowed: false
};

function cloneDefenseBand(code: CardCategoryCode): DefenseBandRules | null {
  const band = defaultDefenseBandByCategory[code];
  return band == null
    ? null
    : {
        resistance: { ...band.resistance },
        resistanceAccrueAllowed: band.resistanceAccrueAllowed,
        annulationAllowed: band.annulationAllowed,
        annulationCardsRequired: band.annulationCardsRequired,
        mirrorAllowed: band.mirrorAllowed
      };
}

function makeImage(file: string): BaseCardDefinition["image"] {
  return {
    localSourcePath: `images/${file}`,
    importedAssetPath: `client/public/assets/cards/base/${file}`
  };
}

function stubRules(
  targets: CardRules["targets"],
  options?: {
    staysInPlay?: boolean;
    selectionMode?: CardRules["selectionMode"];
    requiresDefenseWindow?: boolean;
    requiresResistanceCheck?: boolean;
  }
): CardRules {
  return {
    selectionMode: options?.selectionMode ?? (targets === "self" || targets === "none" ? "confirm" : "target"),
    targets,
    requiresDefenseWindow: options?.requiresDefenseWindow ?? false,
    requiresResistanceCheck: options?.requiresResistanceCheck ?? false,
    staysInPlay: options?.staysInPlay ?? false,
    effects: []
  };
}

function makeSuccessfulHitFreezeAttackCard(card: {
  id: string;
  name: string;
  description: string;
  file: string;
  damageNotation: string;
}): BaseCardDefinition {
  return makeCard({
    id: card.id,
    name: card.name,
    description: card.description,
    code: "AD",
    file: card.file,
    rules: {
      selectionMode: "target",
      targets: "single_opponent",
      requiresDefenseWindow: true,
      requiresResistanceCheck: true,
      staysInPlay: false,
      effects: [
        {
          type: "damage",
          amount: { kind: "dice", notation: card.damageNotation, scaleBy: "multiply_power" }
        }
      ]
    },
    implementation: {
      status: "manual",
      notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
    }
  });
}

function makeTimedPotionCard(card: {
  id: string;
  name: string;
  description: string;
  file: string;
  notes: string;
}): BaseCardDefinition {
  return makeCard({
    id: card.id,
    name: card.name,
    description: card.description,
    code: "S",
    file: card.file,
    rules: stubRules("self", { staysInPlay: true }),
    defenseBand: SELF_HEAL_DEFENSE_BAND,
    implementation: {
      status: "manual",
      notes: card.notes
    }
  });
}

function makeCard(card: {
  id: string;
  name: string;
  enName?: string;
  description: string;
  enDescription?: string;
  code: CardCategoryCode;
  file: string;
  rules: CardRules;
  defenseBand?: DefenseBandRules | null;
  implementation?: BaseCardDefinition["implementation"];
}): BaseCardDefinition {
  const categoryLabel = CATEGORY_LABEL_BY_CODE[card.code];
  const englishLocalization = card.enName != null || card.enDescription != null
    ? {
        name: card.enName ?? card.name,
        description: card.enDescription ?? card.description
      }
    : englishLocalizationByFile[card.file] ?? {
        name: card.name,
        description: card.description
      };
  return {
    id: card.id,
    name: card.name,
    localization: {
      fr: {
        name: card.name,
        description: card.description
      },
      en: englishLocalization
    },
    category: {
      label: categoryLabel,
      code: card.code,
      raw: `${categoryLabel} (${card.code})`
    },
    description: card.description,
    baseDeckQuantity: 0,
    includedDecks: ["Puissance"],
    image: makeImage(card.file),
    defenseBand: card.defenseBand === undefined ? cloneDefenseBand(card.code) : card.defenseBand,
    rules: card.rules,
    implementation: card.implementation ?? {
      status: "needs_handler",
      notes: "Imported for Puissance rollout; effect not implemented yet."
    },
    normalization: {
      textSource: "json_primary",
      needsImageReview: false
    }
  };
}

export const puissanceCardDefinitions = [
  makeCard({
    id: "baies-magiques",
    name: "Baies magiques",
    description: "Le magicien se rajoute 20 points de vie.",
    code: "A",
    file: "Baies_magiques.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        {
          type: "heal",
          amount: { kind: "fixed", amount: 20 },
          target: "self"
        }
      ]
    },
    defenseBand: SELF_HEAL_DEFENSE_BAND,
    implementation: {
      status: "generic",
      notes: "Straight self-heal for 20 HP."
    }
  }),
  makeCard({
      id: "extase-mystique",
      name: "Extase mystique",
      enName: "Mystic Ecstasy",
      description: "Le magicien reçoit un bonus de 100 points de vie.",
      enDescription: "The Wizard receives a bonus of 100 Life points.",
      code: "A",
      file: "Extase_mystique.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "heal",
            amount: {
              kind: "fixed",
              amount: 100
            },
            target: "self"
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Straight self-heal for 100 HP."
      }
    }
  ),
  makeCard({
    id: "nectar-supreme",
    name: "Nectar suprême",
    description: "Le magicien se rajoute des points de vie.\nPoints de vie : 3D12 + 1D6",
    code: "A",
    file: "Nectar_supreme.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        {
          type: "heal",
          amount: { kind: "dice", notation: "3D12" },
          target: "self"
        },
        {
          type: "heal",
          amount: { kind: "dice", notation: "1D6" },
          target: "self"
        }
      ]
    },
    defenseBand: SELF_HEAL_DEFENSE_BAND,
    implementation: {
      status: "generic",
      notes: "Resolved as two self-heal effects because the roll parser does not support mixed-notation expressions in a single effect."
    }
  }),
  makeCard({
    id: "flamme-du-dragon",
    name: "Flamme du dragon",
    description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D100",
    code: "AD",
    file: "Flamme_du_dragon.png",
    rules: {
      selectionMode: "target",
      targets: "single_opponent",
      requiresDefenseWindow: true,
      requiresResistanceCheck: true,
      staysInPlay: false,
      effects: [
        {
          type: "damage",
          amount: { kind: "dice", notation: "1D100" }
        }
      ]
    },
    implementation: {
      status: "generic",
      notes: "Single-target fixed dice damage."
    }
  }),
  makeCard({
      id: "engelure",
      name: "Engelure",
      enName: "Frostbite",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D8 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D8 per power level\nAdditionally, if the attack is successful, the wizard rolls 1D12. If they roll 1, the opponent skips their next turn and cannot retaliate for one full turn.",
      code: "AD",
      file: "Engelure.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D8",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeCard({
      id: "flechette-glacee",
      name: "Fléchette glacée",
      enName: "Ice Dart",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D4 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The Wizard subtracts Life points from the Opponent of their choice. Damage: 1D4 per power level. Additionally, if the attack is successful, the Wizard rolls 1D12. If they roll a 1, the Opponent skips their next turn and has no right of retaliation for one full turn.",
      code: "AD",
      file: "Flechette_glacee.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D4",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeCard({
      id: "rayon-glacial",
      name: "Rayon glacial",
      enName: "Glacial Ray",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D12 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The Wizard subtracts Life points from the Opponent of their choice.\nDamage: 1D12 per Power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If they roll a 1, the Opponent skips their next turn and has no right of retaliation for a full turn.",
      code: "AD",
      file: "Rayon_glacial.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D12",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeCard({
      id: "refroidissement",
      name: "Refroidissement",
      enName: "Chilling",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D6 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The Wizard subtracts life points from the opponent of their choice.\nDamage: 1D6 per power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If they roll 1, the opponent skips their next turn and has no right of retaliation for a full turn.",
      code: "AD",
      file: "Refroidissement.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D6",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeCard({
      id: "sculpture-de-glace",
      name: "Sculpture de glace",
      enName: "Ice Sculpture",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D20 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The Wizard subtracts Life points from the Opponent of their choice.\nDamage: 1D20 per power level\nAdditionally, if the attack is successful, the Wizard rolls 1D12. If it's 1, the Opponent skips their next turn and has no right of retaliation for a full turn.",
      code: "AD",
      file: "Sculpture_de_glace.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D20",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeCard({
      id: "zero-absolu",
      name: "Zéro absolu",
      enName: "Absolute Zero",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D10 par niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, l'adversaire passe son prochain tour et n'a aucun droit de riposte pour un tour complet.",
      enDescription: "The wizard subtracts Life points from the opponent of their choice.\nDamage: 1D10 per power level\nAdditionally, if the attack is successful, the wizard rolls 1D12. If they roll a 1, the opponent skips their next turn and has no right of retaliation for a full turn.",
      code: "AD",
      file: "Zero_absolu.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D10",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard AD damage plus a successful-hit 1D12 trigger; on 1, the target loses their next turn and cannot riposte for one full turn."
      }
    }
  ),
  makeTimedPotionCard({
    id: "potion-de-force",
    name: "Potion de force",
    description: "Le magicien dépose cette carte devant lui. Il lance 1D6, et le résultat lui indiquera le nombre de tours qu'il effectuera des points de dégâts en double à partir du prochain tour; après coup, il écarte cette carte au talon.",
    file: "Potion_de_force.png",
    notes: "Rolls 1D6 on play, starts next turn, and doubles outgoing damage during each affected turn."
  }),
  makeTimedPotionCard({
    id: "potion-de-geant",
    name: "Potion de géant",
    description: "Le magicien dépose cette carte devant lui. Il lance 1D4, et le résultat lui indiquera le nombre de tours qu'il effectuera des points de dégâts en triple à partir du prochain tour; après coup, il écarte cette carte au talon.",
    file: "Potion_de_geant.png",
    notes: "Rolls 1D4 on play, starts next turn, and triples outgoing damage during each affected turn."
  }),
  makeTimedPotionCard({
    id: "potion-de-rapidite",
    name: "Potion de rapidité",
    description: "Le magicien dépose cette carte devant lui. Il lance 1D6, et le résultat lui indiquera le nombre de tours qu'il pourra jouer 2 cartes en main au lieu d'une à partir du prochain tour; après coup, il écarte cette carte au talon.",
    file: "Potion_de_rapidite.png",
    notes: "Rolls 1D6 on play, starts next turn, and grants one extra hand-card play on each affected turn."
  }),
  makeTimedPotionCard({
    id: "potion-dinvincibilite",
    name: "Potion d’invincibilité",
    description: "Le magicien dépose cette carte devant lui. Il lance 1D4, et le résultat lui indiquera le nombre de tours qu'il effectuera des points de dégâts en double à partir du prochain tour. Aucun adversaire ne peut l'attaquer pendant ces tours; après coup, il écarte cette carte au talon.",
    file: "Potion_dinvincibilite.png",
    notes: "Rolls 1D4 on play, starts next turn, doubles outgoing damage, and blocks incoming attacks during each affected turn."
  }),
  makeCard({
      id: "puissance",
      name: "Puissance",
      enName: "Power",
      description: "Le magicien dépose cette carte devant lui. Pour un nombre de tours égal à son niveau de puissance, il utilisera le niveau de puissance total de tous les joueurs sur ses prochains sorts. Ne fonctionne pas avec les cartes « E ».",
      enDescription: "The Wizard places this card in front of them. For a number of turns equal to their power level, they will use the total power level of all players on their next spells. Does not work with « E » cards.",
      code: "S",
      file: "Puissance.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Persistent self-status that makes hand-played non-E cards use the total power of all living players for a number of turns equal to the caster's current power."
      }
    }
  ),
  makeCard({
    id: "ceinture-de-force-2",
    name: "Ceinture de force 2",
    description: "Cette carte doit être déposée devant soi pour être active. Chaque fois qu'il utilise une carte « AD » ou « AM », le magicien se rajoute 2 de niveau de puissance pour la carte utilisée et cela, tant qu'il portera la ceinture.",
    code: "O",
    file: "Ceinture_de_force_2.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "temporary-power-belt",
      notes: "Same shared handler as Ceinture de force 3, but with a +2 temporary power bonus on hand-played AD and AM cards."
    }
  }),
  makeCard({
    id: "amulette-anti-attaque-de-masse",
    name: "Amulette anti-attaque de masse",
    description: "Cette carte doit être déposée devant soi pour être active. Les cartes « AM » sont impossibles contre le magicien aussi longtemps qu'il portera l'amulette.",
    code: "O",
    file: "Amulette_anti-attaque_de_masse.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      notes: "Prevents opponents from targeting the wearer with AM-category attacks while the object remains equipped."
    }
  }),
  makeCard({
    id: "anneau-de-vitalite",
    name: "Anneau de vitalité",
    description: "Cette carte doit être déposée devant soi pour être active. À partir de son prochain tour et tant qu'il portera l'anneau, le magicien se rajoute 1D6 points de vie au début de chaque tour.",
    code: "O",
    file: "Anneau_de_vitalite.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      notes: "Heals the wearer for 1D6 at the start of each of their turns while equipped."
    }
  }),
  makeCard({
    id: "robe-de-double-resistance",
    name: "Robe de double résistance",
    description: "Cette carte doit être déposée devant soi pour être active. Elle permet d'obtenir un 2e jet de résistance contre chaque attaque dirigée contre lui.",
    code: "O",
    file: "Robe_de_double_resistance.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      notes: "Grants one additional resistance roll against each incoming attack while equipped."
    }
  }),
  makeCard({
      id: "transformation-energetique-dun-anneau",
      name: "Transformation énergétique d’un anneau",
      enName: "Energetic Transformation of a Ring",
      description: "Le magicien jette au talon un anneau de puissance qu'il porte déjà. Il se rajoute 25 points de vie par niveau de puissance de l'anneau sacrifié.",
      enDescription: "The Wizard discards a ring of power that he already wears. He gains 25 Life points per power level of the sacrificed ring.",
      code: "A",
      file: "Transformation_energetique_dun_anneau.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Consumes one equipped power ring and heals 25 HP per ring power level."
      }
    }
  ),
  makeCard({
      id: "changement-vital",
      name: "Changement vital",
      enName: "Vital Change",
      description: "Le magicien change de place avec l'adversaire de son choix. De plus, l'adversaire perd des points de vie.\nDégâts : 1D4 par niveau de puissance",
      enDescription: "The Wizard swaps places with the Opponent of their choice. Additionally, the Opponent loses Life points.\nDamage: 1D4 per power level",
      code: "AD",
      file: "Changement_vital.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "swap_bodies",
            swapSeatOrder: true,
            swapHand: false,
            swapHp: false,
            swapObjects: false,
            swapStatuses: false
          },
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D4",
              powerSource: "self",
              powerBonus: 0
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Uses the existing swap_bodies effect with seat-order swap only, then applies normal AD damage."
      }
    }
  ),
  makeCard({
      id: "corruption-dun-anneau",
      name: "Corruption d’un anneau",
      enName: "Corruption of a Ring",
      description: "Le magicien jette au talon un anneau de puissance qu'il porte déjà. Il soustrait 25 points de vie par niveau de puissance de l'anneau sacrifié à l'adversaire de son choix.",
      enDescription: "The Wizard sacrifices a ring of power that he already wears. He subtracts 25 Life points per Power level of the sacrificed ring from the Opponent of his choice.",
      code: "AD",
      file: "Corruption_dun_anneau.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Consumes one equipped power ring and deals 25 HP loss per ring power level to the chosen opponent after the normal AD defense window resolves."
      }
    }
  ),
  makeCard({
      id: "double-attaque",
      name: "Double attaque",
      enName: "Double Attack",
      description: "Le magicien qui utilise ce sort peut faire 2 attaques une à la suite de l'autre avec la catégorie « AD ». Le niveau de puissance est augmenté de 2 sur les 2 cartes « AD ».",
      enDescription: "The Wizard who uses this spell can make 2 attacks one after the other with the category \"AD\". The Power level is increased by 2 on the 2 \"AD\" cards.",
      code: "ST",
      file: "Double_attaque.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: false,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "play_extra_cards",
            count: 2,
            allowedCategories: [
              "AD"
            ],
            refillAtTurnEnd: false
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: false,
        annulationCardsRequired: 0,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Uses the Masse double extra-play flow, but restricted to AD cards instead of AM cards and with the same +2 temporary power intent."
      }
    }
  ),
  makeCard({
    id: "puissance-totale",
    name: "Puissance totale",
    description: "Le magicien qui utilise ce sort écarte immédiatement une 2e pierre. Les dégâts ou points de vie sont du niveau de puissance total de tous les joueurs pour cette 2e pierre. Seules les cartes « A », « AD » et « AM » sont permises.",
    code: "ST",
    file: "Puissance_totale.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        {
          type: "play_extra_cards",
          count: 1,
          allowedCategories: ["A", "AD", "AM"],
          refillAtTurnEnd: false
        }
      ]
    },
    defenseBand: STRATEGY_FOLLOW_UP_DEFENSE_BAND,
    implementation: {
      status: "manual",
      notes: "Immediate one-card follow-up restricted to A/AD/AM; the next played hand card uses the total power of all living players."
    }
  }),
  makeCard({
      id: "appel-de-la-mort",
      name: "Appel de la mort",
      enName: "Call of Death",
      description: "Il faut un minimum de 4 de niveau de puissance pour utiliser ce sort. Le magicien décide de la mort d'un de ses adversaires.",
      enDescription: "Requires a minimum of 4 power level to use this spell. The wizard decides the death of one of their opponents.",
      code: "AD",
      file: "Appel_de_la_mort.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "instant_kill"
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Uses the generic instant_kill effect. Active-play validation separately enforces the minimum power level of 4."
      }
    }
  ),
  makeCard({
      id: "cercle-fantastique",
      name: "Cercle fantastique",
      enName: "Fantastic Circle",
      description: "Tous les adversaires reçoivent des dégâts.\nDégâts : le résultat de 1D8 multiplié par le niveau de puissance",
      enDescription: "All opponents receive damage.\nDamage: the result of 1D8 multiplied by the power level",
      code: "AM",
      file: "Cercle_fantastique.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D8",
              scaleBy: "multiply_power"
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard mass-damage AM card."
      }
    }
  ),
  makeCard({
      id: "champ-energetique-diminue",
      name: "Champ énergétique diminué",
      enName: "Diminished Energy Field",
      description: "Tous les adversaires reçoivent des dégâts.\nDégâts : le résultat de 1D10 multiplié par le niveau de puissance",
      enDescription: "All opponents receive damage. Damage: the result of 1D10 multiplied by the power level.",
      code: "AM",
      file: "Champ_energetique_diminue.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D10",
              scaleBy: "multiply_power"
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard mass-damage AM card."
      }
    }
  ),
  makeCard({
      id: "tornade",
      name: "Tornade",
      enName: "Tornado",
      description: "Tous les adversaires manquant leur jet de résistance reçoivent des dégâts.\nDégâts : 1D4 + 1D6 + 1D8 + 1D10 + 1D12 + 1D20",
      enDescription: "All opponents failing their Resistance roll take Damage.\nDamage: 1D4 + 1D6 + 1D8 + 1D10 + 1D12 + 1D20",
      code: "AM",
      file: "Tornade.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D4+1D6+1D8+1D10+1D12+1D20"
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Resolved as one combined mixed-dice mass-damage roll under a single resistance window."
      }
    }
  ),
  makeCard({
      id: "vent-du-nord",
      name: "Vent du nord",
      enName: "North Wind",
      description: "Le magicien dépose cette carte devant lui. Tous les adversaires reçoivent 1D6 points de dégâts par tour, pour un nombre de tours égal au niveau de puissance du magicien. Ensuite, il écarte cette carte au talon.",
      enDescription: "The Wizard places this card in front of them. All Opponents receive 1D6 damage per turn, for a number of turns equal to the Wizard's power level. Then, they discard this card to the discard pile.",
      code: "AM",
      file: "Vent_du_nord.png",
      rules: {
        selectionMode: "target",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "persistent-owner-turn-mass-damage",
        notes: "Same persistent mass-damage family as Grêle and Tremblement de terre, but with a 1D6 tick."
      }
    }
  ),
  makeCard({
      id: "detonation-13",
      name: "Détonation 13",
      enName: "Detonation 13",
      description: "Le magicien dépose cette carte devant l'adversaire de son choix. Si l'adversaire obtient un 13 sur n'importe lequel de ses lancers de jet de résistance, il meurt. Cette carte reste active tant que l'adversaire ne sera pas libéré de ce sortilège.",
      enDescription: "The wizard places this card in front of the opponent of their choice. If the opponent rolls a 13 on any of their Resistance rolls, they die. This card remains active until the opponent is freed from this spell.",
      code: "SO",
      file: "Detonation_13.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Persistent curse placed on one opponent; any future resistance roll of exactly 13 kills the cursed target until they remove the curse."
      }
    }
  ),
  makeCard({
      id: "roulette-russe",
      name: "Roulette russe",
      enName: "Russian Roulette",
      description: "Le magicien lance un dé pour déterminer un joueur au hasard (y compris lui-même). Si le hasard choisit un adversaire, celui-ci descend à 5 points de vie; si le hasard choisit le magicien, celui-ci perd la moitié de ses points de vie.",
      enDescription: "The Wizard rolls a die to determine a random player (including themselves). If chance chooses an Opponent, they descend to 5 Life points; if chance chooses the Wizard, they lose half of their Life points.",
      code: "AM",
      file: "Roulette_russe.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Chooses one living player at random, including the caster. Opponents are reduced to 5 HP; the caster instead loses half their current HP."
      }
    }
  ),
  makeCard({
      id: "equilibre",
      name: "Équilibre",
      enName: "Balance",
      description: "On additionne le total des points de vie de tous les joueurs et on partage le résultat également entre les joueurs.",
      enDescription: "Sum the total life points of all players and divide the result equally among the players.",
      code: "S",
      file: "Equilibre.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: false,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: false,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Rebalances the total HP of all living players into an even split, distributing any remainder in seat order."
      }
    }
  ),
  makeCard({
      id: "arret-temporaire-demmerlaus",
      name: "Arrêt temporaire d’Emmerlaüs",
      enName: "Emmerlaus's Temporary Halt",
      description: "Le magicien arrête le temps. Tous les adversaires sont paralysés. Le magicien joue un 2e tour et aucun adversaire n'a le droit de riposte (jet de résistance, cartes « CA ») pendant ce tour.",
      enDescription: "The wizard stops time. All opponents are paralyzed. The wizard takes a 2nd turn and no opponent has the right to counterattack (resistance roll, « CA » cards) during this turn.",
      code: "E",
      file: "Arret_temporaire_dEmmerlaus.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Queues one immediate extra turn for the caster. During that stopped-time bonus turn, opponents cannot use resistance rolls or CA-category responses."
      }
    }
  ),
  makeCard({
      id: "sous-grades",
      name: "Sous-gradés",
      enName: "Underlings",
      description: "Tous les adversaires doivent mettre leurs cartes en main à la vue de tous pendant 30 secondes.",
      enDescription: "All opponents must reveal their hands for 30 seconds.",
      code: "S",
      file: "Sous-grades.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Reveals every living opponent hand to all players for 30 seconds, then automatically resumes the turn."
      }
    }
  ),
  makeCard({
      id: "vierge",
      name: "Vierge",
      enName: "Virgin",
      description: "Cette pierre reproduit la derniere pierre ecartee au talon (sans considerer les cartes \"CA\" et \"O\"), au niveau de puissance du magicien (s'il y a lieu).",
      enDescription: "This stone reproduces the last stone discarded to the heel (without considering \"CA\" and \"O\" cards), at the wizard's power level (if applicable).",
      code: "S",
      file: "Vierge.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: false,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: false,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Replays the last eligible non-CA/non-O active hand card that actually reached the discard pile, reusing its prior target selection at the current caster power."
      }
    }
  ),
  makeCard({
      id: "ordre-demmerlaus",
      name: "Ordre d'Emmerlaus",
      enName: "Order of Emmerlaus",
      description: "Cette carte permet d'annuler n'importe quel sort lance. Permet de detruire un objet. Annule n'importe quel effet, meme les cartes \"CA\", \"E\", ou celles requerant 2 annulations.",
      enDescription: "Cancel any cast spell. Destroy an object. Cancel any effect, even \"CA\", \"E\" cards, or those requiring 2 cancellations.",
      code: "E",
      file: "Ordre_dEmmerlaus.png",
      rules: {
        selectionMode: "target",
        targets: "target_object",
        requiresDefenseWindow: false,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "remove_target_object",
            mode: "chosen_by_attacker"
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "red",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: false,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Active play destroys any chosen object. As a pending response, it universally cancels any action, including CA, E, mirror-chain actions, and effects that would normally require 2 Annulations."
      }
    }
  ),
] as const satisfies BaseCardDefinition[];

export const puissanceDeckCardQuantities: Record<string, number> = {
  "anneau-de-puissance-1": 2,
  "anneau-de-puissance-2": 2,
  "amulette-anti-attaque-de-masse": 1,
  "anneau-de-vitalite": 1,
  "ceinture-de-force-2": 1,
  "robe-de-double-resistance": 1,
  "depouillement": 1,
  "dissipation-dun-anneau": 1,
  "la-main-qui-vole": 1,
  "annulation": 3,
  "miroir": 1,
  "resistance-accrue": 3,
  "appel-de-la-mort": 1,
  "changement-vital": 1,
  "corruption-dun-anneau": 1,
  "engelure": 1,
  "flamme-du-dragon": 1,
  "flechette-glacee": 1,
  "rayon-glacial": 1,
  "refroidissement": 1,
  "sculpture-de-glace": 1,
  "zero-absolu": 1,
  "cercle-fantastique": 1,
  "champ-energetique-diminue": 1,
  "roulette-russe": 1,
  "tornade": 1,
  "vent-du-nord": 1,
  "baies-magiques": 1,
  "extase-mystique": 1,
  "nectar-supreme": 1,
  "transformation-energetique-dun-anneau": 1,
  "equilibre": 1,
  "potion-dinvincibilite": 1,
  "potion-de-force": 1,
  "potion-de-geant": 1,
  "potion-de-rapidite": 1,
  "puissance": 1,
  "sous-grades": 1,
  "vierge": 1,
  "double-attaque": 1,
  "puissance-totale": 1,
  "detonation-13": 1,
  "arret-temporaire-demmerlaus": 1,
  "ordre-demmerlaus": 1
};

export const puissanceCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  puissanceCardDefinitions.map((card) => [card.id, card] satisfies [string, BaseCardDefinition])
);
