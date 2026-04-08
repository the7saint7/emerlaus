import type { BaseCardDefinition, CardCategoryCode, DefenseBandRules } from "../types";

const englishCardLocalizationById = {
  "anneau-de-puissance-1": {
    name: "Power Ring +1",
    description: `This card must be placed in front of you to be active. It increases your power level by 1 as long as the wizard wears the ring.`
  },
  "anneau-de-puissance-2": {
    name: "Power Ring +2",
    description: `This card must be placed in front of you to be active. It increases your power level by 2 as long as the wizard wears the ring.`
  },
  "anneau-de-puissance-3": {
    name: "Power Ring +3",
    description: `This card must be placed in front of you to be active. It increases your power level by 3 as long as the wizard wears the ring.`
  },
  "anneau-de-resurrection": {
    name: "Resurrection Ring",
    description: `This card must be placed on the table to be active. If the wearer dies, they are resurrected with 50 HP. Then they must throw away the ring and draw 5 new cards while keeping the other objects in front of them.`
  },
  "robe-de-protection-2": {
    name: "Protection Robe +2",
    description: `This card must be placed in front of you to be active. The robe increases the chance of succeeding on a resistance roll to 12 instead of 10 for as long as the wizard wears it.`
  },
  "robe-de-protection-3": {
    name: "Protection Robe +3",
    description: `This card must be placed in front of you to be active. The robe increases the chance of succeeding on a resistance roll to 13 instead of 10 for as long as the wizard wears it.`
  },
  "robe-dabsorption": {
    name: "Absorption Robe",
    description: `This card must be placed in front of you to be active. Against each successful attack directed at them, the wizard is protected from all attacks involving physical damage. For each attack, this robe absorbs 1D10 damage points for as long as the wizard wears it.`
  },
  "depouillement": {
    name: "Strip Away",
    description: `If the opponent fails the resistance roll, they lose all worn objects ("O" cards placed in front of them).`
  },
  "dissipation-dun-anneau": {
    name: "Ring Dissipation",
    description: `The opponent throws away a worn ring, chosen by the attacker.`
  },
  "la-main-qui-vole": {
    name: "The Flying Hand",
    description: `Allows the caster of this spell to take the object of their choice from the opponent (the object must already be on the table).`
  },
  "annulation": {
    name: "Cancel",
    description: `Cancels the opponent's last thrown stone.`
  },
  "miroir": {
    name: "Mirror",
    description: `Turns the effects of the opponent's last stone back on them. The power level used for the returned stone remains that of the original attacker.`
  },
  "resistance-accrue": {
    name: "Enhanced Resistance",
    description: `Increases the resistance roll for one turn only.\nProtection: power level added to the resistance roll.`
  },
  "ange-gardien": {
    name: "Guardian Angel",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -3 on the resistance roll against this attack.\nDamage: 1D20 multiplied by power level`
  },
  "arc-electrique": {
    name: "Electric Arc",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D6 multiplied by power level`
  },
  "au-seuil-de-la-mort": {
    name: "At Death's Door",
    description: `If the opponent fails the resistance roll, they are brought to death's door. The attacker rolls 1D10, and that result becomes the opponent's remaining HP.`
  },
  "boule-acidifiee": {
    name: "Acidified Orb",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D8 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "boule-de-feu": {
    name: "Fireball",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D8 multiplied by power level`
  },
  "cerceau-de-feu": {
    name: "Ring of Fire",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D4 multiplied by (power level +1)`
  },
  "coup-de-vent": {
    name: "Gust of Wind",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -3 on the resistance roll against this attack.\nDamage: 1D6 multiplied by power level`
  },
  "cumulonimbus": {
    name: "Cumulonimbus",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -3 on the resistance roll against this attack.\nDamage: 1D10 multiplied by power level`
  },
  "desintegration": {
    name: "Disintegration",
    description: `If the resistance roll is failed, the opponent is disintegrated and therefore dead. Resurrection is impossible.`
  },
  "destruction": {
    name: "Destruction",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D20 multiplied by power level`
  },
  "dommage": {
    name: "Damage",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 5 points multiplied by power level`
  },
  "dommage-superieur": {
    name: "Greater Damage",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 10 points multiplied by power level`
  },
  "don-adverse": {
    name: "Adverse Gift",
    description: `The wizard uses the power level of the chosen opponent to drain life points from them and add them to their own.\nDrain: 1D8 multiplied by the opponent's power level`
  },
  "eclair": {
    name: "Lightning Bolt",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D6 multiplied by power level`
  },
  "energie-acide": {
    name: "Acid Energy",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D12 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "eruption-acide": {
    name: "Acid Eruption",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D6 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "etouffement": {
    name: "Suffocation",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -4 on the resistance roll against this attack.\nDamage: 1D4 multiplied by power level`
  },
  "explosion-energetique": {
    name: "Energy Explosion",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D12 multiplied by power level`
  },
  "flechette-acide": {
    name: "Acid Dart",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D4 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "fleche-magique": {
    name: "Magic Arrow",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D4 multiplied by power level`
  },
  "fouet-enflamme": {
    name: "Flaming Whip",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D6 multiplied by (power level +1)`
  },
  "globe-infernal": {
    name: "Infernal Globe",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D8 multiplied by power level`
  },
  "grenacide": {
    name: "Grenacide",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D20 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "lance-flamme": {
    name: "Flamethrower",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D12 multiplied by (power level +1)`
  },
  "main-brulante": {
    name: "Burning Hand",
    description: `The wizard attacks the chosen opponent 5 times with this card. The target gets one resistance roll for each attack.\nDamage: 5 attacks of 1D12 points`
  },
  "missile-nucleaire": {
    name: "Nuclear Missile",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D20 multiplied by power level`
  },
  "projectile-magique": {
    name: "Magic Projectile",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D4 multiplied by power level`
  },
  "pulverisateur": {
    name: "Pulverizer",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D10 multiplied by power level`
  },
  "rayon-acide": {
    name: "Acid Ray",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D10 multiplied by power level\nIn addition, if the attack succeeds, the wizard rolls 1D6. On a result of 1, they remove one object of their choice from the opponent.`
  },
  "rayon-laser": {
    name: "Laser Ray",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: 1D10 multiplied by power level`
  },
  "souffle-enflamme": {
    name: "Fiery Breath",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D8 multiplied by (power level +1)`
  },
  "spirale-de-feu": {
    name: "Spiral of Fire",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D10 multiplied by (power level +1)`
  },
  "succion-vampirique": {
    name: "Vampiric Drain",
    description: `The attacker drains the opponent's life points and adds them to their own.\nDrain: 1D8 multiplied by power level`
  },
  "super-boule-de-feu": {
    name: "Super Fireball",
    description: `The wizard removes life points from the opponent of their choice, with a +1 power level bonus for this attack.\nDamage: 1D20 multiplied by (power level +1)`
  },
  "torpille": {
    name: "Torpedo",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -3 on the resistance roll against this attack.\nDamage: 1D12 multiplied by power level`
  },
  "tourbillon": {
    name: "Whirlwind",
    description: `The wizard removes life points from the opponent of their choice, and that opponent has -3 on the resistance roll against this attack.\nDamage: 1D8 multiplied by power level`
  },
  "transmission-vitale": {
    name: "Vital Transfer",
    description: `The wizard uses the power level of the chosen opponent to drain life points from them and add them to their own.\nDrain: 1D10 multiplied by the opponent's power level`
  },
  "violence": {
    name: "Violence",
    description: `The wizard removes life points from the opponent of their choice.\nDamage: the result of 1D12 multiplied by power level`
  },
  "carquois-de-fleches-magiques": {
    name: "Quiver of Magic Arrows",
    description: `All opponents take damage.\nDamage: 1D4 multiplied by power level`
  },
  "champ-declairs": {
    name: "Field of Lightning",
    description: `All opponents take damage. Those who succeed on their resistance roll take half damage.\nDamage: 1D6 multiplied by power level`
  },
  "destruction-massive": {
    name: "Mass Destruction",
    description: `All opponents take damage.\nDamage: 1D20 multiplied by power level`
  },
  "disco-laser": {
    name: "Laser Disco",
    description: `All opponents take damage.\nDamage: 1D10 multiplied by power level`
  },
  "pluie-de-boules-de-feu": {
    name: "Rain of Fireballs",
    description: `All opponents take damage. Those who succeed on their resistance roll take half damage.\nDamage: 1D8 multiplied by power level`
  },
  "souffrance-empirique": {
    name: "Empirical Suffering",
    description: `All opponents who fail their resistance roll lose half of their life points.`
  },
  "vapeur-explosive": {
    name: "Explosive Vapor",
    description: `All opponents take damage.\nDamage: 1D8 multiplied by power level`
  },
  "fontaine": {
    name: "Fountain",
    description: `Each opponent gains 20 extra life points, while the user of this stone receives 20 points multiplied by the number of active players.`
  },
  "potion-denergie": {
    name: "Energy Potion",
    description: `The wizard adds life points to themselves.\nLife points: 4D6`
  },
  "potion-denergie-majeure": {
    name: "Major Energy Potion",
    description: `The wizard adds life points to themselves.\nLife points: 5D10`
  },
  "potion-denergie-superieure": {
    name: "Superior Energy Potion",
    description: `The wizard adds life points to themselves.\nLife points: 6D12`
  },
  "potion-denergie-supreme": {
    name: "Supreme Energy Potion",
    description: `The wizard adds life points to themselves.\nLife points: 1D100`
  },
  "puissance-vitale": {
    name: "Vital Power",
    description: `The wizard adds life points to themselves.\nLife points: 1D4 multiplied by power level`
  },
  "puissance-vitale-majeure": {
    name: "Major Vital Power",
    description: `The wizard adds life points to themselves.\nLife points: 1D8 multiplied by power level`
  },
  "puissance-vitale-superieure": {
    name: "Superior Vital Power",
    description: `The wizard adds life points to themselves.\nLife points: 1D10 multiplied by power level`
  },
  "puissance-vitale-supreme": {
    name: "Supreme Vital Power",
    description: `The wizard adds life points to themselves.\nLife points: 1D12 multiplied by power level`
  },
  "colere-du-magicien": {
    name: "Wizard's Wrath",
    description: `An opponent who fails the resistance roll falls into total paralysis. The attacker immediately throws a second stone from the "AD" category, and the target has no right to retaliate or make a resistance roll. They receive double damage if it is a card that subtracts life points.`
  },
  "sommeil": {
    name: "Sleep",
    description: `The wizard places this card in front of the player to their left. An opponent who fails the resistance roll loses their turn. Then, for one full turn, all other players may attack them. They have no right to retaliate, since they are asleep.`
  },
  "telepathie": {
    name: "Telepathy",
    description: `The opponent must show all of their cards to the user of this spell.`
  },
  "transfert-de-corps": {
    name: "Body Transfer",
    description: `The attacker swaps bodies with the opponent of their choice. They take possession of everything: objects, cards, life points, and even the seat itself. The opponent takes the attacker's place with the attacker's attributes.`
  },
  "vitesse-double": {
    name: "Double Speed",
    description: `This stone allows the attacker to use two other cards of their choice. These cards must be played one after another. Missing cards are drawn at the end of the turn.`
  },
  "malediction": {
    name: "Curse",
    description: `The attacker places this card in front of the opponent of their choice. That opponent's resistance roll is reduced by 5 until they are freed from this spell.`
  },
  "champ-vampirique-demmerlaus": {
    name: "Emmerlaus's Vampiric Field",
    description: `The attacker drains life points from all opponents and gives them to themselves.\nDrain: 1D8 multiplied by power level`
  },
  "intervention-divine-demmerlaus": {
    name: "Emmerlaus's Divine Intervention",
    description: `All players get rid of every card in their hands, spells, and objects on the table. The attacker receives a 25 HP bonus and has the right to keep one card from their deck in their possession.\nShuffle all cards again, except this one, which is set aside in the talon.`
  },
  "sacrifice-demmerlaus": {
    name: "Emmerlaus's Sacrifice",
    description: `The attacker sacrifices as many of their own life points as they choose. All opponents make a resistance roll. Those who fail take the same amount of damage as the life points sacrificed. Those who succeed take half damage.`
  },
  "sanctuaire-demmerlaus": {
    name: "Emmerlaus's Sanctuary",
    description: `The wizard places this card in front of themselves for one full turn. They gain 25 life points plus 1D8 multiplied by power level. No one may attack them during that turn.`
  },
  "tenebres-demmerlaus": {
    name: "Emmerlaus's Darkness",
    description: `Darkness engulfs and makes all opponents suffer. Those who succeed on their resistance roll take half damage.\nDamage: 1D12 multiplied by power level`
  }
} satisfies Record<string, { name: string; description: string }>;

const englishCardLocalizationLookup: Record<string, { name: string; description: string }> = englishCardLocalizationById;

function localizeBaseCardDefinitions(cards: BaseCardDefinition[]): BaseCardDefinition[] {
  return cards.map((card) => ({
    ...card,
    localization: {
      fr: {
        name: card.name,
        description: card.description
      },
      en: englishCardLocalizationLookup[card.id] ?? {
        name: card.name,
        description: card.description
      }
    }
  }));
}

export const defaultDefenseBandByCategory = {
  "A": null,
  "O": null,
  "AD": {
    "resistance": {
      "color": "blue",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": true,
    "annulationAllowed": true,
    "annulationCardsRequired": 1,
    "mirrorAllowed": true
  },
  "AM": {
    "resistance": {
      "color": "yellow",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": true,
    "annulationAllowed": true,
    "annulationCardsRequired": 1,
    "mirrorAllowed": true
  },
  "CA": null,
  "CO": {
    "resistance": {
      "color": "blue",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": true,
    "annulationAllowed": true,
    "annulationCardsRequired": 1,
    "mirrorAllowed": true
  },
  "E": {
    "resistance": {
      "color": "yellow",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": true,
    "annulationAllowed": true,
    "annulationCardsRequired": 2,
    "mirrorAllowed": true
  },
  "S": {
    "resistance": {
      "color": "blue",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": true,
    "annulationAllowed": true,
    "annulationCardsRequired": 1,
    "mirrorAllowed": true
  },
  "SO": {
    "resistance": {
      "color": "blue",
      "rollsRequired": 1
    },
    "resistanceAccrueAllowed": false,
    "annulationAllowed": true,
    "annulationCardsRequired": 2,
    "mirrorAllowed": false
  },
  "ST": {
    "resistance": {
      "color": "red",
      "rollsRequired": 0
    },
    "resistanceAccrueAllowed": false,
    "annulationAllowed": true,
    "annulationCardsRequired": 1,
    "mirrorAllowed": false
  }
} satisfies Record<CardCategoryCode, DefenseBandRules | null>;

export const baseCardDefinitions = localizeBaseCardDefinitions([
  {
    "id": "anneau-de-puissance-1",
    "name": "Anneau de puissance +1",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. Elle augmente le niveau de puissance de 1 aussi longtemps que le magicien portera l'anneau.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Anneau-de-puissance-1-18cef519dd6580b7b4a1f9a0910b4854",
    "baseDeckQuantity": 5,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Alliés",
      "Communion",
      "Compagnons",
      "Destin",
      "Invocation",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Anneau_de_puissance_+1.png",
      "importedAssetPath": "client/public/assets/cards/base/anneau-de-puissance-1.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aca10cf3c-4303-49a8-b72b-9f896c2f41a7%3AAnneau_de_puissance_1.png?table=block&id=18cef519-dd65-80d5-87e9-f1fd8372e5ed&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "power_modifier",
          "amount": 1
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "anneau-de-puissance-2",
    "name": "Anneau de puissance +2",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. Elle augmente le niveau de puissance de 2 aussi longtemps que le magicien portera l’anneau.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Anneau-de-puissance-2-18fef519dd6580229956cbd1fd584aab",
    "baseDeckQuantity": 3,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Alliés",
      "Communion",
      "Compagnons",
      "Destin",
      "Invocation",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Anneau_de_puissance_+2.png",
      "importedAssetPath": "client/public/assets/cards/base/anneau-de-puissance-2.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A769b2d97-8a7b-49f6-907f-72e2d2ff0220%3AAnneau_de_puissance_2.png?table=block&id=18fef519-dd65-8045-a161-ce388ee99929&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "manual_override",
      "needsImageReview": true
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "power_modifier",
          "amount": 2
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "anneau-de-puissance-3",
    "name": "Anneau de puissance +3",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. Elle augmente le niveau de puissance de 3 aussi longtemps que le magicien portera l'anneau.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Anneau-de-puissance-3-192ef519dd658021a9c8f1f53f08a5f2",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Anneau_de_puissance_+3.png",
      "importedAssetPath": "client/public/assets/cards/base/anneau-de-puissance-3.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A5c793d0f-9c6b-4dfe-92c9-3f99c12fc73a%3AAnneau_de_puissance_3.png?table=block&id=192ef519-dd65-81b5-bedc-d91ffc01d07e&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "power_modifier",
          "amount": 3
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "anneau-de-resurrection",
    "name": "Anneau de résurrection",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée sur la table pour être active. Si le porteur meurt, il ressuscite avec 50 points de vie. Ensuite, il doit jeter l'anneau et piger 5 nouvelles cartes en gardant les autres objets devant lui.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Anneau-de-r-surrection-192ef519dd658032878dea374ef9b298",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Anneau_de_resurrection.png",
      "importedAssetPath": "client/public/assets/cards/base/anneau-de-resurrection.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4013345c-8ebb-4eea-b799-53b70b7817b7%3AAnneau_de_rsurrection.png?table=block&id=192ef519-dd65-8055-81f0-c6d819895991&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "resurrection_ring",
          "reviveHp": 50,
          "redrawCards": 5,
          "keepOtherObjects": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "robe-de-protection-2",
    "name": "Robe de protection +2",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. La robe augmente les chances de réussite du jet de résistance à 12 au lieu de 10 et cela, tant que le magicien la portera.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Robe-de-protection-2-192ef519dd6580278140eccbab460d1c",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Robe_de_protection_+2.png",
      "importedAssetPath": "client/public/assets/cards/base/robe-de-protection-2.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa168b929-d230-4a8f-9517-58173ec34e32%3ARobe_de_protection_2.png?table=block&id=192ef519-dd65-814c-92c7-da737560f2b0&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": 2,
          "duration": "until_removed"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "robe-de-protection-3",
    "name": "Robe de protection +3",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. La robe augmente les chances de réussite du jet de résistance à 13 au lieu de 10 et cela, tant que le magicien la portera.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Robe-de-protection-3-192ef519dd658056b393f8e5ee230d9a",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Robe_de_protection_+3.png",
      "importedAssetPath": "client/public/assets/cards/base/robe-de-protection-3.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A3ce13773-c461-418f-8985-cf4003b0c886%3ARobe_de_protection_3.png?table=block&id=192ef519-dd65-80a3-8475-e215dd429c07&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": 3,
          "duration": "until_removed"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "robe-dabsorption",
    "name": "Robe d’absorption",
    "category": {
      "label": "Objets",
      "code": "O",
      "raw": "Objets (O)"
    },
    "description": "Cette carte doit être déposée devant soi pour être active. Contre chaque attaque réussie dirigée envers lui, le magicien est protégé contre toutes attaques impliquant des dégâts physiques. À chaque attaque, cette robe absorbe le lancer de 1D10 des points de dégâts et cela, tant que le magicien la portera.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Robe-d-absorption-192ef519dd658005a3e7f50fbdcd0a88",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Robe_dabsorption.png",
      "importedAssetPath": "client/public/assets/cards/base/robe-dabsorption.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A3a69159d-cb96-4a28-872b-3a7fddb1657a%3ARobe_dabsorption.png?table=block&id=192ef519-dd65-8193-a11d-d9adde4f5b19&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": null,
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "absorb_damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10"
          },
          "appliesTo": "all_hp_loss_attacks"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "depouillement",
    "name": "Dépouillement",
    "category": {
      "label": "Contre-objets",
      "code": "CO",
      "raw": "Contre-objets (CO)"
    },
    "description": "L'adversaire manquant son jet de résistance perd tous les objets portés (cartes « O » déposées devant lui).",
    "sourceUrl": "https://wikiemmerlaus.notion.site/D-pouillement-192ef519dd6580acaa7bec47d8c46b5d",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base",
      "Alliés",
      "Destin",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Depouillement.png",
      "importedAssetPath": "client/public/assets/cards/base/depouillement.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4b5c7af0-1a3c-4a54-aa80-4928e0eaefe0%3ADpouillement.png?table=block&id=192ef519-dd65-80d4-9787-ee3db7bd75a7&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_player_or_object",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "remove_target_object",
          "mode": "all"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "dissipation-dun-anneau",
    "name": "Dissipation d’un anneau",
    "category": {
      "label": "Contre-objets",
      "code": "CO",
      "raw": "Contre-objets (CO)"
    },
    "description": "L'adversaire jette l'anneau porté, au choix de l'attaquant.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Dissipation-d-un-anneau-192ef519dd6580c7919dce3295df9bd9",
    "baseDeckQuantity": 2,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Alliés",
      "Communion",
      "Destin",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Dissipation_dun_anneau.png",
      "importedAssetPath": "client/public/assets/cards/base/dissipation-dun-anneau.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A58e4e135-136a-45bf-9d0d-4e1775580a80%3ADissipation_dun_anneau.png?table=block&id=192ef519-dd65-815f-a409-c53c9b462516&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "allowedSlots": [
            "anneau"
          ]
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "la-main-qui-vole",
    "name": "La main qui vole",
    "category": {
      "label": "Contre-objets",
      "code": "CO",
      "raw": "Contre-objets (CO)"
    },
    "description": "Permet au lanceur de ce sort de prendre chez l'adversaire l'objet de son choix (l'objet doit être sur la table).",
    "sourceUrl": "https://wikiemmerlaus.notion.site/La-main-qui-vole-192ef519dd65809cbad0c0676db4bcf7",
    "baseDeckQuantity": 2,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Communion",
      "Compagnons",
      "Destin",
      "Invocation",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/La_main_qui_vole.png",
      "importedAssetPath": "client/public/assets/cards/base/la-main-qui-vole.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A63344762-8023-48ee-9b34-72f71438035b%3ALa_main_qui_vole.png?table=block&id=192ef519-dd65-8013-87b5-d3b2750a8ffd&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "steal_target_object",
          "mode": "chosen_by_attacker"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "annulation",
    "name": "Annulation",
    "category": {
      "label": "Contre-attaques",
      "code": "CA",
      "raw": "Contre-attaques (CA)"
    },
    "description": "Annule la dernière pierre jetée de l'adversaire.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Annulation-192ef519dd6580439430c754166efc12",
    "baseDeckQuantity": 6,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Communion",
      "Destin",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Annulation.png",
      "importedAssetPath": "client/public/assets/cards/base/annulation.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A71787310-d2f2-4f4e-a6c5-7778bac03d5e%3AAnnulation.png?table=block&id=192ef519-dd65-8190-8b10-c156f0d09982&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "none",
      "targets": "none",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": []
    },
    "implementation": {
      "status": "generic",
      "notes": "Migrated from the previous centralized response-card defaults."
    }
  },
  {
    "id": "miroir",
    "name": "Miroir",
    "category": {
      "label": "Contre-attaques",
      "code": "CA",
      "raw": "Contre-attaques (CA)"
    },
    "description": "Retourne les effets de la dernière pierre de l'adversaire sur lui-même. Le niveau de puissance utilisé de la pierre ainsi retournée est celui de l'attaquant original.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Miroir-192ef519dd6580ab970ec6195fd24214",
    "baseDeckQuantity": 5,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Communion",
      "Destin",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Miroir.png",
      "importedAssetPath": "client/public/assets/cards/base/miroir.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A25ae4dd8-ee28-4377-a24f-39d57a5d71ee%3AMiroir.png?table=block&id=192ef519-dd65-80e4-8830-f1a255b1d8b5&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "none",
      "targets": "none",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": []
    },
    "implementation": {
      "status": "generic",
      "notes": "Migrated from the previous centralized response-card defaults."
    }
  },
  {
    "id": "resistance-accrue",
    "name": "Résistance accrue",
    "category": {
      "label": "Contre-attaques",
      "code": "CA",
      "raw": "Contre-attaques (CA)"
    },
    "description": "Augmente le jet de résistance pour un tour seulement.\nProtection : Niveau de puissance additionné au jet de résistance.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/R-sistance-accrue-192ef519dd658057b8b7e9aa173511d3",
    "baseDeckQuantity": 6,
    "includedDecks": [
      "Jeu de base",
      "Abondance",
      "Communion",
      "Destin",
      "Puissance"
    ],
    "image": {
      "localSourcePath": "images/Resistance_accrue.png",
      "importedAssetPath": "client/public/assets/cards/base/resistance-accrue.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A5a12002c-7263-40b1-9cb6-ad25af455662%3ARsistance_accrue.png?table=block&id=192ef519-dd65-801b-ada4-e2a7efa8d5d1&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "none",
      "targets": "none",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": 0,
          "duration": "current_action"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "ange-gardien",
    "name": "Ange gardien",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -3 sur son jet de résistance contre cette attaque.\nDégâts : 1D20 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Ange-gardien-192ef519dd65805c9beafea1235d782b",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Ange_gardien.png",
      "importedAssetPath": "client/public/assets/cards/base/ange-gardien.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aaccaeb11-7f38-48ce-94c3-646af870571a%3AAnge_gardien.png?table=block&id=192ef519-dd65-805e-a255-f813ea4b8665&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous defaults; gameplay behavior still needs manual verification."
    }
  },
  {
    "id": "arc-electrique",
    "name": "Arc électrique",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D6 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Arc-lectrique-192ef519dd658035b314d7daa8eae8c7",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Arc_electrique.png",
      "importedAssetPath": "client/public/assets/cards/base/arc-electrique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A7234fede-405e-4902-bbb3-84609e7e85de%3AArc_lectrique.png?table=block&id=192ef519-dd65-80ff-8978-d690863de1f5&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D6",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "au-seuil-de-la-mort",
    "name": "Au seuil de la mort",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "L'adversaire manquant son jet de résistance, se voit plonger au seuil de la mort. L'attaquant lance 1D10 et cela indiquera les points de vie restant de l'adversaire.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Au-seuil-de-la-mort-192ef519dd65809799f2d3f7ee7b6af6",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Au_seuil_de_la_mort.png",
      "importedAssetPath": "client/public/assets/cards/base/au-seuil-de-la-mort.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ab7d233b8-0786-4537-8e3f-9382ec14b2a2%3AAu_seuil_de_la_mort.png?table=block&id=192ef519-dd65-809f-952d-cae369b77f61&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "set_target_hp",
          "amount": {
            "kind": "dice",
            "notation": "1D10"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "boule-acidifiee",
    "name": "Boule acidifiée",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D8 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Boule-acidifi-e-192ef519dd6580d0b5dec6f669919ee1",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Boule_acidifiee.png",
      "importedAssetPath": "client/public/assets/cards/base/boule-acidifiee.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A6e7e92c6-500d-4078-8dc1-7e5d7872f841%3ABoule_acidifie.png?table=block&id=192ef519-dd65-801f-8c96-febe1a03d99e&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "boule-de-feu",
    "name": "Boule de feu",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Boule-de-feu-192ef519dd6580f5abc0c012502ae3f9",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Boule_de_feu.png",
      "importedAssetPath": "client/public/assets/cards/base/boule-de-feu.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Af8de9eb4-bb70-4c46-97a9-35247b3d95d5%3ABoule_de_feu.png?table=block&id=192ef519-dd65-808b-ad6d-d9c546ee281b&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "cerceau-de-feu",
    "name": "Cerceau de feu",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D4 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Cerceau-de-feu-192ef519dd65807e8558c01a6faa8213",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Cerceau_de_feu.png",
      "importedAssetPath": "client/public/assets/cards/base/cerceau-de-feu.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa4d22c50-09f0-4bfa-9406-54326d8cb971%3ACerceau_de_feu.png?table=block&id=192ef519-dd65-8068-a441-f6dba9e27937&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "coup-de-vent",
    "name": "Coup de vent",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -3 sur son jet de résistance contre cette attaque.\nDégâts : 1D6 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Coup-de-vent-192ef519dd6580c98f91ef1cfab94683",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Coup_de_vent.png",
      "importedAssetPath": "client/public/assets/cards/base/coup-de-vent.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A356069af-4b78-4e25-9ce5-5d320a087d5b%3ACoup_de_vent.png?table=block&id=192ef519-dd65-80a5-9fe2-f258f0316eb2&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -3,
          "duration": "current_action"
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D6",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "cumulonimbus",
    "name": "Cumulonimbus",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -3 sur son jet de résistance contre cette attaque.\nDégâts : 1D10 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Cumulonimbus-192ef519dd65809fb03cfa9b4230f12c",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Cumulonimbus.png",
      "importedAssetPath": "client/public/assets/cards/base/cumulonimbus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A7a88c36c-795b-4fb0-bd27-2105da19f202%3ACumulonimbus.png?table=block&id=192ef519-dd65-807a-8d0f-feb96cafb804&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -3,
          "duration": "current_action"
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "desintegration",
    "name": "Désintégration",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Si le jet de résistance est manqué, l'adversaire est désintégré, donc mort. La résurrection est impossible.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/D-sint-gration-192ef519dd6580589dbbeefdbdef6eec",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Desintegration.png",
      "importedAssetPath": "client/public/assets/cards/base/desintegration.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A573b520a-e303-4604-a01b-e92bf1f1601c%3ADsintgration.png?table=block&id=192ef519-dd65-8157-a6ab-fd6816b1e849&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "instant_kill",
          "resurrectionBlocked": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "destruction",
    "name": "Destruction",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D20 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Destruction-1a7ef519dd658097927afdecead5501f",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Destruction.png",
      "importedAssetPath": "client/public/assets/cards/base/destruction.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A3897f2c8-022f-42f1-b1b0-2cda1ed823c8%3ADestruction.png?table=block&id=1a7ef519-dd65-812e-9643-c53281891e25&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "dommage",
    "name": "Dommage",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 5 points multipliés par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Dommage-192ef519dd65809089d8ef69e5be834d",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Dommage.png",
      "importedAssetPath": "client/public/assets/cards/base/dommage.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A069c492e-c433-4768-b562-5e2bb9aa029c%3ADommage.png?table=block&id=192ef519-dd65-8059-9ddd-edc2df7577d2&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "fixed",
            "amount": 5,
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "dommage-superieur",
    "name": "Dommage supérieur",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 10 points multipliés par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Dommage-sup-rieur-192ef519dd65809aa67fd21fa5b6f31d",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Dommage_superieur.png",
      "importedAssetPath": "client/public/assets/cards/base/dommage-superieur.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A98028942-de26-4dec-b8c2-b8c68bb91780%3ADommage_suprieur.png?table=block&id=192ef519-dd65-8047-be35-d636bc4f3007&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "fixed",
            "amount": 10,
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "don-adverse",
    "name": "Don adverse",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui sucer des points de vie et se les rajouter.\nSuccion : 1D8 multiplié par le niveau de puissance de l'adversaire",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Don-adverse-192ef519dd6580fabe6cd7c32202c13e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Don_adverse.png",
      "importedAssetPath": "client/public/assets/cards/base/don-adverse.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ac7c9de56-038b-4ea4-9d61-b7a66ab3493f%3ADon_adverse.png?table=block&id=192ef519-dd65-8053-b425-fa197b0b7d31&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": true,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "lifesteal",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_target_power"
          },
          "powerSource": "target"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "eclair",
    "name": "Éclair",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D6 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/clair-192ef519dd6580a48f6fdd350a23c71e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Eclair.png",
      "importedAssetPath": "client/public/assets/cards/base/eclair.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A7028dfee-3d3b-4aa9-a567-ee9e7f00b537%3Aclair.png?table=block&id=192ef519-dd65-808d-b5db-f432fbf7a607&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D6",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "energie-acide",
    "name": "Énergie acide",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D12 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/nergie-acide-192ef519dd6580fa917eff94a35f9273",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Energie_acide.png",
      "importedAssetPath": "client/public/assets/cards/base/energie-acide.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A90e91ec2-cf47-44e1-a357-91363a2cd2e9%3Anergie_acide.png?table=block&id=192ef519-dd65-802f-8d2f-c1b8917b7ae1&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "eruption-acide",
    "name": "Éruption acide",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D6 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/ruption-acide-192ef519dd658088b61cfa0c729b410d",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Eruption_acide.png",
      "importedAssetPath": "client/public/assets/cards/base/eruption-acide.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Af8a68e62-af92-4013-b655-ade56a1fc206%3Aruption_acide.png?table=block&id=192ef519-dd65-8083-8f34-c4319cc67f5e&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "etouffement",
    "name": "Étouffement",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -4 sur son jet de résistance contre cette attaque.\nDégâts : 1D4 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/touffement-192ef519dd658050a6c1cec6f9f6e9b4",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Etouffement.png",
      "importedAssetPath": "client/public/assets/cards/base/etouffement.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A309dcdd7-8834-4f07-b855-37a33f0fdc67%3Atouffement.png?table=block&id=192ef519-dd65-80a4-a093-cd5f68c93030&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -4,
          "duration": "current_action"
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "explosion-energetique",
    "name": "Explosion énergétique",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D12 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Explosion-nerg-tique-192ef519dd658052a79dcd9a7e4c3905",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Explosion_energetique.png",
      "importedAssetPath": "client/public/assets/cards/base/explosion-energetique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A1a5d76a2-e98a-43ee-ba4a-dfbdc0fc888b%3AExplosion_nergtique.png?table=block&id=192ef519-dd65-8075-a22f-dce953381681&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "flechette-acide",
    "name": "Fléchette acide",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D4 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Fl-chette-acide-192ef519dd6580938e58de47a652832e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Flechette_acide.png",
      "importedAssetPath": "client/public/assets/cards/base/flechette-acide.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A937e3bdd-f98d-4e9e-bb0b-a2de912b6046%3AFlchette_acide.png?table=block&id=192ef519-dd65-80cc-92db-dc882ae7a57f&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "fleche-magique",
    "name": "Flèche magique",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D4 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Fl-che-magique-192ef519dd658082b2b8e0ded829dd65",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Fleche_magique.png",
      "importedAssetPath": "client/public/assets/cards/base/fleche-magique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A406e0808-fb0c-4e83-9826-289ccdd0c476%3AFlche_magique.png?table=block&id=192ef519-dd65-803f-9dbc-ddf25b102c1d&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "fouet-enflamme",
    "name": "Fouet enflammé",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D6 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Fouet-enflamm-192ef519dd6580eba8f4e864e181e60a",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Fouet_enflamme.png",
      "importedAssetPath": "client/public/assets/cards/base/fouet-enflamme.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A1a083553-aa10-4b02-932b-e9c2066ee711%3AFouet_enflamm.png?table=block&id=192ef519-dd65-8073-97d5-e4c8ab5a63ca&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D6",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "globe-infernal",
    "name": "Globe infernal",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Globe-infernal-192ef519dd65806b8f82e25029a5f024",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Globe_infernal.png",
      "importedAssetPath": "client/public/assets/cards/base/globe-infernal.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Adfd91b35-955f-4b34-b7aa-96c4207c2052%3AGlobe_infernal.png?table=block&id=192ef519-dd65-808d-b344-edbe74024dee&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "grenacide",
    "name": "Grenacide",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D20 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Grenacide-192ef519dd6580358866de765cc9331c",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Grenacide.png",
      "importedAssetPath": "client/public/assets/cards/base/grenacide.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A421c554d-7ff9-4937-aaed-67e4eda50412%3AGrenacide.png?table=block&id=192ef519-dd65-805a-8683-fdc211e4dc32&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "lance-flamme",
    "name": "Lance-flamme",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D12 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Lance-flamme-192ef519dd65806b8e1add4a1e461a7e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Lance-flamme.png",
      "importedAssetPath": "client/public/assets/cards/base/lance-flamme.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Abd9750b0-8132-4d31-9f96-4af3ff8dd842%3ALance-flamme.png?table=block&id=192ef519-dd65-805d-8ef8-d26a7a591773&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "main-brulante",
    "name": "Main brûlante",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien attaque 5 fois avec cette carte l'adversaire de son choix. Ce dernier a le droit à un jet de résistance par attaque.\nDégâts : 5 attaques de 1D12 points",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Main-br-lante-192ef519dd6580f1b2aed4f68b9f2ab7",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Main_brulante.png",
      "importedAssetPath": "client/public/assets/cards/base/main-brulante.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A417a8044-c5c9-4ccd-9de0-30fec36ad2c5%3AMain_brlante.png?table=block&id=192ef519-dd65-80c7-a591-cc871133aa22&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "resistanceMode": "per_damage_effect",
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12"
          }
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12"
          }
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12"
          }
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12"
          }
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "missile-nucleaire",
    "name": "Missile nucléaire",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D20 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Missile-nucl-aire-192ef519dd6580ad84c7d5b73276be68",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Missile_nucleaire.png",
      "importedAssetPath": "client/public/assets/cards/base/missile-nucleaire.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A883b7f49-af0c-45cb-bccd-43c80736e8c5%3AMissile_nuclaire.png?table=block&id=192ef519-dd65-809f-885e-ee143d2a4829&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "projectile-magique",
    "name": "Projectile magique",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D4 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Projectile-magique-192ef519dd658000ae85c6a61676fbe1",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Projectile_magique.png",
      "importedAssetPath": "client/public/assets/cards/base/projectile-magique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A220344d2-26f2-4260-b6de-ad3a8515e52b%3AProjectile_magique.png?table=block&id=192ef519-dd65-80c4-8333-f13c011b84ff&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "pulverisateur",
    "name": "Pulvérisateur",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D10 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Pulv-risateur-192ef519dd6580469d2be78da9135bd3",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Pulverisateur.png",
      "importedAssetPath": "client/public/assets/cards/base/pulverisateur.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A09dee3d9-3ed3-4240-9eee-d84340fcb614%3APulvrisateur.png?table=block&id=192ef519-dd65-8081-8d5c-d3dc1b0e7c69&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "rayon-acide",
    "name": "Rayon acide",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D10 multiplié par le niveau de puissance\nDe plus, si l'attaque est réussie, le magicien lance 1D6. S'il obtient 1, il écarte à l'adversaire l'objet de son choix.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Rayon-acide-192ef519dd65802697ffd4b9694bf27f",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Rayon_acide.png",
      "importedAssetPath": "client/public/assets/cards/base/rayon-acide.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A5fc95b74-1ae8-4737-b566-fd950d76b3b8%3ARayon_acide.png?table=block&id=192ef519-dd65-8029-aaf1-ca46ae0117ba&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10",
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "remove_target_object",
          "mode": "chosen_by_attacker",
          "chance": {
            "notation": "1D6",
            "successTotals": [
              1
            ]
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "rayon-laser",
    "name": "Rayon laser",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : 1D10 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Rayon-laser-192ef519dd6580818b1af10cb59d679e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Rayon_laser.png",
      "importedAssetPath": "client/public/assets/cards/base/rayon-laser.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A18752a53-0d88-46e5-920b-3d90293e8e7a%3ARayon_laser.png?table=block&id=192ef519-dd65-80b4-8281-cc5d78d2dfb5&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "souffle-enflamme",
    "name": "Souffle enflammé",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D8 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Souffle-enflamm-192ef519dd6580b280abc594f197f0e3",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Souffle_enflamme.png",
      "importedAssetPath": "client/public/assets/cards/base/souffle-enflamme.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ae15034fc-3267-4498-8df7-a48a7a186ed1%3ASouffle_enflamm.png?table=block&id=192ef519-dd65-802d-8cf3-e6abc8e843f0&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "spirale-de-feu",
    "name": "Spirale de feu",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D10 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Spirale-de-feu-192ef519dd65800fb442fece39e75525",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Spirale_de_feu.png",
      "importedAssetPath": "client/public/assets/cards/base/spirale-de-feu.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A603b622a-050c-4311-8798-10fd04bede04%3ASpirale_de_feu.png?table=block&id=192ef519-dd65-80cd-81e2-ec22982748b6&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "succion-vampirique",
    "name": "Succion vampirique",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "L'attaquant suce les points de vie de l'adversaire pour se les donner.\nSuccion : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Succion-vampirique-192ef519dd6580688568d805c4303624",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Succion_vampirique.png",
      "importedAssetPath": "client/public/assets/cards/base/succion-vampirique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A253e4774-b550-4f47-b436-dc8865942a16%3ASuccion_vampirique.png?table=block&id=192ef519-dd65-80a6-b84b-d01493c6e485&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "lifesteal",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          },
          "powerSource": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "super-boule-de-feu",
    "name": "Super boule de feu",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix, avec un bonus de 1 de niveau de puissance pour cette attaque.\nDégâts : 1D20 multiplié par (niveau de puissance +1)",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Super-boule-de-feu-192ef519dd65801998dcd6425d154459",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Super_boule_de_feu.png",
      "importedAssetPath": "client/public/assets/cards/base/super-boule-de-feu.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A7503a36f-190c-4ed5-b1c1-1b96e7b9c092%3ASuper_boule_de_feu.png?table=block&id=192ef519-dd65-8072-8e02-c1141f1026b9&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power",
            "powerBonus": 1
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "torpille",
    "name": "Torpille",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -3 sur son jet de résistance contre cette attaque.\nDégâts : 1D12 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Torpille-192ef519dd65801792b7e99ebc69025e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Torpille.png",
      "importedAssetPath": "client/public/assets/cards/base/torpille.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa15e659f-37bb-47dc-90ad-0dc0ce0fcbb6%3ATorpille.png?table=block&id=192ef519-dd65-80d5-a348-e25ae71fb229&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -3,
          "duration": "current_action"
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "tourbillon",
    "name": "Tourbillon",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix et celui-ci a -3 sur son jet de résistance contre cette attaque.\nDégâts : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Tourbillon-192ef519dd6580c88db6d694373064cf",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Tourbillon.png",
      "importedAssetPath": "client/public/assets/cards/base/tourbillon.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A9abba25f-06a5-4af5-b115-c4ecb65750dd%3ATourbillon.png?table=block&id=192ef519-dd65-8063-ae65-d07daf1c5416&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -3,
          "duration": "current_action"
        },
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "transmission-vitale",
    "name": "Transmission vitale",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien utilise le niveau de puissance de l'adversaire de son choix pour lui sucer des points de vie et se les rajouter.\nSuccion : 1D10 multiplié par le niveau de puissance de l'adversaire",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Transmission-vitale-192ef519dd65801ba018ca94ca56006e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Transmission_vitale.png",
      "importedAssetPath": "client/public/assets/cards/base/transmission-vitale.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ae35934cb-374e-4e44-b20c-95ba5ec58d85%3ATransmission_vitale.png?table=block&id=192ef519-dd65-80b2-a064-f96d4df26d01&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": true,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "lifesteal",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_target_power"
          },
          "powerSource": "target"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "violence",
    "name": "Violence",
    "category": {
      "label": "Attaques directes",
      "code": "AD",
      "raw": "Attaques directes (AD)"
    },
    "description": "Le magicien soustrait des points de vie à l'adversaire de son choix.\nDégâts : le résultat de 1D12 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Violence-192ef519dd658036acbbd38e07ba1e3b",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Violence.png",
      "importedAssetPath": "client/public/assets/cards/base/violence.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa0f265a5-f859-4d5d-8d7f-0d0b8c48a0ca%3AViolence.png?table=block&id=192ef519-dd65-8009-a081-d5a7d8ba8133&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "carquois-de-fleches-magiques",
    "name": "Carquois de flèches magiques",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts. \nDégâts : 1D4 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Carquois-de-fl-ches-magiques-192ef519dd6580ecbe79dca09d860799",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Carquois_de_fleches_magiques.png",
      "importedAssetPath": "client/public/assets/cards/base/carquois-de-fleches-magiques.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4020ad46-0158-4cf8-89ae-8f4ed4b524c7%3ACarquois_de_flches_magiques.png?table=block&id=192ef519-dd65-806d-b274-e3e836b92c30&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": false
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "champ-declairs",
    "name": "Champ d’éclairs",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts. Ceux qui réussissent leur jet de résistance ont la moitié des dégâts.\nDégâts : 1D6 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Champ-d-clairs-192ef519dd658010afe1ef51535ab7f0",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Champ_declairs.png",
      "importedAssetPath": "client/public/assets/cards/base/champ-declairs.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A56d17b05-c2fe-4468-89a8-e7712500b994%3AChamp_dclairs.png?table=block&id=192ef519-dd65-802e-9cf0-fdd887c2df0c&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D6",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "destruction-massive",
    "name": "Destruction massive",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts.\nDégâts : 1D20 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Destruction-massive-192ef519dd6580da93c5e448df9398d8",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Destruction_massive.png",
      "importedAssetPath": "client/public/assets/cards/base/destruction-massive.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4fa9c6db-e8e1-4f86-82e4-e6b087768ae5%3ADestruction_massive.png?table=block&id=192ef519-dd65-807c-a6a8-d5286406bc3e&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D20"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D20",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "disco-laser",
    "name": "Disco laser",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts. \nDégâts : 1D10 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Disco-laser-192ef519dd6580e5aadbc9bcb1b3ab0e",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Disco_laser.png",
      "importedAssetPath": "client/public/assets/cards/base/disco-laser.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ac4b87782-2a76-4f63-ae6e-703eec9b74c5%3ADisco_laser.png?table=block&id=192ef519-dd65-8038-92b1-f80ddf4b6e22&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "pluie-de-boules-de-feu",
    "name": "Pluie de boules de feu",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts. Ceux qui réussissent leur jet de résistance ont la moitié des dégâts.\nDégâts : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Pluie-de-boules-de-feu-192ef519dd658000b8c9d9ecacf30ef8",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Pluie_de_boules_de_feu.png",
      "importedAssetPath": "client/public/assets/cards/base/pluie-de-boules-de-feu.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A3bba2e01-fbc7-4628-93df-7b6af75784aa%3APluie_de_boules_de_feu.png?table=block&id=192ef519-dd65-80f9-ad83-c8214262f1af&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "souffrance-empirique",
    "name": "Souffrance empirique",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires manquant leur jet de résistance perdent la moitié de leurs points de vie.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Souffrance-empirique-192ef519dd65807eab5fed0263119bb9",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Souffrance_empirique.png",
      "importedAssetPath": "client/public/assets/cards/base/souffrance-empirique.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A9d3a3e27-259c-4388-a034-79be9683f969%3ASouffrance_empirique.png?table=block&id=192ef519-dd65-80bd-a25c-da0b5ace4f29&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "current_hp_fraction",
            "numerator": 1,
            "denominator": 2
          }
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "vapeur-explosive",
    "name": "Vapeur explosive",
    "category": {
      "label": "Attaques massives",
      "code": "AM",
      "raw": "Attaques massives (AM)"
    },
    "description": "Tous les adversaires reçoivent des dégâts. \nDégâts : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Vapeur-explosive-192ef519dd6580abb5e5cd071921a528",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Vapeur_explosive.png",
      "importedAssetPath": "client/public/assets/cards/base/vapeur-explosive.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ad9978f31-b2f3-47f8-896c-df25e9ead555%3AVapeur_explosive.png?table=block&id=192ef519-dd65-80e7-ba3b-d1bceacc716a&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "fontaine",
    "name": "Fontaine",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Chaque adversaire reçoit 20 points de vie supplémentaires, alors que l'utilisateur de cette pierre reçoit 20 points multipliés par le nombre de joueurs actifs.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Fontaine-192ef519dd6580fd8a3bd3d7e67727f9",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Fontaine.png",
      "importedAssetPath": "client/public/assets/cards/base/fontaine.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Acf7590b8-d049-4e3c-9389-241160e9119e%3AFontaine.png?table=block&id=192ef519-dd65-805f-b80d-e0b25c86c1ca&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "fixed",
            "amount": 20
          },
          "target": "all_opponents"
        },
        {
          "type": "heal",
          "amount": {
            "kind": "total_active_players_times",
            "amount": 20
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "potion-denergie",
    "name": "Potion d’énergie",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 4D6",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Potion-d-nergie-193ef519dd6580abb338d0e8845ddbb8",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Potion_denergie.png",
      "importedAssetPath": "client/public/assets/cards/base/potion-denergie.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A3ee135bd-0b26-4299-a922-949150821791%3APotion_dnergie.png?table=block&id=193ef519-dd65-8107-8419-d96774e5678f&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "4D6"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "4D6"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "potion-denergie-majeure",
    "name": "Potion d’énergie majeure",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 5D10",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Potion-d-nergie-majeure-193ef519dd6580fdacb5e50b63471d71",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Potion_denergie_majeure.png",
      "importedAssetPath": "client/public/assets/cards/base/potion-denergie-majeure.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Afcffa27b-7f71-4789-a668-10dc433ea903%3APotion_dnergie_majeure.png?table=block&id=193ef519-dd65-8055-8499-c416dffd43c7&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "5D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "5D10"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "potion-denergie-superieure",
    "name": "Potion d’énergie supérieure",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 6D12",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Potion-d-nergie-sup-rieure-193ef519dd6580148f00cd293c792364",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Potion_denergie_superieure.png",
      "importedAssetPath": "client/public/assets/cards/base/potion-denergie-superieure.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A5207cb45-ac7a-4010-98af-8089e6919a50%3APotion_dnergie_suprieure.png?table=block&id=193ef519-dd65-80b9-9c23-db9d83abcdaf&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "6D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "6D12"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "potion-denergie-supreme",
    "name": "Potion d’énergie suprême",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 1D100",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Potion-d-nergie-supr-me-193ef519dd65806da3add919d823edb7",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Potion_denergie_supreme.png",
      "importedAssetPath": "client/public/assets/cards/base/potion-denergie-supreme.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Adb7c6e46-ae73-4859-80c3-1b11d4b25d08%3APotion_dnergie_suprme.png?table=block&id=193ef519-dd65-80db-b242-e4ca949ac9c2&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D100"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "1D100"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "puissance-vitale",
    "name": "Puissance vitale",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 1D4 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Puissance-vitale-193ef519dd65807f869ef429af0e7039",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Puissance_vitale.png",
      "importedAssetPath": "client/public/assets/cards/base/puissance-vitale.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A8bc2e23b-4aeb-42b9-a6ff-63b7c4158a7c%3APuissance_vitale.png?table=block&id=193ef519-dd65-808c-86b8-de7f13d3ec86&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D4"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "1D4",
            "scaleBy": "multiply_power"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "puissance-vitale-majeure",
    "name": "Puissance vitale majeure",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Puissance-vitale-majeure-193ef519dd658024a28bd1384c452e14",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Puissance_vitale_majeure.png",
      "importedAssetPath": "client/public/assets/cards/base/puissance-vitale-majeure.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4c7e84e3-16e8-43df-89ba-d64f539f7d1f%3APuissance_vitale_majeure.png?table=block&id=193ef519-dd65-8064-8a45-f7744560a55d&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "puissance-vitale-superieure",
    "name": "Puissance vitale supérieure",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 1D10 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Puissance-vitale-sup-rieure-193ef519dd65803f8678dd90da532cf5",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Puissance_vitale_superieure.png",
      "importedAssetPath": "client/public/assets/cards/base/puissance-vitale-superieure.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A4c58f2ad-cbc7-4771-a99b-2cb9c8ea79fd%3APuissance_vitale_suprieure.png?table=block&id=193ef519-dd65-8052-9f68-c19181219f35&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D10"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "1D10",
            "scaleBy": "multiply_power"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "puissance-vitale-supreme",
    "name": "Puissance vitale suprême",
    "category": {
      "label": "Attributs",
      "code": "A",
      "raw": "Attributs (A)"
    },
    "description": "Le magicien se rajoute des points de vie.\nPoints de vie : 1D12 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Puissance-vitale-supr-me-193ef519dd6580e694bff3bee3b66671",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Puissance_vitale_supreme.png",
      "importedAssetPath": "client/public/assets/cards/base/puissance-vitale-supreme.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A1f339dca-8714-48f9-a745-8c33668d3274%3APuissance_vitale_suprme.png?table=block&id=193ef519-dd65-8085-a57b-edfcb3a55120&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "heal",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "colere-du-magicien",
    "name": "Colère du magicien",
    "category": {
      "label": "Spéciales",
      "code": "S",
      "raw": "Spéciales (S)"
    },
    "description": "L'adversaire manquant son jet de résistance tombe en paralysie totale. L'attaquant jette immédiatement une 2e pierre de la catégorie « AD », et celui-ci n'a aucun droit de riposte ni de jet de résistance. Il reçoit le double des dégâts s’il s’agit d’une carte soustrayant des points de vie.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Col-re-du-magicien-193ef519dd658014ad36e21d01dc9d8b",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Colere_du_magicien.png",
      "importedAssetPath": "client/public/assets/cards/base/colere-du-magicien.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A5da2be41-470d-420e-ad7f-0594a164e237%3AColre_du_magicien.png?table=block&id=193ef519-dd65-8017-bd16-c71497b07206&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": true,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "paralyze_for_bonus_attack",
          "doubledDamageForForcedAttack": true
        },
        {
          "type": "disable_riposte",
          "target": "target",
          "duration": "current_action"
        }
      ]
    },
    "implementation": {
      "status": "needs_handler",
      "notes": "Migrated from previous explicit rules; this card needs a dedicated gameplay handler."
    }
  },
  {
    "id": "sommeil",
    "name": "Sommeil",
    "category": {
      "label": "Spéciales",
      "code": "S",
      "raw": "Spéciales (S)"
    },
    "description": "Le magicien dépose cette carte devant le joueur à sa gauche. L'adversaire manquant son jet de résistance passe son tour. Ensuite, pour un tour complet, tous les autres joueurs peuvent l'attaquer. Il n'a aucun droit de riposte, puisqu'il est endormi.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Sommeil-193ef519dd6580779840e3a28d1ce256",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Sommeil.png",
      "importedAssetPath": "client/public/assets/cards/base/sommeil.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa5ea932e-d57a-49ac-b6c6-e80e8fbfba90%3ASommeil.png?table=block&id=193ef519-dd65-8019-a696-cc253ee4064c&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": true,
      "annulationCardsRequired": 1,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": true,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "left_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "skip_turn",
          "target": "target",
          "durationTurns": 1
        },
        {
          "type": "disable_riposte",
          "target": "target",
          "duration": "full_turn"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "telepathie",
    "name": "Télépathie",
    "category": {
      "label": "Spéciales",
      "code": "S",
      "raw": "Spéciales (S)"
    },
    "description": "L'adversaire doit montrer toutes ses cartes à l'utilisateur de ce sort.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/T-l-pathie-193ef519dd6580509125cc1bea5a2742",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Telepathie.png",
      "importedAssetPath": "client/public/assets/cards/base/telepathie.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ace0e124c-34be-4095-955d-391bb0f06bdb%3ATlpathie.png?table=block&id=193ef519-dd65-8085-a577-faa23f5eda8b&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "look_at_hand",
          "target": "chosen_opponent"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "transfert-de-corps",
    "name": "Transfert de corps",
    "category": {
      "label": "Spéciales",
      "code": "S",
      "raw": "Spéciales (S)"
    },
    "description": "L'attaquant change de corps avec l'adversaire de son choix. Il prend possession de tout : objets, cartes, points de vie et prend même sa place. L'adversaire prend la place de l'attaquant avec les attributs de l'attaquant.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Transfert-de-corps-193ef519dd6580f9850af2129bf8f31d",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Transfert_de_corps.png",
      "importedAssetPath": "client/public/assets/cards/base/transfert-de-corps.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Aa7e2012f-812e-4808-9813-2df5ab54f48b%3ATransfert_de_corps.png?table=block&id=193ef519-dd65-80d1-bff8-ed1c88c637be&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "blue",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": true,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "swap_bodies",
          "swapSeatOrder": true,
          "swapHand": true,
          "swapHp": true,
          "swapObjects": true,
          "swapStatuses": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "vitesse-double",
    "name": "Vitesse double",
    "category": {
      "label": "Stratégies",
      "code": "ST",
      "raw": "Stratégies (ST)"
    },
    "description": "Cette pierre permet à l’attaquant d’utiliser deux autres cartes de son choix. Ces cartes doivent être jouées une à la suite de l’autre. On pige les cartes manquantes à la fin de notre tour.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Vitesse-double-193ef519dd6580558541ec96e171b436",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Vitesse_double.png",
      "importedAssetPath": "client/public/assets/cards/base/vitesse-double.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ada031c1f-55c4-4ca4-846b-54960b5aa86e%3AVitesse_double.png?table=block&id=193ef519-dd65-8012-ac16-f3c6c9a32fc9&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": true,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "manual_override",
      "needsImageReview": true
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "play_extra_cards",
          "count": 2,
          "allowedCategories": "any",
          "refillAtTurnEnd": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "malediction",
    "name": "Malédiction",
    "category": {
      "label": "Sortilèges",
      "code": "SO",
      "raw": "Sortilèges (SO)"
    },
    "description": "L'attaquant dépose cette carte devant l'adversaire de son choix. L'adversaire voit son jet de résistance être diminué de 5 et cela, tant qu'il ne sera pas libéré de ce sortilège.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Mal-diction-193ef519dd6580918274cdf1bed2fbbc",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Malediction.png",
      "importedAssetPath": "client/public/assets/cards/base/malediction.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ac7d81c30-b441-4403-bc66-def82932c5a1%3AMaldiction.png?table=block&id=193ef519-dd65-80f2-b627-c7352e92d6fb&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 2,
      "mirrorAllowed": true
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "target",
      "targets": "single_opponent",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": true,
      "effects": [
        {
          "type": "modify_resistance",
          "amount": -5,
          "duration": "until_removed"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "champ-vampirique-demmerlaus",
    "name": "Champ vampirique d’Emmerlaüs",
    "category": {
      "label": "Emmerlaüs",
      "code": "E",
      "raw": "Emmerlaüs (E)"
    },
    "description": "L'attaquant suce les points de vie de tous les adversaires pour se les donner.\nSuccion : 1D8 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Champ-vampirique-d-Emmerla-s-193ef519dd65804f9086e45b8449c5c1",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Champ_vampirique_dEmmerlaus.png",
      "importedAssetPath": "client/public/assets/cards/base/champ-vampirique-demmerlaus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A14bae095-51a4-4f26-96b8-a2ea8dcebddc%3AChamp_vampirique_dEmmerlas.png?table=block&id=193ef519-dd65-80cb-b69e-e4e0d3b38de5&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "lifesteal",
          "amount": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          },
          "powerSource": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "intervention-divine-demmerlaus",
    "name": "Intervention divine d’Emmerlaüs",
    "category": {
      "label": "Emmerlaüs",
      "code": "E",
      "raw": "Emmerlaüs (E)"
    },
    "description": "Tous les joueurs se débarrassent de toutes les cartes dans leurs mains, sorts et objets sur la table. L'attaquant reçoit un bonus de 25 points de vie et a le droit de garder une carte de son jeu en sa possession.\nBrasser à nouveau toutes les cartes, sauf celle-ci que l'on écarte au talon.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Intervention-divine-d-Emmerla-s-193ef519dd6580fca0f2e51d8219c509",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Intervention_divine_dEmmerlaus.png",
      "importedAssetPath": "client/public/assets/cards/base/intervention-divine-demmerlaus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A469e857e-3dea-41f9-98ad-9accdae9fe50%3AIntervention_divine_dEmmerlas.png?table=block&id=193ef519-dd65-8007-96a8-e32b242d22ed&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 2,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": true,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": false,
      "staysInPlay": false,
      "effects": [
        {
          "type": "board_reset",
          "keeperCards": 1,
          "attackerHpBonus": 25,
          "discardSelfToTalon": true,
          "reshuffleAllOtherCards": true
        },
        {
          "type": "dealer_message",
          "messageKey": "intervention_divine_reset"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "sacrifice-demmerlaus",
    "name": "Sacrifice d’Emmerlaüs",
    "category": {
      "label": "Emmerlaüs",
      "code": "E",
      "raw": "Emmerlaüs (E)"
    },
    "description": "L’attaquant sacrifie ses points de vie au nombre de son choix. Tous les adversaires lancent un jet de résistance. Ceux qui le manquent reçoivent le même nombre de dégâts que les points de vie sacrifiés. Ceux qui le réussissent reçoivent la moitié des dégâts.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Sacrifice-d-Emmerla-s-193ef519dd6580ae8afadd418165ecea",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Sacrifice_dEmmerlaus.png",
      "importedAssetPath": "client/public/assets/cards/base/sacrifice-demmerlaus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3Ae8e61395-2394-425f-84f8-164a2c006be6%3ASacrifice_dEmmerlas.png?table=block&id=193ef519-dd65-8041-a5ce-f2cbf8caec47&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": true,
      "annulationCardsRequired": 2,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": []
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "sacrifice_amount"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "sanctuaire-demmerlaus",
    "name": "Sanctuaire d’Emmerlaüs",
    "category": {
      "label": "Emmerlaüs",
      "code": "E",
      "raw": "Emmerlaüs (E)"
    },
    "description": "Le magicien dépose cette carte devant lui pour un tour complet. Il reçoit 25 points de vie plus 1D8 multiplié par le niveau de puissance. Personne ne peut l'attaquer pendant ce tour.",
    "sourceUrl": "https://wikiemmerlaus.notion.site/Sanctuaire-d-Emmerla-s-193ef519dd65805399a8df74f5a1c9bd",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Sanctuaire_dEmmerlaus.png",
      "importedAssetPath": "client/public/assets/cards/base/sanctuaire-demmerlaus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A12b477f1-a29f-48f8-b699-0af2328e7a11%3ASanctuaire_dEmmerlas.png?table=block&id=193ef519-dd65-808d-bf09-c2ff3be367a6&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "red",
        "rollsRequired": 0
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": false,
      "targets_left_player": false,
      "targets_self": true,
      "requires_resistance": false,
      "half_on_successful_resistance": false,
      "grants_healing": true,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": true,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D8"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "self",
      "requiresDefenseWindow": false,
      "requiresResistanceCheck": false,
      "staysInPlay": true,
      "effects": [
        {
          "type": "grant_attack_immunity",
          "durationTurns": 1,
          "onlyAgainstAttacks": true,
          "bonusHeal": {
            "kind": "dice",
            "notation": "1D8",
            "scaleBy": "multiply_power"
          }
        },
        {
          "type": "heal",
          "amount": {
            "kind": "fixed",
            "amount": 25
          },
          "target": "self"
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  },
  {
    "id": "tenebres-demmerlaus",
    "name": "Ténèbres d’Emmerlaüs",
    "category": {
      "label": "Emmerlaüs",
      "code": "E",
      "raw": "Emmerlaüs (E)"
    },
    "description": "C'est le noir qui englobe et fait souffrir tous les adversaires. Ceux qui réussissent leur jet de résistance ont la moitié des dégâts.\nDégâts : 1D12 multiplié par le niveau de puissance",
    "sourceUrl": "https://wikiemmerlaus.notion.site/T-n-bres-d-Emmerla-s-193ef519dd658081a715c23fdfa2ff4f",
    "baseDeckQuantity": 1,
    "includedDecks": [
      "Jeu de base"
    ],
    "image": {
      "localSourcePath": "images/Tenebres_dEmmerlaus.png",
      "importedAssetPath": "client/public/assets/cards/base/tenebres-demmerlaus.png",
      "remoteUrl": "https://wikiemmerlaus.notion.site/image/attachment%3A6d74bdb6-4359-43e3-9a36-0524366693bc%3ATnbres_dEmmerlas.png?table=block&id=193ef519-dd65-800d-9269-f43fead9cece&spaceId=5e58e032-d2f3-4920-9eb3-3cc808a95ce2&width=640&userId=&cache=v2"
    },
    "defenseBand": {
      "resistance": {
        "color": "yellow",
        "rollsRequired": 1
      },
      "resistanceAccrueAllowed": false,
      "annulationAllowed": false,
      "annulationCardsRequired": 0,
      "mirrorAllowed": false
    },
    "effectHints": {
      "targets_all_opponents": true,
      "targets_left_player": false,
      "targets_self": false,
      "requires_resistance": true,
      "half_on_successful_resistance": true,
      "grants_healing": false,
      "uses_opponent_power": false,
      "moves_or_steals_object": false,
      "stays_in_play": false,
      "extra_turn_flow": false,
      "dice_mentions": [
        "1D12"
      ]
    },
    "normalization": {
      "textSource": "json_primary",
      "needsImageReview": false
    },
    "rules": {
      "selectionMode": "confirm",
      "targets": "all_opponents",
      "requiresDefenseWindow": true,
      "requiresResistanceCheck": true,
      "staysInPlay": false,
      "effects": [
        {
          "type": "damage",
          "amount": {
            "kind": "dice",
            "notation": "1D12",
            "scaleBy": "multiply_power"
          },
          "grantsHalfDamageOnResistance": true
        }
      ]
    },
    "implementation": {
      "status": "manual",
      "notes": "Migrated from previous explicit rules; formula/effects still need manual verification."
    }
  }
] satisfies BaseCardDefinition[]);

export const baseCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  baseCardDefinitions.map((card) => [card.id, card])
);
