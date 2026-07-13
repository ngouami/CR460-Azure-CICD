/**
 * CogiCore — Suite de Tests de Conformité Légale
 * ═════════════════════════════════════════════════
 * TDD : valide le calcul de paie (CNPS + ITS) et TVA (CGI CI 2026).
 * Vérifie aussi la cohérence entre le module RH et la Comptabilité.
 *
 * Usage : node tests/test-conformite-ci.js
 * Aucune dépendance externe requise (assertions natives).
 */

'use strict';

// ─── Chargement des modules ──────────────────────────────────
const { getParametrageService, PARAMETRES_LEGAUX } = require('../core/parametrage-service');
const { calcCNPS, calcITS, calcITSBrut, calcRICF, calcNetPaie, genEcrituresComptables } = require('../modules/paie/service-paie');
const { calcTVALigne, calcTotauxFacture, calcDeclarationTVA } = require('../modules/ventes/service-tva');

// ─── Framework d'assertions minimal ─────────────────────────
let passed = 0, failed = 0, total = 0;
const results = [];

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    results.push({ ok: true, msg: message });
    process.stdout.write('  ✓ ' + message + '\n');
  } else {
    failed++;
    results.push({ ok: false, msg: message });
    process.stdout.write('  ✗ ÉCHEC : ' + message + '\n');
  }
}

function assertEqual(actual, expected, message, tolerance = 0) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(ok, `${message} — attendu: ${expected}, obtenu: ${actual}${tolerance ? ` (±${tolerance})` : ''}`);
}

function assertThrows(fn, expectedMsg, message) {
  total++;
  try {
    fn();
    failed++;
    results.push({ ok: false, msg: message });
    process.stdout.write('  ✗ ÉCHEC (aucune exception) : ' + message + '\n');
  } catch (e) {
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      failed++;
      results.push({ ok: false, msg: message + ` [mauvaise erreur: "${e.message}"]` });
      process.stdout.write(`  ✗ ÉCHEC (mauvaise exception: "${e.message}") : ${message}\n`);
    } else {
      passed++;
      results.push({ ok: true, msg: message });
      process.stdout.write('  ✓ ' + message + '\n');
    }
  }
}

function suite(name, fn) {
  process.stdout.write('\n▶ ' + name + '\n');
  process.stdout.write('─'.repeat(60) + '\n');
  fn();
}

// ════════════════════════════════════════════════════════════
// SUITE 1 : Service de Paramétrage Central (SSOT)
// ════════════════════════════════════════════════════════════
suite('1. Service de Paramétrage Central (SSOT)', () => {

  const ps = getParametrageService();

  assertEqual(
    PARAMETRES_LEGAUX.smig.mensuel, 75_000,
    'SMIG 2023 = 75 000 FCFA (Décret 2022-986)'
  );

  assertEqual(
    PARAMETRES_LEGAUX.cnps.retraite.taux_salarial, 0.063,
    'CNPS retraite salarial = 6,30%'
  );

  assertEqual(
    PARAMETRES_LEGAUX.cnps.retraite.taux_patronal, 0.0775,
    'CNPS retraite patronal = 7,75%'
  );

  assertEqual(
    PARAMETRES_LEGAUX.cnps.prestations_familiales.taux_patronal, 0.05,
    'Prestations familiales = 5,00%'
  );

  assertEqual(
    PARAMETRES_LEGAUX.cnps.assurance_maternite.taux_patronal, 0.0075,
    'Assurance maternité = 0,75%'
  );

  assertEqual(
    PARAMETRES_LEGAUX.tva.taux_normal, 0.18,
    'TVA taux normal = 18% (CGI CI Art.339)'
  );

  assertEqual(
    ps.getTVA('normal'), 0.18,
    'getTVA("normal") retourne 0.18'
  );

  assertEqual(
    ps.getTVA('reduit'), 0.09,
    'getTVA("reduit") retourne 0.09'
  );

  assertEqual(
    ps.getTVA('zero'), 0.00,
    'getTVA("zero") retourne 0.00'
  );

  assertEqual(
    ps.getCMU().salariale, 1_000,
    'CMU salariale = 1 000 FCFA (Loi 2014-131)'
  );

  assert(
    ps.getCompteSYSCOHADA('cmu_retenue') === '4437',
    'CMU → compte 4437 (et non 4431 TVA)'
  );

  assert(
    ps.getCompteSYSCOHADA('salaires_bruts') === '6611',
    'Salaires bruts → compte SYSCOHADA 6611'
  );

  // Le snapshot doit être traçable
  const snap = ps.exportSnapshot();
  assert(snap.version === '2026-01', 'Snapshot contient la version réglementaire');
  assert(typeof snap.timestamp === 'string', 'Snapshot horodaté');
});

// ════════════════════════════════════════════════════════════
// SUITE 2 : Calcul CNPS — Conformité CNPS CI
// ════════════════════════════════════════════════════════════
suite('2. Calcul CNPS — Conformité CNPS CI', () => {

  // CAS 1 : Salarié CDI, salaire = 200 000 FCFA
  const brut1 = 200_000;
  const cnps1 = calcCNPS(brut1, 'CDI');

  // Base retraite = min(200 000, 3 375 000) = 200 000
  assertEqual(
    cnps1.retraite_sal, Math.round(200_000 * 0.063),
    `CNPS Retraite salarial (6.3% × 200 000)`,
    1
  );
  assertEqual(
    cnps1.retraite_pat, Math.round(200_000 * 0.0775),
    `CNPS Retraite patronal (7.75% × 200 000)`,
    1
  );

  // Base PF/Maternité = min(200 000, 75 000) = 75 000 (SMIG)
  assertEqual(
    cnps1.pf, Math.round(75_000 * 0.05),
    `Prestations familiales (5% × 75 000 plafond SMIG)`,
    1
  );
  assertEqual(
    cnps1.maternite, Math.round(75_000 * 0.0075),
    `Assurance maternité (0.75% × 75 000)`,
    1
  );
  assertEqual(
    cnps1.atmp, Math.round(75_000 * 0.03),
    `AT/MP (3% × 75 000 défaut)`,
    1
  );
  assertEqual(
    cnps1.cmu_sal, 1_000,
    `CMU salariale = 1 000 FCFA fixe`
  );
  assertEqual(
    cnps1.fdfp_sal, Math.round(200_000 * 0.004),
    `FDFP salarial (0.4% × 200 000)`,
    1
  );
  assertEqual(
    cnps1.fdfp_pat, Math.round(200_000 * 0.012),
    `FDFP patronal (1.2% × 200 000)`,
    1
  );

  // CAS 2 : Stagiaire — aucune cotisation CNPS
  const cnps2 = calcCNPS(75_000, 'Stage');
  assertEqual(cnps2.total_sal, 0, 'Stagiaire : total cotisations salariales = 0');
  assertEqual(cnps2.total_pat, 0, 'Stagiaire : total cotisations patronales = 0');

  // CAS 3 : Salarié avec salaire > plafond retraite (3 375 000)
  const brut3 = 4_000_000;
  const cnps3 = calcCNPS(brut3, 'CDI');
  assertEqual(
    cnps3.retraite_sal, Math.round(3_375_000 * 0.063),
    `Retraite salariale plafonnée à 3 375 000 (6.3%)`,
    1
  );
  assertEqual(
    cnps3.retraite_pat, Math.round(3_375_000 * 0.0775),
    `Retraite patronale plafonnée à 3 375 000 (7.75%)`,
    1
  );

  // CAS 4 : Taux AT/MP sectoriel BTP (5%)
  const cnps4 = calcCNPS(200_000, 'CDI', { atmp_taux: 0.05 });
  assertEqual(
    cnps4.atmp, Math.round(75_000 * 0.05),
    `AT/MP sectoriel BTP (5% × 75 000)`,
    1
  );

  // CAS 5 : Validation — salaire < SMIG doit lever une exception
  assertThrows(
    () => calcCNPS(50_000, 'CDI'),
    'SMIG',
    'Salaire < SMIG (75 000) → exception CNPS'
  );

  // CAS 6 : Taux AT/MP hors plage légale doit lever une exception
  assertThrows(
    () => calcCNPS(200_000, 'CDI', { atmp_taux: 0.10 }),
    'hors plage légale',
    'AT/MP 10% hors plage [2%-5%] → exception'
  );
});

// ════════════════════════════════════════════════════════════
// SUITE 3 : Calcul ITS — Barème DGI CI 2026
// ════════════════════════════════════════════════════════════
suite('3. Calcul ITS — Barème progressif DGI CI 2026', () => {

  // Tranche 0 % : ≤ 75 000 FCFA
  assertEqual(calcITSBrut(75_000),  0, 'ITS brut sur SMIG (75 000) = 0');
  assertEqual(calcITSBrut(0),       0, 'ITS brut sur 0 = 0');

  // Tranche 16 % : 75 001 – 240 000
  // Salaire = 150 000 → (150 000 − 75 000) × 16% = 75 000 × 16% = 12 000
  assertEqual(calcITSBrut(150_000), Math.round((150_000 - 75_000) * 0.16), 'ITS brut 150 000 (tranche 16%)');

  // Tranche 21 % : 240 001 – 800 000
  // Salaire = 400 000 → 26 400 + (400 000 − 240 000) × 21%
  const its_400k = Math.round((240_000 - 75_000) * 0.16 + (400_000 - 240_000) * 0.21);
  assertEqual(calcITSBrut(400_000), its_400k, 'ITS brut 400 000 (tranches 16%+21%)');

  // Tranche 24 % : 800 001 – 2 400 000
  const its_1m = Math.round(
    (240_000 - 75_000) * 0.16 +
    (800_000 - 240_000) * 0.21 +
    (1_000_000 - 800_000) * 0.24
  );
  assertEqual(calcITSBrut(1_000_000), its_1m, 'ITS brut 1 000 000 (tranches 16%+21%+24%)', 1);

  // RICF — Réduction Impôt Charges de Famille
  const its_brut_300k = calcITSBrut(300_000);
  assertEqual(calcRICF(its_brut_300k, 1), 0,    'RICF 1 part = 0 (célibataire)');

  // 2 parts : RICF = ITS × (1 − 1/2) = ITS × 0.5
  assertEqual(
    calcRICF(its_brut_300k, 2),
    Math.round(its_brut_300k * 0.5),
    'RICF 2 parts = 50% de l\'ITS brut',
    1
  );

  // 4 parts (plafond) : RICF = ITS × (1 − 1/4) = ITS × 0.75
  assertEqual(
    calcRICF(its_brut_300k, 4),
    Math.round(its_brut_300k * 0.75),
    'RICF 4 parts (maximum légal) = 75% de l\'ITS brut',
    1
  );

  // ITS net = ITS brut − RICF (jamais négatif)
  const its_net_2parts = calcITS(300_000, 2);
  assert(its_net_2parts >= 0, 'ITS net toujours ≥ 0');
  assertEqual(
    its_net_2parts,
    Math.max(0, calcITSBrut(300_000) - calcRICF(calcITSBrut(300_000), 2)),
    'ITS net 300 000 / 2 parts = ITS brut − RICF',
    1
  );

  // Validation : nbParts hors plage
  assertThrows(
    () => calcITS(200_000, 5),
    'entre 1 et 4',
    'nbParts = 5 → exception (max légal = 4)'
  );
});

// ════════════════════════════════════════════════════════════
// SUITE 4 : Calcul Net de Paie — Bulletin complet
// ════════════════════════════════════════════════════════════
suite('4. Calcul Net de Paie — Bulletin complet', () => {

  const brut = 300_000;
  const bulletin = calcNetPaie(brut, 'CDI', 1);

  // Net = Brut − CNPS sal − ITS
  const cnps_expected  = calcCNPS(brut, 'CDI');
  const its_expected   = calcITS(brut, 1);
  const net_expected   = brut - cnps_expected.total_sal - its_expected;

  assertEqual(bulletin.net, net_expected, `Net à payer = brut − retenues (${brut} FCFA)`, 1);
  assert(bulletin.net > 0, 'Net à payer est positif');
  assert(bulletin.net < brut, 'Net à payer est inférieur au brut');

  // Coût employeur > Brut
  assert(
    bulletin.cout_total_employeur > brut,
    'Coût total employeur > salaire brut (charges patronales)'
  );

  // Vérification sursalaire
  const bulSur = calcNetPaie(200_000, 'CDI', 1, { sursalaire: 50_000 });
  assertEqual(bulSur.brut_total, 250_000, 'Brut total = base + sursalaire');

  // Salaire < SMIG
  assertThrows(
    () => calcNetPaie(50_000, 'CDI', 1),
    'SMIG',
    'Salaire 50 000 < SMIG 75 000 → exception'
  );

  // Contrat invalide
  assertThrows(
    () => calcNetPaie(200_000, 'Vacataire', 1),
    'invalide',
    'Contrat "Vacataire" non reconnu → exception'
  );
});

// ════════════════════════════════════════════════════════════
// SUITE 5 : Calcul TVA — CGI CI 2026
// ════════════════════════════════════════════════════════════
suite('5. Calcul TVA — CGI CI Art.339 (18%)', () => {

  // Taux normal 18%
  const t1 = calcTVALigne(100_000, 'normal');
  assertEqual(t1.tva,  18_000, 'TVA 18% sur 100 000 HT = 18 000');
  assertEqual(t1.ttc, 118_000, 'TTC = 118 000 (100 000 + 18 000)');
  assertEqual(t1.taux_applique, 0.18, 'Taux appliqué = 0.18');

  // Taux réduit 9%
  const t2 = calcTVALigne(100_000, 'reduit');
  assertEqual(t2.tva,  9_000, 'TVA réduit 9% sur 100 000 = 9 000');
  assertEqual(t2.ttc, 109_000, 'TTC = 109 000');

  // Exonéré
  const t3 = calcTVALigne(100_000, 'exonere');
  assertEqual(t3.tva, 0, 'TVA exonéré = 0');
  assertEqual(t3.ttc, 100_000, 'TTC = HT si exonéré');

  // Facture multi-lignes
  const totaux = calcTotauxFacture([
    { designation: 'Prestation A', montant_ht: 200_000, type_tva: 'normal' },
    { designation: 'Fourniture B', montant_ht:  50_000, type_tva: 'normal' },
    { designation: 'Formation',    montant_ht:  30_000, type_tva: 'exonere' },
  ]);

  assertEqual(totaux.total_ht,  280_000, 'Total HT multi-lignes = 280 000');
  assertEqual(totaux.total_tva,  Math.round(250_000 * 0.18), 'TVA sur 250 000 imposables = 45 000');
  assertEqual(totaux.total_ttc, 280_000 + Math.round(250_000 * 0.18), 'TTC correct multi-lignes');

  // Déclaration TVA mensuelle
  const decl = calcDeclarationTVA(45_000, 9_000);
  assertEqual(decl.tva_nette, 36_000, 'TVA nette à reverser = 45 000 − 9 000 = 36 000');
  assert(decl.statut === 'A_REVERSER', 'Statut = A_REVERSER');

  const declCredit = calcDeclarationTVA(5_000, 20_000);
  assertEqual(declCredit.tva_nette, -15_000, 'Crédit TVA = -15 000');
  assert(declCredit.statut === 'CREDIT', 'Statut = CREDIT');

  // Montant HT négatif → exception
  assertThrows(
    () => calcTVALigne(-1000, 'normal'),
    'montant_ht invalide',
    'Montant HT négatif → exception'
  );
});

// ════════════════════════════════════════════════════════════
// SUITE 6 : Cohérence RH ↔ Comptabilité (SSOT intégré)
// ════════════════════════════════════════════════════════════
suite('6. Cohérence RH ↔ Comptabilité SYSCOHADA', () => {

  const brut = 250_000;
  const bulletin = calcNetPaie(brut, 'CDI', 1);
  const ecritures = genEcrituresComptables(bulletin, 'Konan Yao', '2026-07-31');

  // Les écritures doivent exister
  assert(ecritures.length >= 3, 'Au moins 3 écritures générées');

  // Équilibre débit = crédit
  const totalD = ecritures.reduce((s, e) => s + e.debit, 0);
  const totalC = ecritures.reduce((s, e) => s + e.credit, 0);
  assertEqual(totalD, totalC, 'Équilibre SYSCOHADA : Σ Débit = Σ Crédit', 1);

  // Compte 6611 présent (salaires bruts)
  const e6611 = ecritures.find(e => e.compte === '6611');
  assert(!!e6611, 'Écriture 6611 (Salaires bruts) présente');
  assertEqual(e6611.debit, brut, 'Débit 6611 = Salaire brut', 1);

  // Compte 4471 présent (net à payer)
  const e4471 = ecritures.find(e => e.compte === '4471');
  assert(!!e4471, 'Écriture 4471 (Net à payer) présente');
  assertEqual(e4471.credit, bulletin.net, 'Crédit 4471 = Net à payer', 1);

  // Compte 4421 présent si ITS > 0
  if (bulletin.its_net > 0) {
    const e4421 = ecritures.find(e => e.compte === '4421');
    assert(!!e4421, 'Écriture 4421 (ITS retenus) présente');
    assertEqual(e4421.credit, bulletin.its_net, 'Crédit 4421 = ITS net', 1);
  }

  // Cohérence : net + retenues = brut
  const net_reconstructed = brut - bulletin.total_retenues_sal;
  assertEqual(
    net_reconstructed, bulletin.net,
    'NET = Brut − Σ Retenues salariales (cohérence RH/Compta)',
    1
  );

  // Données incohérentes : salaire nul ne génère pas de bulletin
  assertThrows(
    () => calcNetPaie(-1, 'CDI', 1),
    'négatif',
    'Salaire négatif → rejet immédiat'
  );
});

// ════════════════════════════════════════════════════════════
// SUITE 7 : Vérification SMIG minimum légal (moindre privilège)
// ════════════════════════════════════════════════════════════
suite('7. Vérification SMIG & Principe du Moindre Privilège', () => {

  const ps = getParametrageService();
  const smig = ps.getSMIG();

  // Le SMIG doit être utilisé comme plancher dans les calculs
  assertEqual(smig, 75_000, 'SMIG = 75 000 FCFA (Décret 2022-986)');

  // Un bulletin au SMIG exact doit fonctionner
  const bSmig = calcNetPaie(smig, 'CDI', 1);
  assertEqual(bSmig.salaire_base, smig, 'Bulletin au SMIG = 75 000 accepté');
  assert(bSmig.net >= 0, 'Net au SMIG ≥ 0');

  // Vérification plafond retraite = 45 × SMIG
  assertEqual(
    PARAMETRES_LEGAUX.cnps.retraite.plafond_mensuel,
    45 * smig,
    'Plafond retraite CNPS = 45 × SMIG = 3 375 000',
    1
  );

  // Vérification que les paramètres LEGAUX sont immuables (Object.isFrozen)
  assert(Object.isFrozen(PARAMETRES_LEGAUX), 'PARAMETRES_LEGAUX est Object.frozen() — immuable');
  assert(Object.isFrozen(PARAMETRES_LEGAUX.cnps), 'PARAMETRES_LEGAUX.cnps est frozen()');

  // Tentative de modification doit échouer silencieusement (strict mode) ou lancer
  let mutationBloquee = false;
  try {
    PARAMETRES_LEGAUX.tva.taux_normal = 0.99;
    mutationBloquee = PARAMETRES_LEGAUX.tva.taux_normal === 0.18;
  } catch (e) {
    mutationBloquee = true;
  }
  assert(mutationBloquee, 'Tentative de mutation de PARAMETRES_LEGAUX bloquée');
});

// ════════════════════════════════════════════════════════════
// RAPPORT FINAL
// ════════════════════════════════════════════════════════════
process.stdout.write('\n' + '═'.repeat(60) + '\n');
process.stdout.write('RAPPORT DE CONFORMITÉ COGICORE — RÉSULTATS\n');
process.stdout.write('═'.repeat(60) + '\n');
process.stdout.write(`  Total  : ${total}\n`);
process.stdout.write(`  ✓ OK   : ${passed}\n`);
process.stdout.write(`  ✗ KO   : ${failed}\n`);
process.stdout.write(`  Taux   : ${((passed / total) * 100).toFixed(1)}%\n`);
process.stdout.write('─'.repeat(60) + '\n');

if (failed > 0) {
  process.stdout.write('\nÉCHECS DÉTAILLÉS :\n');
  results.filter(r => !r.ok).forEach(r => process.stdout.write(`  ✗ ${r.msg}\n`));
  process.stdout.write('\n');
  process.exit(1);   // CI/CD : code de sortie non-zéro si des tests échouent
} else {
  process.stdout.write('\n✅ TOUS LES TESTS PASSENT — Conformité légale validée.\n\n');
  process.exit(0);
}
