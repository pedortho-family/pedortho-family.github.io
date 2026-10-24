/* ============================================
   Parents Education Portal - Main Application
   SPA Router, Search, Navigation, QR Generator
   ============================================ */

(function() {
    'use strict';

    // ---- App State ----
    const state = {
        currentPage: 'home',
        currentTitle: 'بوابة تثقيف الأسرة',
        sideNavOpen: false,
        searchOpen: false,
        // Section index requested by a shared deep link (#...&section=3)
        pendingSection: null
    };

    // ---- DOM Elements ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

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
        renderPage('home');
    });

    // ---- Navigation ----
    function initNavigation() {
        // Menu button
        $('#menuBtn').addEventListener('click', toggleSideNav);
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

        // Header title -> home
        $('#headerTitle').addEventListener('click', () => navigateTo('home'));
    }

    function toggleSideNav() {
        state.sideNavOpen = !state.sideNavOpen;
        $('#sideNav').classList.toggle('open', state.sideNavOpen);
        $('#navOverlay').classList.toggle('active', state.sideNavOpen);
        $('#menuBtn').classList.toggle('active', state.sideNavOpen);
    }

    function closeSideNav() {
        state.sideNavOpen = false;
        $('#sideNav').classList.remove('open');
        $('#navOverlay').classList.remove('active');
        $('#menuBtn').classList.remove('active');
    }

    function navigateTo(page) {
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
        params.delete('section');
        const newHash = '#' + params.toString();
        if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash);
        }
        if (!hasPendingSection) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        closeSearch();
    }

    function updateActiveNav(page) {
        $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
        $$('.bottom-nav-item').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    }

    // ---- Search ----
    function initSearch() {
        $('#searchBtn').addEventListener('click', toggleSearch);
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

    function performSearch(query) {
        const results = [];
        const allConditions = getAllConditions();
        const q = query.toLowerCase();

        allConditions.forEach(c => {
            const nameMatch = c.name.includes(q);
            const altMatch = (c.altNames || []).some(n => n.includes(q));
            const keyMatch = (c.keywords || []).some(k => k.includes(q));
            if (nameMatch || altMatch || keyMatch) {
                results.push(c);
            }
        });

        const container = $('#searchResults');
        if (results.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">لا توجد نتائج</div>';
        } else {
            container.innerHTML = results.map(r => `
                <div class="search-result-item" data-page="${r.id}">
                    <div class="result-icon">${r.icon}</div>
                    <div class="result-text">
                        <h4>${r.name}</h4>
                        <p>${r.shortDesc || ''}</p>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    navigateTo(item.dataset.page);
                });
            });
        }
        container.classList.add('active');
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
        window.addEventListener('scroll', () => {
            btn.classList.toggle('hidden', window.scrollY < 400);
        });
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ---- Sharing ----
    const SVG_SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92" fill="currentColor"/></svg>';
    const SVG_WHATSAPP = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" fill="currentColor"/></svg>';

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

    function initSharing() {
        // Capture phase: a share button nested inside a collapsible section
        // header must not also toggle that section.
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-share]');
            if (!trigger) return;
            e.preventDefault();
            e.stopPropagation();
            window.PortalShare.share({
                target: trigger.dataset.share,
                page: trigger.dataset.sharePage || state.currentPage,
                section: trigger.dataset.shareSection,
                title: trigger.dataset.shareTitle || state.currentTitle,
                subtitle: trigger.dataset.shareSubtitle || ''
            });
        }, true);
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
                bindCategoryEvents();
                break;
            case 'surgery-guide':
                state.currentTitle = 'دليل ما قبل وبعد الجراحة';
                main.innerHTML = renderSurgeryGuidePage();
                bindSectionToggles();
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
                }
                break;
        }
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

    // ---- Home Page ----
    function renderHomePage() {
        const neuro = window.conditionsNeuro || [];
        const skeletal = window.conditionsSkeletal || [];
        const hip = window.conditionsHip || [];
        const fractures = window.conditionsFractures || [];

        return `
            <div class="hero-section">
                <div class="hero-content">
                    <h1>بوابة تثقيف الأسرة</h1>
                    <p class="hero-hospital">وحدة جراحة عظام الأطفال</p>
                    <p>دليلكم الشامل لفهم حالات عظام الأطفال وعلاجاتها الجراحية وغير الجراحية</p>
                    <div class="hero-badge">
                        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>
                        محتوى طبي تعليمي موثوق
                    </div>
                </div>
            </div>

            <div class="disclaimer-banner">
                <div class="disc-icon">⚕️</div>
                <p><strong>تنبيه مهم:</strong> هذا المحتوى للأغراض التعليمية فقط ولا يُغني عن استشارة الطبيب المختص. استشر طبيب طفلك دائماً قبل اتخاذ أي قرارات علاجية.</p>
            </div>

            <div class="share-banner">
                <div class="share-banner-icon">💬</div>
                <div class="share-banner-text">
                    <strong>شارك البوابة مع أسرتك</strong>
                    <p>أرسل الرابط للأم أو الأب أو الجدّة أو من يعتني بالطفل، ليطّلعوا على نفس المعلومات في أي وقت.</p>
                </div>
                ${renderShareRow('home', 'بوابة تثقيف الأسرة - وحدة جراحة عظام الأطفال', 'دليلكم الشامل لفهم حالات عظام الأطفال وعلاجاتها')}
            </div>

            <div class="section-container">
                <div class="section-title">
                    <div class="title-icon cat-neuro">🧠</div>
                    الحالات العصبية والعضلية
                </div>
                <div class="categories-grid">
                    ${neuro.map(c => renderCategoryCard(c, 'cat-neuro')).join('')}
                </div>
            </div>

            <div class="section-container">
                <div class="section-title">
                    <div class="title-icon cat-bone">🦴</div>
                    أمراض العظام والمفاصل
                </div>
                <div class="categories-grid">
                    ${skeletal.map(c => renderCategoryCard(c, 'cat-bone')).join('')}
                </div>
            </div>

            <div class="section-container">
                <div class="section-title">
                    <div class="title-icon cat-hip">🏃</div>
                    أمراض الورك والمشي
                </div>
                <div class="categories-grid">
                    ${hip.map(c => renderCategoryCard(c, 'cat-hip')).join('')}
                </div>
            </div>

            <div class="section-container">
                <div class="section-title">
                    <div class="title-icon cat-fracture">🩹</div>
                    الكسور
                </div>
                <div class="categories-grid">
                    ${fractures.map(c => renderCategoryCard(c, 'cat-fracture')).join('')}
                </div>
            </div>

            <div class="section-container">
                <div class="section-title">
                    <div class="title-icon cat-surgery">📋</div>
                    أدلة مهمة
                </div>
                <div class="categories-grid">
                    <div class="category-card" data-page="surgery-guide">
                        <div class="category-icon cat-surgery">🏥</div>
                        <h3>دليل ما قبل وبعد الجراحة</h3>
                        <p>تعليمات شاملة</p>
                    </div>
                    <div class="category-card" data-page="procedures-guide">
                        <div class="category-icon cat-surgery">🔪</div>
                        <h3>تعليمات ما بعد العمليات</h3>
                        <p>حسب نوع العملية</p>
                    </div>
                    <div class="category-card" data-page="cast-care">
                        <div class="category-icon cat-surgery">🦴</div>
                        <h3>العناية بالجبيرة</h3>
                        <p>بعد الجراحة</p>
                    </div>
                    <div class="category-card" data-page="spica-cast-care">
                        <div class="category-icon cat-hip">👶</div>
                        <h3>الجبيرة الحوضية</h3>
                        <p>دليل العناية الشامل</p>
                    </div>
                    <div class="category-card" data-page="silicone-gel">
                        <div class="category-icon cat-surgery">🩹</div>
                        <h3>جل السيليكون للندبات</h3>
                        <p>وقاية وعلاج</p>
                    </div>
                    <div class="category-card" data-page="qr-codes">
                        <div class="category-icon cat-surgery">📱</div>
                        <h3>رموز QR للطباعة</h3>
                        <p>سهولة الوصول</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCategoryCard(condition, colorClass) {
        return `
            <div class="category-card" data-page="${condition.id}">
                <div class="category-icon ${colorClass}">${condition.icon}</div>
                <h3>${condition.name}</h3>
                <p>${condition.shortDesc || ''}</p>
            </div>
        `;
    }

    function bindHomeEvents() {
        $$('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const page = card.dataset.page;
                if (page) navigateTo(page);
            });
        });
    }

    // ---- Categories Page ----
    function renderCategoriesPage() {
        const groups = [
            { title: '🧠 الحالات العصبية والعضلية', items: window.conditionsNeuro || [], color: 'cat-neuro' },
            { title: '🦴 أمراض العظام والمفاصل', items: window.conditionsSkeletal || [], color: 'cat-bone' },
            { title: '🏃 أمراض الورك والمشي', items: window.conditionsHip || [], color: 'cat-hip' },
            { title: '🩹 الكسور', items: window.conditionsFractures || [], color: 'cat-fracture' }
        ];

        return `
            <div class="condition-header" style="background: linear-gradient(135deg, #0e7490, #155e75);">
                <h1>جميع الأقسام</h1>
                <p class="subtitle">تصفح جميع الحالات والمواضيع المتاحة</p>
                ${renderShareRow('categories', 'جميع الأقسام - بوابة تثقيف الأسرة', 'تصفح جميع الحالات والمواضيع المتاحة')}
            </div>
            <div class="section-container categories-page">
                ${groups.map(g => `
                    <div class="category-group">
                        <div class="group-title">${g.title}</div>
                        ${g.items.map(c => `
                            <div class="condition-list-card" data-page="${c.id}">
                                <div class="card-icon ${g.color}">${c.icon}</div>
                                <div class="card-info">
                                    <h3>${c.name}</h3>
                                    <p>${c.shortDesc || ''}</p>
                                </div>
                                <div class="card-arrow">◀</div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}

                <div class="category-group">
                    <div class="group-title">📋 أدلة الجراحة والعناية</div>
                    <div class="condition-list-card" data-page="surgery-guide">
                        <div class="card-icon cat-surgery">🏥</div>
                        <div class="card-info">
                            <h3>دليل ما قبل وبعد الجراحة</h3>
                            <p>تعليمات شاملة للتحضير للعمليات والعناية بعدها</p>
                        </div>
                        <div class="card-arrow">◀</div>
                    </div>
                    <div class="condition-list-card" data-page="procedures-guide">
                        <div class="card-icon cat-surgery">🔪</div>
                        <div class="card-info">
                            <h3>تعليمات ما بعد العمليات الجراحية</h3>
                            <p>تعليمات مفصّلة لكل عملية: الورك، الفخذ، الركبة، القدم والحالات العصبية</p>
                        </div>
                        <div class="card-arrow">◀</div>
                    </div>
                    <div class="condition-list-card" data-page="cast-care">
                        <div class="card-icon cat-surgery">🦴</div>
                        <div class="card-info">
                            <h3>العناية بالجبيرة بعد الجراحة</h3>
                            <p>تعليمات العناية بالجبيرة وعلامات الخطر والحياة اليومية</p>
                        </div>
                        <div class="card-arrow">◀</div>
                    </div>
                    <div class="condition-list-card" data-page="spica-cast-care">
                        <div class="card-icon cat-hip">👶</div>
                        <div class="card-info">
                            <h3>العناية بالجبيرة الحوضية (البنطلونية)</h3>
                            <p>دليل شامل للعناية بالطفل في الجبيرة الحوضية بعد عملية خلع الورك</p>
                        </div>
                        <div class="card-arrow">◀</div>
                    </div>
                    <div class="condition-list-card" data-page="silicone-gel">
                        <div class="card-icon cat-surgery">🩹</div>
                        <div class="card-info">
                            <h3>جل السيليكون للوقاية من الندبات</h3>
                            <p>دليل شامل للوالدين حول استخدام جل ولصقات السيليكون بعد التئام الجروح</p>
                        </div>
                        <div class="card-arrow">◀</div>
                    </div>
                </div>
            </div>
        `;
    }

    function bindCategoryEvents() {
        $$('.condition-list-card').forEach(card => {
            card.addEventListener('click', () => {
                navigateTo(card.dataset.page);
            });
        });
    }

    // ---- Condition Page ----
    function renderConditionPage(condition) {
        const sections = condition.sections || [];
        const quickNavTabs = sections.map((s, i) => `
            <button class="quick-nav-tab${i === 0 ? ' active' : ''}" data-section="section-${i}">${s.title}</button>
        `).join('');

        const shareCtx = {
            page: condition.id,
            title: condition.name,
            subtitle: condition.shortDesc || ''
        };
        const sectionsHtml = sections.map((s, i) => renderSection(s, i, shareCtx)).join('');

        return `
            <div class="condition-header">
                <div class="breadcrumb">
                    <a href="#" data-nav="home">الرئيسية</a>
                    <span>›</span>
                    <span>${condition.name}</span>
                </div>
                <h1>${condition.name}</h1>
                ${condition.englishName ? `<p class="subtitle">${condition.englishName}</p>` : ''}
                ${condition.badges ? `
                    <div class="condition-badges">
                        ${condition.badges.map(b => `<span class="condition-badge">${b}</span>`).join('')}
                    </div>
                ` : ''}
                ${renderShareRow(condition.id, condition.name, condition.shortDesc || '')}
            </div>

            <div class="quick-nav">
                <div class="quick-nav-inner">
                    ${quickNavTabs}
                </div>
            </div>

            <div class="condition-content">
                ${sectionsHtml}
            </div>
        `;
    }

    function renderSection(section, index, shareCtx) {
        const iconColors = {
            'overview': '#dbeafe',
            'causes': '#fce7f3',
            'symptoms': '#fef3c7',
            'diagnosis': '#e0e7ff',
            'conservative': '#d1fae5',
            'surgical': '#ede9fe',
            'pre-surgery': '#cffafe',
            'post-surgery': '#d1fae5',
            'rehab': '#fef3c7',
            'emergency': '#fee2e2',
            'faq': '#f0f9ff',
            'timing': '#cffafe',
            'instructions': '#dbeafe',
            'dodont': '#fef3c7',
            'vitaminc': '#d1fae5',
            'sideeffects': '#fee2e2',
            'summary': '#ede9fe',
            'types': '#fce7f3',
            'classification': '#fce7f3',
            'daily-care': '#d1fae5',
            'diaper-care': '#fef3c7',
            'positioning': '#cffafe',
            'mobility': '#dbeafe',
            'warning-signs': '#fee2e2',
            'home-care': '#d1fae5',
            'post-removal': '#ede9fe',
            'remodeling': '#ecfdf5',
            'guide-index': '#e0e7ff',
            'proc-hip': '#ede9fe',
            'proc-femur': '#cffafe',
            'proc-neuro': '#fce7f3',
            'proc-foot': '#d1fae5',
            'proc-knee': '#fef3c7',
            'video': '#e0f2fe'
        };

        const sectionIcons = {
            'overview': '📖',
            'causes': '🔬',
            'symptoms': '🩺',
            'diagnosis': '🔍',
            'conservative': '💊',
            'surgical': '🔪',
            'pre-surgery': '📋',
            'post-surgery': '🏥',
            'rehab': '🏋️',
            'emergency': '🚨',
            'faq': '❓',
            'types': '📊',
            'classification': '📊',
            'timing': '⏱️',
            'instructions': '📝',
            'dodont': '✅',
            'vitaminc': '💊',
            'sideeffects': '⚠️',
            'summary': '🎯',
            'daily-care': '🧴',
            'diaper-care': '👶',
            'positioning': '🛏️',
            'mobility': '🚶',
            'warning-signs': '🚨',
            'home-care': '🏠',
            'post-removal': '🔓',
            'remodeling': '🦴',
            'guide-index': '🗂️',
            'proc-hip': '🦴',
            'proc-femur': '🦵',
            'proc-neuro': '🧠',
            'proc-foot': '🦶',
            'proc-knee': '🦵',
            'video': '🎬'
        };

        const bgColor = iconColors[section.type] || '#f0f9ff';
        const icon = sectionIcons[section.type] || '📄';

        return `
            <div class="content-section" id="section-${index}">
                <div class="section-header" data-target="section-body-${index}">
                    <div class="section-icon" style="background: ${bgColor}">${icon}</div>
                    <h2>${section.title}</h2>
                    ${renderSectionShareBtn(shareCtx, section, index)}
                    <svg class="toggle-icon" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor"/></svg>
                </div>
                <div class="section-body" id="section-body-${index}">
                    ${section.content}
                </div>
            </div>
        `;
    }

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
        const guide = window.surgeryGuideData || {};
        const guideShareCtx = {
            page: 'surgery-guide',
            title: 'دليل ما قبل وبعد الجراحة',
            subtitle: 'تعليمات شاملة للتحضير للعمليات الجراحية والعناية بعدها'
        };
        return `
            <div class="condition-header" style="background: linear-gradient(135deg, #059669, #047857);">
                <div class="breadcrumb">
                    <a href="#" data-nav="home">الرئيسية</a>
                    <span>›</span>
                    <span>دليل الجراحة</span>
                </div>
                <h1>دليل ما قبل وبعد الجراحة</h1>
                <p class="subtitle">كل ما تحتاج معرفته للتحضير لعملية طفلك والعناية به بعدها</p>
                ${renderShareRow('surgery-guide', 'دليل ما قبل وبعد الجراحة', 'تعليمات شاملة للتحضير للعمليات الجراحية والعناية بعدها')}
            </div>
            <div class="condition-content">
                ${(guide.sections || []).map((s, i) => renderSection(s, i, guideShareCtx)).join('')}
            </div>
        `;
    }

    // ---- Procedure-Specific Post-Op Guide Page ----
    function renderProceduresGuidePage() {
        const guide = window.proceduresGuideData || {};
        const shareCtx = {
            page: 'procedures-guide',
            title: 'تعليمات ما بعد العمليات الجراحية',
            subtitle: 'اختر عملية طفلك واقرأ تعليماتها الخاصة'
        };
        return `
            <div class="condition-header" style="background: linear-gradient(135deg, #7c3aed, #5b21b6);">
                <div class="breadcrumb">
                    <a href="#" data-nav="home">الرئيسية</a>
                    <span>›</span>
                    <span>تعليمات ما بعد العمليات</span>
                </div>
                <h1>تعليمات ما بعد العمليات الجراحية</h1>
                <p class="subtitle">اختر اسم عملية طفلك: شرح العملية، الإقامة، الأدوية، الجبيرة، المتابعة، التأهيل والأجهزة</p>
                ${renderShareRow('procedures-guide', 'تعليمات ما بعد العمليات الجراحية', 'تعليمات مفصّلة لكل عملية على حدة')}
            </div>
            <div class="condition-content">
                ${(guide.sections || []).map((s, i) => renderSection(s, i, shareCtx)).join('')}
            </div>
        `;
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
                <h3>${o.icon ? o.icon + ' ' : ''}${esc(head)}${sub ? `<span class="qr-en">${esc(sub)}</span>` : ''}</h3>
                <canvas class="qr-canvas" data-page="${esc(o.id)}"${sectionAttr}></canvas>
                <div class="qr-actions">
                    <button class="btn btn-sm btn-primary qr-print" data-id="${esc(o.id)}">🖨️ طباعة</button>
                    <button type="button" class="btn btn-sm btn-share" data-share="sheet"
                            data-share-page="${esc(o.id)}"${shareSection} data-share-title="${esc(o.title)}"
                            data-share-subtitle="${esc(o.subtitle || '')}">🔗 مشاركة</button>
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

    function renderQRPage() {
        const allConditions = getAllConditions();
        const procedureCards = guideSectionCards(
            window.proceduresGuideData, 'procedures-guide',
            'تعليمات ما بعد العملية - بوابة تثقيف الأسرة');
        const surgeryCards = guideSectionCards(
            window.surgeryGuideData, 'surgery-guide',
            'دليل ما قبل وبعد الجراحة - بوابة تثقيف الأسرة');

        return `
            <div class="condition-header" style="background: linear-gradient(135deg, #7c3aed, #5b21b6);">
                <h1>رموز QR للطباعة</h1>
                <p class="subtitle">امسح الرمز بكاميرا هاتفك للوصول المباشر لكل موضوع</p>
            </div>
            <div class="section-container">
                <div class="info-box tip">
                    <div class="info-box-icon">💡</div>
                    <div class="info-box-content">
                        <strong>كيفية الاستخدام</strong>
                        <p>اطبع هذه الرموز وضعها في العيادة أو غرف الانتظار ليتمكن المرضى وأسرهم من الوصول للمعلومات بسهولة عبر هواتفهم. كل رمز يفتح موضوعه مباشرةً.</p>
                    </div>
                </div>
                <div class="info-box success" style="margin-bottom: 1.5rem;">
                    <div class="info-box-icon">📥</div>
                    <div class="info-box-content">
                        <strong>حزم PDF جاهزة للطباعة</strong>
                        <p style="margin-bottom: 0.75rem;">هذه ملفات PDF جاهزة - اضغط للتحميل ثم الطباعة مباشرةً للعيادة أو لمشاركة المرضى:</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            <a href="QR-All-Topics.pdf" download class="btn btn-sm btn-primary">📄 جميع المواضيع - صفحتان</a>
                            <a href="QR-Individual-Topics.pdf" download class="btn btn-sm btn-primary">📚 صفحة لكل موضوع</a>
                            <a href="QR-Clinic-Poster.pdf" download class="btn btn-sm btn-primary">🪧 ملصق العيادة (Poster)</a>
                            <a href="QR-Clinic-Cards.pdf" download class="btn btn-sm btn-primary">🃏 بطاقات العيادة</a>
                            <a href="QR-Clinic-Table-Card.pdf" download class="btn btn-sm btn-primary">📇 بطاقة طاولة العيادة - وجهان</a>
                        </div>
                    </div>
                </div>
                <div class="qr-grid" id="qrGrid">
                    ${allConditions.map(c => renderQRCard({
                        id: c.id, icon: c.icon, title: c.name, subtitle: c.shortDesc || ''
                    })).join('')}
                </div>

                ${procedureCards ? `
                <div class="section-title">
                    <div class="title-icon cat-surgery">🔪</div>
                    رمز لكل عملية على حدة
                </div>
                <div class="info-box">
                    <div class="info-box-icon">📩</div>
                    <div class="info-box-content">
                        <strong>أرسل تعليمات عملية واحدة فقط</strong>
                        <p>كل رمز هنا يفتح تعليمات عمليته مباشرةً دون أن يبحث الأهل داخل الدليل. اطبعه وأرفقه بورقة الخروج، أو اضغط «مشاركة» لإرساله عبر واتساب.</p>
                    </div>
                </div>
                <div class="qr-grid">${procedureCards}</div>
                ` : ''}

                ${surgeryCards ? `
                <div class="section-title">
                    <div class="title-icon cat-surgery">📋</div>
                    أقسام دليل ما قبل وبعد الجراحة
                </div>
                <div class="qr-grid">${surgeryCards}</div>
                ` : ''}
            </div>
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
            canvasEl.style.border = '2px solid #e2e8f0';
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
            ctx.fillStyle = '#ef4444';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('QR Error', size / 2, size / 2);
            return;
        }

        const modules = qr.length;
        const cellSize = (size - 20) / modules;
        const offset = 10;

        ctx.fillStyle = '#1e293b';
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
                    .header { border-bottom: 3px solid #0891b2; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h2 { color: #0891b2; font-size: 18px; }
                    .header h3 { color: #475569; font-size: 14px; font-weight: normal; }
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
