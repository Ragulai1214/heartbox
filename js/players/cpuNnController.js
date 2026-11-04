import { PlayerController } from './playerController.js';
import { encodeFeatures } from '../core/features.js';
import { decodeAction, legalActionMask } from '../core/actionSpace.js';
import { infer, sampleAction, validateModel } from './nnInference.js';

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export class CpuNnController extends PlayerController {
  constructor(model, random = Math.random) {
    super();
    this.model = freeze(structuredClone(validateModel(model)));
    this.random = random;
  }
  choose(view) {
    const { probabilities } = infer(this.model, encodeFeatures(view), legalActionMask(view));
    return decodeAction(sampleAction(probabilities, this.random), view);
  }
  async chooseAttack(view) { return this.choose(view).picked; }
  async choosePlacement(view) { return this.choose(view); }
}
