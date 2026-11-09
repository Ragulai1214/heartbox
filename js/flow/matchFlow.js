import { Phase } from '../core/constants.js';
import { attackerOf } from '../core/gameState.js';
import { createGameView } from '../core/gameView.js';
import { validatePlacement } from '../core/rules.js';
import { createMatch, resolveMatchAttack, advanceMatch } from '../core/matchV2.js';
export async function playMatch({ players, ui, local = false, random = Math.random }) {
  const state = createMatch(random);
  while (state.phase !== Phase.RESULT) {
    const attacker = attackerOf(state), defender = 1 - attacker;
    ui.status(state);
    if (local) await ui.ready(defender);
    state.phase = Phase.PLACE;
    const placement = await players[defender].choosePlacement(createGameView(state, defender));
    validatePlacement(state, placement); ui.conceal(state);
    if (local) await ui.handoff(attacker);
    state.phase = Phase.ATTACK;
    const picked = await players[attacker].chooseAttack(createGameView(state, attacker));
    const record = resolveMatchAttack(state, placement, picked);
    ui.status(state); await ui.reveal(record);
    advanceMatch(state, random);
  }
  return state;
}
