/**
 * CogiCore — Dashboard / KPIs
 */
'use strict';

window.Dashboard = (() => {

  async function render() {
    const [factures, devis, clients, employes, depenses, ecritures] = await Promise.all([
      DB.getAll('factures'),
      DB.getAll('devis'),
      DB.getAll('clients'),
      DB.getAll('employes'),
      DB.getAll('depenses'),
      DB.getAll('ecritures_comptables'),
    ]);

    const actFact    = factures.filter(f => !f.deleted);
    const actCli     = clients.filter(c => !c.deleted);
    const actEmp     = employes.filter(e => !e.deleted && e.actif !== false);
    const actDep     = depenses.filter(d => !d.deleted);

    // KPIs
    const caTotal     = actFact.filter(f => f.statut === 'Payée').reduce((s, f) => s + (f.totalTTC || 0), 0);
    const caEnAttente = actFact.filter(f => f.statut === 'En attente').reduce((s, f) => s + (f.totalTTC || 0), 0);
    const depTotal    = actDep.reduce((s, d) => s + (d.montant || 0), 0);

    // Current month
    const now = new Date();
    const mois = now.getMonth(), annee = now.getFullYear();
    const factMois = actFact.filter(f => {
      const d = new Date(f.dateFacture || f.createdAt);
      return d.getMonth() === mois && d.getFullYear() === annee;
    });
    const caMois = factMois.filter(f => f.statut === 'Payée').reduce((s, f) => s + (f.totalTTC || 0), 0);

    // Render KPI cards
    const kpiEl = document.getElementById('dashboardKPIs');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">CA Total encaissé</div>
          <div class="kpi-value">${UI.fmt(caTotal)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CA mois en cours</div>
          <div class="kpi-value">${UI.fmt(caMois)}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#ffc107;">
          <div class="kpi-label">Factures en attente</div>
          <div class="kpi-value" style="color:#856404;">${UI.fmt(caEnAttente)}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#dc3545;">
          <div class="kpi-label">Dépenses totales</div>
          <div class="kpi-value" style="color:#dc3545;">${UI.fmt(depTotal)}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#28a745;">
          <div class="kpi-label">Résultat estimé</div>
          <div class="kpi-value" style="color:${caTotal - depTotal >= 0 ? '#28a745' : '#dc3545'};">${UI.fmt(caTotal - depTotal)}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#6c757d;">
          <div class="kpi-label">Clients actifs</div>
          <div class="kpi-value" style="font-size:28px;">${actCli.length}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#6c757d;">
          <div class="kpi-label">Employés actifs</div>
          <div class="kpi-value" style="font-size:28px;">${actEmp.length}</div>
        </div>
        <div class="kpi-card" style="border-left-color:#6c757d;">
          <div class="kpi-label">Factures ce mois</div>
          <div class="kpi-value" style="font-size:28px;">${factMois.length}</div>
        </div>
      `;
    }

    // Recent invoices
    const recentEl = document.getElementById('dashboardRecentFact');
    if (recentEl) {
      const recent = actFact.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
      const statutColor = { 'Payée': 'success', 'En attente': 'warning', 'Annulée': 'danger' };
      recentEl.innerHTML = recent.length
        ? `<table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;">N°</th><th>Client</th><th>Montant TTC</th><th>Statut</th></tr></thead>
            <tbody>${recent.map(f => `<tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px;"><strong>${f.numero}</strong></td>
              <td style="padding:8px;">${f.clientNom || '—'}</td>
              <td style="padding:8px;font-weight:700;">${UI.fmt(f.totalTTC)}</td>
              <td style="padding:8px;">${UI.badge(f.statut || 'En attente', statutColor[f.statut] || 'warning')}</td>
            </tr>`).join('')}</tbody>
          </table>`
        : '<p style="color:#999;text-align:center;padding:16px;">Aucune facture récente.</p>';
    }

    // Activity log
    const actLogEl = document.getElementById('dashboardActivity');
    if (actLogEl) {
      const logs = (await DB.getAll('activity_log') || []).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 10);
      actLogEl.innerHTML = logs.length
        ? logs.map(l => `<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
            <span style="color:#999;font-size:11px;">${UI.fmtDate(l.ts)}</span>
            <span style="margin-left:8px;">[${l.module}] ${l.msg}</span>
          </div>`).join('')
        : '<p style="color:#999;text-align:center;padding:16px;">Aucune activité récente.</p>';
    }
  }

  return { render };
})();
