/* Supabase Auth adapter. Ranking writes remain disabled until a server validates them. */
(function (root) {
  'use strict';
  function authError(error) {
    const messages = {
      invalid_credentials: 'Email ou palavra-passe incorretos.',
      email_not_confirmed: 'Confirma primeiro o teu email através do link que recebeste.',
      user_already_exists: 'Não foi possível concluir o Sign Up. Tenta fazer Login ou recuperar a palavra-passe.',
      email_exists: 'Não foi possível concluir o Sign Up. Tenta fazer Login ou recuperar a palavra-passe.',
      signup_disabled: 'O Sign Up está temporariamente indisponível.',
      provider_disabled: 'O Login com Google está temporariamente indisponível.',
      weak_password: 'Escolhe uma palavra-passe mais forte, com pelo menos 8 caracteres.',
      same_password: 'Escolhe uma palavra-passe diferente da anterior.',
      over_email_send_rate_limit: 'Foram pedidos demasiados emails. Aguarda um pouco e tenta novamente.',
      over_request_rate_limit: 'Demasiadas tentativas. Aguarda um pouco e tenta novamente.',
      email_address_not_authorized: 'O envio de emails ainda está em configuração. Podes fazer Login com Google.',
      email_address_invalid: 'Confirma se o endereço de email está correto.',
      otp_expired: 'Este link expirou ou já foi utilizado. Pede um novo link.',
      flow_state_expired: 'Este link expirou. Repete o Login ou a recuperação.',
      session_not_found: 'A sessão terminou. Faz Login novamente.',
    };
    if (messages[error?.code]) return new Error(messages[error.code]);
    if (error?.name === 'AuthSessionMissingError') return new Error(messages.session_not_found);
    if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
      return new Error('Não foi possível ligar. Verifica a ligação à internet e tenta novamente.');
    }
    return new Error('Não foi possível concluir o pedido. Tenta novamente ou usa outro método de Login.');
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
        const result = await client.auth.getUser();
        if (result.error) {
          if (['user_not_found', 'session_not_found', 'invalid_jwt', 'refresh_token_not_found'].includes(result.error.code) || result.error.name === 'AuthSessionMissingError') {
            try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
            rememberRecovery(false);
            return null;
          }
          throw authError(result.error);
        }
        return player(result.data.user);
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
        // The database trigger independently enforces this, including concurrent/direct API writes.
        const existing = player((await request('getUser')).user);
        if (!existing) throw new Error('Faz Login antes de escolheres o nickname.');
        if (existing.nickname) throw new Error('O teu nickname é definitivo e não pode ser alterado.');
        const data = await request('updateUser', { data: { nickname: normalized } });
        return player(data.user);
      },
      async signOut() {
        await ready;
        // The official SDK clears this device before trying to revoke its refresh token.
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error && error.name !== 'AuthRetryableFetchError') throw authError(error);
        rememberRecovery(false);
      },
      async deleteAccount({ confirmation }) {
        if (confirmation !== 'APAGAR') throw new Error('Escreve APAGAR para confirmar.');
        await ready;
        let result;
        try { result = await client.rpc('tennis_slice_pop_delete_account', { confirmation }); }
        catch (_) { throw new Error('Não foi possível confirmar a eliminação. Verifica a ligação e tenta novamente.'); }
        if (result.error || result.data !== true) {
          if (result.error?.code === 'PGRST202') throw new Error('A eliminação de conta ainda está em preparação. Tenta mais tarde.');
          throw new Error('Não foi possível confirmar a eliminação da conta. Tenta novamente.');
        }
        // Account deletion is already committed. A failed revocation must not report it as failed.
        try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
        rememberRecovery(false);
      },
    });
  }
  root.TennisSlicePopAuth = Object.freeze({ createAdapter, authError });
})(globalThis);
