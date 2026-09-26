import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { serverAddress, type ConnectionMode } from '../shared/connection';
import { net, defaultConnection } from './network';

export function ConnectionPanel({ close }: { close: () => void }) {
  const [mode, setMode] = useState<ConnectionMode>(net.mode);
  const [address, setAddress] = useState(net.endpoint || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function connect() {
    try {
      const url = serverAddress(address, mode);
      if (
        !Capacitor.isNativePlatform() &&
        location.protocol === 'https:' &&
        url.startsWith('http:')
      ) {
        setError(
          `Open ${url} directly in your phone browser to play over Wi-Fi. This HTTPS page cannot connect to a plain HTTP server.`,
        );
        return;
      }
      setBusy(true);
      await net.switchServer(url, mode);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid server address.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-scrim">
      <section className="modal" role="dialog" aria-modal="true" aria-label="Choose server">
        <div className="section-head">
          <h2>PLAY TOGETHER</h2>
          <button className="icon-button" onClick={close} aria-label="Close connection settings">
            ×
          </button>
        </div>
        <div className="button-pair">
          <button
            aria-pressed={mode === 'lan'}
            onClick={() => {
              setMode('lan');
              setAddress('');
              setError('');
            }}
          >
            SAME WI-FI
          </button>
          <button
            aria-pressed={mode === 'online'}
            onClick={() => {
              setMode('online');
              setAddress(import.meta.env.VITE_SERVER_URL || '');
              setError('');
            }}
          >
            ONLINE
          </button>
        </div>
        <p className="hint">
          {mode === 'lan'
            ? 'Run the Wi-Fi host on one computer. Connect every phone to the same Wi-Fi, then enter the address printed by the host. Internet is not needed for the match.'
            : 'Enter your deployed multiplayer server’s HTTPS address. Everyone must use the same server.'}
        </p>
        {mode === 'lan' && (
          <p className="hint">
            The APK joins a computer host; it does not host a match on the phone. Guest Wi-Fi with
            device isolation may block connections.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <label className="field">
            {mode === 'lan' ? 'HOST COMPUTER ADDRESS' : 'ONLINE SERVER ADDRESS'}
            <input
              autoFocus
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={address}
              placeholder={
                mode === 'lan' ? '192.168.1.20:3001' : 'https://your-server.onrender.com'
              }
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            CONNECT TO SERVER
          </button>
        </form>
        {!Capacitor.isNativePlatform() && (
          <button
            className="quiet full"
            onClick={async () => {
              const defaults = defaultConnection();
              await net.switchServer(defaults.endpoint, defaults.mode);
              close();
            }}
          >
            USE THIS WEBSITE’S DEFAULT SERVER
          </button>
        )}
      </section>
    </div>
  );
}
