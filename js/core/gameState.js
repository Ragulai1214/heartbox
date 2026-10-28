import { BOX_VALUES, Phase } from './constants.js';
export function createGameState(firstAttacker) {
  if (![0, 1].includes(firstAttacker)) throw new Error('Invalid player');
  return { boxesAlive: [...BOX_VALUES], scores: [0, 0], turn: 1, step: 0, firstAttacker, reachedTurn: [0, 0], history: [], phase: Phase.PLACE_READY, result: null };
}
export const attackerOf = state => state.step === 0 ? state.firstAttacker : 1 - state.firstAttacker;
