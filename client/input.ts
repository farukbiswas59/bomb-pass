import { idleInput, type Input } from '../shared/game';
// Independent pointer IDs keep a held joystick active when another finger tags/dashes.
export class InputController {
  keys = new Set<string>();
  stick = { x: 0, y: 0 };
  actions = { tag: false, dash: false, power: false };
  pointer: number | null = null;
  keydown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches('input,select,textarea')) return;
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        ' ',
        'Shift',
        'w',
        'a',
        's',
        'd',
        'W',
        'A',
        'S',
        'D',
        'e',
        'E',
      ].includes(e.key)
    ) {
      e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      if (!e.repeat) {
        if (e.key === ' ') this.actions.tag = true;
        if (e.key === 'Shift') this.actions.dash = true;
        if (e.key.toLowerCase() === 'e') this.actions.power = true;
      }
    }
  };
  keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  reset = () => {
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.actions = { tag: false, dash: false, power: false };
    this.pointer = null;
  };
  visibility = () => {
    if (document.hidden) this.reset();
  };
  attach() {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.visibility);
    return () => {
      this.reset();
      window.removeEventListener('keydown', this.keydown);
      window.removeEventListener('keyup', this.keyup);
      window.removeEventListener('blur', this.reset);
      document.removeEventListener('visibilitychange', this.visibility);
    };
  }
  read(): Omit<Input, 'seq'> {
    const k = this.keys;
    const x =
        this.stick.x +
        (k.has('d') || k.has('arrowright') ? 1 : 0) -
        (k.has('a') || k.has('arrowleft') ? 1 : 0),
      y =
        this.stick.y +
        (k.has('s') || k.has('arrowdown') ? 1 : 0) -
        (k.has('w') || k.has('arrowup') ? 1 : 0);
    const l = Math.max(1, Math.hypot(x, y));
    const result = { ...idleInput(), x: x / l, y: y / l, ...this.actions };
    this.actions = { tag: false, dash: false, power: false };
    return result;
  }
}
