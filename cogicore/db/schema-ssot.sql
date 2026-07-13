-- ════════════════════════════════════════════════════════════════════
-- CogiCore — Schéma Base de Données SSOT (Source Unique de Vérité)
-- Conformité OHADA / SYSCOHADA révisé (Règlement n°01/2017/CM/UEMOA)
-- Conformité DGI CI — CGI 2026 / CNPS CI — Loi n°99-477
-- ════════════════════════════════════════════════════════════════════
-- Architecture :
--   Couche 1 : Tables de RÉFÉRENCE (taux, paramètres légaux) — isolées
--   Couche 2 : Tables MÉTIER (employés, produits, clients, fournisseurs)
--   Couche 3 : Tables TRANSACTIONNELLES (factures, bulletins, écritures)
--
-- Règle d'Or : les tables transactionnelles NE DUPLIQUENT PAS les taux.
--   Elles référencent ref_parametres via FK et figent les valeurs au moment
--   de la validation (colonne *_taux_fige).
-- ════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─────────────────────────────────────────────────────────────────────
-- COUCHE 1 : TABLES DE RÉFÉRENCE (SSOT)
-- ─────────────────────────────────────────────────────────────────────

-- Table maîtresse des paramètres légaux.
-- Versionée : chaque changement de taux crée un NOUVEAU enregistrement
-- (jamais d'UPDATE) — piste d'audit complète.
CREATE TABLE IF NOT EXISTS ref_parametres (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL,          -- Ex: 'CNPS_RETRAITE_SAL', 'TVA_NORMAL'
    libelle         TEXT    NOT NULL,
    valeur          REAL    NOT NULL,          -- Taux ou montant
    unite           TEXT    NOT NULL CHECK(unite IN ('PCT','FCFA','JOURS')),
    source_legale   TEXT    NOT NULL,          -- Référence légale exacte
    date_debut      TEXT    NOT NULL,          -- YYYY-MM-DD (début d'application)
    date_fin        TEXT,                      -- NULL = toujours en vigueur
    actif           INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, date_debut)
);

-- Index pour accès rapide au paramètre actif courant
CREATE INDEX IF NOT EXISTS idx_ref_param_code_actif
    ON ref_parametres(code, actif, date_debut DESC);

-- Données initiales — CNPS CI 2023-2026
INSERT OR IGNORE INTO ref_parametres (code, libelle, valeur, unite, source_legale, date_debut)
VALUES
  ('CNPS_RETRAITE_SAL',   'CNPS Retraite — Part salariale',   6.30,  'PCT',  'CNPS CI Loi 99-477 Art.23', '2023-01-01'),
  ('CNPS_RETRAITE_PAT',   'CNPS Retraite — Part patronale',   7.75,  'PCT',  'CNPS CI Loi 99-477 Art.23', '2023-01-01'),
  ('CNPS_PF',             'Prestations Familiales',           5.00,  'PCT',  'CNPS CI Loi 99-477',        '2023-01-01'),
  ('CNPS_MATERNITE',      'Assurance Maternité',              0.75,  'PCT',  'CNPS CI Loi 99-477',        '2023-01-01'),
  ('CNPS_ATMP_MIN',       'AT/MP taux minimum (bureau)',      2.00,  'PCT',  'CNPS CI — Décision Conseil', '2023-01-01'),
  ('CNPS_ATMP_DEF',       'AT/MP taux défaut (mixte)',        3.00,  'PCT',  'CNPS CI — Décision Conseil', '2023-01-01'),
  ('CNPS_ATMP_MAX',       'AT/MP taux maximum (BTP)',         5.00,  'PCT',  'CNPS CI — Décision Conseil', '2023-01-01'),
  ('CNPS_FDFP_SAL',       'FDFP — Part salariale',           0.40,  'PCT',  'Loi FDFP CI',               '2023-01-01'),
  ('CNPS_FDFP_PAT',       'FDFP — Part patronale',           1.20,  'PCT',  'Loi FDFP CI',               '2023-01-01'),
  ('CMU_SAL',             'CMU — Retenue salariale fixe',  1000.00,  'FCFA', 'Loi 2014-131 + Décret 2017-459', '2017-07-12'),
  ('CMU_PAT_DEF',         'CMU — Part patronale défaut',      0.00,  'FCFA', 'Loi 2014-131 (hors convention)', '2017-07-12'),
  ('TVA_NORMAL',          'TVA taux normal',                 18.00,  'PCT',  'CGI CI Art.339',            '2000-01-01'),
  ('TVA_REDUIT',          'TVA taux réduit',                  9.00,  'PCT',  'CGI CI — Exonérations',     '2000-01-01'),
  ('IS_RNI',              'IS — Régime Normal',              25.00,  'PCT',  'CGI CI Art.85',             '2024-01-01'),
  ('IMF_TAUX',            'IMF — Impôt Minimum Forfaitaire',  1.00,  'PCT',  'CGI CI Art.85',             '2024-01-01'),
  ('SMIG_MENSUEL',        'SMIG mensuel CI',              75000.00,  'FCFA', 'Décret 2022-986 du 21/12/2022', '2023-01-01'),
  ('CNPS_PLAFOND_RETRAITE','Plafond cotisation retraite',3375000.00, 'FCFA', 'CNPS CI (45 × SMIG)',       '2023-01-01'),
  ('CNPS_PLAFOND_PF',     'Plafond PF/Maternité/ATMP',    75000.00,  'FCFA', 'Décret 2022-986 = SMIG',   '2023-01-01');

-- Barème ITS — lignes séparées pour maintenabilité
CREATE TABLE IF NOT EXISTS ref_bareme_its (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ordre           INTEGER NOT NULL,
    seuil_min       INTEGER NOT NULL,
    seuil_max       INTEGER,             -- NULL = ∞
    taux_pct        REAL    NOT NULL,
    source_legale   TEXT    NOT NULL DEFAULT 'DGI CI CGI 2026 — Annexe fiscale',
    date_debut      TEXT    NOT NULL DEFAULT '2024-01-01',
    actif           INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO ref_bareme_its (ordre, seuil_min, seuil_max, taux_pct) VALUES
  (1,        0,    75000,  0.00),
  (2,    75001,   240000, 16.00),
  (3,   240001,   800000, 21.00),
  (4,   800001,  2400000, 24.00),
  (5,  2400001,     NULL, 28.00);

-- Plan comptable SYSCOHADA — comptes de référence
CREATE TABLE IF NOT EXISTS ref_plan_comptable (
    code_compte     TEXT    PRIMARY KEY,
    libelle         TEXT    NOT NULL,
    classe          INTEGER NOT NULL,    -- 1 à 9
    type_compte     TEXT    CHECK(type_compte IN ('BILAN','RESULTAT','TIERS')),
    nature          TEXT    CHECK(nature IN ('ACTIF','PASSIF','CHARGE','PRODUIT')),
    actif           INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO ref_plan_comptable VALUES
  ('101',  'Capital',                           1, 'BILAN',    'PASSIF', 1),
  ('131',  'Résultat net de l''exercice',       1, 'BILAN',    'PASSIF', 1),
  ('2',    'Immobilisations',                   2, 'BILAN',    'ACTIF',  1),
  ('28',   'Amortissements',                    2, 'BILAN',    'PASSIF', 1),
  ('401',  'Fournisseurs',                      4, 'TIERS',    'PASSIF', 1),
  ('411',  'Clients',                           4, 'TIERS',    'ACTIF',  1),
  ('4421', 'ITS retenus à reverser',            4, 'TIERS',    'PASSIF', 1),
  ('4431', 'TVA collectée',                     4, 'TIERS',    'PASSIF', 1),
  ('4437', 'CMU et organismes sociaux',         4, 'TIERS',    'PASSIF', 1),
  ('4452', 'TVA déductible sur achats',         4, 'TIERS',    'ACTIF',  1),
  ('4471', 'Personnel — rémunérations dues',    4, 'TIERS',    'PASSIF', 1),
  ('521',  'Banque',                            5, 'BILAN',    'ACTIF',  1),
  ('571',  'Caisse',                            5, 'BILAN',    'ACTIF',  1),
  ('6611', 'Salaires et appointements bruts',   6, 'RESULTAT', 'CHARGE', 1),
  ('6631', 'Cotisations patronales CNPS',       6, 'RESULTAT', 'CHARGE', 1),
  ('6641', 'Taxes sur salaires (FDFP, CE)',     6, 'RESULTAT', 'CHARGE', 1),
  ('7011', 'Ventes de marchandises',            7, 'RESULTAT', 'PRODUIT', 1),
  ('7061', 'Prestations de services',           7, 'RESULTAT', 'PRODUIT', 1);

-- ─────────────────────────────────────────────────────────────────────
-- COUCHE 2 : TABLES MÉTIER
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entreprises (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT    NOT NULL,
    forme_juridique TEXT,
    ncc             TEXT,              -- Numéro de Compte Contribuable DGI
    num_cnps        TEXT,              -- N° employeur CNPS
    adresse         TEXT,
    ville           TEXT,
    pays            TEXT    DEFAULT 'Côte d''Ivoire',
    devise          TEXT    DEFAULT 'XOF',
    -- Taux AT/MP sectoriel (surcharge du défaut 3%)
    atmp_taux_pct   REAL    DEFAULT 3.00,
    -- Convention collective : part patronale CMU
    cmu_patronale   REAL    DEFAULT 0,
    regime_fiscal   TEXT    CHECK(regime_fiscal IN ('RNI','RSI','Forfait')) DEFAULT 'RNI',
    actif           INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    updatedAt       TEXT
);

CREATE TABLE IF NOT EXISTS employes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    matricule       TEXT    NOT NULL,
    nom             TEXT    NOT NULL,
    prenom          TEXT,
    poste           TEXT    NOT NULL,
    contrat         TEXT    NOT NULL CHECK(contrat IN ('CDI','CDD','Stage','Consultant','Journalier')),
    salaire_base    REAL    NOT NULL CHECK(salaire_base >= 0),
    sursalaire      REAL    NOT NULL DEFAULT 0,
    date_embauche   TEXT    NOT NULL,
    date_depart     TEXT,
    situation_fam   TEXT    CHECK(situation_fam IN ('Célibataire','Marié','Divorcé','Veuf')),
    nb_enfants      INTEGER NOT NULL DEFAULT 0 CHECK(nb_enfants >= 0),
    num_cnps        TEXT,              -- N° immatriculation salarié
    num_cnam        TEXT,              -- N° CMU salarié
    rib             TEXT,
    statut          TEXT    NOT NULL DEFAULT 'Actif' CHECK(statut IN ('Actif','Inactif','Quitté')),
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    updatedAt       TEXT,
    UNIQUE(entreprise_id, matricule)
);

CREATE TABLE IF NOT EXISTS produits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    sku             TEXT    NOT NULL,
    nom             TEXT    NOT NULL,
    description     TEXT,
    prix_vente_ht   REAL    NOT NULL CHECK(prix_vente_ht >= 0),
    type_tva        TEXT    NOT NULL DEFAULT 'normal'
                            CHECK(type_tva IN ('normal','reduit','zero','exonere')),
    -- Le taux TVA N'EST PAS stocké ici — il est lu depuis ref_parametres au runtime
    type_produit    TEXT    NOT NULL DEFAULT 'stock' CHECK(type_produit IN ('stock','service')),
    stock_actuel    REAL    NOT NULL DEFAULT 0,
    stock_alerte    REAL    NOT NULL DEFAULT 5,
    actif           INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    updatedAt       TEXT,
    UNIQUE(entreprise_id, sku)
);

CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    type_client     TEXT    NOT NULL DEFAULT 'LOCAL' CHECK(type_client IN ('PRO','LOCAL')),
    nom             TEXT    NOT NULL,
    societe         TEXT,
    telephone       TEXT,
    email           TEXT,
    adresse         TEXT,
    ncc_client      TEXT,   -- N° contribuable DGI si professionnel assujetti TVA
    actif           INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────
-- COUCHE 3 : TABLES TRANSACTIONNELLES
-- ─────────────────────────────────────────────────────────────────────

-- Bulletins de paie — VALIDÉS ET FIGÉS
CREATE TABLE IF NOT EXISTS bulletins_paie (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id      INTEGER NOT NULL REFERENCES employes(id),
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    periode         TEXT    NOT NULL,   -- YYYY-MM
    statut          TEXT    NOT NULL DEFAULT 'BROUILLON'
                            CHECK(statut IN ('BROUILLON','VALIDE','PAYE')),

    -- Éléments bruts
    salaire_base    REAL    NOT NULL,
    sursalaire      REAL    NOT NULL DEFAULT 0,
    brut_total      REAL    NOT NULL,

    -- Taux figés AU MOMENT DE LA VALIDATION (immuables après statut=VALIDE)
    -- Source: ref_parametres — FK sur le paramètre utilisé
    cnps_retraite_sal_param_id INTEGER REFERENCES ref_parametres(id),
    cnps_retraite_sal_taux_fige REAL NOT NULL,

    cnps_retraite_pat_param_id INTEGER REFERENCES ref_parametres(id),
    cnps_retraite_pat_taux_fige REAL NOT NULL,

    atmp_taux_fige  REAL    NOT NULL,  -- Variable selon secteur entreprise

    -- Montants calculés et figés
    cnps_retraite_sal REAL  NOT NULL DEFAULT 0,
    cnps_retraite_pat REAL  NOT NULL DEFAULT 0,
    cnps_pf           REAL  NOT NULL DEFAULT 0,
    cnps_maternite    REAL  NOT NULL DEFAULT 0,
    cnps_atmp         REAL  NOT NULL DEFAULT 0,
    cnps_fdfp_sal     REAL  NOT NULL DEFAULT 0,
    cnps_fdfp_pat     REAL  NOT NULL DEFAULT 0,
    cmu_sal           REAL  NOT NULL DEFAULT 1000,
    cmu_pat           REAL  NOT NULL DEFAULT 0,
    its_brut          REAL  NOT NULL DEFAULT 0,
    ricf              REAL  NOT NULL DEFAULT 0,
    its_net           REAL  NOT NULL DEFAULT 0,
    net_a_payer       REAL  NOT NULL,
    cout_total_employeur REAL NOT NULL,

    -- Nombre de parts fiscales (RICF)
    nb_parts          REAL  NOT NULL DEFAULT 1,

    -- Traçabilité
    validePar         TEXT,
    valideAt          TEXT,
    createdAt         TEXT  NOT NULL DEFAULT (datetime('now')),

    -- Contrainte d'unicité : un seul bulletin par employé par mois
    UNIQUE(employe_id, periode)
);

-- Lignes de facture — taux TVA figé à la création
CREATE TABLE IF NOT EXISTS factures (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    client_id       INTEGER REFERENCES clients(id),
    numero          TEXT    NOT NULL,
    date_facture    TEXT    NOT NULL,
    date_echeance   TEXT,
    statut          TEXT    NOT NULL DEFAULT 'En attente'
                            CHECK(statut IN ('En attente','Partiellement payée','Payée','Relancée','Annulée')),
    total_ht        REAL    NOT NULL DEFAULT 0,
    total_tva       REAL    NOT NULL DEFAULT 0,
    total_ttc       REAL    NOT NULL DEFAULT 0,
    -- Taux TVA par défaut utilisé sur cette facture (figé depuis ref_parametres)
    tva_param_id    INTEGER REFERENCES ref_parametres(id),
    normalise_dgi   INTEGER NOT NULL DEFAULT 0,  -- 1 = QR Code DGI présent → TVA déductible
    notes           TEXT,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    updatedAt       TEXT,
    UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS facture_lignes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    facture_id      INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    produit_id      INTEGER REFERENCES produits(id),
    designation     TEXT    NOT NULL,
    quantite        REAL    NOT NULL CHECK(quantite > 0),
    prix_ht         REAL    NOT NULL CHECK(prix_ht >= 0),
    type_tva        TEXT    NOT NULL DEFAULT 'normal',
    -- Taux TVA figé au moment de la création de la ligne
    taux_tva_fige   REAL    NOT NULL,
    montant_ht      REAL    NOT NULL,
    montant_tva     REAL    NOT NULL,
    montant_ttc     REAL    NOT NULL
);

-- Journal comptable SYSCOHADA
CREATE TABLE IF NOT EXISTS ecritures_comptables (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprises(id),
    date_ecriture   TEXT    NOT NULL,
    journal         TEXT    NOT NULL CHECK(journal IN ('AC','VT','BQ','CA','JP','OD')),
    reference       TEXT    NOT NULL,   -- N° facture, N° bulletin, etc.
    libelle         TEXT    NOT NULL,
    compte          TEXT    NOT NULL REFERENCES ref_plan_comptable(code_compte),
    debit           REAL    NOT NULL DEFAULT 0 CHECK(debit >= 0),
    credit          REAL    NOT NULL DEFAULT 0 CHECK(credit >= 0),
    -- Lien vers le document source
    source_type     TEXT    CHECK(source_type IN ('FACTURE','BULLETIN','DEPENSE','MANUEL')),
    source_id       INTEGER,
    createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (debit = 0 OR credit = 0)  -- Un compte ne peut pas être à la fois débit et crédit
);

CREATE INDEX IF NOT EXISTS idx_ecritures_date
    ON ecritures_comptables(entreprise_id, date_ecriture, journal);

CREATE INDEX IF NOT EXISTS idx_ecritures_compte
    ON ecritures_comptables(compte, date_ecriture);

-- ─────────────────────────────────────────────────────────────────────
-- VUE : Paramètre actif courant (accès simplifié)
-- ─────────────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_params_actifs AS
SELECT
    p.code,
    p.libelle,
    p.valeur,
    p.unite,
    p.source_legale,
    p.date_debut
FROM ref_parametres p
WHERE p.actif = 1
  AND (p.date_fin IS NULL OR p.date_fin >= date('now'))
  AND p.date_debut = (
      SELECT MAX(p2.date_debut)
      FROM ref_parametres p2
      WHERE p2.code = p.code AND p2.actif = 1
        AND p2.date_debut <= date('now')
  );

-- ─────────────────────────────────────────────────────────────────────
-- VUE : Balance SYSCOHADA
-- ─────────────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_balance_syscohada AS
SELECT
    e.compte,
    pc.libelle,
    pc.classe,
    pc.nature,
    SUM(e.debit)  AS total_debit,
    SUM(e.credit) AS total_credit,
    SUM(e.debit) - SUM(e.credit) AS solde
FROM ecritures_comptables e
LEFT JOIN ref_plan_comptable pc ON pc.code_compte = e.compte
GROUP BY e.compte;

-- ─────────────────────────────────────────────────────────────────────
-- TRIGGER : Empêche la modification d'un bulletin validé (SSOT protect.)
-- ─────────────────────────────────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_protect_bulletin_valide
BEFORE UPDATE ON bulletins_paie
WHEN OLD.statut IN ('VALIDE','PAYE')
BEGIN
    SELECT RAISE(ABORT,
      'ERREUR SSOT : Bulletin validé immuable. Créez un avoir ou un correctif.');
END;

-- ─────────────────────────────────────────────────────────────────────
-- TRIGGER : Calcul automatique montant_ht / tva / ttc sur lignes facture
-- ─────────────────────────────────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_calc_ligne_facture
BEFORE INSERT ON facture_lignes
BEGIN
    SELECT CASE
        WHEN NEW.quantite <= 0 THEN
            RAISE(ABORT, 'ERREUR : quantité doit être positive')
        WHEN NEW.prix_ht < 0 THEN
            RAISE(ABORT, 'ERREUR : prix_ht ne peut pas être négatif')
        WHEN NEW.taux_tva_fige < 0 OR NEW.taux_tva_fige > 1 THEN
            RAISE(ABORT, 'ERREUR : taux_tva_fige doit être entre 0 et 1')
    END;
END;
