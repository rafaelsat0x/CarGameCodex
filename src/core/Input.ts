import { CONFIG } from '../config';
export interface InputActions { move(direction: number): void; start(): void; pause(): void; mute(): void; debug(key: string): void; active(): boolean; }
export class Input {
  private readonly abort = new AbortController();
  private startX = 0; private startY = 0; private pointerId = -1;
  constructor(private readonly surface: HTMLElement, private readonly actions: InputActions) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', this.key, options);
    surface.addEventListener('pointerdown', this.down, options);
    surface.addEventListener('pointerup', this.up, options);
    surface.addEventListener('pointercancel', this.cancel, options);
    window.addEventListener('blur', this.blur, options);
    document.addEventListener('visibilitychange', this.visibility, options);
  }
  private readonly key = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLButtonElement && (event.code === 'Space' || event.code === 'Enter')) return;
    if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    switch (event.code) {
      case 'KeyA': case 'ArrowLeft': this.actions.move(-1); break;
      case 'KeyD': case 'ArrowRight': this.actions.move(1); break;
      case 'Space': case 'Enter': this.actions.start(); break;
      case 'KeyP': case 'Escape': this.actions.pause(); break;
      case 'KeyM': this.actions.mute(); break;
      default: this.actions.debug(event.key);
    }
  };
  private readonly down = (event: PointerEvent): void => {
    this.startX = event.clientX; this.startY = event.clientY; this.pointerId = event.pointerId;
    if (event.isTrusted) this.surface.setPointerCapture(event.pointerId);
  };
  private readonly up = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = -1;
    if (!this.actions.active()) { this.actions.start(); return; }
    const dx = event.clientX - this.startX, dy = event.clientY - this.startY;
    if (Math.abs(dx) > CONFIG.input.swipeThreshold && Math.abs(dx) > Math.abs(dy)) this.actions.move(Math.sign(dx));
    else if (Math.abs(dx) < CONFIG.input.swipeThreshold && Math.abs(dy) < CONFIG.input.swipeThreshold) this.actions.move(event.clientX < window.innerWidth / 2 ? -1 : 1);
  };
  private readonly cancel = (): void => { this.pointerId = -1; };
  private readonly blur = (): void => { if (this.actions.active()) this.actions.pause(); };
  private readonly visibility = (): void => { if (document.hidden) this.blur(); };
  dispose(): void { this.abort.abort(); }
}
