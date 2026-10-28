import { Content } from '../core/constants.js';
import { drawBoxes, nameOf } from './game.js';
const dialog = document.getElementById('history-dialog');
dialog.addEventListener('close', () => document.body.classList.remove('history-open'));
document.getElementById('history-close').onclick = () => dialog.close();
export function openHistory(history, result = false) {
  document.getElementById('history-close').textContent = result ? '← 結果に戻る' : '← 試合に戻る';
  const list = document.getElementById('history-list'); list.replaceChildren();
  if (!history.length) { const p = document.createElement('p'); p.className = 'empty-history'; p.textContent = '公開済みの履歴はありません'; list.append(p); }
  for (const record of [...history].reverse()) {
    const entry = document.createElement('article'); entry.className = 'history-entry';
    const title = document.createElement('h3'); title.textContent = `${record.turn}ターン目 · ${record.step + 1}回目　攻:${nameOf(record.attacker)} 守:${nameOf(1 - record.attacker)}`;
    const board = document.createElement('div'); board.className = 'board';
    drawBoxes(board, record.boxesAlive, { contents: { [record.heart]: Content.HEART, [record.shield]: Content.SHIELD }, picked: record.picked });
    const scores = document.createElement('div'); scores.className = 'history-scores';
    record.scoresAfter.forEach((score, i) => {
      const span = document.createElement('span'); span.textContent = `${nameOf(i)}: ${score}`;
      if (record.gainTo === i || record.gain === 0) { const gain = document.createElement('span'); gain.className = record.gain ? 'gain' : 'zero'; gain.textContent = ` (+${record.gain})`; span.append(gain); }
      scores.append(span);
    }); entry.append(title, board, scores); list.append(entry);
  }
  document.body.classList.add('history-open');
  dialog.showModal();
}
