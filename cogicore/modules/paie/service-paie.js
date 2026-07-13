/**
 * CogiCore — Module Paie / RH
 * ════════════════════════════
 * Calcul net de paie conforme CNPS + ITS ivoirien.
 * Ce module NE contient AUCUN taux en dur.
 * Il délègue TOUS les paramètres au ParametrageService (SSOT).
 *
 * Architecture : couche Logique Métier (API interne)
 * Dépendance   : core/parametrage-service.js
 */

'use strict';

const { getParametrageService } = (() => {
  if (typeof require !== 'undefined') return require('../../core/parametrage-service');
  return window.CogiCore; // navigateur
})();

// ────────────────────────────────────────────────────────────
// VALIDATION DES ENTRÉES (sécurité côté serveur — jamais faire
// confiance au client)
// ────────────────────────────────────────────────────────────

function _validerSalaire(salaireBrut) {
  if (typeof salaireBrut !== 'number' || isNaN(salaireBrut))
    throw new TypeError(`[ServicePaie] salaireBrut doit être un nombre. Reçu : ${salaireBrut}`);
  if (salaireBrut < 0)
    throw new RangeError(`[ServicePaie] salaireBrut ne peut pas être négatif. Reçu : ${salaireBrut}`);

  const ps = getParametrageService();
  const smig = ps.getSMIG();
  if (salaireBrut > 0 && salaireBrut < smig)
    throw new RangeError(
      `[ServicePaie] salaireBrut (${salaireBrut}) inférieur au SMIG (${smig} FCFA). ` +
      `Refus de calcul — violation du Code du Travail CI.`
    );
}

function _validerContrat(contrat) {
  const types_valides = ['CDI', 'CDD', 'Stage', 'Consultant', 'Journalier'];
  if (!types_valides.includes(contrat))
    throw new TypeError(
      `[ServicePaie] Type de contrat invalide : "${contrat}". ` +
      `Valeurs acceptées : ${types_valides.join(', ')}`
    );
}

function _validerNbParts(nbParts) {
  if (typeof nbParts !== 'number' || nbParts < 1 || nbParts > 4)
    throw new RangeError(
      `[ServicePaie] nbParts doit être entre 1 et 4 (plafond RICF). Reçu : ${nbParts}`
    );
}

// ────────────────────────────────────────────────────────────
// CALCUL CNPS
// ────────────────────────────────────────────────────────────

/**
 * Calcule toutes les cotisations CNPS pour un bulletin de paie.
 * @param {number} salaireBrut   - Salaire brut mensuel (FCFA)
 * @param {string} contrat       - Type de contrat ('CDI', 'CDD', 'Stage', ...)
 * @param {Object} [options]     - { atmp_taux: 0.02 } pour surcharge secteur
 * @returns {Object} Détail de toutes les cotisations
 */
function calcCNPS(salaireBrut, contrat = 'CDI', options = {}) {
  _validerSalaire(salaireBrut);
  _validerContrat(contrat);

  // Les stagiaires sont exonérés de CNPS (convention de stage ≠ contrat de travail)
  if (contrat === 'Stage') {
    return {
      retraite_sal: 0, retraite_pat: 0,
      pf: 0, maternite: 0, atmp: 0,
      cmu_sal: 0, cmu_pat: 0,
      fdfp_sal: 0, fdfp_pat: 0,
      total_sal: 0, total_pat: 0,
      _note: 'Stagiaire — exonéré CNPS',
    };
  }

  const ps = getParametrageService(options.atmp_taux ? { atmp_taux: options.atmp_taux } : {});
  const cnps = ps.getCNPS();
  const cmuCfg = ps.getCMU(options.cmu_patronale ?? 0);

  // Base retraite (plafonnée à 45 × SMIG)
  const baseRetraite = Math.min(salaireBrut, cnps.retraite.plafond_mensuel);

  // Base PF / Maternité / AT-MP (plafonnée au SMIG)
  const basePlafonneeSMIG = Math.min(salaireBrut, cnps.prestations_familiales.plafond_mensuel);

  const taux_atmp = options.atmp_taux ?? cnps.atmp.taux_defaut;

  // Contrôle cohérence taux AT/MP
  if (taux_atmp < cnps.atmp.taux_min || taux_atmp > cnps.atmp.taux_max) {
    throw new RangeError(
      `[ServicePaie] Taux AT/MP ${(taux_atmp * 100).toFixed(2)}% hors plage légale ` +
      `[${cnps.atmp.taux_min * 100}% – ${cnps.atmp.taux_max * 100}%]`
    );
  }

  return {
    // Retraite (Vieillesse)
    retraite_sal: Math.round(baseRetraite * cnps.retraite.taux_salarial),
    retraite_pat: Math.round(baseRetraite * cnps.retraite.taux_patronal),

    // Prestations familiales (patronal uniquement)
    pf:           Math.round(basePlafonneeSMIG * cnps.prestations_familiales.taux_patronal),

    // Assurance maternité (patronal uniquement)
    maternite:    Math.round(basePlafonneeSMIG * cnps.assurance_maternite.taux_patronal),

    // Accidents du travail (patronal uniquement)
    atmp:         Math.round(basePlafonneeSMIG * taux_atmp),

    // CMU
    cmu_sal:      cmuCfg.salariale,
    cmu_pat:      cmuCfg.patronale,

    // FDFP
    fdfp_sal:     Math.round(salaireBrut * cnps.fdfp.taux_salarial),
    fdfp_pat:     Math.round(salaireBrut * cnps.fdfp.taux_patronal),

    // Totaux
    get total_sal() {
      return this.retraite_sal + this.cmu_sal + this.fdfp_sal;
    },
    get total_pat() {
      return this.retraite_pat + this.pf + this.maternite + this.atmp + this.cmu_pat + this.fdfp_pat;
    },

    // Méta (traçabilité)
    _base_retraite:      baseRetraite,
    _base_plafonnee_pf:  basePlafonneeSMIG,
    _taux_atmp_applique: taux_atmp,
  };
}

// ────────────────────────────────────────────────────────────
// CALCUL ITS (Impôt sur Traitements et Salaires)
// ────────────────────────────────────────────────────────────

/**
 * Calcule l'ITS brut selon le barème progressif DGI CI 2026.
 * Base imposable = Salaire BRUT (réforme CI — pas brut - CNPS).
 * @param {number} salaireBrut
 * @returns {number} ITS brut avant RICF
 */
function calcITSBrut(salaireBrut) {
  if (salaireBrut <= 0) return 0;

  const bareme = getParametrageService().getBaremeITS().tranches;
  let itsBrut = 0;

  for (const tranche of bareme) {
    if (salaireBrut <= tranche.seuil_min) break;
    const imposable = Math.min(salaireBrut, tranche.seuil_max) - tranche.seuil_min;
    itsBrut += imposable * tranche.taux;
  }
  return Math.round(itsBrut);
}

/**
 * Calcule la RICF (Réduction d'Impôt pour Charges de Famille).
 * @param {number} itsBrut
 * @param {number} nbParts  - 1 (célibataire) à 4 (marié + enfants)
 * @returns {number} Montant RICF à déduire
 */
function calcRICF(itsBrut, nbParts = 1) {
  const ricfCfg = getParametrageService().getBaremeITS().ricf;
  const parts = Math.min(Math.max(nbParts, 1), ricfCfg.parts_max);
  if (parts <= 1) return 0;
  return Math.min(Math.round(itsBrut * (1 - 1 / parts)), itsBrut);
}

/**
 * ITS net = ITS brut − RICF (jamais négatif).
 * @param {number} salaireBrut
 * @param {number} nbParts
 * @returns {number}
 */
function calcITS(salaireBrut, nbParts = 1) {
  _validerNbParts(nbParts);
  const itsBrut = calcITSBrut(salaireBrut);
  const ricf    = calcRICF(itsBrut, nbParts);
  return Math.max(0, itsBrut - ricf);
}

// ────────────────────────────────────────────────────────────
// CALCUL NET DE PAIE — Fonction principale
// ────────────────────────────────────────────────────────────

/**
 * Calcule le bulletin de paie complet selon la législation ivoirienne.
 *
 * @param {number} salaireBrut   - Salaire brut mensuel (FCFA)
 * @param {string} contrat       - Type de contrat
 * @param {number} [nbParts=1]   - Nombre de parts fiscales (RICF)
 * @param {Object} [options]     - { atmp_taux, cmu_patronale, sursalaire }
 * @returns {Object} Bulletin complet avec toutes les lignes
 */
function calcNetPaie(salaireBrut, contrat = 'CDI', nbParts = 1, options = {}) {
  _validerSalaire(salaireBrut);
  _validerContrat(contrat);
  _validerNbParts(nbParts);

  const sursalaire     = Math.max(0, options.sursalaire ?? 0);
  const brutTotal      = salaireBrut + sursalaire;
  const cnps           = calcCNPS(brutTotal, contrat, options);
  const its            = calcITS(brutTotal, nbParts);

  // Net à payer = Brut − retenues salariales (CNPS sal + CMU sal + FDFP sal + ITS)
  const total_retenues = cnps.total_sal + its;
  const net            = Math.round(brutTotal - total_retenues);

  // Coût total employeur = Brut + charges patronales
  const cout_total_employeur = Math.round(brutTotal + cnps.total_pat);

  // Contrôle de cohérence : net ne peut pas être négatif
  if (net < 0) {
    throw new Error(
      `[ServicePaie] Net à payer négatif (${net} FCFA) pour un brut de ${brutTotal} FCFA. ` +
      `Vérifier les retenues CNPS et ITS.`
    );
  }

  return {
    // Éléments bruts
    salaire_base:        salaireBrut,
    sursalaire:          sursalaire,
    brut_total:          brutTotal,

    // Cotisations CNPS
    cnps,

    // ITS
    its_brut:            calcITSBrut(brutTotal),
    ricf:                calcRICF(calcITSBrut(brutTotal), nbParts),
    its_net:             its,

    // Synthèse
    total_retenues_sal:  total_retenues,
    net:                 net,
    cout_total_employeur,

    // Méta
    contrat,
    nb_parts:            nbParts,
    date_calcul:         new Date().toISOString().slice(0, 7), // YYYY-MM
    regime_reglementaire: getParametrageService().exportSnapshot().version,
  };
}

// ────────────────────────────────────────────────────────────
// VÉRIFICATION DE COHÉRENCE RH ↔ COMPTABILITÉ
// ────────────────────────────────────────────────────────────

/**
 * Génère les écritures comptables SYSCOHADA correspondant à un bulletin.
 * Assure la cohérence entre le module RH et le module Comptabilité.
 * @param {Object} bulletin  - Résultat de calcNetPaie()
 * @param {string} employe   - Nom de l'employé (pour libellé écriture)
 * @param {string} date      - Date comptable (YYYY-MM-DD)
 * @returns {Array<Object>}  - Tableau d'écritures SYSCOHADA
 */
function genEcrituresComptables(bulletin, employe, date) {
  const ps = getParametrageService();
  const ecritures = [];

  const add = (libelle, compte, debit, credit) =>
    ecritures.push({ date, journal: 'JP', libelle, compte, debit: Math.round(debit), credit: Math.round(credit) });

  // 6611 — Salaires bruts
  add(`Salaires bruts — ${employe}`, ps.getCompteSYSCOHADA('salaires_bruts'), bulletin.brut_total, 0);

  // 6631 — Charges patronales CNPS (retraite + PF + maternité + AT/MP + CMU pat)
  const cnps_pat_base = bulletin.cnps.retraite_pat + bulletin.cnps.pf +
                        bulletin.cnps.maternite + bulletin.cnps.atmp + bulletin.cnps.cmu_pat;
  if (cnps_pat_base > 0)
    add(`CNPS patronal — ${employe}`, ps.getCompteSYSCOHADA('cnps_patronal'), cnps_pat_base, 0);

  // 6641 — Taxes sur salaires (FDFP patronal)
  if (bulletin.cnps.fdfp_pat > 0)
    add(`FDFP patronal — ${employe}`, ps.getCompteSYSCOHADA('taxes_salaires'), bulletin.cnps.fdfp_pat, 0);

  // 4471 — Net à payer
  add(`Net à payer — ${employe}`, ps.getCompteSYSCOHADA('net_a_payer'), 0, bulletin.net);

  // 4421 — ITS retenus
  if (bulletin.its_net > 0)
    add(`ITS — ${employe}`, ps.getCompteSYSCOHADA('its_retenus'), 0, bulletin.its_net);

  // 4437 — Organismes sociaux : retenues salariales CNPS + CMU sal (à reverser CNPS)
  // Retenues salariales = retraite_sal + cmu_sal + fdfp_sal
  const retenues_sociales_sal = bulletin.cnps.retraite_sal + bulletin.cnps.cmu_sal + bulletin.cnps.fdfp_sal;
  if (retenues_sociales_sal > 0)
    add(`CNPS/CMU retenus salarial — ${employe}`, ps.getCompteSYSCOHADA('cmu_retenue'), 0, retenues_sociales_sal);

  // 4437 — Charges patronales sociales à verser (CNPS pat + FDFP pat)
  const charges_pat_a_verser = cnps_pat_base + bulletin.cnps.fdfp_pat;
  if (charges_pat_a_verser > 0)
    add(`CNPS/FDFP patronal à verser — ${employe}`, ps.getCompteSYSCOHADA('cmu_retenue'), 0, charges_pat_a_verser);

  // Contrôle d'équilibre (débit = crédit)
  const totalDebit  = ecritures.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 1) {
    throw new Error(
      `[ServicePaie] DÉSÉQUILIBRE COMPTABLE pour ${employe} : ` +
      `Débit=${totalDebit} ≠ Crédit=${totalCredit}. Différence=${totalDebit - totalCredit}`
    );
  }

  return ecritures;
}

// ────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcCNPS, calcITSBrut, calcRICF, calcITS, calcNetPaie, genEcrituresComptables };
} else if (typeof window !== 'undefined') {
  window.CogiCore = window.CogiCore || {};
  Object.assign(window.CogiCore, { calcCNPS, calcITSBrut, calcRICF, calcITS, calcNetPaie, genEcrituresComptables });
}
