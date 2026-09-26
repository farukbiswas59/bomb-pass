export type ConnectionMode = 'online' | 'lan';
export function isPrivateHost(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
}
export function serverAddress(raw: string, mode: ConnectionMode) {
  const value = raw.trim();
  if (!value) throw new Error('Enter the server address first.');
  const url = new URL(
    value.includes('://') ? value : `${mode === 'lan' ? 'http' : 'https'}://${value}`,
  );
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use only the server address and port, without a path or password.');
  if (mode === 'lan' && !isPrivateHost(url.hostname))
    throw new Error('Use the host computer’s Wi-Fi IPv4 address, such as 192.168.1.20:3001.');
  if (mode === 'online' && url.protocol !== 'https:')
    throw new Error('Online servers must use HTTPS.');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS server.');
  if (mode === 'lan' && !url.port) url.port = '3001';
  return url.origin;
}
