const DEFAULT_PROTOCOL = 'ws';
const DEFAULT_PORT = '3001';
const DEFAULT_PATH = '/ws';

const normalisePath = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const resolvePath = (params?: URLSearchParams): string => {
  const searchValue = params?.get('wsPath');
  const envValue =
    (import.meta.env?.VITE_WS_PATH as string | undefined) ??
    (import.meta.env?.VITE_MULTIPLAYER_PATH as string | undefined);
  return normalisePath(searchValue ?? envValue ?? DEFAULT_PATH);
};

export const WS_PATH = resolvePath();

export const makeWsUrl = (): string => {
  if (typeof window === 'undefined') {
    const host =
      (import.meta.env?.VITE_WS_HOST as string | undefined) ??
      (import.meta.env?.VITE_MULTIPLAYER_HOST as string | undefined) ??
      'localhost';
    const port =
      (import.meta.env?.VITE_WS_PORT as string | undefined) ??
      (import.meta.env?.VITE_MULTIPLAYER_PORT as string | undefined) ??
      DEFAULT_PORT;
    return `${DEFAULT_PROTOCOL}://${host}:${port}${WS_PATH}`;
  }

  const params = new URLSearchParams(window.location.search);
  const path = resolvePath(params);
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const explicitUrl =
    params.get('wsUrl') ??
    (import.meta.env?.VITE_WS_URL as string | undefined) ??
    (import.meta.env?.VITE_MULTIPLAYER_URL as string | undefined);

  if (explicitUrl) {
    try {
      const url = new URL(explicitUrl, window.location.href);
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        url.protocol = proto;
      }
      if (url.pathname === '/' || url.pathname === '') {
        url.pathname = path;
      }
      return url.toString();
    } catch {
      return `${proto}://${explicitUrl}${path}`;
    }
  }

  const host =
    params.get('wsHost') ??
    (import.meta.env?.VITE_WS_HOST as string | undefined) ??
    (import.meta.env?.VITE_MULTIPLAYER_HOST as string | undefined) ??
    window.location.hostname;
  const port =
    params.get('wsPort') ??
    (import.meta.env?.VITE_WS_PORT as string | undefined) ??
    (import.meta.env?.VITE_MULTIPLAYER_PORT as string | undefined) ??
    (window.location.port || DEFAULT_PORT);

  const address = port ? `${host}:${port}` : host;
  return `${proto}://${address}${path}`;
};

export const WS_URL = makeWsUrl();
