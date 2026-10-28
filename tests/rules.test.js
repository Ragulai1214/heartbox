import test from 'node:test';
import assert from 'node:assert/strict';
import { Content, Phase, BOX_VALUES } from '../js/core/constants.js';
import { createGameState, attackerOf } from '../js/core/gameState.js';
import { resolveAttack, advance, evaluateResult } from '../js/core/rules.js';
import { createGameView } from '../js/core/gameView.js';
import { emptyPlacement, placeFromButton, swapBoxes, canConfirm } from '../js/core/placement.js';
import { CpuRandomController } from '../js/players/cpuRandomController.js';
import { playGame } from '../js/flow/gameFlow.js';
const attackState = (first = 0) => Object.assign(createGameState(first), { phase: Phase.ATTACK });
const placement = { heart: 10, shield: 4 };
test('heart, shield and empty have distinct scoring and destruction', () => {
  for (const first of [0, 1]) for (const [picked, kind, gain, recipient, alive] of [[10, 'heart', 10, first, [4, 6, 8, 12]], [4, 'shield', 10, 1 - first, [...BOX_VALUES]], [6, 'empty', 0, -1, [4, 8, 10, 12]]]) {
    const s = attackState(first); const record = resolveAttack(s, placement, picked);
    assert.equal(record.kind, kind); assert.equal(record.gain, gain); assert.equal(record.gainTo, recipient);
    assert.deepEqual(s.boxesAlive, alive); assert.deepEqual(record.boxesAlive, BOX_VALUES);
    assert.equal(s.scores.reduce((a, b) => a + b), gain);
    if (recipient !== -1) { assert.equal(s.scores[recipient], gain); assert.equal(s.reachedTurn[recipient], 1); }
    assert.equal(s.history.length, 1); assert.equal(s.phase, Phase.REVEAL);
    assert.throws(() => resolveAttack(s, placement, picked));
  }
});
test('reload occurs only after destruction from three boxes on next', () => {
  for (const count of [5, 4, 3]) {
    const s = attackState(); s.boxesAlive = BOX_VALUES.slice(0, count);
    resolveAttack(s, { heart: 4, shield: 6 }, 8);
    assert.equal(s.boxesAlive.length, count - 1);
    advance(s); assert.equal(s.boxesAlive.length, count === 3 ? 5 : count - 1);
  }
  const s = attackState(); s.boxesAlive = [4, 6, 8];
  resolveAttack(s, { heart: 4, shield: 6 }, 6); advance(s);
  assert.deepEqual(s.boxesAlive, [4, 6, 8]);
});
test('target ends on either step, including shield scoring for defender', () => {
  for (const step of [0, 1]) for (const picked of [10, 4]) {
    const s = attackState(); s.step = step;
    const recipient = picked === 10 ? attackerOf(s) : 1 - attackerOf(s);
    s.scores[recipient] = 40;
    resolveAttack(s, placement, picked);
    assert.equal(s.result.winner, recipient); assert.equal(s.result.reason, 'target');
    assert.equal(s.phase, Phase.REVEAL); advance(s); assert.equal(s.phase, Phase.RESULT);
    assert.equal(s.history.length, 1); assert.throws(() => advance(s));
  }
});
test('10 turns means 20 attacks and consistent attacker order', () => {
  for (const first of [0, 1]) {
    const s = attackState(first);
    for (let i = 0; i < 20; i++) {
      assert.equal(s.turn, Math.floor(i / 2) + 1); assert.equal(s.step, i % 2);
      assert.equal(attackerOf(s), i % 2 === 0 ? first : 1 - first);
      const [heart, shield, picked] = s.boxesAlive;
      s.phase = Phase.ATTACK; resolveAttack(s, { heart, shield }, picked);
      assert.equal(Boolean(s.result), i === 19); advance(s, true);
    }
    assert.equal(s.result.winner, null); assert.equal(s.result.reason, 'draw'); assert.equal(s.history.length, 20);
  }
});
test('final score, reached turn, same turn and zero ties', () => {
  for (const [scores, reachedTurn, winner, reason] of [ [[30, 28], [9, 10], 0, 'score'], [[20, 20], [7, 9], 0, 'earlier'], [[20, 20], [9, 7], 1, 'earlier'], [[20, 20], [7, 7], null, 'draw'], [[0, 0], [0, 0], null, 'draw'] ]) {
    const s = Object.assign(attackState(), { turn: 10, step: 1, scores, reachedTurn });
    assert.equal(evaluateResult(s).winner, winner); assert.equal(evaluateResult(s).reason, reason);
  }
  const s = Object.assign(attackState(), { turn: 10, scores: [16, 14], reachedTurn: [8, 9] });
  resolveAttack(s, { heart: 4, shield: 6 }, 4); advance(s); s.phase = Phase.ATTACK;
  resolveAttack(s, { heart: 6, shield: 8 }, 6);
  assert.deepEqual(s.scores, [20, 20]); assert.deepEqual(s.reachedTurn, [10, 10]); assert.equal(s.result.winner, null);
});
test('placement rejects duplicates and invalid boxes; supports moving and swapping', () => {
  const boxes = emptyPlacement(BOX_VALUES);
  assert.equal(canConfirm(boxes), false);
  assert.equal(placeFromButton(boxes, Content.HEART, 4), true);
  assert.equal(placeFromButton(boxes, Content.HEART, 6), false);
  assert.equal(placeFromButton(boxes, Content.SHIELD, 4), false);
  assert.equal(placeFromButton(boxes, Content.SHIELD, 99), false);
  assert.equal(placeFromButton(boxes, Content.NONE, 6), false);
  assert.equal(placeFromButton(boxes, Content.SHIELD, 6), true);
  assert.equal(canConfirm(boxes), true);
  swapBoxes(boxes, 4, 8); assert.equal(boxes[4], Content.NONE); assert.equal(boxes[8], Content.HEART);
  swapBoxes(boxes, 8, 6); assert.equal(boxes[6], Content.HEART); assert.equal(boxes[8], Content.SHIELD);
  assert.equal(swapBoxes(boxes, 99, 6), false);
});
test('invalid attacks do not mutate state; public view and records do not share arrays', () => {
  const s = attackState(); const before = structuredClone(s);
  assert.throws(() => resolveAttack(s, { heart: 4, shield: 4 }, 4));
  assert.throws(() => resolveAttack(s, placement, 99)); assert.deepEqual(s, before);
  const record = resolveAttack(s, placement, 10);
  const view = createGameView(s, 1);
  assert.deepEqual(Object.keys(view).sort(), ['boxesAlive', 'history', 'player', 'role', 'scores', 'step', 'turn'].sort());
  view.history[0].heart = 99; view.history[0].boxesAlive.length = 0; view.scores[0] = 999; view.boxesAlive.length = 0;
  record.scoresAfter[0] = 999;
  assert.equal(s.scores[0], 10); assert.equal(s.history[0].heart, 10); assert.equal(s.history[0].boxesAlive.length, 5); assert.equal(s.history[0].scoresAfter[0], 10);
});
test('flow works with both CPU and local handoffs and never passes current placement', async () => {
  for (const local of [false, true]) {
    let readyCount = 0, handoffCount = 0, reveals = 0;
    const player = { async choosePlacement(view) { assert.ok(!('heart' in view)); return { heart: view.boxesAlive[0], shield: view.boxesAlive[1] }; }, async chooseAttack(view) { assert.ok(!('placement' in view)); return view.boxesAlive[2]; } };
    const ui = { status() {}, conceal() {}, async ready() { readyCount++; }, async handoff() { handoffCount++; }, async reveal() { reveals++; } };
    const s = await playGame({ players: [player, player], ui, local, random: () => 0 });
    assert.equal(s.phase, Phase.RESULT); assert.equal(reveals, 20); assert.equal(readyCount, local ? 20 : 0); assert.equal(handoffCount, local ? 20 : 0);
  }
});
test('5000 reproducible random games preserve invariants', async t => {
  let seed = 20261028;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const cpu = new CpuRandomController(random);
  const stats = { games: 5000, target: 0, limit: 0, draws: 0, firstWins: 0, turns: 0 };
  for (let game = 0; game < stats.games; game++) {
    const s = createGameState(random() < 0.5 ? 0 : 1);
    let attacks = 0;
    while (s.phase !== Phase.RESULT) {
      assert.ok(s.boxesAlive.length >= 3 && s.boxesAlive.length <= 5);
      const p = await cpu.choosePlacement(createGameView(s, 1 - attackerOf(s)));
      assert.notEqual(p.heart, p.shield);
      const picked = await cpu.chooseAttack(createGameView(s, attackerOf(s)));
      const before = [...s.scores]; s.phase = Phase.ATTACK;
      resolveAttack(s, p, picked); attacks++;
      assert.ok(s.scores.every((score, i) => score >= before[i])); assert.equal(s.history.length, attacks);
      advance(s); assert.ok(attacks <= 20);
    }
    stats[s.result.reason === 'target' ? 'target' : 'limit']++;
    if (s.result.winner === null) stats.draws++;
    if (s.result.winner === s.firstAttacker) stats.firstWins++;
    stats.turns += s.turn;
  }
  assert.ok(stats.target > 0 && stats.limit > 0);
  t.diagnostic(JSON.stringify({ ...stats, averageTurns: stats.turns / stats.games, firstWinRate: stats.firstWins / stats.games }));
});
