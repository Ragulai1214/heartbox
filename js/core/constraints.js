export function createConstraint(boxes, random = Math.random) {
  if (boxes.length === 3) return null;
  const target = 'shield';
  const pool = [...boxes], allowed = [];
  const count = boxes.length === 5 ? 3 : 2;
  while (allowed.length < count) allowed.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return { target, allowed: allowed.sort((a, b) => a - b) };
}
export function allowedPlacement(placement, constraint) {
  return !constraint || constraint.allowed.includes(placement[constraint.target]);
}
export function legalPlacements(view) {
  return view.boxesAlive.flatMap(heart => view.boxesAlive.filter(shield => shield !== heart)
    .map(shield => ({ heart, shield }))).filter(p => allowedPlacement(p, view.constraint));
}
export function constraintText(constraint) {
  return constraint ? `シールドは ${constraint.allowed.join('・')}点の箱に配置可能。ハートは全箱に配置可能（重複不可）` : '配置制約なし：ハート・シールドとも全箱に配置可能（重複不可）';
}
