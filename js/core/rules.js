import { BOX_VALUES, TARGET_SCORE, MAX_TURNS, Phase, HitKind } from './constants.js';
import { attackerOf } from './gameState.js';
export function validatePlacement(state, placement) {
  if (!placement || placement.heart === placement.shield || !state.boxesAlive.includes(placement.heart) || !state.boxesAlive.includes(placement.shield)) throw new Error('Invalid placement');
}
export function evaluateResult(state) {
  const winner = state.scores.findIndex(score => score >= TARGET_SCORE);
  if (winner !== -1) return { winner, reason: 'target', reachedTurn: [...state.reachedTurn] };
  if (state.turn !== MAX_TURNS || state.step !== 1) return null;
  if (state.scores[0] !== state.scores[1]) return { winner: state.scores[0] > state.scores[1] ? 0 : 1, reason: 'score', reachedTurn: [...state.reachedTurn] };
  if (state.reachedTurn[0] !== state.reachedTurn[1]) return { winner: state.reachedTurn[0] < state.reachedTurn[1] ? 0 : 1, reason: 'earlier', reachedTurn: [...state.reachedTurn] };
  return { winner: null, reason: 'draw', reachedTurn: [...state.reachedTurn] };
}
export function resolveAttack(state, placement, picked) {
  if (state.phase !== Phase.ATTACK || state.result) throw new Error('Attack unavailable');
  validatePlacement(state, placement);
  if (!state.boxesAlive.includes(picked)) throw new Error('Invalid target');
  const attacker = attackerOf(state);
  const kind = picked === placement.heart ? HitKind.HEART : picked === placement.shield ? HitKind.SHIELD : HitKind.EMPTY;
  const gain = kind === HitKind.EMPTY ? 0 : placement.heart;
  const gainTo = kind === HitKind.EMPTY ? -1 : kind === HitKind.HEART ? attacker : 1 - attacker;
  const boxesAlive = [...state.boxesAlive];
  if (gainTo !== -1) { state.scores[gainTo] += gain; state.reachedTurn[gainTo] = state.turn; }
  if (kind !== HitKind.SHIELD) state.boxesAlive = state.boxesAlive.filter(value => value !== picked);
  const record = { turn: state.turn, step: state.step, attacker, boxesAlive, heart: placement.heart, shield: placement.shield, picked, kind, gain, gainTo, scoresAfter: [...state.scores] };
  state.history.push(record);
  state.result = evaluateResult(state);
  state.phase = Phase.REVEAL;
  return structuredClone(record);
}
export function advance(state, local = false) {
  if (state.phase !== Phase.REVEAL) throw new Error('Advance unavailable');
  if (state.result) { state.phase = Phase.RESULT; return; }
  if (state.boxesAlive.length === 2) state.boxesAlive = [...BOX_VALUES];
  if (state.step === 0) state.step = 1;
  else { state.step = 0; state.turn += 1; }
  state.phase = local ? Phase.PLACE_READY : Phase.PLACE;
}
