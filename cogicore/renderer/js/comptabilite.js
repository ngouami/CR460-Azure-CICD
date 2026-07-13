/**
 * CogiCore — Module Comptabilité SYSCOHADA
 * Affiche le journal des écritures générées automatiquement.
 */
'use strict';

window.Compta = (() => {
  const COMPTES = {
    '4471': 'Net à payer',
    '4421': 'ITS retenu',
    '4437': 'CNPS/CMU organismes sociaux',
    '6611': 'Salaires bruts',
    '6631': 'CNPS patronal',
    '6641': 'Taxes sur salaires (FDFP)',
    '4431': 'TVA collectée',
    '4455': 'TVA déductible',
    '701':  'Ventes de marchandises',
    '411':  'Clients',
    '401':  'Fournisseurs',
    '521':  'Banque',
    '571':  'Caisse',
    '612':  'Loyers',
    '624':  'Transport',
    '625':  'Déplacements',
    '604':  'Achats fournitures',
    '615':  'Entretien / Réparations',
  };

  async function render() {
    const tab = document.querySelector('#comptabilite .tab-btn.active')?.dataset.tab || 'journal';
    if (tab === 'journal') await renderJournal();
    else if (tab === 'balance') await renderBalance();
  }

  async function renderJournal() {
    const ecritures = (await DB.getAll('ecritures_comptables')).filter(e => !e.deleted);
    const tbody = document.getElementById('comptaJournalTable');
    if (!tbody) return;

    const sorted = ecritures.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 200);
    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Aucune écriture comptable. Les bulletins de paie validés génèrent automatiquement des écritures.</td></tr>';
      return;
    }

    tbody.innerHTML = sorted.map(e => `<tr>
      <td>${UI.fmtDate(e.date)}</td>
      <td><code>${e.compte}</code></td>
      <td style="font-size:12px;color:#666;">${COMPTES[e.compte] || e.libelle_compte || '—'}</td>
      <td>${e.libelle || '—'}</td>
      <td style="color:#28a745;font-weight:700;">${e.debit > 0 ? UI.fmt(e.debit) : '—'}</td>
      <td style="color:#003D82;font-weight:700;">${e.credit > 0 ? UI.fmt(e.credit) : '—'}</td>
    </tr>`).join('');
  }

  async function renderBalance() {
    const ecritures = (await DB.getAll('ecritures_comptables')).filter(e => !e.deleted);
    const tbody = document.getElementById('comptaBalanceTable');
    if (!tbody) return;

    const map = {};
    ecritures.forEach(e => {
      if (!map[e.compte]) map[e.compte] = { debit: 0, credit: 0 };
      map[e.compte].debit  += e.debit  || 0;
      map[e.compte].credit += e.credit || 0;
    });

    const comptes = Object.keys(map).sort();
    if (!comptes.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px;">Aucune écriture.</td></tr>';
      return;
    }

    let totDeb = 0, totCred = 0;
    tbody.innerHTML = comptes.map(c => {
      const { debit, credit } = map[c];
      const solde = debit - credit;
      totDeb  += debit;
      totCred += credit;
      return `<tr>
        <td><code>${c}</code></td>
        <td style="font-size:12px;color:#666;">${COMPTES[c] || '—'}</td>
        <td style="color:#28a745;">${UI.fmt(debit)}</td>
        <td style="color:#003D82;">${UI.fmt(credit)}</td>
        <td style="font-weight:700;color:${solde >= 0 ? '#28a745' : '#dc3545'};">${UI.fmt(Math.abs(solde))} ${solde >= 0 ? 'D' : 'C'}</td>
      </tr>`;
    }).join('');

    const totEl = document.getElementById('comptaBalanceTotaux');
    if (totEl) {
      const ok = Math.abs(totDeb - totCred) < 1;
      totEl.innerHTML = `<strong>Total Débit : ${UI.fmt(totDeb)}</strong> | <strong>Total Crédit : ${UI.fmt(totCred)}</strong>
        <span style="margin-left:12px;color:${ok ? '#28a745' : '#dc3545'};font-weight:700;">
          ${ok ? '✅ Balance équilibrée' : `⚠️ Écart : ${UI.fmt(Math.abs(totDeb - totCred))}`}
        </span>`;
    }
  }

  function showTab(tab) {
    document.querySelectorAll('#comptabilite .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('comptaJournalView').style.display  = tab === 'journal'  ? '' : 'none';
    document.getElementById('comptaBalanceView').style.display  = tab === 'balance'  ? '' : 'none';
    if (tab === 'journal')  renderJournal();
    if (tab === 'balance')  renderBalance();
  }

  async function addEcriture() {
    const date    = document.getElementById('ecritureDate').value;
    const compte  = document.getElementById('ecritureCompte').value.trim();
    const libelle = document.getElementById('ecritureLibelle').value.trim();
    const debit   = parseFloat(document.getElementById('ecritureDebit').value)  || 0;
    const credit  = parseFloat(document.getElementById('ecritureCredit').value) || 0;

    if (!date || !compte || (!debit && !credit)) {
      UI.toast('Date, compte et montant sont obligatoires', 'warn');
      return;
    }
    if (debit > 0 && credit > 0) {
      UI.toast('Une écriture ne peut pas avoir débit ET crédit', 'warn');
      return;
    }

    const ecriture = {
      id: Date.now(), date, compte,
      libelle_compte: COMPTES[compte] || '',
      libelle, debit, credit,
      createdAt: new Date().toISOString(),
    };
    await DB.upsert('ecritures_comptables', ecriture);
    UI.closeModal('ecritureModal');
    UI.toast('Écriture enregistrée', 'ok');
    await renderJournal();
  }

  function openEcritureModal() {
    document.getElementById('ecritureDate').value    = new Date().toISOString().slice(0, 10);
    document.getElementById('ecritureCompte').value  = '';
    document.getElementById('ecritureLibelle').value = '';
    document.getElementById('ecritureDebit').value   = '';
    document.getElementById('ecritureCredit').value  = '';
    UI.openModal('ecritureModal');
  }

  return { render, showTab, renderJournal, renderBalance, addEcriture, openEcritureModal };
})();
