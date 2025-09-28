const DEFAULT_PROTOCOL = 'ws';
const DEFAULT_PORT = '3001';
const DEFAULT_PATH = '/ws';

const normalisePath = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const normaliseInput = (value?: string | null): string | undefined => {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolvePath = (params?: URLSearchParams): string => {
  const searchValue = normaliseInput(params?.get('wsPath'));
  const envValue =
    normaliseInput(import.meta.env?.VITE_WS_PATH as string | undefined) ??
    normaliseInput(import.meta.env?.VITE_MULTIPLAYER_PATH as string | undefined);
  return normalisePath(searchValue ?? envValue ?? DEFAULT_PATH);
};

export const WS_PATH = resolvePath();

export const makeWsUrl = (): string => {
  if (typeof window === 'undefined') {
    const host =
      normaliseInput(import.meta.env?.VITE_WS_HOST as string | undefined) ??
      normaliseInput(import.meta.env?.VITE_MULTIPLAYER_HOST as string | undefined) ??
      'localhost';
    const port =
      normaliseInput(import.meta.env?.VITE_WS_PORT as string | undefined) ??
      normaliseInput(import.meta.env?.VITE_MULTIPLAYER_PORT as string | undefined) ??
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
    normaliseInput(params.get('wsHost')) ??
    normaliseInput(import.meta.env?.VITE_WS_HOST as string | undefined) ??
    normaliseInput(import.meta.env?.VITE_MULTIPLAYER_HOST as string | undefined) ??
    window.location.hostname;
  const port =
    normaliseInput(params.get('wsPort')) ??
    normaliseInput(import.meta.env?.VITE_WS_PORT as string | undefined) ??
    normaliseInput(import.meta.env?.VITE_MULTIPLAYER_PORT as string | undefined) ??
    (window.location.port || DEFAULT_PORT);

  const safeHost = host && host.length > 0 ? host : window.location.hostname || 'localhost';
  const address = port ? `${host}:${port}` : host;
  const safeAddress = port ? `${safeHost}:${port}` : safeHost;
  return `${proto}://${safeAddress}${path}`;
};

export const WS_URL = makeWsUrl();
