import { Content, MAX_TURNS } from '../core/constants.js';
import { attackerOf } from '../core/gameState.js';
import { emptyPlacement, placeFromButton, swapBoxes, canConfirm, placementChoice } from '../core/placement.js';
import { handoff } from './handoff.js';
export const nameOf = player => player === 0 ? 'A' : 'B';
const el = id => document.getElementById(id);
function contentIcon(kind) {
  const name = kind === Content.HEART ? 'heart' : 'shield';
  const icon = document.createElement('img');
  icon.src = new URL(`../../assets/${name}.svg`, import.meta.url).href;
  icon.className = `content-icon ${name}-icon`; icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
  return icon;
}
export function drawScores(container, scores, cpu = false) {
  container.replaceChildren();
  scores.forEach((score, i) => {
    const card = document.createElement('div'); card.className = 'score';
    const label = document.createElement('span'); label.textContent = `${nameOf(i)}${cpu ? i === 0 ? ' · あなた' : ' · CPU' : ''}`;
    const number = document.createElement('strong'); number.textContent = score;
    card.append(label, number); container.append(card);
  });
}
export function drawBoxes(container, values, { contents = {}, selected = null, picked = null, broken = null, onSelect = null } = {}) {
  container.replaceChildren();
  for (const value of values) {
    const box = document.createElement(onSelect ? 'button' : 'div');
    box.className = `box${value === selected || value === picked ? ' selected' : ''}${value === broken ? ' broken' : ''}`;
    const valueEl = document.createElement('span'); valueEl.className = 'value'; valueEl.textContent = value;
    const symbolEl = document.createElement('span'); symbolEl.className = 'symbol';
    if ([Content.HEART, Content.SHIELD].includes(contents[value])) symbolEl.append(contentIcon(contents[value]));
    const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = value === picked ? '▲ 攻撃' : value === selected ? '選択中' : '';
    box.append(valueEl, symbolEl, marker);
    box.setAttribute('aria-label', `${value}点${contents[value] === Content.HEART ? ' ハート' : contents[value] === Content.SHIELD ? ' シールド' : ''}${value === broken ? ' 破壊' : ''}`);
    if (onSelect) { box.setAttribute('aria-pressed', String(value === selected)); box.onclick = () => onSelect(value); }
    container.append(box);
  }
}
export class GameUI {
  constructor(mode) { this.mode = mode; this.state = null; }
  status(state) {
    this.state = state;
    el('turn').textContent = `${state.turn} / ${MAX_TURNS} ターン目 · ${state.step + 1}回目`;
    const attacker = attackerOf(state);
    el('roles').textContent = `攻：${nameOf(attacker)}　守：${nameOf(1 - attacker)}`;
    drawScores(el('scores'), state.scores, this.mode === 'cpu');
  }
  conceal(state) {
    drawBoxes(el('board'), state.boxesAlive);
    el('actions').replaceChildren(); el('message').textContent = ''; el('phase-label').textContent = '';
  }
  ready(player) { this.conceal(this.state); return handoff(player, true); }
  handoff(player) { return handoff(player, false); }
  action(text, callback, { disabled = false, primary = false, active = false } = {}) {
    const button = document.createElement('button'); button.textContent = text; button.disabled = disabled;
    button.className = `${primary ? 'primary' : ''}${active ? ' active' : ''}`;
    button.onclick = callback; el('actions').append(button); return button;
  }
  choosePlacement(view) {
    const boxes = emptyPlacement(view.boxesAlive);
    let content = null, from = null, settled = false;
    el('phase-label').textContent = 'DEFEND / 配置';
    return new Promise(resolve => {
      const render = () => {
        el('message').textContent = from !== null ? '移動先を選んでください。中身があれば交換します。' : `${nameOf(view.player)}さん、ハートとシールドを配置してください`;
        drawBoxes(el('board'), view.boxesAlive, { contents: boxes, selected: from, onSelect: value => {
          if (settled) return;
          if (content !== null) { if (placeFromButton(boxes, content, value)) content = null; }
          else if (from !== null) { swapBoxes(boxes, from, value); from = null; }
          else if (boxes[value] !== Content.NONE) from = value;
          render();
        } });
        el('actions').replaceChildren();
        for (const [kind, label] of [[Content.HEART, 'ハート'], [Content.SHIELD, 'シールド']]) {
          const button = this.action(label, () => { content = kind; from = null; render(); }, { disabled: Object.values(boxes).includes(kind), active: content === kind });
          button.classList.add('content-action'); button.prepend(contentIcon(kind));
        }
        this.action('確定', () => {
          if (settled || !canConfirm(boxes)) return;
          settled = true; const choice = placementChoice(boxes); this.conceal(this.state); resolve(choice);
        }, { disabled: !canConfirm(boxes), primary: true });
      };
      render();
    });
  }
  chooseAttack(view) {
    let selected = null, settled = false;
    el('phase-label').textContent = 'ATTACK / 攻撃';
    el('message').textContent = `${nameOf(view.player)}さん、攻撃する箱を選んでください`;
    return new Promise(resolve => {
      const render = () => {
        drawBoxes(el('board'), view.boxesAlive, { selected, onSelect: value => { if (!settled) { selected = value; render(); } } });
        el('actions').replaceChildren();
        this.action('攻撃', () => {
          if (settled || selected === null) return;
          settled = true; this.conceal(this.state); resolve(selected);
        }, { disabled: selected === null, primary: true });
      }; render();
    });
  }
  reveal(record) {
    el('phase-label').textContent = 'REVEAL / 公開';
    drawBoxes(el('board'), record.boxesAlive, { contents: { [record.heart]: Content.HEART, [record.shield]: Content.SHIELD }, picked: record.picked, broken: record.kind === 'shield' ? null : record.picked });
    el('message').textContent = record.kind === 'empty' ? '空箱　得点なし' : `${record.kind === 'heart' ? 'ハート命中' : 'シールド発動'}　${nameOf(record.gainTo)} +${record.gain}`;
    el('actions').replaceChildren();
    return new Promise(resolve => {
      const button = this.action('次へ', () => { button.disabled = true; button.onclick = null; resolve(); }, { primary: true });
    });
  }
}
