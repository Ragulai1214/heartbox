import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpu } from '../js/players/cpuControllers.js';
import { CpuFrequencyController, estimateProbabilities } from '../js/players/cpuFrequencyController.js';
import { playGame } from '../js/flow/gameFlow.js';

const types = ['frequency', 'random', 'high-value', 'recent'];
const boxes = [4, 6, 8, 10, 12];
const view = (history = [], boxesAlive = boxes, player = 0) => ({ boxesAlive, history, player });
const record = (attacker, heart, shield, picked, boxesAlive = boxes) => ({ attacker, heart, shield, picked, boxesAlive });
function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('all CPUs produce legal actions on every playable subset without mutating views', async () => {
  for (let mask = 0; mask < 32; mask++) {
    const alive = boxes.filter((_, index) => mask & (1 << index));
    if (alive.length < 3) continue;
    for (const type of types) {
      const cpu = createCpu(type, seeded(mask + 1));
      const input = view([record(0, 12, 8, 6), record(1, 6, 10, 12)], alive);
      const before = structuredClone(input);
      for (let i = 0; i < 30; i++) {
        const { heart, shield } = await cpu.choosePlacement(input);
        assert.ok(alive.includes(heart) && alive.includes(shield));
        assert.notEqual(heart, shield);
        const attack = await cpu.chooseAttack(input);
        assert.ok(alive.includes(attack));
        if (type === 'high-value') {
          assert.ok(shield > heart);
          assert.ok(attack >= 8);
          if (alive.filter(value => value >= 8).length >= 2) assert.ok(heart >= 8);
        }
      }
      assert.deepEqual(input, before);
    }
  }
});

test('frequency uses opponent placements for attack and opponent attacks for defense, for either player', async () => {
  for (const player of [0, 1]) {
    const cpu = new CpuFrequencyController({ random: () => 0.5, exploration: 0 });
    const history = Array.from({ length: 20 }, () => [record(player, 10, 12, 4), record(1 - player, 4, 10, 8)]).flat();
    assert.equal(await cpu.chooseAttack(view(history, boxes, player)), 10);
    assert.deepEqual(await cpu.choosePlacement(view(history, boxes, player)), { heart: 12, shield: 8 });
  }
});

test('recent policy applies its five-record window after filtering each role', async () => {
  const old = Array.from({ length: 50 }, () => [record(0, 12, 6, 4), record(1, 4, 6, 8)]).flat();
  const recent = Array.from({ length: 5 }, () => [record(0, 10, 6, 4), record(1, 4, 6, 12)]).flat();
  const input = view([...old, ...recent]);
  const all = new CpuFrequencyController({ exploration: 0, random: () => 0.5 });
  const last = new CpuFrequencyController({ windowSize: 5, exploration: 0, random: () => 0.5 });
  assert.equal(last.records(input, true).length, 5);
  assert.equal(last.records(input, false).length, 5);
  assert.equal(await all.chooseAttack(input), 12);
  assert.equal(await last.chooseAttack(input), 10);
  assert.equal((await all.choosePlacement(input)).shield, 8);
  assert.equal((await last.choosePlacement(input)).shield, 12);
  assert.equal(createCpu('recent').windowSize, 5);
});

test('probabilities correct for availability, smooth unseen boxes, and normalize', () => {
  const history = [record(1, 4, 6, 12), ...Array.from({ length: 9 }, () => record(1, 4, 6, 8, [4, 6, 8]))];
  const probs = estimateProbabilities(boxes, history, 'picked');
  assert.ok(Math.abs(probs.get(12) / probs.get(8) - (0.6 / (9.2 / 11))) < 1e-10);
  assert.ok([...probs.values()].every(value => value > 0));
  assert.ok(Math.abs([...probs.values()].reduce((sum, n) => sum + n, 0) - 1) < 1e-10);
  assert.deepEqual([...estimateProbabilities(boxes, [], 'heart').values()], boxes.map(() => 0.2));
});

test('attack accounts for shield losses using the shield-associated heart value', async () => {
  const cpu = new CpuFrequencyController({ exploration: 0, random: () => 0 });
  const input = view([record(0, 10, 12, 4), record(0, 12, 10, 4)]);
  // Equal heart/shield frequencies: 12 gains 12 and loses 10; 10 gains 10 and loses 12.
  assert.equal(await cpu.chooseAttack(input), 12);
});

test('exploration and equal-value ties sample legal actions instead of always choosing the first', async () => {
  const low = new CpuFrequencyController({ exploration: 1, random: () => 0 });
  const high = new CpuFrequencyController({ exploration: 1, random: () => 0.999 });
  assert.equal(await low.chooseAttack(view()), 4);
  assert.equal(await high.chooseAttack(view()), 12);
  const tieLow = new CpuFrequencyController({ exploration: 0, random: () => 0 });
  const tieHigh = new CpuFrequencyController({ exploration: 0, random: () => 0.999 });
  assert.notDeepEqual(await tieLow.choosePlacement(view()), await tieHigh.choosePlacement(view()));
});

test('high-value policy has legal fallback when fewer than two high boxes remain', async () => {
  const cpu = createCpu('high-value', () => 0.5);
  assert.equal((await cpu.choosePlacement(view([], [4, 6, 8]))).shield, 8);
  assert.deepEqual(await cpu.choosePlacement(view([], [4, 6])), { heart: 4, shield: 6 });
  assert.ok([4, 6].includes(await cpu.chooseAttack(view([], [4, 6]))));
});

test('all 16 CPU matchups finish legally and seeded matches are reproducible (320 games)', async () => {
  const ui = { status() {}, conceal() {}, async reveal() {} };
  for (const left of types) for (const right of types) {
    for (let seed = 1; seed <= 10; seed++) {
      const run = () => playGame({ players: [createCpu(left, seeded(seed)), createCpu(right, seeded(seed + 100))], ui, random: seeded(seed + 200) });
      const first = await run();
      assert.deepEqual(await run(), first);
      assert.equal(first.phase, 'result');
      assert.ok(first.history.length <= 30 && first.history.length > 0);
      assert.ok(first.scores.every(score => score >= 0));
    }
  }
});

test('invalid policy configuration fails explicitly', () => {
  assert.throws(() => createCpu('nn'), RangeError);
  assert.throws(() => new CpuFrequencyController({ windowSize: 0 }), RangeError);
  assert.throws(() => new CpuFrequencyController({ exploration: 2 }), RangeError);
});
