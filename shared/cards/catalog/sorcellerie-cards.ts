import type { BaseCardDefinition, CardCategoryCode, CardRules, DefenseBandRules, RollExpression } from "../types.js";
import { defaultDefenseBandByCategory } from "./base-cards.js";

const CATEGORY_LABEL_BY_CODE: Record<CardCategoryCode, string> = {
  AD: "Attaques directes",
  AM: "Attaques massives",
  A: "Attributs",
  O: "Objets",
  E: "Emmerlaus",
  S: "Speciales",
  CA: "Contre-attaques",
  CO: "Contre-objets",
  ST: "Strategies",
  SO: "Sortileges",
  SC: "Sorcellerie"
};

const englishLocalizationByFile: Record<string, { name: string; description: string }> = {
  "Araignees_venimeuses.png": {
    name: "Venomous Spiders",
    description: "All opponents take damage.\nDamage: 1D8 multiplied by power level\nSacrifice: 2 multiplied by power level"
  },
  "Bucher_de_la_sorciere.png": {
    name: "Witch's Stake",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: the opponent dies\nSacrifice: 25 life points"
  },
  "Cataclysme_surnaturel.png": {
    name: "Supernatural Cataclysm",
    description: "All opponents take damage.\nDamage: 1D20 multiplied by power level\nSacrifice: 5 multiplied by power level"
  },
  "Charme_damour.png": {
    name: "Love Charm",
    description: "The wizard chooses an opponent, and that opponent cannot attack them for 1D6 turns.\nSacrifice: 20 life points"
  },
  "Fievre_malefique.png": {
    name: "Evil Fever",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D8 multiplied by power level\nSacrifice: 2 multiplied by power level"
  },
  "Invasion_de_serpents.png": {
    name: "Snake Invasion",
    description: "All opponents take damage.\nDamage: 1D10 multiplied by power level\nSacrifice: 3 multiplied by power level"
  },
  "Nuee_dabeilles.png": {
    name: "Swarm of Bees",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D6 multiplied by power level\nSacrifice: 1 multiplied by power level"
  },
  "Obsession.png": {
    name: "Obsession",
    description: "The wizard takes an object of their choice from an opponent. The object must be on the table.\nSacrifice: 15 life points"
  },
  "il_de_la_sorciere.png": {
    name: "Witch's Eye",
    description: "The wizard looks at the hand of the opponent of their choice.\nSacrifice: 10 life points"
  },
  "Peste.png": {
    name: "Plague",
    description: "All opponents take damage.\nDamage: 1D12 multiplied by power level\nSacrifice: 4 multiplied by power level"
  },
  "Poupee_vaudou.png": {
    name: "Voodoo Doll",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D20 multiplied by power level\nSacrifice: 5 multiplied by power level"
  },
  "Torture_daveux.png": {
    name: "Confession Torture",
    description: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D12 multiplied by power level\nSacrifice: 4 multiplied by power level"
  },
  "Vitesse_du_vent.png": {
    name: "Wind Speed",
    description: "The wizard may immediately play three other cards of their choice.\nSacrifice: 10 life points"
  }
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

function sacrificeCost(amount: RollExpression): RollExpression {
  return amount;
}

function makeCard(card: {
  id: string;
  name: string;
  enName?: string;
  description: string;
  enDescription?: string;
  code?: CardCategoryCode;
  file: string;
  rules: CardRules;
  defenseBand?: DefenseBandRules | null;
  implementation?: BaseCardDefinition["implementation"];
}): BaseCardDefinition {
  const code: CardCategoryCode = card.code ?? "SC";
  const categoryLabel = CATEGORY_LABEL_BY_CODE[code];
  const englishLocalization =
    card.enName != null || card.enDescription != null
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
      code,
      raw: `${categoryLabel} (${code})`
    },
    description: card.description,
    baseDeckQuantity: 0,
    includedDecks: ["Sorcellerie"],
    image: makeImage(card.file),
    defenseBand: card.defenseBand === undefined ? cloneDefenseBand(code) : card.defenseBand,
    rules: card.rules,
    implementation: card.implementation ?? {
      status: "generic",
      notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
    },
    normalization: {
      textSource: "json_primary",
      needsImageReview: false
    }
  };
}

function damageCard(card: {
  id: string;
  name: string;
  description: string;
  file: string;
  targets: "single_opponent" | "all_opponents";
  damage: RollExpression;
  cost: RollExpression;
}): BaseCardDefinition {
  return makeCard({
    id: card.id,
    name: card.name,
    description: card.description,
    file: card.file,
    rules: {
      selectionMode: card.targets === "single_opponent" ? "target" : "confirm",
      targets: card.targets,
      requiresDefenseWindow: true,
      requiresResistanceCheck: true,
      staysInPlay: false,
      effects: [
        { type: "pay_hp", amount: sacrificeCost(card.cost) },
        { type: "damage", amount: card.damage }
      ]
    }
  });
}

export const sorcellerieCardDefinitions = [
  makeCard({
      id: "araignees-venimeuses",
      name: "Araignees venimeuses",
      enName: "Venomous Spiders",
      description: "Tous les adversaires recoivent des degats.\nDegats : le resultat de 1D8 multiplie par le niveau de puissance\nSacrifice : 2 multiplie par le niveau de puissance",
      enDescription: "All opponents take damage.\nDamage: 1D8 multiplied by power level\nSacrifice: 2 multiplied by power level",
      code: "SC",
      file: "Araignees_venimeuses.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 2,
              scaleBy: "multiply_power"
            }
          },
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "bucher-de-la-sorciere",
      name: "Bucher de la sorciere",
      enName: "Witch's Stake",
      description: "Le magicien soustrait des points de vie a l'adversaire de son choix.\nDegats : L'adversaire est mort\nSacrifice : 25 points de vie",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: the opponent dies\nSacrifice: 25 life points",
      file: "Bucher_de_la_sorciere.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 25
            }
          },
          {
            type: "instant_kill"
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
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "cataclysme-surnaturel",
      name: "Cataclysme surnaturel",
      enName: "Supernatural Cataclysm",
      description: "Tous les adversaire recoivent des degats.\nDegats : le resultat de 1D20 multiplie par le niveau de puissance\nSacrifice : 5 multiplie par le niveau de puissance",
      enDescription: "All opponents take damage.\nDamage: 1D20 multiplied by power level\nSacrifice: 5 multiplied by power level",
      code: "SC",
      file: "Cataclysme_surnaturel.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 5,
              scaleBy: "multiply_power"
            }
          },
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D20",
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
        annulationCardsRequired: 0,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "charme-damour",
      name: "Charme d'amour",
      enName: "Love Charm",
      description: "Le magicien choisit un adversaire et celui-ci ne peut l'attaquer pendant 1D6 tours.\nSacrifice : 20 points de vie",
      enDescription: "The wizard chooses an opponent, and that opponent cannot attack them for 1D6 turns.\nSacrifice: 20 life points",
      file: "Charme_damour.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 20
            }
          },
          {
            type: "skip_turn",
            target: "target",
            durationTurns: 1
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
        annulationCardsRequired: 0,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Pays the printed HP sacrifice and currently approximates the attack restriction as one skipped turn; exact per-attacker attack lock still needs a dedicated handler."
      }
    }
  ),
  makeCard({
      id: "fievre-malefique",
      name: "Fievre malefique",
      enName: "Evil Fever",
      description: "Le magicien soustrait des points de vie a l'adversaire de son choix.\nDegats : le resultat de 1D8 multiplie par le niveau de puissance\nSacrifice : 2 multiplie par le niveau de puissance",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D8 multiplied by power level\nSacrifice: 2 multiplied by power level",
      code: "SC",
      file: "Fievre_malefique.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 2,
              scaleBy: "multiply_power"
            }
          },
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "invasion-de-serpents",
      name: "Invasion de serpents",
      enName: "Snake Invasion",
      description: "Tous les adversaires recoivent des degats.\nDegats : le resultat de 1D10 multiplie par le niveau de puissance\nSacrifice : 3 multiplie par le niveau de puissance",
      enDescription: "All opponents take damage.\nDamage: 1D10 multiplied by power level\nSacrifice: 3 multiplied by power level",
      code: "SC",
      file: "Invasion_de_serpents.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 3,
              scaleBy: "multiply_power"
            }
          },
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
        annulationCardsRequired: 0,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "nuee-dabeilles",
      name: "Nuee d'abeilles",
      enName: "Swarm of Bees",
      description: "Le magicien soustrait des points de vie a l'adversaire de son choix.\nDegats : le resultat de 1D6 multiplie par le niveau de puissance\nSacrifice : 1 multiplie par le niveau de puissance",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D6 multiplied by power level\nSacrifice: 1 multiplied by power level",
      code: "SC",
      file: "Nuee_dabeilles.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 1,
              scaleBy: "multiply_power"
            }
          },
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D6",
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "obsession",
      name: "Obsession",
      enName: "Obsession",
      description: "Cette carte permet au magicien de prendre chez l'adversaire l'objet de son choix (l'objet doit etre sur la table).\nSacrifice : 15 points de vie",
      enDescription: "The wizard takes an object of their choice from an opponent. The object must be on the table.\nSacrifice: 15 life points",
      file: "Obsession.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 15
            }
          },
          {
            type: "steal_target_object",
            mode: "chosen_by_attacker"
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
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "oeil-de-la-sorciere",
      name: "Oeil de la sorciere",
      enName: "Witch's Eye",
      description: "Cette carte permet au magicien de regarder le jeu de l'adversaire de son choix.\nSacrifice : 10 points de vie",
      enDescription: "The wizard looks at the hand of the opponent of their choice.\nSacrifice: 10 life points",
      file: "il_de_la_sorciere.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 10
            }
          },
          {
            type: "look_at_hand",
            target: "chosen_opponent"
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
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "peste",
      name: "Peste",
      enName: "Plague",
      description: "Tous les adversaires recoivent des degats.\nDegats : le resultat de 1D12 multiplie par le niveau de puissance\nSacrifice : 4 multiplie par le niveau de puissance",
      enDescription: "All opponents take damage.\nDamage: 1D12 multiplied by power level\nSacrifice: 4 multiplied by power level",
      code: "SC",
      file: "Peste.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 4,
              scaleBy: "multiply_power"
            }
          },
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D12",
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "poupee-vaudou",
      name: "Poupee vaudou",
      enName: "Voodoo Doll",
      description: "Le magicien soustrait des points de vie a l'adversaire de son choix.\nDegats : le resultat de 1D20 multiplie par le niveau de puissance\nSacrifice : 5 multiplie par niveau de puissance",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D20 multiplied by power level\nSacrifice: 5 multiplied by power level",
      code: "SC",
      file: "Poupee_vaudou.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 5,
              scaleBy: "multiply_power"
            }
          },
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D20",
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
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "torture-daveux",
      name: "Torture d'aveux",
      enName: "Confession Torture",
      description: "Le magicien soustrait des points de vie a l'adversaire de son choix.\nDegats : le resultat de 1D12 multiplie par le niveau de puissance\nSacrifice : 4 multiplie par le niveau de puissance",
      enDescription: "The wizard subtracts life points from the opponent of their choice.\nDamage: 1D12 multiplied by power level\nSacrifice: 4 multiplied by power level",
      code: "SC",
      file: "Torture_daveux.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 4,
              scaleBy: "multiply_power"
            }
          },
          {
            type: "damage",
            amount: {
              kind: "dice",
              notation: "1D12",
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
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
  makeCard({
      id: "vitesse-du-vent",
      name: "Vitesse du vent",
      enName: "Wind Speed",
      description: "Cette carte permet au magicien de jouer immediatement trois autres cartes de son choix.\nSacrifice : 10 points de vie",
      enDescription: "The wizard may immediately play three other cards of their choice.\nSacrifice: 10 life points",
      file: "Vitesse_du_vent.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: false,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "pay_hp",
            amount: {
              kind: "fixed",
              amount: 10
            }
          },
          {
            type: "play_extra_cards",
            count: 3,
            allowedCategories: "any",
            refillAtTurnEnd: true
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
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Sorcellerie card implemented with generic effect primitives and printed HP sacrifice cost."
      }
    }
  ),
];

export const sorcellerieDeckCardQuantities: Record<string, number> = {
  "araignees-venimeuses": 4,
  "bucher-de-la-sorciere": 2,
  "cataclysme-surnaturel": 2,
  "charme-damour": 4,
  "fievre-malefique": 6,
  "invasion-de-serpents": 6,
  "nuee-dabeilles": 6,
  obsession: 4,
  "oeil-de-la-sorciere": 4,
  peste: 4,
  "poupee-vaudou": 2,
  "torture-daveux": 4,
  "vitesse-du-vent": 2
};

export const sorcellerieCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  sorcellerieCardDefinitions.map((card) => [card.id, card])
);
