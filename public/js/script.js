/*
  script.js — Globales Verhalten + Seitendaten
  -------------------------------------------
  Enthält:
  - Mobile Navbar Toggle
  - FAQ Accordion (Startseite)
  - Dynamische Werte (Servername/IP, Online-Counts)
  - Admin-Team Rendering (admin-team.html)

  Hinweis:
  - Kontaktformular (Template-Altlast) wurde entfernt, da es auf dieser Website nicht genutzt wird.
*/

const siteConfig = {
  server: {
    logoFile: 'logo.webp',
    name: 'Minecraft Gilde',
    ip: 'minecraft-gilde.de',
    discordGuildId: '1219625244906754093',
  },

  team: {
    // Skin-Render-Typ für visage.surgeplay.com
    // Optionen: [full, bust, head, face, front, frontFull, skin]
    skinRenderType: 'full',

    // Standardfarben je Gruppe (kann pro Person überschrieben werden)
    groupColors: {
      admin: 'rgba(231, 76, 60, 1)',
      moderator: 'rgba(230, 126, 34, 1)',
      streamer: 'rgba(247, 2, 176, 0.5)',
    },

    // Gruppen + Mitglieder (werden auf admin-team.html gerendert)
    groups: {
      admin: [
        { inGameName: 'lestructor', role: 'Admin', skinUrl: '', roleColor: '' },
        { inGameName: 'SCHIROKY', role: 'Admin', skinUrl: '', roleColor: '' },
      ],
      moderator: [
        { inGameName: 'Fianaa', role: 'Moderator', skinUrl: '', roleColor: '' },
        { inGameName: 'W4ldi', role: 'Moderator', skinUrl: '', roleColor: '' },
        { inGameName: 'Wurmknoten', role: 'Moderator', skinUrl: '', roleColor: '' },
        { inGameName: 'MasterBenn', role: 'Moderator', skinUrl: '', roleColor: '' },
      ],
    },
  },
};

// -------------------------
// DOM Helper
// -------------------------
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// -------------------------
// Mobile Navbar (open/close)
// -------------------------
(() => {
  const navbar = qs('.navbar');
  const navbarLinks = qs('.links');
  const hamburger = qs('.hamburger');
  if (!navbar || !navbarLinks || !hamburger) return;

  hamburger.addEventListener('click', () => {
    navbar.classList.toggle('active');
    navbarLinks.classList.toggle('active');
  });
})();

// -------------------------
// FAQs Accordion (Startseite)
// -------------------------
(() => {
  const headers = qsa('.accordion-item-header');
  if (!headers.length) return;

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      header.classList.toggle('active');
      const body = header.nextElementSibling;
      if (!body) return;

      body.style.maxHeight = header.classList.contains('active') ? `${body.scrollHeight}px` : '0px';
    });
  });
})();

// -------------------------
// API Calls
// -------------------------
const fetchDiscordOnlineUsers = async () => {
  try {
    const guildId = siteConfig.server.discordGuildId;
    const apiWidgetUrl = `https://discord.com/api/guilds/${guildId}/widget.json`;
    const response = await fetch(apiWidgetUrl);
    const data = await response.json();
    return data?.presence_count ? data.presence_count : 'Keine';
  } catch {
    return 'Keine';
  }
};

const fetchMinecraftOnlinePlayers = async () => {
  try {
    const apiUrl = `https://api.mcsrvstat.us/3/${siteConfig.server.ip}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    return data?.players?.online ?? 'Keine';
  } catch (e) {
    console.warn('Minecraft Online-Count Fehler:', e);
    return 'Keine';
  }
};

const fetchUuidByUsername = async (username) => {
  const apiUrl = `https://corsjangapi.b-cdn.net/users/profiles/minecraft/${encodeURIComponent(username)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.status === 204 || res.status === 404) {
      console.warn(`Spieler "${username}" nicht gefunden.`);
      return '';
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return data?.id || '';
  } catch (err) {
    if (err?.name === 'AbortError') console.warn('UUID Anfrage abgebrochen: Timeout');
    else console.warn('UUID Anfrage fehlgeschlagen:', err);
    return '';
  }
};

const getSkinUrl = async (username) => {
  const uuid = await fetchUuidByUsername(username);
  const renderType = siteConfig.team.skinRenderType;

  // Fallback (Steve) – wenn UUID fehlt/ungültig
  const fallbackUuid = 'ec561538f3fd461daff5086b22154bce';
  const finalUuid = uuid || fallbackUuid;

  const url = `https://visage.surgeplay.com/${renderType}/512/${finalUuid}`;

  // Kurzer HEAD/GET um invaliden Render zu erkennen (visage liefert in manchen Fällen 400)
  try {
    const res = await fetch(url);
    if (res.status === 400) return `https://visage.surgeplay.com/${renderType}/512/${fallbackUuid}`;
    return url;
  } catch {
    return url;
  }
};

// -------------------------
// Helpers
// -------------------------
const enableCopyIp = () => {
  const copyIpButton = qs('.copy-ip');
  const copyIpAlert = qs('.ip-copied');
  if (!copyIpButton || !copyIpAlert) return;

  const defaultText = copyIpAlert.textContent?.trim() || 'IP erfolgreich kopiert!';

  const showAlert = (text, isError = false) => {
    copyIpAlert.textContent = text;
    copyIpAlert.classList.add('active');
    copyIpAlert.classList.toggle('error', isError);

    setTimeout(() => {
      copyIpAlert.classList.remove('active', 'error');
      // Text nach einer Fehlermeldung wieder zurücksetzen
      if (isError) copyIpAlert.textContent = defaultText;
    }, 5000);
  };

  const fallbackCopy = (text) => {
    // Fallback für Browser/Contexts ohne Clipboard API (z.B. http / alte Browser)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';

    document.body.appendChild(ta);
    ta.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  };

  copyIpButton.addEventListener('click', async () => {
    const ip = siteConfig.server.ip;

    try {
      // writeText ist Promise-basiert -> unbedingt await, sonst "falsch grün"
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ip);
      } else {
        const ok = fallbackCopy(ip);
        if (!ok) throw new Error('Clipboard API nicht verfügbar');
      }

      showAlert(defaultText, false);
    } catch (e) {
      console.warn('Copy-IP Fehler:', e);
      showAlert('Ein Fehler ist aufgetreten.', true);
    }
  });
};

const renderAdminTeam = async () => {
  const container = qs('.at-content');
  if (!container) return;

  for (const groupKey of Object.keys(siteConfig.team.groups)) {
    const members = siteConfig.team.groups[groupKey];

    const groupEl = document.createElement('div');
    groupEl.classList.add('group', groupKey);

    groupEl.innerHTML = `
      <h2 class="rank-title">${groupKey.charAt(0).toUpperCase() + groupKey.slice(1)}</h2>
      <div class="users"></div>
    `;

    container.appendChild(groupEl);

    const usersEl = qs('.users', groupEl);
    if (!usersEl) continue;

    for (const member of members) {
      const userDiv = document.createElement('div');
      userDiv.classList.add('user');

      const defaultColor = siteConfig.team.groupColors[groupKey] || 'var(--default-rank-color)';
      const roleColor = member.roleColor || defaultColor;

      let skin = member.skinUrl;
      if (!skin) skin = await getSkinUrl(member.inGameName);

      userDiv.innerHTML = `
        <img src="${skin}" alt="${member.inGameName}">
        <h5 class="name">${member.inGameName}</h5>
        <p class="rank ${groupKey}" style="background: ${roleColor}">${member.role}</p>
      `;

      usersEl.appendChild(userDiv);
    }
  }
};

// -------------------------
// Init
// -------------------------
const initPage = async () => {
  // Navbar / Branding
  const serverNameEl = qs('.server-name');
  const serverLogoEl = qs('.logo-img');
  if (serverNameEl) serverNameEl.textContent = siteConfig.server.name;
  if (serverLogoEl) serverLogoEl.src = `images/${siteConfig.server.logoFile}`;

  // Header IP
  const serverIpEl = qs('.minecraft-server-ip');
  if (serverIpEl) serverIpEl.textContent = siteConfig.server.ip;

  const path = (location.pathname || '').toLowerCase();

  // Startseite: Copy-IP + Online-Counts
  if (path === '/' || path.includes('index')) {
    enableCopyIp();

    const discordOnlineEl = qs('.discord-online-users');
    const mcOnlineEl = qs('.minecraft-online-players');
    if (discordOnlineEl) discordOnlineEl.textContent = await fetchDiscordOnlineUsers();
    if (mcOnlineEl) mcOnlineEl.textContent = await fetchMinecraftOnlinePlayers();
  }

  // Regeln-Seite: Copy-IP Button (falls vorhanden)
  if (path.includes('rules')) {
    enableCopyIp();
  }

  // Admin-Team Seite: dynamisch rendern
  if (path.includes('admin-team')) {
    await renderAdminTeam();
  }
};

initPage();
