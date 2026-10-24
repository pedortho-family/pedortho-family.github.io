/* ============================================
   Parents Education Portal - Sharing
   WhatsApp / Telegram / Native share / Copy / Email / Print
   ============================================ */

(function () {
    'use strict';

    /* The access token carried by the printed QR codes. Shared links include it
       so a relative who receives the link on WhatsApp lands directly on the
       topic, exactly as if they had scanned the QR code in the clinic. */
    const ACCESS_TOKEN = 'PedOrtho-Portal-2026';
    const FALLBACK_BASE_URL = 'https://pedortho-family.github.io/';
    const PORTAL_NAME = 'بوابة تثقيف الأسرة - وحدة جراحة عظام الأطفال';

    // ---- Link building ----
    function baseUrl() {
        if (location.protocol === 'http:' || location.protocol === 'https:') {
            // Drop the implicit index.html so links and QR payloads stay short -
            // the built-in QR generator only reaches version 6.
            return (location.origin + location.pathname).replace(/index\.html$/, '');
        }
        return FALLBACK_BASE_URL;
    }

    // Short link of a page: /cerebral-palsy/, a post-op procedure /post-op/6/,
    // any other section /surgery-guide/?section=3. Each is a small page built by
    // tools/links/build_links.py that gives WhatsApp its preview card and then
    // opens the portal there.
    function buildUrl(page, section) {
        const hasSection = section !== undefined && section !== null && section !== '';
        if (!page || page === 'home') return baseUrl();
        if (page === 'procedures-guide' && hasSection) return baseUrl() + 'post-op/' + section + '/';
        return baseUrl() + page + '/' + (hasSection ? '?section=' + encodeURIComponent(section) : '');
    }

    function buildMessage(ctx) {
        const lines = ['📚 ' + PORTAL_NAME, ''];
        if (ctx.title) lines.push('📌 ' + ctx.title);
        if (ctx.subtitle) lines.push(ctx.subtitle);
        lines.push('', ctx.url);
        return lines.join('\n');
    }

    // ---- Share targets ----
    // Line icons from js/icons.js
    const ICONS = {
        whatsapp: 'message-circle',
        telegram: 'send',
        native: 'share-2',
        copy: 'copy',
        email: 'mail',
        print: 'printer'
    };

    const TARGETS = [
        { id: 'whatsapp', label: 'واتساب' },
        { id: 'telegram', label: 'تيليجرام' },
        { id: 'native', label: 'مشاركة' },
        { id: 'copy', label: 'نسخ الرابط' },
        { id: 'email', label: 'بريد إلكتروني' },
        { id: 'print', label: 'طباعة' }
    ];

    function supportsNativeShare() {
        return typeof navigator.share === 'function';
    }

    function send(targetId, ctx) {
        const message = buildMessage(ctx);
        switch (targetId) {
            case 'whatsapp':
                shareToWhatsApp(message);
                break;
            case 'telegram':
                openLink('https://t.me/share/url?url=' + encodeURIComponent(ctx.url) +
                    '&text=' + encodeURIComponent(message));
                break;
            case 'email':
                location.href = 'mailto:?subject=' + encodeURIComponent(ctx.title || PORTAL_NAME) +
                    '&body=' + encodeURIComponent(message);
                break;
            case 'native':
                nativeShare(ctx);
                break;
            case 'copy':
                copyLink(ctx.url);
                break;
            case 'print':
                closeSheet();
                setTimeout(() => window.print(), 250);
                break;
        }
    }

    function isMobile() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || ''));
    }

    // Handing off to a messaging app must navigate the CURRENT tab. Opening the
    // link in a new tab makes iOS launch the app without the payload, so the
    // user arrives on their chat list with nothing to send. On desktop there is
    // no app hand-off, so a new tab is used to keep the portal open.
    function openLink(url) {
        if (isMobile()) {
            closeSheet();
            location.assign(url);
            return;
        }
        const win = window.open(url, '_blank', 'noopener');
        if (!win) location.assign(url);
    }

    // wa.me/?text= targets WhatsApp's root path, so the universal link handler
    // has nothing to act on and just opens the app. The whatsapp:// scheme
    // invokes the send intent, which is what raises the "send to..." picker
    // with the message already filled in.
    function shareToWhatsApp(message) {
        const text = encodeURIComponent(message);
        const webUrl = 'https://api.whatsapp.com/send?text=' + text;
        if (!isMobile()) {
            openLink(webUrl);
            return;
        }
        closeSheet();
        // Armed before the hand-off so it still runs if the browser rejects the
        // scheme outright. If WhatsApp does open, this page goes hidden and the
        // fallback is skipped.
        setTimeout(() => {
            if (document.visibilityState === 'visible') location.assign(webUrl);
        }, 1500);
        try {
            location.assign('whatsapp://send?text=' + text);
        } catch (e) {
            /* Scheme unsupported - the fallback above takes over. */
        }
    }

    function nativeShare(ctx) {
        if (!supportsNativeShare()) {
            copyLink(ctx.url);
            return;
        }
        navigator.share({
            title: ctx.title || PORTAL_NAME,
            text: buildMessage(ctx),
            url: ctx.url
        }).then(closeSheet).catch(() => { /* user dismissed the share sheet */ });
    }

    function copyLink(url) {
        writeToClipboard(url).then(ok => {
            toast(ok ? 'تم نسخ الرابط ✓' : 'تعذّر نسخ الرابط، انسخه يدوياً');
        });
    }

    function writeToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
        }
        return Promise.resolve(legacyCopy(text));
    }

    function legacyCopy(text) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(area);
        return ok;
    }

    // ---- Toast ----
    let toastTimer = null;
    function toast(text) {
        let el = document.querySelector('.share-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'share-toast';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        el.textContent = text;
        // Restart the entry animation on repeated copies.
        el.classList.remove('visible');
        void el.offsetWidth;
        el.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
    }

    // ---- Share sheet ----
    let sheet = null;
    let backdrop = null;
    let activeCtx = null;
    let lastFocused = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildSheet() {
        backdrop = document.createElement('div');
        backdrop.className = 'share-backdrop';
        backdrop.addEventListener('click', closeSheet);

        sheet = document.createElement('div');
        sheet.className = 'share-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'shareSheetTitle');
        sheet.innerHTML = `
            <div class="share-sheet-grip"></div>
            <div class="share-sheet-head">
                <h3 id="shareSheetTitle">مشاركة مع الأهل</h3>
                <button type="button" class="share-sheet-close ibtn" aria-label="إغلاق">${window.icon('x')}</button>
            </div>
            <p class="share-sheet-topic"></p>
            <div class="share-targets">
                ${TARGETS.map(t => `
                    <button type="button" class="share-target share-target-${t.id}" data-target="${t.id}">
                        <span class="share-target-icon">${window.icon(ICONS[t.id])}</span>
                        <span class="share-target-label">${t.label}</span>
                    </button>
                `).join('')}
            </div>
            <div class="share-link-row">
                <span class="share-link-text" dir="ltr"></span>
            </div>
            <p class="share-sheet-note">الرابط يفتح الموضوع مباشرة على هاتف من يستقبله، تماماً مثل مسح رمز QR.</p>
        `;

        sheet.querySelector('.share-sheet-close').addEventListener('click', closeSheet);
        sheet.querySelectorAll('.share-target').forEach(btn => {
            btn.addEventListener('click', () => {
                if (activeCtx) send(btn.dataset.target, activeCtx);
            });
        });
        sheet.querySelector('.share-link-row').addEventListener('click', () => {
            if (activeCtx) copyLink(activeCtx.url);
        });

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
    }

    function openSheet(ctx) {
        if (!sheet) buildSheet();
        activeCtx = ctx;
        lastFocused = document.activeElement;

        sheet.querySelector('.share-sheet-topic').textContent = ctx.title || '';
        sheet.querySelector('.share-link-text').textContent = ctx.url;
        // The native share sheet only exists on devices that offer one.
        sheet.querySelector('.share-target-native').classList.toggle('hidden', !supportsNativeShare());

        backdrop.classList.add('visible');
        sheet.classList.add('visible');
        document.body.classList.add('share-open');
        document.addEventListener('keydown', onKeydown);
        sheet.querySelector('.share-sheet-close').focus();
    }

    function closeSheet() {
        if (!sheet) return;
        backdrop.classList.remove('visible');
        sheet.classList.remove('visible');
        document.body.classList.remove('share-open');
        document.removeEventListener('keydown', onKeydown);
        activeCtx = null;
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        lastFocused = null;
    }

    function onKeydown(e) {
        if (e.key === 'Escape') closeSheet();
    }

    // ---- Public API ----
    /**
     * Share a topic or a single section.
     * @param {{page?:string, section?:number|string, title?:string, subtitle?:string, target?:string}} opts
     *   target: omit (or 'sheet') to open the share sheet, or name a target
     *   such as 'whatsapp' to go straight there.
     */
    function share(opts) {
        const o = opts || {};
        const ctx = {
            title: o.title || '',
            subtitle: o.subtitle || '',
            url: buildUrl(o.page, o.section)
        };
        if (!o.target || o.target === 'sheet') {
            openSheet(ctx);
        } else {
            send(o.target, ctx);
        }
    }

    window.PortalShare = {
        share,
        close: closeSheet,
        buildUrl,
        toast,
        accessToken: ACCESS_TOKEN,
        escapeHtml
    };
})();
