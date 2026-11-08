(function () {
  'use strict';
  const anchor = document.getElementById('settingsAnchor');
  const trigger = document.getElementById('settingsBtn');
  const menu = document.getElementById('settingsMenu');
  const audio = document.getElementById('settingsAudio');
  const audioState = document.getElementById('settingsAudioState');
  const music = document.getElementById('settingsMusic');
  const musicState = document.getElementById('settingsMusicState');
  const vibration = document.getElementById('settingsVibration');
  const vibrationState = document.getElementById('settingsVibrationState');
  if (!anchor || !trigger || !menu || !audio) return;

  function items() {
    return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].filter(item => !item.disabled);
  }
  function syncAudio() {
    audio.disabled = typeof window.SlicePopGame?.toggleSound !== 'function';
    const enabled = Boolean(window.SlicePopGame?.soundOn);
    audio.setAttribute('aria-checked', String(enabled));
    audioState.textContent = enabled ? 'ON' : 'OFF';
  }
  function syncVibration() {
    const supported = Boolean(window.SlicePopGame?.hapticsSupported) && typeof window.SlicePopGame?.toggleHaptics === 'function';
    vibration.disabled = !supported;
    const enabled = supported && Boolean(window.SlicePopGame?.hapticsOn);
    vibration.setAttribute('aria-checked', String(enabled));
    vibrationState.textContent = !supported ? 'INDISPONÍVEL' : enabled ? 'ON' : 'OFF';
  }
  function syncMusic() {
    music.disabled = typeof window.SlicePopGame?.toggleMusic !== 'function';
    const enabled = Boolean(window.SlicePopGame?.musicOn);
    music.setAttribute('aria-checked', String(enabled));
    musicState.textContent = enabled ? 'ON' : 'OFF';
  }
  function close(restoreFocus = false) {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function open(last = false) {
    syncAudio();
    syncMusic();
    syncVibration();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const enabled = items();
    (last ? enabled.at(-1) : enabled[0])?.focus();
  }
  function showInfo(id) {
    close(true);
    document.getElementById(id).showModal();
  }
  trigger.addEventListener('click', () => menu.hidden ? open() : close(true));
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); open(event.key === 'ArrowUp');
    }
  });
  menu.addEventListener('keydown', event => {
    const enabled = items();
    const current = enabled.indexOf(document.activeElement);
    let target;
    if (event.key === 'ArrowDown') target = enabled[(current + 1) % enabled.length];
    if (event.key === 'ArrowUp') target = enabled[(current - 1 + enabled.length) % enabled.length];
    if (event.key === 'Home') target = enabled[0];
    if (event.key === 'End') target = enabled.at(-1);
    if (target) { event.preventDefault(); target.focus(); }
    if (event.key === 'Tab') close(true);
  });
  document.addEventListener('keydown', event => {
    if (!menu.hidden && event.key === 'Escape') { event.preventDefault(); close(true); }
  });
  document.addEventListener('click', event => {
    if (!menu.hidden && !anchor.contains(event.target)) close();
  });
  audio.addEventListener('click', () => {
    if (audio.disabled) return;
    window.SlicePopGame.toggleSound();
    syncAudio();
  });
  window.addEventListener('slice-pop:audio-changed', syncAudio);
  music.addEventListener('click', () => {
    if (music.disabled) return;
    window.SlicePopGame.toggleMusic();
    syncMusic();
  });
  window.addEventListener('slice-pop:music-changed', syncMusic);
  vibration.addEventListener('click', () => {
    if (vibration.disabled) return;
    window.SlicePopGame.toggleHaptics();
    syncVibration();
  });
  window.addEventListener('slice-pop:haptics-changed', syncVibration);
  document.getElementById('settingsPrivacy').addEventListener('click', () => showInfo('privacyDialog'));
  document.getElementById('settingsAbout').addEventListener('click', () => showInfo('aboutDialog'));
  document.querySelectorAll('[data-settings-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  syncAudio();
  syncMusic();
  syncVibration();
})();
