(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  // Only replace a page that was already controlled, not the first install.
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  const pageVersion = document.querySelector('meta[name="slice-pop-version"]')?.getAttribute('content');
  let pending = false;
  let reloading = false;
  let observer;
  function applyUpdate() {
    if (!pending || reloading || window.TennisSlicePopGame?.phase === 'playing') return;
    const inMenu = ['courtSelectScreen', 'startScreen'].some(id => {
      const screen = document.getElementById(id);
      return screen && !screen.classList.contains('hidden');
    });
    // Keep the result screen intact for sharing and pending ranking submissions.
    if (!inMenu) return;
    reloading = true;
    observer?.disconnect();
    window.location.reload();
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return;
    const controller = navigator.serviceWorker.controller;
    if (!controller || !pageVersion || typeof MessageChannel === 'undefined') return;
    const channel = new MessageChannel();
    // A network navigation may already contain the new release. Activating its
    // worker must not reload that same release and replay the opening screen.
    const timeout = setTimeout(() => channel.port1.close(), 3000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      if (controller !== navigator.serviceWorker.controller ||
          typeof event.data?.version !== 'string' || event.data.version === pageVersion) return;
      pending = true;
      if (!observer) {
        observer = new MutationObserver(applyUpdate);
        for (const id of ['courtSelectScreen', 'startScreen']) {
          const screen = document.getElementById(id);
          if (screen) observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
        }
      }
      applyUpdate();
    };
    controller.postMessage({ type: 'slice-pop:version' }, [channel.port2]);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(error => console.error('Falha ao registar o service worker:', error));
  });
})();
