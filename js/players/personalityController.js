import { PlayerController } from './playerController.js';
import { pick } from './cpuPolicy.js';
import { legalPlacements } from '../core/constraints.js';

export const PERSONALITIES = {
  greedy: { name: '高得点好き', explanation: '80%で最高得点箱を攻撃。防御は合法な中でシールドが最も高得点になる配置を選ぶ。' },
  repeater: { name: '繰り返し屋', explanation: '80%で自分の前回の攻撃先・配置を繰り返す。実行できなければ合法手からランダムに選ぶ。' },
  chaser: { name: '追いかけ屋', explanation: '80%で相手が前回ハートを置いた箱を攻撃。防御は相手の前回の攻撃先にシールドを置く。実行できなければランダム。' },
};
export class PersonalityController extends PlayerController {
  constructor(type, random = Math.random) {
    super(); if (!PERSONALITIES[type]) throw new Error('Unknown personality');
    this.type = type; this.random = random;
  }
  async chooseAttack(view) {
    let target;
    if (this.type === 'greedy') target = Math.max(...view.boxesAlive);
    if (this.type === 'repeater') target = view.history.findLast(r => r.attacker === view.player)?.picked;
    if (this.type === 'chaser') target = view.history.findLast(r => r.attacker === view.player)?.heart;
    return this.random() < 0.8 && view.boxesAlive.includes(target) ? target : pick(view.boxesAlive, this.random);
  }
  async choosePlacement(view) {
    const legal = legalPlacements(view);
    let preferred = [];
    if (this.type === 'greedy') preferred = legal.filter(p => p.shield === Math.max(...legal.map(p => p.shield)));
    if (this.type === 'repeater') {
      const last = view.history.findLast(r => r.attacker !== view.player);
      preferred = legal.filter(p => p.heart === last?.heart && p.shield === last?.shield);
    }
    if (this.type === 'chaser') {
      const target = view.history.findLast(r => r.attacker !== view.player)?.picked;
      preferred = legal.filter(p => p.shield === target);
    }
    return pick(this.random() < 0.8 && preferred.length ? preferred : legal, this.random);
  }
}
