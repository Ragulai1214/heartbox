import { attackerOf } from './gameState.js';
export function createGameView(state, player) {
  return structuredClone({ boxesAlive: state.boxesAlive, scores: state.scores, turn: state.turn, step: state.step, player, role: attackerOf(state) === player ? 'attacker' : 'defender', history: state.history });
}
