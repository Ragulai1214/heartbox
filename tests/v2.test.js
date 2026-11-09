import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_VALUES, Phase } from '../js/core/constants.js';
import { createMatch, resolveMatchAttack, advanceMatch } from '../js/core/matchV2.js';
import { createConstraint, legalPlacements } from '../js/core/constraints.js';
import { validatePlacement } from '../js/core/rules.js';
import { createGameView } from '../js/core/gameView.js';
import { PersonalityController } from '../js/players/personalityController.js';
import { playMatch } from '../js/flow/matchFlow.js';
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('constraints have exact sizes and every legal board has placements', () => {
  for (let bits = 0; bits < 32; bits++) {
    const boxesAlive = BOX_VALUES.filter((_, i) => bits & (1 << i));
    if (boxesAlive.length < 3) continue;
    for (const value of [0, .999]) {
      const constraint = createConstraint(boxesAlive, () => value);
      if (boxesAlive.length === 3) assert.equal(constraint, null);
      else {
        assert.equal(constraint.allowed.length, boxesAlive.length - 2);
        assert.equal(new Set(constraint.allowed).size, constraint.allowed.length);
        assert.equal(constraint.target, 'shield');
      }
      const view = { boxesAlive, constraint };
      for (const p of legalPlacements(view)) assert.doesNotThrow(() => validatePlacement(view, p));
      assert.ok(legalPlacements(view).length > 0);
      for (const heart of boxesAlive) assert.ok(legalPlacements(view).some(p => p.heart === heart));
    }
  }
});

test('three sets reset board and scores, award immediately, and stop on two wins', () => {
  const state = createMatch(() => 0);
  for (const winner of [0, 1, 0]) {
    state.constraint = null; state.boxesAlive = [4, 6, 12];
    state.scores[winner] = 18; state.phase = Phase.ATTACK;
    const record = resolveMatchAttack(state, { heart: 4, shield: 12 }, winner === 0 ? 4 : 12);
    assert.equal(state.setResult.winner, winner);
    assert.equal(record.set, state.set);
    assert.throws(() => resolveMatchAttack(state, { heart: 4, shield: 12 }, 4));
    advanceMatch(state, () => 0);
    if (!state.result) {
      assert.deepEqual(state.scores, [0, 0]); assert.deepEqual(state.boxesAlive, BOX_VALUES);
      assert.equal(state.turn, 1); assert.equal(state.step, 0); assert.equal(state.firstAttacker, 0);
    }
  }
  assert.deepEqual(state.sets, [2, 1]); assert.equal(state.phase, Phase.RESULT);
  assert.equal(state.setHistory.length, 3); assert.equal(state.history.length, 3);
});

test('reload and next constraint wait for confirmation, public view never leaks placement', () => {
  const s = createMatch(() => 0);
  s.boxesAlive = [4, 6, 8]; s.constraint = null; s.phase = Phase.ATTACK;
  s.turn = 16;
  const record = resolveMatchAttack(s, { heart: 4, shield: 6 }, 8);
  assert.equal(s.result, null); assert.deepEqual(s.boxesAlive, [4, 6]); assert.equal(s.constraint, null);
  assert.deepEqual(record.boxesAlive, [4, 6, 8]);
  advanceMatch(s, () => 0);
  assert.deepEqual(s.boxesAlive, BOX_VALUES); assert.equal(s.constraint.allowed.length, 3);
  const view = createGameView(s, 0);
  assert.ok(!('placement' in view)); view.constraint.allowed.length = 0;
  assert.equal(s.constraint.allowed.length, 3);
  assert.doesNotThrow(() => validatePlacement(s, { heart: 12, shield: 4 }));
  assert.throws(() => validatePlacement(s, { heart: 4, shield: 12 }), /constraint/);
});

test('personalities use correct role history and their intended bias', async () => {
  const view = { player: 1, boxesAlive: [...BOX_VALUES], constraint: null,
    history: [{ attacker: 1, picked: 6, heart: 10, shield: 4 }, { attacker: 0, picked: 8, heart: 4, shield: 6 }] };
  const greedy = new PersonalityController('greedy', () => 0);
  const repeat = new PersonalityController('repeater', () => 0);
  const chase = new PersonalityController('chaser', () => 0);
  assert.equal(await greedy.chooseAttack(view), 12);
  assert.equal((await greedy.choosePlacement(view)).shield, 12);
  assert.equal(await repeat.chooseAttack(view), 6);
  assert.deepEqual(await repeat.choosePlacement(view), { heart: 4, shield: 6 });
  assert.equal(await chase.chooseAttack(view), 10);
  assert.equal((await chase.choosePlacement(view)).shield, 8);
  const counts = {};
  const cpu = new PersonalityController('greedy', seeded(456));
  for (let i = 0; i < 10000; i++) { const picked = await cpu.chooseAttack(view); counts[picked] = (counts[picked] || 0) + 1; }
  // 80% bias plus 20% uniform fallback gives the favorite about 84% overall.
  assert.ok(counts[12] > 8200 && counts[12] < 8600);
});

test('all NPCs obey every constraint and complete matches with fixed personalities (90 matches)', async () => {
  for (const type of ['greedy', 'repeater', 'chaser']) {
    const cpu = new PersonalityController(type, seeded(9));
    for (const target of ['shield']) for (const excluded of BOX_VALUES) {
      const view = { player: 1, boxesAlive: [...BOX_VALUES], history: [], constraint: { target, allowed: BOX_VALUES.filter(b => b !== excluded).slice(0, 3) } };
      for (let i = 0; i < 20; i++) validatePlacement(view, await cpu.choosePlacement(view));
    }
    for (const other of ['greedy', 'repeater', 'chaser']) for (let seed = 1; seed <= 10; seed++) {
      let steps = 0;
      const ui = { status() {}, conceal() {}, async ready() {}, async handoff() {}, async reveal() { assert.ok(++steps < 1000); } };
      const state = await playMatch({ players: [new PersonalityController(type, seeded(seed)), new PersonalityController(other, seeded(seed+99))], ui, random: seeded(seed+1), local: seed % 2 === 0 });
      assert.equal(state.phase, Phase.RESULT); assert.equal(state.sets[state.result.winner], 2);
      assert.ok(state.set >= 2 && state.set <= 3);
      assert.ok(state.history.every(r => !r.constraint || r.constraint.allowed.includes(r[r.constraint.target])));
    }
  }
});
