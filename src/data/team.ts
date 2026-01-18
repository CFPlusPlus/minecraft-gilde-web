export type TeamMember = {
  inGameName: string;
  role: string;
  group: 'admin' | 'moderator' | 'streamer';
};

export const TEAM_GROUPS: Array<{ key: TeamMember['group']; label: string }> = [
  { key: 'admin', label: 'Admins' },
  { key: 'moderator', label: 'Moderatoren' },
  { key: 'streamer', label: 'Streamer' },
];

// Quelle: bisherige Konfiguration (public/js/script.js)
export const TEAM_MEMBERS: TeamMember[] = [
  { inGameName: 'lestructor', role: 'Admin', group: 'admin' },
  { inGameName: 'SCHIROKY', role: 'Admin', group: 'admin' },

  { inGameName: 'Fianaa', role: 'Moderator', group: 'moderator' },
  { inGameName: 'W4ldi', role: 'Moderator', group: 'moderator' },
  { inGameName: 'Wurmknoten', role: 'Moderator', group: 'moderator' },
  { inGameName: 'MasterBenn', role: 'Moderator', group: 'moderator' },
];
