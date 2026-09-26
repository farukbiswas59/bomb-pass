import { describe, expect, it } from 'vitest';
import { isPrivateHost, serverAddress } from '../shared/connection';
describe('server selection', () => {
  it('accepts only real private Wi-Fi ranges', () => {
    for (const h of ['10.2.3.4', '192.168.1.40', '172.16.1.2', '172.31.255.254'])
      expect(isPrivateHost(h)).toBe(true);
    for (const h of [
      '172.15.1.2',
      '172.32.1.2',
      '8.8.8.8',
      '192.168.1.999',
      'localhost',
      'example.com',
    ])
      expect(isPrivateHost(h)).toBe(false);
  });
  it('normalizes Wi-Fi addresses and default ports', () => {
    expect(serverAddress(' 192.168.1.20 ', 'lan')).toBe('http://192.168.1.20:3001');
    expect(serverAddress('http://10.0.0.2:5173/', 'lan')).toBe('http://10.0.0.2:5173');
  });
  it('requires HTTPS online and prevents credentials, paths and schemes', () => {
    expect(serverAddress('game.example', 'online')).toBe('https://game.example');
    for (const url of [
      'http://game.example',
      'https://user:password@game.example',
      'https://game.example/join/ABCDE',
      'https://game.example?token=x',
      'javascript:alert(1)',
    ])
      expect(() => serverAddress(url, 'online')).toThrow();
    expect(() => serverAddress('8.8.8.8', 'lan')).toThrow();
    expect(() => serverAddress('localhost', 'lan')).toThrow();
  });
});
