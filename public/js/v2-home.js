/*
  v2-home.js
  ----------
  Home-specific behavior for /v2:
  - Player list (mcsrvstat.us)
  - World age counter (based on world start date)

  Uses window.__V2_CONFIG__ from V2Layout.
*/

(() => {
  const config = window.__V2_CONFIG__ || { serverIp: 'minecraft-gilde.de' };
  const qs = (sel, root = document) => root.querySelector(sel);

  const POLL_MS = 12_000;
  const FETCH_TIMEOUT_MS = 8_000;
  let isFetchInFlight = false;

  const minotarURL = (uuid, name, size = 80) =>
    uuid
      ? `https://minotar.net/helm/${encodeURIComponent(uuid)}/${size}.png`
      : `https://minotar.net/helm/${encodeURIComponent(name)}/${size}.png`;

  const mcHeadsURL = (uuid, name, size = 80) =>
    uuid
      ? `https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/${size}`
      : `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`;

  // -------------------------
  // Player list
  // -------------------------
  const renderPlayers = (data) => {
    const mount = qs('#v2-player-list');
    if (!mount) return;

    const hasPlayers =
      data?.online &&
      data?.players?.online > 0 &&
      Array.isArray(data?.players?.list) &&
      data.players.list.length > 0;

    if (!hasPlayers) {
      mount.innerHTML = '<p class="text-sm text-muted">Keine Spieler online.</p>';
      return;
    }

    const players = data.players.list;

    const container = document.createElement('div');
    container.className =
      'flex flex-wrap gap-2 items-center justify-start overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]';

    const label = document.createElement('div');
    label.className = 'text-xs font-medium text-muted mr-2';
    label.textContent = 'Spieler online:';

    container.appendChild(label);

    players.forEach((p) => {
      const uuid = p?.uuid || '';
      const name = p?.name || 'Unbekannt';

      const btn = document.createElement('a');
      btn.href = uuid
        ? `/playerstats?uuid=${encodeURIComponent(uuid)}`
        : `/playerstats?name=${encodeURIComponent(name)}`;
      btn.className =
        'group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm text-fg/90 hover:text-fg hover:bg-surface-solid/70 transition-colors';

      const img = document.createElement('img');
      img.className = 'h-6 w-6 rounded-full';
      img.alt = name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = minotarURL(uuid, name, 48);

      img.addEventListener('error', function onError() {
        const step = Number(img.dataset.fallbackStep || '0');
        if (step === 0) {
          img.dataset.fallbackStep = '1';
          img.src = mcHeadsURL(uuid, name, 48);
          return;
        }
        img.removeEventListener('error', onError);
        img.style.display = 'none';
      });

      const span = document.createElement('span');
      span.textContent = name;

      btn.appendChild(img);
      btn.appendChild(span);
      container.appendChild(btn);
    });

    mount.innerHTML = '';
    mount.appendChild(container);
  };

  const fetchPlayers = async () => {
    const mount = qs('#v2-player-list');
    if (!mount) return;

    if (isFetchInFlight) return;
    isFetchInFlight = true;

    const ip = config.serverIp || 'minecraft-gilde.de';
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderPlayers(data);
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('fetchPlayers Fehler:', err);
      mount.innerHTML = '<p class="text-sm text-muted">Spieleranzeige aktuell nicht verfügbar.</p>';
    } finally {
      window.clearTimeout(timeoutId);
      isFetchInFlight = false;
    }
  };

  // -------------------------
  // World age
  // -------------------------
  const diffInFullMonths = (from, to) => {
    const years = to.getFullYear() - from.getFullYear();
    const months = to.getMonth() - from.getMonth();
    let totalMonths = years * 12 + months;
    if (to.getDate() < from.getDate()) totalMonths--;
    return Math.max(0, totalMonths);
  };

  const formatUnit = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  const renderWorldAge = async () => {
    const el = qs('#v2-world-age');
    if (!el) return;

    const worldStart = new Date(2024, 1, 26); // 26 Feb 2024
    let now = new Date();

    try {
      const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      const dateHeader = response.headers.get('Date');
      if (dateHeader) {
        const parsed = new Date(dateHeader);
        if (!isNaN(parsed.getTime())) now = parsed;
      }
    } catch {
      // fallback to client time
    }

    const totalMonths = diffInFullMonths(worldStart, now);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    const parts = [];
    if (years > 0) parts.push(formatUnit(years, 'Jahr', 'Jahre'));
    parts.push(formatUnit(months, 'Monat', 'Monate'));

    el.textContent = parts.join(' · ');
  };

  // Init
  fetchPlayers();
  renderWorldAge();
  window.setInterval(fetchPlayers, POLL_MS);
})();
