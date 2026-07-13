/**
 * CogiCore — Module Clients
 */
'use strict';

window.Clients = (() => {
  let _editId = null;

  async function render() {
    const clients = (await DB.getAll('clients')).filter(c => !c.deleted);
    const q = (document.getElementById('searchClients')?.value || '').toLowerCase();
    const tbody = document.getElementById('clientsTable');
    if (!tbody) return;

    const filtered = clients.filter(c =>
      !q || c.nom?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.telephone?.includes(q)
    ).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Aucun client.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(c => `<tr>
      <td><strong>${c.nom || '—'}</strong></td>
      <td>${c.email || '—'}</td>
      <td>${c.telephone || '—'}</td>
      <td>${c.ville || '—'}</td>
      <td>${c.secteur || '—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="Clients.openEdit(${c.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="Clients.delete(${c.id})">🗑</button>
      </td>
    </tr>`).join('');
  }

  function openNew() {
    _editId = null;
    document.getElementById('clientModalTitle').textContent = '➕ Nouveau Client';
    ['cliNom','cliEmail','cliTel','cliAdresse','cliVille','cliSecteur','cliSiret','cliNotes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    UI.openModal('clientModal');
  }

  async function openEdit(id) {
    const c = await DB.findById('clients', id);
    if (!c) return;
    _editId = id;
    document.getElementById('clientModalTitle').textContent = `✏️ ${c.nom}`;
    document.getElementById('cliNom').value     = c.nom || '';
    document.getElementById('cliEmail').value   = c.email || '';
    document.getElementById('cliTel').value     = c.telephone || '';
    document.getElementById('cliAdresse').value = c.adresse || '';
    document.getElementById('cliVille').value   = c.ville || '';
    document.getElementById('cliSecteur').value = c.secteur || '';
    document.getElementById('cliSiret').value   = c.siret || '';
    document.getElementById('cliNotes').value   = c.notes || '';
    UI.openModal('clientModal');
  }

  async function save() {
    const nom = document.getElementById('cliNom').value.trim();
    if (!nom) { UI.toast('Le nom est obligatoire', 'warn'); return; }

    const client = {
      id:        _editId || Date.now(),
      nom,
      email:     document.getElementById('cliEmail').value.trim(),
      telephone: document.getElementById('cliTel').value.trim(),
      adresse:   document.getElementById('cliAdresse').value.trim(),
      ville:     document.getElementById('cliVille').value.trim(),
      secteur:   document.getElementById('cliSecteur').value.trim(),
      siret:     document.getElementById('cliSiret').value.trim(),
      notes:     document.getElementById('cliNotes').value.trim(),
      createdAt: _editId ? undefined : new Date().toISOString(),
    };
    if (_editId) delete client.createdAt;

    await DB.upsert('clients', client);
    await DB.logActivity('Clients', `Client ${nom} ${_editId ? 'modifié' : 'créé'}`);
    UI.closeModal('clientModal');
    UI.toast(`Client ${nom} enregistré`, 'ok');
    _editId = null;
    await render();
  }

  async function deleteClient(id) {
    if (!UI.confirm('Supprimer ce client ?')) return;
    await DB.softDelete('clients', id);
    UI.toast('Client supprimé', 'ok');
    await render();
  }

  return { render, openNew, openEdit, save, delete: deleteClient };
})();
