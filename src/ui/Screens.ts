import { CONFIG } from '../config';
import type { Score } from '../systems/Score';
import { element } from './HUD';
import { readStorage, writeStorage } from '../core/AudioManager';
export type State = 'BOOT' | 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'CRASHING' | 'GAME_OVER';
export class Screens {
  best = Math.max(0, Number(readStorage(CONFIG.storage.best)) || 0);
  private readonly panels = [element('menu'), element('countdown'), element('paused'), element('game-over')];
  private readonly count = element('count-number'); private readonly final = element('final-score');
  private readonly abort = new AbortController(); private finalValue = 0; private animationTime = 0;
  constructor(actions: { start(): void; resume(): void; restart(): void; home(): void; pause(): void; mute(): void }) {
    const bindings: Record<string, () => void> = { start: actions.start, restart: actions.restart, 'pause-restart': actions.restart, resume: actions.resume, home: actions.home, pause: actions.pause, mute: actions.mute };
    for (const [id, action] of Object.entries(bindings)) element(id).addEventListener('click', () => { action(); element(id).blur(); }, { signal: this.abort.signal });
    this.updateBest();
  }
  show(state: State): void {
    for (const panel of this.panels) panel.classList.add('hidden');
    const index = state === 'MENU' ? 0 : state === 'COUNTDOWN' ? 1 : state === 'PAUSED' ? 2 : state === 'GAME_OVER' ? 3 : -1;
    if (index >= 0) this.panels[index].classList.remove('hidden');
    document.body.classList.toggle('playing', state !== 'MENU');
    element('pause').classList.toggle('hidden', state !== 'PLAYING' && state !== 'COUNTDOWN');
  }
  countdown(text: string): void { if (this.count.textContent !== text) this.count.textContent = text; }
  go(visible: boolean): void { this.panels[1].classList.toggle('hidden', !visible); if (visible) this.countdown('GO!'); }
  results(score: Score): void {
    this.finalValue = Math.floor(score.points); this.animationTime = 0; this.final.textContent = '0';
    const isBest = this.finalValue > this.best;
    if (isBest) { this.best = this.finalValue; writeStorage(CONFIG.storage.best, String(this.best)); }
    element('result-eyebrow').textContent = isBest ? 'NEW BEST! A ROAD TO REMEMBER.' : 'A GOOD RUN, A GREAT VIEW';
    element('result-eyebrow').classList.toggle('new-best', isBest);
    element('final-distance').textContent = `${Math.floor(score.distance).toLocaleString()} m`;
    element('final-coins').textContent = String(score.coins); element('final-best').textContent = this.best.toLocaleString(); this.updateBest();
  }
  animate(dt: number): void { this.animationTime = Math.min(CONFIG.timing.resultCountDuration, this.animationTime + dt); const p = this.animationTime / CONFIG.timing.resultCountDuration; this.final.textContent = Math.floor(this.finalValue * (1 - (1 - p) ** 3)).toLocaleString(); }
  muted(value: boolean): void { const button = element('mute'); button.classList.toggle('muted', value); button.setAttribute('aria-label', value ? 'Unmute sound' : 'Mute sound'); button.setAttribute('aria-pressed', String(value)); }
  private updateBest(): void { element('menu-best').innerHTML = `${this.best.toLocaleString()} <small>PTS</small>`; }
  dispose(): void { this.abort.abort(); }
}
