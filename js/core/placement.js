import { Content } from './constants.js';
export const emptyPlacement = values => Object.fromEntries(values.map(value => [value, Content.NONE]));
export function placeFromButton(boxes, content, toValue) {
  if (![Content.HEART, Content.SHIELD].includes(content) || boxes[toValue] !== Content.NONE || Object.values(boxes).includes(content)) return false;
  boxes[toValue] = content;
  return true;
}
export function swapBoxes(boxes, fromValue, toValue) {
  if (!Object.hasOwn(boxes, fromValue) || !Object.hasOwn(boxes, toValue)) return false;
  [boxes[fromValue], boxes[toValue]] = [boxes[toValue], boxes[fromValue]];
  return true;
}
export function canConfirm(boxes) {
  const values = Object.values(boxes);
  return values.every(value => Object.values(Content).includes(value)) && values.filter(v => v === Content.HEART).length === 1 && values.filter(v => v === Content.SHIELD).length === 1;
}
export function placementChoice(boxes) {
  if (!canConfirm(boxes)) throw new Error('Incomplete placement');
  return { heart: Number(Object.keys(boxes).find(key => boxes[key] === Content.HEART)), shield: Number(Object.keys(boxes).find(key => boxes[key] === Content.SHIELD)) };
}
