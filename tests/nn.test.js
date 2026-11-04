import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_VALUES, Phase } from '../js/core/constants.js';
import { createGameState } from '../js/core/gameState.js';
import { createGameView } from '../js/core/gameView.js';
import { ACTIONS, decodeAction, legalActionMask } from '../js/core/actionSpace.js';
import { FEATURE_SIZE, encodeFeatures } from '../js/core/features.js';
import { CpuNnController } from '../js/players/cpuNnController.js';
import { infer, validateModel } from '../js/players/nnInference.js';
import { TrainingEnvironment, rewardFor } from '../training/environment.mjs';

function zeroModel() {
  const layer = (input, output) => ({ weight: Array.from({ length: output }, () => Array(input).fill(0)), bias: Array(output).fill(0) });
  return { featureVersion: 'heartbox-v1', actionVersion: 'heartbox-actions-v1',
    rules: { boxes: [...BOX_VALUES], maxTurns: 15, targetScore: 45, shieldScoring: 'shield-box' },
    hidden1: layer(FEATURE_SIZE, 64), hidden2: layer(64, 64), policy: layer(64, 25), value: layer(64, 1) };
}

test('25 fixed actions mask all invalid boxes and the other role on every playable subset', () => {
  assert.equal(ACTIONS.length, 25);
  for (let bits = 0; bits < 32; bits++) {
    const boxesAlive = BOX_VALUES.filter((_, index) => bits & (1 << index));
    if (boxesAlive.length < 3) continue;
    for (const role of ['attacker', 'defender']) {
      const view = { boxesAlive, role }, mask = legalActionMask(view);
      assert.equal(mask.filter(Boolean).length, role === 'attacker' ? boxesAlive.length : boxesAlive.length * (boxesAlive.length - 1));
      mask.forEach((valid, index) => valid ? assert.deepEqual(decodeAction(index, view), ACTIONS[index]) : assert.throws(() => decodeAction(index, view)));
      assert.throws(() => decodeAction(0.5, view));
      assert.throws(() => decodeAction(25, view));
    }
  }
});

test('features contain only public data and translate seats to relative roles', () => {
  const state = createGameState(0), view = createGameView(state, 0);
  const original = encodeFeatures(view);
  assert.equal(original.length, 203);
  assert.deepEqual(original.slice(78), Array(125).fill(0));
  assert.deepEqual(encodeFeatures({ ...view, placement: { heart: 12, shield: 4 }, opponent: 'secret', future: [1] }), original);
  state.history.push({ turn: 2, attacker: 1, boxesAlive: [...BOX_VALUES], heart: 12, shield: 6, picked: 12,
    kind: 'heart', gain: 12, gainTo: 1, scoresAfter: [0, 12] });
  state.scores = [0, 12]; state.turn = 2;
  const observed = createGameView(state, 0), encoded = encodeFeatures(observed);
  assert.equal(encoded[11], 2/15);
  assert.equal(encoded[78], 1);
  assert.equal(encoded[79], 0);
  const swapped = { ...observed, player: 1, scores: [...observed.scores].reverse(), history: observed.history.map(record => ({ ...record, attacker: 1-record.attacker, gainTo: 1-record.gainTo })) };
  assert.deepEqual(encodeFeatures(swapped), encoded);
  assert.deepEqual(encodeFeatures(view), original);
});

test('all hit, role and terminal reward combinations match the user specification', () => {
  for (const heart of BOX_VALUES) for (const shield of BOX_VALUES.filter(box => box !== heart)) for (const [kind, attackReward] of [['heart', heart/2], ['shield', -shield/2], ['empty', 0]]) {
    for (const attacker of [0, 1]) for (const learner of [0, 1]) {
      const base = attacker === learner ? attackReward : -attackReward;
      assert.equal(rewardFor({ kind, attacker, heart, shield }, null, learner), base || 0);
      assert.equal(rewardFor({ kind, attacker, heart, shield }, { winner: learner }, learner), base+7);
      assert.equal(rewardFor({ kind, attacker, heart, shield }, { winner: 1-learner }, learner), base-7);
      assert.equal(rewardFor({ kind, attacker, heart, shield }, { winner: null }, learner), base || 0);
    }
  }
});

test('defense resolves before reward and terminal reward cannot be counted twice', async () => {
  for (const [picked, expected, scores] of [[12, -13, [0, 44]], [4, 9, [44, 0]]]) {
    const env = new TrainingEnvironment();
    env.reset({ learner: 0, firstAttacker: 1 });
    env.state.scores = scores;
    env.opponent = { async chooseAttack() { return picked; } };
    const action = ACTIONS.findIndex(item => item.heart === 12 && item.shield === 4);
    const result = await env.step(action);
    assert.equal(result.reward, expected); assert.equal(result.done, true); assert.equal(result.observation, null);
    await assert.rejects(env.step(action), /No active match/);
    const reset = env.reset({ gameId: 2 });
    assert.equal(reset.gameId, 2); assert.deepEqual(reset.view.history, []); assert.deepEqual(reset.view.scores, [0, 0]);
  }
});

test('attacking winner gets +13 and turn limit is a true terminal', async () => {
  const env = new TrainingEnvironment();
  env.reset({ learner: 0, firstAttacker: 0 });
  env.state.scores = [44, 0];
  env.opponent = { async choosePlacement() { return { heart: 12, shield: 4 }; } };
  assert.equal((await env.step(4)).reward, 13);
  env.reset({ learner: 0, firstAttacker: 1 });
  env.state.turn = 15; env.state.step = 1;
  env.opponent = { async choosePlacement() { return { heart: 12, shield: 4 }; } };
  const final = await env.step(1);
  assert.equal(final.reward, 0); assert.equal(final.done, true); assert.equal(final.result.winner, null);
  assert.equal(env.state.phase, Phase.RESULT);
});

test('frozen past NN copies weights and masks probabilities; incompatible models fail', async () => {
  const source = zeroModel(), cpu = new CpuNnController(source, () => 0.999);
  source.policy.bias[0] = 100;
  assert.equal(cpu.model.policy.bias[0], 0);
  assert.throws(() => { cpu.model.policy.bias[0] = 20; }, TypeError);
  for (const player of [0, 1]) {
    const state = createGameState(0); state.boxesAlive = [4, 8, 12];
    const view = createGameView(state, player), mask = legalActionMask(view);
    const output = infer(cpu.model, encodeFeatures(view), mask);
    output.probabilities.forEach((probability, index) => assert.equal(probability, mask[index] ? 1/mask.filter(Boolean).length : 0));
    const action = cpu.choose(view);
    assert.ok(ACTIONS.some((candidate, index) => mask[index] && JSON.stringify(candidate) === JSON.stringify(action)));
  }
  assert.throws(() => validateModel({ ...source, featureVersion: 'other' }));
  const oldModel = structuredClone(source);
  delete oldModel.rules.shieldScoring;
  assert.throws(() => validateModel(oldModel), /Incompatible NN model/);
  source.policy.bias[0] = NaN;
  assert.throws(() => validateModel(source));
});

test('environment rejects invalid actions without changing the game', async () => {
  const env = new TrainingEnvironment(); env.reset({ learner: 0, firstAttacker: 0 });
  const before = structuredClone(env.state);
  await assert.rejects(env.step(5), /Illegal NN action/);
  assert.deepEqual(env.state, before);
});
