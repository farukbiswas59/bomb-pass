import { ARENA, TAG_RANGE, tagTargets, type Player } from '../shared/game';
import { net } from './network';
import { audio } from './audio';
export class Renderer {
  frame = 0;
  lastEvent = 0;
  bursts: { x: number; y: number; at: number; color: string }[] = [];
  lastTick = 0;
  observer: ResizeObserver;
  constructor(private canvas: HTMLCanvasElement) {
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement!);
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }
  resize() {
    const box = this.canvas.parentElement!.getBoundingClientRect(),
      width = Math.min(box.width, (box.height * 5) / 6),
      height = (width * 6) / 5,
      d = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = width * d;
    this.canvas.height = height * d;
  }
  stop() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }
  draw = () => {
    const c = this.canvas.getContext('2d')!;
    const w = this.canvas.width,
      h = this.canvas.height;
    c.setTransform(w / ARENA.width, 0, 0, h / ARENA.height, 0, 0);
    c.clearRect(0, 0, ARENA.width, ARENA.height);
    const s = net.snapshot,
      now = s ? s.now + Math.min(250, performance.now() - net.receivedAt) : 0;
    c.fillStyle = '#101924';
    c.fillRect(0, 0, 600, 720);
    c.strokeStyle = '#1b2937';
    c.lineWidth = 1;
    for (let x = 0; x < 600; x += 40) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 720);
      c.stroke();
    }
    for (let y = 0; y < 720; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(600, y);
      c.stroke();
    }
    c.strokeStyle = '#34463c';
    c.setLineDash([5, 9]);
    c.strokeRect(20, 20, 560, 680);
    c.setLineDash([]);
    c.strokeStyle = '#253643';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(300, 360, 84, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#314151';
    c.font = '900 22px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('BOMB PASS', 300, 365);
    for (const [i, o] of ARENA.obstacles.entries()) {
      c.fillStyle = '#080d15';
      c.fillRect(o.x + 5, o.y + 7, o.w, o.h);
      c.fillStyle = '#263444';
      c.fillRect(o.x, o.y, o.w, o.h);
      c.strokeStyle = '#516578';
      c.lineWidth = 2;
      c.strokeRect(o.x, o.y, o.w, o.h);
      c.fillStyle = i % 2 ? '#89a5c7' : '#b4eb68';
      c.fillRect(o.x + 12, o.y + 8, 24, 3);
      c.strokeStyle = '#334657';
      c.beginPath();
      c.moveTo(o.x + o.w - 22, o.y + o.h - 8);
      c.lineTo(o.x + o.w - 8, o.y + o.h - 22);
      c.stroke();
    }
    if (s) {
      for (const item of s.pickups) {
        c.fillStyle = '#d0eaff';
        c.beginPath();
        c.arc(item.x, item.y, 16, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#111827';
        c.font = 'bold 18px monospace';
        c.fillText(
          item.kind === 'shield' ? 'S' : item.kind === 'freeze' ? 'F' : 'D',
          item.x,
          item.y + 6,
        );
      }
      const players = net.remotePlayers();
      for (const p of players) this.player(c, p, now);
      const local = players.find((p) => p.id === net.id);
      const targets =
        local &&
        net.socket.connected &&
        s.phase === 'playing' &&
        (now >= local.tagReady || now < local.tagUntil)
          ? tagTargets(local, players, s.bombs, s.settings.mode, now)
          : [];
      this.canvas.setAttribute(
        'aria-description',
        targets.length
          ? `In tag range: ${targets.map((p) => p.name).join(', ')}. Tap Tag once.`
          : 'Move close to an unprotected opponent to pass the bomb.',
      );
      for (const [i, target] of targets.entries()) this.targetMarker(c, target, i === 0);
      for (const e of s.events)
        if (e.id > this.lastEvent) {
          if (e.type === 'explode' || e.type === 'pass')
            this.bursts.push({
              x: e.x,
              y: e.y,
              at: performance.now(),
              color: e.type === 'explode' ? '#ff7d4b' : '#c4ff63',
            });
          this.lastEvent = e.id;
        }
      const localBomb = s.bombs.find((b) => b.owner === net.id);
      if (localBomb && performance.now() - this.lastTick > 1000 - localBomb.danger * 220) {
        audio.play('tick');
        this.lastTick = performance.now();
      }
    }
    this.bursts = this.bursts.filter((b) => performance.now() - b.at < 550);
    if (!audio.prefs.reduced)
      for (const b of this.bursts) {
        const t = (performance.now() - b.at) / 550;
        c.globalAlpha = 1 - t;
        c.strokeStyle = b.color;
        c.lineWidth = 5 * (1 - t);
        c.beginPath();
        c.arc(b.x, b.y, 12 + t * 100, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 8; i++) {
          c.fillStyle = b.color;
          c.fillRect(
            b.x + Math.cos((i * Math.PI) / 4) * t * 85,
            b.y + Math.sin((i * Math.PI) / 4) * t * 85,
            4,
            4,
          );
        }
        c.globalAlpha = 1;
      }
    this.frame = requestAnimationFrame(this.draw);
  };
  targetMarker(c: CanvasRenderingContext2D, p: Player, nearest: boolean) {
    c.save();
    c.translate(p.x, p.y);
    c.strokeStyle = nearest ? '#beff55' : '#e7ffc2';
    c.lineWidth = nearest ? 3 : 2;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * 20, sy * 29);
        c.lineTo(sx * 29, sy * 29);
        c.lineTo(sx * 29, sy * 20);
        c.stroke();
      }
    c.fillStyle = nearest ? '#beff55' : '#e7ffc2';
    c.fillRect(-20, -65, 40, 19);
    c.fillStyle = '#101924';
    c.font = 'bold 12px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('TAG', 0, -51);
    c.restore();
  }
  player(c: CanvasRenderingContext2D, p: Player, now: number) {
    const bomb = net.snapshot?.bombs.find((b) => b.owner === p.id),
      local = p.id === net.id;
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.connected ? (now < p.respawnUntil ? 0.4 : 1) : 0.4;
    if (now < p.dashUntil && !audio.prefs.reduced) {
      c.fillStyle = p.color;
      c.globalAlpha = 0.2;
      for (let i = 1; i <= 3; i++) {
        c.beginPath();
        c.arc(-p.dashX * i * 12, -p.dashY * i * 12, 16 - i * 2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    if (local) {
      c.strokeStyle = '#f4ffe4';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 23, 0, Math.PI * 2);
      c.stroke();
    }
    if (now < p.protectedUntil || now < p.shieldUntil) {
      c.strokeStyle = now < p.shieldUntil ? '#64d9ff' : '#ffffff';
      c.lineWidth = 3;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.arc(0, 0, 28, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    if (now < p.tagUntil) {
      c.strokeStyle = '#d2ff8f';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, TAG_RANGE, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#050912';
    c.beginPath();
    c.ellipse(0, 10, 19, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = now < p.slowUntil ? '#c4eeff' : p.color;
    c.beginPath();
    c.roundRect(-16, -17, 32, 34, 12);
    c.fill();
    c.fillStyle = '#111827';
    c.beginPath();
    c.ellipse(-6 + p.dx * 2, -3 + p.dy * 2, 3, bomb ? 5 : 3, 0, 0, Math.PI * 2);
    c.ellipse(6 + p.dx * 2, -3 + p.dy * 2, 3, bomb ? 5 : 3, 0, 0, Math.PI * 2);
    c.fill();
    if (bomb) {
      c.beginPath();
      c.arc(0, 9, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#f4f5f8';
    c.font = `${local ? 'bold ' : ''}14px system-ui`;
    c.textAlign = 'center';
    c.fillText(
      `${net.snapshot?.settings.mode === 'teams' ? (p.team === 0 ? '▲ ' : '◆ ') : ''}${p.name}${p.bot ? ' · BOT' : ''}`,
      0,
      -33,
    );
    for (let i = 0; i < (net.snapshot?.settings.lives || 5); i++) {
      c.fillStyle = i < p.lives ? p.color : '#354254';
      c.fillRect(i * 7 - ((net.snapshot?.settings.lives || 5) * 7) / 2, 25, 5, 3);
    }
    if (p.lives === 0) {
      c.fillStyle = '#ff8c7f';
      c.font = 'bold 12px monospace';
      c.fillText('DANGER', 0, 43);
    }
    if (bomb) {
      c.translate(22, -21);
      const colors = ['#e9f99c', '#ffd36a', '#ff9b54', '#ff587b'];
      c.fillStyle = colors[bomb.danger];
      c.beginPath();
      c.arc(0, 0, 13, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#171922';
      c.beginPath();
      c.arc(0, 1, 9, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = colors[bomb.danger];
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(3, -9);
      c.quadraticCurveTo(1, -23, 13, -18);
      c.stroke();
      c.fillStyle = '#fff';
      c.fillRect(11, -21, 4, 4);
      c.translate(-22, 21);
    }
    if (now < p.emoteUntil) {
      c.fillStyle = '#e9f7dc';
      c.fillRect(-29, -77, 58, 24);
      c.fillStyle = '#10131e';
      c.font = 'bold 13px monospace';
      c.fillText(p.emote, 0, -60);
    }
    c.restore();
  }
}
