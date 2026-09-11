import { CONFIG } from '../config';
import type { Score } from '../systems/Score';
export function element<T extends HTMLElement = HTMLElement>(id: string): T { const node = document.getElementById(id); if (!node) throw new Error(`Missing UI element: ${id}`); return node as T; }
interface Popup { node: HTMLElement; time: number; }
export class HUD {
  private readonly root = element('hud'); private readonly score = element('score'); private readonly coins = element('coins');
  private readonly speed = element('speed'); private readonly distance = element('distance'); private readonly multiplier = element('multiplier');
  private readonly combo = element('combo-fill'); private readonly debug = element('debug'); private timer = 0;
  private readonly popups: Popup[] = [];
  constructor() {
    for (let i = 0; i < CONFIG.pools.popups; i++) { const node = document.createElement('div'); node.className = 'popup'; element('popups').appendChild(node); this.popups.push({ node, time: 0 }); }
  }
  show(visible: boolean): void { this.root.classList.toggle('hidden', !visible); }
  update(dt: number, score: Score, speed: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = CONFIG.timing.hudInterval;
      this.score.textContent = Math.floor(score.points).toString().padStart(6, '0'); this.coins.textContent = String(score.coins);
      this.speed.textContent = String(Math.round(speed * 3.6)); this.distance.textContent = `${Math.floor(score.distance).toLocaleString()} m travelled`;
      this.multiplier.textContent = `×${score.multiplier}`; this.combo.style.transform = `scaleX(${score.timer / CONFIG.score.comboDecay})`;
    }
    for (const popup of this.popups) if (popup.time > 0) {
      popup.time = Math.max(0, popup.time - dt); const progress = 1 - popup.time / CONFIG.timing.popupDuration;
      popup.node.style.opacity = String(Math.min(1, popup.time * 4)); popup.node.style.transform = `translate(-50%, ${-progress * 65}px)`;
    }
  }
  popup(message: string): void {
    let chosen = this.popups[0]; for (const popup of this.popups) if (popup.time < chosen.time) chosen = popup;
    chosen.node.textContent = message; chosen.time = CONFIG.timing.popupDuration; chosen.node.style.left = `${50 + this.popups.indexOf(chosen) * 2}%`;
  }
  debugText(message: string): void { this.debug.classList.remove('hidden'); this.debug.textContent = message; }
  reset(): void { this.timer = 0; for (const popup of this.popups) { popup.time = 0; popup.node.style.opacity = '0'; } }
}
