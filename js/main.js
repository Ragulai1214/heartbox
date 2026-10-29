import { bindHome, showScreen } from './ui/home.js';
import { GameUI } from './ui/game.js';
import { openHistory } from './ui/history.js';
import { showResult } from './ui/result.js';
import { HumanController } from './players/humanController.js';
import { createCpu } from './players/cpuControllers.js';
import { playGame } from './flow/gameFlow.js';
let mode = 'cpu', cpuType = 'random', activeUI = null, finished = null, running = false;
async function start(nextMode, nextCpuType = cpuType) {
  if (running) return;
  running = true; mode = nextMode; cpuType = nextCpuType; finished = null;
  showScreen('game'); activeUI = new GameUI(mode);
  const players = [new HumanController(activeUI), mode === 'local' ? new HumanController(activeUI) : createCpu(cpuType)];
  try {
    finished = await playGame({ players, ui: activeUI, local: mode === 'local' });
    showResult(finished, mode);
  } catch (error) {
    console.error(error); showScreen('home');
    alert('試合を続けられませんでした。ホームからやり直してください。');
  } finally { running = false; }
}
bindHome(start);
document.getElementById('history-open').onclick = () => openHistory(activeUI?.state?.history ?? []);
document.getElementById('result-history').onclick = () => openHistory(finished?.history ?? [], true);
document.getElementById('again').onclick = () => start(mode);
document.getElementById('to-home').onclick = () => { finished = null; activeUI = null; showScreen('home'); };
