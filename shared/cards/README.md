Generated card data lives in `shared/cards/generated/`.

Current pipeline:
- scraper JSON is the primary source for text
- base-set images are copied into `client/public/assets/cards/base/`
- bottom defense bands are cropped into `docs/artifacts/card-bands/base/`

Current limitations:
- defense bands are not yet fully machine-mapped
- image text overrides are not yet applied automatically
- only `Jeu de base` is normalized for gameplay work
