/* ============================================
   Parents Education Portal - Content display
   How the text in js/data/*.js is shown on a page. Shared by the app and
   the local review page (_review.html), so both show the same thing.
   ============================================ */

(function () {
    'use strict';

    // The text files keep their emoji; pages show line icons instead.
    // A message box gets the icon of its emoji when one matches, else of its kind.
    // ⚠️ ✅ ❌ inside text become small inline icons; any other emoji is dropped.
    const EMOJI_ICONS = {
        '🚨': 'siren', '⚠': 'triangle-alert', '💡': 'lightbulb', '✅': 'circle-check', '❌': 'x', '🎯': 'target',
        '📅': 'calendar', '📋': 'clipboard-list', '🔗': 'link-2', '🏋': 'dumbbell', '🍼': 'baby', '👶': 'baby'
    };
    const BOX_ICONS = { danger: 'siren', warning: 'triangle-alert', tip: 'lightbulb', success: 'circle-check' };
    const INLINE_ICONS = { '⚠': ['triangle-alert', 'is-alert'], '✅': ['circle-check', 'is-ok'], '❌': ['x', 'is-no'] };
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s?/gu;

    function tidyContent(html) {
        return html
            .replace(/(<div class="info-box\s*([a-z-]*)[^"]*">\s*)<div class="info-box-icon">([^<]*)<\/div>/g, (m, open, kind, emoji) => {
                const key = Object.keys(EMOJI_ICONS).find(k => emoji.includes(k));
                return `${open}<div class="info-box-icon">${window.icon(key ? EMOJI_ICONS[key] : (BOX_ICONS[kind] || 'info'))}</div>`;
            })
            .replace(EMOJI, (m) => {
                const key = Object.keys(INLINE_ICONS).find(k => m.startsWith(k));
                return key ? window.icon(INLINE_ICONS[key][0], 'inline-ic ' + INLINE_ICONS[key][1]) : '';
            });
    }

    window.PortalContent = { tidy: tidyContent };
})();
