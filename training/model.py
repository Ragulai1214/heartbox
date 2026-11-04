"""Training-only dependencies. Exported models use plain JavaScript at runtime."""
import json
from pathlib import Path
import torch
from torch import nn
from torch.distributions import Categorical

FEATURE_VERSION = 'heartbox-v1'
FEATURE_SIZE = 203
RULES = {'boxes': [4, 6, 8, 10, 12], 'maxTurns': 15, 'targetScore': 45, 'shieldScoring': 'shield-box'}


class Policy(nn.Module):
    def __init__(self):
        super().__init__()
        self.hidden1 = nn.Linear(FEATURE_SIZE, 64)
        self.hidden2 = nn.Linear(64, 64)
        self.policy = nn.Linear(64, 25)
        self.value = nn.Linear(64, 1)
        for layer in [self.hidden1, self.hidden2]:
            nn.init.orthogonal_(layer.weight, gain=2 ** 0.5)
            nn.init.zeros_(layer.bias)
        nn.init.orthogonal_(self.policy.weight, gain=0.01)
        nn.init.zeros_(self.policy.bias)
        nn.init.orthogonal_(self.value.weight, gain=1)
        nn.init.zeros_(self.value.bias)

    def forward(self, features, mask):
        if not mask.any(dim=-1).all():
            raise ValueError('No legal action')
        hidden = torch.tanh(self.hidden2(torch.tanh(self.hidden1(features))))
        logits = self.policy(hidden)
        distribution = Categorical(logits=logits.masked_fill(~mask, -torch.inf))
        return distribution, self.value(hidden).squeeze(-1), logits

    def export(self):
        result = {'featureVersion': FEATURE_VERSION, 'actionVersion': 'heartbox-actions-v1', 'rules': RULES}
        for name in ['hidden1', 'hidden2', 'policy', 'value']:
            layer = getattr(self, name)
            result[name] = {'weight': layer.weight.detach().tolist(), 'bias': layer.bias.detach().tolist()}
        return result

    def write(self, path):
        Path(path).write_text(json.dumps(self.export(), allow_nan=False), encoding='utf-8')

    @classmethod
    def from_export(cls, data):
        if data.get('featureVersion') != FEATURE_VERSION or data.get('actionVersion') != 'heartbox-actions-v1' or data.get('rules') != RULES:
            raise ValueError('Incompatible model')
        model = cls()
        state = {f'{name}.{parameter}': torch.tensor(data[name][parameter], dtype=torch.float32)
                 for name in ['hidden1', 'hidden2', 'policy', 'value'] for parameter in ['weight', 'bias']}
        if not all(torch.isfinite(value).all() for value in state.values()):
            raise ValueError('Non-finite model')
        model.load_state_dict(state)
        return model
