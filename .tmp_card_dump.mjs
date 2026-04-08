import { baseCardDefinitions } from './shared/cards/catalog/base-cards.ts';
for (const c of baseCardDefinitions) {
  console.log('ID: ' + c.id);
  console.log('NAME: ' + c.name);
  console.log('DESC: ' + c.description);
  console.log('---');
}
