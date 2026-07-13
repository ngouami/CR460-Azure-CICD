/**
 * CogiCore — Page Paramétrage Central
 * Affiche les taux légaux depuis le ParametrageService (SSOT).
 * Permet de configurer la part CMU patronale et le taux AT/MP sectoriel.
 */
'use strict';

window.Parametrage = (() => {
  const ps = window.CogiCore.getParametrageService();

  async function render() {
    const settings = await DB.getSettings();
    const snap = ps.exportSnapshot();
    const p = window.CogiCore.PARAMETRES_LEGAUX;

    document.getElementById('parametragePanels').innerHTML = `

      <!-- Version réglementaire -->
      <div class="param-group">
        <h3>📋 Version réglementaire active</h3>
        <div class="param-row">
          <span class="param-label">Version</span>
          <span class="param-value">${snap.version}</span>
        </div>
        <div class="param-row">
          <span class="param-label">Source CNPS</span>
          <span class="param-source">${snap.sources.cnps}</span>
        </div>
        <div class="param-row">
          <span class="param-label">Source Fiscale</span>
          <span class="param-source">${snap.sources.fiscale}</span>
        </div>
        <div class="param-row">
          <span class="param-label">Snapshot généré</span>
          <span class="param-source">${new Date(snap.timestamp).toLocaleString('fr-FR')}</span>
        </div>
      </div>

      <!-- CNPS -->
      <div class="param-group">
        <h3>🏛️ CNPS — Cotisations Sociales CI</h3>
        <div class="param-row">
          <div><span class="param-label">SMIG mensuel</span><div class="param-source">Décret n°2022-986 du 21/12/2022</div></div>
          <span class="param-value">${p.smig.mensuel.toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Retraite — Part salariale</span><div class="param-source">Loi n°99-477 Art.23</div></div>
          <span class="param-value">${(p.cnps.retraite.taux_salarial*100).toFixed(2)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Retraite — Part patronale</span><div class="param-source">Loi n°99-477 Art.23</div></div>
          <span class="param-value">${(p.cnps.retraite.taux_patronal*100).toFixed(2)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Plafond cotisation retraite</span><div class="param-source">45 × SMIG</div></div>
          <span class="param-value">${p.cnps.retraite.plafond_mensuel.toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Prestations familiales</span><div class="param-source">Patronal — Plafond SMIG</div></div>
          <span class="param-value">${(p.cnps.prestations_familiales.taux_patronal*100).toFixed(2)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Assurance maternité</span><div class="param-source">Patronal — Plafond SMIG</div></div>
          <span class="param-value">${(p.cnps.assurance_maternite.taux_patronal*100).toFixed(2)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">FDFP — Salarial</span><div class="param-source">Fonds Développement Formation</div></div>
          <span class="param-value">${(p.cnps.fdfp.taux_salarial*100).toFixed(2)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">FDFP — Patronal</span><div class="param-source">Fonds Développement Formation</div></div>
          <span class="param-value">${(p.cnps.fdfp.taux_patronal*100).toFixed(2)} %</span>
        </div>

        <!-- AT/MP configurable -->
        <div class="param-row" style="align-items:flex-start;flex-direction:column;gap:8px;">
          <div>
            <span class="param-label">AT/MP — Taux sectoriel</span>
            <div class="param-source">Plage légale : ${(p.cnps.atmp.taux_min*100)}% – ${(p.cnps.atmp.taux_max*100)}% — Patronal</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="number" id="cfgATMP" value="${(settings.atmpTaux||p.cnps.atmp.taux_defaut*100).toFixed(1)}"
              min="${p.cnps.atmp.taux_min*100}" max="${p.cnps.atmp.taux_max*100}" step="0.5"
              style="width:80px;padding:6px;border:1.5px solid #003D82;border-radius:6px;font-size:14px;font-weight:700;text-align:center;">
            <span style="font-size:13px;color:#666;">% (défaut : ${(p.cnps.atmp.taux_defaut*100).toFixed(1)}%)</span>
            <button class="btn btn-sm btn-primary" onclick="Parametrage.saveATMP()">💾 Sauvegarder</button>
          </div>
        </div>
      </div>

      <!-- CMU -->
      <div class="param-group">
        <h3>🏥 CMU — Couverture Maladie Universelle</h3>
        <div class="param-row">
          <div><span class="param-label">Cotisation salariale</span><div class="param-source">Loi 2014-131 + Décret 2017-459 — Fixe légal</div></div>
          <span class="param-value">1 000 FCFA / mois</span>
        </div>
        <div class="param-row" style="align-items:flex-start;flex-direction:column;gap:8px;">
          <div>
            <span class="param-label">Part patronale (convention collective)</span>
            <div class="param-source">Défaut légal : 0 FCFA. Configurable selon accord d'entreprise.</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="number" id="cfgCMUPat" value="${settings.cmuPartPatronale||0}"
              min="0" step="500"
              style="width:100px;padding:6px;border:1.5px solid #003D82;border-radius:6px;font-size:14px;font-weight:700;text-align:center;">
            <span style="font-size:13px;color:#666;">FCFA / mois / salarié</span>
            <button class="btn btn-sm btn-primary" onclick="Parametrage.saveCMU()">💾 Sauvegarder</button>
          </div>
        </div>
      </div>

      <!-- TVA & IS -->
      <div class="param-group">
        <h3>🧾 TVA & Impôt sur les Sociétés — DGI CI 2026</h3>
        <div class="param-row">
          <div><span class="param-label">TVA taux normal</span><div class="param-source">CGI CI Art.339</div></div>
          <span class="param-value">${(p.tva.taux_normal*100).toFixed(0)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">TVA taux réduit</span><div class="param-source">Produits de première nécessité</div></div>
          <span class="param-value">${(p.tva.taux_reduit*100).toFixed(0)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">Seuil assujettissement TVA</span><div class="param-source">CA annuel HT</div></div>
          <span class="param-value">${p.tva.seuil_assujettissement.toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">IS (Régime Normal)</span><div class="param-source">CGI CI Art.85 — BIC</div></div>
          <span class="param-value">${(p.is.taux_rni*100).toFixed(0)} %</span>
        </div>
        <div class="param-row">
          <div><span class="param-label">IMF — Impôt Minimum Forfaitaire</span><div class="param-source">1% du CA HT — plancher 3 M FCFA</div></div>
          <span class="param-value">${(p.is.imf.taux*100).toFixed(0)} %</span>
        </div>
      </div>

      <!-- ITS Barème -->
      <div class="param-group">
        <h3>📊 Barème ITS — DGI CI 2026 (4 tranches progressives)</h3>
        <table>
          <thead><tr><th>Tranche</th><th>Seuil min (FCFA)</th><th>Seuil max (FCFA)</th><th>Taux</th></tr></thead>
          <tbody>
            ${p.its.tranches.map((t,i) => `<tr>
              <td>Tranche ${i+1}</td>
              <td>${t.seuil_min.toLocaleString('fr-FR')}</td>
              <td>${t.seuil_max === Infinity ? '∞' : t.seuil_max.toLocaleString('fr-FR')}</td>
              <td style="font-weight:700;color:${t.taux===0?'#28a745':'#003D82'};">${(t.taux*100).toFixed(0)} %</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function saveATMP() {
    const val = parseFloat(document.getElementById('cfgATMP').value);
    const p   = window.CogiCore.PARAMETRES_LEGAUX;
    if (val < p.cnps.atmp.taux_min*100 || val > p.cnps.atmp.taux_max*100) {
      UI.toast(`Taux AT/MP doit être entre ${p.cnps.atmp.taux_min*100}% et ${p.cnps.atmp.taux_max*100}%`, 'warn');
      return;
    }
    const settings = await DB.getSettings();
    settings.atmpTaux = val;
    await DB.saveSettings(settings);
    UI.toast(`Taux AT/MP mis à jour : ${val}%`, 'ok');
  }

  async function saveCMU() {
    const val = parseInt(document.getElementById('cfgCMUPat').value)||0;
    if (val < 0) { UI.toast('La part patronale ne peut pas être négative','warn'); return; }
    const settings = await DB.getSettings();
    settings.cmuPartPatronale = val;
    await DB.saveSettings(settings);
    UI.toast(`CMU patronale mise à jour : ${val.toLocaleString('fr-FR')} FCFA`, 'ok');
  }

  return { render, saveATMP, saveCMU };
})();
