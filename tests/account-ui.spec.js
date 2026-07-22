import { expect, test } from '@playwright/test';

const user = { id: 'user-1', name: 'Siv Testare', email: 'siv@example.test' };

async function waitForApp(page) {
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ));
}

async function openAccount(page) {
  await page.locator('#filterToggle').click();
  await page.locator('#filterFormalCard .card-title').click();
  const button = page.locator('#accountButton');
  await expect(button).toBeVisible();
  await button.click();
  return page.locator('#accountPopup');
}

function installAuthMock(page, options = {}) {
  const requests = [];
  const handlers = {
    getSession: () => options.session ?? null,
    login: () => options.login ?? { user },
    signup: () => options.signup ?? { user },
    logout: () => options.logout ?? { success: true }
  };
  page.on('request', request => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  return page.route('**/api/auth/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (options.networkDown && path.endsWith('/get-session')) {
      await route.abort('failed');
      return;
    }
    const response = path.endsWith('/get-session') ? handlers.getSession()
      : path.endsWith('/sign-in/email') ? handlers.login()
        : path.endsWith('/sign-up/email') ? handlers.signup()
          : path.endsWith('/sign-out') ? handlers.logout()
            : null;
    if (response?.error) {
      await route.fulfill({ status: response.error.status || 400, contentType: 'application/json', body: JSON.stringify(response.error) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  }).then(() => requests);
}

test('signed-out account UI logs in and out using only same-origin auth requests', async ({ page }) => {
  const requests = await installAuthMock(page);
  await page.goto('/#/index');
  await waitForApp(page);
  const popup = await openAccount(page);

  await expect(popup).toContainText('Inte inloggad');
  await popup.locator('#accountLoginEmail').fill(user.email);
  await popup.locator('#accountLoginForm input[name="password"]').fill('hemligt-losenord');
  await popup.locator('#accountLoginForm').press('Enter');
  await expect(popup.locator('#accountIdentity')).toHaveText(user.name);

  await popup.locator('#accountLogout').click();
  await expect(popup).toContainText('Inte inloggad');
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4186')).toBe(true);
  expect(requests.some(url => url.includes('/api/v1/characters'))).toBe(false);
  expect(requests.some(url => url.includes('/api/auth/sign-in/email'))).toBe(true);
  expect(requests.some(url => url.includes('/api/auth/sign-out'))).toBe(true);
});

test('existing session presents identity and account overlay preserves popup lifecycle', async ({ page }) => {
  await installAuthMock(page, { session: { session: { id: 'session-1' }, user } });
  await page.goto('/#/index');
  await waitForApp(page);
  const popup = await openAccount(page);

  await expect(popup.locator('#accountIdentity')).toHaveText(user.name);
  await expect(popup.locator('.db-modal')).toHaveAttribute('role', 'dialog');
  await expect(popup.locator('.db-modal')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#view-root')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(page.locator('#view-root')).toHaveAttribute('inert', '');
  await expect(page.locator('#filterPanel')).toBeVisible();
  await expect(page.locator('#accountButton')).toBeFocused();
});

test('signup sends Better Auth required fields when the server permits it', async ({ page }) => {
  const requests = await installAuthMock(page);
  await page.goto('/#/index');
  await waitForApp(page);
  const popup = await openAccount(page);

  await popup.locator('#accountShowSignup').click();
  await popup.locator('#accountSignupName').fill(user.name);
  await popup.locator('#accountSignupForm input[name="email"]').fill(user.email);
  await popup.locator('#accountSignupForm input[name="password"]').fill('hemligt-losenord');
  await popup.locator('#accountSignupForm').press('Enter');
  await expect(popup.locator('#accountIdentity')).toHaveText(user.name);
  expect(requests.some(url => url.includes('/api/auth/sign-up/email'))).toBe(true);
});

test('a session-network outage leaves the local application usable', async ({ page }) => {
  await installAuthMock(page, { networkDown: true });
  await page.goto('/#/index');
  await waitForApp(page);
  const popup = await openAccount(page);

  await expect(popup.locator('#accountMessage')).toContainText('Kontotjänsten är inte tillgänglig');
  await expect(page.locator('#view-root')).toHaveAttribute('aria-busy', 'false');
});

test('invalid credentials and disabled signup remain generic', async ({ page }) => {
  await installAuthMock(page, {
    login: { error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Raw Better Auth error' } },
    signup: { error: { status: 400, code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED', message: 'Raw Better Auth error' } }
  });
  await page.goto('/#/index');
  await waitForApp(page);
  const popup = await openAccount(page);

  await popup.locator('#accountLoginEmail').fill(user.email);
  await popup.locator('#accountLoginForm input[name="password"]').fill('hemligt-losenord');
  await popup.locator('#accountLoginForm').press('Enter');
  await expect(popup.locator('#accountMessage')).toContainText('Kunde inte logga in');
  await expect(popup).not.toContainText('INVALID_EMAIL_OR_PASSWORD');
  await popup.locator('#accountShowSignup').click();
  await popup.locator('#accountSignupName').fill(user.name);
  await popup.locator('#accountSignupForm input[name="email"]').fill(user.email);
  await popup.locator('#accountSignupForm input[name="password"]').fill('hemligt-losenord');
  await popup.locator('#accountSignupForm').press('Enter');
  await expect(popup.locator('#accountMessage')).toContainText('Kunde inte skapa kontot');
  await expect(popup).not.toContainText('EMAIL_PASSWORD_SIGN_UP_DISABLED');
});
