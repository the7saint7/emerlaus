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

function makeCard(card: {
  id: string;
  name: string;
  enName: string;
  description: string;
  enDescription: string;
  code: CardCategoryCode;
  file: string;
  rules: CardRules;
  defenseBand?: DefenseBandRules | null;
  implementation?: BaseCardDefinition["implementation"];
}): BaseCardDefinition {
  const categoryLabel = CATEGORY_LABEL_BY_CODE[card.code];
  return {
    id: card.id,
    name: card.name,
    localization: {
      fr: {
        name: card.name,
        description: card.description
      },
      en: {
        name: card.enName,
        description: card.enDescription
      }
    },
    category: {
      label: categoryLabel,
      code: card.code,
      raw: `${categoryLabel} (${card.code})`
    },
    description: card.description,
    baseDeckQuantity: 0,
    includedDecks: ["Abondance"],
    image: makeImage(card.file),
    defenseBand: card.defenseBand === undefined ? cloneDefenseBand(card.code) : card.defenseBand,
    rules: card.rules,
    implementation: card.implementation ?? {
      status: "needs_handler",
      notes: "Imported for Abondance deck testing; effect not implemented yet."
    },
    normalization: {
      textSource: "json_primary",
      needsImageReview: false
    }
  };
}

export const abondanceCardDefinitions = [
  makeCard({
    id: "baton-dattaque-massive",
    name: "Bâton d’attaque massive",
    enName: "Mass Attack Staff",
    description: "Cette carte doit être déposée devant soi pour être active. Au début de chaque tour, le magicien lance un rayon de 1D6 points de dégâts sur tous les adversaires. Si le magicien dépose une carte « AM » sur ce bâton au lieu de l'utiliser sur autrui, elle augmente les dégâts de 1D6 par carte « AM » rajoutée. (Si un adversaire vole le bâton, il ramasse aussi les cartes « AM ».)",
    enDescription: "This card must be placed in front of you to be active. At the start of each turn, the wizard fires a beam that deals 1D6 damage to all opponents. If the wizard places an \"AM\" card on this staff instead of using it, the damage increases by 1D6 for each added \"AM\" card. If an opponent steals the staff, they also take the stored \"AM\" cards.",
    code: "O",
    file: "Baton_dattaque_massive.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: true,
      requiresResistanceCheck: true,
      staysInPlay: true,
      effects: [
        { type: "damage", amount: { kind: "dice", notation: "1D6" } }
      ]
    },
    defenseBand: {
      resistance: {
        color: "blue",
        rollsRequired: 1
      },
      resistanceAccrueAllowed: true,
      annulationAllowed: false,
      annulationCardsRequired: 0,
      mirrorAllowed: false
    },
    implementation: {
      status: "manual",
      handler: "mass-attack-staff",
      notes: "Equips normally, may load one AM card per turn onto the staff, and auto-fires at the start of each of the owner's turns with +1D6 per loaded AM card."
    }
  }),
  makeCard({
    id: "ceinture-de-force-3",
    name: "Ceinture de force 3",
    enName: "Power Belt 3",
    description: "Cette carte doit être déposée devant soi pour être active. Chaque fois qu'il utilise une carte « AD » ou « AM », le magicien se rajoute 3 de niveau de puissance pour la carte utilisée et cela, tant qu'il portera la ceinture.",
    enDescription: "This card must be placed in front of you to be active. Whenever the wizard uses an \"AD\" or \"AM\" card, they gain +3 power level for that card while wearing the belt.",
    code: "O",
    file: "Ceinture_de_force_3.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "temporary-power-belt",
      notes: "Adds +3 temporary power while resolving a hand-played AD or AM card. The shared hook also supports Ceinture de force 2 with +2 when that card is imported later."
    }
  }),
  makeCard({
    id: "robe-de-contre-attaque",
    name: "Robe de contre-attaque",
    enName: "Counterattack Robe",
    description: "Cette carte doit être déposée devant soi pour être active. Contre chaque attaque réussie dirigée contre elle (ne pas considérer les attaques par les autres robes), la robe lance un rayon d'énergie provoquant 1D10 points de dégâts à l'attaquant. L’effet reste actif tant que le magicien portera la robe.",
    enDescription: "This card must be placed in front of you to be active. Against each successful attack directed at the wearer, except attacks caused by other robes, the robe fires an energy beam that deals 1D10 damage to the attacker. The effect remains active while the wizard wears the robe.",
    code: "O",
    file: "Robe_de_contre-attaque.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "counterattack-robe",
      notes: "Deals an automatic 1D10 counterattack to the original attacker after each successful incoming attack. Robe-origin attacks do not trigger it."
    }
  }),
  makeCard({
    id: "robe-miroir",
    name: "Robe miroir",
    enName: "Mirror Robe",
    description: "Cette carte doit être déposée devant soi pour être active. Contre chaque attaque réussie dirigée contre lui (ne pas considérer les attaques par les autres robes), le magicien lance 1D6. Il soustrait le résultat aux points de dégâts devant lui être infligés et il enlève ce même résultat aux points de vie de l'attaquant. (Le résultat du 1D6 ne peut excéder les points de dégâts infligés par l'attaquant.) L’effet reste actif tant que le magicien portera la robe.",
    enDescription: "This card must be placed in front of you to be active. Against each successful attack directed at the wearer, except attacks caused by other robes, the wizard rolls 1D6. That result is subtracted from the incoming damage and the same amount is removed from the attacker's HP. The 1D6 result cannot exceed the original damage. The effect remains active while the wizard wears the robe.",
    code: "O",
    file: "Robe_miroir.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "mirror-robe",
      notes: "Reflects up to 1D6 damage from each successful incoming attack back to the attacker while reducing the incoming damage by the same amount. Attacks from robes do not trigger it."
    }
  }),
  makeCard({
      id: "eclair-diabolique",
      name: "Éclair diabolique",
      enName: "Diabolic Lightning",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D6 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, il utilisera alors le niveau de puissance total de tous les joueurs pour effectuer des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D6 per power level. In addition, if the attack succeeds, the wizard rolls 1D12. On a result of 1, they use the total power level of all players to deal damage.",
      code: "AD",
      file: "Eclair_diabolique.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D12. On a 1, the attack uses the total power level of all alive players for damage."
      }
    }
  ),
  makeCard({
      id: "eclair-empoisonnant",
      name: "Éclair empoisonnant",
      enName: "Poison Lightning",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D6 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D6 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Eclair_empoisonnant.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "eclatement-empoisonne",
      name: "Éclatement empoisonné",
      enName: "Poison Burst",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D12 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D12 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Eclatement_empoisonne.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "espoir-mortel",
      name: "Espoir mortel",
      enName: "Deadly Hope",
      description: "Le magicien détermine l'adversaire de son choix et lance 1D10. S'il obtient 1 sur le dé, l'adversaire est mort.",
      enDescription: "The wizard chooses an opponent and rolls 1D10. If the result is 1, the opponent dies.",
      code: "AD",
      file: "Espoir_mortel.png",
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
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "successful-hit-kill-roll",
        notes: "After a successful hit, rolls 1D10. On a 1, the targeted opponent dies."
      }
    }
  ),
  makeCard({
      id: "fleche-diabolique",
      name: "Flèche diabolique",
      enName: "Diabolic Arrow",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D10 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D12. S'il obtient 1, il utilisera alors le niveau de puissance total de tous les joueurs pour effectuer des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D10 per power level. In addition, if the attack succeeds, the wizard rolls 1D12. On a result of 1, they use the total power level of all players to deal damage.",
      code: "AD",
      file: "Fleche_diabolique.png",
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
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D12. On a 1, the attack uses the total power level of all alive players for damage."
      }
    }
  ),
  makeCard({
      id: "fleche-empoisonnee",
      name: "Flèche empoisonnée",
      enName: "Poison Arrow",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D4 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D4 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Fleche_empoisonnee.png",
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
          rollsRequired: 0
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "rayon-empoisonne",
      name: "Rayon empoisonné",
      enName: "Poison Ray",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D10 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D10 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Rayon_empoisonne.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "sphere-de-poison",
      name: "Sphère de poison",
      enName: "Poison Sphere",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D8 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D8 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Sphere_de_poison.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "venin-de-vipere",
      name: "Venin de vipère",
      enName: "Viper Venom",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix. Dégâts : 1D20 par niveau de puissance De plus, si l'attaque est réussie, le magicien lance 1D10. S'il obtient 1, il fait le double des dégâts.",
      enDescription: "The wizard removes HP from an opponent of their choice. Damage: 1D20 per power level. In addition, if the attack succeeds, the wizard rolls 1D10. On a result of 1, the attack deals double damage.",
      code: "AD",
      file: "Venin_de_vipere.png",
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
        handler: "successful-hit-damage-modifier",
        notes: "After a successful hit, rolls 1D10. On a 1, the attack deals double damage."
      }
    }
  ),
  makeCard({
      id: "espoir-diabolique",
      name: "Espoir diabolique",
      enName: "Diabolic Hope",
      description: "Le magicien lance 1D12. S'il obtient 1, tous les adversaires sont morts.",
      enDescription: "The wizard rolls 1D12. If the result is 1, all opponents die.",
      code: "AM",
      file: "Espoir_diabolique.png",
      rules: {
        selectionMode: "target",
        targets: "all_opponents",
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
        handler: "diabolic-hope",
        notes: "After the normal collective defense and resistance flow, the caster rolls 1D12 once. On a 1, every unresolved target dies."
      }
    }
  ),
  makeCard({
      id: "grele",
      name: "Grêle",
      enName: "Hail",
      description: "Le magicien dépose cette carte devant lui. Tous les adversaires reçoivent 1D12 points de dégâts par tour, pour un nombre de tours égal au niveau de puissance du magicien. Ensuite, il écarte cette carte au talon.",
      enDescription: "The wizard places this card in front of them. All opponents take 1D12 damage per turn for a number of turns equal to the wizard's power level. Then the card is discarded.",
      code: "AM",
      file: "Grele.png",
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
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "persistent-owner-turn-mass-damage",
        notes: "Deals 1D12 to all opponents immediately, then repeats at the start of each of the caster's turns for a locked number of turns equal to the caster's power level. Uses 2 Annulation, cannot be mirrored or resisted."
      }
    }
  ),
  makeCard({
      id: "sadomasochisme",
      name: "Sadomasochisme",
      enName: "Sadomasochism",
      description: "Le magicien sacrifie ses points de vie au nombre de son choix. Chaque point sacrifié équivaut à 2 points de dégâts à tous les adversaires.",
      enDescription: "The wizard sacrifices as many HP as they choose. Each sacrificed point deals 2 damage to all opponents.",
      code: "AM",
      file: "Sadomasochisme.png",
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
              kind: "sacrifice_amount",
              multiplier: 2
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
        status: "generic",
        notes: "Uses the shared sacrifice chooser and mass-damage flow, with 2 damage dealt per sacrificed HP."
      }
    }
  ),
  makeCard({
      id: "tremblement-de-terre",
      name: "Tremblement de terre",
      enName: "Earthquake",
      description: "Le magicien dépose cette carte devant lui. Tous les adversaires reçoivent 1D20 points de dégâts par tour, pour un nombre de tours égal au niveau de puissance du magicien. Ensuite, il écarte cette carte au talon.",
      enDescription: "The wizard places this card in front of them. All opponents take 1D20 damage per turn for a number of turns equal to the wizard's power level. Then the card is discarded.",
      code: "AM",
      file: "Tremblement_de_terre.png",
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
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "persistent-owner-turn-mass-damage",
        notes: "Deals 1D20 to all opponents immediately, then repeats at the start of each of the caster's turns for a locked number of turns equal to the caster's power level. Uses 2 Annulation, cannot be mirrored or resisted."
      }
    }
  ),
  makeCard({
    id: "ad-points-de-vie",
    name: "AD > Points de vie",
    enName: "AD > Hit Points",
    description: "Le magicien qui utilise ce sort jette immédiatement une 2e pierre de la catégorie « AD ». Les points de dégâts normalement faits avec le niveau de puissance de la carte « AD » deviennent des points de vie pour le magicien. (S’il s’agit d’une carte qui ne fonctionne pas avec le niveau de puissance, multiplier les points de vie par 2.)",
    enDescription: "The wizard who uses this spell immediately throws a second stone from the \"AD\" category. The damage that would normally be dealt with that AD card becomes HP for the wizard instead. If the card does not use power level, double the gained HP.",
    code: "A",
    file: "AD_Points_de_vie.png",
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
      handler: "follow-up-category-cost",
      notes: "Anyone clockwise may cancel it with Annulation. If not canceled, the caster discards one AD card from hand and gains HP from that AD card's damage formula, doubled when the AD card does not use power level."
    }
  }),
  makeCard({
    id: "ca-points-de-vie",
    name: "CA > Points de vie",
    enName: "CA > Hit Points",
    description: "Le magicien qui utilise ce sort jette immédiatement une 2e pierre de la catégorie « CA ». Cela donne 25 points de vie supplémentaires au magicien.",
    enDescription: "The wizard who uses this spell immediately throws a second stone from the \"CA\" category. This gives the wizard 25 extra HP.",
    code: "A",
    file: "CA_Points_de_vie.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: true,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        { type: "heal", amount: { kind: "fixed", amount: 25 }, target: "self" }
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
      handler: "follow-up-category-cost",
      notes: "Anyone clockwise may cancel it with Annulation. If not canceled, the caster discards one CA card from hand and gains 25 HP."
    }
  }),
  makeCard({
    id: "champignon-des-bois",
    name: "Champignon des bois",
    enName: "Forest Mushroom",
    description: "Le magicien se rajoute des points de vie. Points de vie : 3D8",
    enDescription: "The wizard gains HP. HP gained: 3D8.",
    code: "A",
    file: "Champignon_des_bois.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        { type: "heal", amount: { kind: "dice", notation: "3D8" }, target: "self" }
      ]
    },
    implementation: {
      status: "generic"
    }
  }),
  makeCard({
      id: "extase-energetique",
      name: "Extase énergétique",
      enName: "Energy Ecstasy",
      description: "Le magicien reçoit un bonus de 50 points de vie.",
      enDescription: "The wizard gains a bonus of 50 HP.",
      code: "A",
      file: "Extase_energetique.png",
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
              amount: 50
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
        annulationCardsRequired: 0,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Self-heal of 50 HP. Fully handled by the generic heal effect. Annulation allowed during defense window."
      }
    }
  ),
  makeCard({
    id: "hydromel",
    name: "Hydromel",
    enName: "Mead",
    description: "Le magicien dépose cette carte devant lui. Il se rajoute 5D20 points de vie. À son prochain tour, il jette cette carte au talon et perd son tour. Si un adversaire l'attaque pendant le tour où cette carte est devant lui, son jet de résistance est diminué de 4.",
    enDescription: "The wizard places this card in front of them. They gain 5D20 HP. On their next turn, they discard this card and lose that turn. If an opponent attacks during the turn this card stays in front of them, their resistance roll is reduced by 4.",
    code: "A",
    file: "Hydromel.png",
    rules: {
      selectionMode: "confirm",
      targets: "self",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: true,
      effects: [
        {
          type: "heal",
          amount: { kind: "dice", notation: "5D20" },
          target: "self"
        },
        {
          type: "modify_resistance",
          amount: -4,
          duration: "until_removed"
        }
      ]
    },
    implementation: {
      status: "manual",
      handler: "hydromel",
      notes: "Heals immediately, lowers the owner's resistance threshold by 4 against incoming attacks while active, then discards itself and skips the owner's next turn."
    }
  }),
  makeCard({
      id: "abondance",
      name: "Abondance",
      enName: "Abundance",
      description: "Le magicien dépose cette carte devant lui. Pour un nombre de tours égal à son niveau de puissance, il utilisera chacune de ses cartes 2 fois à partir du prochain tour. Seules les cartes « A » , « AD » et « AM » sont permises.",
      enDescription: "The wizard places this card in front of them. For a number of turns equal to their power level, starting next turn, each of their cards is used twice. Only \"A\", \"AD\", and \"AM\" cards are allowed.",
      code: "S",
      file: "Abondance.png",
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
        handler: "abondance",
        notes: "Starts next turn for a locked number of turns equal to the caster's power. During affected turns, only A, AD, and AM cards may be actively played, and each chosen active card resolves twice with the same target and separate defense windows."
      }
    }
  ),
  makeCard({
      id: "fouille-de-mort",
      name: "Fouille de mort",
      enName: "Death Search",
      description: "Si un adversaire meurt, le magicien jette cette carte au talon (même si ce n'est pas son tour). Elle permet de prendre à l'adversaire mort toutes les cartes de son choix que ce dernier possède. Le magicien dépose au talon le surplus de son jeu s'il y a lieu.",
      enDescription: "If an opponent dies, the wizard may throw this card to the discard pile, even if it is not their turn. It lets them take any cards they choose from the dead opponent. If needed, the wizard then discards excess cards from their own hand.",
      code: "S",
      file: "Fouille_de_mort.png",
      rules: {
        selectionMode: "confirm",
        targets: "none",
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
        handler: "fouille_de_mort",
        notes: "Triggers automatically when an opponent dies. The owner chooses one corpse, then keeps up to 5 cards from their own hand plus the corpse's cards."
      }
    }
  ),
  makeCard({
      id: "la-ceinture-qui-disparait",
      name: "La ceinture qui disparait",
      enName: "The Vanishing Belt",
      description: "Ce sort peut être lancé sur soi ou sur un adversaire. Celui qui reçoit le sort doit jeter toutes ses cartes en main et piger à nouveau.",
      enDescription: "This spell may be cast on yourself or on an opponent. The target must discard their entire hand and draw again.",
      code: "S",
      file: "La_ceinture_qui_disparait.png",
      rules: {
        selectionMode: "target",
        targets: "self_or_single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "redraw_hand"
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
        status: "generic",
        handler: "redraw_hand",
        notes: "The target discards their full hand and redraws to the current game minimum hand size. Can target self or one opponent."
      }
    }
  ),
  makeCard({
      id: "pacte-tenebreux",
      name: "Pacte ténébreux",
      enName: "Dark Pact",
      description: "Le magicien dépose cette carte devant lui. Chaque fois qu'il utilise une carte « AD » ou « AM », le magicien se rajoute 2 de niveau de puissance pour la carte utilisée. De plus, tous les adversaires ont -3 sur leur jet de résistance contre les attaques du magicien.",
      enDescription: "The wizard places this card in front of them. Each time they use an \"AD\" or \"AM\" card, they gain +2 power level for that card. In addition, all opponents have -3 on resistance rolls against the wizard's attacks.",
      code: "S",
      file: "Pacte_tenebreux.png",
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
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "pacte-tenebreux",
        notes: "Body-bound persistent self-status. Hand-played AD and AM cards gain +2 temporary power, and opponents take -3 on resistance against those hand-played AD and AM attacks."
      }
    }
  ),
  makeCard({
      id: "transfert-denergie",
      name: "Transfert d’énergie",
      enName: "Energy Transfer",
      description: "L'attaquant fait l'échange de ses points de vie contre ceux de l'adversaire de son choix.",
      enDescription: "The attacker swaps their HP with an opponent of their choice.",
      code: "S",
      file: "Transfert_denergie.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "swap_bodies",
            swapSeatOrder: false,
            swapHand: false,
            swapHp: true,
            swapObjects: false,
            swapStatuses: false
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: false,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "HP swap via swap_bodies effect. swapSeatOccupants emits hp_gain/hp_loss presentation events and calls handleSeatDeath after the swap."
      }
    }
  ),
  makeCard({
      id: "transfert-dobjets",
      name: "Transfert d’objets",
      enName: "Object Transfer",
      description: "L'attaquant fait l'échange de ses cartes « O » sur la table contre ceux de l'adversaire de son choix. (L'adversaire doit avoir au moins un objet sur la table.)",
      enDescription: "The attacker swaps their \"O\" cards on the table with those of an opponent of their choice. The opponent must have at least one object on the table.",
      code: "S",
      file: "Transfert_dobjets.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "swap_bodies",
            swapSeatOrder: false,
            swapHand: false,
            swapHp: false,
            swapObjects: true,
            swapStatuses: false
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: false,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Swaps all O cards on the table between the caster and a chosen opponent. The target opponent must have at least one object on the table."
      }
    }
  ),
  makeCard({
      id: "transfert-de-ceinture",
      name: "Transfert de ceinture",
      enName: "Belt Transfer",
      description: "Le magicien échange son jeu en main avec l'adversaire de son choix.",
      enDescription: "The wizard swaps their hand with an opponent of their choice.",
      code: "S",
      file: "Transfert_de_ceinture.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "swap_bodies",
            swapSeatOrder: false,
            swapHand: true,
            swapHp: false,
            swapObjects: false,
            swapStatuses: false
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: true,
        annulationAllowed: false,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Swaps the caster's hand with the chosen opponent's hand."
      }
    }
  ),
  makeCard({
      id: "masse-double",
      name: "Masse double",
      enName: "Double Mass",
      description: "Le magicien qui utilise ce sort peut faire 2 attaques avec la catégorie « AM », le niveau de puissance est augmenté de 2 sur les 2 cartes « AM ».",
      enDescription: "The wizard who uses this spell may make 2 attacks with the \"AM\" category, and the power level is increased by 2 for both \"AM\" cards.",
      code: "ST",
      file: "Masse_double.png",
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
            allowedCategories: ["AM"],
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Requires at least one AM card in hand before play. Grants up to two immediate AM attacks with +2 temporary power on each; the first AM is required and the second is only taken if another AM remains."
      }
    }
  ),
  makeCard({
      id: "resistance-diminuee-1",
      name: "Résistance diminuée 1",
      enName: "Reduced Resistance 1",
      description: "Le magicien qui utilise ce sort joue immédiatement une 2e pierre. Le jet de résistance des adversaires est diminué de 1 contre la 2e pierre.",
      enDescription: "The wizard who uses this spell immediately plays a second stone. Opponents have -1 on their resistance roll against that second stone.",
      code: "ST",
      file: "Resistance_diminuee_1.png",
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
            allowedCategories: "any",
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Requires another card in hand. Immediately grants one follow-up card play from hand; all resistance thresholds against that second card are lowered by 1."
      }
    }
  ),
  makeCard({
      id: "resistance-diminuee-2",
      name: "Résistance diminuée 2",
      enName: "Reduced Resistance 2",
      description: "Le magicien qui utilise ce sort joue immédiatement une 2e pierre. Le jet de résistance des adversaires est diminué de 2 contre la 2e pierre.",
      enDescription: "The wizard who uses this spell immediately plays a second stone. Opponents have -2 on their resistance roll against that second stone.",
      code: "ST",
      file: "Resistance_diminuee_2.png",
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
            allowedCategories: "any",
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Requires another card in hand. Immediately grants one follow-up card play from hand; all resistance thresholds against that second card are lowered by 2."
      }
    }
  ),
  makeCard({
      id: "resistance-diminuee-3",
      name: "Résistance diminuée 3",
      enName: "Reduced Resistance 3",
      description: "Le magicien qui utilise ce sort joue immédiatement une 2e pierre. Le jet de résistance des adversaires est diminué de 3 contre la 2e pierre.",
      enDescription: "The wizard who uses this spell immediately plays a second stone. Opponents have -3 on their resistance roll against that second stone.",
      code: "ST",
      file: "Resistance_diminuee_3.png",
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
            allowedCategories: "any",
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Requires another card in hand. Immediately grants one follow-up card play from hand; all resistance thresholds against that second card are lowered by 3."
      }
    }
  ),
  makeCard({
      id: "resistance-diminuee-4",
      name: "Résistance diminuée 4",
      enName: "Reduced Resistance 4",
      description: "Le magicien qui utilise ce sort joue immédiatement une 2e pierre. Le jet de résistance des adversaires est diminué de 4 contre la 2e pierre.",
      enDescription: "The wizard who uses this spell immediately plays a second stone. Opponents have -4 on their resistance roll against that second stone.",
      code: "ST",
      file: "Resistance_diminuee_4.png",
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
            allowedCategories: "any",
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Requires another card in hand. Immediately grants one follow-up card play from hand; all resistance thresholds against that second card are lowered by 4."
      }
    }
  ),
  makeCard({
      id: "limite-de-30-points-de-vie",
      name: "Limite de 30 points de vie",
      enName: "30 HP Limit",
      description: "Le magicien dépose cette carte devant l'adversaire de son choix. Celui-ci baisse immédiatement ses points de vie à 30 et ne pourra pas dépasser ce nombre, tant qu'il ne sera pas libéré de ce sortilège.",
      enDescription: "The wizard places this card in front of an opponent of their choice. That opponent immediately drops to 30 HP and cannot go above that amount until freed from the spell.",
      code: "SO",
      file: "Limite_de_30_points_de_vie.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: [
          {
            type: "set_target_hp",
            amount: {
              kind: "fixed",
              amount: 30
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "limit-30-hp",
        notes: "Lowers the target to 30 HP only if they are above 30, keeps a persistent 30 HP cap while cursed, and can be removed with 2 Annulation on the target's turn."
      }
    }
  ),
  makeCard({
      id: "desintegration-superieure-demmerlaus",
      name: "Désintégration supérieure d’Emmerlaüs",
      enName: "Superior Disintegration of Emmerlaus",
      description: "Tous les adversaires manquant leur jet de résistance sont morts. La résurrection est impossible.",
      enDescription: "All opponents who fail their resistance roll die. Resurrection is impossible.",
      code: "E",
      file: "Desintegration_superieure_dEmmerlaus.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "instant_kill",
            resurrectionBlocked: true
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "generic",
        notes: "Instant kill on all opponents who fail resistance. resurrectionBlocked: true is passed to handleSeatDeath, preventing resurrection ring from triggering. Fully covered by the generic instant_kill effect."
      }
    }
  ),
  makeCard({
      id: "pickpocket-demmerlaus",
      name: "Pickpocket d’Emmerlaüs",
      enName: "Pickpocket of Emmerlaus",
      description: "Cette carte permet au magicien de prendre chez l'adversaire 2 cartes de son choix (soit sur la table ou dans son jeu). Si l'adversaire réussit son jet de résistance, le magicien prend seulement 1 carte.",
      enDescription: "This card lets the wizard take 2 cards of their choice from an opponent, either from the table or from their hand. If the opponent succeeds on the resistance roll, the wizard takes only 1 card.",
      code: "E",
      file: "Pickpocket_dEmmerlaus.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
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
        handler: "pickpocket-demmerlaus",
        notes: "Lets the caster choose cards from the target's hand and equipped objects. Steals 2 on failed resistance, or 1 on successful resistance. Stolen cards go to the caster's hand."
      }
    }
  ),
] satisfies BaseCardDefinition[];

export const abondanceDeckCardQuantities: Record<string, number> = {
  "anneau-de-puissance-1": 3,
  "anneau-de-puissance-2": 1,
  "baton-dattaque-massive": 1,
  "ceinture-de-force-3": 1,
  "robe-de-contre-attaque": 1,
  "robe-miroir": 1,
  "dissipation-dun-anneau": 1,
  "la-main-qui-vole": 1,
  annulation: 3,
  miroir: 1,
  "resistance-accrue": 3,
  "eclair-diabolique": 1,
  "eclair-empoisonnant": 1,
  "eclatement-empoisonne": 1,
  "espoir-mortel": 1,
  "fleche-diabolique": 1,
  "fleche-empoisonnee": 1,
  "rayon-empoisonne": 1,
  "sphere-de-poison": 1,
  "venin-de-vipere": 1,
  "espoir-diabolique": 1,
  grele: 1,
  sadomasochisme: 1,
  "tremblement-de-terre": 1,
  "ad-points-de-vie": 1,
  "ca-points-de-vie": 1,
  "champignon-des-bois": 1,
  "extase-energetique": 1,
  hydromel: 1,
  abondance: 1,
  "fouille-de-mort": 1,
  "la-ceinture-qui-disparait": 1,
  "pacte-tenebreux": 1,
  "transfert-denergie": 1,
  "transfert-dobjets": 1,
  "transfert-de-ceinture": 1,
  "masse-double": 1,
  "resistance-diminuee-1": 1,
  "resistance-diminuee-2": 1,
  "resistance-diminuee-3": 1,
  "resistance-diminuee-4": 1,
  "limite-de-30-points-de-vie": 1,
  "desintegration-superieure-demmerlaus": 1,
  "pickpocket-demmerlaus": 1
};

export const abondanceCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  abondanceCardDefinitions.map((card) => [card.id, card])
);
