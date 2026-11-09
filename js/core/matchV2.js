import { BOX_VALUES, Phase } from './constants.js';
import { createGameState } from './gameState.js';
import { resolveAttack } from './rules.js';
import { createConstraint } from './constraints.js';

export function createMatch(random = Math.random) {
  return { ...createGameState(0), version: 2, set: 1, sets: [0, 0], setResult: null, setHistory: [],
    constraint: createConstraint(BOX_VALUES, random) };
}
export function resolveMatchAttack(state, placement, picked) {
  if (state.setResult) throw new Error('Set already ended');
  const record = resolveAttack(state, placement, picked);
  Object.assign(record, { set: state.set, constraint: structuredClone(state.constraint) });
  Object.assign(state.history.at(-1), record);
  const winner = state.scores.findIndex(score => score >= 20);
  if (winner !== -1) {
    state.sets[winner]++;
    state.setResult = { winner, scores: [...state.scores], set: state.set };
    state.setHistory.push(structuredClone(state.setResult));
    if (state.sets[winner] === 2) state.result = { winner, reason: 'sets' };
  }
  return record;
}
export function advanceMatch(state, random = Math.random) {
  if (state.phase !== Phase.REVEAL) throw new Error('Advance unavailable');
  if (state.result) { state.phase = Phase.RESULT; return; }
  if (state.setResult) {
    state.set++; state.scores = [0, 0]; state.reachedTurn = [0, 0]; state.turn = 1; state.step = 0;
    state.boxesAlive = [...BOX_VALUES]; state.setResult = null;
  } else {
    if (state.boxesAlive.length === 2) state.boxesAlive = [...BOX_VALUES];
    if (state.step === 0) state.step = 1;
    else { state.step = 0; state.turn++; }
  }
  state.constraint = createConstraint(state.boxesAlive, random);
  state.phase = Phase.PLACE;
}
