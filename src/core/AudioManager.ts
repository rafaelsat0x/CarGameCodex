import { CONFIG } from '../config';
import { Rng } from './Rng';
export function readStorage(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function writeStorage(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled; this run still works. */ } }
export class AudioManager {
  muted = readStorage(CONFIG.storage.muted) === 'true';
  private context?: AudioContext; private master?: GainNode; private engineGain?: GainNode;
  private filter?: BiquadFilterNode; private oscillators: OscillatorNode[] = []; private noise?: AudioBuffer;
  private readonly rng = new Rng(91);
  unlock(): void {
    if (!this.context) {
      try {
        const context = new AudioContext(); this.context = context;
        this.master = context.createGain(); this.master.gain.value = this.muted ? 0 : CONFIG.audio.master; this.master.connect(context.destination);
        this.engineGain = context.createGain(); this.engineGain.gain.value = 0;
        this.filter = context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.connect(this.engineGain); this.engineGain.connect(this.master);
        for (const ratio of [1, 2.01]) { const osc = context.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = CONFIG.audio.engineBaseHz * ratio; osc.connect(this.filter); osc.start(); this.oscillators.push(osc); }
        this.noise = context.createBuffer(1, context.sampleRate * CONFIG.audio.noiseSeconds, context.sampleRate);
        const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = this.rng.range(-1, 1);
      } catch { return; }
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }
  toggle(): void { this.unlock(); this.muted = !this.muted; writeStorage(CONFIG.storage.muted, String(this.muted)); this.master?.gain.setTargetAtTime(this.muted ? 0 : CONFIG.audio.master, this.context?.currentTime ?? 0, 0.02); }
  engine(speed: number, active: boolean): void {
    if (!this.context || !this.engineGain || !this.filter) return;
    const t = this.context.currentTime, normalized = speed / CONFIG.speed.max;
    this.engineGain.gain.setTargetAtTime(active ? CONFIG.audio.engineGain : 0, t, 0.08);
    this.filter.frequency.setTargetAtTime(CONFIG.audio.engineFilterBase + normalized * CONFIG.audio.engineFilterRange, t, 0.08);
    for (let i = 0; i < this.oscillators.length; i++) this.oscillators[i].frequency.setTargetAtTime((CONFIG.audio.engineBaseHz + normalized * CONFIG.audio.engineRangeHz) * (i + 1), t, 0.08);
  }
  coin(streak: number): void { this.tone(CONFIG.audio.coinHz * CONFIG.audio.coinPitchStep ** Math.min(streak, CONFIG.audio.coinPitchCap), CONFIG.audio.coinDuration, CONFIG.audio.coinGain, 'sine', 1.5); }
  switch(): void { this.burst(CONFIG.audio.whooshDuration, CONFIG.audio.whooshGain, CONFIG.audio.whooshFilter); }
  nearMiss(): void { this.tone(CONFIG.audio.coinHz / 2, CONFIG.audio.coinDuration, CONFIG.audio.coinGain, 'triangle', 0.4); this.switch(); }
  bump(): void { this.tone(CONFIG.audio.thudHz, CONFIG.audio.uiDuration, CONFIG.audio.coinGain, 'sine', 0.5); }
  click(): void { this.tone(CONFIG.audio.uiHz, CONFIG.audio.uiDuration, CONFIG.audio.coinGain, 'sine', 0.8); }
  crash(): void { this.burst(CONFIG.audio.crashDuration, CONFIG.audio.crashGain, CONFIG.audio.crashFilter); this.tone(CONFIG.audio.crashHz, CONFIG.audio.crashDuration, CONFIG.audio.crashGain, 'sine', 0.2); }
  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, endRatio: number): void {
    if (!this.context || !this.master || this.muted) return;
    const context = this.context, osc = context.createOscillator(), gain = context.createGain(), time = context.currentTime;
    osc.type = type; osc.frequency.setValueAtTime(frequency, time); osc.frequency.exponentialRampToValueAtTime(frequency * endRatio, time + duration);
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(time); osc.stop(time + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  private burst(duration: number, volume: number, frequency: number): void {
    if (!this.context || !this.master || !this.noise || this.muted) return;
    const context = this.context, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(); source.stop(context.currentTime + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  dispose(): void { for (const osc of this.oscillators) { osc.stop(); osc.disconnect(); } void this.context?.close(); }
}
