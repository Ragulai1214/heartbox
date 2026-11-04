import copy
import unittest
import torch
from bridge import Environment
from model import Policy
from train import advantages, update, schedule
from evaluate import evaluate


def reference_features(view):
    """Independent schema implementation for cross-language conformance tests."""
    boxes = [4, 6, 8, 10, 12]
    player, history = view['player'], view['history']
    reached = [0, 0]
    for record in history:
        if record['gainTo'] >= 0 and record['gain'] > 0:
            reached[record['gainTo']] = record['turn']
    output = [int(box in view['boxesAlive']) for box in boxes]
    output += [view['scores'][player]/45, view['scores'][1-player]/45, view['turn']/15,
               view['step'], int(view['role'] == 'attacker'), reached[player]/15, reached[1-player]/15]
    for window in [15, 5]:
        for field in ['heart', 'shield', 'picked']:
            records = [r for r in history if (r['attacker'] == player) == (field != 'picked')][-window:]
            exposure = [sum(box in r['boxesAlive'] for r in records) for box in boxes]
            output += [sum(r[field] == box for r in records)/count if count else 0 for box, count in zip(boxes, exposure)]
            output += [count/window for count in exposure] + [len(records)/window]
    for index in range(5):
        recent = history[-5:]
        if index >= len(recent):
            output += [0]*25
        else:
            record = recent[index]
            output += [1, int(record['attacker'] == player)] + [int(box in record['boxesAlive']) for box in boxes]
            for field in ['heart', 'shield', 'picked']:
                output += [int(record[field] == box) for box in boxes]
            output += [int(record['kind'] == kind) for kind in ['heart', 'shield', 'empty']]
    return output


class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)

    def test_feature_and_inference_parity(self):
        torch.manual_seed(75)
        model = Policy()
        with torch.no_grad():
            model.policy.weight.mul_(50)  # non-uniform logits make this check meaningful
        exported = model.export()
        max_error = 0
        with Environment() as env, torch.no_grad():
            for player in [0, 1]:
                observation = env.call('reset', learner=player, firstAttacker=0, opponent='recent', seed=75)
                while True:
                    self.assertEqual(reference_features(observation['view']), observation['features'])
                    features = torch.tensor(observation['features'])
                    mask = torch.tensor(observation['mask'])
                    distribution, value, logits = model(features, mask)
                    result = env.call('infer', model=exported, features=observation['features'], mask=observation['mask'])
                    max_error = max(max_error, (distribution.probs - torch.tensor(result['probabilities'])).abs().max().item())
                    torch.testing.assert_close(logits, torch.tensor(result['logits']), atol=1e-5, rtol=0)
                    self.assertAlmostEqual(value.item(), result['value'], places=5)
                    transition = env.call('step', action=distribution.sample().item())
                    if transition['done']:
                        break
                    observation = transition['observation']
        self.assertLess(max_error, 1e-5)
        print(f'Python/JS maximum probability error: {max_error:.3g}', flush=True)

    def test_gae_terminal_and_finite_update(self):
        config = dict(gamma=1., gaeLambda=1., epochs=2, minibatch=8, clip=.2,
                      valueCoefficient=.5, entropyCoefficient=.01, maxGradientNorm=.5)
        episode = [{'value': 0., 'reward': 1.}, {'value': 0., 'reward': 6.}]
        self.assertEqual([row['return'] for row in advantages(episode, config)], [7., 6.])
        model = Policy()
        before = copy.deepcopy(model.state_dict())
        features, mask = [0.]*203, [True]*5 + [False]*20
        with torch.no_grad():
            distribution, value, _ = model(torch.tensor(features), torch.tensor(mask))
        rows = []
        for index in range(16):
            rows.append(dict(features=features, mask=mask, action=index%5, logProbability=distribution.log_prob(torch.tensor(index%5)).item(),
                             advantage=float(index%3-1), **{'return': float(index%3-1)}))
        metrics = update(model, torch.optim.Adam(model.parameters(), lr=.0003), rows, config)
        self.assertTrue(all(torch.isfinite(torch.tensor(value)) for value in metrics.values()))
        self.assertTrue(any(not torch.equal(before[key], value) for key, value in model.state_dict().items()))

    def test_schedule_exact_budget(self):
        from collections import Counter
        config = dict(seed=1, warmupGames=1000, snapshotInterval=1000, games=10000)
        blocks = schedule(config)
        self.assertNotIn('past', blocks[0])
        self.assertEqual(Counter(sum(blocks, [])), dict(frequency=2050, random=2050, **{'high-value': 2050}, recent=2050, past=1800))

    def test_evaluation_does_not_change_weights_or_rng(self):
        model = Policy()
        before = copy.deepcopy(model.state_dict())
        rng = torch.get_rng_state().clone()
        results = evaluate(model, 4)
        self.assertEqual(sum(row['games'] for row in results.values()), 16)
        self.assertTrue(torch.equal(rng, torch.get_rng_state()))
        self.assertTrue(all(torch.equal(before[key], value) for key, value in model.state_dict().items()))


if __name__ == '__main__':
    unittest.main()
