export const PLACE_TYPES = [
  { id: "restaurant", label: "Restaurant", icon: "🍽️" },
  { id: "cafe", label: "Cafe", icon: "☕" },
  { id: "fast_food", label: "Fast food", icon: "🍟" },
];

export const CUISINES = [
  { id: "pizza", label: "Pizza", icon: "🍕" },
  { id: "sushi", label: "Sushi", icon: "🍣" },
  { id: "mexican", label: "Mexican", icon: "🌮" },
  { id: "vietnamese", label: "Vietnamese", icon: "🍜" },
  { id: "chinese", label: "Chinese", icon: "🥡" },
  { id: "thai", label: "Thai", icon: "🍛" },
  { id: "indian", label: "Indian", icon: "🥘" },
  { id: "korean", label: "Korean", icon: "🍱" },
  { id: "japanese", label: "Japanese", icon: "🍙" },
  { id: "italian", label: "Italian", icon: "🍝" },
  { id: "burgers", label: "Burgers", icon: "🍔" },
  { id: "sandwiches", label: "Sandwiches", icon: "🥪" },
  { id: "seafood", label: "Seafood", icon: "🐟" },
];

export const ALL_CATEGORY_IDS = [...PLACE_TYPES, ...CUISINES].map((item) => item.id);

const ICON_MATCHES = [
  { id: "pizza", match: /pizza/i, icon: "🍕" },
  { id: "sushi", match: /sushi|sashimi/i, icon: "🍣" },
  { id: "mexican", match: /mexican|taco|tex-mex/i, icon: "🌮" },
  { id: "vietnamese", match: /vietnamese|pho/i, icon: "🍜" },
  { id: "chinese", match: /chinese/i, icon: "🥡" },
  { id: "thai", match: /thai/i, icon: "🍛" },
  { id: "indian", match: /indian/i, icon: "🥘" },
  { id: "korean", match: /korean/i, icon: "🍱" },
  { id: "japanese", match: /japanese|ramen/i, icon: "🍙" },
  { id: "italian", match: /italian|pasta/i, icon: "🍝" },
  { id: "burgers", match: /burger/i, icon: "🍔" },
  { id: "sandwiches", match: /sandwich/i, icon: "🥪" },
  { id: "seafood", match: /seafood|fish/i, icon: "🐟" },
  { id: "cafe", match: /cafe|coffee|bakery/i, icon: "☕", generic: true },
  { id: "fast_food", match: /fast food/i, icon: "🍟", generic: true },
  { id: "restaurant", match: /restaurant/i, icon: "🍽️", generic: true },
];

export function foodTypesFromCategories(categories) {
  const labels = Array.isArray(categories) ? categories : [];
  const specific = [];
  const generic = [];
  for (const label of labels) {
    for (const row of ICON_MATCHES) {
      if (!row.match.test(label)) continue;
      if (row.generic) generic.push(row.id);
      else specific.push(row.id);
    }
  }
  return [...new Set(specific.length ? specific : generic)];
}

export function shouldAvoidRepeatType(selectedIds) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const foods = CUISINES.map((item) => item.id).filter((id) => selected.includes(id));
  if (foods.length > 1) return true;
  if (foods.length === 1) return false;
  const venues = PLACE_TYPES.map((item) => item.id).filter((id) => selected.includes(id));
  return venues.length > 1;
}

export function iconForCategories(categories) {
  const labels = Array.isArray(categories) ? categories : [];
  for (const label of labels) {
    const hit = ICON_MATCHES.find((row) => !row.generic && row.match.test(label));
    if (hit) return hit.icon;
  }
  for (const label of labels) {
    const hit = ICON_MATCHES.find((row) => row.match.test(label));
    if (hit) return hit.icon;
  }
  return "🍽️";
}
