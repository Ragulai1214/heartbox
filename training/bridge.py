import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Environment:
    def __enter__(self):
        self.process = subprocess.Popen(['node', str(ROOT / 'training/environment.mjs')], cwd=ROOT,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        text=True, encoding='utf-8', bufsize=1)
        return self

    def call(self, command, **kwargs):
        self.process.stdin.write(json.dumps({'command': command, **kwargs}, allow_nan=False) + '\n')
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError('Node environment stopped before a response')
        result = json.loads(line)
        if 'error' in result:
            raise RuntimeError(result['error'])
        return result

    def __exit__(self, *args):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdout.close()
