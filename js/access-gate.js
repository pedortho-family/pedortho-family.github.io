/**
 * Start-up link reader.
 * The portal is open to everyone: the plain address, a short link
 * (/cerebral-palsy/) and the printed QR codes all open it. QR codes and older
 * shared links still carry "#access=PedOrtho-Portal-2026&page=..."; the
 * access part is simply ignored now, so every code already printed keeps
 * working. (Until 2026-11-07 a visitor without it saw a "الوصول مقيّد" screen.)
 */
(function() {
    'use strict';

    // Hash format: #page=somepage&section=N (an #access=... part may also be there)
    function getHashParams() {
        const hash = window.location.hash;
        if (!hash) return {};
        return Object.fromEntries(new URLSearchParams(hash.substring(1)));
    }

    // Page to open first, read by app.js (e.g. #access=TOKEN&page=cerebral-palsy)
    window.__INITIAL_PAGE__ = getHashParams().page || null;
})();
