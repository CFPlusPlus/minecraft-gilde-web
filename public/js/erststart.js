// Tutorial schließen
function backToGame() {
  try {
    window.open('', '_self');
    window.close();
  } catch (e) {}

  if (history.length > 1) {
    history.back();
    return false;
  }

  alert(
    'Du kannst diesen Tab jetzt manuell schließen:\n' +
      '• Windows/Linux: Strg+W\n' +
      '• macOS: Cmd+W\n\n' +
      'Wechsle danach mit Alt+Tab bzw. Cmd+Tab zurück ins Spiel.',
  );
  return false;
}

// Timeline
document.addEventListener('DOMContentLoaded', () => {
  const rail = document.querySelector('.progress-timeline');
  const stepNodes = document.querySelectorAll('.progress-timeline li');
  const steps = Array.from(stepNodes);
  const sections = steps.map((li) => document.getElementById(li.dataset.target)).filter(Boolean);

  // --- Gemeinsame Utilities ---
  function getTopOffset() {
    const nav = document.querySelector('.navbar');
    return (nav ? nav.offsetHeight : 0) + 20; // kleine Luft
  }
  function applyTopOffsetVar() {
    document.documentElement.style.setProperty('--top-offset', getTopOffset() + 'px');
  }
  applyTopOffsetVar();
  window.addEventListener(
    'scroll',
    () => {
      if (window.__topOffsetRaf) return;
      window.__topOffsetRaf = requestAnimationFrame(() => {
        applyTopOffsetVar();
        window.__topOffsetRaf = null;
      });
    },
    { passive: true },
  );

  function setActiveById(id) {
    steps.forEach((li) => li.classList.toggle('active', li.dataset.target === id));
  }

  // --- Aktive Section anhand der OBEREN Sichtkante bestimmen ---
  function getSectionTops() {
    return sections.map((s) => s.offsetTop);
  }

  function computeActiveIdx() {
    const DETECTION_OFFSET = 150; // ggf. weiter feinjustieren
    const threshold = getTopOffset() + DETECTION_OFFSET;

    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
      const top = sections[i].getBoundingClientRect().top;
      if (top - threshold <= 0) idx = i;
      else break;
    }

    // Fallback: Wenn (nahe) Seitenende erreicht, letzten Abschnitt aktiv setzen
    const doc = document.scrollingElement || document.documentElement;
    const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= doc.scrollHeight - 1;
    if (atBottom) idx = sections.length - 1;

    return idx;
  }

  // --- Klick-Scroll: Ziel während der Animation fixieren (Lock) ---
  let isProgrammaticScroll = false;
  let lockTargetId = null;

  function scrollToTarget(el) {
    const desiredY = el.getBoundingClientRect().top + window.pageYOffset - getTopOffset();
    const dist = Math.abs(window.pageYOffset - desiredY);

    lockTargetId = el.id; // Ziel während Scroll festhalten
    isProgrammaticScroll = true;
    setActiveById(lockTargetId);

    window.scrollTo({ top: desiredY, behavior: dist < 2 ? 'auto' : 'smooth' });

    const EPS = 1.5; // Toleranz in px
    const settle = () => {
      const nowDist = Math.abs(window.pageYOffset - desiredY);
      if (nowDist <= EPS) {
        isProgrammaticScroll = false;
        lockTargetId = null;
        updateActiveByScroll(); // final bestätigen
      } else {
        requestAnimationFrame(settle);
      }
    };
    requestAnimationFrame(settle);

    // Sicherheitsnetz, falls der Browser keine "eingeschnappt"-Position liefert
    setTimeout(() => {
      isProgrammaticScroll = false;
      lockTargetId = null;
      updateActiveByScroll();
    }, 1200);
  }

  steps.forEach((li) =>
    li.addEventListener('click', () => {
      const target = document.getElementById(li.dataset.target);
      if (target) scrollToTarget(target);
    }),
  );

  function updateActiveByScroll() {
    if (isProgrammaticScroll) {
      // während Klick-Scroll: nicht umschalten
      if (lockTargetId) setActiveById(lockTargetId);
      return;
    }
    const idx = computeActiveIdx();
    setActiveById(sections[idx].id);
  }

  // --- rAF-throttled Scroll-Listener ---
  const onScroll = () => {
    if (onScroll._raf) return;
    onScroll._raf = requestAnimationFrame(() => {
      updateActiveByScroll();
      onScroll._raf = null;
    });
  };
  window.addEventListener('scroll', onScroll);

  // --- Dots-Layout mit Mindestabstand (gegen Überlappungen) ---
  function layoutSteps() {
    if (!rail || sections.length === 0) return;

    const offsets = getSectionTops();
    const first = offsets[0],
      last = offsets[offsets.length - 1];
    const span = Math.max(1, last - first);

    const railStyles = getComputedStyle(rail);
    const railHeight = rail.clientHeight;

    const dotSize = parseFloat(railStyles.getPropertyValue('--dot-size')) || 35;
    const dotBorder = parseFloat(railStyles.getPropertyValue('--dot-border')) || 4;
    const dotTotal = dotSize + 2 * dotBorder;
    const MIN_GAP = Math.max(42, dotTotal + 10);
    const PADDING = 12;

    // 1) Proportionale Rohpositionen
    const proposed = offsets.map((o) => {
      const ratio = (o - first) / span;
      return Math.max(PADDING, Math.min(railHeight - PADDING, ratio * railHeight));
    });

    // 2) Mindestabstand nach unten durchsetzen
    const adjusted = [...proposed];
    for (let i = 1; i < adjusted.length; i++) {
      if (adjusted[i] < adjusted[i - 1] + MIN_GAP) {
        adjusted[i] = adjusted[i - 1] + MIN_GAP;
      }
    }

    // 3) Falls unten überläuft, nach oben zurückdrücken (ohne Mindestabstand zu verletzen)
    const overflow = adjusted[adjusted.length - 1] - (railHeight - PADDING);
    if (overflow > 0) {
      adjusted[adjusted.length - 1] -= overflow;
      for (let i = adjusted.length - 2; i >= 0; i--) {
        if (adjusted[i] > adjusted[i + 1] - MIN_GAP) {
          adjusted[i] = Math.max(PADDING, adjusted[i + 1] - MIN_GAP);
        }
      }
    }

    // 4) Anwenden
    steps.forEach((li, idx) => {
      li.style.top = adjusted[idx] + 'px';
    });
  }

  // --- Initialisierung / Reflows ---
  window.addEventListener('resize', () => {
    layoutSteps();
    updateActiveByScroll();
  });
  window.addEventListener('load', () => {
    layoutSteps();
    updateActiveByScroll();
  });
  layoutSteps();
  updateActiveByScroll();

  // Falls Schrift/Icon später lädt → kurz nachtriggern
  setTimeout(() => {
    layoutSteps();
    updateActiveByScroll();
  }, 300);

  // Optional: Hash-Navigation (Back/Forward) sauber justieren
  window.addEventListener(
    'hashchange',
    () => {
      const el = document.getElementById(location.hash.slice(1));
      if (el) scrollToTarget(el);
    },
    false,
  );
});
