export type Preferences = {
  music: boolean;
  sfx: boolean;
  musicVolume: number;
  sfxVolume: number;
  reduced: boolean;
  haptics: boolean;
};
export const DEFAULT_PREFS: Preferences = {
  music: true,
  sfx: true,
  musicVolume: 0.18,
  sfxVolume: 0.5,
  reduced: false,
  haptics: true,
};
export function readPrefs(): Preferences {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('bp.prefs') || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
export class AudioEngine {
  prefs = readPrefs();
  context: AudioContext | null = null;
  step = 0;
  intense = false;
  timer: ReturnType<typeof setInterval> | null = null;
  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.timer = setInterval(() => this.music(), 150);
    }
    void this.context.resume();
  }
  setPrefs(p: Preferences) {
    this.prefs = p;
    try {
      localStorage.setItem('bp.prefs', JSON.stringify(p));
    } catch {}
  }
  tone(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    end?: number,
  ) {
    const c = this.context;
    if (!c || c.state !== 'running' || document.hidden) return;
    const osc = c.createOscillator(),
      gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (end) osc.frequency.exponentialRampToValueAtTime(end, c.currentTime + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  }
  music() {
    if (!this.prefs.music) return;
    const notes = [110, 110, 146.83, 130.81, 110, 164.81, 146.83, 98];
    const step = this.step++;
    if (step % 2 === 0 || this.intense)
      this.tone(
        notes[Math.floor(step / 4) % notes.length],
        0.13,
        this.prefs.musicVolume * 0.18,
        'triangle',
      );
    if (step % 4 === 0) this.tone(90, 0.12, this.prefs.musicVolume * 0.3, 'sine', 35);
  }
  play(kind: string) {
    if (!this.prefs.sfx) return;
    const v = this.prefs.sfxVolume * 0.2;
    if (kind === 'explode') {
      this.tone(160, 0.45, v, 'sawtooth', 25);
      if (this.prefs.haptics) navigator.vibrate?.([35, 25, 45]);
    } else if (kind === 'pass') {
      this.tone(400, 0.16, v, 'triangle', 1000);
      if (this.prefs.haptics) navigator.vibrate?.(15);
    } else if (kind === 'dash') this.tone(140, 0.13, v / 2, 'sawtooth', 600);
    else if (kind === 'tick') this.tone(1200, 0.025, v / 2, 'square');
    else if (kind === 'win') {
      this.tone(523, 0.4, v);
      setTimeout(() => this.tone(659, 0.4, v), 120);
      setTimeout(() => this.tone(784, 0.5, v), 240);
    } else this.tone(kind === 'tag' ? 230 : 660, 0.09, v, 'triangle', kind === 'tag' ? 80 : 990);
  }
}
export const audio = new AudioEngine();
