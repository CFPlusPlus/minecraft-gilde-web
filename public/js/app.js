/*
  app.js
  ------------
  Global behavior for the site:
  - Theme toggle (system/light/dark) with localStorage
  - Navbar "more" menu toggle + click-outside + escape
  - Copy server IP helper
  - Online counters (Discord + Minecraft)
  - Lightweight toast
*/

(() => {
  const config = window.__APP_CONFIG__ || {
    serverIp: 'minecraft-gilde.de',
    discordGuildId: '1219625244906754093',
    discordInvite: 'https://discord.minecraft-gilde.de',
    dynmapUrl: 'https://map.minecraft-gilde.de',
  };

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -------------------------
  // Toast
  // -------------------------
  const toastEl = qs('#toast');
  let toastTimer = null;

  const showToast = (message, variant = 'default') => {
    if (!toastEl) return;
    window.clearTimeout(toastTimer);

    toastEl.classList.remove('hidden');
    toastEl.innerHTML = `
      <div
        class="pointer-events-auto mg-card px-4 py-3 shadow-sm ${
          variant === 'error' ? 'border-accent/30 bg-accent/10' : ''
        }"
        role="status"
      >
        <p class="text-sm text-fg/90">${String(message)}</p>
      </div>
    `;

    toastTimer = window.setTimeout(() => {
      toastEl.classList.add('hidden');
      toastEl.innerHTML = '';
    }, 2200);
  };

  // -------------------------
  // Theme (system/light/dark)
  // -------------------------
  const THEME_KEY = 'theme';
  const VALID = new Set(['system', 'light', 'dark']);

  const getStoredTheme = () => {
    try {
      const v = localStorage.getItem(THEME_KEY) || 'system';
      return VALID.has(v) ? v : 'system';
    } catch {
      return 'system';
    }
  };

  const applyTheme = (mode) => {
    const root = document.documentElement;

    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
    else root.removeAttribute('data-theme');

    // Persist
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // ignore
    }

    // Update icons
    qsa('[data-theme-icon]').forEach((el) => {
      const iconMode = el.getAttribute('data-theme-icon');
      const shouldShow = iconMode === mode;
      if (shouldShow) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
  };

  const cycleTheme = () => {
    const current = getStoredTheme();
    if (current === 'system') return 'dark';
    if (current === 'dark') return 'light';
    return 'system';
  };

  // Initialize theme icons based on stored preference
  applyTheme(getStoredTheme());

  const themeBtn = qs('[data-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = cycleTheme();
      applyTheme(next);
      const label = next === 'system' ? 'System' : next === 'dark' ? 'Dark' : 'Light';
      showToast(`Theme: ${label}`);
    });
  }

  // -------------------------
  // Navbar menu toggle
  // -------------------------
  const navRoot = qs('[data-site-nav]');
  const panel = qs('[data-nav-panel]', navRoot || document);
  const toggle = qs('[data-nav-toggle]', navRoot || document);
  const iconOpen = qs('[data-icon-open]', toggle || document);
  const iconClose = qs('[data-icon-close]', toggle || document);

  const closeMenu = () => {
    if (!panel || !toggle) return;
    panel.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    if (iconOpen) iconOpen.classList.remove('hidden');
    if (iconClose) iconClose.classList.add('hidden');
  };

  const openMenu = () => {
    if (!panel || !toggle) return;
    panel.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    if (iconOpen) iconOpen.classList.add('hidden');
    if (iconClose) iconClose.classList.remove('hidden');
  };

  const isMenuOpen = () => panel && !panel.classList.contains('hidden');

  if (toggle && panel) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMenuOpen()) closeMenu();
      else openMenu();
    });

    // close on click outside
    document.addEventListener('click', (e) => {
      if (!isMenuOpen()) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || toggle.contains(target)) return;
      closeMenu();
    });

    // close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen()) closeMenu();
    });

    // close on resize to keep state sane
    window.addEventListener('resize', () => closeMenu());
  }

  // -------------------------
  // Copy IP
  // -------------------------
  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
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

  const copyIp = async () => {
    const ip = config.serverIp || 'minecraft-gilde.de';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ip);
      } else {
        const ok = fallbackCopy(ip);
        if (!ok) throw new Error('Clipboard API nicht verfügbar');
      }
      showToast('IP kopiert!');
    } catch (e) {
      console.warn('Copy-IP Fehler:', e);
      showToast('Kopieren nicht möglich.', 'error');
    }
  };

  qsa('[data-copy-ip]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      copyIp();
    });
  });

  // -------------------------
  // Online Counters
  // -------------------------
  const fetchDiscordOnlineUsers = async () => {
    try {
      const guildId = config.discordGuildId;
      if (!guildId) return 'Keine';
      const apiWidgetUrl = `https://discord.com/api/guilds/${guildId}/widget.json`;
      const response = await fetch(apiWidgetUrl, { cache: 'no-store' });
      const data = await response.json();
      return data?.presence_count ? String(data.presence_count) : 'Keine';
    } catch {
      return 'Keine';
    }
  };

  const fetchMinecraftOnlinePlayers = async () => {
    try {
      const ip = config.serverIp || 'minecraft-gilde.de';
      const apiUrl = `https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`;
      const response = await fetch(apiUrl, { cache: 'no-store' });
      const data = await response.json();
      return data?.players?.online != null ? String(data.players.online) : 'Keine';
    } catch (e) {
      console.warn('Minecraft Online-Count Fehler:', e);
      return 'Keine';
    }
  };

  const discordTargets = qsa('[data-discord-online]');
  const mcTargets = qsa('[data-mc-online]');

  const updateCounters = async () => {
    if (discordTargets.length) {
      const val = await fetchDiscordOnlineUsers();
      discordTargets.forEach((el) => (el.textContent = val));
    }

    if (mcTargets.length) {
      const val = await fetchMinecraftOnlinePlayers();
      mcTargets.forEach((el) => (el.textContent = val));
    }
  };

  // only fetch if the page actually has placeholders
  if (discordTargets.length || mcTargets.length) updateCounters();
})();
