import { Phase } from '../core/constants.js';
import { attackerOf, createGameState } from '../core/gameState.js';
import { createGameView } from '../core/gameView.js';
import { resolveAttack, advance, validatePlacement } from '../core/rules.js';
export async function playGame({ players, ui, local = false, random = Math.random }) {
  const state = createGameState(random() < 0.5 ? 0 : 1);
  while (state.phase !== Phase.RESULT) {
    const attacker = attackerOf(state), defender = 1 - attacker;
    ui.status(state);
    if (local) { state.phase = Phase.PLACE_READY; await ui.ready(defender); }
    state.phase = Phase.PLACE;
    const placement = await players[defender].choosePlacement(createGameView(state, defender));
    validatePlacement(state, placement);
    ui.conceal(state);
    if (local) { state.phase = Phase.HANDOFF; await ui.handoff(attacker); }
    state.phase = Phase.ATTACK;
    const picked = await players[attacker].chooseAttack(createGameView(state, attacker));
    const record = resolveAttack(state, placement, picked);
    ui.status(state);
    await ui.reveal(record, state.result);
    advance(state, local);
  }
  return state;
}
