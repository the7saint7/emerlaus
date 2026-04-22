import type {
  BaseCardDefinition,
  CardCategoryCode,
  CardEffect,
  CardRules,
  DevCardCatalogId,
  DefenseBandRules,
  RollExpression,
  RollScaleMode
} from "../../../shared/cards/types";
import { fetchBaseCardCatalog, saveBaseCardDefinition } from "./cardEditorApi";
import { renderCardEditorView } from "./renderCardEditorView";

const EDITOR_DECK_OPTIONS = [
  { id: "base", label: "Jeu de base" },
  { id: "abondance", label: "Abondance" },
  { id: "puissance", label: "Puissance" }
] satisfies Array<{ id: DevCardCatalogId; label: string }>;

interface EditorState {
  cardsByDeck: Partial<Record<DevCardCatalogId, BaseCardDefinition[]>>;
  currentIndexByDeck: Record<DevCardCatalogId, number>;
  selectedDeck: DevCardCatalogId;
  statusMessage: string;
  isSaving: boolean;
}

const CATEGORY_LABELS: Record<CardCategoryCode, string> = {
  AD: "Attaques directes",
  AM: "Attaques massives",
  A: "Accessoires",
  O: "Objets",
  E: "Énergies",
  S: "Sorts",
  CA: "Contre-attaques",
  CO: "Contre-objets",
  ST: "Sortilèges",
  SO: "Sorts objets"
};

const SELECTED_DECK_STORAGE_KEY = "emerlaus.cardEditor.selectedDeck";
const SELECTED_CARD_STORAGE_KEY = "emerlaus.cardEditor.selectedCardId";

function rememberSelectedDeck(deck: DevCardCatalogId): void {
  window.sessionStorage.setItem(SELECTED_DECK_STORAGE_KEY, deck);
}

function rememberedDeck(): DevCardCatalogId {
  const value = window.sessionStorage.getItem(SELECTED_DECK_STORAGE_KEY);
  return value === "abondance" || value === "puissance" ? value : "base";
}

function selectedCardStorageKey(deck: DevCardCatalogId): string {
  return `${SELECTED_CARD_STORAGE_KEY}.${deck}`;
}

function rememberSelectedCard(deck: DevCardCatalogId, cardId: string): void {
  window.sessionStorage.setItem(selectedCardStorageKey(deck), cardId);
}

function rememberedCardIndex(deck: DevCardCatalogId, cards: BaseCardDefinition[]): number {
  const rememberedCardId = window.sessionStorage.getItem(selectedCardStorageKey(deck));
  if (rememberedCardId == null) {
    return 0;
  }

  const index = cards.findIndex((card) => card.id === rememberedCardId);
  return index === -1 ? 0 : index;
}

function cloneCard(card: BaseCardDefinition): BaseCardDefinition {
  return JSON.parse(JSON.stringify(card)) as BaseCardDefinition;
}

function getDeckCards(state: EditorState): BaseCardDefinition[] {
  return state.cardsByDeck[state.selectedDeck] ?? [];
}

function getCurrentCard(state: EditorState): BaseCardDefinition | undefined {
  return getDeckCards(state)[state.currentIndexByDeck[state.selectedDeck]];
}

function ensureDefenseBand(card: BaseCardDefinition): DefenseBandRules {
  if (card.defenseBand == null) {
    card.defenseBand = {
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

  return card.defenseBand;
}

function primaryFormulaEffectIndex(card: BaseCardDefinition): number {
  return card.rules.effects.findIndex((effect) =>
    effect.type === "damage" ||
    effect.type === "heal" ||
    effect.type === "lifesteal"
  );
}

function primaryFormulaEffect(card: BaseCardDefinition): CardEffect | null {
  const index = primaryFormulaEffectIndex(card);
  return index === -1 ? null : card.rules.effects[index];
}

function formulaFromEffect(effect: CardEffect | null): RollExpression {
  if (
    effect?.type === "damage" ||
    effect?.type === "heal" ||
    effect?.type === "lifesteal"
  ) {
    return effect.amount;
  }

  return { kind: "dice", notation: "1D6" };
}

function setPrimaryFormulaEffect(card: BaseCardDefinition, effect: CardEffect | null): void {
  const index = primaryFormulaEffectIndex(card);
  if (effect == null) {
    if (index !== -1) {
      card.rules.effects.splice(index, 1);
    }
    return;
  }

  if (index === -1) {
    card.rules.effects.unshift(effect);
  } else {
    card.rules.effects[index] = effect;
  }
}

function updatePrimaryFormula(card: BaseCardDefinition, nextFormula: RollExpression): void {
  const effect = primaryFormulaEffect(card);
  if (effect == null) {
    setPrimaryFormulaEffect(card, {
      type: "damage",
      amount: nextFormula
    });
    return;
  }

  if (effect.type === "damage") {
    effect.amount = nextFormula;
  } else if (effect.type === "heal") {
    effect.amount = nextFormula;
  } else if (effect.type === "lifesteal") {
    effect.amount = nextFormula;
  }
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateFormulaKind(card: BaseCardDefinition, kind: RollExpression["kind"]): void {
  const current = formulaFromEffect(primaryFormulaEffect(card));
  const notation = "notation" in current ? current.notation : "1D6";
  const amount = "amount" in current && typeof current.amount === "number" ? current.amount : 0;
  const inferredPowerSource = (
    "scaleBy" in current
    && (current.scaleBy === "target_power" || current.scaleBy === "multiply_target_power")
  )
    ? "target"
    : ("powerSource" in current && current.powerSource === "target" ? "target" : "self");
  const inferredPowerBonus = (
    "powerBonus" in current
    && typeof current.powerBonus === "number"
  )
    ? current.powerBonus
    : 0;

  switch (kind) {
    case "dice":
      updatePrimaryFormula(card, {
        kind,
        notation,
        scaleBy: current.kind === "dice_per_power"
          ? (current.powerSource === "target" ? "multiply_target_power" : "multiply_power")
          : current.kind === "dice"
            ? current.scaleBy
            : undefined,
        powerBonus: current.kind === "dice_per_power"
          ? current.powerBonus ?? 0
          : current.kind === "dice"
            ? current.powerBonus
            : undefined,
        bonusPerPower: current.kind === "dice" ? current.bonusPerPower : undefined
      });
      break;
    case "dice_per_power":
      updatePrimaryFormula(card, {
        kind,
        notation,
        powerSource: inferredPowerSource,
        powerBonus: inferredPowerBonus
      });
      break;
    case "fixed":
      updatePrimaryFormula(card, {
        kind,
        amount,
        scaleBy: current.kind === "fixed" || current.kind === "dice"
          ? current.scaleBy
          : current.kind === "dice_per_power"
            ? (current.powerSource === "target" ? "multiply_target_power" : "multiply_power")
            : undefined,
        powerBonus: current.kind === "fixed" || current.kind === "dice"
          ? current.powerBonus
          : current.kind === "dice_per_power"
            ? current.powerBonus ?? 0
            : undefined,
        bonusPerPower: current.kind === "fixed" || current.kind === "dice"
          ? current.bonusPerPower
          : undefined
      });
      break;
    case "current_hp_fraction":
      updatePrimaryFormula(card, { kind, numerator: 1, denominator: 2 });
      break;
    case "sacrifice_amount":
      updatePrimaryFormula(card, { kind });
      break;
    case "total_active_players_times":
      updatePrimaryFormula(card, { kind, amount: amount === 0 ? 1 : amount });
      break;
  }
}

function updateEffectType(card: BaseCardDefinition, effectType: string): void {
  if (effectType === "none") {
    setPrimaryFormulaEffect(card, null);
    return;
  }

  const amount = formulaFromEffect(primaryFormulaEffect(card));
  if (effectType === "damage") {
    setPrimaryFormulaEffect(card, { type: "damage", amount });
  } else if (effectType === "heal") {
    setPrimaryFormulaEffect(card, { type: "heal", amount, target: "self" });
  } else if (effectType === "lifesteal") {
    setPrimaryFormulaEffect(card, { type: "lifesteal", amount, powerSource: "self" });
  }
}

function applyFieldUpdate(card: BaseCardDefinition, field: string, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const value = element.value;
  const checked = element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : false;

  switch (field) {
    case "name":
      card.name = value;
      break;
    case "description":
      card.description = value;
      break;
    case "category.code": {
      const code = value as CardCategoryCode;
      card.category.code = code;
      card.category.label = CATEGORY_LABELS[code];
      card.category.raw = `${CATEGORY_LABELS[code]} (${code})`;
      break;
    }
    case "rules.selectionMode":
      card.rules.selectionMode = value as CardRules["selectionMode"];
      break;
    case "rules.targets":
      card.rules.targets = value as CardRules["targets"];
      break;
    case "rules.requiresDefenseWindow":
      card.rules.requiresDefenseWindow = checked;
      break;
    case "rules.requiresResistanceCheck":
      card.rules.requiresResistanceCheck = checked;
      break;
    case "rules.staysInPlay":
      card.rules.staysInPlay = checked;
      break;
    case "defenseBand.resistance.color":
      ensureDefenseBand(card).resistance.color = value as DefenseBandRules["resistance"]["color"];
      break;
    case "defenseBand.resistance.rollsRequired":
      ensureDefenseBand(card).resistance.rollsRequired = Math.max(0, numberValue(value, 0));
      break;
    case "defenseBand.annulationCardsRequired":
      ensureDefenseBand(card).annulationCardsRequired = Math.max(0, numberValue(value, 0));
      break;
    case "defenseBand.resistanceAccrueAllowed":
      ensureDefenseBand(card).resistanceAccrueAllowed = checked;
      break;
    case "defenseBand.annulationAllowed":
      ensureDefenseBand(card).annulationAllowed = checked;
      break;
    case "defenseBand.mirrorAllowed":
      ensureDefenseBand(card).mirrorAllowed = checked;
      break;
    case "effect.type":
      updateEffectType(card, value);
      break;
    case "effect.grantsHalfDamageOnResistance": {
      const effect = primaryFormulaEffect(card);
      if (effect?.type === "damage") {
        effect.grantsHalfDamageOnResistance = checked;
      }
      break;
    }
    case "effect.healTarget": {
      const effect = primaryFormulaEffect(card);
      if (effect?.type === "heal") {
        effect.target = value as Extract<CardEffect, { type: "heal" }>["target"];
      }
      break;
    }
    case "effect.lifestealPowerSource": {
      const effect = primaryFormulaEffect(card);
      if (effect?.type === "lifesteal") {
        effect.powerSource = value as Extract<CardEffect, { type: "lifesteal" }>["powerSource"];
      }
      break;
    }
    case "formula.kind":
      updateFormulaKind(card, value as RollExpression["kind"]);
      break;
    case "formula.notation": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if ("notation" in formula) {
        formula.notation = value.trim().toUpperCase();
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.amount": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if ("amount" in formula && typeof formula.amount === "number") {
        formula.amount = numberValue(value, formula.amount);
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.scaleBy": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if ((formula.kind === "dice" || formula.kind === "fixed")) {
        if (value === "none") {
          delete formula.scaleBy;
          delete formula.powerBonus;
        } else {
          formula.scaleBy = value as RollScaleMode;
        }
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.bonusPerPower": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if ((formula.kind === "dice" || formula.kind === "fixed")) {
        formula.bonusPerPower = numberValue(value, formula.bonusPerPower ?? 1);
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.multiplierPowerBonus": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if ((formula.kind === "dice" || formula.kind === "fixed") && (
        formula.scaleBy === "multiply_power" ||
        formula.scaleBy === "multiply_target_power"
      )) {
        formula.powerBonus = numberValue(value, formula.powerBonus ?? 0);
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.powerSource": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if (formula.kind === "dice_per_power") {
        formula.powerSource = value as "self" | "target";
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.powerBonus": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if (formula.kind === "dice_per_power") {
        formula.powerBonus = numberValue(value, formula.powerBonus ?? 0);
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.numerator": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if (formula.kind === "current_hp_fraction") {
        formula.numerator = Math.max(1, numberValue(value, formula.numerator));
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    case "formula.denominator": {
      const formula = formulaFromEffect(primaryFormulaEffect(card));
      if (formula.kind === "current_hp_fraction") {
        formula.denominator = Math.max(1, numberValue(value, formula.denominator));
        updatePrimaryFormula(card, formula);
      }
      break;
    }
    default:
      break;
  }

  card.implementation = {
    ...(card.implementation ?? { status: "manual" }),
    status: "manual"
  };
}

export async function createCardEditorApp(rootElement: HTMLDivElement): Promise<void> {
  const initialDeck = rememberedDeck();
  const initialCards = (await fetchBaseCardCatalog(initialDeck)).map(cloneCard);
  const state: EditorState = {
    cardsByDeck: {
      [initialDeck]: initialCards
    },
    currentIndexByDeck: {
      base: initialDeck === "base" ? rememberedCardIndex("base", initialCards) : 0,
      abondance: initialDeck === "abondance" ? rememberedCardIndex("abondance", initialCards) : 0,
      puissance: initialDeck === "puissance" ? rememberedCardIndex("puissance", initialCards) : 0
    },
    selectedDeck: initialDeck,
    statusMessage: `Edit a card and save it into the ${EDITOR_DECK_OPTIONS.find((option) => option.id === initialDeck)?.label ?? initialDeck} catalog.`,
    isSaving: false
  };

  const loadDeck = async (deck: DevCardCatalogId): Promise<void> => {
    if (state.cardsByDeck[deck] != null) {
      return;
    }

    const cards = (await fetchBaseCardCatalog(deck)).map(cloneCard);
    state.cardsByDeck[deck] = cards;
    state.currentIndexByDeck[deck] = rememberedCardIndex(deck, cards);
  };

  const render = (): void => {
    const cards = getDeckCards(state);
    const card = getCurrentCard(state);
    if (card == null) {
      rootElement.innerHTML = `
        <main class="mapper-screen card-editor-screen">
          <section class="mapper-topbar">
            <div>
              <p class="eyebrow">Dev Only</p>
              <h1>Card Rule Editor</h1>
              <p class="hero-copy">${state.statusMessage}</p>
            </div>
          </section>
        </main>
      `;
      return;
    }

    rootElement.innerHTML = renderCardEditorView({
      cards,
      card,
      currentIndex: state.currentIndexByDeck[state.selectedDeck],
      deckOptions: EDITOR_DECK_OPTIONS,
      selectedDeck: state.selectedDeck,
      statusMessage: state.statusMessage,
      isSaving: state.isSaving
    });

    rootElement.querySelector<HTMLSelectElement>("[data-card-editor-action='pick-deck']")?.addEventListener("change", async (event) => {
      const nextDeck = (event.currentTarget as HTMLSelectElement).value as DevCardCatalogId;
      if (nextDeck !== "base" && nextDeck !== "abondance" && nextDeck !== "puissance") {
        return;
      }

      state.isSaving = false;
      state.selectedDeck = nextDeck;
      rememberSelectedDeck(nextDeck);
      state.statusMessage = `Loading ${EDITOR_DECK_OPTIONS.find((option) => option.id === nextDeck)?.label ?? nextDeck}...`;
      render();

      try {
        await loadDeck(nextDeck);
        const activeCards = state.cardsByDeck[nextDeck] ?? [];
        if (activeCards.length > 0) {
          state.currentIndexByDeck[nextDeck] = Math.min(
            state.currentIndexByDeck[nextDeck] ?? 0,
            activeCards.length - 1
          );
          rememberSelectedCard(nextDeck, activeCards[state.currentIndexByDeck[nextDeck]].id);
        }
        state.statusMessage = `Editing ${EDITOR_DECK_OPTIONS.find((option) => option.id === nextDeck)?.label ?? nextDeck} cards.`;
      } catch (error) {
        state.statusMessage = error instanceof Error ? error.message : "Unable to load card catalog";
      } finally {
        render();
      }
    });

    rootElement.querySelector<HTMLSelectElement>("[data-card-editor-action='pick-card']")?.addEventListener("change", (event) => {
      const cardsForDeck = getDeckCards(state);
      state.currentIndexByDeck[state.selectedDeck] = Number((event.currentTarget as HTMLSelectElement).value);
      rememberSelectedCard(state.selectedDeck, cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].id);
      state.statusMessage = `Viewing ${cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].name}`;
      render();
    });

    rootElement.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-card-editor-field]").forEach((element) => {
      const eventName = (element instanceof HTMLInputElement && element.type !== "checkbox") || element instanceof HTMLTextAreaElement
        ? "input"
        : "change";

      element.addEventListener(eventName, () => {
        const field = element.dataset.cardEditorField;
        if (field == null) {
          return;
        }

        applyFieldUpdate(card, field, element);
        state.statusMessage = `Editing ${card.name}`;
        if (element instanceof HTMLSelectElement || (element instanceof HTMLInputElement && element.type === "checkbox")) {
          render();
        }
      });
    });

    const saveCurrent = async (advance: boolean): Promise<void> => {
      const currentDeck = state.selectedDeck;
      const cardsForDeck = getDeckCards(state);
      const currentIndex = state.currentIndexByDeck[currentDeck];
      const cardToSave = cardsForDeck[currentIndex];
      const selectedAfterSaveIndex = advance
        ? (currentIndex + 1) % cardsForDeck.length
        : currentIndex;
      const selectedAfterSaveCardId = cardsForDeck[selectedAfterSaveIndex].id;

      rememberSelectedCard(currentDeck, selectedAfterSaveCardId);
      state.isSaving = true;
      state.statusMessage = `Saving ${cardToSave.name}...`;
      render();

      try {
        const savedCards = (await saveBaseCardDefinition(currentDeck, cardToSave)).map(cloneCard);
        state.cardsByDeck[currentDeck] = savedCards;
        const restoredIndex = savedCards.findIndex((candidate) => candidate.id === selectedAfterSaveCardId);
        state.currentIndexByDeck[currentDeck] = restoredIndex === -1 ? 0 : restoredIndex;
        state.statusMessage = advance
          ? `Saved ${cardToSave.name}; moved to ${savedCards[state.currentIndexByDeck[currentDeck]].name}`
          : `Saved ${savedCards[state.currentIndexByDeck[currentDeck]].name}`;
      } catch (error) {
        rememberSelectedCard(currentDeck, cardToSave.id);
        state.statusMessage = error instanceof Error ? error.message : "Unable to save card";
      } finally {
        state.isSaving = false;
        render();
      }
    };

    rootElement.querySelectorAll<HTMLButtonElement>("[data-card-editor-action='prev']").forEach((button) => {
      button.addEventListener("click", () => {
        const cardsForDeck = getDeckCards(state);
        state.currentIndexByDeck[state.selectedDeck] = (state.currentIndexByDeck[state.selectedDeck] - 1 + cardsForDeck.length) % cardsForDeck.length;
        rememberSelectedCard(state.selectedDeck, cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].id);
        state.statusMessage = `Viewing ${cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].name}`;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-card-editor-action='next']").forEach((button) => {
      button.addEventListener("click", () => {
        const cardsForDeck = getDeckCards(state);
        state.currentIndexByDeck[state.selectedDeck] = (state.currentIndexByDeck[state.selectedDeck] + 1) % cardsForDeck.length;
        rememberSelectedCard(state.selectedDeck, cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].id);
        state.statusMessage = `Viewing ${cardsForDeck[state.currentIndexByDeck[state.selectedDeck]].name}`;
        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-card-editor-action='save']")?.addEventListener("click", () => {
      void saveCurrent(false);
    });

    rootElement.querySelector<HTMLButtonElement>("[data-card-editor-action='save-next']")?.addEventListener("click", () => {
      void saveCurrent(true);
    });
  };

  render();
}
