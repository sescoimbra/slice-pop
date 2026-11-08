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
  let authMode = 'login';
  let authBusy = false;
  let recoveryMode = false;
  let handledAuthReturn = false;
  let playerRequest = 0;
  const online = () => navigator.onLine !== false;
  const errorText = error => error instanceof Error ? error.message : 'Não foi possível concluir o pedido. Tenta novamente.';

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
    el('competeBtn').textContent = client.available ? (player ? 'JOGAR PARA O RANKING' : 'ENTRAR E COMPETIR') : (player ? 'A MINHA CONTA' : 'ENTRAR / CRIAR CONTA');
    el('signInView').classList.toggle('hidden', Boolean(player) || recoveryMode);
    el('profileView').classList.toggle('hidden', !player || recoveryMode);
    el('recoveryView').classList.toggle('hidden', !recoveryMode);
    el('accountTitle').textContent = recoveryMode ? 'Nova palavra-passe' : player ? 'O teu lugar no court' : 'Entra no court';
    el('rankedPlayBtn').disabled = !client.available || !player?.nickname || starting;
    el('rankedPlayBtn').classList.toggle('hidden', !client.available);
    el('profileRankingNote').classList.toggle('hidden', client.available);
    el('rankingNickname').value = player?.nickname || '';
    const authDisabled = !client.authAvailable || !online() || authBusy;
    for (const id of ['googleSignInBtn', 'emailSignInBtn', 'authResetBtn', 'authLoginMode', 'authSignUpMode', 'savePasswordBtn', 'signOutBtn']) el(id).disabled = authDisabled;
    el('nicknameForm').querySelector('button').disabled = authDisabled;
    el('rankingRefreshBtn').classList.toggle('hidden', !client.available || !online());
    el('authAvailability').classList.toggle('hidden', client.authAvailable && online());
    el('authAvailability').textContent = online()
      ? 'As contas estão temporariamente indisponíveis. Podes continuar a jogar livremente.'
      : 'Estás offline. Podes jogar livremente e entrar na conta quando tiveres ligação.';
    el('authLoginMode').setAttribute('aria-pressed', String(authMode !== 'signup'));
    el('authSignUpMode').setAttribute('aria-pressed', String(authMode === 'signup'));
    el('authPasswordField').classList.toggle('hidden', authMode === 'reset');
    el('authConfirmField').classList.toggle('hidden', authMode !== 'signup');
    el('authPasswordHelp').classList.toggle('hidden', authMode !== 'signup');
    el('rankingPassword').required = authMode !== 'reset';
    el('rankingPassword').disabled = authMode === 'reset';
    el('rankingPassword').minLength = authMode === 'signup' ? 8 : 1;
    el('rankingPassword').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
    el('rankingPasswordConfirm').disabled = authMode !== 'signup';
    el('rankingPasswordConfirm').required = authMode === 'signup';
    el('emailSignInBtn').textContent = authMode === 'signup' ? 'CRIAR CONTA' : authMode === 'reset' ? 'ENVIAR LINK DE RECUPERAÇÃO' : 'ENTRAR';
    el('authResetBtn').classList.toggle('hidden', authMode === 'reset');
    el('emailSignInForm').setAttribute('aria-busy', String(authBusy));
    el('passwordRecoveryForm').setAttribute('aria-busy', String(authBusy));
    el('accountDialog').querySelector('.guest-return').textContent = 'VOLTAR AO COURT';
  }
  async function refreshPlayer() {
    const request = ++playerRequest;
    try {
      const result = await client.getPlayer();
      if (request !== playerRequest) return;
      player = result;
    }
    catch (error) { el('accountStatus').textContent = errorText(error); }
    if (request !== playerRequest) return;
    const state = window.TennisSlicePopRankingAdapter?.state;
    recoveryMode = Boolean(state?.recovery && player);
    renderPlayer();
    if (recoveryMode || (!handledAuthReturn && (state?.returned || state?.error))) {
      handledAuthReturn = true;
      showAccount(state?.error || (recoveryMode ? 'Confirma a tua nova palavra-passe.' : player ? 'Entrada concluída. Bem-vindo ao court.' : 'O link não permitiu entrar. Tenta novamente.'));
    }
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
    if (ranked && !client.available) { showAccount('As classificações estão em preparação. Podes continuar a jogar livremente.'); return; }
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
      el('rankedPlayBtn').disabled = !client.available || !player?.nickname;
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
  function clearPasswords() {
    for (const id of ['rankingPassword', 'rankingPasswordConfirm', 'newPassword', 'newPasswordConfirm']) el(id).value = '';
  }
  function setAuthMode(mode) {
    if (authBusy) return;
    authMode = mode;
    clearPasswords();
    el('accountStatus').textContent = mode === 'reset' ? 'Indica o email da tua conta para receberes um link de recuperação.' : '';
    renderPlayer();
  }
  async function authAction(action) {
    if (authBusy || !client.authAvailable || !online()) return;
    authBusy = true;
    el('accountStatus').textContent = 'A ligar ao clube…';
    renderPlayer();
    try { await action(); }
    catch (error) { el('accountStatus').textContent = errorText(error); }
    finally { authBusy = false; renderPlayer(); }
  }
  el('authLoginMode').addEventListener('click', () => setAuthMode('login'));
  el('authSignUpMode').addEventListener('click', () => setAuthMode('signup'));
  el('authResetBtn').addEventListener('click', () => setAuthMode('reset'));
  el('googleSignInBtn').addEventListener('click', async () => {
    await authAction(async () => {
      clearPasswords();
      await client.signInGoogle();
    });
  });
  el('emailSignInForm').addEventListener('submit', async event => {
    event.preventDefault();
    const email = el('rankingEmail').value.trim();
    const password = el('rankingPassword').value;
    if (authMode === 'signup' && password !== el('rankingPasswordConfirm').value) {
      el('accountStatus').textContent = 'As palavras-passe não coincidem.';
      return;
    }
    await authAction(async () => {
      if (authMode === 'reset') {
        await client.resetPassword(email);
        el('accountStatus').textContent = 'Se existir uma conta com este email, receberás um link para recuperar a palavra-passe. Confirma também o spam.';
      } else if (authMode === 'signup') {
        const result = await client.signUp(email, password);
        clearPasswords();
        await refreshPlayer();
        el('accountStatus').textContent = result.signedIn ? 'Conta criada. Bem-vindo ao court.' : 'Verifica o teu email para confirmar a conta. Se já estiveres registado, entra ou recupera a palavra-passe. Confirma também o spam.';
      } else {
        await client.signInEmail(email, password);
        clearPasswords();
        await refreshPlayer();
        el('accountStatus').textContent = 'Entrada concluída. Bem-vindo ao court.';
      }
    });
  });
  el('passwordRecoveryForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (el('newPassword').value !== el('newPasswordConfirm').value) {
      el('accountStatus').textContent = 'As palavras-passe não coincidem.';
      return;
    }
    await authAction(async () => {
      await client.updatePassword(el('newPassword').value);
      clearPasswords();
      await refreshPlayer();
      el('accountStatus').textContent = 'Palavra-passe atualizada. Já podes voltar ao court.';
    });
  });
  el('nicknameForm').addEventListener('submit', async event => {
    event.preventDefault();
    const nickname = el('rankingNickname').value;
    await authAction(async () => {
      player = await client.saveNickname(nickname);
      renderPlayer();
      el('accountStatus').textContent = 'Nickname guardado na tua conta.';
    });
  });
  el('signOutBtn').addEventListener('click', async () => {
    await authAction(async () => {
      await client.signOut();
      ++playerRequest;
      player = null;
      recoveryMode = false;
      clearPasswords();
      el('rankingEmail').value = '';
      renderPlayer();
      el('accountStatus').textContent = 'Saíste da conta. Podes continuar a jogar como convidado.';
    });
  });
  el('accountDialog').addEventListener('close', clearPasswords);
  window.addEventListener('slice-pop:auth-changed', refreshPlayer);
  window.addEventListener('online', () => { refreshPlayer(); refreshDaily(); if (el('rankingDialog').open) loadLeaderboard(); });
  window.addEventListener('offline', () => { renderPlayer(); refreshDaily(); if (el('rankingDialog').open) loadLeaderboard(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && core.lisbonDay() !== displayedDay) refreshDaily();
  });
  refreshPlayer();
  refreshDaily();
})();
