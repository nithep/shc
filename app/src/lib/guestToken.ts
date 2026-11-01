const PRIMARY_PREFIX = 'shc_guest_token_';
const LEGACY_PREFIXES = ['hotel_guest_token_', 'hotel_hotel_guest_token_'];
const ALL_PREFIXES = [PRIMARY_PREFIX, ...LEGACY_PREFIXES];

function roomKey(prefix: string, room: string): string {
  return `${prefix}${String(room ?? '').trim()}`;
}

export function getGuestToken(room: string, storage: Storage = localStorage): string | null {
  if (!String(room ?? '').trim()) return null;
  for (const prefix of ALL_PREFIXES) {
    const token = storage.getItem(roomKey(prefix, room));
    if (token) return token;
  }
  return null;
}

export function setGuestToken(room: string, token: string, storage: Storage = localStorage): void {
  if (!String(room ?? '').trim()) return;
  if (!token) {
    clearGuestToken(room, storage);
    return;
  }
  storage.setItem(roomKey(PRIMARY_PREFIX, room), token);
}

export function clearGuestToken(room: string, storage: Storage = localStorage): void {
  if (!String(room ?? '').trim()) return;
  for (const prefix of ALL_PREFIXES) {
    storage.removeItem(roomKey(prefix, room));
  }
}

export function resolveCheckoutToken(
  room: string,
  storage: Storage = localStorage
): { token: string; source: 'guest' | 'staff' } | null {
  const guestToken = getGuestToken(room, storage);
  if (guestToken) return { token: guestToken, source: 'guest' };

  const staffToken = storage.getItem('auth_token');
  if (staffToken) return { token: staffToken, source: 'staff' };

  return null;
}
