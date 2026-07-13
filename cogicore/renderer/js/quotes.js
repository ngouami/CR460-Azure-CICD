/**
 * CogiCore — Module Devis
 * TVA via ServiceTVA (SSOT).
 */
'use strict';

window.Quotes = (() => {
  const { calcTVALigne, calcTotauxFacture } = window.CogiCore;
  let _editId = null;

  async function render() {
    const devis = (await DB.getAll('devis')).filter(d => !d.deleted);
    const q = (document.getElementById('searchQuotes')?.value || '').toLowerCase();
    const tbody = document.getElementById('quotesTable');
    if (!tbody) return;

    const filtered = devis.filter(d =>
      !q || d.numero?.toLowerCase().includes(q) || d.clientNom?.toLowerCase().includes(q)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:24px;">Aucun devis.</td></tr>';
      return;
    }

    const statutColor = { 'Accepté': 'success', 'En attente': 'warning', 'Refusé': 'danger', 'Expiré': 'secondary' };
    tbody.innerHTML = filtered.map(d => `<tr>
      <td><strong>${d.numero || '—'}</strong></td>
      <td>${d.clientNom || '—'}</td>
      <td>${UI.fmt(d.totalHT)}</td>
      <td style="font-weight:700;">${UI.fmt(d.totalTTC)}</td>
      <td>${UI.fmtDate(d.dateDevis)}</td>
      <td>${UI.badge(d.statut || 'En attente', statutColor[d.statut] || 'warning')}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="Quotes.openEdit(${d.id})">✏️</button>
        <button class="btn btn-sm btn-secondary" onclick="Quotes.convertToInvoice(${d.id})" style="background:#28a745;color:white;" title="Convertir en facture">📄→🧾</button>
        <button class="btn btn-sm btn-danger" onclick="Quotes.delete(${d.id})">🗑</button>
      </td>
    </tr>`).join('');
  }

  function addLine(desig = '', qty = 1, prixHT = 0, typeTVA = 'normal') {
    const tbody = document.getElementById('qteLinesTbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${desig}" placeholder="Désignation" oninput="Quotes.updateTotals()" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td><input type="number" value="${qty}" min="0.01" step="0.01" oninput="Quotes.updateTotals()" style="width:65px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td><input type="number" value="${prixHT}" min="0" oninput="Quotes.updateTotals()" style="width:100px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td>
        <select onchange="Quotes.updateTotals()" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;">
          <option value="normal" ${typeTVA === 'normal' ? 'selected' : ''}>18%</option>
          <option value="reduit" ${typeTVA === 'reduit' ? 'selected' : ''}>9%</option>
          <option value="zero"   ${typeTVA === 'zero' ? 'selected' : ''}>0%</option>
          <option value="exonere" ${typeTVA === 'exonere' ? 'selected' : ''}>Exo.</option>
        </select>
      </td>
      <td style="text-align:right;font-weight:600;" class="line-total">0</td>
      <td><button onclick="this.closest('tr').remove();Quotes.updateTotals();" class="btn btn-sm btn-danger">×</button></td>`;
    tbody.appendChild(tr);
    updateTotals();
  }

  function updateTotals() {
    const tbody = document.getElementById('qteLinesTbody');
    if (!tbody) return;
    const lignes = [];
    tbody.querySelectorAll('tr').forEach(tr => {
      const inputs  = tr.querySelectorAll('input');
      const selects = tr.querySelectorAll('select');
      const qty     = parseFloat(inputs[1]?.value) || 0;
      const prix    = parseFloat(inputs[2]?.value) || 0;
      const typeTVA = selects[0]?.value || 'normal';
      const ht      = qty * prix;
      const totEl   = tr.querySelector('.line-total');
      if (totEl) totEl.textContent = Math.round(ht).toLocaleString('fr-FR');
      if (ht > 0) lignes.push({ montant_ht: ht, type_tva: typeTVA });
    });
    if (!lignes.length) {
      ['qteTotalHT','qteTotalTVA','qteTotalTTC'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '0';
      });
      return;
    }
    try {
      const t = calcTotauxFacture(lignes);
      document.getElementById('qteTotalHT').textContent  = t.total_ht.toLocaleString('fr-FR');
      document.getElementById('qteTotalTVA').textContent = t.total_tva.toLocaleString('fr-FR');
      document.getElementById('qteTotalTTC').textContent = t.total_ttc.toLocaleString('fr-FR');
    } catch {}
  }

  async function save() {
    const clientNom = document.getElementById('qteClientSearch').value.trim();
    const date      = document.getElementById('qteDate').value;
    if (!clientNom || !date) { UI.toast('Client et date obligatoires', 'warn'); return; }

    const tbody = document.getElementById('qteLinesTbody');
    const lines = [];
    (tbody?.querySelectorAll('tr') || []).forEach(tr => {
      const inputs  = tr.querySelectorAll('input');
      const selects = tr.querySelectorAll('select');
      const desig   = inputs[0]?.value.trim();
      const qty     = parseFloat(inputs[1]?.value) || 0;
      const prix    = parseFloat(inputs[2]?.value) || 0;
      const typeTVA = selects[0]?.value || 'normal';
      if (desig && qty > 0) {
        const r = calcTVALigne(qty * prix, typeTVA);
        lines.push({ designation: desig, qty, prixHT: prix, typeTVA, ...r });
      }
    });
    if (!lines.length) { UI.toast('Ajoutez au moins une ligne', 'warn'); return; }

    const totaux = calcTotauxFacture(lines.map(l => ({ montant_ht: l.montant_ht, type_tva: l.typeTVA })));
    const devis = {
      id:         _editId || Date.now(),
      numero:     document.getElementById('qteNumero').value.trim() || `DEV-${Date.now()}`,
      clientId:   parseInt(document.getElementById('qteClientId').value) || 0,
      clientNom,
      dateDevis:  date,
      validite:   document.getElementById('qteValidite').value || '',
      statut:     'En attente',
      lines,
      totalHT:    totaux.total_ht,
      totalTVA:   totaux.total_tva,
      totalTTC:   totaux.total_ttc,
      notes:      document.getElementById('qteNotes').value.trim(),
      createdAt:  _editId ? undefined : new Date().toISOString(),
    };
    if (_editId) delete devis.createdAt;

    await DB.upsert('devis', devis);
    await DB.logActivity('Devis', `Devis ${devis.numero} ${_editId ? 'modifié' : 'créé'}`);
    UI.closeModal('quoteModal');
    UI.toast(`Devis ${devis.numero} enregistré`, 'ok');
    _editId = null;
    await render();
  }

  async function openEdit(id) {
    const d = await DB.findById('devis', id);
    if (!d) return;
    _editId = id;
    document.getElementById('quoteModalTitle').textContent = `📋 Devis ${d.numero}`;
    document.getElementById('qteClientSearch').value = d.clientNom || '';
    document.getElementById('qteClientId').value     = d.clientId || '';
    document.getElementById('qteNumero').value       = d.numero || '';
    document.getElementById('qteDate').value         = d.dateDevis || '';
    document.getElementById('qteValidite').value     = d.validite || '';
    document.getElementById('qteNotes').value        = d.notes || '';
    document.getElementById('qteLinesTbody').innerHTML = '';
    (d.lines || []).forEach(l => addLine(l.designation, l.qty, l.prixHT, l.typeTVA || 'normal'));
    UI.openModal('quoteModal');
  }

  async function convertToInvoice(id) {
    const d = await DB.findById('devis', id);
    if (!d) return;
    if (!UI.confirm(`Convertir le devis ${d.numero} en facture ?`)) return;
    const facture = {
      id:          Date.now(),
      numero:      `FAC-${Date.now()}`,
      clientId:    d.clientId,
      clientNom:   d.clientNom,
      dateFacture: new Date().toISOString().slice(0, 10),
      statut:      'En attente',
      lines:       d.lines,
      totalHT:     d.totalHT,
      totalTVA:    d.totalTVA,
      totalTTC:    d.totalTTC,
      notes:       d.notes,
      devisRef:    d.numero,
      createdAt:   new Date().toISOString(),
    };
    await DB.upsert('factures', facture);
    d.statut = 'Accepté';
    await DB.upsert('devis', d);
    await DB.logActivity('Devis', `Devis ${d.numero} converti en facture ${facture.numero}`);
    UI.toast(`Facture ${facture.numero} créée depuis devis`, 'ok');
    await render();
  }

  async function deleteQuote(id) {
    if (!UI.confirm('Supprimer ce devis ?')) return;
    await DB.softDelete('devis', id);
    UI.toast('Devis supprimé', 'ok');
    await render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('qteDate');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  });

  return { render, addLine, updateTotals, save, openEdit, convertToInvoice, delete: deleteQuote };
})();
