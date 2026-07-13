/**
 * CogiCore — Module Produits / Catalogue
 */
'use strict';

window.Products = (() => {
  let _editId = null;

  async function render() {
    const produits = (await DB.getAll('produits')).filter(p => !p.deleted);
    const q = (document.getElementById('searchProducts')?.value || '').toLowerCase();
    const tbody = document.getElementById('productsTable');
    if (!tbody) return;

    const filtered = produits.filter(p =>
      !q || p.nom?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q) || p.categorie?.toLowerCase().includes(q)
    ).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:24px;">Aucun produit.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => `<tr>
      <td><strong>${p.reference || '—'}</strong></td>
      <td>${p.nom || '—'}</td>
      <td>${p.categorie || '—'}</td>
      <td>${UI.fmt(p.prixAchat || 0)}</td>
      <td style="font-weight:700;">${UI.fmt(p.prixVente || 0)}</td>
      <td>${p.tva || '18%'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="Products.openEdit(${p.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="Products.delete(${p.id})">🗑</button>
      </td>
    </tr>`).join('');
  }

  function openNew() {
    _editId = null;
    document.getElementById('productModalTitle').textContent = '➕ Nouveau Produit';
    ['prdRef','prdNom','prdCategorie','prdDescription'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('prdPrixAchat').value = '';
    document.getElementById('prdPrixVente').value = '';
    const tvaEl = document.getElementById('prdTVA');
    if (tvaEl) tvaEl.value = 'normal';
    UI.openModal('productModal');
  }

  async function openEdit(id) {
    const p = await DB.findById('produits', id);
    if (!p) return;
    _editId = id;
    document.getElementById('productModalTitle').textContent = `✏️ ${p.nom}`;
    document.getElementById('prdRef').value         = p.reference || '';
    document.getElementById('prdNom').value         = p.nom || '';
    document.getElementById('prdCategorie').value   = p.categorie || '';
    document.getElementById('prdPrixAchat').value   = p.prixAchat || '';
    document.getElementById('prdPrixVente').value   = p.prixVente || '';
    document.getElementById('prdDescription').value = p.description || '';
    const tvaEl = document.getElementById('prdTVA');
    if (tvaEl) tvaEl.value = p.typeTVA || 'normal';
    UI.openModal('productModal');
  }

  async function save() {
    const nom       = document.getElementById('prdNom').value.trim();
    const prixVente = parseFloat(document.getElementById('prdPrixVente').value) || 0;
    if (!nom) { UI.toast('Le nom est obligatoire', 'warn'); return; }

    const produit = {
      id:          _editId || Date.now(),
      reference:   document.getElementById('prdRef').value.trim() || `PRD-${Date.now()}`,
      nom,
      categorie:   document.getElementById('prdCategorie').value.trim(),
      prixAchat:   parseFloat(document.getElementById('prdPrixAchat').value) || 0,
      prixVente,
      typeTVA:     document.getElementById('prdTVA').value || 'normal',
      description: document.getElementById('prdDescription').value.trim(),
      createdAt:   _editId ? undefined : new Date().toISOString(),
    };
    if (_editId) delete produit.createdAt;

    await DB.upsert('produits', produit);
    await DB.logActivity('Produits', `Produit "${nom}" ${_editId ? 'modifié' : 'créé'}`);
    UI.closeModal('productModal');
    UI.toast(`Produit "${nom}" enregistré`, 'ok');
    _editId = null;
    await render();
  }

  async function deleteProduct(id) {
    if (!UI.confirm('Supprimer ce produit ?')) return;
    await DB.softDelete('produits', id);
    UI.toast('Produit supprimé', 'ok');
    await render();
  }

  return { render, openNew, openEdit, save, delete: deleteProduct };
})();
