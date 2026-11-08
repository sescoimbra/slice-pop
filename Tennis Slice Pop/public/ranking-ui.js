(function () {
  'use strict';
  const core = window.TennisSlicePopRanking;
  const client = core.createClient(window.TennisSlicePopRankingAdapter);
  // Keep the shared target separate from new free-play rounds.
  const friendChallenge = window.TennisSlicePopGame.challenge;
  const el = id => document.getElementById(id);
  let player = null;
  let period = 'day';
  let competition = 'daily';
  let activeMatch = null;
  let pendingResult = null;
  let lastPlay = { mode: 'free', ranked: false };
  let selectedMode = 'free';
  let dailyReady = false;
  let starting = false;
  let submitting = false;
  let boardRequest = 0;
  let dailyRequest = 0;
  let displayedDay = '';
  const online = () => navigator.onLine !== false;
  const errorText = error => error instanceof Error ? error.message : 'Não foi possível ligar ao ranking. Tenta novamente.';

  function openDialog(id) {
    for (const dialog of document.querySelectorAll('.ranking-dialog[open]')) dialog.close();
    el(id).showModal();
  }
  function closeDialogs() {
    for (const dialog of document.querySelectorAll('.ranking-dialog[open]')) dialog.close();
  }
  function renderPlayer() {
    el('accountBtn').textContent = player?.nickname || (player ? 'ESCOLHER NICKNAME' : 'ENTRAR');
    el('playerNote').textContent = player?.nickname ? `Olá, ${player.nickname}. O court espera por ti.` : 'Sem conta. Sem esperar. Só jogar.';
    el('competeBtn').textContent = player ? 'JOGAR PARA O RANKING' : 'ENTRAR E COMPETIR';
    el('signInView').classList.toggle('hidden', Boolean(player));
    el('profileView').classList.toggle('hidden', !player);
    el('rankedPlayBtn').disabled = !player?.nickname;
    el('rankingNickname').value = player?.nickname || '';
    el('googleSignInBtn').disabled = !client.available || !online();
    el('emailSignInBtn').disabled = !client.available || !online();
    el('rankingRefreshBtn').classList.toggle('hidden', !client.available || !online());
    el('authAvailability').classList.toggle('hidden', client.available && online());
    el('authAvailability').textContent = online()
      ? 'As entradas no ranking abrem em breve. Até lá, treina o Desafio do Dia.'
      : 'Estás offline. Podes jogar livremente e voltar ao ranking quando tiveres ligação.';
    el('accountDialog').querySelector('.guest-return').textContent = 'VOLTAR AO COURT';
  }
  async function refreshPlayer() {
    try { player = await client.getPlayer(); }
    catch (error) { el('accountStatus').textContent = errorText(error); }
    renderPlayer();
  }
  function renderMode() {
    el('freeModeBtn').setAttribute('aria-pressed', String(selectedMode === 'free'));
    el('dailyPlayBtn').setAttribute('aria-pressed', String(selectedMode === 'daily'));
    el('dailyDetails').classList.toggle('hidden', selectedMode !== 'daily');
    el('playBtn').disabled = starting;
    el('dailyStartBtn').disabled = starting || !dailyReady;
    el('challengeBanner').disabled = starting;
    el('playBtn').setAttribute('aria-label', 'Jogar livremente');
  }
  function selectMode(mode) {
    selectedMode = mode;
    renderMode();
  }
  async function refreshDaily() {
    const request = ++dailyRequest;
    dailyReady = false;
    el('dailyPlayBtn').disabled = true;
    renderMode();
    try {
      const challenge = client.available && online()
        ? await client.getDailyChallenge() : await core.practiceChallenge();
      if (request !== dailyRequest) return;
      displayedDay = challenge.day;
      el('dailyDate').textContent = `${challenge.day.slice(8)}.${challenge.day.slice(5, 7)}`;
      const caption = !online() ? 'Treino offline. Não entra nas classificações.'
        : client.available ? 'Desafio aberto. Treina ou entra para competir.' : 'Treino diário. As classificações abrem em breve.';
      el('dailyCaption').textContent = caption;
      dailyReady = true;
      el('dailyPlayBtn').disabled = starting;
      renderMode();
    } catch (error) {
      if (request !== dailyRequest) return;
      if (selectedMode === 'daily') selectMode('free');
      el('dailyCaption').textContent = 'O desafio está indisponível. O jogo livre continua à tua espera.';
    }
  }

  function emptyBoard(title, text, loading = false) {
    el('rankingRows').replaceChildren();
    el('rankingEmpty').classList.remove('hidden');
    el('rankingEmptyTitle').textContent = title;
    el('rankingEmptyText').textContent = text;
    el('rankingDialog').setAttribute('aria-busy', String(loading));
  }
  async function loadLeaderboard() {
    const request = ++boardRequest;
    const day = core.lisbonDay();
    el('rankingContext').textContent = `${period === 'day' ? day.split('-').reverse().join('.') : day.slice(0, 7).split('-').reverse().join('.')} · Hora de Lisboa · Melhor partida por jogador`;
    if (!online()) {
      emptyBoard('Fora de rede. Dentro do jogo.', 'Liga-te à internet para consultar as classificações. Podes continuar a treinar.');
      return;
    }
    if (!client.available) {
      emptyBoard('A primeira época está a chegar.', 'Estamos a preparar as classificações. Treina o teu rally e regressa para marcar o teu lugar.');
      return;
    }
    emptyBoard('A consultar o marcador…', 'A procurar as melhores partidas.', true);
    try {
      const rows = await client.getLeaderboard({ period, mode: competition, limit: 50, rules_version: core.RULES_VERSION });
      if (request !== boardRequest) return;
      if (!Array.isArray(rows)) throw new Error('Não foi possível carregar a classificação.');
      el('rankingDialog').setAttribute('aria-busy', 'false');
      if (!rows.length) {
        emptyBoard('O primeiro lugar está livre.', 'Ainda não há partidas neste período. Entra e estreia este court.');
        return;
      }
      const fragment = document.createDocumentFragment();
      rows.slice(0, 50).forEach((row, index) => {
        const tr = document.createElement('tr');
        [index + 1, row.nickname, row.score, row.max_rally].forEach(value => {
          const td = document.createElement('td');
          td.textContent = String(value ?? '—');
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      });
      el('rankingRows').replaceChildren(fragment);
      el('rankingEmpty').classList.add('hidden');
    } catch (error) {
      if (request === boardRequest) emptyBoard('O marcador fez uma pausa.', errorText(error));
    }
  }
  function showRankings() {
    openDialog('rankingDialog');
    loadLeaderboard();
  }
  function showAccount(message = '') {
    el('accountStatus').textContent = message;
    renderPlayer();
    el('rankedPlayBtn').textContent = competition === 'daily' ? 'COMPETIR NO DESAFIO DO DIA' : 'COMPETIR NO JOGO LIVRE';
    openDialog('accountDialog');
  }

  async function play(mode = 'free', ranked = false, friend = false) {
    if (starting || window.TennisSlicePopGame.phase === 'playing' || (friend && !friendChallenge)) return;
    if (ranked && (!player || !player.nickname)) { showAccount(); return; }
    if (ranked && pendingResult) {
      showAccount('Envia primeiro o resultado pendente no ecrã de fim. Podes continuar a jogar livremente.');
      return;
    }
    // Unlock audio inside the player's gesture, before seed/session requests.
    window.TennisSlicePopGame.prepareAudio?.();
    starting = true;
    renderMode();
    el('rankedPlayBtn').disabled = true;
    el('dailyPlayBtn').disabled = true;
    try {
      let seed = friend ? friendChallenge.seed : window.TennisSlicePopGame.createSeed();
      let session = null;
      if (ranked) {
        if (!online()) throw new Error('Precisas de ligação para iniciar uma partida de ranking.');
        el('accountStatus').textContent = 'A reservar o teu lugar no court…';
        session = await client.startMatch(mode);
        if (!session || typeof session.session_id !== 'string' || !session.session_id ||
            session.rules_version !== core.RULES_VERSION || !Number.isInteger(session.seed) ||
            session.seed < 0 || session.seed > 0xFFFFFFFF) {
          throw new Error('Não foi possível preparar esta partida. Tenta novamente.');
        }
        seed = session.seed;
      } else if (mode === 'daily') {
        // Fetch again at play time so a lobby left open across midnight stays current.
        const challenge = client.available && online()
          ? await client.getDailyChallenge() : await core.practiceChallenge();
        seed = challenge.seed;
      }
      activeMatch = session;
      lastPlay = { mode, ranked, friend };
      closeDialogs();
      const options = { mode, seed };
      if (friend) options.challenge = true;
      window.TennisSlicePopGame.start(options);
    } catch (error) {
      showAccount(errorText(error));
    } finally {
      starting = false;
      el('rankedPlayBtn').disabled = !player?.nickname;
      el('dailyPlayBtn').disabled = !dailyReady;
      renderMode();
    }
  }

  async function submitPending() {
    if (!pendingResult || submitting) return;
    submitting = true;
    const pending = pendingResult;
    el('retrySubmitBtn').classList.add('hidden');
    el('submissionStatus').textContent = 'A enviar a tua partida…';
    try {
      const receipt = await client.submitMatch(pending.sessionId, pending.result);
      if (!receipt || receipt.accepted !== true) throw new Error('O servidor ainda não confirmou o resultado. Tenta enviar novamente.');
      pendingResult = null;
      el('submissionStatus').textContent = 'Resultado aceite. O teu lugar no court está marcado.';
      el('resultRankingBtn').textContent = 'VER CLASSIFICAÇÕES ↗';
    } catch (error) {
      el('submissionStatus').textContent = errorText(error);
      el('retrySubmitBtn').classList.remove('hidden');
    } finally { submitting = false; }
  }

  window.addEventListener('slice-pop:round-ended', event => {
    el('retrySubmitBtn').classList.add('hidden');
    if (activeMatch) {
      pendingResult = { sessionId: activeMatch.session_id, result: core.matchPayload(event.detail) };
      activeMatch = null;
      submitPending();
    } else if (pendingResult) {
      el('submissionStatus').textContent = 'A partida anterior ainda tem um resultado por enviar. O teu treino ficou guardado como recorde local.';
      el('retrySubmitBtn').classList.remove('hidden');
    } else {
      el('submissionStatus').textContent = `${event.detail.mode === 'daily' ? 'Treino do Desafio do Dia' : 'Partida livre'} · ${Math.round(event.detail.duration_ms / 1000)}s.`;
      el('resultRankingBtn').textContent = 'ENTRAR NO RANKING ↗';
    }
  });
  window.TennisSlicePopLobby = Object.freeze({
    play: () => play('free'),
    challenge: () => play('free', false, true),
    replay: () => play(lastPlay.mode, lastPlay.ranked, lastPlay.friend),
  });
  el('rankingBtn').addEventListener('click', showRankings);
  el('accountBtn').addEventListener('click', () => showAccount());
  el('dailyStartBtn').addEventListener('click', () => play('daily'));
  el('freeModeBtn').addEventListener('click', () => selectMode('free'));
  el('dailyPlayBtn').addEventListener('click', () => selectMode('daily'));
  renderMode();
  el('rankingRefreshBtn').addEventListener('click', loadLeaderboard);
  el('rankingMode').addEventListener('change', () => { competition = el('rankingMode').value; loadLeaderboard(); });
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period;
    document.querySelectorAll('[data-period]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    loadLeaderboard();
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  el('competeBtn').addEventListener('click', () => showAccount());
  el('rankedPlayBtn').addEventListener('click', () => play(competition, true));
  el('resultRankingBtn').addEventListener('click', () => {
    if (lastPlay.ranked) showRankings();
    else showAccount('Esta partida foi de treino. Entra para começar uma nova partida para o ranking.');
  });
  el('retrySubmitBtn').addEventListener('click', submitPending);
  el('googleSignInBtn').addEventListener('click', async () => {
    el('googleSignInBtn').disabled = true;
    try { await client.signInGoogle(); }
    catch (error) { el('accountStatus').textContent = errorText(error); }
    finally { renderPlayer(); }
  });
  el('emailSignInForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client.available || !online()) return;
    el('emailSignInBtn').disabled = true;
    try {
      await client.sendMagicLink(el('rankingEmail').value.trim());
      el('accountStatus').textContent = 'Se o endereço for válido, vais receber um link para entrar. Confirma também o spam.';
    } catch (error) { el('accountStatus').textContent = errorText(error); }
    finally { renderPlayer(); }
  });
  el('nicknameForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      player = await client.saveNickname(el('rankingNickname').value);
      renderPlayer();
      el('accountStatus').textContent = 'Nickname guardado. Pronto para competir.';
    } catch (error) { el('accountStatus').textContent = errorText(error); }
  });
  el('signOutBtn').addEventListener('click', async () => {
    try {
      await client.signOut();
      player = null;
      renderPlayer();
      el('accountStatus').textContent = 'Saíste da conta. Podes continuar a jogar como convidado.';
    } catch (error) { el('accountStatus').textContent = errorText(error); }
  });
  window.addEventListener('slice-pop:auth-changed', refreshPlayer);
  window.addEventListener('online', () => { refreshPlayer(); refreshDaily(); if (el('rankingDialog').open) loadLeaderboard(); });
  window.addEventListener('offline', () => { renderPlayer(); refreshDaily(); if (el('rankingDialog').open) loadLeaderboard(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && core.lisbonDay() !== displayedDay) refreshDaily();
  });
  refreshPlayer();
  refreshDaily();
})();
