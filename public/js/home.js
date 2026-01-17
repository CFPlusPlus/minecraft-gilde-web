/*
  home.js — Startseiten-spezifische Logik
  -------------------------------------
  Enthält:
  - Spieleranzeige (Polling via mcsrvstat.us) mit try/catch + In-Flight-Guard
  - Weltalter-Berechnung (wenn möglich mit Server-Zeit via Date-Header)

  Voraussetzungen:
  - siteConfig ist in js/script.js definiert.
*/

(() => {
  const POLL_MS = 10_000;
  const FETCH_TIMEOUT_MS = 8_000;

  let isFetchInFlight = false;
  let intervalId = null;

  const qs = (sel, root = document) => root.querySelector(sel);

  const getServerIp = () => {
    try {
      // siteConfig ist global (aus script.js)
      if (typeof siteConfig !== 'undefined' && siteConfig?.server?.ip) {
        return siteConfig.server.ip;
      }
    } catch {
      // noop
    }

    const ipFromDom = qs('.minecraft-server-ip')?.textContent?.trim();
    return ipFromDom || 'minecraft-gilde.de';
  };

  const minotarURL = (uuid, name, size = 100) =>
    uuid
      ? `https://minotar.net/helm/${encodeURIComponent(uuid)}/${size}.png`
      : `https://minotar.net/helm/${encodeURIComponent(name)}/${size}.png`;

  const mcHeadsURL = (uuid, name, size = 100) =>
    uuid
      ? `https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/${size}`
      : `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`;

  const setCentered = (scrollWrapper, container, playerListElement, text) => {
    if (playerListElement) playerListElement.textContent = text;
    scrollWrapper.innerHTML = playerListElement ? playerListElement.outerHTML : text;
    scrollWrapper.style.animation = 'none';
    container.style.justifyContent = 'center';
  };

  const renderPlayers = (data, scrollWrapper, container) => {
    const playerListElement = document.getElementById('player-list');

    const hasPlayers =
      data?.online &&
      data?.players?.online > 0 &&
      Array.isArray(data?.players?.list) &&
      data.players.list.length > 0;

    if (!hasPlayers) {
      setCentered(scrollWrapper, container, playerListElement, 'Keine Spieler online.');
      return;
    }

    let html = `<div class="player-header">Spieler online:</div>`;
    html += data.players.list
      .map((player) => {
        const uuid = player?.uuid || '';
        const name = player?.name || 'Unbekannt';

        return `
        <div class="player" data-uuid="${uuid}" data-name="${name}">
          <img
            class="player-avatar"
            src="${minotarURL(uuid, name, 100)}"
            alt="${name}"
            loading="lazy"
            decoding="async"
          >
          <span class="player-name">${name}</span>
        </div>`;
      })
      .join('');

    scrollWrapper.innerHTML = html;

    // Avatar-Fallback + Endlosschleifen-Schutz:
    // 1) Minotar -> 2) mc-heads -> 3) Bild ausblenden
    scrollWrapper.querySelectorAll('img.player-avatar').forEach((img) => {
      const parent = img.closest('.player');
      const uuid = parent?.dataset.uuid || '';
      const name = parent?.dataset.name || '';

      const primary = minotarURL(uuid, name, 100);
      const secondary = mcHeadsURL(uuid, name, 100);

      img.src = primary;

      img.addEventListener('error', function onError() {
        const step = Number(img.dataset.fallbackStep || '0');

        if (step === 0) {
          img.dataset.fallbackStep = '1';
          img.src = secondary;
          return;
        }

        img.removeEventListener('error', onError);
        img.style.display = 'none';
      });
    });

    // Klickbare Spieler -> Weiterleitung zur Statistik
    scrollWrapper.querySelectorAll('.player').forEach((el) => {
      el.addEventListener('click', () => {
        const uuid = el.dataset.uuid;
        const name = el.dataset.name;

        if (uuid) {
          window.location.href = `playerstats.html?uuid=${encodeURIComponent(uuid)}`;
        } else if (name) {
          window.location.href = `playerstats.html?name=${encodeURIComponent(name)}`;
        }
      });
    });

    // Breitenmessung / Scroll-Animation
    const containerWidth = container.offsetWidth;
    const contentWidth = scrollWrapper.scrollWidth;

    if (contentWidth > containerWidth) {
      scrollWrapper.style.animation = `scroll ${contentWidth / 30}s linear infinite`;
      container.style.justifyContent = 'flex-start';
    } else {
      scrollWrapper.style.animation = 'none';
      container.style.justifyContent = 'center';
    }
  };

  const fetchPlayers = async () => {
    const scrollWrapper = document.getElementById('scroll-wrapper');
    const container = document.querySelector('.player-container');
    if (!scrollWrapper || !container) return;

    // In-Flight-Guard: keine überlappenden Requests
    if (isFetchInFlight) return;
    isFetchInFlight = true;

    const serverIP = getServerIp();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(serverIP)}`;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      renderPlayers(data, scrollWrapper, container);
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('fetchPlayers Fehler:', err);
      const playerListElement = document.getElementById('player-list');
      setCentered(
        scrollWrapper,
        container,
        playerListElement,
        'Spieleranzeige aktuell nicht verfügbar.',
      );
    } finally {
      window.clearTimeout(timeoutId);
      isFetchInFlight = false;
    }
  };

  // -------------------------
  // Weltalter
  // -------------------------
  const diffInFullMonths = (from, to) => {
    const years = to.getFullYear() - from.getFullYear();
    const months = to.getMonth() - from.getMonth();
    let totalMonths = years * 12 + months;

    if (to.getDate() < from.getDate()) totalMonths--;
    return Math.max(0, totalMonths);
  };

  const formatMitEinheit = (wert, singular, plural) => `${wert} ${wert === 1 ? singular : plural}`;

  const renderWorldAge = async () => {
    const span = document.getElementById('world-age');
    if (!span) return;

    const worldStart = new Date(2024, 1, 26); // 26. Feb 2024 (Monatsindex 1 = Feb)
    let now = new Date(); // Fallback: Clientzeit

    try {
      const response = await fetch(window.location.href, {
        method: 'HEAD',
        cache: 'no-store',
      });
      const dateHeader = response.headers.get('Date');

      if (dateHeader) {
        const parsed = new Date(dateHeader);
        if (!isNaN(parsed.getTime())) {
          now = parsed;
        } else {
          console.warn('Date-Header vorhanden, aber konnte nicht geparst werden:', dateHeader);
        }
      } else {
        console.warn('Kein Date-Header im Response; nutze Client-Zeit.');
      }
    } catch (err) {
      console.warn('Fehler beim Laden des Server-Headers — benutze Client-Zeit. Fehler:', err);
    }

    const totalMonths = diffInFullMonths(worldStart, now);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    const jahreText = formatMitEinheit(years, 'Jahr', 'Jahren');
    const monateText = formatMitEinheit(months, 'Monat', 'Monaten');

    span.textContent = months === 0 ? jahreText : `${jahreText} und ${monateText}`;
  };

  const start = () => {
    // Spieleranzeige
    fetchPlayers();
    intervalId = window.setInterval(fetchPlayers, POLL_MS);

    // Beim Zurückkehren auf den Tab einmal aktualisieren
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) fetchPlayers();
    });

    // Weltalter
    renderWorldAge();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
