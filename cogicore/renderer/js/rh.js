/**
 * CogiCore — Module RH & Paie
 * Délègue TOUS les calculs à ServicePaie (SSOT).
 * Aucun taux en dur ici.
 */
'use strict';

window.RH = (() => {
  // Alias vers les fonctions du module ServicePaie chargé depuis ../modules/paie/service-paie.js
  const { calcNetPaie, calcCNPS, genEcrituresComptables } = window.CogiCore;

  let _editId = null;

  function _nbParts(e) {
    const base = e.situationFam === 'Marié' ? 2 : 1;
    const enf  = Math.min(parseInt(e.nbEnfants) || 0, 6);
    return Math.min(base + enf * 0.5, 4); // plafond légal 4 parts
  }

  async function render() {
    await renderEmployes();
    _populateMonthSelect();
  }

  function showTab(contentId, _deprecated, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#rh .tab-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(contentId);
    if (el) el.classList.add('active');
    if (btn) btn.classList.add('active');
    if (contentId === 'paie') renderBulletins();
    if (contentId === 'rapportRH') renderRapport();
  }

  async function renderEmployes() {
    const employes = (await DB.getAll('employes')).filter(e => !e.deleted);
    const tbody = document.getElementById('employeesTable');
    if (!tbody) return;

    // KPIs
    const actifs = employes.filter(e => e.statut === 'Actif');
    const masse  = actifs.reduce((s,e) => s + (parseFloat(e.salaire)||0), 0);
    document.getElementById('rhKpis').innerHTML = [
      { l:'Effectif actif', v: actifs.length, c:'#003D82' },
      { l:'Masse salariale brute', v: UI.fmt(masse), c:'#dc3545' },
      { l:'Coût employeur estimé', v: UI.fmt(masse * 1.20), c:'#ff9800' },
    ].map(k => `<div class="card" style="border-left:4px solid ${k.c};">
      <div class="stat-label">${k.l}</div>
      <div class="stat-value" style="color:${k.c};">${k.v}</div>
    </div>`).join('');

    if (!employes.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">Aucun employé enregistré.</td></tr>';
      return;
    }

    tbody.innerHTML = employes.map(e => {
      const brut = Math.round(parseFloat(e.salaire)||0);
      let paieRow = { net: brut, cnps: { retraite_sal: 0 } };
      try { paieRow = calcNetPaie(brut, e.contrat||'CDI', _nbParts(e)); } catch {}
      return `<tr>
        <td>${e.matricule||'—'}</td>
        <td><strong>${e.nom}</strong></td>
        <td>${e.poste||'—'}</td>
        <td><span class="badge badge-info">${e.contrat||'CDI'}</span></td>
        <td>${UI.fmt(brut)}</td>
        <td style="color:#dc3545;">${UI.fmt(paieRow.cnps.retraite_sal)}</td>
        <td style="color:#28a745;font-weight:700;">${UI.fmt(paieRow.net)}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-edit" onclick="RH.openEdit(${e.id})">✏️</button>
          <button class="btn btn-sm btn-secondary btn-print" onclick="RH.printBulletin(${e.id})" style="background:#6f42c1;color:white;">💰</button>
          <button class="btn btn-sm btn-danger btn-delete" onclick="RH.deleteEmp(${e.id})">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  async function saveEmployee() {
    const nom     = document.getElementById('empNom').value.trim();
    const poste   = document.getElementById('empPoste').value.trim();
    const contrat = document.getElementById('empContrat').value;
    const salaire = parseFloat(document.getElementById('empSalaire').value) || 0;

    if (!nom || !poste) { UI.toast('Nom et Poste obligatoires','warn'); return; }

    // Validation SMIG via ServicePaie (rejet serveur)
    try {
      if (salaire > 0) calcCNPS(salaire, contrat);
    } catch(err) {
      UI.toast(err.message, 'err');
      return;
    }

    const emp = {
      id:            _editId || Date.now(),
      matricule:     document.getElementById('empNom').dataset.matricule || `EMP-${Date.now()}`,
      nom, poste, contrat, salaire,
      sursalaire:    parseFloat(document.getElementById('empSursalaire').value)||0,
      dateEmbauche:  document.getElementById('empDateEmb').value,
      situationFam:  document.getElementById('empSitFam').value,
      nbEnfants:     parseInt(document.getElementById('empNbEnfants').value)||0,
      cnpsNum:       document.getElementById('empNoCNPS').value.trim(),
      cnamNum:       document.getElementById('empNoCNAM').value.trim(),
      telephone:     document.getElementById('empTel').value.trim(),
      email:         document.getElementById('empEmail').value.trim(),
      rib:           document.getElementById('empRib').value.trim(),
      statut:        'Actif',
    };

    await DB.upsert('employes', emp);
    await DB.logActivity('RH', `Employé ${nom} enregistré`);
    UI.closeModal('employeeModal');
    UI.toast(`${nom} enregistré`, 'ok');
    _editId = null;
    await renderEmployes();
  }

  async function openEdit(id) {
    const e = await DB.findById('employes', id);
    if (!e) return;
    _editId = id;
    document.getElementById('empNom').value      = e.nom;
    document.getElementById('empNom').dataset.matricule = e.matricule;
    document.getElementById('empPoste').value    = e.poste;
    document.getElementById('empContrat').value  = e.contrat;
    document.getElementById('empSalaire').value  = e.salaire;
    document.getElementById('empSursalaire').value = e.sursalaire||0;
    document.getElementById('empDateEmb').value  = e.dateEmbauche;
    document.getElementById('empSitFam').value   = e.situationFam||'Célibataire';
    document.getElementById('empNbEnfants').value = e.nbEnfants||0;
    document.getElementById('empNoCNPS').value   = e.cnpsNum||'';
    document.getElementById('empNoCNAM').value   = e.cnamNum||'';
    document.getElementById('empTel').value      = e.telephone||'';
    document.getElementById('empEmail').value    = e.email||'';
    document.getElementById('empRib').value      = e.rib||'';
    _updateEmpSimulation();
    UI.openModal('employeeModal');
  }

  function _updateEmpSimulation() {
    const brut = parseFloat(document.getElementById('empSalaire').value)||0;
    const cont = document.getElementById('empContrat').value;
    const simEl = document.getElementById('empSimulation');
    if (!simEl || brut < 75000) { if(simEl) simEl.innerHTML=''; return; }
    try {
      const p = calcNetPaie(brut, cont, 1);
      simEl.innerHTML = `
        <strong style="font-size:13px;color:#003D82;">Simulation bulletin (1 part)</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;font-size:12px;">
          <div>Brut : <strong>${UI.fmt(p.brut_total)}</strong></div>
          <div>CNPS sal : <strong style="color:#dc3545;">${UI.fmt(p.cnps.total_sal)}</strong></div>
          <div>ITS : <strong style="color:#dc3545;">${UI.fmt(p.its_net)}</strong></div>
          <div>NET : <strong style="color:#28a745;font-size:15px;">${UI.fmt(p.net)}</strong></div>
          <div style="grid-column:1/-1;color:#888;">Coût employeur : ${UI.fmt(p.cout_total_employeur)}</div>
        </div>`;
    } catch(err) {
      simEl.innerHTML = `<div class="alert alert-warn" style="margin:0;">${err.message}</div>`;
    }
  }

  // Attacher la simulation en temps réel
  document.addEventListener('DOMContentLoaded', () => {
    const salEl = document.getElementById('empSalaire');
    const conEl = document.getElementById('empContrat');
    if (salEl) salEl.addEventListener('input', _updateEmpSimulation);
    if (conEl) conEl.addEventListener('change', _updateEmpSimulation);
  });

  async function deleteEmp(id) {
    if (!UI.confirm('Supprimer cet employé ?')) return;
    await DB.softDelete('employes', id);
    UI.toast('Employé supprimé','ok');
    await renderEmployes();
  }

  // ── BULLETINS DE PAIE ─────────────────────────────────────
  function _populateMonthSelect() {
    const sel = document.getElementById('rhPaieMonth');
    if (!sel) return;
    const now = new Date();
    sel.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = d.toISOString().slice(0,7);
      const lbl = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
      sel.appendChild(Object.assign(document.createElement('option'), { value:val, textContent:lbl }));
    }
  }

  async function renderBulletins() {
    const periode = document.getElementById('rhPaieMonth')?.value || new Date().toISOString().slice(0,7);
    const employes = (await DB.getAll('employes')).filter(e => !e.deleted && e.statut==='Actif');
    const bulletins = (await DB.getAll('bulletins')).filter(b => b.periode === periode);

    const container = document.getElementById('bulletinsTable');
    if (!container) return;

    if (!employes.length) {
      container.innerHTML = '<p class="text-muted" style="padding:20px;">Aucun employé actif.</p>';
      return;
    }

    container.innerHTML = employes.map(e => {
      const brut = Math.round(parseFloat(e.salaire)||0);
      const saved = bulletins.find(b => b.employeId === e.id);
      let p = null;
      try { p = saved || calcNetPaie(brut, e.contrat||'CDI', _nbParts(e)); } catch {}
      const isValide = saved?.statut === 'VALIDE';

      return `<div class="bulletin-card">
        <div class="bulletin-header">
          <div><strong>${e.nom}</strong> — ${e.poste}</div>
          <div>${isValide ? UI.badge('VALIDÉ','success') : UI.badge('BROUILLON','warning')}</div>
        </div>
        <table class="bulletin-rows" style="width:100%;">
          <tr><td>Salaire brut</td><td style="text-align:right;font-weight:600;">${UI.fmt(brut)}</td></tr>
          <tr><td style="color:#dc3545;">— CNPS salarial</td><td style="text-align:right;color:#dc3545;">-${UI.fmt(p?.cnps?.total_sal)}</td></tr>
          <tr><td style="color:#dc3545;">— ITS (Impôt)</td><td style="text-align:right;color:#dc3545;">-${UI.fmt(p?.its_net)}</td></tr>
          <tr style="border-top:2px solid #003D82;"><td class="bulletin-total">NET À PAYER</td><td style="text-align:right;" class="bulletin-total">${UI.fmt(p?.net)}</td></tr>
          <tr><td style="color:#888;font-size:12px;">Charges patronales</td><td style="text-align:right;color:#888;font-size:12px;">${UI.fmt(p?.cnps?.total_pat)}</td></tr>
        </table>
        <div style="margin-top:10px;display:flex;gap:8px;">
          ${!isValide ? `<button class="btn btn-sm btn-success" onclick="RH.validerBulletin(${e.id},'${periode}')">✅ Valider & Figer</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="RH.printBulletin(${e.id})">🖨️ Imprimer</button>
        </div>
      </div>`;
    }).join('');
  }

  async function validerBulletin(employeId, periode) {
    const e = await DB.findById('employes', employeId);
    if (!e) return;
    const brut = Math.round(parseFloat(e.salaire)||0);
    let p;
    try { p = calcNetPaie(brut, e.contrat||'CDI', _nbParts(e)); }
    catch(err) { UI.toast(err.message,'err'); return; }

    const bulletin = {
      id:          `${employeId}_${periode}`,
      employeId,
      periode,
      statut:      'VALIDE',
      brut_total:  p.brut_total,
      net:         p.net,
      its_net:     p.its_net,
      cnps:        p.cnps,
      cout_total:  p.cout_total_employeur,
      valideAt:    new Date().toISOString(),
    };

    await DB.upsert('bulletins', bulletin);

    // Générer les écritures SYSCOHADA
    try {
      const date = `${periode}-28`;
      const ecritures = genEcrituresComptables(p, e.nom, date);
      for (const ec of ecritures) {
        await DB.upsert('ecritures', { ...ec, id: Date.now() + Math.random() });
      }
    } catch(err) { console.warn('Écritures SYSCOHADA:', err.message); }

    UI.toast(`Bulletin ${e.nom} ${periode} validé`, 'ok');
    await renderBulletins();
  }

  async function printBulletin(employeId) {
    const e = await DB.findById('employes', employeId);
    if (!e) return;
    const settings = await DB.getSettings();
    const brut = Math.round(parseFloat(e.salaire)||0);
    let p;
    try { p = calcNetPaie(brut, e.contrat||'CDI', _nbParts(e)); }
    catch(err) { UI.toast(err.message,'err'); return; }

    const periode = new Date().toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Bulletin ${e.nom}</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;padding:32px;max-width:700px;margin:0 auto;color:#1a1a2e;}
      h1{color:#003D82;font-size:18px;margin-bottom:4px;}
      .sub{color:#666;font-size:13px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th,td{padding:9px 12px;border:1px solid #e0e7ff;font-size:13px;}
      th{background:#003D82;color:white;text-align:left;}
      .total-row td{background:#e8f0ff;font-weight:bold;font-size:15px;}
      .pat-row td{background:#f8f9fa;color:#666;font-size:12px;}
      .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;}
      .sign-box{border-top:2px solid #333;padding-top:8px;text-align:center;font-size:13px;}
      @media print{body{padding:16px;}}
    </style></head><body>
    <h1>${settings.nom || 'Mon Entreprise'} — Bulletin de Paie</h1>
    <div class="sub">Période : ${periode} &nbsp;|&nbsp; N° CNPS employeur : ${settings.cnps||'—'}</div>
    <table>
      <tr><th>Employé</th><td colspan="3">${e.nom}</td></tr>
      <tr><th>Poste</th><td>${e.poste||'—'}</td><th>Contrat</th><td>${e.contrat||'CDI'}</td></tr>
      <tr><th>N° CNPS</th><td>${e.cnpsNum||'—'}</td><th>Matricule</th><td>${e.matricule||'—'}</td></tr>
    </table>
    <table>
      <thead><tr><th>Libellé</th><th>Base</th><th>Taux</th><th>Montant (CFA)</th></tr></thead>
      <tbody>
        <tr><td>Salaire de base</td><td>${UI.fmt(p.salaire_base)}</td><td>—</td><td>${UI.fmt(p.salaire_base)}</td></tr>
        ${p.sursalaire > 0 ? `<tr><td>Sursalaire</td><td>—</td><td>—</td><td>${UI.fmt(p.sursalaire)}</td></tr>` : ''}
        <tr><td style="color:#dc3545;">CNPS Retraite (salarial)</td><td>${UI.fmt(p.cnps._base_retraite)}</td><td>6,30 %</td><td style="color:#dc3545;">-${UI.fmt(p.cnps.retraite_sal)}</td></tr>
        <tr><td style="color:#dc3545;">CMU (salariale)</td><td>—</td><td>Fixe</td><td style="color:#dc3545;">-${UI.fmt(p.cnps.cmu_sal)}</td></tr>
        <tr><td style="color:#dc3545;">FDFP (salarial)</td><td>${UI.fmt(p.brut_total)}</td><td>0,40 %</td><td style="color:#dc3545;">-${UI.fmt(p.cnps.fdfp_sal)}</td></tr>
        <tr><td style="color:#dc3545;">ITS (Impôt Traitements & Salaires)</td><td>${UI.fmt(p.brut_total)}</td><td>Barème</td><td style="color:#dc3545;">-${UI.fmt(p.its_net)}</td></tr>
        <tr class="total-row"><td colspan="3">NET À PAYER</td><td style="color:#003D82;font-size:17px;">${UI.fmt(p.net)}</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th colspan="4">Charges patronales (pour information)</th></tr></thead>
      <tbody>
        <tr class="pat-row"><td>CNPS Retraite (patronal)</td><td>${UI.fmt(p.cnps._base_retraite)}</td><td>7,75 %</td><td>${UI.fmt(p.cnps.retraite_pat)}</td></tr>
        <tr class="pat-row"><td>Prestations familiales</td><td>${UI.fmt(p.cnps._base_plafonnee_pf)}</td><td>5,00 %</td><td>${UI.fmt(p.cnps.pf)}</td></tr>
        <tr class="pat-row"><td>Assurance maternité</td><td>${UI.fmt(p.cnps._base_plafonnee_pf)}</td><td>0,75 %</td><td>${UI.fmt(p.cnps.maternite)}</td></tr>
        <tr class="pat-row"><td>AT/MP</td><td>${UI.fmt(p.cnps._base_plafonnee_pf)}</td><td>${(p.cnps._taux_atmp_applique*100).toFixed(2)} %</td><td>${UI.fmt(p.cnps.atmp)}</td></tr>
        <tr class="pat-row"><td>FDFP (patronal)</td><td>${UI.fmt(p.brut_total)}</td><td>1,20 %</td><td>${UI.fmt(p.cnps.fdfp_pat)}</td></tr>
        <tr class="pat-row" style="font-weight:700;"><td colspan="3">Coût total employeur</td><td>${UI.fmt(p.cout_total_employeur)}</td></tr>
      </tbody>
    </table>
    <div class="sign">
      <div class="sign-box">Pour l'Employeur<br><br><br></div>
      <div class="sign-box">Le Salarié (Lu et approuvé)<br><br><br></div>
    </div>
    <div style="font-size:10px;color:#999;margin-top:24px;text-align:center;">
      Taux CNPS conformes à la Loi n°99-477 + Décret 2022-986. ITS : Barème DGI CI 2026. CMU : Loi 2014-131.
    </div>
    <script>window.print();window.onafterprint=()=>window.close();<\/script>
    </body></html>`);
    w.document.close();
  }

  async function renderRapport() {
    const employes = (await DB.getAll('employes')).filter(e => !e.deleted && e.statut === 'Actif');
    const el = document.getElementById('rhRapport');
    if (!el) return;
    const masse = employes.reduce((s,e) => s+(parseFloat(e.salaire)||0), 0);
    const totalNet = employes.reduce((s,e) => {
      try { return s + calcNetPaie(Math.round(parseFloat(e.salaire)||0), e.contrat||'CDI', 1).net; }
      catch { return s; }
    }, 0);
    el.innerHTML = `<div class="grid">
      <div class="card" style="border-left:4px solid #003D82;"><div class="stat-label">Effectif actif</div><div class="stat-value">${employes.length}</div></div>
      <div class="card" style="border-left:4px solid #dc3545;"><div class="stat-label">Masse brute</div><div class="stat-value" style="color:#dc3545;">${UI.fmt(masse)}</div></div>
      <div class="card" style="border-left:4px solid #28a745;"><div class="stat-label">Masse nette</div><div class="stat-value" style="color:#28a745;">${UI.fmt(totalNet)}</div></div>
      <div class="card" style="border-left:4px solid #ff9800;"><div class="stat-label">Coût employeur total</div><div class="stat-value" style="color:#ff9800;">${UI.fmt(masse * 1.20)}</div></div>
    </div>`;
  }

  return { render, showTab, saveEmployee, openEdit, deleteEmp, renderBulletins, validerBulletin, printBulletin, renderRapport };
})();
