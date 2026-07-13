/**
 * CogiCore — Module Factures
 * TVA calculée via ServiceTVA (SSOT) — jamais hardcodée.
 */
'use strict';

window.Invoices = (() => {
  const { calcTVALigne, calcTotauxFacture } = window.CogiCore;
  let _editId = null;

  async function render() {
    const factures = (await DB.getAll('factures')).filter(f => !f.deleted);
    const q = (document.getElementById('searchInvoices')?.value||'').toLowerCase();
    const s = document.getElementById('filterInvoiceStatus')?.value||'';
    const tbody = document.getElementById('invoicesTable');
    if (!tbody) return;

    const filtered = factures.filter(f =>
      (!q || f.numero?.toLowerCase().includes(q) || f.clientNom?.toLowerCase().includes(q)) &&
      (!s || f.statut === s)
    ).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">Aucune facture.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(f => {
      const statutColor = { 'Payée':'success', 'En attente':'warning', 'Annulée':'danger' };
      return `<tr>
        <td><strong>${f.numero||'—'}</strong></td>
        <td>${f.clientNom||'—'}</td>
        <td>${UI.fmt(f.totalHT)}</td>
        <td>${UI.fmt(f.totalTVA)}</td>
        <td style="font-weight:700;">${UI.fmt(f.totalTTC)}</td>
        <td>${UI.fmtDate(f.dateFacture)}</td>
        <td>${UI.badge(f.statut||'En attente', statutColor[f.statut]||'warning')}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-edit" onclick="Invoices.openEdit(${f.id})">✏️</button>
          <button class="btn btn-sm btn-secondary btn-print" onclick="Invoices.print(${f.id})" style="background:#003D82;color:white;">🖨️</button>
          <button class="btn btn-sm btn-danger btn-delete" onclick="Invoices.delete(${f.id})">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  function addLine(desig='', qty=1, prixHT=0, typeTVA='normal') {
    const tbody = document.getElementById('invLinesTbody');
    if (!tbody) return;
    const { calcTVALigne: cTVA } = window.CogiCore;
    const taux = (cTVA(0, typeTVA).taux_applique * 100).toFixed(0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${desig}" placeholder="Désignation" oninput="Invoices.updateTotals()" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td><input type="number" value="${qty}" min="0.01" step="0.01" oninput="Invoices.updateTotals()" style="width:65px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td><input type="number" value="${prixHT}" min="0" oninput="Invoices.updateTotals()" style="width:100px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
      <td>
        <select onchange="Invoices.updateTotals()" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;">
          <option value="normal" ${typeTVA==='normal'?'selected':''}>18%</option>
          <option value="reduit" ${typeTVA==='reduit'?'selected':''}>9%</option>
          <option value="zero"   ${typeTVA==='zero'?'selected':''}>0%</option>
          <option value="exonere" ${typeTVA==='exonere'?'selected':''}>Exo.</option>
        </select>
      </td>
      <td style="text-align:right;font-weight:600;" class="line-total">0</td>
      <td><button onclick="this.closest('tr').remove();Invoices.updateTotals();" class="btn btn-sm btn-danger">×</button></td>`;
    tbody.appendChild(tr);
    updateTotals();
  }

  function updateTotals() {
    const tbody = document.getElementById('invLinesTbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    const lignes = [];
    rows.forEach(tr => {
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
      document.getElementById('invTotalHT').textContent  = '0';
      document.getElementById('invTotalTVA').textContent = '0';
      document.getElementById('invTotalTTC').textContent = '0';
      return;
    }
    try {
      const t = calcTotauxFacture(lignes);
      document.getElementById('invTotalHT').textContent  = t.total_ht.toLocaleString('fr-FR');
      document.getElementById('invTotalTVA').textContent = t.total_tva.toLocaleString('fr-FR');
      document.getElementById('invTotalTTC').textContent = t.total_ttc.toLocaleString('fr-FR');
    } catch {}
  }

  async function save() {
    const clientId  = document.getElementById('invClientId').value;
    const clientNom = document.getElementById('invClientSearch').value.trim();
    const date      = document.getElementById('invDate').value;
    if (!clientNom || !date) { UI.toast('Client et date obligatoires','warn'); return; }

    // Lire les lignes
    const tbody = document.getElementById('invLinesTbody');
    const rows  = tbody?.querySelectorAll('tr') || [];
    const lines = [];
    rows.forEach(tr => {
      const inputs  = tr.querySelectorAll('input');
      const selects = tr.querySelectorAll('select');
      const desig   = inputs[0]?.value.trim();
      const qty     = parseFloat(inputs[1]?.value)||0;
      const prix    = parseFloat(inputs[2]?.value)||0;
      const typeTVA = selects[0]?.value || 'normal';
      if (desig && qty > 0) {
        const r = calcTVALigne(qty * prix, typeTVA);
        lines.push({ designation:desig, qty, prixHT:prix, typeTVA, ...r });
      }
    });

    if (!lines.length) { UI.toast('Ajoutez au moins une ligne','warn'); return; }

    const totaux = calcTotauxFacture(lines.map(l => ({ montant_ht:l.montant_ht, type_tva:l.typeTVA })));
    const facture = {
      id:          _editId || Date.now(),
      numero:      document.getElementById('invNumero').value.trim() || `FAC-${Date.now()}`,
      clientId:    parseInt(clientId) || 0,
      clientNom,
      dateFacture: date,
      statut:      'En attente',
      lines,
      totalHT:     totaux.total_ht,
      totalTVA:    totaux.total_tva,
      totalTTC:    totaux.total_ttc,
      notes:       document.getElementById('invNotes').value.trim(),
    };

    await DB.upsert('factures', facture);
    await DB.logActivity('Factures', `Facture ${facture.numero} créée`);
    UI.closeModal('invoiceModal');
    UI.toast(`Facture ${facture.numero} enregistrée`, 'ok');
    _editId = null;
    _resetModal();
    await render();
  }

  function _resetModal() {
    ['invClientSearch','invClientId','invNumero','invNotes'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    document.getElementById('invDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('invLinesTbody').innerHTML = '';
    updateTotals();
  }

  async function openEdit(id) {
    const f = await DB.findById('factures', id);
    if (!f) return;
    _editId = id;
    document.getElementById('invoiceModalTitle').textContent = `📄 Facture ${f.numero}`;
    document.getElementById('invClientSearch').value = f.clientNom||'';
    document.getElementById('invClientId').value     = f.clientId||'';
    document.getElementById('invNumero').value       = f.numero||'';
    document.getElementById('invDate').value         = f.dateFacture||'';
    document.getElementById('invNotes').value        = f.notes||'';
    document.getElementById('invLinesTbody').innerHTML = '';
    (f.lines||[]).forEach(l => addLine(l.designation, l.qty, l.prixHT, l.typeTVA||'normal'));
    UI.openModal('invoiceModal');
  }

  async function deleteInv(id) {
    if (!UI.confirm('Supprimer cette facture ?')) return;
    await DB.softDelete('factures', id);
    UI.toast('Facture supprimée','ok');
    await render();
  }

  async function print(id) {
    const f = await DB.findById('factures', id);
    if (!f) return;
    const settings = await DB.getSettings();
    const w = window.open('','_blank','width=800,height:1000');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Facture ${f.numero}</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;padding:32px;max-width:700px;margin:0 auto;}
      h1{color:#003D82;font-size:22px;} .sub{color:#666;font-size:13px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#003D82;color:white;padding:9px 12px;text-align:left;font-size:13px;}
      td{padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;}
      .total{text-align:right;font-size:14px;} .grand-total{font-size:18px;font-weight:bold;color:#003D82;}
      @media print{body{padding:16px;}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
      <div><h1>${settings.nom||'Mon Entreprise'}</h1><div class="sub">${settings.adresse||''}<br>${settings.email||''}</div></div>
      <div style="text-align:right;">
        <div style="font-size:22px;font-weight:800;color:#003D82;">FACTURE</div>
        <div style="color:#666;font-size:13px;">N° ${f.numero}</div>
        <div style="color:#666;font-size:13px;">Date : ${UI.fmtDate(f.dateFacture)}</div>
      </div>
    </div>
    <div style="background:#f8f9ff;padding:12px;border-radius:8px;margin-bottom:20px;font-size:13px;">
      <strong>Client :</strong> ${f.clientNom||'—'}
    </div>
    <table>
      <thead><tr><th>Désignation</th><th style="text-align:right;">Qté</th><th style="text-align:right;">P.U. HT</th><th style="text-align:center;">TVA</th><th style="text-align:right;">Total HT</th></tr></thead>
      <tbody>
        ${(f.lines||[]).map(l => `<tr>
          <td>${l.designation}</td>
          <td style="text-align:right;">${l.qty}</td>
          <td style="text-align:right;">${Math.round(l.prixHT||0).toLocaleString('fr-FR')}</td>
          <td style="text-align:center;">${l.typeTVA==='normal'?'18%':l.typeTVA==='reduit'?'9%':'0%'}</td>
          <td style="text-align:right;">${Math.round(l.montant_ht||0).toLocaleString('fr-FR')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="total">
      <div>Total HT : <strong>${(f.totalHT||0).toLocaleString('fr-FR')} CFA</strong></div>
      <div>TVA : <strong>${(f.totalTVA||0).toLocaleString('fr-FR')} CFA</strong></div>
      <div class="grand-total">Total TTC : ${(f.totalTTC||0).toLocaleString('fr-FR')} CFA</div>
    </div>
    <div style="font-size:10px;color:#999;margin-top:32px;text-align:center;">
      TVA : Taux conformes au CGI CI Art.339 (18% taux normal). ${settings.cnps ? 'N° CNPS : '+settings.cnps : ''}
    </div>
    <script>window.print();window.onafterprint=()=>window.close();<\/script>
    </body></html>`);
    w.document.close();
  }

  // Pré-remplir date aujourd'hui à l'ouverture
  document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('invDate');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0,10);
  });

  return { render, addLine, updateTotals, save, openEdit, delete: deleteInv, print };
})();
