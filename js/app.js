/* ============================================
   Parents Education Portal - Main Application
   SPA Router, Search, Navigation, QR Generator
   ============================================ */

(function() {
    'use strict';

    // Who prepares and reviews the portal. Shown quietly under each topic, on Home and on the About page.
    const EDITOR = { name: 'د. موسى الأحمري', role: 'استشاري جراحة عظام الأطفال', updated: 'أكتوبر 2026' };

    // ---- App State ----
    const state = {
        currentPage: 'home',
        currentTitle: 'بوابة تثقيف الأسرة',
        sideNavOpen: false,
        searchOpen: false,
        // Section index requested by a shared deep link (#...&section=3)
        pendingSection: null,
        // Post-op procedure shown on its own screen, or null for the list
        openProcedure: null
    };

    // ---- DOM Elements ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    // Line icon markup from js/icons.js: svgIcon('house') or svgIcon('house', 'extra-class')
    const svgIcon = (name, cls) => window.icon(name, cls);

    // ---- Initialize ----
    document.addEventListener('DOMContentLoaded', () => {
        // If access is denied, don't initialize the app
        if (window.__ACCESS_DENIED__) return;
        setTimeout(() => {
            const splash = $('#splash-screen');
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
                $('#app').classList.remove('hidden');
            }, 500);
        }, 1800);

        initNavigation();
        initSearch();
        initBackToTop();
        initSharing();
        initPageLinks();
        renderPage('home');
    });

    // ---- Navigation ----
    function initNavigation() {
        renderNav();
        $('#navOverlay').addEventListener('click', closeSideNav);

        // Nav links
        $$('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                navigateTo(page);
                closeSideNav();
            });
        });

        // Bottom nav
        $$('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(item.dataset.page);
            });
        });

        // Top bar and page buttons are redrawn with each page, so their clicks
        // are handled here once: data-go="<page>" opens that page.
        document.addEventListener('click', (e) => {
            const proc = e.target.closest('[data-procedure]');
            if (proc) {
                e.preventDefault();
                state.pendingSection = proc.dataset.procedure;
                navigateTo('procedures-guide');
                return;
            }
            const go = e.target.closest('[data-go]');
            if (go) {
                e.preventDefault();
                navigateTo(go.dataset.go);
                return;
            }
            if (e.target.closest('#searchBtn')) toggleSearch();
            else if (e.target.closest('#headerTitle')) navigateTo('home');
        });
    }

    function toggleSideNav() {
        state.sideNavOpen = !state.sideNavOpen;
        $('#sideNav').classList.toggle('open', state.sideNavOpen);
        $('#navOverlay').classList.toggle('active', state.sideNavOpen);
    }

    function closeSideNav() {
        state.sideNavOpen = false;
        $('#sideNav').classList.remove('open');
        $('#navOverlay').classList.remove('active');
    }

    function navigateTo(page) {
        closePageQR();
        state.currentPage = page;
        // renderPage consumes pendingSection, so read it first: a shared section
        // link scrolls to that section instead of to the top of the page.
        const hasPendingSection = state.pendingSection !== null && state.pendingSection !== undefined;
        renderPage(page);
        updateActiveNav(page);
        // Update hash with page param while preserving access token
        const params = new URLSearchParams(window.location.hash.substring(1));
        params.set('page', page);
        // A shared section link is consumed on arrival; don't leave it in the URL.
        // An open procedure keeps its number there, so a reload or a copied
        // address shows the same procedure.
        params.delete('section');
        const procedureOpen = page === 'procedures-guide' && state.openProcedure !== null;
        if (procedureOpen) params.set('section', state.openProcedure);
        const newHash = '#' + params.toString();
        if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash);
        }
        if (!hasPendingSection || procedureOpen) {
            window.scrollTo({ top: 0, behavior: hasPendingSection ? 'auto' : 'smooth' });
        }
        closeSearch();
    }

    function updateActiveNav(page) {
        $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
        $$('.bottom-nav-item').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    }

    // ---- Search ----
    function initSearch() {
        $('#searchClose').addEventListener('click', closeSearch);

        const input = $('#searchInput');
        input.addEventListener('input', () => {
            const query = input.value.trim();
            if (query.length >= 2) {
                performSearch(query);
            } else {
                $('#searchResults').classList.remove('active');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = $('.search-result-item');
                if (first) first.click();
            }
        });
    }

    function toggleSearch() {
        state.searchOpen = !state.searchOpen;
        const bar = $('#searchBar');
        bar.classList.toggle('hidden', !state.searchOpen);
        if (state.searchOpen) {
            setTimeout(() => $('#searchInput').focus(), 100);
        }
    }

    function closeSearch() {
        state.searchOpen = false;
        $('#searchBar').classList.add('hidden');
        $('#searchInput').value = '';
        $('#searchResults').classList.remove('active');
    }

    // English or Arabic, as typed in clinic: "clubfoot", "DDH", "VDRO", «حنفاء».
    // Arabic is compared without diacritics and with one form of alef, ta
    // marbuta and ya, so «حنفا» still finds «القدم الحنفاء». The post-op
    // procedures are searched too, and open straight at that procedure.
    const EN_ALIASES = {
        'cerebral-palsy': 'cp spastic diplegia hemiplegia quadriplegia gmfcs',
        'spina-bifida': 'myelomeningocele mmc',
        'charcot-marie-tooth': 'cmt hmsn cavus',
        'neuromuscular-conditions': 'sma dmd duchenne muscular dystrophy myopathy',
        'osteogenesis-imperfecta': 'oi brittle bone',
        'clubfoot': 'club foot ctev talipes ponseti',
        'ddh': 'hip dysplasia dislocated hip pavlik',
        'flatfoot': 'flat foot pes planus planovalgus',
        'talocalcaneal-coalition': 'tarsal coalition',
        'perthes': 'lcpd legg calve',
        'scfe': 'slipped epiphysis',
        'toe-walking': 'tiptoe toe walker',
        'in-toeing': 'intoeing pigeon toe femoral anteversion tibial torsion',
        'arthrogryposis': 'amc',
        'cast-care': 'cast plaster',
        'spica-cast-care': 'hip spica',
        'silicone-gel': 'scar',
        'surgery-guide': 'surgery operation pre op post op anaesthesia anesthesia',
        'procedures-guide': 'post op instructions procedures',
        'clavicle-fracture': 'collarbone collar bone',
        'proximal-humerus-fracture': 'humerus shoulder',
        'humeral-shaft-fracture': 'humerus',
        'supracondylar-fracture': 'elbow fracture gartland',
        'radial-head-neck-fracture': 'radial neck radial head',
        'buckle-fracture': 'torus',
        'metacarpal-fracture': 'boxer',
        'pelvic-avulsion-fracture': 'asis aiis ischial avulsion',
        'femur-fractures': 'thigh femoral shaft',
        'tibial-spine-fracture': 'tibial eminence acl',
        'tibia-fractures': 'tibial shaft shin',
        'transitional-ankle-fracture': 'tillaux triplane',
        'calcaneus-fracture': 'heel',
        'midfoot-fracture': 'talus navicular cuboid lisfranc',
        'metatarsal-fracture': 'jones',
        'growth-plate-fracture': 'physeal salter harris',
        'calcaneovalgus': 'calcaneo valgus positional newborn foot',
        'curly-toe': 'curly toes',
        'osgood-schlatter': 'osgood schlatter tibial tubercle apophysitis knee bump',
        'severs-apophysitis': 'sever severs heel pain calcaneal apophysitis',
        'non-ossifying-fibroma': 'nof fibrous cortical defect',
        'osteochondroma': 'exostosis mhe hme multiple hereditary exostoses',
        'transient-synovitis': 'irritable hip toxic synovitis limp',
        'septic-arthritis': 'septic hip joint infection',
        'bowed-legs-knock-knees': 'genu varum genu valgum bow legs knock knees blount rickets',
        'nursemaids-elbow': 'nursemaid pulled elbow radial head subluxation'
    };
    // Post-op procedures by number: the short names surgeons use.
    const PROC_ALIASES = {
        1: 'closed reduction arthrogram spica', 2: 'open reduction dega salter pemberton',
        3: 'dega salter pemberton', 4: 'pinning in situ', 5: 'vdro derotation varus osteotomy',
        6: 'vdro hip reconstruction', 7: 'pfgg', 8: 'castle mchale dastous salvage',
        9: 'semls adductor hamstring psoas release', 10: 'sesa calcaneal block arthroereisis',
        11: 'triple arthrodesis', 12: '8 plate eight plate hemiepiphysiodesis',
        13: 'tal strayer vulpius gastrocnemius', 14: 'tenotomy ponseti',
        15: 'tibialis anterior transfer posteromedial release'
    };

    function fold(text) {
        return String(text || '').toLowerCase()
            .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
            .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/[-_/()+'’.]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // 3 = a field starts with the query, 2 = a word does (with or without
    // «ال»), 1 = it appears anywhere.
    function matchScore(fields, q) {
        let best = 0;
        for (const f of fields) {
            if (!f) continue;
            if (f.startsWith(q)) return 3;
            if ((' ' + f).includes(' ' + q) || (' ' + f).includes(' ال' + q)) best = 2;
            else if (!best && f.includes(q)) best = 1;
        }
        return best;
    }

    let searchIndex = null;
    function buildSearchIndex() {
        const topics = getAllConditions().map(c => ({
            page: c.id,
            name: c.name,
            sub: c.englishName || c.shortDesc || '',
            group: topicGroup(c.id),
            fields: [c.name, c.englishName, c.id, EN_ALIASES[c.id]]
                .concat(c.altNames || [], c.keywords || []).map(fold)
        }));
        const procs = ((window.proceduresGuideData || {}).sections || []).map((sec, i) => {
            if (sec.type === 'guide-index') return null;
            const t = splitTitle(sec.title);
            return {
                procedure: i,
                name: `العملية ${t.n || i}: ${t.ar}`,
                sub: t.en,
                group: { key: 'care', icon: 'clipboard-list' },
                fields: [t.ar, t.en, PROC_ALIASES[i]].map(fold)
            };
        }).filter(Boolean);
        return topics.concat(procs);
    }

    function performSearch(query) {
        const q = fold(query);
        if (!searchIndex) searchIndex = buildSearchIndex();
        const results = searchIndex
            .map((item, order) => ({ item, order, score: matchScore(item.fields, q) }))
            .filter(r => r.score)
            .sort((a, b) => b.score - a.score || a.order - b.order)
            .slice(0, 12)
            .map(r => r.item);

        const container = $('#searchResults');
        if (results.length === 0) {
            container.innerHTML = '<div class="search-empty">لا توجد نتائج</div>';
        } else {
            // A procedure carries data-procedure, which the page-wide click
            // handler opens at that procedure.
            container.innerHTML = results.map(r => `
                <div class="search-result-item" ${r.procedure !== undefined ? `data-procedure="${r.procedure}"` : `data-page="${esc(r.page)}"`} role="button" tabindex="0">
                    <div class="result-icon g-${r.group.key}">${svgIcon(r.group.icon)}</div>
                    <div class="result-text">
                        <h4>${esc(r.name)}</h4>
                        <p dir="auto">${esc(r.sub)}</p>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.search-result-item[data-page]').forEach(item => {
                item.addEventListener('click', () => {
                    navigateTo(item.dataset.page);
                });
            });
        }
        container.classList.add('active');
    }

    // ---- Topic groups ----
    // The five groups of Home, the menu and the all-sections page, in that order.
    const GROUPS = [
        { key: 'neuro', name: 'الأعصاب والعضلات', icon: 'brain', items: () => window.conditionsNeuro || [] },
        { key: 'bone', name: 'العظام والمفاصل', icon: 'bone', items: () => window.conditionsSkeletal || [] },
        { key: 'hip', name: 'الورك والمشي', icon: 'footprints', items: () => window.conditionsHip || [] },
        { key: 'fracture', name: 'الكسور', icon: 'activity', items: () => window.conditionsFractures || [] },
        { key: 'care', name: 'أدلة العناية', icon: 'heart-handshake', items: () => [surgeryGuideTopic()].concat(window.castCareData || []) }
    ];

    // Sub-headings inside the fractures group, from each page's `region`
    // (js/data/conditions-fractures.js lists the pages in this order).
    const REGIONS = [
        ['upper', 'الطرف العلوي'],
        ['lower', 'الحوض والطرف السفلي'],
        ['general', 'معلومات عامة عن الكسور']
    ];

    // A group's topics split into its sub-groups: [[heading or null, topics], ...].
    // A fracture page without a region goes under the last heading.
    function subgroupsOf(group) {
        const items = group.items();
        if (group.key !== 'fracture') return [[null, items]];
        const known = REGIONS.map(([key]) => key);
        return REGIONS.map(([key, title], i) => [title, items.filter(c =>
            c.region === key || (i === REGIONS.length - 1 && !known.includes(c.region)))])
            .filter(([, list]) => list.length);
    }

    // The side menu (always open on wide screens): Home, each group, the QR page.
    function renderNav() {
        const link = (page, icon, name, cls) => `
            <a href="#" class="nav-link${cls ? ' ' + cls : ''}" data-page="${page}"><span class="nav-ic">${svgIcon(icon)}</span><span>${name}</span></a>`;
        $('#navLinks').innerHTML = link('home', 'house', 'الرئيسية', 'active') +
            GROUPS.map(g => `<div class="nav-category">${g.name}</div>` + subgroupsOf(g).map(([title, list]) =>
                (title ? `<div class="nav-sub">${title}</div>` : '') +
                list.map(c => link(c.id, c.id === 'surgery-guide' ? 'stethoscope' : g.icon, c.name, 'g-' + g.key)).join('') +
                (g.key === 'care' ? link('procedures-guide', 'clipboard-list', 'تعليمات ما بعد العمليات', 'g-care') : '')
            ).join('')).join('') +
            link('qr-codes', 'qr-code', 'رموز QR للطباعة') +
            link('about', 'info', 'عن البوابة');
    }

    // The pre/post-surgery guide is listed with the care guides.
    function surgeryGuideTopic() {
        return {
            id: 'surgery-guide',
            name: 'دليل ما قبل وبعد الجراحة',
            englishName: 'Before and After Surgery',
            sections: (window.surgeryGuideData || {}).sections || []
        };
    }

    // The group a page belongs to: its colour (g-<key>), icon and name.
    function topicGroup(id) {
        const g = GROUPS.find(gr => gr.items().some(c => c.id === id));
        if (!g) return { key: 'care', icon: 'clipboard-list', name: 'دليل العمليات' };
        return { key: g.key, icon: id === 'surgery-guide' ? 'stethoscope' : g.icon, name: g.name };
    }

    // Arabic counted nouns: 1 قسم, 2 قسمان, 3–10 أقسام, 11 and up قسماً.
    const WORDS = {
        section: ['قسم', 'قسمان', 'أقسام', 'قسماً'],
        faq: ['سؤال شائع', 'سؤالان شائعان', 'أسئلة شائعة', 'سؤالاً شائعاً'],
        link: ['رابط لتعليمات العمليات', 'رابطان لتعليمات العمليات', 'روابط لتعليمات العمليات', 'رابطاً لتعليمات العمليات'],
        figure: ['رسم توضيحي', 'رسمان توضيحيان', 'رسوم توضيحية', 'رسماً توضيحياً'],
        procedure: ['عملية', 'عمليتان', 'عمليات', 'عملية']
    };

    function arCount(n, forms) {
        if (n === 1) return forms[0];
        if (n === 2) return forms[1];
        return n % 100 >= 3 && n % 100 <= 10 ? forms[2] : forms[3];
    }

    function getAllConditions() {
        const conditions = [];
        if (window.conditionsNeuro) conditions.push(...window.conditionsNeuro);
        if (window.conditionsSkeletal) conditions.push(...window.conditionsSkeletal);
        if (window.conditionsHip) conditions.push(...window.conditionsHip);
        if (window.conditionsFractures) conditions.push(...window.conditionsFractures);
        // Add surgery guide
        conditions.push({
            id: 'surgery-guide',
            name: 'دليل ما قبل وبعد الجراحة',
            icon: '📋',
            shortDesc: 'تعليمات شاملة للتحضير للعمليات الجراحية والعناية بعدها',
            keywords: ['جراحة', 'عملية', 'تحضير', 'تخدير', 'ما بعد', 'ما قبل']
        });
        // Add procedure-specific post-op guide
        conditions.push({
            id: 'procedures-guide',
            name: 'تعليمات ما بعد العمليات الجراحية',
            icon: '🏥',
            shortDesc: 'تعليمات مفصّلة لكل عملية: الجبيرة، الأدوية، المتابعة، التأهيل والأجهزة',
            keywords: ['عملية', 'جراحة', 'بعد العملية', 'خلع الورك', 'انزلاق', 'قطع عظمي',
                       'شريحة', 'توجيه النمو', 'إطالة', 'وتر أخيل', 'دمج', 'الشلل الدماغي',
                       'تأهيل', 'أجهزة تقويمية']
        });
        // Add cast care sections
        if (window.castCareData) conditions.push(...window.castCareData);
        return conditions;
    }

    // ---- Back to Top ----
    function initBackToTop() {
        const btn = $('#backToTop');
        const header = $('.header');
        window.addEventListener('scroll', () => {
            btn.classList.toggle('hidden', window.scrollY < 400);
            header.classList.toggle('scrolled', window.scrollY > 4);
        });
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ---- Sharing ----
    const SVG_SHARE = svgIcon('share-2');
    const SVG_WHATSAPP = svgIcon('message-circle');

    const esc = (v) => (window.PortalShare ? window.PortalShare.escapeHtml(v) : String(v == null ? '' : v));

    function shareAttrs(page, title, subtitle, section) {
        let attrs = ` data-share-page="${esc(page)}" data-share-title="${esc(title)}"`;
        if (subtitle) attrs += ` data-share-subtitle="${esc(subtitle)}"`;
        if (section !== undefined && section !== null) attrs += ` data-share-section="${esc(section)}"`;
        return attrs;
    }

    // Prominent "send this to the family" row shown under every page title.
    function renderShareRow(page, title, subtitle) {
        const attrs = shareAttrs(page, title, subtitle);
        return `
            <div class="share-row">
                <button type="button" class="share-chip share-chip-wa" data-share="whatsapp"${attrs}>
                    ${SVG_WHATSAPP}<span>أرسل عبر واتساب</span>
                </button>
                <button type="button" class="share-chip" data-share="sheet"${attrs}>
                    ${SVG_SHARE}<span>مشاركة</span>
                </button>
            </div>
        `;
    }

    // Small share button on a single section, so parents can send just the part
    // that matters (e.g. the warning signs) instead of the whole topic.
    function renderSectionShareBtn(ctx, section, index) {
        if (!ctx || !ctx.page) return '';
        const title = `${ctx.title} - ${section.title}`;
        return `
            <button type="button" class="section-share" data-share="sheet"${shareAttrs(ctx.page, title, ctx.subtitle, index)}
                    aria-label="مشاركة قسم ${esc(section.title)}" title="مشاركة هذا القسم">
                ${SVG_SHARE}
            </button>
        `;
    }

    // Links inside page content: <a href="#" data-goto="procedures-guide" data-section="6">
    // opens another page, optionally at one of its sections.
    function initPageLinks() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-goto]');
            if (!link) return;
            e.preventDefault();
            state.pendingSection = link.dataset.section ?? null;
            navigateTo(link.dataset.goto);
        });
    }

    function initSharing() {
        // Capture phase: a share button nested inside a collapsible section
        // header must not also toggle that section.
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-share]');
            if (!trigger) return;
            e.preventDefault();
            e.stopPropagation();
            const opts = {
                target: trigger.dataset.share,
                page: trigger.dataset.sharePage || state.currentPage,
                section: trigger.dataset.shareSection,
                title: trigger.dataset.shareTitle || state.currentTitle,
                subtitle: trigger.dataset.shareSubtitle || ''
            };
            if (opts.target === 'qr') {
                showPageQR(opts);
                return;
            }
            closePageQR();
            window.PortalShare.share(opts);
        }, true);
    }

    // ---- A page's QR code on screen (clinic) ----
    // A big code on this phone for the family to scan with their own camera,
    // so no number is needed. It holds the same short link as WhatsApp and the
    // printed codes. The screen is kept awake while it shows, where the
    // browser allows it.
    let qrView = null;
    let qrLastFocus = null;
    let qrWake = null;

    function buildPageQR() {
        qrView = document.createElement('div');
        qrView.className = 'qr-view';
        qrView.setAttribute('role', 'dialog');
        qrView.setAttribute('aria-modal', 'true');
        qrView.setAttribute('aria-labelledby', 'qrViewTitle');
        qrView.innerHTML = `
            <div class="qr-view-card" tabindex="-1">
                <div class="qr-view-head">
                    <span class="qr-view-kicker">${svgIcon('qr-code')}<span>امسحوا الرمز بكاميرا الهاتف</span></span>
                    <button type="button" class="ibtn qr-view-close" aria-label="إغلاق">${svgIcon('x')}</button>
                </div>
                <h2 class="qr-view-title" id="qrViewTitle"></h2>
                <p class="qr-view-sub" dir="ltr"></p>
                <canvas class="qr-view-code" role="img" aria-label="رمز QR لهذه الصفحة"></canvas>
                <p class="qr-view-url" dir="ltr"></p>
                <p class="qr-view-hint">تفتح الصفحة على هاتفكم مباشرةً، بالعربية</p>
                <button type="button" class="cta-main qr-view-wa" data-share="whatsapp">${svgIcon('message-circle')}<span>أو أرسلها عبر واتساب</span></button>
            </div>
        `;
        qrView.addEventListener('click', (e) => {
            if (e.target === qrView || e.target.closest('.qr-view-close')) closePageQR();
        });
        document.body.appendChild(qrView);
    }

    // Whole modules only, with the standard four-module quiet zone, so the
    // code stays sharp and quick to read at any screen size.
    function drawBigQR(canvas, text) {
        const m = generateQRMatrix(text);
        if (!m) return false;
        const cell = 16;
        const n = m.length;
        const side = (n + 8) * cell;
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, side, side);
        ctx.fillStyle = '#263540';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (m[r][c]) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
            }
        }
        return true;
    }

    function showPageQR(o) {
        if (!qrView) buildPageQR();
        const url = window.PortalShare.buildUrl(o.page, o.section);
        if (!drawBigQR(qrView.querySelector('.qr-view-code'), url)) {
            window.PortalShare.share(Object.assign({}, o, { target: 'sheet' }));
            return;
        }
        // A short heading: the Arabic name, with the English on its own line
        // (a procedure's share title is long and mixes the two).
        const proc = o.page === 'procedures-guide' && o.section !== undefined && o.section !== null && o.section !== ''
            ? ((window.proceduresGuideData || {}).sections || [])[o.section] : null;
        const topic = proc ? null : getAllConditions().find(c => c.id === o.page);
        const t = proc ? splitTitle(proc.title) : null;
        qrView.querySelector('.qr-view-title').textContent = t ? `العملية ${t.n}: ${t.ar}` : (topic ? topic.name : o.title || '');
        qrView.querySelector('.qr-view-sub').textContent = t ? t.en : (topic && topic.englishName) || '';
        qrView.querySelector('.qr-view-url').textContent = url.replace(/^https?:\/\//, '');
        const wa = qrView.querySelector('.qr-view-wa');
        wa.dataset.sharePage = o.page || '';
        wa.dataset.shareTitle = o.title || '';
        wa.dataset.shareSubtitle = o.subtitle || '';
        if (o.section !== undefined && o.section !== null) wa.dataset.shareSection = o.section;
        else delete wa.dataset.shareSection;

        qrLastFocus = document.activeElement;
        qrView.classList.add('visible');
        document.body.classList.add('share-open');
        document.addEventListener('keydown', onQRKeydown);
        // The card, not the close button, takes focus: no ring on a tap.
        qrView.querySelector('.qr-view-card').focus();
        if (navigator.wakeLock && navigator.wakeLock.request) {
            navigator.wakeLock.request('screen').then(lock => { qrWake = lock; }).catch(() => { /* not allowed here */ });
        }
    }

    function closePageQR() {
        if (!qrView || !qrView.classList.contains('visible')) return;
        qrView.classList.remove('visible');
        document.body.classList.remove('share-open');
        document.removeEventListener('keydown', onQRKeydown);
        if (qrWake) { qrWake.release().catch(() => {}); qrWake = null; }
        if (qrLastFocus && typeof qrLastFocus.focus === 'function') qrLastFocus.focus();
        qrLastFocus = null;
    }

    function onQRKeydown(e) {
        if (e.key === 'Escape') closePageQR();
    }

    // ---- Page Rendering ----
    function renderPage(page) {
        const main = $('#mainContent');
        switch (page) {
            case 'home':
                state.currentTitle = 'بوابة تثقيف الأسرة - وحدة جراحة عظام الأطفال';
                main.innerHTML = renderHomePage();
                bindHomeEvents();
                break;
            case 'categories':
                state.currentTitle = 'جميع الأقسام';
                main.innerHTML = renderCategoriesPage();
                break;
            case 'surgery-guide':
                state.currentTitle = 'دليل ما قبل وبعد الجراحة';
                main.innerHTML = renderSurgeryGuidePage();
                bindSectionToggles();
                bindQuickNav();
                bindFAQToggles();
                openRequestedSection(main, false);
                break;
            case 'procedures-guide':
                state.currentTitle = 'تعليمات ما بعد العمليات الجراحية';
                main.innerHTML = renderProceduresGuidePage();
                bindSectionToggles();
                bindFAQToggles();
                openRequestedSection(main, false);
                break;
            case 'about':
                state.currentTitle = 'عن البوابة';
                main.innerHTML = renderAboutPage();
                break;
            case 'qr-codes':
                state.currentTitle = 'رموز QR للطباعة';
                main.innerHTML = renderQRPage();
                generateQRCodes();
                break;
            default:
                const condition = findCondition(page);
                if (condition) {
                    state.currentTitle = condition.name;
                    main.innerHTML = renderConditionPage(condition);
                    bindSectionToggles();
                    bindQuickNav();
                    bindFAQToggles();
                    openRequestedSection(main, true);
                } else {
                    // An unknown page name (a mistyped short link) opens Home.
                    state.currentPage = 'home';
                    main.innerHTML = renderHomePage();
                    bindHomeEvents();
                    page = 'home';
                }
                break;
        }
        wrapTables(main);
        renderTopBar(page);
        // Topic pages carry their own "send this page" bar instead of the bottom navigation.
        document.body.classList.toggle('has-cta', !!main.querySelector('.cta-bar'));
    }

    // Opens the section a shared link asked for (#...&section=3) and scrolls to
    // it. Falls back to the first section when the page opens one by default.
    function openRequestedSection(main, autoOpenFirst) {
        const sections = main.querySelectorAll('.content-section');
        const requested = parseInt(state.pendingSection, 10);
        state.pendingSection = null;
        if (!sections.length) return;

        const hasRequest = !isNaN(requested) && requested >= 0 && requested < sections.length;
        if (!hasRequest && !autoOpenFirst) return;

        const index = hasRequest ? requested : 0;
        const header = sections[index].querySelector('.section-header');
        if (header) header.click();

        if (!hasRequest) return;

        const tabs = main.querySelectorAll('.quick-nav-tab');
        tabs.forEach((t, i) => t.classList.toggle('active', i === index));
        scrollToWhenVisible(sections[index]);
    }

    // A deep link is handled while the splash screen may still be covering the
    // app, and scrollIntoView does nothing on an element without a layout box.
    // Wait for the app to be on screen before scrolling.
    function scrollToWhenVisible(target) {
        let attempts = 0;
        (function attempt() {
            const appVisible = !$('#app').classList.contains('hidden');
            if (appVisible && target.getBoundingClientRect().height > 0) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            if (attempts++ < 60) setTimeout(attempt, 100);
        })();
    }

    function findCondition(id) {
        const all = getAllConditions();
        return all.find(c => c.id === id);
    }

    // A table wider than the phone scrolls sideways inside its own box instead
    // of being cut off by the card around it. Most tables in the text files
    // already sit in .responsive-table; this covers the ones that do not.
    function wrapTables(root) {
        root.querySelectorAll('table').forEach(table => {
            if (table.parentElement.classList.contains('responsive-table')) return;
            const box = document.createElement('div');
            box.className = 'responsive-table';
            table.parentNode.insertBefore(box, table);
            box.appendChild(table);
        });
    }

    // ---- Shared page parts ----
    // Round badge, title, English name and one line, centred at the top of a page.
    function pageHero(o) {
        return `
            <section class="hero g-${o.group}">
                <div class="hero-art">${o.number ? `<span class="hero-num">${o.number}</span>` : svgIcon(o.icon)}</div>
                <h1>${o.title}</h1>
                ${o.en ? `<p class="hero-en">${o.en}</p>` : ''}
                ${o.desc ? `<p class="hero-desc">${o.desc}</p>` : ''}
            </section>
        `;
    }

    // Fixed bar at the bottom of a topic: send it on WhatsApp, or share another way.
    // It takes the place of the bottom navigation on that page.
    function renderCtaBar(page, title, subtitle, label, section) {
        const attrs = shareAttrs(page, title, subtitle, section);
        return `
            <div class="cta-space"></div>
            <div class="cta-bar">
                <button type="button" class="cta-main" data-share="whatsapp"${attrs}>${svgIcon('message-circle')}<span>${label || 'أرسل الصفحة عبر واتساب'}</span></button>
                <button type="button" class="ibtn ibtn-tint cta-alt" data-share="qr"${attrs} aria-label="اعرض رمز QR ليمسحه الأهل" title="رمز QR">${svgIcon('qr-code')}</button>
                <button type="button" class="ibtn ibtn-tint cta-alt" data-share="sheet"${attrs} aria-label="مشاركة">${svgIcon('share-2')}</button>
            </div>
        `;
    }

    // ---- Top bar ----
    // Home: search, the portal's name, QR codes. Every other page: back, where
    // you are, share this page.
    function renderTopBar(page) {
        const bar = $('#topBar');
        if (page === 'home') {
            bar.innerHTML = `
                <button type="button" class="ibtn" id="searchBtn" aria-label="بحث">${svgIcon('search')}</button>
                <div class="top-mid"><span class="brand" id="headerTitle">${svgIcon('bone')}<span>بوابة تثقيف الأسرة</span></span></div>
                <button type="button" class="ibtn ibtn-tint" data-go="qr-codes" aria-label="رموز QR للطباعة">${svgIcon('qr-code')}</button>
            `;
            return;
        }
        const fixed = {
            'categories': { icon: 'layout-grid', label: 'الأقسام' },
            'procedures-guide': { icon: 'clipboard-list', label: 'دليل العمليات' },
            'qr-codes': { icon: 'qr-code', label: 'رموز QR' },
            'about': { icon: 'info', label: 'عن البوابة' }
        };
        const g = topicGroup(page);
        let crumb = fixed[page] || { icon: g.icon, label: page === 'surgery-guide' ? 'دليل الجراحة' : g.name };
        let back = 'home';
        let share = '';
        // One procedure: back goes to the list, share sends just this procedure.
        if (page === 'procedures-guide' && state.openProcedure !== null) {
            const section = window.proceduresGuideData.sections[state.openProcedure];
            crumb = { icon: 'clipboard-list', label: `العملية ${splitTitle(section.title).n || state.openProcedure}` };
            back = 'procedures-guide';
            share = shareAttrs('procedures-guide', `تعليمات ما بعد العمليات الجراحية - ${section.title}`, '', state.openProcedure);
        }
        bar.innerHTML = `
            <button type="button" class="ibtn" data-go="${back}" aria-label="رجوع">${svgIcon('chevron-right')}</button>
            <div class="top-mid"><span class="crumb">${svgIcon(crumb.icon)}<span>${crumb.label}</span></span></div>
            <button type="button" class="ibtn ibtn-tint share-btn" id="shareBtn" data-share="sheet"${share} aria-label="مشاركة هذه الصفحة" title="مشاركة">${svgIcon('share-2')}</button>
        `;
    }

    // ---- Home Page ----
    function renderAboutPage() {
        return `
            ${pageHero({ group: 'care', icon: 'info', title: 'عن البوابة', desc: 'لماذا أُنشئت، ومن يراجعها، وكيف يمكن استخدامها' })}
            <div class="condition-content about">
                <div class="content-section"><div class="section-body open">
                    <h3>من أعدّ البوابة؟</h3>
                    <p>أعدّ محتوى هذه البوابة ويراجعه طبياً ${EDITOR.name}، ${EDITOR.role}. تُراجَع المواضيع دورياً وفق المراجع الحديثة وبروتوكولات العلاج، وآخر تحديث كان في ${EDITOR.updated}.</p>
                    <h3>لمن هذه البوابة؟</h3>
                    <p>للأسر أولاً: شرح واضح بالعربية لحالات عظام الأطفال وعلاجها. وهي مفتوحة أيضاً لجميع أطباء وجراحي عظام الأطفال وفرقهم، ليشاركوا روابطها ورموز QR الخاصة بها مع أسر مرضاهم مجاناً.</p>
                    <h3>حقوق الاستخدام</h3>
                    <p>يمكنك مشاركة الصفحات وطباعتها وإرسال روابطها للأسر بحرية.</p>
                    <h3>تنبيه طبي</h3>
                    <p>هذا المحتوى للتثقيف فقط ولا يغني عن استشارة الطبيب المعالج.</p>
                </div></div>
            </div>
        `;
    }

    function renderHomePage() {
        return `
            <section class="hello">
                <h1>كل ما تحتاجونه عن حالة طفلكم</h1>
                <p>شرح واضح بالعربية من وحدة جراحة عظام الأطفال</p>
            </section>

            <div class="pills" role="group" aria-label="عرض المواضيع حسب المجموعة">
                <button type="button" class="pill on" data-filter="all" aria-pressed="true"><span class="pill-ic">${svgIcon('layout-grid')}</span><span>الكل</span></button>
                ${GROUPS.map(g => `
                    <button type="button" class="pill g-${g.key}" data-filter="${g.key}" aria-pressed="false"><span class="pill-ic">${svgIcon(g.icon)}</span><span>${g.name}</span></button>
                `).join('')}
            </div>

            <a href="#" class="feature feature-sm" data-go="about">
                <span class="feature-art">${svgIcon('info')}</span>
                <span class="feature-body">
                    <span class="feature-title">عن البوابة</span>
                    <span class="feature-sub">من يُعدّها، ولمن هي، وكيف تشاركها</span>
                </span>
                <span class="feature-go">${svgIcon('chevron-left')}</span>
            </a>

            <h2 class="list-h">المواضيع</h2>
            <div class="cards" id="topicCards">
                ${GROUPS.map(g => g.items().map(c => renderTopicCard(c, g)).join('')).join('')}
            </div>

            <div class="share-banner">
                <div class="share-banner-text">
                    <strong>شارك البوابة مع أسرتك</strong>
                    <p>أرسل الرابط للأم أو الأب أو الجدّة أو من يعتني بالطفل، ليطّلعوا على نفس المعلومات في أي وقت.</p>
                </div>
                ${renderShareRow('home', 'بوابة تثقيف الأسرة - وحدة جراحة عظام الأطفال', 'دليلكم الشامل لفهم حالات عظام الأطفال وعلاجاتها')}
            </div>

            <p class="disclaimer-note">${svgIcon('info')}<span><strong>تنبيه مهم:</strong> هذا المحتوى للأغراض التعليمية فقط ولا يُغني عن استشارة الطبيب المختص. استشر طبيب طفلك دائماً قبل اتخاذ أي قرارات علاجية.</span></p>
        `;
    }

    function renderTopicCard(c, g) {
        const sections = c.sections || [];
        const hasVideo = sections.some(s => s.type === 'video');
        return `
            <a href="#" class="ccard g-${g.key}" data-go="${c.id}" data-group="${g.key}">
                <span class="ccard-tag">${svgIcon(c.id === 'surgery-guide' ? 'stethoscope' : g.icon)}</span>
                <span class="ccard-title">${c.name}</span>
                ${c.englishName ? `<span class="ccard-en">${c.englishName}</span>` : ''}
                <span class="ccard-meta">${sections.length} ${arCount(sections.length, WORDS.section)}${hasVideo ? `<span class="badge-video">${svgIcon('play')}فيديو</span>` : ''}</span>
            </a>
        `;
    }

    // Group buttons above the topics show one group at a time.
    function bindHomeEvents() {
        $$('.pill[data-filter]').forEach(pill => {
            pill.addEventListener('click', () => {
                const filter = pill.dataset.filter;
                $$('.pill[data-filter]').forEach(p => {
                    p.classList.toggle('on', p === pill);
                    p.setAttribute('aria-pressed', String(p === pill));
                });
                $$('#topicCards .ccard').forEach(card => {
                    card.hidden = filter !== 'all' && card.dataset.group !== filter;
                });
            });
        });
    }

    // ---- Categories Page ----
    function renderCategoriesPage() {
        const row = (c, icon) => `
            <a href="#" class="prow" data-go="${c.id}">
                <span class="prow-n">${svgIcon(icon)}</span>
                <span class="prow-body">
                    <span class="prow-title">${c.name}</span>
                    ${c.englishName ? `<span class="prow-en">${c.englishName}</span>` : ''}
                </span>
                <span class="prow-go">${svgIcon('chevron-left')}</span>
            </a>
        `;
        return `
            ${pageHero({ group: 'care', icon: 'layout-grid', title: 'جميع الأقسام', desc: 'تصفح جميع الحالات والمواضيع المتاحة' })}
            ${GROUPS.map(g => `
                <section class="topic-group g-${g.key}">
                    <h2 class="group-h"><span class="group-dot">${svgIcon(g.icon)}</span>${g.name}</h2>
                    ${subgroupsOf(g).map(([title, list]) => `
                        ${title ? `<h3 class="sub-h">${title}</h3>` : ''}
                        <div class="plist">
                            ${list.map(c => row(c, c.id === 'surgery-guide' ? 'stethoscope' : g.icon)).join('')}
                            ${g.key === 'care' ? row({ id: 'procedures-guide', name: 'تعليمات ما بعد العمليات', englishName: 'Post-op Instructions' }, 'clipboard-list') : ''}
                        </div>
                    `).join('')}
                </section>
            `).join('')}
        `;
    }

    // ---- Condition Page ----
    function renderConditionPage(condition) {
        const sections = condition.sections || [];
        const g = topicGroup(condition.id);
        const html = sections.map(s => s.content).join(' ');
        const facts = [
            ['list-checks', sections.length, WORDS.section],
            ['circle-help', (html.match(/class="faq-item"/g) || []).length, WORDS.faq],
            ['link-2', (html.match(/data-goto="procedures-guide"/g) || []).length, WORDS.link],
            ['images', (html.match(/<img\b/g) || []).length, WORDS.figure]
        ].filter(f => f[1] > 0);
        const shareCtx = {
            page: condition.id,
            title: condition.name,
            subtitle: condition.shortDesc || ''
        };

        return `
            ${pageHero({ group: g.key, icon: g.icon, title: condition.name, en: condition.englishName, desc: condition.shortDesc })}
            <div class="facts">
                ${facts.map(([icon, n, words]) => `<div class="fact">${svgIcon(icon)}<b>${n}</b><span>${arCount(n, words)}</span></div>`).join('')}
            </div>
            <div class="quick-nav">
                <div class="quick-nav-inner">
                    ${sections.map((s, i) => `<button type="button" class="quick-nav-tab${i === 0 ? ' active' : ''}" data-section="section-${i}">${s.title}</button>`).join('')}
                </div>
            </div>
            <div class="condition-content">
                ${sections.map((s, i) => renderSection(s, i, shareCtx)).join('')}
            </div>
            ${condition.source ? `<p class="page-source">${svgIcon('book-open')}<span>المصدر: ${condition.source}</span></p>` : ''}
            <p class="page-source page-credit">${svgIcon('stethoscope')}<span>مراجعة طبية: ${EDITOR.name}، ${EDITOR.role} · آخر تحديث: ${EDITOR.updated} · <a href="#" data-go="about">عن البوابة</a></span></p>
            ${renderCtaBar(condition.id, condition.name, condition.shortDesc || '')}
        `;
    }

    const SECTION_ICONS = {
        'overview': 'book-open', 'causes': 'dna', 'symptoms': 'stethoscope', 'diagnosis': 'scan-search',
        'conservative': 'pill', 'surgical': 'scissors', 'pre-surgery': 'clipboard-list', 'post-surgery': 'bed',
        'rehab': 'dumbbell', 'emergency': 'siren', 'faq': 'circle-help', 'home-care': 'house-plus',
        'when-to-see-doctor': 'triangle-alert', 'video': 'play', 'warning-signs': 'triangle-alert', 'warning': 'triangle-alert',
        'types': 'layers', 'classification': 'layers', 'care': 'heart-handshake', 'daily': 'sun', 'daily-care': 'sun',
        'recovery': 'heart-pulse', 'diaper': 'baby', 'diaper-care': 'baby', 'positions': 'bed', 'positioning': 'bed',
        'mobility': 'accessibility', 'after-removal': 'bandage', 'post-removal': 'bandage', 'timing': 'clock',
        'instructions': 'list-checks', 'dodont': 'circle-check', 'vitaminc': 'citrus', 'sideeffects': 'triangle-alert',
        'summary': 'target', 'remodeling': 'refresh-cw', 'guide-index': 'list',
        'proc-hip': 'bone', 'proc-femur': 'bone', 'proc-neuro': 'brain', 'proc-foot': 'footprints', 'proc-knee': 'bone'
    };
    // Sections about danger signs get the alert colour.
    const ALERT_SECTIONS = ['emergency', 'warning-signs', 'warning', 'when-to-see-doctor', 'sideeffects'];

    function renderSection(section, index, shareCtx) {
        const alert = ALERT_SECTIONS.includes(section.type);
        return `
            <div class="content-section" id="section-${index}">
                <div class="section-header" data-target="section-body-${index}">
                    <span class="section-icon${alert ? ' is-alert' : ''}">${svgIcon(SECTION_ICONS[section.type] || 'book-open')}</span>
                    <h2>${section.title}</h2>
                    ${renderSectionShareBtn(shareCtx, section, index)}
                    <span class="toggle-icon">${svgIcon('chevron-down')}</span>
                </div>
                <div class="section-body" id="section-body-${index}">
                    ${tidyContent(section.content)}
                </div>
            </div>
        `;
    }

    // Content text as shown on a page: emoji become line icons (js/content.js).
    const tidyContent = (html) => window.PortalContent.tidy(html);

    function bindSectionToggles() {
        $$('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const body = document.getElementById(targetId);
                const isOpen = body.classList.contains('open');

                header.classList.toggle('open', !isOpen);
                body.classList.toggle('open', !isOpen);
            });
        });

        // Breadcrumb nav
        $$('.breadcrumb a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(a.dataset.nav || 'home');
            });
        });
    }

    function bindQuickNav() {
        $$('.quick-nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('.quick-nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const targetSection = document.getElementById(tab.dataset.section);
                if (targetSection) {
                    // Open the section
                    const header = targetSection.querySelector('.section-header');
                    const body = targetSection.querySelector('.section-body');
                    if (header && body && !body.classList.contains('open')) {
                        header.classList.add('open');
                        body.classList.add('open');
                    }
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    function bindFAQToggles() {
        $$('.faq-question').forEach(q => {
            q.addEventListener('click', () => {
                const answer = q.nextElementSibling;
                if (answer) answer.classList.toggle('open');
            });
        });
    }

    // ---- Surgery Guide Page ----
    function renderSurgeryGuidePage() {
        return renderConditionPage(Object.assign(surgeryGuideTopic(), {
            shortDesc: 'كل ما تحتاج معرفته للتحضير لعملية طفلك والعناية به بعدها'
        }));
    }

    // ---- Procedure-Specific Post-Op Guide Page ----
    // The list of procedures; choosing one, or arriving from its QR code or a
    // shared link (&section=N), shows that procedure on its own screen.
    function renderProceduresGuidePage() {
        const all = (window.proceduresGuideData || {}).sections || [];
        const requested = parseInt(state.pendingSection, 10);
        if (all[requested] && all[requested].type !== 'guide-index') {
            state.pendingSection = null;
            state.openProcedure = requested;
            return renderProcedure(all[requested], requested);
        }
        state.openProcedure = null;
        const shareCtx = {
            page: 'procedures-guide',
            title: 'تعليمات ما بعد العمليات الجراحية',
            subtitle: 'اختر عملية طفلك واقرأ تعليماتها الخاصة'
        };
        const howTo = all.findIndex(s => s.type === 'guide-index');
        return `
            ${pageHero({ group: 'care', icon: 'clipboard-list', title: 'تعليمات ما بعد العمليات', desc: 'اختاروا عملية طفلكم: الجبس، والأدوية، والمتابعة، والتأهيل' })}
            <div class="plist">
                ${all.map((s, i) => {
                    if (s.type === 'guide-index') return '';
                    const t = splitTitle(s.title);
                    return `
                        <a href="#" class="prow" data-procedure="${i}">
                            <span class="prow-n">${t.n}</span>
                            <span class="prow-body">
                                <span class="prow-title">${t.ar}</span>
                                ${t.en ? `<span class="prow-en">${t.en}</span>` : ''}
                            </span>
                            <span class="prow-go">${svgIcon('chevron-left')}</span>
                        </a>
                    `;
                }).join('')}
            </div>
            ${howTo >= 0 ? `<div class="condition-content guide-help">${renderSection(all[howTo], howTo, shareCtx)}</div>` : ''}
        `;
    }

    function renderProcedure(section, index) {
        const t = splitTitle(section.title);
        return `
            <div class="procedure" id="section-${index}">
                ${pageHero({ group: 'care', number: t.n || String(index), title: t.ar, en: t.en })}
                <div class="section-body open single">${tidyContent(section.content)}</div>
            </div>
            ${renderCtaBar('procedures-guide', `تعليمات ما بعد العمليات الجراحية - ${section.title}`, '', 'أرسلها عبر واتساب', index)}
        `;
    }

    // "6. Arabic name (English name)" -> { n: '6', ar: 'Arabic name', en: 'English name' }
    function splitTitle(title) {
        const m = /^(\d+)\.\s*(.*?)\s*\(([^()]*)\)\s*$/.exec(title);
        return m ? { n: m[1], ar: m[2], en: m[3] } : { n: '', ar: title, en: '' };
    }

    // ---- QR Code Page ----

    // One printable QR card. `section` is the index of a section inside a
    // combined guide page; omit it to point at the whole page.
    function renderQRCard(o) {
        const sectionAttr = (o.section === undefined || o.section === null)
            ? '' : ` data-section="${o.section}"`;
        const shareSection = (o.section === undefined || o.section === null)
            ? '' : ` data-share-section="${o.section}"`;
        // Section titles carry the English name in brackets. Splitting it onto
        // its own line keeps the cards a uniform height so the codes line up,
        // and it stays inside the h3 so printing still includes it.
        const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(o.title);
        const head = m ? m[1] : o.title;
        const sub = m ? m[2] : '';
        return `
            <div class="qr-card" data-condition-id="${esc(o.id)}">
                <h3>${esc(head)}${sub ? `<span class="qr-en">${esc(sub)}</span>` : ''}</h3>
                <canvas class="qr-canvas" data-page="${esc(o.id)}"${sectionAttr}></canvas>
                <div class="qr-actions">
                    <button type="button" class="btn btn-sm btn-primary qr-print" data-id="${esc(o.id)}">${svgIcon('printer')}طباعة</button>
                    <button type="button" class="btn btn-sm btn-share" data-share="sheet"
                            data-share-page="${esc(o.id)}"${shareSection} data-share-title="${esc(o.title)}"
                            data-share-subtitle="${esc(o.subtitle || '')}">${svgIcon('share-2')}مشاركة</button>
                </div>
            </div>
        `;
    }

    // Sections of a combined guide, as individually shareable QR cards. The
    // index section is not a procedure, so it is left out.
    function guideSectionCards(data, page, subtitle) {
        return (data && data.sections ? data.sections : [])
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.type !== 'guide-index')
            .map(({ s, i }) => renderQRCard({
                id: page, section: i, title: s.title, subtitle
            })).join('');
    }

    // The ready-made print packs next to index.html (built by tools/qr).
    const QR_PDFS = [
        ['QR-All-Topics.pdf', 'جميع المواضيع'],
        ['QR-Individual-Topics.pdf', 'صفحة لكل موضوع'],
        ['QR-Clinic-Poster.pdf', 'ملصق العيادة (Poster)'],
        ['QR-Clinic-Cards.pdf', 'بطاقات العيادة'],
        ['QR-Clinic-Table-Card.pdf', 'بطاقة طاولة العيادة']
    ];

    function renderQRPage() {
        const allConditions = getAllConditions();
        const procedureCards = guideSectionCards(
            window.proceduresGuideData, 'procedures-guide',
            'تعليمات ما بعد العملية - بوابة تثقيف الأسرة');
        const surgeryCards = guideSectionCards(
            window.surgeryGuideData, 'surgery-guide',
            'دليل ما قبل وبعد الجراحة - بوابة تثقيف الأسرة');

        return `
            ${pageHero({ group: 'care', icon: 'qr-code', title: 'رموز QR للطباعة', desc: 'امسح الرمز بكاميرا هاتفك للوصول المباشر لكل موضوع' })}
            <div class="info-box tip">
                <div class="info-box-icon">${svgIcon('lightbulb')}</div>
                <div class="info-box-content">
                    <strong>كيفية الاستخدام</strong>
                    <p>اطبع هذه الرموز وضعها في العيادة أو غرف الانتظار ليتمكن المرضى وأسرهم من الوصول للمعلومات بسهولة عبر هواتفهم. كل رمز يفتح موضوعه مباشرةً.</p>
                </div>
            </div>

            <section class="topic-group g-care">
                <h2 class="group-h"><span class="group-dot">${svgIcon('download')}</span>حزم PDF جاهزة للطباعة</h2>
                <p class="group-note">اضغط للتحميل ثم الطباعة مباشرةً للعيادة أو لمشاركة المرضى.</p>
                <div class="plist">
                    ${QR_PDFS.map(([file, name]) => `
                        <a class="prow" href="${file}" download>
                            <span class="prow-n">${svgIcon('file-text')}</span>
                            <span class="prow-body">
                                <span class="prow-title">${name}</span>
                                <span class="prow-en">${file}</span>
                            </span>
                            <span class="prow-go">${svgIcon('download')}</span>
                        </a>
                    `).join('')}
                </div>
            </section>

            <section class="topic-group g-care">
                <h2 class="group-h"><span class="group-dot">${svgIcon('qr-code')}</span>رمز لكل موضوع</h2>
                <div class="qr-grid" id="qrGrid">
                    ${allConditions.map(c => renderQRCard({
                        id: c.id, title: c.name, subtitle: c.shortDesc || ''
                    })).join('')}
                </div>
            </section>

            ${procedureCards ? `
            <section class="topic-group g-care">
                <h2 class="group-h"><span class="group-dot">${svgIcon('clipboard-list')}</span>رمز لكل عملية على حدة</h2>
                <div class="info-box">
                    <div class="info-box-icon">${svgIcon('send')}</div>
                    <div class="info-box-content">
                        <strong>أرسل تعليمات عملية واحدة فقط</strong>
                        <p>كل رمز هنا يفتح تعليمات عمليته مباشرةً دون أن يبحث الأهل داخل الدليل. اطبعه وأرفقه بورقة الخروج، أو اضغط «مشاركة» لإرساله عبر واتساب.</p>
                    </div>
                </div>
                <div class="qr-grid">${procedureCards}</div>
            </section>
            ` : ''}

            ${surgeryCards ? `
            <section class="topic-group g-care">
                <h2 class="group-h"><span class="group-dot">${svgIcon('stethoscope')}</span>أقسام دليل ما قبل وبعد الجراحة</h2>
                <div class="qr-grid">${surgeryCards}</div>
            </section>
            ` : ''}
        `;
    }

    function generateQRCodes() {
        $$('.qr-canvas').forEach(canvasEl => {
            const page = canvasEl.dataset.page;
            // A section-scoped card carries the section index, so the code opens
            // that procedure directly instead of the top of the guide.
            const section = canvasEl.dataset.section;
            // Same builder the share links use, so a scanned code and a shared
            // link always open the identical URL.
            const url = window.PortalShare.buildUrl(page, section);

            // Generate QR code on canvas using built-in generator
            const size = 200;
            canvasEl.width = size;
            canvasEl.height = size;
            canvasEl.style.borderRadius = '12px';
            canvasEl.style.border = '2px solid #D8DEDC';
            canvasEl.dataset.url = url;
            canvasEl.dataset.page = page;
            canvasEl.className = 'qr-image';

            drawQR(canvasEl, url, size);
        });

        // Print individual QR
        $$('.qr-print').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.qr-card');
                const qrEl = card.querySelector('.qr-image');
                const title = card.querySelector('h3').textContent;
                const url = qrEl.dataset.url;
                const imgSrc = qrEl.toDataURL('image/png');
                printQR(imgSrc, title, url);
            });
        });
    }

    // ---- Minimal QR Code Generator (supports alphanumeric URLs) ----
    function drawQR(canvas, text, size) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Use QRCode matrix generation
        const qr = generateQRMatrix(text);
        if (!qr) {
            ctx.fillStyle = '#A4553F';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('QR Error', size / 2, size / 2);
            return;
        }

        const modules = qr.length;
        const cellSize = (size - 20) / modules;
        const offset = 10;

        ctx.fillStyle = '#263540';
        for (let r = 0; r < modules; r++) {
            for (let c = 0; c < modules; c++) {
                if (qr[r][c]) {
                    ctx.fillRect(
                        offset + c * cellSize,
                        offset + r * cellSize,
                        cellSize + 0.5,
                        cellSize + 0.5
                    );
                }
            }
        }
    }

    // QR Code matrix generator (Version 1-6, Error Correction L)
    function generateQRMatrix(data) {
        // Encode data as byte mode
        const dataBytes = [];
        for (let i = 0; i < data.length; i++) {
            const code = data.charCodeAt(i);
            if (code < 128) dataBytes.push(code);
            else if (code < 2048) {
                dataBytes.push(192 | (code >> 6));
                dataBytes.push(128 | (code & 63));
            } else {
                dataBytes.push(224 | (code >> 12));
                dataBytes.push(128 | ((code >> 6) & 63));
                dataBytes.push(128 | (code & 63));
            }
        }

        // Version capacities for byte mode, EC level L
        const versionCapacity = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586];
        let version = 0;
        for (let v = 1; v <= 16; v++) {
            if (dataBytes.length <= versionCapacity[v]) { version = v; break; }
        }
        if (version === 0) return null;

        const size = 17 + version * 4;
        const matrix = Array.from({length: size}, () => Array(size).fill(null));
        const reserved = Array.from({length: size}, () => Array(size).fill(false));

        // Place finder patterns
        function placeFinder(row, col) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const mr = row + r, mc = col + c;
                    if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
                    if (r === -1 || r === 7 || c === -1 || c === 7) {
                        matrix[mr][mc] = false;
                    } else if ((r === 0 || r === 6) || (c === 0 || c === 6)) {
                        matrix[mr][mc] = true;
                    } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
                        matrix[mr][mc] = true;
                    } else {
                        matrix[mr][mc] = false;
                    }
                    reserved[mr][mc] = true;
                }
            }
        }

        placeFinder(0, 0);
        placeFinder(0, size - 7);
        placeFinder(size - 7, 0);

        // Timing patterns
        for (let i = 8; i < size - 8; i++) {
            matrix[6][i] = (i % 2 === 0);
            reserved[6][i] = true;
            matrix[i][6] = (i % 2 === 0);
            reserved[i][6] = true;
        }

        // Alignment patterns for version >= 2
        if (version >= 2) {
            const alignPos = getAlignmentPositions(version);
            for (const r of alignPos) {
                for (const c of alignPos) {
                    if (reserved[r] && reserved[r][c]) continue;
                    for (let dr = -2; dr <= 2; dr++) {
                        for (let dc = -2; dc <= 2; dc++) {
                            const mr = r + dr, mc = c + dc;
                            if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
                            if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
                                matrix[mr][mc] = true;
                            } else {
                                matrix[mr][mc] = false;
                            }
                            reserved[mr][mc] = true;
                        }
                    }
                }
            }
        }

        // Reserve format info areas
        for (let i = 0; i < 8; i++) {
            reserved[8][i] = true;
            reserved[8][size - 1 - i] = true;
            reserved[i][8] = true;
            reserved[size - 1 - i][8] = true;
        }
        reserved[8][8] = true;
        // Dark module
        matrix[size - 8][8] = true;
        reserved[size - 8][8] = true;

        // Reserve version info for version >= 7
        if (version >= 7) {
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 3; j++) {
                    reserved[i][size - 11 + j] = true;
                    reserved[size - 11 + j][i] = true;
                }
            }
        }

        // Encode data
        const ecInfo = getECInfo(version);
        const totalCodewords = ecInfo.totalCodewords;
        const ecCodewordsPerBlock = ecInfo.ecPerBlock;
        const blocks = ecInfo.blocks;

        // Build data bit stream
        const bits = [];
        // Mode indicator: byte = 0100
        bits.push(0, 1, 0, 0);
        // Character count
        const ccBits = version <= 9 ? 8 : 16;
        for (let i = ccBits - 1; i >= 0; i--) bits.push((dataBytes.length >> i) & 1);
        // Data
        for (const b of dataBytes) {
            for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
        }
        // Terminator
        const totalDataBits = (totalCodewords - ecCodewordsPerBlock * blocks.reduce((s, b) => s + b.count, 0)) * 8;
        for (let i = 0; i < 4 && bits.length < totalDataBits; i++) bits.push(0);
        // Pad to byte boundary
        while (bits.length % 8 !== 0) bits.push(0);
        // Pad codewords
        let padByte = 0;
        while (bits.length < totalDataBits) {
            const p = padByte % 2 === 0 ? 0xEC : 0x11;
            for (let i = 7; i >= 0; i--) bits.push((p >> i) & 1);
            padByte++;
        }

        // Convert to bytes
        const dataCodewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
            dataCodewords.push(byte);
        }

        // Generate EC codewords using Reed-Solomon
        const allBlocks = [];
        let offset = 0;
        for (const block of blocks) {
            for (let b = 0; b < block.count; b++) {
                const blockData = dataCodewords.slice(offset, offset + block.dataCodewords);
                offset += block.dataCodewords;
                const ec = reedSolomonEncode(blockData, ecCodewordsPerBlock);
                allBlocks.push({ data: blockData, ec: ec });
            }
        }

        // Interleave
        const finalData = [];
        const maxDataLen = Math.max(...allBlocks.map(b => b.data.length));
        for (let i = 0; i < maxDataLen; i++) {
            for (const block of allBlocks) {
                if (i < block.data.length) finalData.push(block.data[i]);
            }
        }
        for (let i = 0; i < ecCodewordsPerBlock; i++) {
            for (const block of allBlocks) {
                if (i < block.ec.length) finalData.push(block.ec[i]);
            }
        }

        // Convert to bits
        const finalBits = [];
        for (const b of finalData) {
            for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
        }
        // Remainder bits
        const remainderBits = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < (remainderBits[version] || 0); i++) finalBits.push(0);

        // Place data bits
        let bitIdx = 0;
        let upward = true;
        for (let col = size - 1; col >= 0; col -= 2) {
            if (col === 6) col = 5; // skip timing column
            const rows = upward ? Array.from({length: size}, (_, i) => size - 1 - i) : Array.from({length: size}, (_, i) => i);
            for (const row of rows) {
                for (let c = 0; c < 2; c++) {
                    const cc = col - c;
                    if (cc < 0) continue;
                    if (reserved[row][cc]) continue;
                    matrix[row][cc] = bitIdx < finalBits.length ? finalBits[bitIdx] === 1 : false;
                    bitIdx++;
                }
            }
            upward = !upward;
        }

        // Apply mask (mask 0: (row + col) % 2 === 0)
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!reserved[r][c]) {
                    if ((r + c) % 2 === 0) matrix[r][c] = !matrix[r][c];
                }
            }
        }

        // Write format info (mask 0, EC level L)
        const formatBits = getFormatBits(0, 1); // mask 0, ecl L=1
        for (let i = 0; i < 15; i++) {
            const bit = ((formatBits >> (14 - i)) & 1) === 1;
            // Around top-left finder
            if (i < 6) matrix[8][i] = bit;
            else if (i < 8) matrix[8][i + 1] = bit;
            else if (i < 9) matrix[8 - (i - 8)][8] = bit;
            else matrix[14 - i][8] = bit;
            // Around other finders
            if (i < 8) matrix[size - 1 - i][8] = bit;
            else matrix[8][size - 15 + i] = bit;
        }

        // Write version info for version >= 7
        if (version >= 7) {
            const versionBits = getVersionBits(version);
            for (let i = 0; i < 18; i++) {
                const bit = ((versionBits >> i) & 1) === 1;
                const r = Math.floor(i / 3);
                const c = i % 3;
                matrix[r][size - 11 + c] = bit;
                matrix[size - 11 + c][r] = bit;
            }
        }

        return matrix.map(row => row.map(v => v === true));
    }

    function getAlignmentPositions(version) {
        if (version === 1) return [];
        const positions = [
            [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
            [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
            [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74]
        ];
        return positions[version - 1] || [];
    }

    function getECInfo(version) {
        // EC Level L data: [totalCodewords, ecPerBlock, [{count, dataCodewords}]]
        const table = {
            1: { totalCodewords: 26, ecPerBlock: 7, blocks: [{ count: 1, dataCodewords: 19 }] },
            2: { totalCodewords: 44, ecPerBlock: 10, blocks: [{ count: 1, dataCodewords: 34 }] },
            3: { totalCodewords: 70, ecPerBlock: 15, blocks: [{ count: 1, dataCodewords: 55 }] },
            4: { totalCodewords: 100, ecPerBlock: 20, blocks: [{ count: 1, dataCodewords: 80 }] },
            5: { totalCodewords: 134, ecPerBlock: 26, blocks: [{ count: 1, dataCodewords: 108 }] },
            6: { totalCodewords: 172, ecPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }] },
            7: { totalCodewords: 196, ecPerBlock: 20, blocks: [{ count: 2, dataCodewords: 78 }] },
            8: { totalCodewords: 242, ecPerBlock: 24, blocks: [{ count: 2, dataCodewords: 97 }] },
            9: { totalCodewords: 292, ecPerBlock: 30, blocks: [{ count: 2, dataCodewords: 116 }] },
            10: { totalCodewords: 346, ecPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }, { count: 2, dataCodewords: 69 }] },
        };
        return table[version];
    }

    // Reed-Solomon encoder over GF(256)
    function reedSolomonEncode(data, ecCount) {
        // GF(256) log/exp tables
        const exp = new Uint8Array(512);
        const log = new Uint8Array(256);
        let x = 1;
        for (let i = 0; i < 255; i++) {
            exp[i] = x;
            log[x] = i;
            x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
        }
        for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

        // Generator polynomial
        const gen = new Uint8Array(ecCount + 1);
        gen[0] = 1;
        for (let i = 0; i < ecCount; i++) {
            for (let j = ecCount; j >= 1; j--) {
                gen[j] = gen[j] ^ (gen[j - 1] === 0 ? 0 : exp[log[gen[j - 1]] + i]);
            }
        }

        // Division
        const result = new Uint8Array(ecCount);
        const msg = new Uint8Array(data.length + ecCount);
        for (let i = 0; i < data.length; i++) msg[i] = data[i];

        for (let i = 0; i < data.length; i++) {
            const coef = msg[i];
            if (coef !== 0) {
                for (let j = 0; j <= ecCount; j++) {
                    msg[i + j] ^= (gen[j] === 0 ? 0 : exp[log[gen[j]] + log[coef]]);
                }
            }
        }

        for (let i = 0; i < ecCount; i++) result[i] = msg[data.length + i];
        return Array.from(result);
    }

    function getFormatBits(mask, ecl) {
        // ecl: L=1, M=0, Q=3, H=2
        const data = (ecl << 3) | mask;
        let bits = data << 10;
        // BCH(15,5) division by x10+x8+x5+x4+x2+x+1 (0x537)
        for (let i = 4; i >= 0; i--) {
            if (bits & (1 << (i + 10))) bits ^= (0x537 << i);
        }
        bits = (data << 10) | bits;
        // XOR mask
        return bits ^ 0x5412;
    }

    function getVersionBits(version) {
        let bits = version << 12;
        // BCH(18,6) division by x12+x11+x10+x9+x8+x5+x2+1 (0x1F25)
        for (let i = 5; i >= 0; i--) {
            if (bits & (1 << (i + 12))) bits ^= (0x1F25 << i);
        }
        return (version << 12) | bits;
    }

    function printQR(imgSrc, title, url) {
        const win = window.open('', '_blank');
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>QR - ${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    img { border: 10px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    p { color: #666; margin-top: 20px; font-size: 14px; }
                    .url { font-size: 11px; color: #999; word-break: break-all; margin-top: 10px; direction: ltr; }
                    .header { border-bottom: 3px solid #2F6F68; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h2 { color: #2F6F68; font-size: 18px; }
                    .header h3 { color: #5F6E78; font-size: 14px; font-weight: normal; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>بوابة تثقيف الأسرة</h2>
                    <h3>وحدة جراحة عظام الأطفال</h3>
                </div>
                <h1>${title}</h1>
                <img src="${imgSrc}" width="250" height="250">
                <p>امسح رمز QR بكاميرا هاتفك للوصول المباشر لهذا الموضوع</p>
                <div class="url">${url}</div>
                <script>window.onload=function(){setTimeout(function(){window.print();},500);}</script>
            </body>
            </html>
        `);
    }

    // ---- Hash routing ----
    // Hash format: #access=TOKEN&page=somepage
    function getPageFromHash() {
        const hash = window.location.hash;
        if (!hash) return null;
        const params = new URLSearchParams(hash.substring(1));
        return params.get('page') || null;
    }

    function getSectionFromHash() {
        const hash = window.location.hash;
        if (!hash) return null;
        const params = new URLSearchParams(hash.substring(1));
        return params.get('section');
    }

    window.addEventListener('hashchange', () => {
        const page = getPageFromHash();
        const section = getSectionFromHash();
        if (page && (page !== state.currentPage || section !== null)) {
            state.pendingSection = section;
            navigateTo(page);
        }
    });

    // Check initial page from hash (set by access-gate.js)
    if (window.__INITIAL_PAGE__) {
        const initialSection = getSectionFromHash();
        setTimeout(() => {
            state.pendingSection = initialSection;
            navigateTo(window.__INITIAL_PAGE__);
        }, 2000);
    }

    // Expose navigateTo globally for inline usage
    window.navigateTo = navigateTo;

})();
