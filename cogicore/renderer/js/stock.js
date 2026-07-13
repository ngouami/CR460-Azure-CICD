/**
 * CogiCore — Module Stock / Inventaire
 */
'use strict';

window.Stock = (() => {
  let _editId = null;

  async function render() {
    const produits = (await DB.getAll('produits')).filter(p => !p.deleted);
    const mouvements = (await DB.getAll('mouvements_stock')).filter(m => !m.deleted);
    const q = (document.getElementById('searchStock')?.value || '').toLowerCase();
    const tbody = document.getElementById('stockTable');
    if (!tbody) return;

    // Calculate current stock per product
    const stockMap = {};
    mouvements.forEach(m => {
      if (!stockMap[m.produitId]) stockMap[m.produitId] = 0;
      stockMap[m.produitId] += (m.type === 'entree' ? 1 : -1) * (m.quantite || 0);
    });

    const filtered = produits.filter(p =>
      !q || p.nom?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q)
    );

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Aucun article en stock.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const qty   = stockMap[p.id] || 0;
      const alert = p.stockMin != null && qty <= p.stockMin;
      return `<tr ${alert ? 'style="background:#fff3cd;"' : ''}>
        <td><strong>${p.reference || '—'}</strong></td>
        <td>${p.nom || '—'}</td>
        <td>${p.categorie || '—'}</td>
        <td style="font-weight:700;color:${qty <= 0 ? '#dc3545' : alert ? '#856404' : '#28a745'};">${qty}</td>
        <td>${p.stockMin != null ? p.stockMin : '—'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="Stock.openMouvement(${p.id}, 'entree')">📥 Entrée</button>
          <button class="btn btn-sm btn-secondary" onclick="Stock.openMouvement(${p.id}, 'sortie')" style="background:#dc3545;color:white;">📤 Sortie</button>
          <button class="btn btn-sm btn-secondary" onclick="Stock.openEditSeuil(${p.id})">⚙️</button>
        </td>
      </tr>`;
    }).join('');
  }

  async function openMouvement(produitId, type) {
    _editId = produitId;
    const p = await DB.findById('produits', produitId);
    if (!p) return;
    document.getElementById('mvtModalTitle').textContent = `${type === 'entree' ? '📥 Entrée stock' : '📤 Sortie stock'} — ${p.nom}`;
    document.getElementById('mvtType').value       = type;
    document.getElementById('mvtProduitId').value  = produitId;
    document.getElementById('mvtProduitNom').value = p.nom;
    document.getElementById('mvtQte').value        = '';
    document.getElementById('mvtMotif').value      = '';
    document.getElementById('mvtDate').value       = new Date().toISOString().slice(0, 10);
    UI.openModal('mvtStockModal');
  }

  async function saveMouvement() {
    const produitId = parseInt(document.getElementById('mvtProduitId').value);
    const type      = document.getElementById('mvtType').value;
    const qte       = parseInt(document.getElementById('mvtQte').value) || 0;
    const date      = document.getElementById('mvtDate').value;
    if (qte <= 0) { UI.toast('Quantité invalide', 'warn'); return; }

    const mvt = {
      id:        Date.now(),
      produitId,
      type,
      quantite:  qte,
      date,
      motif:     document.getElementById('mvtMotif').value.trim(),
      createdAt: new Date().toISOString(),
    };
    await DB.upsert('mouvements_stock', mvt);
    await DB.logActivity('Stock', `${type === 'entree' ? 'Entrée' : 'Sortie'} ${qte} unité(s) pour produit #${produitId}`);
    UI.closeModal('mvtStockModal');
    UI.toast(`Mouvement enregistré`, 'ok');
    await render();
  }

  async function openEditSeuil(produitId) {
    const p = await DB.findById('produits', produitId);
    if (!p) return;
    const seuil = prompt(`Seuil d'alerte stock pour "${p.nom}" (actuel: ${p.stockMin ?? 'non défini'}):`, p.stockMin ?? '');
    if (seuil === null) return;
    p.stockMin = parseInt(seuil) || 0;
    await DB.upsert('produits', p);
    UI.toast('Seuil mis à jour', 'ok');
    await render();
  }

  async function renderHistorique() {
    const mouvements = (await DB.getAll('mouvements_stock')).filter(m => !m.deleted);
    const produits   = (await DB.getAll('produits')).filter(p => !p.deleted);
    const pMap = {};
    produits.forEach(p => { pMap[p.id] = p.nom; });

    const tbody = document.getElementById('stockHistTable');
    if (!tbody) return;

    const sorted = mouvements.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px;">Aucun mouvement.</td></tr>';
      return;
    }

    tbody.innerHTML = sorted.map(m => `<tr>
      <td>${UI.fmtDate(m.date)}</td>
      <td>${pMap[m.produitId] || '#' + m.produitId}</td>
      <td>${UI.badge(m.type === 'entree' ? 'Entrée' : 'Sortie', m.type === 'entree' ? 'success' : 'danger')}</td>
      <td style="font-weight:700;">${m.quantite}</td>
      <td>${m.motif || '—'}</td>
    </tr>`).join('');
  }

  function showTab(tab) {
    document.querySelectorAll('#inventaire .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('stockInventaireView').style.display = tab === 'inventaire' ? '' : 'none';
    document.getElementById('stockHistoriqueView').style.display = tab === 'historique' ? '' : 'none';
    if (tab === 'historique') renderHistorique();
  }

  return { render, openMouvement, saveMouvement, openEditSeuil, renderHistorique, showTab };
})();
