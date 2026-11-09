export function showScreen(name) {
  for (const id of ['home', 'game', 'result']) document.getElementById(id).hidden = id !== name;
}
export function bindHome(start) {
  document.getElementById('match-limit').textContent = 'Ver.2 · 20点先取 / 2セット先取 · 各セットAが先攻';
  document.getElementById('cpu-start').onclick = () => start('cpu', document.getElementById('cpu-type').value);
  document.getElementById('local-start').onclick = () => start('local');
}
