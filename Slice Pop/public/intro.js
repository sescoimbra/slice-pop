(function () {
  'use strict';
  const intro = document.getElementById('creatorIntro');
  const logo = document.getElementById('creatorLogo');
  if (!intro || !logo) return;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const timers = new Set();
  const content = [...document.querySelectorAll('#app, .ranking-dialog')];
  const inertBefore = content.map(node => Boolean(node.inert));
  let done = false;
  let started = false;

  function later(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id);
    return id;
  }
  function finish() {
    if (done) return;
    done = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    logo.removeEventListener('load', revealLogo);
    logo.removeEventListener('error', finish);
    motion?.removeEventListener?.('change', onMotion);
    intro.removeEventListener('animationend', onFailsafe);
    intro.hidden = true;
    content.forEach((node, index) => { node.inert = inertBefore[index]; });
    window.dispatchEvent?.(new Event('slice-pop:intro-finished'));
    if (intro.contains(document.activeElement)) {
      document.getElementById('enterCourtBtn')?.focus({ preventScroll: true });
    }
  }
  function revealLogo() {
    if (done || started) return;
    started = true;
    clearTimeout(loadTimeout);
    timers.delete(loadTimeout);
    // Establish the transparent first frame even when the image is cached.
    void logo.offsetWidth;
    intro.classList.add('is-visible');
    later(() => {
      intro.classList.add('is-leaving');
      later(() => {
        intro.classList.add('is-revealing');
        later(finish, 350);
      }, 500);
    }, 1600); // 600 ms fade-in + 1000 ms at full visibility.
  }
  function onMotion(event) { if (event.matches) finish(); }
  function onFailsafe(event) {
    if (event.target === intro && event.animationName === 'introFailsafe') finish();
  }

  // An update or browser refresh resumes the app without replaying its launch.
  const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
  if (motion?.matches || navigation?.type === 'reload') { finish(); return; }
  content.forEach(node => { node.inert = true; });
  motion?.addEventListener?.('change', onMotion);
  intro.addEventListener('animationend', onFailsafe);
  intro.focus({ preventScroll: true });
  // Neither a slow image nor a failed load should block guest play.
  const loadTimeout = later(finish, 3000);
  logo.addEventListener('load', revealLogo);
  logo.addEventListener('error', finish);
  if (logo.complete) {
    if (logo.naturalWidth > 0) revealLogo();
    else finish();
  }
})();
