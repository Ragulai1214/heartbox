import { MAX_TURNS, TARGET_SCORE } from '../core/constants.js';
export function showScreen(name) {
  for (const id of ['home', 'game', 'result']) document.getElementById(id).hidden = id !== name;
}
export function bindHome(start) {
  document.getElementById('match-limit').textContent = `${TARGET_SCORE}点先取 / 最大${MAX_TURNS}ターン`;
  document.getElementById('cpu-start').onclick = () => start('cpu', document.getElementById('cpu-type').value);
  document.getElementById('local-start').onclick = () => start('local');
}
