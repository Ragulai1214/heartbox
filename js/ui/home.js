export function showScreen(name) {
  for (const id of ['home', 'game', 'result']) document.getElementById(id).hidden = id !== name;
}
export function bindHome(start) {
  document.getElementById('cpu-start').onclick = () => start('cpu');
  document.getElementById('local-start').onclick = () => start('local');
}
