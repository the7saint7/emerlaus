import type { BaseCardDefinition, DefenseBandRules } from "../../../shared/cards/types";

export interface BandMapperViewParams {
  card: BaseCardDefinition;
  mapping: DefenseBandRules;
  pendingCount: number;
  currentIndex: number;
  totalCount: number;
  statusMessage: string;
  isSaving: boolean;
}

function renderCheckboxField(
  label: string,
  field: string,
  checked: boolean
): string {
  return `
    <label class="mapper-check">
      <input type="checkbox" data-mapper-field="${field}" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

export function renderBandMapperView({
  card,
  mapping,
  pendingCount,
  currentIndex,
  totalCount,
  statusMessage,
  isSaving
}: BandMapperViewParams): string {
  const cardImagePath = card.image.importedAssetPath?.replace("client/public", "") ?? "";

  return `
    <main class="mapper-screen">
      <section class="mapper-topbar">
        <div>
          <p class="eyebrow">Dev Only</p>
          <h1>Defense Band Mapper</h1>
          <p class="hero-copy">Map the base-set defense band visually and persist the result into the repo.</p>
        </div>
        <div class="mapper-stats">
          <span class="status-pill">${currentIndex + 1} / ${totalCount}</span>
          <span class="status-pill">${pendingCount} pending</span>
          <span class="status-pill">${card.category.code}</span>
        </div>
      </section>

      <section class="mapper-layout">
        <article class="mapper-card-panel">
          <div class="mapper-image-wrap">
            <img class="mapper-card-image" src="${cardImagePath}" alt="${card.name}" />
          </div>
          <div class="mapper-band-preview">
            <img class="mapper-band-image" src="${cardImagePath}" alt="${card.name} defense band" />
          </div>
        </article>

        <article class="mapper-form-panel">
          <header class="mapper-card-header">
            <div>
              <h2>${card.name}</h2>
              <p class="mapper-card-meta">${card.category.label} (${card.category.code}) · Base qty ${card.baseDeckQuantity}</p>
            </div>
            <a class="mapper-source-link" href="${card.sourceUrl ?? "#"}" target="_blank" rel="noreferrer">Source</a>
          </header>

          <section class="mapper-description-block">
            <h3>Description</h3>
            <p>${card.description.replaceAll("\n", "<br />")}</p>
          </section>

          <section class="mapper-fields">
            <div class="mapper-field">
              <label for="resistance-color">Resistance Color</label>
              <select id="resistance-color" data-mapper-field="resistance.color">
                <option value="blue" ${mapping.resistance.color === "blue" ? "selected" : ""}>Blue</option>
                <option value="red" ${mapping.resistance.color === "red" ? "selected" : ""}>Red</option>
                <option value="yellow" ${mapping.resistance.color === "yellow" ? "selected" : ""}>Yellow</option>
              </select>
            </div>

            <div class="mapper-field">
              <label for="resistance-rolls">Resistance Rolls Required</label>
              <input id="resistance-rolls" type="number" min="0" max="9" value="${mapping.resistance.rollsRequired}" data-mapper-field="resistance.rollsRequired" />
            </div>

            <div class="mapper-field">
              <label for="annulation-required">Annulation Cards Required</label>
              <input id="annulation-required" type="number" min="0" max="9" value="${mapping.annulationCardsRequired}" data-mapper-field="annulationCardsRequired" />
            </div>

            <div class="mapper-fieldset">
              ${renderCheckboxField("Résistance accrue allowed", "resistanceAccrueAllowed", mapping.resistanceAccrueAllowed)}
              ${renderCheckboxField("Annulation allowed", "annulationAllowed", mapping.annulationAllowed)}
              ${renderCheckboxField("Miroir allowed", "mirrorAllowed", mapping.mirrorAllowed)}
            </div>
          </section>

          <section class="mapper-preview-block">
            <h3>Current Mapping</h3>
            <pre>${JSON.stringify(mapping, null, 2)}</pre>
          </section>

          <p class="mapper-status">${statusMessage}</p>

          <div class="mapper-actions">
            <button class="action-button action-button--secondary" data-mapper-action="prev">Previous</button>
            <button class="action-button action-button--secondary" data-mapper-action="next">Next</button>
            <button class="action-button action-button--secondary" data-mapper-action="next-unmapped">Next Pending</button>
            <button class="action-button" data-mapper-action="save" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving..." : "Save"}</button>
            <button class="action-button" data-mapper-action="save-next" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving..." : "Save & Next"}</button>
          </div>
        </article>
      </section>
    </main>
  `;
}
