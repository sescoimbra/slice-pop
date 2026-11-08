/* Shared rules and the adapter boundary. No backend credentials live here. */
(function (root) {
  'use strict';
  const RULES_VERSION = 'slice-pop-v1';

  function lisbonDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  async function practiceChallenge(date = new Date()) {
    if (!root.crypto?.subtle) throw new Error('Abre o jogo por HTTPS para preparar o desafio diário. O jogo livre continua disponível.');
    const day = lisbonDay(date);
    const bytes = new TextEncoder().encode(`slice-pop:daily:${day}:${RULES_VERSION}`);
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return { day, seed: new DataView(hash).getUint32(0, false), rules_version: RULES_VERSION };
  }

  function checkChallenge(challenge) {
    if (!challenge || !/^\d{4}-\d{2}-\d{2}$/.test(challenge.day) ||
        !Number.isInteger(challenge.seed) || challenge.seed < 0 || challenge.seed > 0xFFFFFFFF ||
        challenge.rules_version !== RULES_VERSION) {
      throw new Error('Este desafio precisa de uma versão atualizada do jogo.');
    }
    return challenge;
  }

  function normalizeNickname(value) {
    const nickname = value.normalize('NFKC').trim();
    if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(nickname)) {
      throw new Error('Usa 3 a 20 letras, números, _ ou -, sem espaços.');
    }
    return nickname;
  }

  function matchPayload(result) {
    // An explicit projection prevents identity/seed fields being sent as authority.
    return Object.fromEntries(['score', 'hits', 'max_rally', 'duration_ms', 'gold_hits', 'bomb_hits']
      .map(key => [key, result[key]]));
  }

  function createClient(adapter = null) {
    const available = Boolean(adapter);
    async function call(method, input) {
      if (!adapter || typeof adapter[method] !== 'function') {
        throw new Error('As entradas no ranking abrem em breve. Podes continuar a treinar.');
      }
      // Bound a stalled adapter so it cannot leave the lobby blocked indefinitely.
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(() => adapter[method](input)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('A ligação demorou demasiado. Tenta novamente.')), 15000);
          }),
        ]);
      } finally { clearTimeout(timer); }
    }
    return Object.freeze({
      available,
      getPlayer: () => available ? call('getPlayer') : Promise.resolve(null),
      getDailyChallenge: async () => checkChallenge(await call('getDailyChallenge')),
      getLeaderboard: filters => call('getLeaderboard', filters),
      signInGoogle: () => call('signInGoogle'),
      sendMagicLink: email => call('sendMagicLink', { email }),
      saveNickname: nickname => call('saveNickname', { nickname: normalizeNickname(nickname) }),
      signOut: () => call('signOut'),
      startMatch: mode => call('startMatch', { mode, rules_version: RULES_VERSION }),
      submitMatch: (sessionId, result) => call('submitMatch', {
        session_id: sessionId, ...matchPayload(result),
      }),
    });
  }

  root.TennisSlicePopRanking = Object.freeze({
    RULES_VERSION, lisbonDay, practiceChallenge, checkChallenge, normalizeNickname, matchPayload, createClient,
  });
})(globalThis);
