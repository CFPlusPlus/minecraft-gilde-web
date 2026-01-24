/*
  stats.js – Statistik-Seite (Tabs + Lazy Loading)
  Ziele:
  - Sehr leichtgewichtig im Frontend (100k+ Spieler)
  - Keine Summen/Leaderboards "im Browser" bauen
  - Ranglisten werden pro Metric erst beim Öffnen geladen
*/

document.addEventListener('DOMContentLoaded', () => {
  const KPI_METRICS = ['hours', 'distance', 'mob_kills', 'creeper'];

  // --- DOM ---
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

  const playerCountEl = document.getElementById('player-count');
  const generatedEl = document.getElementById('generated-ts');

  const apiErrorBox = document.getElementById('api-error');
  const apiErrorText = document.getElementById('api-error-text');

  const kpiGrid = document.getElementById('kpi-grid');
  const metricsContainer = document.getElementById('metrics-container');
  const noResultsWarning = document.getElementById('no-results-warning');
  const metricFilterIn = document.getElementById('metric-filter');
  const pageSizeSel = document.getElementById('page-size');
  const pageSizeTrigger = document.getElementById('page-size-trigger');
  const pageSizeMenu = document.getElementById('page-size-menu');
  const pageSizeLabel = document.getElementById('page-size-label');

  const kingTbody = document.querySelector('#tbl-king tbody');
  const kingWrapper = document.getElementById('wrapper-king');
  const kingPaginationEl = document.getElementById('king-pagination');

  const searchInput = document.getElementById('search-name');
  const autocompleteList = document.getElementById('autocomplete-list');
  const autocompleteContainer = document.getElementById('autocomplete-container');

  const welcomeBox = document.getElementById('welcome-box');

  // --- State ---
  let metricDefs = null; // { id: {label, category, unit, sort_order, divisor, decimals} }
  let generatedISO = null;
  const playerNames = Object.create(null); // uuid-dashed -> name

  // metricId -> state
  // {
  //   loaded, pages: [ [ {uuid,value}, ... ], ... ], currentPage,
  //   nextCursor, hasMore, tbody, wrapper, pager, detailsEl
  // }
  const metricStates = new Map();

  const kingState = {
    metricId: 'king',
    loaded: false,
    pages: [],
    currentPage: 0,
    nextCursor: null,
    hasMore: false,
    wrapper: kingWrapper,
    tbody: kingTbody,
    pager: null,
  };

  // --- Utils ---
  const debounce = (fn, ms = 180) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const fmtDateBerlin = (iso) => {
    try {
      return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const fmtNumber = (value, decimals) => {
    const d = typeof decimals === 'number' ? decimals : null;
    const nf = new Intl.NumberFormat(
      'de-DE',
      d === null ? undefined : { minimumFractionDigits: d, maximumFractionDigits: d },
    );
    return nf.format(value);
  };

  const formatMetricValue = (value, def) => {
    const unit = def?.unit || '';

    // decimals aus metric_def – falls nicht gesetzt: heuristische Defaults
    let dec = def?.decimals;
    if (dec === null || dec === undefined) {
      if (unit === 'h' || unit === 'km') dec = 2;
      else dec = 0;
    }
    return unit ? `${fmtNumber(value, dec)} ${unit}` : fmtNumber(value, dec);
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  // --- Page size dropdown (custom UI, hidden <select> keeps existing behaviour) ---
  const setPageSizeUi = (value) => {
    const v = String(value || '10');
    if (pageSizeLabel) pageSizeLabel.textContent = v;
    if (!pageSizeMenu) return;
    const opts = Array.from(pageSizeMenu.querySelectorAll('.page-size-opt'));
    opts.forEach((b) => {
      const active = b.dataset.value === v;
      b.classList.toggle('bg-accent/10', active);
      b.classList.toggle('text-accent', active);
      b.classList.toggle('text-fg/90', !active);
    });
  };

  const closePageSizeMenu = () => {
    if (!pageSizeMenu) return;
    pageSizeMenu.classList.add('hidden');
    pageSizeTrigger?.setAttribute('aria-expanded', 'false');
  };

  const togglePageSizeMenu = () => {
    if (!pageSizeMenu) return;
    const nextOpen = pageSizeMenu.classList.contains('hidden');
    pageSizeMenu.classList.toggle('hidden', !nextOpen);
    pageSizeTrigger?.setAttribute('aria-expanded', String(nextOpen));
  };

  // init
  if (pageSizeSel) setPageSizeUi(pageSizeSel.value || '10');

  pageSizeTrigger?.addEventListener('click', (e) => {
    e.preventDefault();
    togglePageSizeMenu();
  });

  pageSizeMenu?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.page-size-opt');
    if (!btn || !pageSizeSel) return;
    const v = btn.dataset.value;
    if (!v) return;
    pageSizeSel.value = v;
    setPageSizeUi(v);
    closePageSizeMenu();
    pageSizeSel.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.addEventListener('click', (e) => {
    const within =
      e.target &&
      (e.target.closest?.('#page-size-trigger') || e.target.closest?.('#page-size-menu'));
    if (!within) closePageSizeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closePageSizeMenu();
  });

  // --- User-visible Error Banner ---
  let apiErrorActive = false;
  const showApiError = (message) => {
    if (!apiErrorBox || !apiErrorText) return;
    apiErrorText.textContent = message || 'Ein Fehler ist aufgetreten.';
    apiErrorBox.classList.remove('hidden');
    apiErrorActive = true;
  };

  const clearApiError = () => {
    if (!apiErrorBox || !apiErrorText) return;
    if (!apiErrorActive) return;
    apiErrorBox.classList.add('hidden');
    apiErrorText.textContent = '';
    apiErrorActive = false;
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const mergePlayers = (playersObj) => {
    if (!playersObj) return;
    for (const [uuid, name] of Object.entries(playersObj)) {
      if (!playerNames[uuid] && typeof name === 'string') playerNames[uuid] = name;
    }
  };

  const getPlayerName = (uuid) => playerNames[uuid] || uuid;

  const createTableLoading = (wrapperEl) => {
    if (!wrapperEl) return () => {};
    const overlay = document.createElement('div');
    overlay.className =
      'absolute inset-0 flex items-center justify-center rounded-[var(--radius)] bg-black/20 backdrop-blur-md pointer-events-none';
    overlay.innerHTML =
      '<div class="bg-surface border-border text-fg/90 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur-md">Lädt…</div>';
    wrapperEl.appendChild(overlay);
    return () => {
      overlay.remove();
    };
  };

  const renderRow = ({ tbody, rank, uuid, value, def }) => {
    const name = getPlayerName(uuid);
    let rankHtml = String(rank);
    if (rank === 1)
      rankHtml =
        '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold">1</span>';
    else if (rank === 2)
      rankHtml =
        '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-solid/60 text-fg font-semibold">2</span>';
    else if (rank === 3)
      rankHtml =
        '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-solid/60 text-fg font-semibold">3</span>';

    const size = 32;
    const imgUrl = `https://minotar.net/helm/${encodeURIComponent(name)}/${size}.png`;

    const tr = document.createElement('tr');
    tr.dataset.uuid = uuid;
    tr.innerHTML = `
      <td class="whitespace-nowrap">${rankHtml}</td>
      <td>
        <div class="flex items-center gap-2">
          <img class="h-8 w-8 rounded-lg bg-black/20" src="${imgUrl}" alt="${escapeHtml(name)}" loading="lazy" />
          <button type="button" class="player-name text-fg hover:text-accent font-semibold transition-colors">${escapeHtml(name)}</button>
        </div>
      </td>
      <td class="whitespace-nowrap">${escapeHtml(formatMetricValue(value, def))}</td>
    `;
    tbody.appendChild(tr);

    const clickTarget = tr.querySelector('.player-name');
    clickTarget?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `/statistiken/spieler/?uuid=${encodeURIComponent(uuid)}`;
    });
  };

  const setGenerated = (iso) => {
    if (!iso) return;
    // nur einmal setzen (erste Quelle gewinnt)
    if (!generatedISO) generatedISO = iso;
    const shown = fmtDateBerlin(generatedISO);
    if (generatedEl) {
      generatedEl.textContent = `Stand: ${shown}`;
      generatedEl.title = `Datenbank aktualisiert (UTC): ${generatedISO}`;
    }
  };

  // --- Tabs + Hash routing ---
  const hashToTabId = {
    uebersicht: 'tab-uebersicht',
    king: 'tab-king',
    ranglisten: 'tab-ranglisten',
    versus: 'tab-versus',
  };

  const activateTab = (tabId, { updateHash = true } = {}) => {
    const setBtnState = (b, active) => {
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
      // Tabs are styled as an underline-nav (no pill background).
      b.classList.toggle('text-fg', active);
      b.classList.toggle('border-accent', active);
      b.classList.toggle('text-muted', !active);
      b.classList.toggle('border-transparent', !active);
    };

    tabButtons.forEach((b) => setBtnState(b, b.dataset.tab === tabId));
    tabPanels.forEach((p) => {
      const active = p.id === tabId;
      p.classList.toggle('active', active);
      p.classList.toggle('hidden', !active);
    });

    const btn = tabButtons.find((b) => b.dataset.tab === tabId);
    const hash = btn?.dataset.hash;
    if (updateHash && hash) {
      const next = `#${hash}`;
      if (window.location.hash !== next) {
        history.replaceState(null, '', next);
      }
    }

    // Lazy loading hooks
    if (tabId === 'tab-king') ensureKingLoaded();
    if (tabId === 'tab-ranglisten') ensureMetricsRendered();
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  window.addEventListener('hashchange', () => {
    const h = (window.location.hash || '').replace('#', '').trim().toLowerCase();
    const tabId = hashToTabId[h] || 'tab-uebersicht';
    activateTab(tabId, { updateHash: false });
  });

  // --- Autocomplete (Spielersuche) ---
  let acItems = [];
  let acSelected = -1;

  const closeAutocomplete = () => {
    acItems = [];
    acSelected = -1;
    if (autocompleteContainer) autocompleteContainer.classList.add('hidden');
    if (autocompleteList) {
      autocompleteList.innerHTML = '';
    }
  };

  const renderAutocomplete = (items) => {
    acItems = items || [];
    acSelected = -1;
    if (!autocompleteList) return;
    autocompleteList.innerHTML = '';

    // Sichtbarkeit steuern
    if (autocompleteContainer) autocompleteContainer.classList.toggle('hidden', !acItems.length);

    for (let i = 0; i < acItems.length; i++) {
      const it = acItems[i];
      const li = document.createElement('li');
      li.className =
        'cursor-pointer px-3 py-2 text-sm text-fg/90 hover:bg-surface-solid/60 transition-colors flex items-center gap-2';
      li.innerHTML = `<span class="h-2 w-2 rounded-full bg-accent/70" aria-hidden="true"></span><span class="min-w-0 truncate">${escapeHtml(it.name)}</span>`;
      li.addEventListener('mousedown', (e) => {
        // mousedown statt click, damit input blur nicht vorher alles schließt
        e.preventDefault();
        window.location.href = `/statistiken/spieler/?uuid=${encodeURIComponent(it.uuid)}`;
      });
      autocompleteList.appendChild(li);
    }
  };

  const fetchAutocomplete = debounce(async () => {
    const q = (searchInput?.value || '').trim();
    if (!searchInput) return;
    if (q.length < 2) {
      closeAutocomplete();
      return;
    }
    try {
      const data = await fetchJson(`/api/players?q=${encodeURIComponent(q)}&limit=6`);
      setGenerated(data.__generated);
      const items = Array.isArray(data.items) ? data.items : [];
      renderAutocomplete(items);
      clearApiError();
    } catch (e) {
      console.warn('Autocomplete Fehler', e);
      showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
      closeAutocomplete();
    }
  }, 150);

  searchInput?.addEventListener('input', fetchAutocomplete);

  searchInput?.addEventListener('keydown', (e) => {
    if (!acItems.length) {
      if (e.key === 'Enter') {
        // Fallback: wenn jemand UUID reinkopiert
        const raw = (searchInput.value || '').trim();
        if (/^[0-9a-fA-F-]{32,36}$/.test(raw)) {
          window.location.href = `/statistiken/spieler/?uuid=${encodeURIComponent(raw)}`;
        }
      }
      return;
    }

    const lis = Array.from(autocompleteList?.querySelectorAll('li') || []);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acSelected = Math.min(acSelected + 1, acItems.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acSelected = Math.max(acSelected - 1, 0);
    } else if (e.key === 'Escape') {
      closeAutocomplete();
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = acItems[Math.max(acSelected, 0)];
      if (chosen)
        window.location.href = `/statistiken/spieler/?uuid=${encodeURIComponent(chosen.uuid)}`;
      return;
    } else {
      return;
    }

    lis.forEach((li, idx) => {
      const sel = idx === acSelected;
      li.classList.toggle('bg-surface-solid/60', sel);
      li.classList.toggle('text-fg', sel);
    });
  });

  document.addEventListener('click', (e) => {
    const within =
      e.target &&
      (e.target.closest?.('#main-search') || e.target.closest?.('#autocomplete-container'));
    if (!within) closeAutocomplete();
  });

  // --- Overview: KPI Skeleton + Load ---
  const renderKpiSkeleton = () => {
    if (!kpiGrid) return;

    const icon = (metricId) => {
      const base =
        'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"';

      switch (metricId) {
        case 'hours':
          return `<svg ${base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>`;
        case 'distance':
          return `<svg ${base}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h6a4 4 0 0 1 4 4v6" /></svg>`;
        case 'mob_kills':
          return `<svg ${base}><circle cx="12" cy="12" r="7" /><path d="M12 3v2" /><path d="M12 19v2" /><path d="M3 12h2" /><path d="M19 12h2" /><path d="M12 10v4" /><path d="M10 12h4" /></svg>`;
        case 'creeper':
          return `<svg ${base}><path d="M13 2 3 14h8l-1 8 10-12h-8z" /></svg>`;
        default:
          return `<svg ${base}><circle cx="12" cy="12" r="9" /></svg>`;
      }
    };

    kpiGrid.innerHTML = '';
    for (const m of KPI_METRICS) {
      const card = document.createElement('div');
      card.className =
        'bg-surface border-border flex items-center justify-between rounded-[var(--radius)] border p-4 shadow-sm backdrop-blur-md';
      card.classList.add('kpi-card');
      card.dataset.metric = m;
      card.innerHTML = `
        <div>
          <div class="kpi-label text-muted text-xs font-medium">${escapeHtml(m)}</div>
          <div class="kpi-value text-fg mt-1 text-xl font-semibold">…</div>
        </div>
        <div class="bg-accent/15 text-accent flex h-9 w-9 items-center justify-center rounded-xl" aria-hidden="true">
          ${icon(m)}
        </div>
      `;
      kpiGrid.appendChild(card);
    }
  };

  const updateKpi = (totals) => {
    if (!kpiGrid || !metricDefs) return;
    for (const m of KPI_METRICS) {
      const card = kpiGrid.querySelector(`.kpi-card[data-metric="${CSS.escape(m)}"]`);
      if (!card) continue;
      const def = metricDefs[m];
      const label = def?.label || m;
      const valueEl = card.querySelector('.kpi-value');
      const labelEl = card.querySelector('.kpi-label');
      if (labelEl) labelEl.textContent = label;
      if (valueEl) {
        const v = totals && Object.prototype.hasOwnProperty.call(totals, m) ? totals[m] : null;
        valueEl.textContent = v === null || v === undefined ? '–' : formatMetricValue(v, def);
      }
    }
  };

  const loadMetrics = async () => {
    const data = await fetchJson('/api/metrics');
    metricDefs = data.metrics || {};
    setGenerated(data.__generated);
    return metricDefs;
  };

  const loadSummary = async () => {
    const q = KPI_METRICS.join(',');
    const data = await fetchJson(`/api/summary?metrics=${encodeURIComponent(q)}`);
    setGenerated(data.__generated);

    if (typeof data.player_count === 'number' && playerCountEl) {
      const nf = new Intl.NumberFormat('de-DE');
      playerCountEl.textContent = `Spieler: ${nf.format(data.player_count)}`;
    }

    updateKpi(data.totals || {});
  };

  // --- Ranglisten: Render Categories + Lazy Load per Metric ---
  const categoryLabel = (cat) => {
    if (!cat) return 'Sonstiges';
    return cat;
  };

  const ensureMetricsRendered = async () => {
    if (!metricsContainer) return;
    if (!metricDefs) {
      try {
        await loadMetrics();
        clearApiError();
      } catch (e) {
        console.error(e);
        showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
        return;
      }
    }
    if (!metricDefs) return;
    if (metricsContainer.dataset.ready === '1') return;

    // group by category
    const groups = new Map();
    for (const [id, def] of Object.entries(metricDefs)) {
      if (!def || !def.label) continue;
      if (id === 'king') continue; // eigener Tab
      const cat = categoryLabel(def.category);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push({ id, def });
    }

    // sort categories by name, metrics by sort_order then id
    const sortedCats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'de'));

    metricsContainer.innerHTML = '';
    for (const cat of sortedCats) {
      const items = groups.get(cat) || [];
      items.sort((a, b) => {
        const sa = Number.isFinite(a.def.sort_order) ? a.def.sort_order : 999999;
        const sb = Number.isFinite(b.def.sort_order) ? b.def.sort_order : 999999;
        if (sa !== sb) return sa - sb;
        return a.id.localeCompare(b.id);
      });

      const groupEl = document.createElement('details');
      // Kein Accent-Rahmen um die Kategorie: nur Inhalt (Tabelle) leicht umranden.
      groupEl.className =
        'metric-group bg-surface rounded-[var(--radius)] shadow-sm backdrop-blur-md open:shadow-md';
      groupEl.dataset.category = cat;

      const sum = document.createElement('summary');
      sum.className =
        'text-fg flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold select-none';
      sum.innerHTML = `
        <span>${escapeHtml(cat)}</span>
        <span class="bg-surface-solid/30 border-border text-muted inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">${items.length}</span>
      `;
      groupEl.appendChild(sum);

      for (const { id, def } of items) {
        const metricEl = document.createElement('details');
        // Kein gelber Außenrahmen für einzelne Ranglisten – Fokus liegt auf der Tabelle.
        metricEl.className =
          'metric-card group mt-3 rounded-[var(--radius)] bg-surface shadow-sm backdrop-blur-md open:shadow-md';
        metricEl.dataset.metric = id;
        metricEl.dataset.search = `${id} ${def.label} ${cat}`.toLowerCase();

        const unitLabel = def.unit ? def.unit : 'Wert';
        const s = document.createElement('summary');
        s.className =
          'text-fg flex cursor-pointer items-center justify-between gap-3 rounded-[calc(var(--radius)-1px)] px-4 py-3 text-sm font-semibold select-none transition-colors hover:bg-surface-solid/30 group-open:bg-surface-solid/30 group-open:border-b group-open:border-border';
        s.innerHTML = `
          <span class="min-w-0 truncate inline-flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-accent/70 opacity-0 group-open:opacity-100 transition-opacity" aria-hidden="true"></span>
            ${escapeHtml(def.label)}
          </span>
          <span class="bg-surface-solid/30 border-border text-muted group-open:bg-accent/10 group-open:border-accent/30 group-open:text-accent inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">${escapeHtml(id)} · ${escapeHtml(unitLabel)}</span>
        `;
        metricEl.appendChild(s);

        const body = document.createElement('div');
        body.className = 'metric-body px-4 pb-4';
        body.innerHTML = `
          <div class="table-wrapper relative mt-1 overflow-x-auto rounded-[var(--radius)] border border-border/60 bg-surface">
            <table class="w-full min-w-[520px] text-sm">
              <thead class="bg-surface-solid/40 text-muted text-xs">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold">Platz</th>
                  <th class="px-4 py-3 text-left font-semibold">Spielername</th>
                  <th class="px-4 py-3 text-left font-semibold">${escapeHtml(unitLabel)}</th>
                </tr>
              </thead>
              <tbody class="divide-border [&>tr:hover]:bg-surface-solid/40 divide-y [&>tr>td]:px-4 [&>tr>td]:py-3"></tbody>
            </table>
          </div>
          <div class="table-footer mt-3 flex items-center justify-between gap-3">
            <div class="pagination flex flex-wrap gap-2" aria-label="Seiten"></div>
          </div>
        `;
        metricEl.appendChild(body);

        const wrapper = body.querySelector('.table-wrapper');
        const tbody = body.querySelector('tbody');
        const pagerRoot = body.querySelector('.pagination');

        metricStates.set(id, {
          loaded: false,
          pages: [],
          currentPage: 0,
          nextCursor: null,
          hasMore: false,
          wrapper,
          tbody,
          pager: pagerRoot ? buildPager(pagerRoot) : null,
          detailsEl: metricEl,
        });

        // open -> load
        metricEl.addEventListener('toggle', () => {
          if (!metricEl.open) return;
          ensureMetricLoaded(id);
        });

        // pager handlers
        const st = metricStates.get(id);
        wirePager(st, {
          onPrev: () => gotoPrevPage(id),
          onNext: () => gotoNextPage(id),
          onPage: (p) => gotoPage(id, p),
        });

        groupEl.appendChild(metricEl);
      }

      metricsContainer.appendChild(groupEl);
    }

    metricsContainer.dataset.ready = '1';
    applyMetricFilter('');
  };

  // --- Pagination helpers (Vorherige/Nächste + Seitenbuttons) ---
  const buildPager = (root) => {
    if (!root) return null;
    const btnBase =
      'pag-btn inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed';

    root.classList.add('flex', 'flex-wrap', 'items-center', 'gap-2');
    root.innerHTML = `
      <button type="button" class="pag-prev ${btnBase} bg-surface border-border text-fg/90 hover:bg-surface-solid/60">Vorherige</button>
      <div class="pagination-pages flex flex-wrap items-center gap-2" aria-label="Seiten"></div>
      <button type="button" class="pag-next ${btnBase} bg-surface border-border text-fg/90 hover:bg-surface-solid/60">N\u00e4chste</button>
    `;
    return {
      root,
      btnPrev: root.querySelector('.pag-prev'),
      btnNext: root.querySelector('.pag-next'),
      pagesEl: root.querySelector('.pagination-pages'),
    };
  };

  const wirePager = (st, handlers) => {
    if (!st?.pager) return;
    st.pager.btnPrev?.addEventListener('click', handlers.onPrev);
    st.pager.btnNext?.addEventListener('click', handlers.onNext);
    st._onPage = handlers.onPage;
  };

  const updatePager = (st) => {
    if (!st?.pager) return;
    const loaded = st.pages.length;
    const cur = st.currentPage;

    st.pager.btnPrev.disabled = cur <= 0;
    const atEndLoaded = loaded === 0 ? true : cur >= loaded - 1;
    st.pager.btnNext.disabled = atEndLoaded && !st.hasMore;

    // Seitenbuttons (max. 10)
    const pagesEl = st.pager.pagesEl;
    if (!pagesEl) return;
    pagesEl.innerHTML = '';
    if (loaded <= 1 && !st.hasMore) return; // nix zu paginieren

    const maxBtns = 10;
    let start = Math.max(0, cur - 4);
    if (loaded > maxBtns) start = Math.min(start, loaded - maxBtns);
    const end = Math.min(loaded - 1, start + maxBtns - 1);

    for (let p = start; p <= end; p++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'page-btn inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
        (p === cur
          ? 'bg-surface-solid/70 border-border text-fg'
          : 'bg-surface border-border text-fg/80 hover:bg-surface-solid/60');
      b.textContent = String(p + 1);
      b.addEventListener('click', () => st._onPage?.(p));
      pagesEl.appendChild(b);
    }
  };

  const pageSize = () => Math.max(1, Math.min(100, parseInt(pageSizeSel?.value || '10', 10) || 10));

  const fetchLeaderboardPage = async (metricId, cursor, limit) => {
    const url = cursor
      ? `/api/leaderboard?metric=${encodeURIComponent(metricId)}&limit=${limit}&cursor=${encodeURIComponent(cursor)}`
      : `/api/leaderboard?metric=${encodeURIComponent(metricId)}&limit=${limit}`;
    const data = await fetchJson(url);
    setGenerated(data.__generated);
    mergePlayers(data.__players);
    const list = data.boards && data.boards[metricId] ? data.boards[metricId] : [];
    const next = data.cursors && data.cursors[metricId] ? data.cursors[metricId] : null;
    return { list, next };
  };

  const renderLeaderboardPage = (metricId, st, pageIndex) => {
    const def = metricDefs?.[metricId];
    const page = st.pages[pageIndex] || [];
    if (!st.tbody) return;
    st.tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < page.length; i++) {
      const entry = page[i];
      // medals nur für absolute Top 3
      const rank = pageIndex * pageSize() + i + 1;
      const tmpTbody = document.createElement('tbody');
      renderRow({
        tbody: tmpTbody,
        rank,
        uuid: entry.uuid,
        value: entry.value,
        def,
      });
      frag.appendChild(tmpTbody.firstElementChild);
    }
    st.tbody.appendChild(frag);
  };

  const resetLeaderboardState = (st) => {
    st.loaded = false;
    st.pages = [];
    st.currentPage = 0;
    st.nextCursor = null;
    st.hasMore = false;
    if (st.tbody) st.tbody.innerHTML = '';
    updatePager(st);
  };

  const ensureMetricLoaded = async (metricId) => {
    const st = metricStates.get(metricId);
    if (!st) return;
    if (!metricDefs) {
      try {
        await loadMetrics();
      } catch {
        /* ignore */
      }
    }
    if (st.loaded && st.pages.length) {
      updatePager(st);
      return;
    }
    resetLeaderboardState(st);
    await fetchNextAndShow(metricId);
  };

  const fetchNextAndShow = async (metricId) => {
    const st = metricStates.get(metricId);
    if (!st) return;
    const limit = pageSize();
    const stopLoading = createTableLoading(st.wrapper);
    try {
      const { list, next } = await fetchLeaderboardPage(metricId, st.nextCursor, limit);
      st.pages.push(list);
      st.nextCursor = next;
      st.hasMore = !!next;
      st.loaded = true;
      st.currentPage = st.pages.length - 1;
      renderLeaderboardPage(metricId, st, st.currentPage);
      updatePager(st);
    } catch (e) {
      console.error('Leaderboard Fehler', metricId, e);
      if (st.tbody) {
        st.tbody.innerHTML =
          '<tr><td colspan="3" class="px-4 py-3 text-sm text-muted">Fehler beim Laden.</td></tr>';
      }
    } finally {
      stopLoading();
    }
  };

  const gotoPage = async (metricId, pageIdx) => {
    const st = metricStates.get(metricId);
    if (!st) return;
    if (pageIdx < 0) return;
    if (pageIdx >= st.pages.length) return;
    st.currentPage = pageIdx;
    renderLeaderboardPage(metricId, st, st.currentPage);
    updatePager(st);
  };

  const gotoPrevPage = async (metricId) => {
    const st = metricStates.get(metricId);
    if (!st || st.currentPage <= 0) return;
    await gotoPage(metricId, st.currentPage - 1);
  };

  const gotoNextPage = async (metricId) => {
    const st = metricStates.get(metricId);
    if (!st) return;
    const atEndLoaded = st.pages.length === 0 ? true : st.currentPage >= st.pages.length - 1;
    if (!atEndLoaded) {
      await gotoPage(metricId, st.currentPage + 1);
      return;
    }
    if (!st.hasMore) return;
    await fetchNextAndShow(metricId);
  };

  const applyMetricFilter = (qRaw) => {
    const q = (qRaw || '').trim().toLowerCase();
    if (!metricsContainer) return;

    let anyVisible = false;
    const groupEls = Array.from(metricsContainer.querySelectorAll('details.metric-group'));
    for (const g of groupEls) {
      const cards = Array.from(g.querySelectorAll('details.metric-card'));
      let groupHas = false;
      for (const c of cards) {
        const text = (c.dataset.search || '').toLowerCase();
        const show = q === '' || text.includes(q);
        c.classList.toggle('hidden', !show);
        if (show) groupHas = true;
      }
      g.classList.toggle('hidden', !groupHas);
      if (groupHas) anyVisible = true;
    }

    if (noResultsWarning) noResultsWarning.classList.toggle('hidden', anyVisible);
  };

  metricFilterIn?.addEventListener(
    'input',
    debounce(() => {
      applyMetricFilter(metricFilterIn.value);
    }, 120),
  );

  // --- Server-König ---
  const ensureKingLoaded = async () => {
    if (!metricDefs) {
      try {
        await loadMetrics();
        clearApiError();
      } catch (e) {
        console.error(e);
        showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
        return;
      }
    }
    if (kingState.loaded && kingState.pages.length) {
      updatePager(kingState);
      return;
    }
    resetLeaderboardState(kingState);
    await fetchNextKingAndShow();
  };

  const fetchNextKingAndShow = async () => {
    const limit = pageSize();
    const stopLoading = createTableLoading(kingWrapper);
    try {
      const { list, next } = await fetchLeaderboardPage('king', kingState.nextCursor, limit);
      kingState.pages.push(list);
      kingState.nextCursor = next;
      kingState.hasMore = !!next;
      kingState.loaded = true;
      kingState.currentPage = kingState.pages.length - 1;
      renderLeaderboardPage('king', kingState, kingState.currentPage);
      updatePager(kingState);
    } catch (e) {
      console.error('Server-König Fehler', e);
      showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
      if (kingTbody) {
        kingTbody.innerHTML =
          '<tr><td colspan="3" class="px-4 py-3 text-sm text-muted">Fehler beim Laden.</td></tr>';
      }
    } finally {
      stopLoading();
    }
  };

  const gotoKingPage = async (p) => {
    if (p < 0 || p >= kingState.pages.length) return;
    kingState.currentPage = p;
    renderLeaderboardPage('king', kingState, p);
    updatePager(kingState);
  };

  const gotoPrevKing = async () => {
    if (kingState.currentPage <= 0) return;
    await gotoKingPage(kingState.currentPage - 1);
  };

  const gotoNextKing = async () => {
    const atEnd =
      kingState.pages.length === 0 ? true : kingState.currentPage >= kingState.pages.length - 1;
    if (!atEnd) {
      await gotoKingPage(kingState.currentPage + 1);
      return;
    }
    if (!kingState.hasMore) return;
    await fetchNextKingAndShow();
  };

  // --- Server-König Info-Box (schließbar, ohne Modal) ---
  (function setupKingInfoBox() {
    const box = document.getElementById('king-info-box');
    const btnClose = document.getElementById('king-info-close');
    const btnToggle = document.getElementById('king-info-toggle');
    const label = document.getElementById('king-info-toggle-label');
    if (!box || !btnClose || !btnToggle) return;

    const KEY = 'kingInfoDismissed';
    const SHOW_TEXT = 'Info zur Berechnung anzeigen';
    const HIDE_TEXT = 'Info zur Berechnung ausblenden';

    const applyLabel = (expanded) => {
      if (label) label.textContent = expanded ? HIDE_TEXT : SHOW_TEXT;
    };

    const hide = (persist) => {
      box.classList.add('hidden');
      btnToggle.setAttribute('aria-expanded', 'false');
      applyLabel(false);
      if (!persist) return;
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        // ignore
      }
    };

    const show = (clearPersist) => {
      box.classList.remove('hidden');
      btnToggle.setAttribute('aria-expanded', 'true');
      applyLabel(true);
      if (!clearPersist) return;
      try {
        localStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    };

    // initial state
    try {
      if (localStorage.getItem(KEY) === '1') {
        hide(false);
      } else {
        show(false);
      }
    } catch {
      // ignore
    }

    btnClose.addEventListener('click', () => hide(true));
    btnToggle.addEventListener('click', () => {
      if (box.classList.contains('hidden')) show(true);
      else hide(false);
    });
  })();

  // --- Welcome close ---
  if (welcomeBox) {
    welcomeBox.querySelector('.warning-close')?.addEventListener('click', () => {
      welcomeBox.classList.add('hidden');
    });
  }

  // --- Init ---
  (async () => {
    // pager for king
    if (kingPaginationEl) {
      kingState.pager = buildPager(kingPaginationEl);
      wirePager(kingState, {
        onPrev: gotoPrevKing,
        onNext: gotoNextKing,
        onPage: gotoKingPage,
      });
      updatePager(kingState);
    }

    // tab via hash
    const h = (window.location.hash || '').replace('#', '').trim().toLowerCase();
    const tabId = hashToTabId[h] || 'tab-uebersicht';
    activateTab(tabId, { updateHash: false });

    renderKpiSkeleton();

    // metrics (klein, cachebar) zuerst laden, damit KPI Labels sofort stimmen
    try {
      await loadMetrics();
      clearApiError();
    } catch (e) {
      console.warn('metrics load failed', e);
      showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
    }

    // summary (ebenfalls klein)
    try {
      await loadSummary();
      clearApiError();
    } catch (e) {
      console.warn('summary load failed', e);
      showApiError('Statistiken sind aktuell nicht erreichbar. Bitte versuche es später erneut.');
      // KPI Labels trotzdem setzen
      updateKpi(null);
    }

    // Wenn direkt auf #ranglisten gelandet, rendern
    if (tabId === 'tab-ranglisten') ensureMetricsRendered();
    if (tabId === 'tab-king') ensureKingLoaded();
  })();

  // page-size change: reset loaded leaderboards
  pageSizeSel?.addEventListener('change', () => {
    // king reset
    resetLeaderboardState(kingState);
    if (document.getElementById('tab-king')?.classList.contains('active')) {
      ensureKingLoaded();
    }
    // metrics reset (nur offene werden direkt neu geladen)
    for (const [id, st] of metricStates.entries()) {
      resetLeaderboardState(st);
      if (st.detailsEl?.open) ensureMetricLoaded(id);
    }
  });
});
