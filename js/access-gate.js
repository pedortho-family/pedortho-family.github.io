/**
 * Access Gate - Restricts access to users with the correct token in the URL hash.
 * The QR code contains the full URL with the secret token.
 * Without the token, visitors see an "Access Denied" screen.
 */
(function() {
    'use strict';

    // Secret access token - change this to update the QR code access
    const ACCESS_TOKEN = 'PedOrtho-Portal-2026';

    // Parse hash parameters (format: #access=TOKEN&page=somepage)
    function getHashParams() {
        const hash = window.location.hash;
        if (!hash) return {};
        return Object.fromEntries(new URLSearchParams(hash.substring(1)));
    }

    function isAuthorized() {
        const params = getHashParams();
        if (params.access === ACCESS_TOKEN) {
            // Store in sessionStorage so navigation within the page works
            sessionStorage.setItem('pe_authorized', 'true');
            return true;
        }
        // Check sessionStorage for already-authorized sessions
        return sessionStorage.getItem('pe_authorized') === 'true';
    }

    // Expose helper to get the initial page from hash (e.g., #access=TOKEN&page=cerebral-palsy)
    window.__INITIAL_PAGE__ = getHashParams().page || null;

    function showAccessDenied() {
        // Hide everything
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('app').classList.add('hidden');

        // Create access denied screen
        const gate = document.createElement('div');
        gate.id = 'access-gate';
        gate.innerHTML = `
            <div class="gate-container">
                <div class="gate-icon"><svg class="ic"><use href="#i-lock"/></svg></div>
                <h1 class="gate-title">الوصول مقيّد</h1>
                <p class="gate-subtitle">Access Restricted</p>
                <p class="gate-message">هذا المحتوى متاح فقط عبر رمز QR المخصص</p>
                <p class="gate-message-en">This content is only accessible via the authorized QR code.</p>
                <div class="gate-divider"></div>
                <div class="gate-info">
                    <svg class="ic"><use href="#i-qr-code"/></svg>
                    <span>يرجى مسح رمز QR للدخول</span>
                </div>
                <p class="gate-footer">وحدة جراحة عظام الأطفال</p>
            </div>
        `;
        document.body.appendChild(gate);
    }

    // Run gate check immediately
    if (!isAuthorized()) {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showAccessDenied);
        } else {
            showAccessDenied();
        }
        // Prevent other scripts from running by setting a global flag
        window.__ACCESS_DENIED__ = true;
    }
})();
