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
  SO: "Sortilèges"
};

const SELF_ATTRIBUTE_DEFENSE_BAND: DefenseBandRules = {
  resistance: {
    color: "red",
    rollsRequired: 0
  },
  resistanceAccrueAllowed: false,
  annulationAllowed: false,
  annulationCardsRequired: 0,
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

function makeOpponentPowerAttackCard(card: {
  id: string;
  name: string;
  description: string;
  file: string;
  notation: string;
}): BaseCardDefinition {
  return makeCard({
    ...card,
    code: "AD",
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
            notation: card.notation,
            powerSource: "target"
          }
        }
      ]
    },
    implementation: {
      status: "generic",
      notes: "Single-target damage scaled by the chosen opponent's power level."
    }
  });
}

function makeOpponentPowerHealCard(card: {
  id: string;
  name: string;
  description: string;
  file: string;
  notation: string;
}): BaseCardDefinition {
  return makeCard({
    ...card,
    code: "A",
    rules: {
      selectionMode: "target",
      targets: "single_opponent",
      requiresDefenseWindow: false,
      requiresResistanceCheck: false,
      staysInPlay: false,
      effects: [
        {
          type: "heal",
          amount: {
            kind: "dice_per_power",
            notation: card.notation,
            powerSource: "target"
          },
          target: "self"
        }
      ]
    },
    defenseBand: SELF_ATTRIBUTE_DEFENSE_BAND,
    implementation: {
      status: "generic",
      notes: "Self-heal scaled by the selected opponent's power level."
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
  const englishLocalization = {
    name: card.enName ?? card.name,
    description: card.enDescription ?? card.description
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
    includedDecks: ["Communion"],
    image: makeImage(card.file),
    defenseBand: card.defenseBand === undefined ? cloneDefenseBand(card.code) : card.defenseBand,
    rules: card.rules,
    implementation: card.implementation ?? {
      status: "needs_handler",
      notes: "Imported for Communion rollout; effect not implemented yet."
    },
    normalization: {
      textSource: "json_primary",
      needsImageReview: false
    }
  };
}

export const communionCardDefinitions = [
  makeCard({
    id: "amulette-anti-miroir",
    name: "Amulette anti-miroir",
    description: "Cette carte doit être déposée devant soi pour être active. Contre chaque attaque réussie dirigée contre lui, le magicien lance 1D10. S'il obtient 1, l'attaque se retourne contre l'adversaire (comme le miroir). Cette carte fonctionne seulement contre les sorts où le miroir est permis.",
    code: "O",
    file: "Amulette_anti-miroir.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "anti-mirror-amulet-reflect",
      notes: "Persistent object; successful incoming mirror-eligible attacks have a 1D10 chance to reflect back to the attacker."
    }
  }),
  makeCard({
      id: "baton-dattaque",
      name: "Bâton d’attaque",
      enName: "Bâton d’attaque",
      description: "Cette carte doit être déposée devant soi pour être active. Au début de chaque tour, le magicien lance un rayon de 1D4 points de dégâts sur l'adversaire de son choix. Si le magicien dépose une carte « AD » sur ce bâton au lieu de l'utiliser sur autrui, elle augmente les dégâts de 1D4 par carte « AD » rajoutée. (Si un adversaire vole le bâton, il ramasse aussi les cartes « AD ».)",
      enDescription: "Cette carte doit être déposée devant soi pour être active. Au début de chaque tour, le magicien lance un rayon de 1D4 points de dégâts sur l'adversaire de son choix. Si le magicien dépose une carte « AD » sur ce bâton au lieu de l'utiliser sur autrui, elle augmente les dégâts de 1D4 par carte « AD » rajoutée. (Si un adversaire vole le bâton, il ramasse aussi les cartes « AD ».)",
      code: "O",
      file: "Baton_dattaque.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: true,
        effects: [
          { type: "damage", amount: { kind: "dice", notation: "1D4" } }
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
        handler: "attack-staff-turn-choice",
        notes: "Single-target version of Bâton d’attaque massive; should load AD cards and fire at the start of owner's turns."
      }
    }
  ),
  makeCard({
    id: "robe-vampirique",
    name: "Robe vampirique",
    description: "Cette carte doit être déposée devant soi pour être active. Contre chaque attaque réussie dirigée contre lui (ne pas considérer les attaques par les autres robes), la robe lance un rayon d'énergie qui suce 1D6 points de vie à l'attaquant pour les donner au magicien.",
    code: "O",
    file: "Robe_vampirique.png",
    rules: stubRules("self", { staysInPlay: true }),
    implementation: {
      status: "manual",
      handler: "vampiric-robe-drain",
      notes: "Persistent object; after each successful incoming non-robe attack, drains 1D6 HP from attacker to wearer."
    }
  }),
  makeOpponentPowerAttackCard({
    id: "affliction",
    name: "Affliction",
    description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui soustraire des points de vie.\nDégâts : 1D8 par niveau de puissance de l'adversaire",
    file: "Affliction.png",
    notation: "1D8"
  }),
  makeOpponentPowerAttackCard({
    id: "aikido",
    name: "Aïkido",
    description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui soustraire des points de vie.\nDégâts : 1D20 par niveau de puissance de l'adversaire",
    file: "Aikido.png",
    notation: "1D20"
  }),
  makeOpponentPowerAttackCard({
    id: "aimant-malefique",
    name: "Aimant maléfique",
    description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui soustraire des points de vie.\nDégâts : 1D6 par niveau de puissance de l'adversaire",
    file: "Aimant_malefique.png",
    notation: "1D6"
  }),
  makeCard({
    id: "communion",
    name: "Communion",
    description: "Le magicien utilise le niveau de puissance de tous les joueurs pour faire des dégâts sur un adversaire.\nDégâts : 1D6 par niveau de puissance total",
    code: "AD",
    file: "Communion.png",
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
            powerSource: "all_living_players"
          }
        }
      ]
    },
    implementation: {
      status: "generic",
      notes: "Single-target damage scaled by the total power level of all living players."
    }
  }),
  makeCard({
      id: "douleur",
      name: "Douleur",
      enName: "Douleur",
      description: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D12 par niveau de puissance",
      enDescription: "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D12 par niveau de puissance",
      code: "AD",
      file: "Douleur.png",
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
              powerSource: "self"
            }
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
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Standard single-target AD damage."
      }
    }
  ),
  makeOpponentPowerAttackCard({
    id: "lampe-magique",
    name: "Lampe magique",
    description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui soustraire des points de vie.\nDégâts : 1D10 par niveau de puissance de l'adversaire",
    file: "Lampe_magique.png",
    notation: "1D10"
  }),
  makeCard({
      id: "le-duel",
      name: "Le duel",
      enName: "Le duel",
      description: "Le magicien et l'adversaire lancent chacun 1D20. Si le magicien obtient le plus haut score sur le dé, il inflige les dégâts suivants : 1D12 par niveau de puissance.\nSi c'est l'adversaire qui a le plus haut score, il inflige les dégâts suivants : 1D6 par niveau de puissance.\nEn cas d'égalité, le duel recommence.",
      enDescription: "Le magicien et l'adversaire lancent chacun 1D20. Si le magicien obtient le plus haut score sur le dé, il inflige les dégâts suivants : 1D12 par niveau de puissance.\nSi c'est l'adversaire qui a le plus haut score, il inflige les dégâts suivants : 1D6 par niveau de puissance.\nEn cas d'égalité, le duel recommence.",
      code: "AD",
      file: "Le_duel.png",
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
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "le-duel",
        notes: "Requires opposed 1D20 rolls with reroll on tie, then either caster deals 1D12 per own power or target deals 1D6 per own power."
      }
    }
  ),
  makeOpponentPowerAttackCard({
    id: "puissance-nuisible",
    name: "Puissance nuisible",
    description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui soustraire des points de vie.\nDégâts : 1D12 par niveau de puissance de l'adversaire",
    file: "Puissance_nuisible.png",
    notation: "1D12"
  }),
  makeCard({
    id: "telekinesie",
    name: "Télékinésie",
    description: "L'adversaire choisi met ses cartes sur la table à la vue de tous. Chacune des cartes « AD » sont projetées vers lui, sans qu'il ait droit à une riposte. Les dégâts se font avec le niveau de puissance de l'attaquant. À la fin, l'adversaire pige ses nouvelles cartes.",
    code: "AD",
    file: "Telekinesie.png",
    rules: stubRules("single_opponent", { requiresDefenseWindow: true, requiresResistanceCheck: true }),
    implementation: {
      status: "manual",
      handler: "telekinesie-project-ad-hand",
      notes: "Reveals target hand, fires each AD card in that hand at the target without response, then target redraws."
    }
  }),
  makeCard({
      id: "torture",
      name: "Torture",
      enName: "Torture",
      description: "Si l'adversaire réussit son jet de résistance, il ne se produit rien. S'il le manque, il perd la moitié de ses points de vie et l'adversaire lance un autre jet de résistance. S'il manque son 2e jet de résistance, il meurt.",
      enDescription: "Si l'adversaire réussit son jet de résistance, il ne se produit rien. S'il le manque, il perd la moitié de ses points de vie et l'adversaire lance un autre jet de résistance. S'il manque son 2e jet de résistance, il meurt.",
      code: "AD",
      file: "Torture.png",
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
        resistanceAccrueAllowed: true,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "torture",
        notes: "On failed resistance, target loses half HP and must make a second resistance roll; failed second roll kills the target."
      }
    }
  ),
  makeCard({
      id: "pluie-acide",
      name: "Pluie acide",
      enName: "Pluie acide",
      description: "Le magicien dépose cette carte devant lui. Tous les adversaires reçoivent 1D10 points de dégâts par tour, pour un nombre de tours égal au niveau de puissance du magicien. De plus, tous les adversaires perdent 1 objet par tour (déterminé au hasard). Ensuite, le magicien écarte cette carte au talon.",
      enDescription: "Le magicien dépose cette carte devant lui. Tous les adversaires reçoivent 1D10 points de dégâts par tour, pour un nombre de tours égal au niveau de puissance du magicien. De plus, tous les adversaires perdent 1 objet par tour (déterminé au hasard). Ensuite, le magicien écarte cette carte au talon.",
      code: "AM",
      file: "Pluie_acide.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: []
      },
      defenseBand: {
        resistance: {
          color: "yellow",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "persistent-owner-turn-mass-damage",
        notes: "Persistent owner-turn mass damage for caster power turns, plus random object loss for each opponent on each tick."
      }
    }
  ),
  makeCard({
      id: "puits-malefique",
      name: "Puits maléfique",
      enName: "Puits maléfique",
      description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour soustraire des points de vie à tous les adversaires.\nDégâts : 1D10 par niveau de puissance de l'adversaire",
      enDescription: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour soustraire des points de vie à tous les adversaires.\nDégâts : 1D10 par niveau de puissance de l'adversaire",
      code: "AM",
      file: "Puits_malefique.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "damage",
            targetOverride: "all_opponents",
            amount: {
              kind: "dice_per_power",
              notation: "1D10",
              powerSource: "target"
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
        notes: "Mass attack damage applies to all opponents while using the chosen opponent as the power source."
      }
    }
  ),
  makeCard({
      id: "pulsion-malefique",
      name: "Pulsion maléfique",
      enName: "Pulsion maléfique",
      description: "Tous les adversaires reçoivent des dégâts.\nDégâts : 1D100",
      enDescription: "Tous les adversaires reçoivent des dégâts.\nDégâts : 1D100",
      code: "AM",
      file: "Pulsion_malefique.png",
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
              notation: "1D100"
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
        notes: "Standard fixed-dice mass attack."
      }
    }
  ),
  makeCard({
    id: "suprematie",
    name: "Suprématie",
    description: "Tous les adversaires reçoivent des dégâts.\nDégâts : le résultat de 1D20 multiplié par le niveau de puissance",
    code: "AM",
    file: "Suprematie.png",
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
            notation: "1D20",
            scaleBy: "multiply_power"
          }
        }
      ]
    },
    implementation: {
      status: "generic",
      notes: "Standard power-multiplied mass attack."
    }
  }),
  makeCard({
      id: "communion-denergie",
      name: "Communion d’énergie",
      enName: "Communion d’énergie",
      description: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D4 par niveau de puissance total",
      enDescription: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D4 par niveau de puissance total",
      code: "A",
      file: "Communion_denergie.png",
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
              kind: "dice_per_power",
              notation: "1D4",
              powerSource: "all_living_players"
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
        notes: "Self-heal scaled by the total power level of all living players."
      }
    }
  ),
  makeCard({
      id: "communion-denergie-majeure",
      name: "Communion d’énergie majeure",
      enName: "Communion d’énergie majeure",
      description: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D6 par niveau de puissance total",
      enDescription: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D6 par niveau de puissance total",
      code: "A",
      file: "Communion_denergie_majeure.png",
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
              kind: "dice_per_power",
              notation: "1D6",
              powerSource: "all_living_players"
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
        notes: "Self-heal scaled by the total power level of all living players."
      }
    }
  ),
  makeCard({
      id: "communion-denergie-superieure",
      name: "Communion d’énergie supérieure",
      enName: "Communion d’énergie supérieure",
      description: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D8 par niveau de puissance total",
      enDescription: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D8 par niveau de puissance total",
      code: "A",
      file: "Communion_denergie_superieure.png",
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
              kind: "dice_per_power",
              notation: "1D8",
              powerSource: "all_living_players"
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
        notes: "Self-heal scaled by the total power level of all living players."
      }
    }
  ),
  makeCard({
      id: "communion-denergie-supreme",
      name: "Communion d’énergie suprême",
      enName: "Communion d’énergie suprême",
      description: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D10 par niveau de puissance total",
      enDescription: "Le magicien utilise le niveau de puissance total de tous les joueurs pour se rajouter des points de vie.\nPoints de vie : 1D10 par niveau de puissance total",
      code: "A",
      file: "Communion_denergie_supreme.png",
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
              kind: "dice_per_power",
              notation: "1D10",
              powerSource: "all_living_players"
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
        notes: "Self-heal scaled by the total power level of all living players."
      }
    }
  ),
  makeCard({
      id: "puissance-rivale",
      name: "Puissance rivale",
      enName: "Puissance rivale",
      description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D6 par niveau de puissance de l'adversaire",
      enDescription: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D6 par niveau de puissance de l'adversaire",
      code: "A",
      file: "Puissance_rivale.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "heal",
            amount: {
              kind: "dice_per_power",
              notation: "1D6",
              powerSource: "target"
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
        notes: "Self-heal scaled by the selected opponent's power level."
      }
    }
  ),
  makeCard({
      id: "puissance-rivale-majeure",
      name: "Puissance rivale majeure",
      enName: "Puissance rivale majeure",
      description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D8 par niveau de puissance de l'adversaire",
      enDescription: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D8 par niveau de puissance de l'adversaire",
      code: "A",
      file: "Puissance_rivale_majeure.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "heal",
            amount: {
              kind: "dice_per_power",
              notation: "1D8",
              powerSource: "target"
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
        notes: "Self-heal scaled by the selected opponent's power level."
      }
    }
  ),
  makeCard({
      id: "puissance-rivale-superieure",
      name: "Puissance rivale supérieure",
      enName: "Puissance rivale supérieure",
      description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D10 par niveau de puissance de l'adversaire",
      enDescription: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D10 par niveau de puissance de l'adversaire",
      code: "A",
      file: "Puissance_rivale_superieure.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "heal",
            amount: {
              kind: "dice_per_power",
              notation: "1D10",
              powerSource: "target"
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
        notes: "Self-heal scaled by the selected opponent's power level."
      }
    }
  ),
  makeCard({
      id: "puissance-rivale-supreme",
      name: "Puissance rivale suprême",
      enName: "Puissance rivale suprême",
      description: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D12 par niveau de puissance de l'adversaire",
      enDescription: "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour se rajouter des points de vie.\nPoints de vie : 1D12 par niveau de puissance de l'adversaire",
      code: "A",
      file: "Puissance_rivale_supreme.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "heal",
            amount: {
              kind: "dice_per_power",
              notation: "1D12",
              powerSource: "target"
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
        notes: "Self-heal scaled by the selected opponent's power level."
      }
    }
  ),
  makeCard({
      id: "choix",
      name: "Choix",
      enName: "Choix",
      description: "Le magicien donne à l'adversaire de son choix l'alternative suivante : perdre 25 points de vie ou un objet choisi par l'attaquant. (L'adversaire doit avoir un objet sur la table.)",
      enDescription: "Le magicien donne à l'adversaire de son choix l'alternative suivante : perdre 25 points de vie ou un objet choisi par l'attaquant. (L'adversaire doit avoir un objet sur la table.)",
      code: "S",
      file: "Choix.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "choice_hp_or_object",
            hpLoss: 25
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
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "choice-hp-or-object",
        notes: "Target-choice fallback: if the target has an object, the attacker removes one automatically; otherwise the target loses 25 HP."
      }
    }
  ),
  makeCard({
      id: "decision",
      name: "Décision",
      enName: "Décision",
      description: "Le magicien donne à l'adversaire de son choix l'alternative suivante : perdre 25 points de vie ou toutes ses cartes en main.",
      enDescription: "Le magicien donne à l'adversaire de son choix l'alternative suivante : perdre 25 points de vie ou toutes ses cartes en main.",
      code: "S",
      file: "Decision.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "choice_hp_or_redraw",
            hpLoss: 25
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
        handler: "choice-hp-or-redraw",
        notes: "Target-choice fallback: target loses 25 HP unless that would be lethal, then discards/redraws instead."
      }
    }
  ),
  makeCard({
      id: "expulsion-temporaire",
      name: "Expulsion temporaire",
      enName: "Expulsion temporaire",
      description: "Ce sort peut être lancé sur soi ou sur un adversaire. Celui qui reçoit le sort est expulsé du combat pour un nombre de tours égal au niveau de puissance du magicien qui lance ce sort.",
      enDescription: "Ce sort peut être lancé sur soi ou sur un adversaire. Celui qui reçoit le sort est expulsé du combat pour un nombre de tours égal au niveau de puissance du magicien qui lance ce sort.",
      code: "S",
      file: "Expulsion_temporaire.png",
      rules: {
        selectionMode: "target",
        targets: "self_or_single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: [
          {
            type: "skip_turn",
            target: "target",
            durationTurns: 1,
            durationSource: "actor_power"
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
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        notes: "Temporarily removes the target from combat for caster power turns."
      }
    }
  ),
  makeCard({
      id: "fusion",
      name: "Fusion",
      enName: "Fusion",
      description: "On additionne les points de vie du magicien et de l'adversaire, et on partage le résultat également entre les deux joueurs.",
      enDescription: "On additionne les points de vie du magicien et de l'adversaire, et on partage le résultat également entre les deux joueurs.",
      code: "S",
      file: "Fusion.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: true,
        staysInPlay: false,
        effects: [
          {
            type: "share_hp",
            participants: "actor_and_target"
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
        annulationCardsRequired: 0,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Adds caster and target HP, then splits the total between both players."
      }
    }
  ),
  makeCard({
      id: "invisibilite",
      name: "Invisibilité",
      enName: "Invisibilité",
      description: "Le magicien dépose cette carte devant lui. Il devient invisible pour un nombre de tours égal à son niveau de puissance. Aucun adversaire ne peut l'attaquer pendant ces tours.",
      enDescription: "Le magicien dépose cette carte devant lui. Il devient invisible pour un nombre de tours égal à son niveau de puissance. Aucun adversaire ne peut l'attaquer pendant ces tours.",
      code: "S",
      file: "Invisibilite.png",
      rules: {
        selectionMode: "confirm",
        targets: "self",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: [
          {
            type: "grant_attack_immunity",
            durationTurns: 1,
            durationSource: "actor_power",
            onlyAgainstAttacks: true
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
        status: "manual",
        notes: "Self status for caster power turns; opponents cannot target the caster with attacks while active."
      }
    }
  ),
  makeCard({
      id: "lapidation",
      name: "Lapidation",
      enName: "Lapidation",
      description: "Le magicien dépose cette carte devant l'adversaire de son choix. Toutes les cartes « AD » qui seront utilisées ultérieurement devront obligatoirement être dirigées contre cet adversaire (le magicien peut écarter une carte « AD » au talon en la considérant inactive). De plus, cet adversaire a un jet de résistance diminué de 2 contre toutes les attaques.",
      enDescription: "Le magicien dépose cette carte devant l'adversaire de son choix. Toutes les cartes « AD » qui seront utilisées ultérieurement devront obligatoirement être dirigées contre cet adversaire (le magicien peut écarter une carte « AD » au talon en la considérant inactive). De plus, cet adversaire a un jet de résistance diminué de 2 contre toutes les attaques.",
      code: "S",
      file: "Lapidation.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: true,
        effects: [
          {
            type: "modify_resistance",
            amount: -2,
            duration: "until_removed"
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
        annulationCardsRequired: 1,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "lapidation-status",
        notes: "Persistent curse; future AD cards must target this player and the target has -2 resistance against all attacks."
      }
    }
  ),
  makeCard({
      id: "option",
      name: "Option",
      enName: "Option",
      description: "Le magicien donne à l'adversaire de son choix l'alternative suivante : échanger son jeu en main contre celui du magicien ou échanger ses objets sur la table contre ceux du magicien. (Si le magicien n'a pas d'objet, il peut quand même effectuer l'échange.)",
      enDescription: "Le magicien donne à l'adversaire de son choix l'alternative suivante : échanger son jeu en main contre celui du magicien ou échanger ses objets sur la table contre ceux du magicien. (Si le magicien n'a pas d'objet, il peut quand même effectuer l'échange.)",
      code: "S",
      file: "Option.png",
      rules: {
        selectionMode: "target",
        targets: "single_opponent",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "choice_swap_hand_or_objects"
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "choice-swap-hand-or-objects",
        notes: "Target-choice fallback: swaps objects when either side has objects, otherwise swaps hands."
      }
    }
  ),
  makeCard({
      id: "attaque-massive",
      name: "Attaque massive",
      enName: "Attaque massive",
      description: "Le magicien qui utilise ce sort écarte immédiatement une 2e pierre. Elle permet d'attaquer tous les adversaires à la fois avec un bonus de 1 sur son niveau de puissance. Seules les cartes « AD » sont permises.",
      enDescription: "Le magicien qui utilise ce sort écarte immédiatement une 2e pierre. Elle permet d'attaquer tous les adversaires à la fois avec un bonus de 1 sur son niveau de puissance. Seules les cartes « AD » sont permises.",
      code: "ST",
      file: "Attaque_massive.png",
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
        annulationCardsRequired: 1,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        handler: "attaque-massive-extra-play",
        notes: "Follow-up AD must be converted to attack all opponents and gain +1 temporary power."
      }
    }
  ),
  makeCard({
      id: "multiplication",
      name: "Multiplication",
      enName: "Multiplication",
      description: "Le magicien qui utilise ce sort écarte immédiatement une 2e pierre. Cette 2e pierre sera alors utilisée deux fois sur le ou les adversaires de son choix ou sur lui-même. Seules les cartes « A », « AD » et « AM » sont permises.",
      enDescription: "Le magicien qui utilise ce sort écarte immédiatement une 2e pierre. Cette 2e pierre sera alors utilisée deux fois sur le ou les adversaires de son choix ou sur lui-même. Seules les cartes « A », « AD » et « AM » sont permises.",
      code: "ST",
      file: "Multiplication.png",
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
            allowedCategories: [
              "A",
              "AD",
              "AM"
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
        handler: "multiplication-repeat-follow-up",
        notes: "Follow-up A/AD/AM card resolves twice with the selected target flow."
      }
    }
  ),
  makeCard({
      id: "agonie",
      name: "Agonie",
      enName: "Agonie",
      description: "Le magicien dépose cette carte devant l'adversaire de son choix. Elle provoque une douleur interne qui soustrait 1D4 points de vie à l'adversaire au début de chacun de ses tours. Cet effet sera actif tant qu'il ne sera pas libéré de ce sortilège.",
      enDescription: "Le magicien dépose cette carte devant l'adversaire de son choix. Elle provoque une douleur interne qui soustrait 1D4 points de vie à l'adversaire au début de chacun de ses tours. Cet effet sera actif tant qu'il ne sera pas libéré de ce sortilège.",
      code: "SO",
      file: "Agonie.png",
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
          color: "blue",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: true
      },
      implementation: {
        status: "manual",
        handler: "agonie-turn-start-damage",
        notes: "Persistent curse; target loses 1D4 HP at the start of each of their turns until released."
      }
    }
  ),
  makeCard({
      id: "communion-diabolique-demmerlaus",
      name: "Communion diabolique d’Emmerlaüs",
      enName: "Communion diabolique d’Emmerlaüs",
      description: "Le magicien utilise le niveau de puissance total de tous les joueurs pour faire des dégâts à tous les adversaires.\nDégâts : 1D8 par niveau de puissance total",
      enDescription: "Le magicien utilise le niveau de puissance total de tous les joueurs pour faire des dégâts à tous les adversaires.\nDégâts : 1D8 par niveau de puissance total",
      code: "E",
      file: "Communion_diabolique_dEmmerlaus.png",
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
              kind: "dice_per_power",
              notation: "1D8",
              powerSource: "all_living_players"
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "yellow",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Mass damage scaled by the total power level of all living players."
      }
    }
  ),
  makeCard({
      id: "vestige-demmerlaus",
      name: "Vestige d’Emmerlaüs",
      enName: "Vestige d’Emmerlaüs",
      description: "Tous les adversaires perdent automatiquement tous les objets portés. En plus, ils reçoivent des dégâts.\nDégâts : 1D4 par niveau de puissance",
      enDescription: "Tous les adversaires perdent automatiquement tous les objets portés. En plus, ils reçoivent des dégâts.\nDégâts : 1D4 par niveau de puissance",
      code: "E",
      file: "Vestige_dEmmerlaus.png",
      rules: {
        selectionMode: "confirm",
        targets: "all_opponents",
        requiresDefenseWindow: true,
        requiresResistanceCheck: false,
        staysInPlay: false,
        effects: [
          {
            type: "remove_target_object",
            mode: "all"
          },
          {
            type: "damage",
            amount: {
              kind: "dice_per_power",
              notation: "1D4",
              powerSource: "self"
            }
          }
        ]
      },
      defenseBand: {
        resistance: {
          color: "yellow",
          rollsRequired: 1
        },
        resistanceAccrueAllowed: false,
        annulationAllowed: true,
        annulationCardsRequired: 2,
        mirrorAllowed: false
      },
      implementation: {
        status: "manual",
        notes: "Removes all opponent objects and deals 1D4 damage per caster power."
      }
    }
  ),
] satisfies BaseCardDefinition[];

export const communionDeckCardQuantities: Record<string, number> = {
  "anneau-de-puissance-1": 3,
  "anneau-de-puissance-2": 1,
  "amulette-anti-miroir": 1,
  "baton-dattaque": 1,
  "robe-vampirique": 1,
  "dissipation-dun-anneau": 1,
  "la-main-qui-vole": 1,
  annulation: 2,
  miroir: 1,
  "resistance-accrue": 4,
  affliction: 1,
  aikido: 1,
  "aimant-malefique": 1,
  communion: 1,
  douleur: 1,
  "lampe-magique": 1,
  "le-duel": 1,
  "puissance-nuisible": 1,
  telekinesie: 1,
  torture: 1,
  "pluie-acide": 1,
  "puits-malefique": 1,
  "pulsion-malefique": 1,
  suprematie: 1,
  "communion-denergie": 1,
  "communion-denergie-majeure": 1,
  "communion-denergie-superieure": 1,
  "communion-denergie-supreme": 1,
  "puissance-rivale": 1,
  "puissance-rivale-majeure": 1,
  "puissance-rivale-superieure": 1,
  "puissance-rivale-supreme": 1,
  choix: 1,
  decision: 1,
  "expulsion-temporaire": 1,
  fusion: 1,
  invisibilite: 1,
  lapidation: 1,
  option: 1,
  "attaque-massive": 1,
  multiplication: 1,
  agonie: 1,
  "communion-diabolique-demmerlaus": 1,
  "vestige-demmerlaus": 1
};

export const communionCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  communionCardDefinitions.map((card) => [card.id, card])
);
