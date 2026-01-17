(function () {
  // --- UUID-Utils ---
  function compactUUID(s) {
    // "550e8400-e29b..." -> "550e8400e29b..."
    return String(s || '')
      .toLowerCase()
      .replace(/[^0-9a-f]/g, '');
  }
  function prettyUUID(c32) {
    // "550e8400e29b41d4a716446655440000" -> mit Bindestrichen
    if (c32.length !== 32) return c32;
    return `${c32.slice(0, 8)}-${c32.slice(8, 12)}-${c32.slice(12, 16)}-${c32.slice(16, 20)}-${c32.slice(20)}`;
  }
  function resolveUuidFromParam(param, allObj) {
    const want = compactUUID(param);
    if (!want) return null;

    // 1) exakter Treffer (kompakt, 32 Zeichen)
    const exact = Object.keys(allObj).find((full) => compactUUID(full) === want);
    if (exact) return exact;

    // 2) Präfix-Treffer (gekürzt, z. B. 8+ Zeichen empfohlen)
    const matches = Object.keys(allObj).filter((full) => compactUUID(full).startsWith(want));
    if (matches.length === 1) return matches[0];

    // 3) nicht eindeutig oder nichts gefunden
    return { ambiguous: matches }; // signalisiert Mehrdeutigkeit
  }

  const qp = new URLSearchParams(location.search);
  const uuidParam = (qp.get('uuid') || '').trim();
  const uuid = uuidParam;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
    for (const c of children) el.append(c);
    return el;
  }
  function nf(x) {
    return new Intl.NumberFormat('de-DE').format(x);
  }
  function nf2(x) {
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(x);
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      document.getElementById('filter').dispatchEvent(new Event('input'));
    });
  });

  // --- i18n: Übersetzungen ----------------------------------------------------
  let I18N_DE = true; // Start: Deutsch
  let TRANSLATIONS = { stats: {}, items: {}, mobs: {}, words: {} };

  // JSON laden
  async function loadTranslations() {
    try {
      const res = await fetch('/js/translations.de.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      TRANSLATIONS = await res.json();
      console.log('i18n geladen:', TRANSLATIONS);
    } catch (e) {
      console.warn('Konnte Übersetzungen nicht laden:', e);
    }
  }

  // --- Prüfroutine: Zeigt IDs ohne Übersetzung in der Konsole -----------------
  function checkMissingTranslations(stats) {
    if (!stats) return;
    const missing = { stats: new Set(), items: new Set(), mobs: new Set() };

    // Stats
    if (stats['minecraft:custom']) {
      for (const key of Object.keys(stats['minecraft:custom'])) {
        if (!TRANSLATIONS.stats?.[key]) {
          missing.stats.add(key);
        }
      }
    }

    // Items
    const itemSections = [
      'minecraft:used',
      'minecraft:mined',
      'minecraft:crafted',
      'minecraft:dropped',
      'minecraft:picked_up',
      'minecraft:broken',
      'minecraft:placed',
    ];
    for (const sec of itemSections) {
      if (stats[sec]) {
        for (const key of Object.keys(stats[sec])) {
          if (!TRANSLATIONS.items?.[key]) {
            missing.items.add(key);
          }
        }
      }
    }

    // Mobs
    const mobSections = ['minecraft:killed', 'minecraft:killed_by'];
    for (const sec of mobSections) {
      if (stats[sec]) {
        for (const key of Object.keys(stats[sec])) {
          if (!TRANSLATIONS.mobs?.[key]) {
            missing.mobs.add(key);
          }
        }
      }
    }

    console.group('Übersetzungsprüfung');
    console.info('Fehlende Stats:', [...missing.stats]);
    console.info('Fehlende Items:', [...missing.items]);
    console.info('Fehlende Mobs:', [...missing.mobs]);
    console.groupEnd();
  }

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // Fallback: einfach das Original anzeigen
  function tLabel(rawId, kind) {
    if (!I18N_DE) {
      return rawId.replace(/^minecraft:/, '').replaceAll('_', ' ');
    }
    if (kind === 'stat' && TRANSLATIONS.stats?.[rawId]) return TRANSLATIONS.stats[rawId];
    if (kind === 'item' && TRANSLATIONS.items?.[rawId]) return TRANSLATIONS.items[rawId];
    if (kind === 'mob' && TRANSLATIONS.mobs?.[rawId]) return TRANSLATIONS.mobs[rawId];
    // Fallback: Original anzeigen
    return rawId.replace(/^minecraft:/, '').replaceAll('_', ' ');
  }

  // Button verdrahten & Übersetzungen laden
  window.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();

    const btn = document.getElementById('i18n-toggle');
    if (!btn) return;

    const applyState = () => {
      const labelSpan = btn.querySelector('.label');
      if (labelSpan) {
        labelSpan.textContent = I18N_DE ? 'DE' : 'EN';
      }
      btn.setAttribute('aria-pressed', String(I18N_DE));
    };
    applyState();

    btn.addEventListener('click', () => {
      I18N_DE = !I18N_DE;
      applyState();

      // Tabellen neu zeichnen, ohne erneut zu fetchen
      if (window.__statsCache) {
        buildGeneral(window.__statsCache);
        buildItems(window.__statsCache);
        buildMobs(window.__statsCache);
        document.getElementById('filter')?.dispatchEvent(new Event('input'));
      } else {
        // Fallback: nachladen
        (async () => {
          try {
            await loadAll();
          } catch (e) {}
        })();
      }
    });
    try {
      await loadAll();
    } catch (e) {
      console.error(e);
    }
  });

  async function loadAll() {
    const qp = new URLSearchParams(location.search);
    const uuidParam = (qp.get('uuid') || '').trim();

    if (!uuidParam) {
      document.getElementById('player-name').textContent = 'Keine UUID übergeben';
      document.getElementById('player-uuid').textContent = '';
      return;
    }

    const res = await fetch(`api/player?uuid=${encodeURIComponent(uuidParam)}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const generated = data.__generated || null;
    const uuidFull = data.uuid || uuidParam;
    const found = data.found !== false && !!data.player;

    if (!found) {
      alert(
        'Die übergebene UUID ist unbekannt.\n\nMögliche Ursachen:\n' +
          '- Der Spieler hat noch nie auf der Minecraft Gilde gespielt\n' +
          '- Der Spieler hat weniger als eine Stunde in der Minecraft Gilde gespielt\n' +
          '- Die UUID ist ungültig',
      );
      document.getElementById('player-name').textContent = 'Unbekannte UUID';
      document.getElementById('player-uuid').textContent = uuidParam;
      return;
    }

    const stats = data.player;
    window.__statsCache = stats;
    checkMissingTranslations(stats);

    const name = data.name || uuidFull;
    document.getElementById('player-name').textContent = name;
    document.getElementById('player-uuid').textContent = uuidFull;

    // Breite der UUID-Pille messen und fixieren, damit "Kopiert!" nicht springt
    const uuidEl = document.getElementById('player-uuid');
    requestAnimationFrame(() => {
      const w = uuidEl.getBoundingClientRect().width;
      uuidEl.style.minWidth = Math.ceil(w) + 'px';
    });

    document.title = `Minecraft Gilde - Spielerstatistik von ${name}`;

    const img = document.getElementById('player-skin');
    if (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener(
        'click',
        async () => {
          const mod = await import('/js/skin-modal.js'); // lazy
          mod.openSkinModal(); // exportierte Funktion aufrufen
        },
        { passive: true },
      );

      // Minotar kann i. d. R. Name ODER UUID (ohne Bindestriche)
      const skinId = name && name !== uuidFull ? name : compactUUID(uuidFull);
      const png = `https://minotar.net/helm/${encodeURIComponent(skinId)}/512.png`;
      const fallback = `https://mc-heads.net/avatar/${encodeURIComponent(skinId)}/512`;

      img.src = png;
      img.alt = name;
      img.onerror = () => {
        img.onerror = null;
        img.src = fallback;
      };
    }

    if (generated) {
      const ts = new Date(generated);
      document.getElementById('generated-ts').textContent = `Stand: ${ts.toLocaleString('de-DE')}`;
    }

    buildGeneral(stats);
    buildItems(stats);
    buildMobs(stats);
  }

  function buildGeneral(stats) {
    const tbody = document.querySelector('#tbl-general tbody');
    tbody.innerHTML = '';

    const custom = stats['minecraft:custom'] || {};

    // Alle Keys, die in Stunden (aus Ticks) angezeigt werden sollen
    const HOUR_KEYS = new Set([
      'minecraft:play_time',
      'minecraft:sneak_time',
      'minecraft:time_since_death',
      'minecraft:time_since_rest',
      'minecraft:total_world_time',
    ]);

    const rows = Object.entries(custom)
      .map(([raw, value]) => {
        // Label wie bisher: Namespace weg + Unterstriche zu Leerzeichen
        const label = tLabel(raw, 'stat');

        let display;
        if (HOUR_KEYS.has(raw)) {
          // 20 Ticks = 1 Sekunde → 3600*20 = 72000 Ticks pro Stunde
          display = nf2(value / 72000) + ' h';
        } else if (raw.endsWith('_one_cm')) {
          display = nf2(value / 100000) + ' km';
        } else {
          display = nf(value);
        }

        return { raw, label, value, display };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));

    for (const r of rows) {
      const tr = h(
        'tr',
        {},
        h('td', {}, r.label),
        h('td', {}, r.display),
        h('td', { class: 'muted' }, r.raw),
      );
      tbody.appendChild(tr);
    }
  }

  function buildItems(stats) {
    const tbody = document.querySelector('#tbl-items tbody');
    tbody.innerHTML = '';
    const mined = stats['minecraft:mined'] || {};
    const broken = stats['minecraft:broken'] || {};
    const crafted = stats['minecraft:crafted'] || {};
    const used = stats['minecraft:used'] || {};
    const picked = stats['minecraft:picked_up'] || {};
    const dropped = stats['minecraft:dropped'] || {};
    const keys = new Set([
      ...Object.keys(mined),
      ...Object.keys(broken),
      ...Object.keys(crafted),
      ...Object.keys(used),
      ...Object.keys(picked),
      ...Object.keys(dropped),
    ]);
    const rows = [...keys]
      .map((k) => ({
        key: k,
        label: tLabel(k, 'item'),
        mined: mined[k] || 0,
        broken: broken[k] || 0,
        crafted: crafted[k] || 0,
        used: used[k] || 0,
        picked_up: picked[k] || 0,
        dropped: dropped[k] || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
    for (const r of rows) {
      const tr = h(
        'tr',
        {},
        h('td', {}, r.label),
        h('td', {}, nf(r.mined)),
        h('td', {}, nf(r.broken)),
        h('td', {}, nf(r.crafted)),
        h('td', {}, nf(r.used)),
        h('td', {}, nf(r.picked_up)),
        h('td', {}, nf(r.dropped)),
      );
      tbody.appendChild(tr);
    }
  }

  function buildMobs(stats) {
    const tbody = document.querySelector('#tbl-mobs tbody');
    tbody.innerHTML = '';
    const killed = stats['minecraft:killed'] || {};
    const killedBy = stats['minecraft:killed_by'] || {};
    const keys = new Set([...Object.keys(killed), ...Object.keys(killedBy)]);
    const rows = [...keys]
      .map((k) => ({
        key: k,
        label: tLabel(k, 'mob'),
        killed: killed[k] || 0,
        killed_by: killedBy[k] || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
    for (const r of rows) {
      const tr = h(
        'tr',
        {},
        h('td', {}, r.label),
        h('td', {}, nf(r.killed)),
        h('td', {}, nf(r.killed_by)),
      );
      tbody.appendChild(tr);
    }
  }

  // Suche
  (function () {
    const filterInput = document.getElementById('filter');

    // Normalisierung: Kleinschreibung + Whitespace zusammenfassen
    function norm(s) {
      return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    filterInput.oninput = (e) => {
      // Alle Anführungszeichen vereinheitlichen, z. B. „foo“ → "foo"
      const raw = String(e.target.value).replace(/[“”„‟«»‚‛’"]/g, '"');

      // Kommagetrennte ODER-Begriffe parsen (+ exakte Begriffe in "")
      const queries = raw
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean)
        .map(
          (q) =>
            q.startsWith('"') && q.endsWith('"') && q.length > 1
              ? { type: 'exact', value: norm(q.slice(1, -1)) } // "genau"
              : { type: 'partial', value: norm(q) }, // Teilwort
        );

      // Aktives Tab ermitteln
      const activePanel = document.querySelector('.tab-panel.active');
      const rows = activePanel.querySelectorAll('tbody tr');
      const noResults = activePanel.querySelector('.no-results');

      // Leere Eingabe → alles zeigen, Meldung aus
      if (queries.length === 0) {
        rows.forEach((tr) => (tr.style.display = ''));
        if (noResults) noResults.style.display = 'none';
        return;
      }

      // Zeilen filtern
      rows.forEach((tr) => {
        const label = norm(tr.cells[0]?.textContent); // nur 1. Spalte fürs "exakt"
        const wholeRow = norm(tr.textContent); // ganze Zeile für Teilwort

        const match = queries.some((q) =>
          q.type === 'exact' ? label === q.value : wholeRow.includes(q.value),
        );

        tr.style.display = match ? '' : 'none';
      });

      // Meldung ein/aus
      const anyVisible = Array.from(rows).some((tr) => tr.style.display !== 'none');
      if (noResults) noResults.style.display = anyVisible ? 'none' : 'flex';
    };
  })();

  // Sortier-Logik
  (function () {
    const SORT_STATES = ['none', 'asc', 'desc'];
    const NUMERIC_KEYS = new Set([
      'value',
      'mined',
      'broken',
      'crafted',
      'used',
      'picked_up',
      'dropped',
      'killed',
      'killed_by',
    ]);

    function getColType(th) {
      const key = th.dataset.key || '';
      return NUMERIC_KEYS.has(key) ? 'number' : 'string';
    }

    function normalizeNumber(s) {
      // zieht 1. Zahl aus "1.234,56 h", "12 km" etc. und normiert auf JS-Format
      const m = String(s).match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/);
      if (!m) return 0;
      const canon = m[0].replace(/\./g, '').replace(',', '.');
      const val = parseFloat(canon);
      return Number.isFinite(val) ? val : 0;
    }

    function compare(a, b, type, dir) {
      if (type === 'number') {
        return (normalizeNumber(a) - normalizeNumber(b)) * dir;
      }
      return a.localeCompare(b, 'de') * dir;
    }

    function applySort(table, colIndex, state) {
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      let sorted;

      if (state === 'none') {
        // Default: alphabetisch nach erster Spalte (entspricht deinen build*-Defaults)
        sorted = rows.sort((r1, r2) =>
          r1.cells[0].textContent.trim().localeCompare(r2.cells[0].textContent.trim(), 'de'),
        );
      } else {
        const dir = state === 'asc' ? 1 : -1;
        const th = table.querySelector(`thead th:nth-child(${colIndex + 1})`);
        const type = getColType(th);
        sorted = rows.sort((r1, r2) =>
          compare(
            r1.cells[colIndex].textContent.trim(),
            r2.cells[colIndex].textContent.trim(),
            type,
            dir,
          ),
        );
      }

      // vorherige Hervorhebung löschen
      table.querySelectorAll('tbody td').forEach((td) => td.classList.remove('sorted'));

      tbody.innerHTML = '';
      sorted.forEach((r) => {
        // nur wenn aktiv sortiert → Highlight
        if (state !== 'none') {
          r.cells[colIndex].classList.add('sorted');
        }
        tbody.appendChild(r);
      });
    }

    document.querySelectorAll('table.player-table').forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th'));

      // Initial: Originaltitel merken & Cursor setzen
      headers.forEach((th) => {
        th.dataset.title = th.textContent.replace(/\s*[▲▼]\s*$/, '');
        th.dataset.sort = 'none';
        th.style.cursor = 'pointer';
      });

      // Klick-Handler
      headers.forEach((th, idx) => {
        th.addEventListener('click', () => {
          const current = th.dataset.sort || 'none';
          const next = SORT_STATES[(SORT_STATES.indexOf(current) + 1) % SORT_STATES.length];

          // Alle Header dieses Tisches zurücksetzen
          headers.forEach((h) => {
            h.dataset.sort = 'none';
            h.textContent = h.dataset.title;
          });

          // Symbol nur beim aktiven Header setzen
          if (next !== 'none') {
            th.dataset.sort = next;
            th.innerHTML =
              th.dataset.title +
              (next === 'asc'
                ? ' <i class="fa-solid fa-sort-up"></i>'
                : ' <i class="fa-solid fa-sort-down"></i>');
          } else {
            th.innerHTML = th.dataset.title;
          }

          applySort(table, idx, next);
        });
      });
    });
  })();

  // UUID-Kopie-Funktion
  (function () {
    const uuidEl = document.getElementById('player-uuid');
    if (!uuidEl) return;

    uuidEl.addEventListener('click', () => {
      const uuid = (uuidEl.textContent || '').trim();
      if (!uuid) return;

      navigator.clipboard
        .writeText(uuid)
        .then(() => {
          // kurze Rückmeldung im Text
          const oldText = uuidEl.textContent;
          uuidEl.textContent = 'Kopiert!';
          setTimeout(() => {
            uuidEl.textContent = oldText;
          }, 1200);
        })
        .catch((err) => {
          console.error('Konnte UUID nicht kopieren:', err);
        });
    });
  })();
})();
