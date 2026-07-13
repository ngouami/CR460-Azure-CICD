/**
 * CogiCore — Module Paramètres Entreprise
 */
'use strict';

window.Settings = (() => {

  async function render() {
    const settings = await DB.getSettings();

    document.getElementById('setNom').value     = settings.nom || '';
    document.getElementById('setAdresse').value = settings.adresse || '';
    document.getElementById('setEmail').value   = settings.email || '';
    document.getElementById('setTel').value     = settings.telephone || '';
    document.getElementById('setVille').value   = settings.ville || '';
    document.getElementById('setCNPS').value    = settings.cnps || '';
    document.getElementById('setRC').value      = settings.rc || '';
    document.getElementById('setSlogan').value  = settings.slogan || '';

    // Users list
    renderUsers(settings.users || []);
  }

  function renderUsers(users) {
    const tbody = document.getElementById('usersTable');
    if (!tbody) return;
    tbody.innerHTML = users.map((u, i) => `<tr>
      <td><strong>${u.nom}</strong></td>
      <td>${UI.badge(u.role, u.role === 'admin' ? 'primary' : u.role === 'editeur' ? 'warning' : 'secondary')}</td>
      <td>
        ${i > 0 ? `<button class="btn btn-sm btn-danger" onclick="Settings.deleteUser(${i})">🗑</button>` : '<span style="color:#999;font-size:12px;">Compte principal</span>'}
      </td>
    </tr>`).join('') || '<tr><td colspan="3" style="color:#999;text-align:center;padding:16px;">Aucun utilisateur configuré.</td></tr>';
  }

  async function save() {
    const settings = await DB.getSettings();
    settings.nom       = document.getElementById('setNom').value.trim();
    settings.adresse   = document.getElementById('setAdresse').value.trim();
    settings.email     = document.getElementById('setEmail').value.trim();
    settings.telephone = document.getElementById('setTel').value.trim();
    settings.ville     = document.getElementById('setVille').value.trim();
    settings.cnps      = document.getElementById('setCNPS').value.trim();
    settings.rc        = document.getElementById('setRC').value.trim();
    settings.slogan    = document.getElementById('setSlogan').value.trim();

    await DB.saveSettings(settings);
    UI.toast('Paramètres sauvegardés', 'ok');

    // Update sidebar branding
    if (settings.nom)    document.getElementById('sidebarName').textContent    = settings.nom;
    if (settings.slogan) document.getElementById('sidebarTagline').textContent = settings.slogan;
  }

  async function saveLogo() {
    const input = document.getElementById('setLogoFile');
    const file  = input?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
      const settings = await DB.getSettings();
      settings.logo  = e.target.result;
      await DB.saveSettings(settings);
      const logoEl = document.getElementById('sidebarLogo');
      if (logoEl) { logoEl.src = settings.logo; logoEl.style.display = 'block'; }
      UI.toast('Logo mis à jour', 'ok');
    };
    reader.readAsDataURL(file);
  }

  async function addUser() {
    const nom  = document.getElementById('newUserNom').value.trim();
    const pin  = document.getElementById('newUserPin').value;
    const role = document.getElementById('newUserRole').value;
    if (!nom || pin.length < 4) {
      UI.toast('Nom et PIN (min 4 caractères) obligatoires', 'warn');
      return;
    }

    const pinHash = await Auth.hashPwd(pin);
    const settings = await DB.getSettings();
    if (!settings.users) settings.users = [];
    if (settings.users.find(u => u.nom === nom)) {
      UI.toast('Cet utilisateur existe déjà', 'warn');
      return;
    }
    settings.users.push({ nom, role, pinHash });
    await DB.saveSettings(settings);
    document.getElementById('newUserNom').value = '';
    document.getElementById('newUserPin').value = '';
    UI.toast(`Utilisateur "${nom}" créé`, 'ok');
    renderUsers(settings.users);
  }

  async function deleteUser(index) {
    if (!UI.confirm('Supprimer cet utilisateur ?')) return;
    const settings = await DB.getSettings();
    settings.users.splice(index, 1);
    await DB.saveSettings(settings);
    UI.toast('Utilisateur supprimé', 'ok');
    renderUsers(settings.users);
  }

  async function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      factures:   await DB.getAll('factures'),
      clients:    await DB.getAll('clients'),
      employes:   await DB.getAll('employes'),
      depenses:   await DB.getAll('depenses'),
      produits:   await DB.getAll('produits'),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `cogicore-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Export téléchargé', 'ok');
  }

  return { render, save, saveLogo, addUser, deleteUser, exportData };
})();
