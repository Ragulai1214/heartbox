"""Evaluation uses separate seeds and never changes model or training RNG state."""
import argparse
import json
import math
from pathlib import Path
import torch
from bridge import Environment
from model import Policy

OPPONENTS = ['frequency', 'random', 'high-value', 'recent']


def wilson(wins, count):
    z = 1.959963984540054
    p = wins / count
    center = (p + z*z/(2*count)) / (1 + z*z/count)
    radius = z * math.sqrt(p*(1-p)/count + z*z/(4*count*count)) / (1 + z*z/count)
    return [center - radius, center + radius]


def evaluate(model, games_per_opponent, seed=900000, past=None):
    if games_per_opponent <= 0 or games_per_opponent % 4:
        raise ValueError('Evaluation count must be a positive multiple of four')
    rng = torch.get_rng_state()
    was_training = model.training
    model.eval()
    report = {}
    try:
        with Environment() as environment, torch.no_grad():
            for kind_index, kind in enumerate(OPPONENTS + (['past'] if past else [])):
                counts = {'wins': 0, 'losses': 0, 'draws': 0, 'scoreDifference': 0, 'turns': 0}
                for game in range(games_per_opponent):
                    game_seed = seed + kind_index * 100000 + game
                    torch.manual_seed(game_seed)
                    learner, first = game % 2, (game // 2) % 2
                    observation = environment.call('reset', learner=learner, firstAttacker=first,
                                                   opponent=kind, model=past, seed=game_seed, gameId=game)
                    while True:
                        distribution, _, _ = model(torch.tensor(observation['features']), torch.tensor(observation['mask']))
                        transition = environment.call('step', action=distribution.sample().item())
                        if transition['done']:
                            break
                        observation = transition['observation']
                    winner = transition['result']['winner']
                    counts['draws' if winner is None else 'wins' if winner == learner else 'losses'] += 1
                    counts['scoreDifference'] += transition['scores'][learner] - transition['scores'][1-learner]
                    counts['turns'] += transition['turn']
                report[kind] = {**counts, 'games': games_per_opponent, 'winRate': counts['wins']/games_per_opponent,
                                'scoreRate': (counts['wins'] + counts['draws']/2)/games_per_opponent,
                                'winRate95CI': wilson(counts['wins'], games_per_opponent),
                                'meanScoreDifference': counts['scoreDifference']/games_per_opponent,
                                'meanTurns': counts['turns']/games_per_opponent}
    finally:
        torch.set_rng_state(rng)
        model.train(was_training)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('model', type=Path)
    parser.add_argument('--past', type=Path)
    parser.add_argument('--games-per-opponent', type=int, default=500)
    parser.add_argument('--seed', type=int, default=900000)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(1)
    policy = Policy.from_export(json.loads(args.model.read_text(encoding='utf-8')))
    past = json.loads(args.past.read_text(encoding='utf-8')) if args.past else None
    args.output.write_text(json.dumps(evaluate(policy, args.games_per_opponent, args.seed, past), indent=2), encoding='utf-8')
