/**
 * CogiCore — Module Authentification
 * PBKDF2 + SHA-256. Lockout 3 tentatives / 30s.
 */
'use strict';

window.Auth = (() => {
  let _attempts = 0;
  let _lockUntil = 0;
  let _currentUser = null;
  let _lockTimer = null;

  async function hashPwd(pwd) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd + '_cogicore_salt'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function login() {
    if (Date.now() < _lockUntil) return;

    const settings = await DB.getSettings();
    const users    = settings.users || [];
    const input    = document.getElementById('pinInput').value;
    const errEl    = document.getElementById('loginError');
    const attEl    = document.getElementById('loginAttempts');
    errEl.textContent = '';

    // Sélection utilisateur
    const selEl = document.getElementById('loginUserSelect');
    const userName = selEl.options.length > 0 ? selEl.value : (users[0]?.nom || '');
    const user = users.find(u => u.nom === userName);
    if (!user) { errEl.textContent = 'Utilisateur introuvable.'; return; }

    const hashed = await hashPwd(input);
    if (hashed !== user.pinHash) {
      _attempts++;
      if (_attempts >= 3) {
        _lockUntil = Date.now() + 30_000;
        _attempts  = 0;
        startLockCountdown();
      } else {
        errEl.textContent   = 'Mot de passe incorrect.';
        attEl.style.display = 'block';
        attEl.textContent   = `Tentative ${_attempts}/3`;
      }
      return;
    }

    _currentUser = user;
    _attempts    = 0;
    attEl.style.display = 'none';

    // Initialiser la clé de chiffrement DB
    await DB.initKey(input, settings.salt || 'cogicore_default');

    // Mettre le rôle sur le body
    document.body.className = `role-${user.role || 'admin'}`;

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appLayout').style.display   = 'grid';
    document.getElementById('badgeNameDesktop').textContent = user.nom;
    document.getElementById('badgeRoleDesktop').textContent =
      user.role === 'admin' ? '👑 Admin' : user.role === 'editeur' ? '✏️ Éditeur' : '👁 Lecteur';

    // Charger branding
    if (settings.logo)    { const l=document.getElementById('sidebarLogo'); l.src=settings.logo; l.style.display='block'; }
    if (settings.nom)     document.getElementById('sidebarName').textContent = settings.nom;
    if (settings.slogan)  document.getElementById('sidebarTagline').textContent = settings.slogan;

    document.getElementById('pinInput').value = '';
    if (typeof window.App !== 'undefined') window.App.init();
  }

  function startLockCountdown() {
    const lockEl    = document.getElementById('loginLockMsg');
    const countEl   = document.getElementById('lockCountdown');
    const loginBtn  = document.getElementById('loginBtn');
    const pinInput  = document.getElementById('pinInput');
    lockEl.style.display = 'block';
    loginBtn.disabled    = true;
    pinInput.disabled    = true;

    function tick() {
      const rem = Math.ceil((_lockUntil - Date.now()) / 1000);
      if (rem <= 0) {
        lockEl.style.display = 'none';
        loginBtn.disabled    = false;
        pinInput.disabled    = false;
        return;
      }
      countEl.textContent = rem;
      _lockTimer = setTimeout(tick, 1000);
    }
    tick();
  }

  function logout() {
    _currentUser = null;
    document.getElementById('appLayout').style.display   = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('pinInput').value = '';
  }

  function togglePwd() {
    const el = document.getElementById('pinInput');
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  function getUser() { return _currentUser; }
  function isAdmin() { return _currentUser?.role === 'admin'; }

  // Afficher le sélecteur utilisateur si plusieurs comptes
  async function initLoginScreen() {
    const settings = await DB.getSettings();
    const users    = settings.users || [];

    if (settings.logo)   { const l=document.getElementById('loginLogo'); l.src=settings.logo; l.style.display='block'; }
    if (settings.slogan) { const s=document.getElementById('loginSlogan'); s.textContent=settings.slogan; s.style.display='block'; }

    const selWrap = document.getElementById('loginUserSelector');
    const selEl   = document.getElementById('loginUserSelect');
    if (users.length > 1) {
      selEl.innerHTML = users.map(u => `<option value="${u.nom}">${u.nom} (${u.role})</option>`).join('');
      selWrap.style.display = 'block';
    }

    // Setup wizard si pas de config
    if (!settings.nom && typeof SetupWizard !== 'undefined') {
      SetupWizard.start();
    }
  }

  document.addEventListener('DOMContentLoaded', initLoginScreen);

  return { login, logout, togglePwd, getUser, isAdmin, hashPwd };
})();
