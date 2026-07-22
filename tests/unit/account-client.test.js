import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_STATUS, createAccountService } from '../../js/account-client.js';

function response(data, error = null) {
  return { data, error };
}

function authFixture(overrides = {}) {
  return {
    getSession: vi.fn().mockResolvedValue(response(null)),
    signIn: { email: vi.fn().mockResolvedValue(response(null)) },
    signUp: { email: vi.fn().mockResolvedValue(response(null)) },
    signOut: vi.fn().mockResolvedValue(response({ success: true })),
    ...overrides
  };
}

describe('account client state boundary', () => {
  it('turns an absent Better Auth session into signed-out state', async () => {
    const auth = authFixture();
    const account = createAccountService(auth);

    await account.resolveSession();

    expect(account.getState()).toEqual({ status: ACCOUNT_STATUS.SIGNED_OUT, session: null });
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it('keeps an existing Better Auth session as the signed-in identity', async () => {
    const session = { session: { id: 'session-1' }, user: { id: 'user-1', name: 'Siv', email: 'siv@example.test' } };
    const account = createAccountService(authFixture({ getSession: vi.fn().mockResolvedValue(response(session)) }));

    await account.resolveSession();

    expect(account.getState()).toEqual({ status: ACCOUNT_STATUS.SIGNED_IN, session });
  });

  it('uses the 1.6.24 email methods and updates directly from successful auth results', async () => {
    const user = { id: 'user-1', name: 'Siv', email: 'siv@example.test' };
    const auth = authFixture({
      signIn: { email: vi.fn().mockResolvedValue(response({ token: 'server-only-cookie-session', user })) },
      signUp: { email: vi.fn().mockResolvedValue(response({ token: 'server-only-cookie-session', user })) }
    });
    const account = createAccountService(auth);

    await expect(account.login({ email: user.email, password: 'secret' })).resolves.toMatchObject({ ok: true });
    expect(auth.signIn.email).toHaveBeenCalledWith({ email: user.email, password: 'secret' });
    expect(account.getState()).toMatchObject({ status: ACCOUNT_STATUS.SIGNED_IN, session: { user } });

    await expect(account.signup({ name: user.name, email: user.email, password: 'secret' })).resolves.toMatchObject({ ok: true });
    expect(auth.signUp.email).toHaveBeenCalledWith({ name: user.name, email: user.email, password: 'secret' });
  });

  it('returns to signed out after logout without invoking any character operation', async () => {
    const user = { id: 'user-1', name: 'Siv', email: 'siv@example.test' };
    const auth = authFixture({ getSession: vi.fn().mockResolvedValue(response({ session: { id: 'session-1' }, user })) });
    const account = createAccountService(auth);
    await account.resolveSession();

    await expect(account.logout()).resolves.toEqual({ ok: true });

    expect(account.getState()).toEqual({ status: ACCOUNT_STATUS.SIGNED_OUT, session: null });
    expect(Object.keys(auth)).toEqual(['getSession', 'signIn', 'signUp', 'signOut']);
  });

  it('keeps transport failures confined to unavailable account state and generic outcomes', async () => {
    const auth = authFixture({
      getSession: vi.fn().mockResolvedValue(response(null, { status: 503, message: 'database unavailable' })),
      signIn: { email: vi.fn().mockRejectedValue(new Error('network unavailable')) }
    });
    const account = createAccountService(auth);

    await account.resolveSession();
    expect(account.getState()).toEqual({ status: ACCOUNT_STATUS.UNAVAILABLE, session: null });
    await expect(account.login({ email: 'siv@example.test', password: 'secret' })).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('keeps credential rejections separate from network unavailability', async () => {
    const account = createAccountService(authFixture({
      signIn: { email: vi.fn().mockResolvedValue(response(null, { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })) }
    }));

    await expect(account.login({ email: 'siv@example.test', password: 'secret' }))
      .resolves.toEqual({ ok: false, reason: 'failed' });
  });
});
