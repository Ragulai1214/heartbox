import { PlayerController } from './playerController.js';
export class HumanController extends PlayerController {
  constructor(ui) { super(); this.ui = ui; }
  choosePlacement(view) { return this.ui.choosePlacement(view); }
  chooseAttack(view) { return this.ui.chooseAttack(view); }
}
