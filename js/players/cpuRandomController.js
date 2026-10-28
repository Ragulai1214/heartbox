import { PlayerController } from './playerController.js';
export class CpuRandomController extends PlayerController {
  constructor(random = Math.random) { super(); this.random = random; }
  async choosePlacement(view) {
    const available = [...view.boxesAlive];
    const [heart] = available.splice(Math.floor(this.random() * available.length), 1);
    const shield = available[Math.floor(this.random() * available.length)];
    return { heart, shield };
  }
  async chooseAttack(view) { return view.boxesAlive[Math.floor(this.random() * view.boxesAlive.length)]; }
}
