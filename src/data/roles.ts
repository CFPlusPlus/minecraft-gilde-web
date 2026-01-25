export type RoleKey = 'admin' | 'moderator' | 'streamer' | 'player';

/**
 * Rollenfarben (Chat) – vom Team vorgegeben.
 */
export const ROLE_COLORS: Record<RoleKey, string> = {
  admin: '#e74c3c',
  moderator: '#e67e22',
  streamer: '#9b59b6',
  player: '#3498db',
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
  streamer: 'Streamer',
  player: 'Spieler',
};
