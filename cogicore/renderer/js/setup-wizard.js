/**
 * CogiCore — Assistant de Premier Démarrage
 * Affiché automatiquement quand aucun utilisateur n'est configuré.
 */
'use strict';

window.SetupWizard = (() => {

  function start() {
    document.getElementById('loginCard').style.display  = 'none';
    document.getElementById('setupCard').style.display  = 'block';
  }

  async function finish() {
    const entreprise = document.getElementById('setupEntreprise').value.trim();
    const adminNom   = document.getElementById('setupAdminNom').value.trim();
    const pwd        = document.getElementById('setupPwd').value;
    const pwd2       = document.getElementById('setupPwd2').value;
    const errEl      = document.getElementById('setupError');

    errEl.textContent = '';

    if (!entreprise) { errEl.textContent = "Le nom de l'entreprise est obligatoire."; return; }
    if (!adminNom)   { errEl.textContent = "Votre nom est obligatoire."; return; }
    if (pwd.length < 4) { errEl.textContent = "Le mot de passe doit contenir au moins 4 caractères."; return; }
    if (pwd !== pwd2)   { errEl.textContent = "Les mots de passe ne correspondent pas."; return; }

    // Créer le premier utilisateur admin
    const pinHash  = await Auth.hashPwd(pwd);
    const salt     = 'cogicore_' + Date.now();
    const settings = {
      nom:    entreprise,
      salt,
      users:  [{ nom: adminNom, role: 'admin', pinHash }],
    };

    await DB.saveSettings(settings);

    // Connecter automatiquement
    await DB.initKey(pwd, salt);
    document.body.className = 'role-admin';
    document.getElementById('setupCard').style.display   = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appLayout').style.display   = 'grid';
    document.getElementById('badgeNameDesktop').textContent = adminNom;
    document.getElementById('badgeRoleDesktop').textContent = '👑 Admin';
    document.getElementById('sidebarName').textContent      = entreprise;

    if (typeof window.App !== 'undefined') window.App.init();
  }

  return { start, finish };
})();
