import { BOX_VALUES } from './constants.js';

export const ACTIONS = Object.freeze([
  ...BOX_VALUES.map(picked => Object.freeze({ picked })),
  ...BOX_VALUES.flatMap(heart => BOX_VALUES.filter(shield => shield !== heart).map(shield => Object.freeze({ heart, shield }))),
]);

export function legalActionMask(view) {
  return ACTIONS.map(action => view.role === 'attacker'
    ? 'picked' in action && view.boxesAlive.includes(action.picked)
    : !('picked' in action) && view.boxesAlive.includes(action.heart) && view.boxesAlive.includes(action.shield));
}

export function decodeAction(index, view) {
  if (!Number.isInteger(index) || !legalActionMask(view)[index]) throw new RangeError('Illegal NN action');
  return { ...ACTIONS[index] };
}
