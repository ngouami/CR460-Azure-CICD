/**
 * CogiCore — Module Dépenses
 */
'use strict';

window.Expenses = (() => {
  let _editId = null;

  const CATEGORIES = [
    'Loyer / Bail', 'Électricité / Eau', 'Télécommunications', 'Fournitures bureau',
    'Transport / Carburant', 'Maintenance', 'Marketing / Publicité', 'Salaires',
    'Charges sociales', 'Honoraires', 'Assurances', 'Impôts & Taxes', 'Autres'
  ];

  async function render() {
    const depenses = (await DB.getAll('depenses')).filter(d => !d.deleted);
    const q    = (document.getElementById('searchExpenses')?.value || '').toLowerCase();
    const cat  = document.getElementById('filterExpenseCat')?.value || '';
    const tbody = document.getElementById('expensesTable');
    if (!tbody) return;

    const filtered = depenses.filter(d =>
      (!q || d.libelle?.toLowerCase().includes(q)) && (!cat || d.categorie === cat)
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = filtered.reduce((s, d) => s + (d.montant || 0), 0);
    const totalEl = document.getElementById('expensesTotal');
    if (totalEl) totalEl.textContent = UI.fmt(total);

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Aucune dépense.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(d => `<tr>
      <td>${UI.fmtDate(d.date)}</td>
      <td><strong>${d.libelle || '—'}</strong></td>
      <td>${UI.badge(d.categorie || '—', 'secondary')}</td>
      <td>${d.fournisseur || '—'}</td>
      <td style="font-weight:700;">${UI.fmt(d.montant)}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="Expenses.openEdit(${d.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="Expenses.delete(${d.id})">🗑</button>
      </td>
    </tr>`).join('');
  }

  function openNew() {
    _editId = null;
    document.getElementById('expenseModalTitle').textContent = '➕ Nouvelle Dépense';
    document.getElementById('expDate').value        = new Date().toISOString().slice(0, 10);
    document.getElementById('expLibelle').value     = '';
    document.getElementById('expMontant').value     = '';
    document.getElementById('expFournisseur').value = '';
    document.getElementById('expNotes').value       = '';
    const catSel = document.getElementById('expCategorie');
    if (catSel) {
      catSel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    UI.openModal('expenseModal');
  }

  async function openEdit(id) {
    const d = await DB.findById('depenses', id);
    if (!d) return;
    _editId = id;
    document.getElementById('expenseModalTitle').textContent = `✏️ ${d.libelle}`;
    document.getElementById('expDate').value        = d.date || '';
    document.getElementById('expLibelle').value     = d.libelle || '';
    document.getElementById('expMontant').value     = d.montant || '';
    document.getElementById('expFournisseur').value = d.fournisseur || '';
    document.getElementById('expNotes').value       = d.notes || '';
    const catSel = document.getElementById('expCategorie');
    if (catSel) {
      catSel.innerHTML = CATEGORIES.map(c => `<option value="${c}" ${d.categorie === c ? 'selected' : ''}>${c}</option>`).join('');
    }
    UI.openModal('expenseModal');
  }

  async function save() {
    const libelle = document.getElementById('expLibelle').value.trim();
    const montant = parseFloat(document.getElementById('expMontant').value) || 0;
    const date    = document.getElementById('expDate').value;
    if (!libelle || !date || montant <= 0) {
      UI.toast('Libellé, date et montant sont obligatoires', 'warn');
      return;
    }

    const depense = {
      id:          _editId || Date.now(),
      date,
      libelle,
      montant,
      categorie:   document.getElementById('expCategorie').value,
      fournisseur: document.getElementById('expFournisseur').value.trim(),
      notes:       document.getElementById('expNotes').value.trim(),
      createdAt:   _editId ? undefined : new Date().toISOString(),
    };
    if (_editId) delete depense.createdAt;

    await DB.upsert('depenses', depense);
    await DB.logActivity('Dépenses', `Dépense "${libelle}" ${_editId ? 'modifiée' : 'enregistrée'}`);
    UI.closeModal('expenseModal');
    UI.toast(`Dépense enregistrée`, 'ok');
    _editId = null;
    await render();
  }

  async function deleteExpense(id) {
    if (!UI.confirm('Supprimer cette dépense ?')) return;
    await DB.softDelete('depenses', id);
    UI.toast('Dépense supprimée', 'ok');
    await render();
  }

  return { render, openNew, openEdit, save, delete: deleteExpense, CATEGORIES };
})();
