import { drawScores, nameOf } from './game.js';
import { showScreen } from './home.js';
export function showResult(state, mode, personality) {
  showScreen('result');
  document.getElementById('winner').textContent = `${nameOf(state.result.winner)}のマッチ勝利`;
  drawScores(document.getElementById('final-scores'), state.sets, mode === 'cpu');
  document.getElementById('reason').textContent = `獲得セット A ${state.sets[0]} : ${state.sets[1]} B ／ ` + state.setHistory.map(s => `第${s.set}セット ${s.scores.join(' : ')}`).join(' ／ ');
  const details = document.getElementById('personality-reveal');
  details.open = false; details.hidden = mode !== 'cpu';
  document.getElementById('personality-description').textContent = personality ? `${personality.name}：${personality.explanation} 残り20%は合法手からランダム。履歴はセットをまたいで参照します。` : '';
}
