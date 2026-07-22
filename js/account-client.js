import { createAuthClient } from 'better-auth/client';

export const ACCOUNT_STATUS = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
  UNAVAILABLE: 'unavailable'
});

const defaultState = () => ({
  status: ACCOUNT_STATUS.LOADING,
  session: null
});

function unpackResponse(response) {
  if (response && typeof response === 'object' && ('data' in response || 'error' in response)) {
    return { data: response.data ?? null, error: response.error ?? null };
  }
  return { data: response ?? null, error: null };
}

function hasUser(data) {
  return Boolean(data?.user && typeof data.user === 'object');
}

function failureReason(error) {
  const status = Number(error?.status);
  return !Number.isFinite(status) || status === 0 || status >= 500 ? 'unavailable' : 'failed';
}

/**
 * Keeps the Better Auth client at the account boundary. Consumers only receive
 * session-shaped state and generic operation outcomes, never transport errors.
 */
export function createAccountService(authClient) {
  let state = defaultState();
  const listeners = new Set();

  const publish = next => {
    state = Object.freeze(next);
    listeners.forEach(listener => listener(state));
    return state;
  };

  const setSession = data => publish(hasUser(data)
    ? { status: ACCOUNT_STATUS.SIGNED_IN, session: data }
    : { status: ACCOUNT_STATUS.SIGNED_OUT, session: null });

  const setUnavailable = () => publish({
    status: ACCOUNT_STATUS.UNAVAILABLE,
    session: state.session || null
  });

  const invoke = async operation => {
    try {
      return unpackResponse(await operation());
    } catch {
      return { data: null, error: new Error('Account network request failed.') };
    }
  };

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async resolveSession() {
      const { data, error } = await invoke(() => authClient.getSession());
      if (Number(error?.status) === 401) return setSession(null);
      if (error) return setUnavailable();
      return setSession(data);
    },
    async login({ email, password }) {
      const { data, error } = await invoke(() => authClient.signIn.email({ email, password }));
      if (error || !hasUser(data)) return { ok: false, reason: error ? failureReason(error) : 'failed' };
      setSession(data);
      return { ok: true, session: data };
    },
    async signup({ name, email, password }) {
      const { data, error } = await invoke(() => authClient.signUp.email({ name, email, password }));
      if (error || !hasUser(data)) return { ok: false, reason: error ? failureReason(error) : 'failed' };
      setSession(data);
      return { ok: true, session: data };
    },
    async logout() {
      const { data, error } = await invoke(() => authClient.signOut());
      if (error || data?.success !== true) return { ok: false, reason: error ? failureReason(error) : 'failed' };
      publish({ status: ACCOUNT_STATUS.SIGNED_OUT, session: null });
      return { ok: true };
    }
  });
}

// Better Auth 1.6.24 requires an absolute base URL. Deriving it from the
// current origin preserves the same-origin `/api/auth/*` boundary.
const accountBaseUrl = typeof window === 'undefined'
  ? 'http://localhost/api/auth'
  : new URL('/api/auth', window.location.origin).toString();

export const accountService = createAccountService(createAuthClient({ baseURL: accountBaseUrl }));
