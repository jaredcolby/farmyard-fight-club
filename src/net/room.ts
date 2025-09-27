const DEFAULT_ROOM = 'dev-room';

const normaliseRoom = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_ROOM;
};

export const resolveRoomId = (): string => {
  if (typeof window === 'undefined') {
    return normaliseRoom(import.meta.env?.VITE_WS_ROOM as string | undefined);
  }

  const params = new URLSearchParams(window.location.search);
  return normaliseRoom(params.get('room') ?? (import.meta.env?.VITE_WS_ROOM as string | undefined));
};

export const ROOM_ID = resolveRoomId();
