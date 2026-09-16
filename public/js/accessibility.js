// Route DOM access stays attached to the root captured before an asynchronous render.
function captureView() {
  const root = app;
  const nativeDocument = document;
  const assertCurrent = () => {
    if (!root?.isConnected || root !== app) throw new DOMException('Tela substituída', 'AbortError');
  };
  const scopedDocument = new Proxy(nativeDocument, {
    get(target, key) {
      if (key === 'getElementById') return id => {
        assertCurrent();
        return root.id === id ? root : root.querySelector('#' + CSS.escape(id)) || target.getElementById(id);
      };
      if (key === 'querySelector' || key === 'querySelectorAll') return selector => {
        assertCurrent();
        const found = root[key](selector);
        return key === 'querySelectorAll' ? found : found || target.querySelector(selector);
      };
      assertCurrent();
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return {root,document:scopedDocument,assertCurrent};
}

function initAccessibility() {
  const actionSelector = '[data-action], .standings-table tbody tr[data-team-id], .onboarding-team-chip, .onboarding-search-item, .btn-open-match-player-modal, .squad-picker-item:not(.already-selected), .picker-result, .notif-team-res-item, .quick-tag';
  const modalSelector = '#notif-modal-backdrop, #onboarding-modal-backdrop, #player-match-modal-backdrop, #squad-picker-backdrop';
  let activeModal = null, restoreFocus = null;
  const visible = element => element.isConnected && !element.hidden && getComputedStyle(element).display !== 'none';
  const focusables = modal => [...modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && visible(el));

  function enhance() {
    document.querySelectorAll(actionSelector).forEach(el => {
      if (!el.matches('button,a,input,select')) {
        el.setAttribute('role', 'button'); el.tabIndex = 0;
      }
      if (el.dataset.action === 'country') el.setAttribute('aria-expanded', String(el.closest('.country-card')?.classList.contains('open')));
    });
    document.querySelectorAll('input:not([aria-label])').forEach(el => {
      if (!el.labels?.length && el.placeholder) el.setAttribute('aria-label', el.placeholder);
    });
    document.querySelectorAll('button:not([aria-label])').forEach(el => {
      if (/^[✕×X]$/.test(el.textContent.trim())) el.setAttribute('aria-label', 'Fechar');
      else if (el.title) el.setAttribute('aria-label', el.title);
    });
    document.querySelectorAll(modalSelector).forEach(el => {
      el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.querySelector('h2,h3')?.textContent.trim() || 'Detalhes e opções');
    });
    const opened = [...document.querySelectorAll(modalSelector)].filter(visible).at(-1) || null;
    if (opened !== activeModal) {
      if (activeModal && !opened) {
        if (restoreFocus?.isConnected) restoreFocus.focus();
        else document.querySelector('.brand')?.focus();
      }
      if (opened) {
        if (!activeModal) restoreFocus = document.activeElement;
        opened.tabIndex = -1;
        (focusables(opened)[0] || opened).focus();
      }
      activeModal = opened;
    }
  }
  document.addEventListener('click', e => {
    const el=e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'reload') location.reload();
    if (el.dataset.action === 'back') window.history.length > 1 ? history.back() : location.hash = '#/';
    if (el.dataset.action === 'country') {
      toggleCountryCard(el);
      el.setAttribute('aria-expanded', String(el.closest('.country-card')?.classList.contains('open')));
    }
    if (el.dataset.action === 'highlights') {
      e.preventDefault(); e.stopPropagation();
      const url = new URL(el.dataset.url, location.origin);
      if (url.origin === 'https://www.youtube.com') window.open(url.href,'_blank','noopener,noreferrer');
    }
  });
  document.addEventListener('keydown', e => {
    if (activeModal && e.key === 'Escape') {
      e.preventDefault();
      const close = activeModal.querySelector('[id*="close"], #btn-onboarding-skip');
      if (close) close.click();
      else if (activeModal.id === 'notif-modal-backdrop') { activeModal.hidden=true; activeModal.style.display='none'; }
      else activeModal.remove();
    } else if (activeModal && e.key === 'Tab') {
      const items=focusables(activeModal), first=items[0],last=items.at(-1);
      if (!first) { e.preventDefault(); activeModal.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) { e.preventDefault();last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) { e.preventDefault();first.focus(); }
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]:not(button,a,input)')) {
      e.preventDefault(); e.target.click();
    }
  });
  document.addEventListener('focusin', e => {
    if (activeModal && visible(activeModal) && !activeModal.contains(e.target)) (focusables(activeModal)[0] || activeModal).focus();
  });
  // MutationObserver covers dynamic route content and modal creation/removal.
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style']});
  enhance();
}

window.addEventListener('error', e => {
  const img=e.target;
  if (img?.tagName !== 'IMG') return;
  if (img.src.includes('media.api-sports.io') && !img.dataset.proxyTried) {
    img.dataset.proxyTried='true'; img.src='/api/img?url='+encodeURIComponent(img.src); return;
  }
  if (img.dataset.imageFallback === 'player' && !img.dataset.placeholderTried) {
    img.dataset.placeholderTried='true'; img.src='/api/img?url='+encodeURIComponent('https://media.api-sports.io/football/players/placeholder.png');
  } else if (img.dataset.imageFallback) img.style.display='none';
},true);
