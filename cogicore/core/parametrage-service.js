/**
 * CogiCore — Service de Paramétrage Central (SSOT)
 * ══════════════════════════════════════════════════
 * SOURCE UNIQUE DE VÉRITÉ pour tous les taux légaux ivoiriens.
 * Tous les modules (Paie, Stock, Ventes, Comptabilité) lisent
 * exclusivement depuis ce service. Aucun taux "hardcodé" ailleurs.
 *
 * Références légales :
 *   - CNPS CI : Loi n°99-477 (Code Prévoyance Sociale) + décret n°2022-986
 *   - CMU     : Loi n°2014-131 + décret n°2017-459
 *   - ITS     : CGI CI — Annexe fiscale DGI 2026
 *   - TVA     : CGI CI Art. 339 à 395 — taux 18 %
 *   - IS      : CGI CI Art. 85 — 20/25/30 % selon régime
 *   - SMIG    : Décret n°2022-986 du 21/12/2022 (effectif 01/01/2023)
 */

'use strict';

// ────────────────────────────────────────────────────────────
// 1. CONSTANTES FISCALES & SOCIALES — NE JAMAIS DUPLIQUER
// ────────────────────────────────────────────────────────────

// Deep-freeze récursif : tous les sous-objets sont immuables
function _deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach(name => {
    const val = obj[name];
    if (val && typeof val === 'object') _deepFreeze(val);
  });
  return Object.freeze(obj);
}

const PARAMETRES_LEGAUX = _deepFreeze({

  // ── Identification de la version réglementaire ──────────
  version_reglementaire: '2026-01',
  source_cnps: 'CNPS CI — Loi n°99-477 + Décret 2022-986',
  source_fiscale: 'DGI CI — CGI 2026',

  // ── SMIG ────────────────────────────────────────────────
  smig: {
    mensuel: 75_000,       // FCFA/mois — Décret n°2022-986 du 21/12/2022
    journalier: 2_500,     // FCFA/jour (30 jours)
    horaire: 312,          // FCFA/heure (240 jours × 8h)
  },

  // ── CNPS — Cotisations sociales ─────────────────────────
  cnps: {
    // Retraite (Vieillesse — Art. 23 Loi 99-477)
    retraite: {
      taux_salarial:  0.0630,   // 6,30 %
      taux_patronal:  0.0775,   // 7,75 %
      plafond_mensuel: 3_375_000, // 45 × SMIG = 3 375 000 FCFA
    },
    // Prestations Familiales (PF)
    prestations_familiales: {
      taux_patronal: 0.05,      // 5,00 % (employeur uniquement)
      plafond_mensuel: 75_000,  // = SMIG (Décret 2022-986)
    },
    // Assurance Maternité (AM)
    assurance_maternite: {
      taux_patronal: 0.0075,    // 0,75 % (employeur uniquement)
      plafond_mensuel: 75_000,  // = SMIG
    },
    // Accidents du Travail / Maladies Professionnelles (AT/MP)
    // Taux variable selon secteur : 2 % (bureau) à 5 % (BTP/industrie)
    atmp: {
      taux_defaut:    0.03,     // 3 % (taux moyen appliqué par défaut)
      taux_min:       0.02,     // 2 % — secteur tertiaire/bureau
      taux_max:       0.05,     // 5 % — BTP, industrie lourde
      plafond_mensuel: 75_000,
    },
    // FDFP — Fonds Développement Formation Professionnelle
    fdfp: {
      taux_salarial: 0.004,     // 0,40 %
      taux_patronal: 0.012,     // 1,20 %
      // Pas de plafond FDFP (assiette = salaire brut total)
    },
  },

  // ── CMU — Couverture Maladie Universelle ────────────────
  cmu: {
    cotisation_salariale: 1_000,  // FCFA/mois/salarié — Loi 2014-131
    // Part patronale : 0 FCFA par défaut (légal)
    // Peut être augmentée par convention collective (configurable)
    cotisation_patronale_defaut: 0,
  },

  // ── TVA — Taxe sur la Valeur Ajoutée ────────────────────
  tva: {
    taux_normal:   0.18,   // 18 % — CGI CI Art. 339
    taux_reduit:   0.09,   // 9 % — certains produits de première nécessité
    taux_zero:     0.00,   // 0 % — exportations, exonérations spéciales
    seuil_assujettissement: 50_000_000, // CA annuel > 50 M FCFA → TVA obligatoire
  },

  // ── ITS — Impôt sur Traitements et Salaires ─────────────
  // Barème progressif DGI CI (annexe fiscale 2026)
  // Base imposable = Salaire BRUT (réforme CI en vigueur)
  its: {
    tranches: [
      { seuil_min: 0,         seuil_max: 75_000,    taux: 0.00 },
      { seuil_min: 75_001,    seuil_max: 240_000,   taux: 0.16 },
      { seuil_min: 240_001,   seuil_max: 800_000,   taux: 0.21 },
      { seuil_min: 800_001,   seuil_max: 2_400_000, taux: 0.24 },
      { seuil_min: 2_400_001, seuil_max: Infinity,  taux: 0.28 },
    ],
    // RICF — Réduction Impôt Charges de Famille
    ricf: {
      parts_max: 4,           // plafond légal
      calcul_parts: {
        celibataire:  1,      // 1 part
        marie:        2,      // 2 parts (+ 0,5 par enfant)
        enfant_coef:  0.5,    // +0,5 part par enfant à charge
      },
    },
  },

  // ── IS — Impôt sur les Sociétés ─────────────────────────
  // CGI CI Art. 85 — Régime Normal (RNI) 2024-2026
  is: {
    taux_rni: 0.25,           // 25 % — BIC (Bénéfices Industriels & Commerciaux)
    imf: {
      taux:    0.01,          // 1 % du CA HT annuel (IMF)
      minimum: 3_000_000,     // plancher 3 M FCFA
      maximum: 50_000_000,    // plafond 50 M FCFA
    },
    seuil_rni: 200_000_000,   // CA > 200 M → Régime Normal
  },

  // ── SYSCOHADA — Comptes de référence ────────────────────
  // Plan Comptable OHADA révisé (Règlement n°01/2017/CM/UEMOA)
  comptes_syscohada: {
    salaires_bruts:      '6611',
    cnps_patronal:       '6631',
    taxes_salaires:      '6641',  // CE + TAPFP
    net_a_payer:         '4471',
    its_retenus:         '4421',
    cmu_retenue:         '4437',  // organismes sociaux (≠ TVA 4431)
    tva_collectee:       '4431',
    tva_deductible:      '4452',
    clients:             '411',
    fournisseurs:        '401',
    banque:              '521',
    caisse:              '571',
    capital:             '101',
    resultat_exercice:   '131',
    immobilisations:     '2',
    amortissements:      '28',
  },
});

// ────────────────────────────────────────────────────────────
// 2. SERVICE DE PARAMÉTRAGE — Interface d'accès contrôlée
// ────────────────────────────────────────────────────────────

class ParametrageService {
  /**
   * @param {Object} overrides  — surcharges runtime (ex: taux AT/MP secteur)
   *                              stockées en base ou settings entreprise
   */
  constructor(overrides = {}) {
    this._base = PARAMETRES_LEGAUX;
    this._overrides = overrides;
    this._cache = new Map();
  }

  /** Retourne les paramètres CNPS, avec surcharge possible du taux AT/MP */
  getCNPS() {
    if (this._cache.has('cnps')) return this._cache.get('cnps');
    const cnps = {
      ...this._base.cnps,
      atmp: {
        ...this._base.cnps.atmp,
        taux_defaut: this._overrides.atmp_taux ?? this._base.cnps.atmp.taux_defaut,
      },
    };
    this._cache.set('cnps', Object.freeze(cnps));
    return cnps;
  }

  /** Retourne le taux TVA applicable selon le type de produit/service */
  getTVA(type = 'normal') {
    const map = {
      normal:   this._base.tva.taux_normal,
      reduit:   this._base.tva.taux_reduit,
      zero:     this._base.tva.taux_zero,
      exonere:  0,
    };
    const taux = map[type] ?? this._base.tva.taux_normal;
    return taux;
  }

  /** Retourne le barème ITS complet */
  getBaremeITS() {
    return this._base.its;
  }

  /** Retourne le SMIG mensuel */
  getSMIG() {
    return this._base.smig.mensuel;
  }

  /** Retourne la config CMU (patronale configurable par convention collective) */
  getCMU(patronaleConvention = 0) {
    return {
      salariale: this._base.cmu.cotisation_salariale,
      patronale: patronaleConvention > 0
        ? patronaleConvention
        : this._base.cmu.cotisation_patronale_defaut,
    };
  }

  /** Retourne les paramètres IS */
  getIS() {
    return this._base.is;
  }

  /** Retourne le compte SYSCOHADA pour un usage donné */
  getCompteSYSCOHADA(usage) {
    const compte = this._base.comptes_syscohada[usage];
    if (!compte) throw new Error(`Compte SYSCOHADA inconnu : "${usage}"`);
    return compte;
  }

  /** Invalide le cache (utiliser après modification des overrides) */
  invalidateCache() {
    this._cache.clear();
  }

  /** Exporte un snapshot des paramètres actifs (pour audit) */
  exportSnapshot() {
    return {
      timestamp: new Date().toISOString(),
      version: this._base.version_reglementaire,
      sources: {
        cnps:    this._base.source_cnps,
        fiscale: this._base.source_fiscale,
      },
      parametres_actifs: {
        smig:           this._base.smig.mensuel,
        tva_normal:     this._base.tva.taux_normal,
        cnps_retraite_sal: this._base.cnps.retraite.taux_salarial,
        cnps_retraite_pat: this._base.cnps.retraite.taux_patronal,
        atmp_taux:      this._overrides.atmp_taux ?? this._base.cnps.atmp.taux_defaut,
        cmu_salariale:  this._base.cmu.cotisation_salariale,
      },
    };
  }
}

// ────────────────────────────────────────────────────────────
// 3. SINGLETON GLOBAL — instance partagée par tous les modules
// ────────────────────────────────────────────────────────────

let _instance = null;

function getParametrageService(overrides = {}) {
  if (!_instance) {
    _instance = new ParametrageService(overrides);
  }
  return _instance;
}

// ────────────────────────────────────────────────────────────
// EXPORTS (compatible CommonJS / ES Module / navigateur)
// ────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParametrageService, getParametrageService, PARAMETRES_LEGAUX };
} else if (typeof window !== 'undefined') {
  window.CogiCore = window.CogiCore || {};
  window.CogiCore.ParametrageService = ParametrageService;
  window.CogiCore.getParametrageService = getParametrageService;
  window.CogiCore.PARAMETRES_LEGAUX = PARAMETRES_LEGAUX;
}
