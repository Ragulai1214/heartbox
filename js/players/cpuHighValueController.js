import { PlayerController } from './playerController.js';
import { pick, placements } from './cpuPolicy.js';

export class CpuHighValueController extends PlayerController {
  constructor(random = Math.random) { super(); this.random = random; }

  async chooseAttack(view) {
    const high = view.boxesAlive.filter(value => value >= 8);
    return pick(high.length ? high : view.boxesAlive, this.random);
  }

  async choosePlacement(view) {
    const high = view.boxesAlive.filter(value => value >= 8);
    const legal = placements(view.boxesAlive).filter(({ heart, shield }) => shield > heart);
    const preferred = high.length >= 2
      ? legal.filter(({ heart }) => heart >= 8)
      : high.length === 1 ? legal.filter(({ shield }) => shield === high[0]) : legal;
    return pick(preferred, this.random);
  }
}
