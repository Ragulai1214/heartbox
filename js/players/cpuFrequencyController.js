import { PlayerController } from './playerController.js';
import { best, pick, placements } from './cpuPolicy.js';

// One uniform pseudo-observation per box; normalize after correcting for exposure.
export function estimateProbabilities(boxes, records, field) {
  const rates = boxes.map(box => {
    const available = records.filter(record => record.boxesAlive.includes(box));
    const count = available.filter(record => record[field] === box).length;
    return (count + 1 / boxes.length) / (available.length + 1);
  });
  const total = rates.reduce((sum, rate) => sum + rate, 0);
  return new Map(boxes.map((box, index) => [box, rates[index] / total]));
}

export class CpuFrequencyController extends PlayerController {
  constructor({ random = Math.random, windowSize = Infinity, exploration = 0.1 } = {}) {
    super();
    if (!(windowSize === Infinity || Number.isInteger(windowSize) && windowSize > 0)) throw new RangeError('Invalid history window');
    if (!Number.isFinite(exploration) || exploration < 0 || exploration > 1) throw new RangeError('Invalid exploration rate');
    this.random = random;
    this.windowSize = windowSize;
    this.exploration = exploration;
  }

  records(view, opponentDefended) {
    const relevant = view.history.filter(record => (record.attacker === view.player) === opponentDefended);
    return this.windowSize === Infinity ? relevant : relevant.slice(-this.windowSize);
  }

  async chooseAttack(view) {
    const boxes = view.boxesAlive;
    if (this.random() < this.exploration) return pick(boxes, this.random);
    const records = this.records(view, true);
    const hearts = estimateProbabilities(boxes, records, 'heart');
    const shields = estimateProbabilities(boxes, records, 'shield');
    return best(boxes, box => {
      const observed = records.filter(record => record.shield === box);
      const others = boxes.filter(value => value !== box);
      const loss = observed.length
        ? observed.reduce((sum, record) => sum + record.heart, 0) / observed.length
        : others.reduce((sum, value) => sum + value, 0) / others.length;
      return hearts.get(box) * box - shields.get(box) * loss;
    }, this.random);
  }

  async choosePlacement(view) {
    const legal = placements(view.boxesAlive);
    if (this.random() < this.exploration) return pick(legal, this.random);
    const attacks = estimateProbabilities(view.boxesAlive, this.records(view, false), 'picked');
    return best(legal, ({ heart, shield }) => heart * (attacks.get(shield) - attacks.get(heart)), this.random);
  }
}
