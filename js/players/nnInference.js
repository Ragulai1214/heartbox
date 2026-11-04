import { FEATURE_VERSION, FEATURE_SIZE } from '../core/features.js';
import { BOX_VALUES, MAX_TURNS, TARGET_SCORE } from '../core/constants.js';

export function validateModel(model) {
  if (model?.featureVersion !== FEATURE_VERSION || model?.actionVersion !== 'heartbox-actions-v1'
    || model?.rules?.shieldScoring !== 'shield-box'
    || model?.rules?.maxTurns !== MAX_TURNS || model?.rules?.targetScore !== TARGET_SCORE
    || JSON.stringify(model?.rules?.boxes) !== JSON.stringify(BOX_VALUES)) throw new Error('Incompatible NN model');
  const shapes = [[FEATURE_SIZE, 64], [64, 64], [64, 25], [64, 1]];
  for (const [index, name] of ['hidden1', 'hidden2', 'policy', 'value'].entries()) {
    const layer = model[name], [input, output] = shapes[index];
    if (!Array.isArray(layer?.weight) || layer.weight.length !== output || !Array.isArray(layer?.bias)
      || layer.bias.length !== output || !layer.bias.every(Number.isFinite)
      || !layer.weight.every(row => Array.isArray(row) && row.length === input && row.every(Number.isFinite))) throw new Error(`Invalid NN layer: ${name}`);
  }
  return model;
}
const dense = (input, layer) => layer.weight.map((row, index) => row.reduce((sum, weight, column) => sum + weight * input[column], layer.bias[index]));

export function infer(model, features, mask) {
  if (features.length !== FEATURE_SIZE || !features.every(Number.isFinite) || mask.length !== 25 || !mask.some(Boolean)) throw new Error('Invalid NN observation');
  const h1 = dense(features, model.hidden1).map(Math.tanh);
  const h2 = dense(h1, model.hidden2).map(Math.tanh);
  const logits = dense(h2, model.policy);
  const max = Math.max(...logits.filter((_, index) => mask[index]));
  const weights = logits.map((logit, index) => mask[index] ? Math.exp(logit - max) : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const value = dense(h2, model.value)[0];
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(value)) throw new Error('Non-finite NN output');
  return { logits, probabilities: weights.map(weight => weight / total), value };
}

export function sampleAction(probabilities, random) {
  let remaining = random();
  for (let index = 0; index < probabilities.length; index++) {
    remaining -= probabilities[index];
    if (remaining < 0) return index;
  }
  return probabilities.findLastIndex(value => value > 0);
}
