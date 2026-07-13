/**
 * CogiCore — Application Bootstrap
 * Initialise les stores, charge la page dashboard, configure les listeners.
 */
'use strict';

window.App = (() => {

  async function init() {
    try {
      // Pre-populate autocomplete data for invoices / quotes
      const clients  = (await DB.getAll('clients')).filter(c => !c.deleted);
      const produits = (await DB.getAll('produits')).filter(p => !p.deleted);

      // Client autocomplete — Factures
      UI.autocomplete('invClientSearch', 'invClientDrop', 'invClientId', clients,
        c => c.nom, c => c.id);

      // Client autocomplete — Devis
      UI.autocomplete('qteClientSearch', 'qteClientDrop', 'qteClientId', clients,
        c => c.nom, c => c.id);

      // Navigate to dashboard
      UI.switchPage('dashboard');

      console.info('[CogiCore] App initialisée avec succès.');
    } catch (err) {
      console.error('[CogiCore] Erreur init:', err);
    }
  }

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
  });

  // Search inputs — live filter on input
  ['searchClients','searchInvoices','searchQuotes','searchStock','searchProducts'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const map = {
        searchClients:  () => Clients?.render(),
        searchInvoices: () => Invoices?.render(),
        searchQuotes:   () => Quotes?.render(),
        searchStock:    () => Stock?.render(),
        searchProducts: () => Products?.render(),
      };
      map[id]?.();
    });
  });

  // Status filter — Invoices
  document.getElementById('filterInvoiceStatus')?.addEventListener('change', () => Invoices?.render());

  // Category filter — Expenses
  document.getElementById('filterExpenseCat')?.addEventListener('change', () => Expenses?.render());

  return { init };
})();
