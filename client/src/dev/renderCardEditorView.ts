import type {
  BaseCardDefinition,
  CardCategoryCode,
  CardEffect,
  DevCardCatalogId,
  DefenseBandRules,
  RollExpression
} from "../../../shared/cards/types";
import { getImportedCardImageUrl } from "../cards/cardImageUrls";

export interface CardEditorViewParams {
  cards: BaseCardDefinition[];
  card: BaseCardDefinition;
  currentIndex: number;
  deckOptions: Array<{ id: DevCardCatalogId; label: string }>;
  selectedDeck: DevCardCatalogId;
  statusMessage: string;
  isSaving: boolean;
}

const CATEGORY_OPTIONS: Array<{ code: CardCategoryCode; label: string }> = [
  { code: "AD", label: "Attaques directes" },
  { code: "AM", label: "Attaques massives" },
  { code: "A", label: "Accessoires" },
  { code: "O", label: "Objets" },
  { code: "E", label: "Énergies" },
  { code: "S", label: "Sorts" },
  { code: "CA", label: "Contre-attaques" },
  { code: "CO", label: "Contre-objets" },
  { code: "ST", label: "Sortilèges" },
  { code: "SO", label: "Sorts objets" }
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function selected(value: string, candidate: string): string {
  return value === candidate ? "selected" : "";
}

function checked(value: boolean): string {
  return value ? "checked" : "";
}

function defenseBandOrDefault(card: BaseCardDefinition): DefenseBandRules {
  return card.defenseBand ?? {
    resistance: {
      color: "red",
      rollsRequired: 0
    },
    resistanceAccrueAllowed: false,
    annulationAllowed: false,
    annulationCardsRequired: 0,
    mirrorAllowed: false
  };
}

function findPrimaryFormulaEffect(card: BaseCardDefinition): CardEffect | null {
  return card.rules.effects.find((effect) =>
    effect.type === "damage" ||
    effect.type === "heal" ||
    effect.type === "lifesteal"
  ) ?? null;
}

function getFormula(effect: CardEffect | null): RollExpression {
  if (
    effect?.type === "damage" ||
    effect?.type === "heal" ||
    effect?.type === "lifesteal"
  ) {
    return effect.amount;
  }

  return { kind: "dice", notation: "1D6" };
}

function exampleDicePoolNotation(notation: string, effectivePower: number): string {
  const diceMatch = notation.trim().toUpperCase().match(/^(\d+)D(\d+)$/);
  if (diceMatch == null) {
    return notation.trim().toUpperCase();
  }

  return `${Number(diceMatch[1]) * effectivePower}D${Number(diceMatch[2])}`;
}

function describeFormulaBehavior(formula: RollExpression): string | null {
  switch (formula.kind) {
    case "dice": {
      const notation = formula.notation.trim().toUpperCase();
      if (formula.scaleBy === "power") {
        return `Roll ${notation} once, then add self power${(formula.bonusPerPower ?? 1) !== 1 ? ` x ${formula.bonusPerPower ?? 1}` : ""}.`;
      }

      if (formula.scaleBy === "target_power") {
        return `Roll ${notation} once, then add target power${(formula.bonusPerPower ?? 1) !== 1 ? ` x ${formula.bonusPerPower ?? 1}` : ""}.`;
      }

      if (formula.scaleBy === "multiply_power") {
        return `Roll ${notation} once, then multiply the final total by self power${(formula.powerBonus ?? 0) !== 0 ? ` ${formula.powerBonus! > 0 ? "+" : "-"} ${Math.abs(formula.powerBonus ?? 0)}` : ""}.`;
      }

      if (formula.scaleBy === "multiply_target_power") {
        return `Roll ${notation} once, then multiply the final total by target power${(formula.powerBonus ?? 0) !== 0 ? ` ${formula.powerBonus! > 0 ? "+" : "-"} ${Math.abs(formula.powerBonus ?? 0)}` : ""}.`;
      }

      return `Roll ${notation} once.`;
    }
    case "dice_per_power": {
      const notation = formula.notation.trim().toUpperCase();
      const powerLabel = formula.powerSource === "target" ? "target" : "self";
      const bonus = formula.powerBonus ?? 0;
      const bonusText = bonus === 0
        ? ""
        : ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`;
      const sampleEffectivePower = Math.max(0, 3 + bonus);
      const sampleNotation = exampleDicePoolNotation(notation, sampleEffectivePower);
      return `Use ${powerLabel} power${bonusText} as the number of ${notation} dice, and roll them all together in one combined throw. Example: power 3${bonus === 0 ? "" : ` with bonus ${bonus > 0 ? "+" : "-"}${Math.abs(bonus)}`} becomes ${sampleNotation}.`;
    }
    case "fixed":
      return "Use a fixed amount with optional power scaling.";
    case "current_hp_fraction":
      return "Use a fraction of the target's current HP.";
    case "sacrifice_amount":
      return "Use the HP amount sacrificed by the player.";
    case "total_active_players_times":
      return "Multiply the configured amount by the number of active players.";
  }
}

function renderFormulaFields(card: BaseCardDefinition): string {
  const effect = findPrimaryFormulaEffect(card);
  const formula = getFormula(effect);
  const effectType = effect?.type ?? "none";
  const notation = "notation" in formula ? formula.notation : "1D6";
  const amount = "amount" in formula && typeof formula.amount === "number" ? formula.amount : 0;
  const scaleBy = "scaleBy" in formula ? formula.scaleBy ?? "none" : "none";
  const bonusPerPower = "bonusPerPower" in formula ? formula.bonusPerPower ?? 1 : 1;
  const usesAdditivePowerScale = scaleBy === "power" || scaleBy === "target_power";
  const usesMultiplierPowerScale = scaleBy === "multiply_power" || scaleBy === "multiply_target_power";
  const multiplierPowerBonus = "powerBonus" in formula ? formula.powerBonus ?? 0 : 0;
  const powerSource = formula.kind === "dice_per_power" ? formula.powerSource : "self";
  const powerBonus = formula.kind === "dice_per_power" ? formula.powerBonus ?? 0 : 0;
  const numerator = formula.kind === "current_hp_fraction" ? formula.numerator : 1;
  const denominator = formula.kind === "current_hp_fraction" ? formula.denominator : 2;
  const healTarget = effect?.type === "heal" ? effect.target : "self";
  const lifestealPowerSource = effect?.type === "lifesteal" ? effect.powerSource : "self";
  const halfDamage = effect?.type === "damage" ? effect.grantsHalfDamageOnResistance === true : false;
  const formulaBehavior = describeFormulaBehavior(formula);
  const fields: string[] = [];

  fields.push(`
    <div class="mapper-field">
      <label for="effect-type">Primary Effect</label>
      <select id="effect-type" data-card-editor-field="effect.type">
        <option value="none" ${selected(effectType, "none")}>None / special only</option>
        <option value="damage" ${selected(effectType, "damage")}>Damage</option>
        <option value="heal" ${selected(effectType, "heal")}>Heal</option>
        <option value="lifesteal" ${selected(effectType, "lifesteal")}>Lifesteal</option>
      </select>
    </div>
  `);

  if (effectType === "none") {
    fields.push(`
      <p class="mapper-help mapper-help--wide">
        No generic damage/heal/lifesteal formula is configured. Use this for cards that need a special handler or non-formula effect.
      </p>
    `);
    return `<section class="mapper-fields mapper-fields--formula">${fields.join("")}</section>`;
  }

  fields.push(`
    <div class="mapper-field">
      <label for="formula-kind">Formula</label>
      <select id="formula-kind" data-card-editor-field="formula.kind">
        <option value="dice" ${selected(formula.kind, "dice")}>Dice roll</option>
        <option value="dice_per_power" ${selected(formula.kind, "dice_per_power")}>Dice pool per power level</option>
        <option value="fixed" ${selected(formula.kind, "fixed")}>Fixed amount</option>
        <option value="current_hp_fraction" ${selected(formula.kind, "current_hp_fraction")}>Current HP fraction</option>
        <option value="sacrifice_amount" ${selected(formula.kind, "sacrifice_amount")}>Sacrifice amount</option>
        <option value="total_active_players_times" ${selected(formula.kind, "total_active_players_times")}>Active players x amount</option>
      </select>
    </div>
  `);

  if (formulaBehavior != null) {
    fields.push(`
      <p class="mapper-help mapper-help--wide">
        ${escapeHtml(formulaBehavior)}
      </p>
    `);
  }

  if (formula.kind === "dice") {
    fields.push(`
      <div class="mapper-field">
        <label for="formula-notation">Dice Notation</label>
        <input id="formula-notation" value="${escapeHtml(notation)}" data-card-editor-field="formula.notation" />
      </div>

      <div class="mapper-field">
        <label for="formula-scale">Power Interaction</label>
        <select id="formula-scale" data-card-editor-field="formula.scaleBy">
          <option value="none" ${selected(scaleBy, "none")}>None</option>
          <option value="power" ${selected(scaleBy, "power")}>Add self power after the roll</option>
          <option value="target_power" ${selected(scaleBy, "target_power")}>Add target power after the roll</option>
          <option value="multiply_power" ${selected(scaleBy, "multiply_power")}>Multiply the final roll by self power</option>
          <option value="multiply_target_power" ${selected(scaleBy, "multiply_target_power")}>Multiply the final roll by target power</option>
        </select>
      </div>
    `);

    if (usesAdditivePowerScale) {
      fields.push(`
        <div class="mapper-field">
          <label for="formula-bonus">Bonus Per Power</label>
          <input id="formula-bonus" type="number" value="${bonusPerPower}" data-card-editor-field="formula.bonusPerPower" />
        </div>
      `);
    } else if (usesMultiplierPowerScale) {
      fields.push(`
        <div class="mapper-field">
          <label for="formula-multiplier-power-bonus">Power Bonus Before Multiply</label>
          <input id="formula-multiplier-power-bonus" type="number" value="${multiplierPowerBonus}" data-card-editor-field="formula.multiplierPowerBonus" />
        </div>
      `);
    }
  } else if (formula.kind === "dice_per_power") {
    fields.push(`
      <div class="mapper-field">
        <label for="formula-notation">Dice Notation</label>
        <input id="formula-notation" value="${escapeHtml(notation)}" data-card-editor-field="formula.notation" />
      </div>

      <div class="mapper-field">
        <label for="formula-power-source">Power Source</label>
        <select id="formula-power-source" data-card-editor-field="formula.powerSource">
          <option value="self" ${selected(powerSource, "self")}>Self power decides the number of dice</option>
          <option value="target" ${selected(powerSource, "target")}>Target power decides the number of dice</option>
        </select>
      </div>

      <div class="mapper-field">
        <label for="formula-power-bonus">Power Bonus</label>
        <input id="formula-power-bonus" type="number" value="${powerBonus}" data-card-editor-field="formula.powerBonus" />
      </div>

      <p class="mapper-help mapper-help--wide">
        This mode rolls all power-based dice in a single throw. Example: 1D4 with power 3 becomes one 3D4 roll, not three separate 1D4 rolls.
      </p>
    `);
  } else if (formula.kind === "fixed") {
    fields.push(`
      <div class="mapper-field">
        <label for="formula-amount">Amount</label>
        <input id="formula-amount" type="number" value="${amount}" data-card-editor-field="formula.amount" />
      </div>

      <div class="mapper-field">
        <label for="formula-scale">Power Interaction</label>
        <select id="formula-scale" data-card-editor-field="formula.scaleBy">
          <option value="none" ${selected(scaleBy, "none")}>None</option>
          <option value="power" ${selected(scaleBy, "power")}>Add self power</option>
          <option value="target_power" ${selected(scaleBy, "target_power")}>Add target power</option>
          <option value="multiply_power" ${selected(scaleBy, "multiply_power")}>Multiply by self power</option>
          <option value="multiply_target_power" ${selected(scaleBy, "multiply_target_power")}>Multiply by target power</option>
        </select>
      </div>
    `);

    if (usesAdditivePowerScale) {
      fields.push(`
        <div class="mapper-field">
          <label for="formula-bonus">Bonus Per Power</label>
          <input id="formula-bonus" type="number" value="${bonusPerPower}" data-card-editor-field="formula.bonusPerPower" />
        </div>
      `);
    } else if (usesMultiplierPowerScale) {
      fields.push(`
        <div class="mapper-field">
          <label for="formula-multiplier-power-bonus">Power Bonus Before Multiply</label>
          <input id="formula-multiplier-power-bonus" type="number" value="${multiplierPowerBonus}" data-card-editor-field="formula.multiplierPowerBonus" />
        </div>
      `);
    }
  } else if (formula.kind === "current_hp_fraction") {
    fields.push(`
      <div class="mapper-field">
        <label for="formula-numerator">Numerator</label>
        <input id="formula-numerator" type="number" min="1" value="${numerator}" data-card-editor-field="formula.numerator" />
      </div>

      <div class="mapper-field">
        <label for="formula-denominator">Denominator</label>
        <input id="formula-denominator" type="number" min="1" value="${denominator}" data-card-editor-field="formula.denominator" />
      </div>
    `);
  } else if (formula.kind === "total_active_players_times") {
    fields.push(`
      <div class="mapper-field">
        <label for="formula-amount">Amount Per Active Player</label>
        <input id="formula-amount" type="number" value="${amount}" data-card-editor-field="formula.amount" />
      </div>
    `);
  } else if (formula.kind === "sacrifice_amount") {
    fields.push(`
      <p class="mapper-help mapper-help--wide">
        This formula uses the HP amount sacrificed by the player; no extra formula values are needed.
      </p>
    `);
  }

  if (effect?.type === "heal") {
    fields.push(`
      <div class="mapper-field">
        <label for="heal-target">Heal Target</label>
        <select id="heal-target" data-card-editor-field="effect.healTarget">
          <option value="self" ${selected(healTarget, "self")}>Self</option>
          <option value="all_opponents" ${selected(healTarget, "all_opponents")}>All opponents</option>
        </select>
      </div>
    `);
  } else if (effect?.type === "lifesteal") {
    fields.push(`
      <div class="mapper-field">
        <label for="lifesteal-power-source">Lifesteal Power Source</label>
        <select id="lifesteal-power-source" data-card-editor-field="effect.lifestealPowerSource">
          <option value="self" ${selected(lifestealPowerSource, "self")}>Self</option>
          <option value="target" ${selected(lifestealPowerSource, "target")}>Target</option>
        </select>
      </div>
    `);
  } else if (effect?.type === "damage") {
    fields.push(`
      <label class="mapper-check mapper-check--wide">
        <input type="checkbox" data-card-editor-field="effect.grantsHalfDamageOnResistance" ${checked(halfDamage)} />
        <span>Successful resistance still takes half damage</span>
      </label>
    `);
  }

  return `<section class="mapper-fields mapper-fields--formula">${fields.join("")}</section>`;
}

export function renderCardEditorView({
  cards,
  card,
  currentIndex,
  deckOptions,
  selectedDeck,
  statusMessage,
  isSaving
}: CardEditorViewParams): string {
  const cardImagePath = getImportedCardImageUrl(card.image.importedAssetPath);
  const defenseBand = defenseBandOrDefault(card);

  return `
    <main class="mapper-screen card-editor-screen">
      <section class="mapper-topbar">
        <div>
          <p class="eyebrow">Dev Only</p>
          <h1>Card Rule Editor</h1>
          <p class="hero-copy">Edit the centralized TypeScript card catalog. Formula fields update the first damage/heal/lifesteal effect.</p>
          <div class="card-editor-deck-picker">
            <label for="card-editor-deck">Deck</label>
            <select id="card-editor-deck" class="card-editor-picker" data-card-editor-action="pick-deck">
              ${deckOptions.map((option) => `
                <option value="${option.id}" ${selected(option.id, selectedDeck)}>${escapeHtml(option.label)}</option>
              `).join("")}
            </select>
          </div>
        </div>
        <div class="mapper-stats">
          <span class="status-pill">${currentIndex + 1} / ${cards.length}</span>
          <span class="status-pill">${card.category.code}</span>
          <span class="status-pill">${card.implementation?.status ?? "unknown"}</span>
        </div>
      </section>

      <section class="mapper-layout">
        <article class="mapper-card-panel">
          <div class="mapper-image-wrap">
            <img class="mapper-card-image" src="${cardImagePath}" alt="${escapeHtml(card.name)}" />
          </div>
          <div class="card-editor-image-nav">
            <button class="action-button action-button--secondary" data-card-editor-action="prev">Previous</button>
            <button class="action-button action-button--secondary" data-card-editor-action="next">Next</button>
          </div>
          <select class="card-editor-picker" data-card-editor-action="pick-card">
            ${cards.map((candidate, index) => `
              <option value="${index}" ${index === currentIndex ? "selected" : ""}>[${candidate.category.code}] ${escapeHtml(candidate.name)}</option>
            `).join("")}
          </select>
        </article>

        <article class="mapper-form-panel">
          <header class="mapper-card-header">
            <div>
              <h2>${escapeHtml(card.name)}</h2>
              <p class="mapper-card-meta">${escapeHtml(card.id)} · Deck ${escapeHtml(deckOptions.find((option) => option.id === selectedDeck)?.label ?? selectedDeck)} · Base qty ${card.baseDeckQuantity}</p>
            </div>
            <a class="mapper-source-link" href="${card.sourceUrl ?? "#"}" target="_blank" rel="noreferrer">Source</a>
          </header>

          <section class="mapper-fields">
            <div class="mapper-field">
              <label for="card-name">Title</label>
              <input id="card-name" value="${escapeHtml(card.name)}" data-card-editor-field="name" />
            </div>

            <div class="mapper-field">
              <label for="card-category">Type</label>
              <select id="card-category" data-card-editor-field="category.code">
                ${CATEGORY_OPTIONS.map((option) => `
                  <option value="${option.code}" ${selected(card.category.code, option.code)}>${option.code} · ${option.label}</option>
                `).join("")}
              </select>
            </div>
          </section>

          <section class="mapper-field mapper-field--full">
            <label for="card-description">Text</label>
            <textarea id="card-description" rows="6" data-card-editor-field="description">${escapeHtml(card.description)}</textarea>
          </section>

          <section class="mapper-fields">
            <div class="mapper-field">
              <label for="selection-mode">Selection Mode</label>
              <select id="selection-mode" data-card-editor-field="rules.selectionMode">
                ${["none", "confirm", "target"].map((value) => `<option value="${value}" ${selected(card.rules.selectionMode, value)}>${value}</option>`).join("")}
              </select>
            </div>

            <div class="mapper-field">
              <label for="targets">Targets</label>
              <select id="targets" data-card-editor-field="rules.targets">
                ${["self", "single_opponent", "self_or_single_opponent", "all_opponents", "left_opponent", "target_object", "single_player_or_object", "none"].map((value) => `<option value="${value}" ${selected(card.rules.targets, value)}>${value}</option>`).join("")}
              </select>
            </div>
          </section>

          <section class="mapper-fieldset">
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="rules.requiresDefenseWindow" ${checked(card.rules.requiresDefenseWindow)} /><span>Defense window</span></label>
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="rules.requiresResistanceCheck" ${checked(card.rules.requiresResistanceCheck)} /><span>Resistance check</span></label>
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="rules.staysInPlay" ${checked(card.rules.staysInPlay)} /><span>Stays in play</span></label>
          </section>

          <h3>Defense Band</h3>
          <section class="mapper-fields">
            <div class="mapper-field">
              <label for="resistance-color">Resistance Color</label>
              <select id="resistance-color" data-card-editor-field="defenseBand.resistance.color">
                ${["blue", "red", "yellow"].map((value) => `<option value="${value}" ${selected(defenseBand.resistance.color, value)}>${value}</option>`).join("")}
              </select>
            </div>
            <div class="mapper-field">
              <label for="resistance-rolls">Resistance Rolls</label>
              <input id="resistance-rolls" type="number" min="0" max="9" value="${defenseBand.resistance.rollsRequired}" data-card-editor-field="defenseBand.resistance.rollsRequired" />
            </div>
            <div class="mapper-field">
              <label for="annulation-required">Annulation Required</label>
              <input id="annulation-required" type="number" min="0" max="9" value="${defenseBand.annulationCardsRequired}" data-card-editor-field="defenseBand.annulationCardsRequired" />
            </div>
          </section>

          <section class="mapper-fieldset">
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="defenseBand.resistanceAccrueAllowed" ${checked(defenseBand.resistanceAccrueAllowed)} /><span>Résistance accrue</span></label>
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="defenseBand.annulationAllowed" ${checked(defenseBand.annulationAllowed)} /><span>Annulation</span></label>
            <label class="mapper-check"><input type="checkbox" data-card-editor-field="defenseBand.mirrorAllowed" ${checked(defenseBand.mirrorAllowed)} /><span>Miroir</span></label>
          </section>

          <h3>Primary Formula</h3>
          ${renderFormulaFields(card)}

          <details class="mapper-preview-block mapper-preview-block--collapsible">
            <summary>Current Card JSON</summary>
            <pre>${escapeHtml(JSON.stringify(card, null, 2))}</pre>
          </details>

          <p class="mapper-status">${escapeHtml(statusMessage)}</p>

          <div class="mapper-actions">
            <button class="action-button" data-card-editor-action="save" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving..." : "Save"}</button>
            <button class="action-button" data-card-editor-action="save-next" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving..." : "Save & Next"}</button>
          </div>
        </article>
      </section>
    </main>
  `;
}
