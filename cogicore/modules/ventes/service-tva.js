/**
 * CogiCore — Module Ventes : Service TVA
 * ════════════════════════════════════════
 * Calcul TVA conforme CGI CI 2026 (Art. 339-395).
 * Source unique des taux : ParametrageService.
 * Aucun taux hardcodé ici.
 */

'use strict';

const { getParametrageService } = (() => {
  if (typeof require !== 'undefined') return require('../../core/parametrage-service');
  return window.CogiCore;
})();

// ────────────────────────────────────────────────────────────
// VALIDATION ENTRÉES
// ────────────────────────────────────────────────────────────

function _validerLigne(ligne) {
  if (!ligne || typeof ligne !== 'object')
    throw new TypeError('[ServiceTVA] Ligne invalide — objet attendu');
  if (typeof ligne.montant_ht !== 'number' || isNaN(ligne.montant_ht) || ligne.montant_ht < 0)
    throw new RangeError(`[ServiceTVA] montant_ht invalide : ${ligne.montant_ht}`);
  const types_valides = ['normal', 'reduit', 'zero', 'exonere'];
  const type = ligne.type_tva ?? 'normal';
  if (!types_valides.includes(type))
    throw new TypeError(`[ServiceTVA] type_tva invalide : "${type}". Valeurs : ${types_valides.join(', ')}`);
}

// ────────────────────────────────────────────────────────────
// CALCULS TVA
// ────────────────────────────────────────────────────────────

/**
 * Calcule la TVA pour une ligne de facture.
 * @param {number} montant_ht  - Montant hors taxes (FCFA)
 * @param {string} [type_tva]  - 'normal' (18%), 'reduit' (9%), 'zero', 'exonere'
 * @returns {{ taux, tva, ttc }}
 */
function calcTVALigne(montant_ht, type_tva = 'normal') {
  _validerLigne({ montant_ht, type_tva });
  const ps   = getParametrageService();
  const taux = ps.getTVA(type_tva);
  const tva  = Math.round(montant_ht * taux);
  return {
    montant_ht: Math.round(montant_ht),
    taux_applique: taux,
    taux_pct: `${(taux * 100).toFixed(0)}%`,
    tva,
    ttc: Math.round(montant_ht) + tva,
  };
}

/**
 * Calcule les totaux TVA d'une facture multi-lignes.
 * Chaque ligne : { designation, montant_ht, type_tva }
 * @param {Array<Object>} lignes
 * @returns {Object} Totaux HT / TVA ventilée / TTC
 */
function calcTotauxFacture(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0)
    throw new TypeError('[ServiceTVA] lignes doit être un tableau non vide');

  lignes.forEach(_validerLigne);

  const ventilation = {};    // TVA ventilée par taux
  let total_ht  = 0;
  let total_tva = 0;

  for (const ligne of lignes) {
    const result = calcTVALigne(ligne.montant_ht, ligne.type_tva ?? 'normal');
    total_ht  += result.montant_ht;
    total_tva += result.tva;

    const cle = result.taux_pct;
    ventilation[cle] = ventilation[cle] || { base_ht: 0, tva: 0 };
    ventilation[cle].base_ht += result.montant_ht;
    ventilation[cle].tva     += result.tva;
  }

  return {
    total_ht:  Math.round(total_ht),
    total_tva: Math.round(total_tva),
    total_ttc: Math.round(total_ht + total_tva),
    ventilation_tva: ventilation,
    nb_lignes: lignes.length,
  };
}

/**
 * Calcule la TVA nette à reverser à la DGI pour un mois donné.
 * TVA nette = TVA collectée − TVA déductible (sur achats)
 * @param {number} tva_collectee   - TVA sur ventes du mois
 * @param {number} tva_deductible  - TVA sur achats (factures normalisées DGI)
 * @returns {Object}
 */
function calcDeclarationTVA(tva_collectee, tva_deductible) {
  if (typeof tva_collectee !== 'number' || tva_collectee < 0)
    throw new RangeError(`[ServiceTVA] tva_collectee invalide : ${tva_collectee}`);
  if (typeof tva_deductible !== 'number' || tva_deductible < 0)
    throw new RangeError(`[ServiceTVA] tva_deductible invalide : ${tva_deductible}`);

  const tva_nette = Math.round(tva_collectee - tva_deductible);
  return {
    tva_collectee:  Math.round(tva_collectee),
    tva_deductible: Math.round(tva_deductible),
    tva_nette,
    statut: tva_nette > 0 ? 'A_REVERSER' : tva_nette < 0 ? 'CREDIT' : 'NUL',
    compte_tva_collectee:  getParametrageService().getCompteSYSCOHADA('tva_collectee'),  // 4431
    compte_tva_deductible: getParametrageService().getCompteSYSCOHADA('tva_deductible'), // 4452
  };
}

// ────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcTVALigne, calcTotauxFacture, calcDeclarationTVA };
} else if (typeof window !== 'undefined') {
  window.CogiCore = window.CogiCore || {};
  Object.assign(window.CogiCore, { calcTVALigne, calcTotauxFacture, calcDeclarationTVA });
}
