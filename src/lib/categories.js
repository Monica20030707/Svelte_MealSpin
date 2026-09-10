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
  { match: /pizza/i, icon: "🍕" },
  { match: /sushi|sashimi/i, icon: "🍣" },
  { match: /mexican|taco|tex-mex/i, icon: "🌮" },
  { match: /vietnamese|pho/i, icon: "🍜" },
  { match: /chinese/i, icon: "🥡" },
  { match: /thai/i, icon: "🍛" },
  { match: /indian/i, icon: "🥘" },
  { match: /korean/i, icon: "🍱" },
  { match: /japanese|ramen/i, icon: "🍙" },
  { match: /italian|pasta/i, icon: "🍝" },
  { match: /burger/i, icon: "🍔" },
  { match: /sandwich/i, icon: "🥪" },
  { match: /seafood|fish/i, icon: "🐟" },
  { match: /cafe|coffee|bakery/i, icon: "☕", generic: true },
  { match: /fast food/i, icon: "🍟", generic: true },
  { match: /restaurant/i, icon: "🍽️", generic: true },
];

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
