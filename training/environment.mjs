import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createGameState, attackerOf } from '../js/core/gameState.js';
import { createGameView } from '../js/core/gameView.js';
import { resolveAttack, advance } from '../js/core/rules.js';
import { Phase } from '../js/core/constants.js';
import { encodeFeatures, FEATURE_VERSION, FEATURE_SIZE } from '../js/core/features.js';
import { legalActionMask, decodeAction } from '../js/core/actionSpace.js';
import { createCpu } from '../js/players/cpuControllers.js';
import { CpuNnController } from '../js/players/cpuNnController.js';
import { infer, validateModel } from '../js/players/nnInference.js';

export function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function rewardFor(record, result, learner) {
  const magnitude = (record.kind === 'shield' ? record.shield : record.heart) / REWARD_SPEC.scoreDivisor;
  const attackReward = record.kind === 'heart' ? magnitude : record.kind === 'shield' ? -magnitude : 0;
  const actionReward = record.attacker === learner ? attackReward : -attackReward;
  const terminalReward = !result || result.winner === null ? 0 : result.winner === learner ? REWARD_SPEC.terminal : -REWARD_SPEC.terminal;
  return actionReward + terminalReward;
}

export const REWARD_SPEC = Object.freeze(JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')).reward);

export class TrainingEnvironment {
  reset({ learner = 0, firstAttacker = 0, opponent = 'random', model, seed = 1, gameId = 0 }) {
    if (![0, 1].includes(learner)) throw new Error('Invalid learner');
    this.learner = learner; this.gameId = gameId;
    const random = seeded(seed);
    this.opponent = opponent === 'past' ? new CpuNnController(model, random) : createCpu(opponent, random);
    this.state = createGameState(firstAttacker);
    return this.observation();
  }
  observation() {
    const view = createGameView(this.state, this.learner);
    return { gameId: this.gameId, features: encodeFeatures(view), mask: legalActionMask(view), view };
  }
  async step(actionIndex) {
    if (!this.state || this.state.result) throw new Error('No active match');
    const state = this.state, attacker = attackerOf(state);
    const action = decodeAction(actionIndex, createGameView(state, this.learner));
    const opponentView = createGameView(state, 1 - this.learner);
    const placement = attacker === this.learner ? await this.opponent.choosePlacement(opponentView) : action;
    const picked = attacker === this.learner ? action.picked : await this.opponent.chooseAttack(opponentView);
    state.phase = Phase.ATTACK;
    const record = resolveAttack(state, placement, picked);
    const reward = rewardFor(record, state.result, this.learner);
    advance(state);
    const done = Boolean(state.result);
    return { reward, done, record, result: state.result, scores: state.scores, turn: state.turn,
      observation: done ? null : this.observation() };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const environment = new TrainingEnvironment();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
      const request = JSON.parse(line);
      let response;
      if (request.command === 'reset') response = environment.reset(request);
      else if (request.command === 'step') response = await environment.step(request.action);
      else if (request.command === 'infer') response = infer(validateModel(request.model), request.features, request.mask);
      else if (request.command === 'features') response = { features: encodeFeatures(request.view), mask: legalActionMask(request.view) };
      else if (request.command === 'info') response = { featureVersion: FEATURE_VERSION, featureSize: FEATURE_SIZE };
      else throw new Error('Unknown command');
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ error: error.message }) + '\n'); }
  }
}
