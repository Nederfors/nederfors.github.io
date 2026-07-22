import { ACCOUNT_STATUS, accountService } from './account-client.js';

const messages = Object.freeze({
  loginFailed: 'Kunde inte logga in. Kontrollera uppgifterna och försök igen.',
  signupFailed: 'Kunde inte skapa kontot just nu. Försök igen senare.',
  logoutFailed: 'Kunde inte logga ut just nu. Försök igen.',
  unavailable: 'Kontotjänsten är inte tillgänglig just nu. Appen och dina lokala rollpersoner fungerar fortfarande.'
});

let initialized = false;

function getToolbarRoot() {
  return document.querySelector('shared-toolbar')?.shadowRoot || null;
}

function setMessage(root, text = '') {
  const message = root?.getElementById('accountMessage');
  if (message) message.textContent = text;
}

function setBusy(root, busy) {
  root?.querySelectorAll('#accountLoginForm button, #accountSignupForm button, #accountLogout').forEach(button => {
    button.disabled = busy;
  });
}

function renderAccount(root, state) {
  const signedIn = state.status === ACCOUNT_STATUS.SIGNED_IN;
  const login = root?.getElementById('accountLoginForm');
  const signup = root?.getElementById('accountSignupForm');
  const signedInPanel = root?.getElementById('accountSignedIn');
  const showSignup = root?.getElementById('accountShowSignup');
  const showLogin = root?.getElementById('accountShowLogin');
  const identity = root?.getElementById('accountIdentity');
  const status = root?.getElementById('accountStatus');

  if (!login || !signup || !signedInPanel) return;
  login.hidden = signedIn;
  signup.hidden = true;
  signedInPanel.hidden = !signedIn;
  if (showSignup) showSignup.hidden = signedIn;
  if (showLogin) showLogin.hidden = true;

  if (signedIn) {
    const user = state.session?.user || {};
    identity.textContent = user.name || user.email || 'Inloggad';
    if (status) status.textContent = 'Inloggad';
    setMessage(root);
  } else if (state.status === ACCOUNT_STATUS.LOADING) {
    if (status) status.textContent = 'Kontrollerar konto…';
  } else if (state.status === ACCOUNT_STATUS.UNAVAILABLE) {
    if (status) status.textContent = 'Kontotjänsten är tillfälligt otillgänglig';
    setMessage(root, messages.unavailable);
  } else if (status) {
    status.textContent = 'Inte inloggad';
  }
}

function showSignup(root) {
  root.getElementById('accountLoginForm').hidden = true;
  root.getElementById('accountSignupForm').hidden = false;
  root.getElementById('accountShowSignup').hidden = true;
  root.getElementById('accountShowLogin').hidden = false;
  setMessage(root);
  root.getElementById('accountSignupName')?.focus({ preventScroll: true });
}

function showLogin(root) {
  root.getElementById('accountLoginForm').hidden = false;
  root.getElementById('accountSignupForm').hidden = true;
  root.getElementById('accountShowSignup').hidden = false;
  root.getElementById('accountShowLogin').hidden = true;
  setMessage(root);
  root.getElementById('accountLoginEmail')?.focus({ preventScroll: true });
}

function openAccountPopup(root, trigger) {
  const overlay = root?.getElementById('accountPopup');
  if (!overlay || !window.popupManager?.open) return;
  window.popupManager.open(overlay, {
    type: 'form',
    size: 'sm',
    layoutFamily: 'modal',
    mobileMode: 'sheet',
    touchProfile: 'sheet-down',
    trigger
  });
  // Session state is optional account work. Deferring it until the user opens
  // this surface keeps every local route independent of auth availability.
  void accountService.resolveSession();
}

function closeAccountPopup(root) {
  const overlay = root?.getElementById('accountPopup');
  if (overlay && window.popupManager?.close) window.popupManager.close(overlay, 'programmatic');
}

export function initAccountUi() {
  if (initialized) return;
  const root = getToolbarRoot();
  if (!root) return;
  initialized = true;

  accountService.subscribe(state => renderAccount(root, state));
  root.getElementById('accountButton')?.addEventListener('click', event => {
    openAccountPopup(root, event.currentTarget);
  });
  root.getElementById('accountClose')?.addEventListener('click', () => closeAccountPopup(root));
  root.getElementById('accountShowSignup')?.addEventListener('click', () => showSignup(root));
  root.getElementById('accountShowLogin')?.addEventListener('click', () => showLogin(root));

  root.getElementById('accountLoginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    setBusy(root, true);
    setMessage(root);
    const form = event.currentTarget;
    const result = await accountService.login({
      email: form.elements.email.value,
      password: form.elements.password.value
    });
    setBusy(root, false);
    if (!result.ok) setMessage(root, result.reason === 'unavailable' ? messages.unavailable : messages.loginFailed);
  });

  root.getElementById('accountSignupForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    setBusy(root, true);
    setMessage(root);
    const form = event.currentTarget;
    const result = await accountService.signup({
      name: form.elements.name.value,
      email: form.elements.email.value,
      password: form.elements.password.value
    });
    setBusy(root, false);
    if (!result.ok) setMessage(root, result.reason === 'unavailable' ? messages.unavailable : messages.signupFailed);
  });

  root.getElementById('accountLogout')?.addEventListener('click', async () => {
    setBusy(root, true);
    setMessage(root);
    const result = await accountService.logout();
    setBusy(root, false);
    if (!result.ok) setMessage(root, result.reason === 'unavailable' ? messages.unavailable : messages.logoutFailed);
  });

}
