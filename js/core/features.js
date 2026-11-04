import { BOX_VALUES, MAX_TURNS, TARGET_SCORE } from './constants.js';

export const FEATURE_VERSION = 'heartbox-v1';
export const FEATURE_SIZE = 203;
const oneHot = value => BOX_VALUES.map(box => Number(box === value));

export function encodeFeatures(view) {
  const { player, history, boxesAlive, scores, turn, step, role } = view;
  const reached = [0, 0];
  for (const record of history) if (record.gainTo >= 0 && record.gain > 0) reached[record.gainTo] = record.turn;
  const result = [
    ...BOX_VALUES.map(box => Number(boxesAlive.includes(box))),
    scores[player] / TARGET_SCORE, scores[1 - player] / TARGET_SCORE,
    turn / MAX_TURNS, step, Number(role === 'attacker'),
    reached[player] / MAX_TURNS, reached[1 - player] / MAX_TURNS,
  ];
  for (const windowSize of [Infinity, 5]) {
    for (const field of ['heart', 'shield', 'picked']) {
      let records = history.filter(record => (record.attacker === player) === (field !== 'picked'));
      if (windowSize !== Infinity) records = records.slice(-windowSize);
      const exposure = BOX_VALUES.map(box => records.filter(record => record.boxesAlive.includes(box)).length);
      result.push(...BOX_VALUES.map((box, index) => exposure[index] ? records.filter(record => record[field] === box).length / exposure[index] : 0));
      result.push(...exposure.map(count => count / (windowSize === Infinity ? MAX_TURNS : windowSize)));
      result.push(records.length / (windowSize === Infinity ? MAX_TURNS : windowSize));
    }
  }
  const recent = history.slice(-5);
  for (let index = 0; index < 5; index++) {
    const record = recent[index];
    result.push(...(record ? [1, Number(record.attacker === player),
      ...BOX_VALUES.map(box => Number(record.boxesAlive.includes(box))),
      ...oneHot(record.heart), ...oneHot(record.shield), ...oneHot(record.picked),
      ...['heart', 'shield', 'empty'].map(kind => Number(record.kind === kind)),
    ] : Array(25).fill(0)));
  }
  if (result.length !== FEATURE_SIZE || !result.every(Number.isFinite)) throw new Error('Invalid NN features');
  return result;
}
