/**
 * CogiCore — Module UI
 * Navigation, modaux, toasts, utilitaires d'affichage.
 */
'use strict';

window.UI = (() => {

  function switchPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById(name);
    if (page) page.classList.add('active');
    // Activer le nav-item correspondant
    document.querySelectorAll('.nav-item').forEach(n => {
      if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${name}'`))
        n.classList.add('active');
    });
    // Déclencher le render du module
    const renders = {
      dashboard:    () => typeof Dashboard !== 'undefined' && Dashboard.render(),
      clients:      () => typeof Clients   !== 'undefined' && Clients.render(),
      factures:     () => typeof Invoices  !== 'undefined' && Invoices.render(),
      devis:        () => typeof Quotes    !== 'undefined' && Quotes.render(),
      inventaire:   () => typeof Stock     !== 'undefined' && Stock.render(),
      produits:     () => typeof Products  !== 'undefined' && Products.render(),
      rh:           () => typeof RH        !== 'undefined' && RH.render(),
      comptabilite: () => typeof Compta    !== 'undefined' && Compta.render(),
      depenses:     () => typeof Expenses  !== 'undefined' && Expenses.render(),
      parametrage:  () => typeof Parametrage !== 'undefined' && Parametrage.render(),
      settings:     () => typeof Settings  !== 'undefined' && Settings.render(),
    };
    if (renders[name]) renders[name]();
  }

  function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('active'); }
  }

  // Fermer modal en cliquant en dehors
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  });

  function toast(msg, type = 'ok', duration = 3500) {
    let box = document.getElementById('erpToast');
    if (!box) return;
    box.style.display = 'flex';
    const item = document.createElement('div');
    item.className = `toast-item ${type}`;
    item.textContent = msg;
    box.appendChild(item);
    setTimeout(() => { item.remove(); if (!box.children.length) box.style.display = 'none'; }, duration);
  }

  function fmt(n) {
    return Math.round(n || 0).toLocaleString('fr-FR') + ' CFA';
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
  }

  function badge(label, type) {
    return `<span class="badge badge-${type}">${label}</span>`;
  }

  function confirm(msg) {
    return window.confirm(msg);
  }

  // Autocomplete générique (clients, produits…)
  function autocomplete(inputId, dropId, hiddenId, items, labelFn, valueFn) {
    const inputEl  = document.getElementById(inputId);
    const dropEl   = document.getElementById(dropId);
    const hiddenEl = document.getElementById(hiddenId);
    if (!inputEl || !dropEl) return;

    inputEl.addEventListener('input', () => {
      const q = inputEl.value.toLowerCase().trim();
      dropEl.innerHTML = '';
      if (!q) { dropEl.classList.remove('open'); return; }
      const matches = items.filter(i => labelFn(i).toLowerCase().includes(q)).slice(0, 10);
      if (!matches.length) { dropEl.classList.remove('open'); return; }
      matches.forEach(i => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.textContent = labelFn(i);
        div.onclick = () => {
          inputEl.value = labelFn(i);
          if (hiddenEl) hiddenEl.value = valueFn(i);
          dropEl.classList.remove('open');
          if (typeof inputEl.onchange === 'function') inputEl.onchange();
        };
        dropEl.appendChild(div);
      });
      dropEl.classList.add('open');
    });

    document.addEventListener('click', e => {
      if (!dropEl.contains(e.target) && e.target !== inputEl) dropEl.classList.remove('open');
    });
  }

  return { switchPage, openModal, closeModal, toast, fmt, fmtDate, badge, confirm, autocomplete };
})();
