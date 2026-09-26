import { Component, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { DEFAULT_SETTINGS, STEP, type Settings, type Player, type Snapshot } from '../shared/game';
import { net } from './network';
import { audio, type Preferences } from './audio';
import { InputController } from './input';
import { Renderer } from './renderer';
import './style.css';
import { ConnectionPanel } from './ConnectionPanel';
import { AdSlot, savedAdsEnabled } from './ads';

function BombIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="18" cy="25" r="12" fill="currentColor" />
      <path
        d="M21 13c-2-8 7-11 10-5M31 1v4m5 1-3 2m5 5-5-1"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M11 23a7 7 0 0 1 5-5" stroke="#10151b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function savedName() {
  try {
    return (
      localStorage.getItem('bp.name') ||
      ['BoomKid', 'NoChance', 'FuseLord', 'PanicMode'][Math.floor(Math.random() * 4)]
    );
  } catch {
    return 'PanicMode';
  }
}
function initialCode() {
  const path = location.pathname.match(/^\/join\/([A-Z2-9]{5})$/);
  return path?.[1] || '';
}
function Roster({ s }: { s: Snapshot }) {
  return (
    <div className="roster">
      {s.players.map((p) => (
        <div className="player-row" key={p.id}>
          <span className="avatar" style={{ background: p.color }}>
            {s.settings.mode === 'teams'
              ? p.team === 0
                ? '▲'
                : '◆'
              : p.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>
              {p.name}
              {p.id === net.id ? ' (you)' : ''}
            </strong>
            <small>
              {p.bot
                ? 'BOT'
                : !p.connected
                  ? 'Reconnecting…'
                  : p.afk
                    ? 'Inactive'
                    : p.id === s.host
                      ? 'Host'
                      : s.settings.mode === 'teams'
                        ? `Team ${p.team === 0 ? 'Triangle' : 'Diamond'}`
                        : 'Ready'}
            </small>
          </div>
          <span className="row-value">{s.phase === 'lobby' ? '✓' : `${p.lives} ♥`}</span>
        </div>
      ))}
    </div>
  );
}
function Rules() {
  return (
    <div className="rules">
      <div>
        <b>01</b>
        <span>
          <strong>Move.</strong> Chase or get chased.
        </span>
      </div>
      <div>
        <b>02</b>
        <span>
          <strong>Tag.</strong> Face a rival. Pass the bomb.
        </span>
      </div>
      <div>
        <b>03</b>
        <span>
          <strong>Run.</strong> The fuse is a secret.
        </span>
      </div>
      <p>
        Most lives wins. Points break ties.
        <br />
        Zero lives? Keep playing in danger mode.
      </p>
    </div>
  );
}
function Prefs({
  close,
  adsEnabled,
  setAdsEnabled,
}: {
  close: () => void;
  adsEnabled: boolean;
  setAdsEnabled: (enabled: boolean) => void;
}) {
  const [p, set] = useState<Preferences>(audio.prefs);
  function change<K extends keyof Preferences>(k: K, v: Preferences[K]) {
    const n = { ...p, [k]: v };
    set(n);
    audio.setPrefs(n);
  }
  return (
    <div className="modal-scrim">
      <section className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="section-head">
          <h2>YOUR SETUP</h2>
          <button autoFocus className="icon-button" onClick={close} aria-label="Close settings">
            ×
          </button>
        </div>
        {(['music', 'sfx', 'reduced', 'haptics'] as const).map((key) => (
          <label className="toggle" key={key}>
            <span>
              {
                {
                  music: 'Music',
                  sfx: 'Sound effects',
                  reduced: 'Reduced effects',
                  haptics: 'Haptics',
                }[key]
              }
            </span>
            <input
              type="checkbox"
              checked={p[key]}
              onChange={(e) => change(key, e.target.checked)}
            />
          </label>
        ))}
        {(['musicVolume', 'sfxVolume'] as const).map((key) => (
          <label className="field" key={key}>
            {key === 'musicVolume' ? 'Music volume' : 'Effects volume'}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={p[key]}
              onChange={(e) => change(key, Number(e.target.value))}
            />
          </label>
        ))}
        <label className="toggle">
          <span>
            Test ads<small>Menus only · Off during matches and Wi-Fi play</small>
          </span>
          <input
            type="checkbox"
            checked={adsEnabled}
            onChange={(e) => setAdsEnabled(e.target.checked)}
          />
        </label>
        <button className="primary" onClick={close}>
          DONE
        </button>
      </section>
    </div>
  );
}
function Controls({ input, p, s }: { input: InputController; p?: Player; s: Snapshot }) {
  const stick = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLSpanElement>(null);
  const update = (e: PointerEvent<HTMLDivElement>) => {
    if (input.pointer !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      dx = e.clientX - (rect.left + rect.width / 2),
      dy = e.clientY - (rect.top + rect.height / 2),
      len = Math.max(34, Math.hypot(dx, dy));
    input.stick = { x: dx / len, y: dy / len };
    if (knob.current)
      knob.current.style.transform = `translate(${input.stick.x * 32}px,${input.stick.y * 32}px)`;
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (input.pointer !== e.pointerId) return;
    input.pointer = null;
    input.stick = { x: 0, y: 0 };
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
  };
  const press = (key: 'tag' | 'dash' | 'power') => () => {
    audio.unlock();
    input.actions[key] = true;
  };
  return (
    <div className="controls">
      <div className="joystick-wrap">
        <div
          className="joystick"
          ref={stick}
          role="group"
          aria-label="Movement joystick"
          onPointerDown={(e) => {
            if (input.pointer !== null) return;
            audio.unlock();
            input.pointer = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            update(e);
          }}
          onPointerMove={update}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <span ref={knob} />
        </div>
        <span className="control-hint">
          MOVE <kbd>WASD</kbd>
        </span>
      </div>
      <div className="actions">
        {s.settings.powerups && (
          <button
            className="power-button"
            disabled={!p?.power}
            onPointerDown={press('power')}
            onClick={(e) => {
              if (e.detail === 0) press('power')();
            }}
          >
            {p?.power === 'super' ? 'SUPER DASH' : p?.power?.toUpperCase() || 'NO POWER'}{' '}
            <kbd>E</kbd>
          </button>
        )}
        <button
          className="dash-button"
          aria-label="Dash"
          onPointerDown={press('dash')}
          onClick={(e) => {
            if (e.detail === 0) press('dash')();
          }}
        >
          <span>
            {p && p.dashReady > s.now ? `${Math.ceil((p.dashReady - s.now) / 1000)}s` : 'DASH'}
          </span>
          <kbd>SHIFT</kbd>
        </button>
        <button
          className="tag-button"
          aria-label="Tag"
          onPointerDown={press('tag')}
          onClick={(e) => {
            if (e.detail === 0) press('tag')();
          }}
        >
          <span>TAG</span>
          <kbd>SPACE</kbd>
        </button>
      </div>
    </div>
  );
}
function Arena({ s }: { s: Snapshot }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef(new InputController()).current;
  useEffect(() => {
    const renderer = new Renderer(canvas.current!),
      detach = input.attach();
    const timer = setInterval(() => net.send(input.read()), STEP);
    document.body.classList.add('in-game');
    return () => {
      renderer.stop();
      detach();
      clearInterval(timer);
      document.body.classList.remove('in-game');
    };
  }, [input]);
  const p = s.players.find((p) => p.id === net.id),
    bomb = s.bombs.find((b) => b.owner === net.id);
  return (
    <>
      <div className="match-bar">
        <div>
          <small>TIME LEFT</small>
          <strong>
            {Math.floor(
              Math.max(0, Math.ceil((s.endsAt - Math.max(s.now, s.startsAt)) / 1000)) / 60,
            )
              .toString()
              .padStart(2, '0')}
            :
            {(Math.max(0, Math.ceil((s.endsAt - Math.max(s.now, s.startsAt)) / 1000)) % 60)
              .toString()
              .padStart(2, '0')}
          </strong>
        </div>
        <span className={bomb ? 'danger status-label' : 'status-label'}>
          {bomb ? 'YOU HAVE THE BOMB' : s.stage}
        </span>
        <div className="lives">
          <small>YOUR LIVES</small>
          <strong>
            {p?.lives ?? 0}
            <span> / {s.settings.lives}</span>
          </strong>
        </div>
      </div>
      <div className="arena-region">
        <canvas
          ref={canvas}
          aria-label="Multiplayer Bomb Pass arena"
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button === 0) input.actions.tag = true;
          }}
        />
        {s.phase === 'countdown' && (
          <div className="countdown">
            <span>GET READY</span>
            <strong>{Math.max(1, Math.ceil((s.startsAt - s.now) / 1000))}</strong>
            <small>Move · Face a rival · Tag</small>
          </div>
        )}
        {!net.socket.connected && (
          <div className="reconnecting">
            <b>RECONNECTING…</b>
            <small>Your spot is held for 20 seconds.</small>
          </div>
        )}
        {p?.afk && <div className="afk-warning">Move to stay in the game.</div>}
      </div>
      <Controls input={input} p={p} s={s} />
    </>
  );
}
export function App() {
  const [, render] = useState(0);
  useEffect(() => net.subscribe(() => render((n) => n + 1)), []);
  const [name, setName] = useState(savedName),
    [code, setCode] = useState(initialCode),
    [view, setView] = useState<'home' | 'create' | 'join'>(initialCode() ? 'join' : 'home'),
    [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS }),
    [prefs, setPrefs] = useState(false),
    [connections, setConnections] = useState(false),
    [adsEnabled, setAds] = useState(savedAdsEnabled),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const s = net.snapshot,
    active = s?.phase === 'playing' || s?.phase === 'countdown',
    host = s?.host === net.id;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function setAdsEnabled(enabled: boolean) {
    setAds(enabled);
    try {
      localStorage.setItem('bp.testAds', String(enabled));
    } catch {}
  }
  async function join(kind: 'quick' | 'create' | 'join') {
    audio.unlock();
    audio.play('click');
    setBusy(true);
    net.error = '';
    try {
      localStorage.setItem('bp.name', name);
    } catch {}
    const r = await net.request('join', {
      kind,
      name,
      ...(kind === 'create' ? { settings } : {}),
      ...(kind === 'join' ? { code: code.toUpperCase().trim() } : {}),
    });
    setBusy(false);
    if (r.ok) {
      net.adopt(r);
      history.replaceState(null, '', `/join/${r.snapshot!.code}`);
    } else {
      net.error = r.error || 'Could not join.';
      net.notify();
    }
  }
  async function action(event: string) {
    audio.unlock();
    setBusy(true);
    const r = await net.request(event);
    setBusy(false);
    if (!r.ok) setNotice(r.error || 'Try again.');
  }
  async function leave() {
    await net.request('leave');
    net.clear();
    net.notify();
    history.replaceState(null, '', '/');
    setView('home');
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${net.inviteBase()}/join/${s!.code}`);
      setNotice('Invite copied. Send it to your friends.');
    } catch {
      setNotice(`Share this room code: ${s!.code}`);
    }
  }
  async function share() {
    const text =
      s?.phase === 'results'
        ? `I finished Bomb Pass with ${s.results?.rows.find((p) => p.id === net.id)?.lives || 0} lives. Can you beat me?`
        : 'Pass it before it blows. Join my Bomb Pass room!';
    const url = s?.phase === 'results' ? net.inviteBase() : `${net.inviteBase()}/join/${s!.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'BOMB PASS', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setNotice('Copied. Challenge a friend.');
      }
    } catch {
      setNotice(`Room code: ${s?.code}`);
    }
  }
  return (
    <div
      className={`app ${active ? 'playing' : ''} ${adsEnabled && net.mode !== 'lan' && (!s || s.phase === 'results') ? 'with-test-ad' : ''}`}
    >
      <header className="topbar">
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (s) void leave();
            else setView('home');
          }}
        >
          <BombIcon size={24} />
          BOMB PASS<span className="build-label">BETA</span>
        </a>
        <div className="top-actions">
          <span className={`connection ${net.socket.connected ? 'online' : ''}`} title={net.status}>
            {net.socket.connected ? (net.ping ? `${net.ping} ms` : 'ONLINE') : net.status}
          </span>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => {
              audio.unlock();
              setPrefs(true);
            }}
          >
            ⚙
          </button>
          {s && (
            <button className="quiet" onClick={leave}>
              Leave
            </button>
          )}
        </div>
      </header>
      {!s && (
        <main className="home">
          <div className="home-main">
            <div className="eyebrow">
              <span className="tiny-square" /> THE FUSE DOESN’T WAIT.
            </div>
            <h1>
              BOMB
              <br />
              <span>PASS</span>
              <i>.</i>
            </h1>
            <p className="tagline">PASS IT BEFORE IT BLOWS.</p>
            <div className="match-facts">
              <span>2–10 PLAYERS</span>
              <span>2 MINUTES</span>
              <span>NO SIGNUP</span>
            </div>
            <section className="play-panel">
              <button className="full connection-choice" onClick={() => setConnections(true)}>
                SAME WI-FI / ONLINE SERVER
              </button>
              <p className="hint server-choice-label">
                {net.mode === 'lan' ? 'SAME WI-FI' : 'ONLINE'} · {net.endpoint || 'Default server'}
              </p>
              <label className="field">
                YOUR NAME
                <input
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="PanicMode"
                  autoComplete="nickname"
                />
              </label>
              {view === 'home' ? (
                <>
                  <button
                    className="primary play-now"
                    disabled={busy || !net.socket.connected}
                    onClick={() => join('quick')}
                  >
                    <span>PLAY NOW</span>
                    <span>↗</span>
                  </button>
                  <div className="button-pair">
                    <button onClick={() => setView('create')}>CREATE ROOM</button>
                    <button onClick={() => setView('join')}>JOIN ROOM</button>
                  </div>
                  <small className="hint">Quick play pairs you with other real players.</small>
                </>
              ) : view === 'join' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void join('join');
                  }}
                >
                  <label className="field">
                    ROOM CODE
                    <input
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      maxLength={5}
                      placeholder="7K4P2"
                      autoComplete="off"
                    />
                  </label>
                  <button className="primary" disabled={busy || code.length !== 5}>
                    JOIN THE CHAOS
                  </button>
                  <button type="button" className="quiet back" onClick={() => setView('home')}>
                    Back
                  </button>
                </form>
              ) : (
                <>
                  <div className="settings-grid">
                    <label className="field">
                      MODE
                      <select
                        value={settings.mode}
                        onChange={(e) =>
                          setSettings({ ...settings, mode: e.target.value as Settings['mode'] })
                        }
                      >
                        <option value="ffa">Free for all</option>
                        <option value="teams">Teams ▲ vs ◆</option>
                      </select>
                    </label>
                    <label className="field">
                      TIME
                      <select
                        value={settings.duration}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            duration: Number(e.target.value) as Settings['duration'],
                          })
                        }
                      >
                        {[60, 120, 180].map((n) => (
                          <option key={n} value={n}>
                            {n / 60} minute{n > 60 ? 's' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      MAX PLAYERS
                      <select
                        value={settings.maxPlayers}
                        onChange={(e) =>
                          setSettings({ ...settings, maxPlayers: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 9 }, (_, i) => (
                          <option key={i} value={i + 2}>
                            {i + 2}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      LIVES
                      <select
                        value={settings.lives}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            lives: Number(e.target.value) as Settings['lives'],
                          })
                        }
                      >
                        {[3, 5, 7].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="toggle">
                    <span>
                      Power-ups <small>Shield · Freeze · Super dash</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.powerups}
                      onChange={(e) => setSettings({ ...settings, powerups: e.target.checked })}
                    />
                  </label>
                  <button className="primary" disabled={busy} onClick={() => join('create')}>
                    CREATE PRIVATE ROOM
                  </button>
                  <button className="quiet back" onClick={() => setView('home')}>
                    Back
                  </button>
                </>
              )}
              {(net.error || !net.socket.connected) && (
                <p className="error" role="alert">
                  {net.error || 'Connecting to the game server…'}
                </p>
              )}
            </section>
          </div>
          <aside className="home-aside">
            <div className="mini-label">THE ONLY RULE</div>
            <h2>
              DON’T
              <br />
              GET
              <br />
              <span>COMFORTABLE.</span>
            </h2>
            <Rules />
            <div className="keyboard-note">
              <span>DESKTOP</span>
              <p>
                <kbd>W A S D</kbd> move <kbd>SPACE</kbd> tag
                <br />
                <kbd>SHIFT</kbd> dash · Click the arena to tag
              </p>
              <span>MOBILE</span>
              <p>
                Left thumb moves.
                <br />
                Right thumb causes problems.
              </p>
            </div>
          </aside>
        </main>
      )}
      {s && s.phase === 'lobby' && (
        <main className="lobby">
          <section className="lobby-main">
            <div className="eyebrow">{s.public ? 'QUICK PLAY' : 'PRIVATE ROOM'} / NEON YARD</div>
            <h2>
              ASSEMBLE
              <br />
              <span>THE CHAOS.</span>
            </h2>
            <div className="room-code">
              <div>
                <small>ROOM CODE</small>
                <strong>{s.code}</strong>
              </div>
              <button onClick={copyInvite}>COPY INVITE ↗</button>
            </div>
            <div className="section-head">
              <h3>THE LINEUP</h3>
              <span>
                {s.players.length} / {s.settings.maxPlayers}
              </span>
            </div>
            <Roster s={s} />
            <div className="lobby-options">
              <span>{s.settings.mode === 'teams' ? 'TEAMS ▲ / ◆' : 'FREE FOR ALL'}</span>
              <span>{s.settings.duration / 60} MIN</span>
              <span>{s.settings.lives} LIVES</span>
            </div>
            {s.settings.mode === 'teams' && s.players.length % 2 === 1 && (
              <p className="hint">Odd player counts have uneven teams. Add one more for balance.</p>
            )}
            {host ? (
              <>
                <button
                  className="primary"
                  disabled={busy || s.players.filter((p) => p.connected).length < 2}
                  onClick={() => action('start')}
                >
                  START MATCH ↗
                </button>
                <button
                  className="full secondary"
                  disabled={busy || s.players.length >= s.settings.maxPlayers}
                  onClick={() => action('addBot')}
                >
                  + ADD A BOT TO PRACTICE
                </button>
              </>
            ) : (
              <p className="waiting">Waiting for the host to start…</p>
            )}
            {s.players.length < 2 && (
              <p className="hint">Invite a friend or add a clearly labelled bot to start.</p>
            )}
            {s.public && s.players.length >= 2 && (
              <p className="hint">Quick play starts automatically in a few seconds.</p>
            )}
            <button className="quiet full" onClick={share}>
              SHARE WITH FRIENDS
            </button>
          </section>
          <aside>
            <div className="mini-label">BE READY IN 10 SECONDS</div>
            <Rules />
            <p className="callout">
              The bomb won’t pass itself.
              <br />
              <strong>Face a rival and hit TAG.</strong>
            </p>
          </aside>
        </main>
      )}
      {s && active && (
        <main className="game-layout">
          <section className="game-console">
            <Arena s={s} />
          </section>
          <aside className="game-aside">
            <div className="section-head">
              <h3>THE LINEUP</h3>
              <span>{s.code}</span>
            </div>
            <Roster s={s} />
            <p className="callout">
              {s.settings.mode === 'teams'
                ? 'Tag the other team. ▲ vs ◆'
                : 'Every player for themselves.'}
              <br />
              Most lives wins. Points break ties.
            </p>
            <div className="emotes">
              {['GG', 'NOPE', 'HELP!'].map((t) => (
                <button key={t} onClick={() => net.socket.emit('emote', t)}>
                  {t}
                </button>
              ))}
            </div>
            <p className="hint">
              WASD / arrows · Space to tag
              <br />
              Shift to dash · E for power-up
            </p>
          </aside>
        </main>
      )}
      {s && s.phase === 'results' && s.results && (
        <main className="results">
          <div className="eyebrow">
            TIME’S UP / {s.results.draw ? 'SHARED VICTORY' : 'SURVIVAL LOOKS GOOD ON YOU'}
          </div>
          <h2>
            {s.results.draw
              ? 'IT’S A TIE.'
              : s.settings.mode === 'teams'
                ? `TEAM ${s.results.winningTeam === 0 ? '▲' : '◆'} WINS.`
                : `${s.results.rows.find((p) => p.id === s.results!.winners[0])?.name || 'EVERYONE'} WINS.`}
          </h2>
          <p className="tagline">
            {s.results.winners.includes(net.id) ? 'YOU KEPT YOUR COOL. MOSTLY.' : 'ONE MORE ROUND?'}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>LIVES</th>
                  <th>POINTS</th>
                  <th>PASSES</th>
                  <th>CAUSED</th>
                  <th>LONGEST HOLD</th>
                </tr>
              </thead>
              <tbody>
                {s.results.rows.map((p) => (
                  <tr key={p.id} className={s.results!.winners.includes(p.id) ? 'winner' : ''}>
                    <td>
                      <span style={{ color: p.color }}>●</span> {p.name}
                      {p.bot ? ' · BOT' : ''}
                      {s.results!.mvp === p.id && <small className="mvp"> MVP</small>}
                    </td>
                    <td>{p.lives}</td>
                    <td>{p.points}</td>
                    <td>{p.passes}</td>
                    <td>{p.caused}</td>
                    <td>{(p.longest / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Lives decide the winner. Tied? +2 per pass, +1 clutch pass, +5 caused explosion (+8 in
            danger mode), −5 per explosion.
          </p>
          <div className="result-actions">
            {host ? (
              <button className="primary" disabled={busy} onClick={() => action('start')}>
                REMATCH ↗
              </button>
            ) : (
              <span>Waiting for the host’s rematch…</span>
            )}
            <button onClick={share}>SHARE RESULT</button>
            <button onClick={leave}>MAIN MENU</button>
          </div>
        </main>
      )}
      {!active && (
        <footer>
          <span>NEON YARD / ARENA 01</span>
          <span>DON’T HOLD ON.</span>
        </footer>
      )}
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
      <AdSlot visible={adsEnabled && net.mode !== 'lan' && (!s || s.phase === 'results')} />
      {connections && <ConnectionPanel close={() => setConnections(false)} />}
      {prefs && (
        <Prefs
          close={() => setPrefs(false)}
          adsEnabled={adsEnabled}
          setAdsEnabled={setAdsEnabled}
        />
      )}
    </div>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fallback">
        <h1>FUSE BLOWN.</h1>
        <p>The game hit an unexpected error. Reload to reconnect to your room.</p>
        <button onClick={() => location.reload()}>RELOAD GAME</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
