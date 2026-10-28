const dialog = document.getElementById('handoff-dialog');
dialog.addEventListener('cancel', event => event.preventDefault());
export function handoff(player, ready) {
  const name = player === 0 ? 'A' : 'B';
  document.getElementById('handoff-title').textContent = ready ? `${name}さんの配置です` : '配置が完了しました';
  document.getElementById('handoff-text').textContent = ready ? `${player === 0 ? 'B' : 'A'}さんは画面を見ないでください。` : `${name}さんに端末を渡してください。`;
  const button = document.getElementById('handoff-ok');
  button.textContent = ready ? '準備OK' : `${name}さんです`;
  return new Promise(resolve => {
    button.onclick = () => { button.onclick = null; dialog.close(); resolve(); };
    dialog.showModal();
  });
}
