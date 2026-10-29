/* Startup recovery is deliberately non-destructive: never delete saved data or images. */
(function () {
  'use strict';
  window.__PB_BUILD = 'v65';
  document.addEventListener('DOMContentLoaded', () => {
    const error = document.getElementById('startupError'), retry = document.getElementById('startupRetry');
    if (!window.PB_APP_READY || window.PB_APP_VERSION !== window.__PB_BUILD) {
      error.hidden = false;
      document.getElementById('app').setAttribute('aria-busy', 'false');
    }
    retry.addEventListener('click', () => location.reload());
  });
})();
