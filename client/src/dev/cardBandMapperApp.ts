import { baseCardDefinitions, defaultDefenseBandByCategory } from "../../../shared/cards";
import type {
  BaseCardDefinition,
  BaseDefenseBandMappings,
  DefenseBandRules
} from "../../../shared/cards/types";
import {
  fetchBaseDefenseBandMappings,
  saveBaseDefenseBandMapping
} from "./bandMapperApi";
import { renderBandMapperView } from "./renderBandMapperView";

interface MapperState {
  cards: BaseCardDefinition[];
  mappings: BaseDefenseBandMappings;
  currentIndex: number;
  statusMessage: string;
  isSaving: boolean;
}

function hasVisibleDefenseBand(card: BaseCardDefinition): boolean {
  return card.category.code !== "O";
}

function cloneMapping(mapping: DefenseBandRules): DefenseBandRules {
  return {
    resistance: { ...mapping.resistance },
    resistanceAccrueAllowed: mapping.resistanceAccrueAllowed,
    annulationAllowed: mapping.annulationAllowed,
    annulationCardsRequired: mapping.annulationCardsRequired,
    mirrorAllowed: mapping.mirrorAllowed
  };
}

function fallbackMapping(card: BaseCardDefinition): DefenseBandRules {
  const fallback = card.defenseBand ?? defaultDefenseBandByCategory[card.category.code];
  if (fallback == null) {
    return {
      resistance: { color: "red", rollsRequired: 0 },
      resistanceAccrueAllowed: false,
      annulationAllowed: false,
      annulationCardsRequired: 0,
      mirrorAllowed: false
    };
  }

  return cloneMapping(fallback);
}

function getCardMapping(state: MapperState, card: BaseCardDefinition): DefenseBandRules {
  return cloneMapping(state.mappings[card.id] ?? fallbackMapping(card));
}

function findNextPendingIndex(cards: BaseCardDefinition[], mappings: BaseDefenseBandMappings, startIndex: number): number {
  for (let offset = 1; offset <= cards.length; offset += 1) {
    const index = (startIndex + offset) % cards.length;
    if (mappings[cards[index].id] == null) {
      return index;
    }
  }

  return startIndex;
}

export async function createCardBandMapperApp(rootElement: HTMLDivElement): Promise<void> {
  const state: MapperState = {
    cards: baseCardDefinitions.filter(hasVisibleDefenseBand),
    mappings: await fetchBaseDefenseBandMappings(),
    currentIndex: 0,
    statusMessage: "Adjust the defense band, save, then move to the next pending card. Object cards without a visible band are skipped.",
    isSaving: false
  };

  const render = (): void => {
    const card = state.cards[state.currentIndex];
    const mapping = getCardMapping(state, card);
    const pendingCount = state.cards.filter((candidate) => state.mappings[candidate.id] == null).length;

    rootElement.innerHTML = renderBandMapperView({
      card,
      mapping,
      pendingCount,
      currentIndex: state.currentIndex,
      totalCount: state.cards.length,
      statusMessage: state.statusMessage,
      isSaving: state.isSaving
    });

    rootElement.querySelectorAll<HTMLElement>("[data-mapper-field]").forEach((element) => {
      const eventName = element instanceof HTMLSelectElement || element instanceof HTMLInputElement ? "input" : "change";
      element.addEventListener(eventName, () => {
        const liveCard = state.cards[state.currentIndex];
        const nextMapping = getCardMapping(state, liveCard);
        const field = element.dataset.mapperField;
        if (field == null) {
          return;
        }

        if (element instanceof HTMLInputElement && element.type === "checkbox") {
          if (field === "resistanceAccrueAllowed") {
            nextMapping.resistanceAccrueAllowed = element.checked;
          } else if (field === "annulationAllowed") {
            nextMapping.annulationAllowed = element.checked;
          } else if (field === "mirrorAllowed") {
            nextMapping.mirrorAllowed = element.checked;
          }
        } else if (field === "resistance.color" && element instanceof HTMLSelectElement) {
          nextMapping.resistance.color = element.value as DefenseBandRules["resistance"]["color"];
        } else if (field === "resistance.rollsRequired" && element instanceof HTMLInputElement) {
          nextMapping.resistance.rollsRequired = Math.max(0, Number(element.value || "0"));
        } else if (field === "annulationCardsRequired" && element instanceof HTMLInputElement) {
          nextMapping.annulationCardsRequired = Math.max(0, Number(element.value || "0"));
        }

        state.mappings[liveCard.id] = nextMapping;
        state.statusMessage = `Editing ${liveCard.name}`;
        render();
      });
    });

    const saveCurrent = async (jumpToNextPending: boolean): Promise<void> => {
      const liveCard = state.cards[state.currentIndex];
      state.isSaving = true;
      state.statusMessage = `Saving ${liveCard.name}...`;
      render();

      try {
        state.mappings = await saveBaseDefenseBandMapping(liveCard.id, getCardMapping(state, liveCard));
        state.statusMessage = `Saved ${liveCard.name}`;
        if (jumpToNextPending) {
          state.currentIndex = findNextPendingIndex(state.cards, state.mappings, state.currentIndex);
        }
      } catch (error) {
        state.statusMessage = error instanceof Error ? error.message : "Unable to save mapping";
      } finally {
        state.isSaving = false;
        render();
      }
    };

    rootElement.querySelector<HTMLButtonElement>("[data-mapper-action='prev']")?.addEventListener("click", () => {
      state.currentIndex = (state.currentIndex - 1 + state.cards.length) % state.cards.length;
      state.statusMessage = `Viewing ${state.cards[state.currentIndex].name}`;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-mapper-action='next']")?.addEventListener("click", () => {
      state.currentIndex = (state.currentIndex + 1) % state.cards.length;
      state.statusMessage = `Viewing ${state.cards[state.currentIndex].name}`;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-mapper-action='next-unmapped']")?.addEventListener("click", () => {
      state.currentIndex = findNextPendingIndex(state.cards, state.mappings, state.currentIndex);
      state.statusMessage = `Viewing ${state.cards[state.currentIndex].name}`;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-mapper-action='save']")?.addEventListener("click", () => {
      void saveCurrent(false);
    });

    rootElement.querySelector<HTMLButtonElement>("[data-mapper-action='save-next']")?.addEventListener("click", () => {
      void saveCurrent(true);
    });
  };

  render();
}
