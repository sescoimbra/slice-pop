(function (root) {
  'use strict';
  const storageKey = 'slice-pop-surface';
  const surfaces = Object.freeze({
    clay: { name: 'TERRA BATIDA', color: '#6d3829', description: 'Terracota quente. Linhas de cal. Espírito de clube.' },
    hard: { name: 'SINTÉTICO', color: '#193e46', description: 'Azul profundo. Contornos nítidos. Energia de torneio.' },
    grass: { name: 'RELVA', color: '#24432f', description: 'Verde natural. Faixas de relva. Elegância de court.' },
  });
  let current = 'clay';
  try {
    const saved = localStorage.getItem(storageKey);
    if (Object.hasOwn(surfaces, saved)) current = saved;
  } catch (e) { /* Private browsing still gets a working court. */ }

  function paint() {
    const surface = surfaces[current];
    document.documentElement.dataset.surface = current;
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', surface.color);
    document.querySelectorAll('[data-surface-option]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.surfaceOption === current));
    });
    document.querySelectorAll('[data-court-name]').forEach(label => { label.textContent = surface.name; });
    const description = document.getElementById('surfaceDescription');
    if (description) description.textContent = surface.description;
  }
  function select(surface) {
    if (!Object.hasOwn(surfaces, surface)) return false;
    current = surface;
    paint();
    try { localStorage.setItem(storageKey, current); } catch (e) { /* Keep the selection for this session. */ }
    return true;
  }
  function mount() {
    document.querySelectorAll('[data-surface-option]').forEach(button => {
      if (button.dataset.surfaceBound) return;
      button.dataset.surfaceBound = 'true';
      button.addEventListener('click', () => select(button.dataset.surfaceOption));
    });
    for (const id of ['courtLobbyBtn', 'menuCourtBackBtn']) {
      const back = document.getElementById(id);
      if (back && !back.dataset.courtBound) {
        back.dataset.courtBound = 'true';
        back.addEventListener('click', () => {
          document.getElementById('endScreen').classList.add('hidden');
          document.getElementById('startScreen').classList.add('hidden');
          document.getElementById('courtSelectScreen').classList.remove('hidden');
          root.TennisSlicePopGame?.syncMusic?.();
          document.querySelector('[data-surface-option][aria-pressed="true"]')?.focus();
        });
      }
    }
    const enter = document.getElementById('enterCourtBtn');
    if (enter && !enter.dataset.courtBound) {
      enter.dataset.courtBound = 'true';
      enter.addEventListener('click', () => {
        root.TennisSlicePopGame?.enterCourt?.();
        document.getElementById('courtSelectScreen').classList.add('hidden');
        document.getElementById('startScreen').classList.remove('hidden');
        document.getElementById('playBtn')?.focus({ preventScroll: true });
      });
    }
    paint();
  }
  // Apply saved colours in the head, before the first paint. No game RNG is used.
  paint();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  root.TennisSlicePopCourt = Object.freeze({ select, mount, get surface() { return current; } });
})(globalThis);
