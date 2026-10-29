/* Glint PWA glue: service-worker registration, install prompt,
   update prompt and offline indicator. Kept separate from app.js so
   the app logic stays exactly as you wrote it. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const installBar = $("#installBar");
  const installBtn = $("#installBtn");
  const installHint = $("#installHint");
  const updateBar = $("#updateBar");
  const offlineBar = $("#offlineBar");

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone) document.documentElement.classList.add("is-standalone");

  const say = (msg) => {
    if (typeof window.toast === "function") window.toast(msg);
  };

  /* ── Offline / online indicator ─────────────────────────────── */
  const syncOfflineBar = () => {
    if (offlineBar) offlineBar.hidden = navigator.onLine;
  };
  window.addEventListener("offline", syncOfflineBar);
  window.addEventListener("online", () => {
    syncOfflineBar();
    say("Back online");
  });
  syncOfflineBar();

  /* ── Install prompt ─────────────────────────────────────────── */
  let deferredPrompt = null;
  const DISMISS_KEY = "pb-install-dismissed";
  const dismissedRecently = () => {
    try {
      const t = +localStorage.getItem(DISMISS_KEY);
      return t && Date.now() - t < 7 * 24 * 60 * 60 * 1000; // stay quiet for a week
    } catch {
      return false;
    }
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we'll show our own, nicer prompt
    deferredPrompt = event;
    if (!isStandalone && !dismissedRecently() && installBar) {
      installBar.hidden = false;
    }
  });

  // iOS Safari has no beforeinstallprompt — show manual instructions instead.
  if (isIOS && !isStandalone && !dismissedRecently() && installBar) {
    installHint.textContent = "Tap Share, then “Add to Home Screen”";
    installBtn.textContent = "How?";
    installBar.hidden = false;
  }

  async function promptInstall() {
    if (isStandalone) {
      say("Glint is already installed");
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted" && installBar) installBar.hidden = true;
      deferredPrompt = null;
    } else if (isIOS) {
      say("Tap Share → Add to Home Screen");
    } else {
      say("Use your browser menu → Install app");
    }
  }

  // Used by the “Install app” row in Settings (app.js calls this).
  window.__pinboardInstall = promptInstall;

  installBtn && installBtn.addEventListener("click", promptInstall);
  $("#installClose") &&
    $("#installClose").addEventListener("click", () => {
      installBar.hidden = true;
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
    });

  window.addEventListener("appinstalled", () => {
    if (installBar) installBar.hidden = true;
    deferredPrompt = null;
    say("Glint installed 🎉");
  });

  /* ── Service worker + update flow ───────────────────────────── */
  if (!("serviceWorker" in navigator)) return;

  /* Only a worker the user accepted may reload the page. On a first visit the
     new worker claims the page moments after it starts, and reloading there
     pulled the UI out from under the user (a flash, and lost scroll). */
  let refreshing = false, updateAccepted = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateAccepted || refreshing) return;
    refreshing = true;
    window.location.reload(); // new worker took over after user tapped Update
  });

  /* The very first visit is not controlled by the worker, so nothing it loaded
     reaches the offline cache. Once the worker takes over, tell the app to draw
     its current screen once more: those requests (feed JSON and the pictures
     that are on screen) now pass through the worker and are kept for offline. */
  const warmOfflineCache = () => {
    try {
      if (sessionStorage.getItem("pb-offline-warmed")) return;
      sessionStorage.setItem("pb-offline-warmed", "1");
    } catch { return; }
    window.dispatchEvent(new Event("pb-shell-ready"));
  };
  navigator.serviceWorker.addEventListener("controllerchange", warmOfflineCache);
  if (navigator.serviceWorker.controller) warmOfflineCache();

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");

      const offerUpdate = (worker) => {
        if (!worker || !updateBar) return;
        updateBar.hidden = false;
        $("#updateBtn").onclick = () => {
          updateAccepted = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        };
        $("#updateClose").onclick = () => (updateBar.hidden = true);
      };

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            offerUpdate(worker);
          }
        });
      });
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
  });
})();
