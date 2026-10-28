import { drawScores, nameOf } from './game.js';
import { showScreen } from './home.js';
import { MAX_TURNS } from '../core/constants.js';
export function showResult(state, mode) {
  showScreen('result');
  const { winner, reason, reachedTurn } = state.result;
  document.getElementById('winner').textContent = winner === null ? '引き分け' : `${nameOf(winner)}の勝利`;
  drawScores(document.getElementById('final-scores'), state.scores, mode === 'cpu');
  const reasons = { target: '45点先取', score: `${MAX_TURNS}ターン終了の得点比較`, earlier: `同点・先に到達したターン（A: ${reachedTurn[0]} / B: ${reachedTurn[1]}）`, draw: state.scores[0] === 0 ? `${MAX_TURNS}ターン終了・両者0点` : `同点・到達ターンも同じ（${reachedTurn[0]}ターン目）` };
  document.getElementById('reason').textContent = `決着：${reasons[reason]}`;
}
