"""PPO with complete-episode rollouts and checkpoints at opponent-block boundaries."""
import argparse
import hashlib
import json
import random
import subprocess
import time
from collections import Counter
from pathlib import Path
import torch
from bridge import Environment, ROOT
from evaluate import evaluate, OPPONENTS
from model import Policy, FEATURE_VERSION, RULES


def source_identity():
    paths = sorted([*ROOT.glob('js/**/*.js'), *ROOT.glob('training/*.py'), *ROOT.glob('training/*.mjs'), ROOT/'training/config.json'])
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes())
    return {'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'sha256': digest.hexdigest()}


def schedule(config):
    warmup, interval, total = config['warmupGames'], config['snapshotInterval'], config['games']
    if warmup % 4 or interval % 5 or total < warmup or (total-warmup) % interval:
        raise ValueError('Invalid balanced schedule')
    rng = random.Random(config['seed'] + 1)
    blocks = [OPPONENTS * (warmup // 4)] + [(OPPONENTS + ['past']) * (interval // 5) for _ in range((total-warmup)//interval)]
    for block in blocks:
        rng.shuffle(block)
    return blocks


def advantages(episode, config):
    gae, next_value = 0., 0.
    for row in reversed(episode):
        delta = row['reward'] + config['gamma'] * next_value - row['value']
        gae = delta + config['gamma'] * config['gaeLambda'] * gae
        row['advantage'], row['return'] = gae, gae + row['value']
        next_value = row['value']
    return episode


def update(model, optimizer, rows, config):
    features = torch.tensor([r['features'] for r in rows], dtype=torch.float32)
    masks = torch.tensor([r['mask'] for r in rows], dtype=torch.bool)
    actions = torch.tensor([r['action'] for r in rows])
    old_logs = torch.tensor([r['logProbability'] for r in rows])
    returns = torch.tensor([r['return'] for r in rows])
    advantage = torch.tensor([r['advantage'] for r in rows])
    advantage = (advantage - advantage.mean()) / (advantage.std(unbiased=False) + 1e-8)
    metrics = []
    for _ in range(config['epochs']):
        order = torch.randperm(len(rows))
        for indices in order.split(config['minibatch']):
            distribution, value, _ = model(features[indices], masks[indices])
            ratio = (distribution.log_prob(actions[indices]) - old_logs[indices]).exp()
            clipped = ratio.clamp(1-config['clip'], 1+config['clip'])
            policy_loss = -torch.minimum(ratio*advantage[indices], clipped*advantage[indices]).mean()
            value_loss = (value - returns[indices]).square().mean()
            entropy = distribution.entropy().mean()
            loss = policy_loss + config['valueCoefficient']*value_loss - config['entropyCoefficient']*entropy
            if not torch.isfinite(loss):
                raise FloatingPointError('Non-finite PPO loss')
            optimizer.zero_grad()
            loss.backward()
            norm = torch.nn.utils.clip_grad_norm_(model.parameters(), config['maxGradientNorm'], error_if_nonfinite=True)
            optimizer.step()
            if not all(torch.isfinite(p).all() for p in model.parameters()):
                raise FloatingPointError('Non-finite model weights')
            metrics.append({'loss': loss.item(), 'policyLoss': policy_loss.item(), 'valueLoss': value_loss.item(),
                            'entropy': entropy.item(), 'gradientNorm': norm.item()})
    return {key: sum(item[key] for item in metrics)/len(metrics) for key in metrics[0]}


def save_checkpoint(path, state):
    temporary = path.with_suffix('.tmp')
    torch.save(state, temporary)
    temporary.replace(path)


def train(args):
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    config = json.loads((ROOT/'training/config.json').read_text(encoding='utf-8'))
    if args.smoke:
        config.update(games=128, warmupGames=8, snapshotInterval=20, batchSteps=128, minibatch=64,
                      baselineEvaluationGamesPerOpponent=20, intermediateEvaluationGamesPerOpponent=20,
                      finalEvaluationGamesPerOpponent=20)
    identity = source_identity()
    blocks = schedule(config)
    boundaries, count = [], 0
    for block in blocks:
        count += len(block)
        boundaries.append(count)
    stop = args.stop_after or config['games']
    if stop not in boundaries:
        raise ValueError('--stop-after must be an opponent block boundary')
    random.seed(config['seed']); torch.manual_seed(config['seed'])
    model = Policy()
    optimizer = torch.optim.Adam(model.parameters(), lr=config['learningRate'])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = output/'checkpoint.pt'
    completed, decisions, snapshots, games, updates, evaluations = 0, 0, [], [], [], {}
    if args.resume:
        # Load only a trusted checkpoint generated locally by this command.
        saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
        if saved['config'] != config or saved['source'] != identity or saved['rules'] != RULES or saved['featureVersion'] != FEATURE_VERSION:
            raise ValueError('Resume configuration/source mismatch')
        model.load_state_dict(saved['model']); optimizer.load_state_dict(saved['optimizer'])
        completed, decisions = saved['completed'], saved['decisions']
        snapshots, games, updates, evaluations = saved['snapshots'], saved['games'], saved['updates'], saved['evaluations']
        random.setstate(saved['pythonRng']); torch.set_rng_state(saved['torchRng'])
    else:
        if any(output.iterdir()):
            raise ValueError('Use a new output directory or --resume')
        model.write(output/'initial.json')
        evaluations['initial'] = evaluate(model, config['baselineEvaluationGamesPerOpponent'])
    if stop < completed:
        raise ValueError('Cannot resume backwards')
    if stop == completed:
        print(json.dumps({'completed': completed, 'status': 'already completed'}), flush=True)
        return
    started = time.monotonic()
    with Environment() as environment:
        for block_index, block in enumerate(blocks):
            if boundaries[block_index] <= completed:
                continue
            rows = []
            for opponent in block:
                learner, first = completed % 2, (completed // 2) % 2
                seed = random.randrange(2**32)
                snapshot = random.choice(snapshots) if opponent == 'past' else None
                observation = environment.call('reset', learner=learner, firstAttacker=first, opponent=opponent,
                                               model=snapshot['model'] if snapshot else None, seed=seed, gameId=completed)
                episode, total_reward, outcomes = [], 0, Counter()
                while True:
                    with torch.no_grad():
                        distribution, value, _ = model(torch.tensor(observation['features']), torch.tensor(observation['mask']))
                        action = distribution.sample()
                        log_probability = distribution.log_prob(action).item()
                    transition = environment.call('step', action=action.item())
                    episode.append({**{key: observation[key] for key in ['features', 'mask']}, 'action': action.item(),
                                    'value': value.item(), 'logProbability': log_probability, 'reward': transition['reward']})
                    total_reward += transition['reward']
                    role = 'attack' if transition['record']['attacker'] == learner else 'defense'
                    outcomes[f'{role}:{transition["record"]["kind"]}'] += 1
                    if transition['done']:
                        break
                    observation = transition['observation']
                rows.extend(advantages(episode, config)); completed += 1; decisions += len(episode)
                games.append({'game': completed, 'opponent': opponent, 'pastModel': snapshot['id'] if snapshot else None,
                              'seed': seed, 'learner': learner, 'firstAttacker': first, 'reward': total_reward,
                              'scores': transition['scores'], 'result': transition['result'], 'turns': transition['turn'],
                              'outcomes': dict(outcomes)})
                if len(rows) >= config['batchSteps'] or completed == boundaries[block_index]:
                    updates.append({'game': completed, 'steps': len(rows), **update(model, optimizer, rows, config)})
                    rows.clear()
            snapshot = {'id': f'game-{completed}', 'model': model.export()}
            snapshots.append(snapshot)
            model.write(output/f'model-{completed}.json')
            if completed == 5000 or completed == config['games']:
                size = config['finalEvaluationGamesPerOpponent'] if completed == config['games'] else config['intermediateEvaluationGamesPerOpponent']
                evaluations[str(completed)] = evaluate(model, size, seed=1900000 if completed == config['games'] else 1400000, past=snapshots[0]['model'])
            saved = {'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'config': config, 'source': identity,
                     'rules': RULES, 'featureVersion': FEATURE_VERSION, 'completed': completed, 'decisions': decisions,
                     'snapshots': snapshots, 'games': games, 'updates': updates, 'evaluations': evaluations,
                     'pythonRng': random.getstate(), 'torchRng': torch.get_rng_state()}
            save_checkpoint(checkpoint, saved)
            report = {'smoke': args.smoke, 'completed': completed, 'decisions': decisions, 'source': identity, 'config': config,
                      'opponents': dict(Counter(game['opponent'] for game in games)), 'updates': updates, 'evaluations': evaluations}
            (output/'report.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
            (output/'games.jsonl').write_text(''.join(json.dumps(game) + '\n' for game in games), encoding='utf-8')
            print(json.dumps({'completed': completed, 'decisions': decisions, 'lastLoss': updates[-1]['loss'],
                              'secondsThisInvocation': round(time.monotonic()-started, 2)}), flush=True)
            if completed >= stop:
                break


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--smoke', action='store_true', help='128 separate test games; never reuse for the full run')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--stop-after', type=int)
    train(parser.parse_args())
