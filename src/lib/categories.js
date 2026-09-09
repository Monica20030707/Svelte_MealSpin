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
