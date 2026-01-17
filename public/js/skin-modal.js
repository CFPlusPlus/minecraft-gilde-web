let wrapPointerBound = false;
let removeWrapPointerEvents = null;
let onVisChange = null;
let animCache = { walk: null, idle: null, fly: null };

export async function openSkinModal() {
  const overlay = document.getElementById('skin-modal-overlay');
  const btnClose = document.getElementById('skin-modal-close');
  const btnReset = document.getElementById('skin-modal-reset');
  let openerEl = null;
  const wrap = document.querySelector('.skin-canvas-wrap');
  const img = document.getElementById('player-skin') || document.getElementById('player-hero');
  const uuidBadge = document.getElementById('player-uuid');
  const titleEl = document.getElementById('skin-modal-title');

  // ---- Mobile/Performance Heuristiken ------------------------------------------------
  const isCoarse = window.matchMedia('(pointer: coarse)').matches; // Smartphones/Tablets
  const isLowPowerMode =
    typeof navigator !== 'undefined' && 'connection' in navigator
      ? navigator.connection.saveData || (navigator.connection.effectiveType || '').includes('2g')
      : false;

  let canvas = null;
  let viewer = null,
    controls = null;
  let ro = null,
    rafId = 0,
    dragRafId = 0;
  let isAlive = false,
    isDragging = false;
  let needsFrame = false;
  let animRafId = 0;
  let dprOverride = null; // während Animation aktiv
  let hasCape = false;
  let prevBackEquipment = null;

  // Status im Footer
  let statusEl = document.getElementById('skin-modal-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'skin-modal-status';
    statusEl.style.padding = '.5rem 1rem';
    statusEl.style.fontSize = '.9rem';
    statusEl.style.opacity = '.85';
    const footer = document.querySelector('.skin-modal footer');
    if (footer) footer.insertAdjacentElement('afterbegin', statusEl);
  }

  const setStatus = (m) => {
    if (!statusEl) return;
    const t = (m || '').trim();
    statusEl.textContent = t;
    statusEl.style.display = t ? 'block' : 'none';
  };

  function onCtxLost(e) {
    e.preventDefault();
    setStatus('WebGL-Kontext verloren.');
  }

  // --- Utils ------------------------------------------------------------------
  function ensureSkinviewReady() {
    return new Promise((resolve, reject) => {
      if (window.skinview3d) {
        resolve(window.skinview3d);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/skinview3d@3.2.0/bundles/skinview3d.bundle.js';
      s.async = true;
      s.onload = () => resolve(window.skinview3d);
      s.onerror = () => reject(new Error('Konnte skinview3d nicht laden.'));
      document.head.appendChild(s);
    });
  }
  function getQueryParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch {
      return '';
    }
  }
  function normalizeUUID(u) {
    const c = (u || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    return c.length === 32 ? c : '';
  }
  function getPlayerIdentity() {
    const qUuid = normalizeUUID(getQueryParam('uuid'));
    const qName = String(getQueryParam('name') ?? '').trim();
    if (qName) return { uuid: qUuid, name: qName };

    const rawUUID = String(uuidBadge?.textContent ?? '').trim();
    const dUuidFromBadge = normalizeUUID(rawUUID);
    const uuid = qUuid || dUuidFromBadge;

    let name = '';
    const nameEl = document.getElementById('player-name');
    const domName = nameEl ? String(nameEl.textContent || '').trim() : '';
    const imgName = String(img?.alt ?? '').trim();
    const isLoading = domName.toLowerCase().startsWith('lädt');
    name = !isLoading && domName ? domName : imgName;

    return { uuid, name };
  }

  async function fetchIsSlimModel(uuid) {
    if (!uuid) return null;
    const decoded = await fetchMojangTextures(uuid);
    const model = decoded?.textures?.SKIN?.metadata?.model;
    if (model === 'slim') return true;
    if (model === 'default' || model === 'wide') return false;
    return null;
  }

  const _mojangProfileCache = new Map(); // uuid -> Promise<json|null>

  async function fetchMojangProfile(uuid) {
    if (!uuid) return null;
    if (_mojangProfileCache.has(uuid)) return _mojangProfileCache.get(uuid);

    const p = (async () => {
      const res = await fetch(`api/profile?uuid=${uuid}`);
      if (!res.ok) return null;
      return await res.json();
    })().catch(() => null);

    _mojangProfileCache.set(uuid, p);
    return p;
  }

  async function fetchMojangTextures(uuid) {
    const prof = await fetchMojangProfile(uuid);
    const props = Array.isArray(prof?.properties) ? prof.properties : [];
    const texProp = props.find((p) => p?.name === 'textures');
    if (!texProp?.value) return null;
    try {
      return JSON.parse(atob(texProp.value));
    } catch {
      return null;
    }
  }

  async function fetchMojangCapeUrl(uuid) {
    const decoded = await fetchMojangTextures(uuid);
    let url = decoded?.textures?.CAPE?.url || null;
    if (url && url.startsWith('http://')) url = 'https://' + url.slice('http://'.length);
    return url;
  }

  function skinURLs(id) {
    const out = [];

    // 1) Primär: Minotar per UUID
    if (id.uuid) {
      out.push(`https://minotar.net/skin/${id.uuid}`);
    }

    // 2) Fallback: Minotar per UUID
    if (id.uuid) {
      out.push(`https://mc-heads.net/skin/${id.uuid}`);
    }

    // 3) Letzter Fallback: lokale Steve-Datei (unabhängig von externen Diensten)
    out.push('/images/steve.png'); // Pfad ggf. anpassen

    return out;
  }

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(
        c.getContext('webgl2') ||
        c.getContext('webgl') ||
        c.getContext('experimental-webgl')
      );
    } catch {
      return false;
    }
  }

  // Canvas frisch erzeugen
  function createFreshCanvas() {
    try {
      wrap.querySelector('#skin-canvas')?.remove();
    } catch {}
    const c = document.createElement('canvas');
    c.id = 'skin-canvas';
    c.width = 800;
    c.height = 800;
    c.setAttribute('aria-label', '3D Skin');
    wrap.appendChild(c);
    return c;
  }
  //Canvas an Eltern-Container anpassen
  function fitCanvas(c) {
    if (!c) return;
    const parent = c.parentElement || c;
    const rect = parent.getBoundingClientRect();

    // DPR-Cap wie gehabt
    const dprCap = dprOverride ?? (isCoarse ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    const MAX = isCoarse ? 1400 : 4096;

    let w = Math.floor(rect.width * dprCap);
    let h = Math.floor(rect.height * dprCap);

    if (!w || !h) {
      w = 600 * dprCap;
      h = 600 * dprCap;
    }

    w = Math.min(Math.max(2, w), MAX);
    h = Math.min(Math.max(2, h), MAX);

    c.width = w;
    c.height = h;
    c.style.width = Math.round(w / dprCap) + 'px';
    c.style.height = Math.round(h / dprCap) + 'px';
  }

  // --- Rendering: On-Demand ---------------------------------------------------
  function scheduleDraw() {
    // Während die Animationsschleife aktiv ist, On-Demand-Draws überspringen
    if (typeof animRafId !== 'undefined' && animRafId) return;

    if (!viewer || !isAlive) return;
    if (needsFrame) return;
    needsFrame = true;
    rafId = requestAnimationFrame(() => {
      needsFrame = false;
      try {
        controls?.update?.(); // Damping & Smoothness pro Frame
        viewer.draw && viewer.draw();
      } catch {}
    });
  }
  function startDragLoop() {
    try {
      if (controls) controls.enabled = true;
    } catch {}
    if (dragRafId) return;
    const loop = () => {
      if (!isAlive || !isDragging) {
        dragRafId = 0;
        scheduleDraw();
        return;
      }
      scheduleDraw();
      dragRafId = requestAnimationFrame(loop);
    };
    dragRafId = requestAnimationFrame(loop);
  }
  function stopDragLoop() {
    try {
      if (controls) {
        const sel = document.getElementById('anim-select');
        controls.enabled = sel && sel.value === 'none';
      }
    } catch {}
    isDragging = false;
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = 0;
    }
    scheduleDraw();
  }

  function startAnimLoop() {
    if (animRafId) {
      cancelAnimationFrame(animRafId);
      animRafId = 0;
    }
    if (animRafId) {
      pendingResize = true;
      return;
    }
    // leichte Drosselung der Renderauflösung zugunsten weicher Frames

    dprOverride = isCoarse ? 1 : 1.5;

    // Canvas-Resize per Debounce auf den nächsten Tick verschieben
    setTimeout(() => {
      if (typeof canvas !== 'undefined' && canvas && typeof viewer !== 'undefined' && viewer) {
        try {
          fitCanvas(canvas);
        } catch {}
        try {
          viewer.setSize(canvas.width, canvas.height);
        } catch {}
      }
    }, 0);
    let lastTs;
    let frameAccMs = 0; // Frame-Throttle-Accumulator
    let pendingResize = false; // Resize wird während der Animation zurückgestellt // undefined bis zum ersten Tick
    const loop = (ts) => {
      if (!isAlive || !viewer) {
        animRafId = 0;
        return;
      }
      if (lastTs === undefined) lastTs = ts;
      const dt = Math.max(0, ts - lastTs) / 1000;
      lastTs = ts;

      // Damping / Controls-Smoothness
      try {
        controls?.update?.();
      } catch {}

      /* Draw + adaptives DPR (fixed) wird unten eingefüg */ try {
        // FPS-basiertes adaptives DPR + zurückgestelltes Resize
        if (typeof lastTs !== 'number') {
          lastTs = ts;
        }
        const dt = Math.max(0, ts - lastTs);
        lastTs = ts;
        if (typeof window.__fpsAccT === 'undefined') {
          window.__fpsAccT = 0;
          window.__fpsAccN = 0;
        }
        window.__fpsAccT += dt;
        window.__fpsAccN++;

        // Ausstehendes Resize einmal innerhalb der Schleife anwenden, um Thrashing zu vermeiden
        if (
          pendingResize &&
          typeof canvas !== 'undefined' &&
          canvas &&
          typeof viewer !== 'undefined' &&
          viewer
        ) {
          pendingResize = false;
          try {
            fitCanvas(canvas);
            viewer.setSize(canvas.width, canvas.height);
          } catch {}
        }

        // Frame-Throttle: Der Rotate-Modus kann mit ca. 30 FPS laufen, um flüssig/stabil zu bleiben
        const selEl = document.getElementById('anim-select');
        const modeNow = selEl ? String(selEl.value) : 'idle';
        const targetMs = modeNow === 'rotate' ? 33 : 16; // ~30fps vs 60fps
        frameAccMs += dt;
        if (frameAccMs < targetMs) {
          /* In diesem Tick den aufwändigen Draw überspringen */
        } else {
          frameAccMs = frameAccMs % targetMs;
          try {
            controls?.update?.();
          } catch {}
          viewer.draw && viewer.draw();
        }

        if (window.__fpsAccT >= 2000) {
          // Alle ~2s
          const fps = (window.__fpsAccN * 1000) / window.__fpsAccT;
          window.__fpsAccT = 0;
          window.__fpsAccN = 0;

          const curr =
            typeof dprOverride === 'number'
              ? dprOverride
              : isCoarse
                ? 1
                : Math.min(window.devicePixelRatio || 1, 1.5);
          let next = curr;
          if (fps < 50)
            next = Math.max(0.9, curr - 0.1); // herunterstufen
          else if (fps > 58) next = Math.min(1.5, curr + 0.05); // sanft eine Stufe erhöhen

          if (Math.abs(next - curr) > 1e-3) {
            dprOverride = next;
            try {
              fitCanvas(canvas);
              viewer.setSize(canvas.width, canvas.height);
            } catch {}
          }
          // Optional: console.debug('SkinModal FPS', Math.round(fps), 'DPR', dprOverride);
        }
      } catch {}
      animRafId = requestAnimationFrame(loop);
    };
    animRafId = requestAnimationFrame(loop);
  }

  function stopAnimLoop() {
    if (animRafId) {
      cancelAnimationFrame(animRafId);
      animRafId = 0;
    }
    // DPI zurücksetzen

    dprOverride = null;

    // Canvas-Resize entprellen und auf den nächsten Tick verschieben
    setTimeout(() => {
      if (typeof canvas !== 'undefined' && canvas && typeof viewer !== 'undefined' && viewer) {
        try {
          fitCanvas(canvas);
        } catch {}
        try {
          viewer.setSize(canvas.width, canvas.height);
        } catch {}
      }
    }, 0);
    // zum Abschluss noch ein Frame, damit finaler Zustand sichtbar ist
    scheduleDraw();
  }

  function attachControlEvents(ctrl) {
    if (!ctrl) return;
    // three.js OrbitControls feuert "change" bei Interaktion
    ctrl.addEventListener?.(
      'start',
      () => {
        isDragging = true;
        startDragLoop();
      },
      { passive: true },
    );
    ctrl.addEventListener?.('change', () => scheduleDraw(), { passive: true });
    ctrl.addEventListener?.('end', () => stopDragLoop(), { passive: true });

    // Wrapper-Pointer-Events nur einmal binden und entfernbar halten
    if (typeof wrap !== 'undefined' && wrap && !wrapPointerBound) {
      const onDown = () => {
        isDragging = true;
        startDragLoop();
      };
      const onUp = () => stopDragLoop();
      wrap.addEventListener('pointerdown', onDown, { passive: true });
      wrap.addEventListener('pointerup', onUp, { passive: true });
      wrap.addEventListener('pointercancel', onUp, { passive: true });
      wrapPointerBound = true;
      removeWrapPointerEvents = () => {
        try {
          wrap.removeEventListener('pointerdown', onDown);
        } catch {}
        try {
          wrap.removeEventListener('pointerup', onUp);
        } catch {}
        try {
          wrap.removeEventListener('pointercancel', onUp);
        } catch {}
        wrapPointerBound = false;
        removeWrapPointerEvents = null;
      };
    }
  }

  function cancelLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = 0;
    }
  }

  function stopAllAnimations(opts = {}) {
    const keepLoop = !!opts.keepLoop;
    try {
      if (viewer) viewer.animation = null;
    } catch {}
    try {
      if (viewer) viewer.autoRotate = false;
    } catch {}

    if (keepLoop) {
      // Loop läuft weiter: nur neu zeichnen, kein DPR-Flip/Resize
      if (viewer && isAlive) scheduleDraw();
    } else {
      // wie bisher: Loop stoppen + DPR zurücksetzen
      stopAnimLoop();
    }
  }

  function applyAnimation(mode) {
    if (!viewer) return;
    // Wird der Zielmodus kontinuierlich animiert?
    const willAnimate = mode === 'rotate' || mode === 'walk' || mode === 'idle' || mode === 'fly';

    if (controls) controls.enableDamping = !!willAnimate;
    // alles stoppen – aber Loop nur stoppen, wenn wir NICHT animiert weiterlaufen
    stopAllAnimations({ keepLoop: willAnimate && !!animRafId });

    const sv = window.skinview3d;
    let hasAnim = false;

    switch (mode) {
      case 'rotate':
        viewer.autoRotate = true;
        if ('autoRotateSpeed' in viewer) viewer.autoRotateSpeed = 0.6;
        hasAnim = true;
        break;

      case 'walk':
        if (sv?.WalkingAnimation) {
          viewer.animation = animCache.walk ||= new sv.WalkingAnimation();
          viewer.animation.speed = 1.0;
          hasAnim = true;
        }
        break;

      case 'idle':
        if (sv?.IdleAnimation) {
          viewer.animation = animCache.idle ||= new sv.IdleAnimation();
          viewer.animation.speed = 1.0;
          hasAnim = true;
        }
        break;

      case 'fly':
        if (sv?.FlyingAnimation) {
          viewer.animation = animCache.fly ||= new sv.FlyingAnimation();
          viewer.animation.speed = 0.9;
          hasAnim = true;
        }
        // Elytra erzwingen
        try {
          if (viewer?.playerObject) {
            // vorherigen Zustand merken, um später zurückschalten zu können
            if (prevBackEquipment == null)
              prevBackEquipment = viewer.playerObject.backEquipment || 'cape';
            viewer.playerObject.backEquipment = 'elytra';
          }
        } catch {}
        break;

      case 'none':
      default:
        // nichts
        break;
    }
    // Falls wir von "fly" kommen: Elytra wieder zurück auf das vorherige Equipment
    try {
      if (mode !== 'fly' && prevBackEquipment && viewer?.playerObject) {
        viewer.playerObject.backEquipment = prevBackEquipment;
      }
      if (mode !== 'fly') prevBackEquipment = null;
    } catch {}

    if (hasAnim) startAnimLoop();
    else stopAnimLoop();
    scheduleDraw();

    // Cape/Elytra-Button (falls vorhanden) synchron halten,
    // z.B. wenn "fly" Elytra erzwingt.
    try {
      const capeToggle = document.querySelector('#cape-toggle');
      if (capeToggle && typeof capeToggle._renderCapeState === 'function') {
        capeToggle._renderCapeState();
      }
    } catch {}
  }

  function hardReleaseGL() {
    try {
      stopAllAnimations();
      cancelLoop();
      try {
        viewer && (viewer.draw = function () {});
      } catch {}
      try {
        controls?.dispose?.();
      } catch {}
      controls = null;
      try {
        viewer?.dispose?.();
      } catch {}
      const gl = viewer?.renderer?.getContext?.();
      if (gl && typeof gl.isContextLost === 'function' && !gl.isContextLost()) {
        try {
          const ext = gl.getExtension && gl.getExtension('WEBGL_lose_context');
          ext && ext.loseContext && ext.loseContext();
        } catch {}
      }
    } finally {
      try {
        canvas?.removeEventListener('webglcontextlost', onCtxLost, { passive: false });
      } catch {}
      try {
        canvas?.remove();
      } catch {}
      canvas = null;
      viewer = null;
    }
  }

  // außerhalb: einmal definieren
  let resizeRafId = 0;
  function onWinResize() {
    if (resizeRafId) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0;
      if (canvas) {
        fitCanvas(canvas); // Canvas an Wrap anpassen
        viewer?.setSize(canvas.width, canvas.height);
        scheduleDraw(); // einmal neu zeichnen
      }
    });
  }

  function openModal() {
    const ident = getPlayerIdentity();
    if (titleEl) {
      const shortUuid = ident.uuid ? ident.uuid.slice(0, 8) + '…' : '';
      titleEl.textContent = ident.name
        ? `Skin von ${ident.name}`
        : shortUuid
          ? `Skin ${shortUuid}`
          : 'Spielerskin';
    }

    isAlive = true;

    // Modal sichtbar machen
    openerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Zugänglich machen (Screenreader + Fokus) – ersetzt aria-hidden-Logik
    overlay.removeAttribute('inert');
    overlay.classList.add('open');
    if (wrap) wrap.style.removeProperty('height');
    overlay.style.display = 'flex';

    // Rolle/Modal-Status sicherstellen (auf dem eigentlichen Dialog-Container)
    const dialogEl = overlay.querySelector('.skin-modal') || overlay;
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-modal', 'true');

    const hdr = overlay.querySelector('.skin-modal header');
    if (hdr) {
      hdr.style.display = 'flex';
      void hdr.offsetHeight;
    }

    // Canvas/Wiederzeichnung sofort anstoßen
    try {
      dialogEl.focus({ preventScroll: true });
    } catch {}

    // Fenster-Resize beobachten (einmal pro Öffnen)
    window.addEventListener('resize', onWinResize, { passive: true });
  }

  function bindResetHandler() {
    if (!btnReset) return;
    // alten Handler ablösen, falls vorhanden
    if (btnReset._resetHandler) {
      btnReset.removeEventListener('click', btnReset._resetHandler);
    }
    // aktueller Handler mit *dieser* viewer/controls-Closure
    btnReset._resetHandler = () => {
      if (!viewer) return;
      try {
        const pose = {
          target: { x: 0, y: 12, z: 0 },
          position: { x: 0, y: 12, z: 60 },
          zoom: 0.9,
        };
        controls?.reset?.();
        if ('zoom' in viewer) {
          viewer.zoom = pose.zoom;
          viewer.fov = 55;
          viewer.camera.updateProjectionMatrix?.();
        }
        try {
          viewer.playerObject && viewer.playerObject.rotation.set(0, 0, 0);
        } catch {}
        viewer.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        controls?.target.set(pose.target.x, pose.target.y, pose.target.z);
        viewer.camera.up.set(0, 1, 0);
        viewer.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
        controls?.update?.();
        scheduleDraw();
      } catch (e) {
        console.warn('Reset fehlgeschlagen:', e);
      }
    };
    btnReset.addEventListener('click', btnReset._resetHandler);
  }

  function closeModal() {
    // Wrapper-Pointer-Events und Visibility-Listener entfernen
    try {
      removeWrapPointerEvents && removeWrapPointerEvents();
    } catch {}
    try {
      if (onVisChange) document.removeEventListener('visibilitychange', onVisChange);
    } catch {}
    onVisChange = null;

    // Nur den DOM-Zustand prüfen – nicht von alter Closure-Variable abhängig sein
    if (!overlay.classList.contains('open')) return;

    const t = document.querySelector('.skin-modal footer #cape-toggle');
    if (t) {
      if (t._capeHandler) t.removeEventListener('click', t._capeHandler);
      t.remove();
    }

    // Aktuelle Close-Handler lösen (wir binden sie beim nächsten Öffnen neu)
    overlay._offClose?.();

    setStatus('');
    isAlive = false;
    cancelLoop();
    stopAllAnimations();

    // Resize-Listener entfernen
    try {
      window.removeEventListener('resize', onWinResize, { passive: true });
    } catch {}

    try {
      ro?.disconnect?.();
    } catch {}
    ro = null;
    try {
      viewer && (viewer.draw = function () {});
    } catch {}
    hardReleaseGL();

    overlay.classList.remove('open');
    overlay.setAttribute('inert', ''); // macht Bereich unfokussierbar & für AT inaktiv
    overlay.style.display = 'none';
    // Fokus an Auslöser zurückgeben (falls noch im DOM)
    try {
      if (openerEl && document.contains(openerEl)) openerEl.focus();
    } catch {}
    openerEl = null;
  }

  function bindCloseHandlers() {
    // Vorherige Handler entfernen (falls von einer vorherigen Öffnung vorhanden)
    if (overlay._offClose) overlay._offClose();

    const onBtn = () => closeModal();
    const onOverlay = (e) => {
      if (e.target === overlay) closeModal();
    };
    const onKey = (e) => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const scope = overlay.querySelector('.skin-modal') || overlay;
        const focusables = scope.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const list = Array.from(focusables).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
        );
        if (!list.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    btnClose?.addEventListener('click', onBtn);
    overlay.addEventListener('click', onOverlay, { passive: true });
    document.addEventListener('keydown', onKey, { passive: true });

    // Cleaner merken, um beim nächsten Öffnen sauber ablösen zu können
    overlay._offClose = () => {
      btnClose?.removeEventListener('click', onBtn);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
    };
  }

  async function initViewer() {
    canvas = createFreshCanvas();
    await new Promise(requestAnimationFrame);
    fitCanvas(canvas);
    canvas.addEventListener('webglcontextlost', onCtxLost, { passive: false });

    setStatus('Lade Skin-Viewer …');
    const skinview3d = await ensureSkinviewReady();

    if (!webglAvailable()) {
      titleEl && (titleEl.textContent = 'Dein Browser/Profil blockiert WebGL');
      setStatus('WebGL nicht verfügbar.');
      return;
    }

    const ident = getPlayerIdentity();
    if (titleEl) {
      const shortUuid = ident.uuid ? ident.uuid.slice(0, 8) + '…' : '';
      titleEl.textContent = ident.name
        ? `Skin von ${ident.name}`
        : shortUuid
          ? `Skin ${shortUuid}`
          : 'Spielerskin';
    }

    const CY = 12;
    viewer = new skinview3d.SkinViewer({
      canvas,
      width: canvas.width,
      height: canvas.height,
      zoom: 0.9,
    });

    // nach SkinViewer-Erzeugung:
    viewer.background = null;
    try {
      viewer.renderer.setClearColor(0x000000, 0); // alpha 0
    } catch {}

    viewer.fov = 55;

    // Controls
    try {
      if (typeof skinview3d.createOrbitControls === 'function') {
        controls = skinview3d.createOrbitControls(viewer);
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.enableRotate = true;

        // sanfte Dämpfung für flüssigere Interaktion
        controls.enableDamping = true;
        controls.dampingFactor = 0.08; // 0.05–0.12 (guter Bereich)

        controls.target.set(0, CY, 0);
        controls.update();
        if (controls && typeof controls.saveState === 'function') controls.saveState();
      }
      viewer.camera.position.set(0, CY, 60);
      viewer.camera.lookAt(0, CY, 0);
    } catch (e) {
      console.warn('Controls/Kamera:', e);
    }

    // *** Animationen-Policy ***
    // Mobile/LowPower: keine Daueranimationen → nur on-demand Zeichnen
    // Desktop: sanfte Rotation
    try {
      if (!isCoarse && !isLowPowerMode) {
        viewer.autoRotate = true; // neue API
        if ('autoRotateSpeed' in viewer) viewer.autoRotateSpeed = 0.6;
        startAnimLoop(); // eigener RAF-Loop
      }
    } catch (e) {
      console.warn('Animations init:', e);
    }

    // 1) Steve vorladen
    setStatus('Initialisiere Renderer …');
    try {
      await viewer.loadSkin('https://minotar.net/skin/MHF_Steve', { model: 'auto' });
    } catch {}

    // 2) Echten Skin laden (mit korrekt ermitteltem Modell)
    setStatus('Lade Skin …');

    // Modell (Alex/Steve) über Mojang ermitteln; wenn keine UUID vorhanden → auto
    let isSlim = await fetchIsSlimModel(ident.uuid);
    // "slim" | "default" | "auto"
    const modelOpt = isSlim === true ? 'slim' : isSlim === false ? 'default' : 'auto';

    let swapped = false;
    for (const u of skinURLs(ident)) {
      try {
        await viewer.loadSkin(u, { model: modelOpt });
        swapped = true;
        break;
      } catch {}
    }
    setStatus(swapped ? '' : 'Konnte keinen Skin laden – zeige Steve.');

    // Cape laden (falls vorhanden)
    setStatus('Prüfe auf Cape …');
    let capeLoaded = false;

    const capeUrl = await fetchMojangCapeUrl(ident.uuid);
    if (capeUrl) {
      try {
        await viewer.loadCape(capeUrl);
        capeLoaded = true;
        hasCape = true;
      } catch (err) {
        console.log(`Cape konnte nicht geladen werden (${capeUrl})`, err);
      }
    }

    if (capeLoaded) {
      try {
        viewer.playerObject.backEquipment = 'cape';
      } catch {}
      setStatus('');
      scheduleDraw();
    } else {
      setStatus(''); // Statusleiste aufräumen
    }

    // --- Fallback: Default-Elytra laden, wenn kein Cape vorhanden ist ---
    if (!capeLoaded) {
      try {
        // Pfad zu Default-Elytra-Textur
        await viewer.loadCape('/images/elytra.png');
        // Noch nichts am Equipment schalten – das macht die Animation "fly".
        console.log('Fallback-Elytra geladen');
      } catch (err) {
        console.warn('Konnte Default-Elytra nicht laden:', err);
      }
    }

    // Wenn ein Cape vorhanden ist, sicherstellen, dass es als Cape (nicht Elytra) angezeigt wird.
    if (capeLoaded) {
      try {
        viewer.playerObject.backEquipment = 'cape';
      } catch {}
      setStatus(''); // Statusleiste leeren
    } else {
      // Optional dezent bleiben (kein Cape ist normal):
      // setStatus("Kein Cape gefunden.");
    }

    // Cape/Elytra-Umschalter nur, wenn Cape vorhanden
    (function setupCapeToggle() {
      const footer = document.querySelector('.skin-modal footer');
      if (!footer) return;

      let toggle = footer.querySelector('#cape-toggle');

      // Wenn KEIN Cape da ist: alten Button entfernen und raus
      if (!capeLoaded) {
        if (toggle) {
          if (toggle._capeHandler) {
            toggle.removeEventListener('click', toggle._capeHandler);
          }
          toggle.remove(); // Button komplett aus dem DOM nehmen
        }
        return; // nichts weiter tun
      }

      // Ab hier: Cape ist vorhanden → Button sicherstellen
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'cape-toggle';
        toggle.className = 'btn';
        toggle.type = 'button';
        // Icon/Label wird unten über renderCapeState gesetzt
        footer.appendChild(toggle);
      }

      // Sicherstellen, dass der Button sichtbar/aktiv ist
      toggle.disabled = false;
      toggle.style.display = ''; // falls via CSS versteckt
      toggle.removeAttribute('hidden'); // falls hidden-Attribut gesetzt war

      // alten Handler ablösen
      if (toggle._capeHandler) {
        toggle.removeEventListener('click', toggle._capeHandler);
      }
      // neuen Handler binden
      const ICON_CAPE = 'fa-mask';
      const ICON_ELYTRA = 'fa-feather';

      const renderCapeState = () => {
        const cur = viewer?.playerObject?.backEquipment;
        const isCape = cur !== 'elytra';
        const icon = isCape ? ICON_CAPE : ICON_ELYTRA;
        toggle.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i> Cape/Elytra`;
        toggle.title = isCape ? 'Zeigt gerade: Cape' : 'Zeigt gerade: Elytra';
        toggle.setAttribute('aria-pressed', isCape ? 'true' : 'false');
      };

      // für andere Stellen (z.B. applyAnimation) verfügbar machen
      toggle._renderCapeState = renderCapeState;

      toggle._capeHandler = () => {
        if (!viewer?.playerObject) return;
        const cur = viewer.playerObject.backEquipment;
        viewer.playerObject.backEquipment = cur === 'elytra' ? 'cape' : 'elytra';
        scheduleDraw();
        renderCapeState();
      };
      toggle.addEventListener('click', toggle._capeHandler);

      // initial als Cape anzeigen
      try {
        viewer.playerObject.backEquipment = 'cape';
      } catch {}

      // initial UI sync
      try {
        renderCapeState();
      } catch {}
    })();

    function setupAnimationUI() {
      const footer = document.querySelector('.skin-modal footer');
      if (!footer) return;

      // Footer als flex-wrap markieren
      footer.classList.add('skin-footer');

      // Infotext links in eigener Zeile markieren (falls vorhanden)
      let hint = footer.querySelector('.footer-hint');
      if (!hint) {
        const candidate = Array.from(footer.children).find((el) =>
          /Ziehen\/zoomen|ESC/i.test(el.textContent || ''),
        );
        if (candidate) candidate.classList.add('footer-hint');
      }

      // --- Linke Button-Gruppe (Reset, Cape/Elytra) ---
      let left = footer.querySelector('.footer-left');
      if (!left) {
        left = document.createElement('div');
        left.className = 'footer-left';
        // Fallback-Styles, falls keine CSS-Datei angepasst wurde:
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '.5rem';
        left.style.flexWrap = 'wrap';
        left.style.fontSize = '.95rem';
        left.style.lineHeight = '1.25';
      }

      // --- Rechte Gruppe (Dropdown etc.) ---
      let right = footer.querySelector('.footer-controls');
      if (!right) {
        right = document.createElement('div');
        right.className = 'footer-controls';
        right.style.marginLeft = 'auto';
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '.75rem';
        right.style.flexWrap = 'wrap';
        footer.appendChild(right);
      }

      // Linke Gruppe vor die rechte setzen (links ausrichten)
      if (right) footer.insertBefore(left, right);
      else footer.appendChild(left);

      // --- Buttons einsammeln: Reset & Cape/Elytra ---
      const resetBtn =
        footer.querySelector('#skin-modal-reset') || // ← deine echte ID
        footer.querySelector('#reset-btn') ||
        (typeof btnReset !== 'undefined' ? btnReset : null) ||
        footer.querySelector('button[data-role="reset"], button.reset');

      if (resetBtn && resetBtn.parentNode !== left) left.appendChild(resetBtn);

      const capeBtn = footer.querySelector('#cape-toggle');
      if (capeBtn && capeBtn.parentNode !== left) left.appendChild(capeBtn);

      // --- Dropdown "Animation" (dunkel, Label integriert) ---
      let select = footer.querySelector('#anim-select');
      let wrap = footer.querySelector('.select-wrap');
      let lbl = footer.querySelector('.select-wrap .select-label');

      // Rechte Gruppe existiert sicher – dort sitzt das Dropdown
      if (!select) {
        wrap = document.createElement('div');
        wrap.className = 'select-wrap';
        // Typo-Variablen (einheitliche Schrift / Abstände, falls kein externes CSS)
        wrap.style.setProperty('--ui-font', '.95rem');
        wrap.style.setProperty('--label-gap', '.6rem');

        lbl = document.createElement('span');
        lbl.className = 'select-label';
        lbl.textContent = 'Animation';

        select = document.createElement('select');
        select.id = 'anim-select';
        select.className = 'select select--dark';
        select.setAttribute('aria-label', 'Animation');

        [
          { v: 'rotate', t: 'Rotieren' },
          { v: 'none', t: 'Keine Animation' },
          { v: 'walk', t: 'Laufen' },
          { v: 'idle', t: 'Ruhig' },
          { v: 'fly', t: 'Fliegen' },
        ].forEach((o) => {
          const el = document.createElement('option');
          el.value = o.v;
          el.textContent = o.t;
          select.appendChild(el);
        });

        const defaultMode = !isCoarse && !isLowPowerMode ? 'rotate' : 'none';
        try {
          select.value = localStorage.getItem('skinAnimMode') || defaultMode;
        } catch {
          select.value = defaultMode;
        }

        wrap.appendChild(lbl);
        wrap.appendChild(select);
        right.appendChild(wrap);
      } else {
        // vorhandenes Select upgraden / korrekt platzieren
        select.classList.remove('select--yellow');
        if (!select.classList.contains('select--dark')) {
          select.classList.add('select--dark');
        }

        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'select-wrap';
          wrap.style.setProperty('--ui-font', '.95rem');
          wrap.style.setProperty('--label-gap', '.6rem');

          lbl = document.createElement('span');
          lbl.className = 'select-label';
          lbl.textContent = 'Animation';

          if (select.parentNode) select.parentNode.insertBefore(wrap, select);
          wrap.appendChild(lbl);
          wrap.appendChild(select);
        } else if (!lbl) {
          lbl = document.createElement('span');
          lbl.className = 'select-label';
          lbl.textContent = 'Animation';
          wrap.insertBefore(lbl, select);
        }
        if (wrap.parentNode !== right) right.appendChild(wrap);
      }

      // Change-Handler frisch binden
      if (select._animHandler) select.removeEventListener('change', select._animHandler);
      select._animHandler = () => {
        applyAnimation(select.value);
        try {
          localStorage.setItem('skinAnimMode', select.value);
        } catch {}
      };
      select.addEventListener('change', select._animHandler);

      // Labelbreite messen → linkes Padding des Selects setzen (keine Überlagerung)
      const updateLabelWidth = () => {
        const w = Math.ceil(lbl?.getBoundingClientRect().width || 0);
        wrap?.style.setProperty('--label-w', w ? `${w}px` : '6ch');
        // Falls kein externes CSS gesetzt ist, sorge hier minimal für korrekte Ausrichtung:
        select.style.fontSize = 'var(--ui-font, .95rem)';
      };
      // einmal nach Layout + nach Fonts + bei Resize
      requestAnimationFrame(updateLabelWidth);
      try {
        document.fonts?.ready?.then(updateLabelWidth);
      } catch {}
      if (!wrap._labelMeasureBound) {
        window.addEventListener('resize', updateLabelWidth, { passive: true });
        wrap._labelMeasureBound = true; // nicht mehrfach binden
      }

      // Beim (Neu-)Öffnen direkt auf den Viewer anwenden
      applyAnimation(select.value);
    }

    setupAnimationUI();

    // Einmal zeichnen
    scheduleDraw();

    // Resize beobachten
    try {
      ro = new ResizeObserver((entries) => {
        if (!viewer || !isAlive) return;
        // während Animationen nicht flackern:
        if (animRafId) {
          pendingResize = true;
          return;
        }

        const entry = entries[0];
        const dpr =
          typeof dprOverride === 'number'
            ? dprOverride
            : isCoarse
              ? 1
              : Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.max(2, Math.floor(entry.contentRect.width * dpr));
        const ch = Math.max(2, Math.floor(entry.contentRect.height * dpr));
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = entry.contentRect.width + 'px';
        canvas.style.height = entry.contentRect.height + 'px';

        viewer.setSize(canvas.width, canvas.height);
        viewer.camera.updateProjectionMatrix?.();
        controls?.update?.();
        scheduleDraw();
      });
      ro.observe(wrap);
    } catch {}

    // Controls-Events koppeln (on-demand frames)
    attachControlEvents(controls);

    // Sichtbarkeit: pausieren, wenn Tab/Modal nicht sichtbar
    cancelLoop();
    // Ein einzelner visibilitychange-Handler, der beim Schließen entfernt wird
    onVisChange = () => {
      if (document.hidden) {
        try {
          stopAllAnimations && stopAllAnimations();
        } catch {}
        try {
          cancelLoop && cancelLoop();
        } catch {}
      } else {
        const sel = document.getElementById('anim-select');
        if (sel && typeof applyAnimation === 'function') applyAnimation(sel.value);
        else if (typeof scheduleDraw === 'function') scheduleDraw();
      }
    };
    document.addEventListener('visibilitychange', onVisChange, { passive: true });
  }

  // Reset

  // Sofort öffnen und initialisieren (kein zweiter Klick nötig)
  openModal();
  bindCloseHandlers();
  try {
    await initViewer();
    bindCloseHandlers();
    bindResetHandler();
  } catch (e) {
    console.error(e);
    setStatus(String(e));
  }
}
