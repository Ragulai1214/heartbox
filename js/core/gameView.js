import { attackerOf } from './gameState.js';
export function createGameView(state, player) {
  return structuredClone({ boxesAlive: state.boxesAlive, scores: state.scores, turn: state.turn, step: state.step, player, role: attackerOf(state) === player ? 'attacker' : 'defender', history: state.history,
    ...(state.version === 2 ? { version: 2, set: state.set, sets: state.sets, constraint: state.constraint } : {}) });
}
