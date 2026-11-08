/* Supabase Auth adapter. Ranking writes remain disabled until a server validates them. */
(function (root) {
  'use strict';
  function authError(error) {
    const messages = {
      invalid_credentials: 'Email ou palavra-passe incorretos.',
      email_not_confirmed: 'Confirma primeiro o teu email através do link que recebeste.',
      user_already_exists: 'Não foi possível criar a conta. Tenta entrar ou recuperar a palavra-passe.',
      email_exists: 'Não foi possível criar a conta. Tenta entrar ou recuperar a palavra-passe.',
      signup_disabled: 'O registo está temporariamente indisponível.',
      provider_disabled: 'O login Google está temporariamente indisponível.',
      weak_password: 'Escolhe uma palavra-passe mais forte, com pelo menos 8 caracteres.',
      same_password: 'Escolhe uma palavra-passe diferente da anterior.',
      over_email_send_rate_limit: 'Foram pedidos demasiados emails. Aguarda um pouco e tenta novamente.',
      over_request_rate_limit: 'Demasiadas tentativas. Aguarda um pouco e tenta novamente.',
      email_address_not_authorized: 'O envio de emails ainda está em configuração. Podes entrar com Google.',
      email_address_invalid: 'Confirma se o endereço de email está correto.',
      otp_expired: 'Este link expirou ou já foi utilizado. Pede um novo link.',
      flow_state_expired: 'Este link expirou. Repete o pedido de entrada ou recuperação.',
      session_not_found: 'A sessão terminou. Volta a entrar na tua conta.',
    };
    if (messages[error?.code]) return new Error(messages[error.code]);
    if (error?.name === 'AuthSessionMissingError') return new Error(messages.session_not_found);
    if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
      return new Error('Não foi possível ligar. Verifica a ligação à internet e tenta novamente.');
    }
    return new Error('Não foi possível concluir o pedido. Tenta novamente ou usa outro método de entrada.');
  }
  function createAdapter(createClient, config) {
    const landing = new URL(root.location.href);
    const hash = new URLSearchParams(landing.hash.slice(1));
    const callback = hash.get('type') === 'recovery' ? 'recovery'
      : hash.has('access_token') || hash.has('error') || landing.searchParams.has('error') ? 'callback' : null;
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    let recovery = false;
    let initializationError = null;
    const recoveryKey = 'tennis-slice-pop-password-recovery';
    function rememberRecovery(value) {
      recovery = value;
      try {
        if (value) root.sessionStorage.setItem(recoveryKey, '1');
        else root.sessionStorage.removeItem(recoveryKey);
      } catch (_) { /* The current tab still supports recovery without storage. */ }
    }
    try { recovery = root.sessionStorage.getItem(recoveryKey) === '1'; } catch (_) {}
    const notify = event => root.setTimeout(() => {
      root.dispatchEvent(new root.CustomEvent('slice-pop:auth-changed', { detail: { event } }));
    }, 0);
    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') rememberRecovery(true);
      if (event === 'SIGNED_OUT') rememberRecovery(false);
      // Do not call an async Auth method while the SDK holds its session lock.
      notify(event);
    });
    const ready = client.auth.initialize().then(({ error }) => {
      if (error) initializationError = authError(error);
    }).catch(error => { initializationError = authError(error); }).then(() => {
      notify('INITIALIZED');
    });
    function redirect() {
      const url = new URL('./', root.location.href);
      return url.href;
    }
    function player(user) {
      if (!user) return null;
      let nickname = null;
      try {
        if (typeof user.user_metadata?.nickname === 'string') {
          nickname = root.TennisSlicePopRanking.normalizeNickname(user.user_metadata.nickname);
        }
      } catch (_) { /* Invalid legacy metadata is treated as an unset nickname. */ }
      return { nickname };
    }
    async function request(method, input) {
      await ready;
      try {
        const result = await client.auth[method](input);
        if (result.error) throw result.error;
        return result.data;
      } catch (error) { throw authError(error); }
    }
    function validPassword(password) {
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw new Error('Usa uma palavra-passe com 8 a 128 caracteres.');
      }
      return password;
    }
    return Object.freeze({
      authAvailable: true,
      rankingAvailable: false,
      get state() { return { recovery, returned: Boolean(callback), error: initializationError?.message || '' }; },
      async getPlayer() {
        await ready;
        const { data, error } = await client.auth.getSession();
        if (error) throw authError(error);
        if (!data.session) { rememberRecovery(false); return null; }
        if (root.navigator.onLine === false) return player(data.session.user);
        return player((await request('getUser')).user);
      },
      signInGoogle: () => request('signInWithOAuth', { provider: 'google', options: { redirectTo: redirect() } }),
      signInEmail: ({ email, password }) => request('signInWithPassword', { email, password }),
      async signUp({ email, password }) {
        const data = await request('signUp', {
          email, password: validPassword(password), options: { emailRedirectTo: redirect() },
        });
        return { signedIn: Boolean(data.session) };
      },
      async resetPassword({ email }) {
        await ready;
        try {
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
          if (error) throw error;
        } catch (error) { throw authError(error); }
      },
      async updatePassword({ password }) {
        await request('updateUser', { password: validPassword(password) });
        rememberRecovery(false);
        notify('PASSWORD_UPDATED');
      },
      async saveNickname({ nickname }) {
        const normalized = root.TennisSlicePopRanking.normalizeNickname(nickname);
        const data = await request('updateUser', { data: { nickname: normalized } });
        return player(data.user);
      },
      async signOut() {
        await request('signOut', { scope: 'local' });
        rememberRecovery(false);
      },
    });
  }
  root.TennisSlicePopAuth = Object.freeze({ createAdapter, authError });
})(globalThis);
