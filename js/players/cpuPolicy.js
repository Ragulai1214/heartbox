export const pick = (items, random) => items[Math.floor(random() * items.length)];

export function placements(boxes) {
  return boxes.flatMap(heart => boxes.filter(shield => shield !== heart).map(shield => ({ heart, shield })));
}

export function best(items, value, random) {
  const values = items.map(value);
  const maximum = Math.max(...values);
  return pick(items.filter((_, index) => Math.abs(values[index] - maximum) < 1e-10), random);
}
