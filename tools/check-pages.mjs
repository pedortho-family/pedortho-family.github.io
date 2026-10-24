// Opens every page of the portal in headless Chrome at phone size, with every
// section and question open, and reports what a parent would trip over:
//   - the page scrolling sideways, and which element pushes it
//   - content wider than its card, which the card then cuts off
//   - pictures that fail to load
//   - emoji left on screen (pages show line icons instead)
//   - icons that point at a missing symbol
//   - text whose colour is too close to its background (WCAG AA: 4.5:1, or 3:1 for large text)
// It also saves a screenshot of the first screen of each page.
//
// usage: node tools/check-pages.mjs [base-url] [width] [out-dir]
//   base-url defaults to http://localhost:8161/index.html; width to 390
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.argv[2] || 'http://localhost:8161/index.html';
const WIDTH = +(process.argv[3] || 390);
const OUT = process.argv[4] || '';
const TOKEN = 'PedOrtho-Portal-2026';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (OUT) mkdirSync(OUT, { recursive: true });

// Every page: the fixed screens, each topic, the post-op list and each procedure.
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['conditions-neuro', 'conditions-skeletal', 'conditions-hip', 'conditions-fractures', 'cast-care', 'procedures-guide']) {
    vm.runInContext(readFileSync(join(ROOT, 'js/data', f + '.js'), 'utf8'), ctx);
}
const w = ctx.window;
const topics = [].concat(w.conditionsNeuro, w.conditionsSkeletal, w.conditionsHip, w.conditionsFractures, w.castCareData).map((c) => c.id);
const pages = [['home'], ['categories'], ['qr-codes'], ['surgery-guide'], ['procedures-guide'],
    ...topics.map((id) => [id]),
    ...w.proceduresGuideData.sections.map((s, i) => s.type === 'guide-index' ? null : ['procedures-guide', i]).filter(Boolean)];

// A fresh Chrome profile per run, deleted at the end (each one is ~50 MB).
const PROFILE = mkdtempSync(join(tmpdir(), 'pagecheck-'));
const port = 9600 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`,
    `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 50 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true });
const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;

// Runs in the page after everything is opened.
const PROBE = `(async () => {
    const W = innerWidth, issues = { overflow: [], clipped: [], images: [], emoji: [], icons: [], contrast: [] };
    const scrollers = '.pills, .quick-nav, .responsive-table, .share-sheet, .bottom-nav, .cta-bar, .header, .side-nav';

    // sideways scrolling
    if (document.documentElement.scrollWidth > W + 1) {
        for (const el of document.querySelectorAll('#mainContent *')) {
            if (el.closest(scrollers)) continue;
            const r = el.getBoundingClientRect();
            if (r.width && (r.right > W + 1 || r.left < -1)) {
                issues.overflow.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '→' + Math.round(r.right));
                if (issues.overflow.length > 5) break;
            }
        }
        if (!issues.overflow.length) issues.overflow.push('page is ' + document.documentElement.scrollWidth + 'px wide');
    }

    // content wider than its card, so the card cuts it off
    for (const card of document.querySelectorAll('#mainContent .content-section, #mainContent .section-body.single, #mainContent .qr-card, #mainContent .prow')) {
        const box = card.getBoundingClientRect();
        for (const el of card.querySelectorAll('*')) {
            if (el.closest('.responsive-table, .pills, .quick-nav')) continue;
            const r = el.getBoundingClientRect();
            if (r.width && (r.right > box.right + 1 || r.left < box.left - 1)) {
                issues.clipped.push((el.className || el.tagName) + ' by ' + Math.round(Math.max(r.right - box.right, box.left - r.left)) + 'px');
                break;
            }
        }
        if (issues.clipped.length > 5) break;
    }

    // pictures
    const imgs = [...document.querySelectorAll('#mainContent img')];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
    imgs.filter((i) => !i.naturalWidth).forEach((i) => issues.images.push(i.getAttribute('src')));

    // emoji on screen
    const EMOJI = /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u;
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const t = walker.currentNode.textContent;
        if (EMOJI.test(t)) issues.emoji.push(t.trim().slice(0, 40));
    }

    // icons pointing at nothing
    for (const u of document.querySelectorAll('use')) {
        const ref = (u.getAttribute('href') || '').slice(1);
        if (!document.getElementById(ref)) issues.icons.push(ref);
    }

    // contrast of every visible piece of text
    const rgba = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    function background(el) {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url')) return null;   // gradient: skip
            const c = rgba(cs.backgroundColor);
            if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
        }
        let out = { r: 255, g: 255, b: 255, a: 1 };
        for (const l of layers.reverse()) out = over(l, out);
        return out;
    }
    const seen = new Set();
    for (const el of document.querySelectorAll('#app *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden], .hidden, .side-nav, .search-bar, .share-sheet')) continue;
        const bg = background(el);
        if (!bg) continue;
        const fg = over(rgba(cs.color), bg);
        const L1 = lum(fg), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
        const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        if (ratio < need) {
            const key = cs.color + '|' + Math.round(L2 * 1000);
            if (seen.has(key)) continue;
            seen.add(key);
            issues.contrast.push(ratio.toFixed(2) + ' < ' + need + '  ' + (el.className || el.tagName) + '  "' + el.textContent.trim().slice(0, 30) + '"');
        }
    }
    return issues;
})()`;

const OPEN_ALL = `(() => {
    document.querySelectorAll('.section-header:not(.open)').forEach((h) => h.click());
    document.querySelectorAll('.faq-answer').forEach((a) => a.classList.add('open'));
})()`;

const totals = { overflow: 0, clipped: 0, images: 0, emoji: 0, icons: 0, contrast: 0 };
const contrastAll = new Map();
for (const [page, section] of pages) {
    const hash = `#access=${TOKEN}&page=${page}` + (section != null ? `&section=${section}` : '');
    const label = page + (section != null ? ` §${section}` : '');
    await s('Page.navigate', { url: 'about:blank' });
    await sleep(100);
    await s('Page.navigate', { url: BASE + hash });
    await sleep(2900);
    if (OUT) {
        const shot = await s('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(OUT, label.replace(/[ §]+/g, '_') + '.png'), Buffer.from(shot.result.data, 'base64'));
    }
    await evaluate(OPEN_ALL);
    await sleep(400);
    const r = await evaluate(PROBE);
    const lines = [];
    for (const k of Object.keys(totals)) {
        if (!r[k].length) continue;
        totals[k] += r[k].length;
        if (k === 'contrast') r[k].forEach((c) => contrastAll.set(c.split('  "')[0], (contrastAll.get(c.split('  "')[0]) || []).concat(label)));
        else lines.push(`   ${k}: ${r[k].slice(0, 6).join(' | ')}`);
    }
    console.log((lines.length ? '✗ ' : '✓ ') + label + (lines.length ? '\n' + lines.join('\n') : ''));
}
if (contrastAll.size) {
    console.log('\nlow-contrast text (colour pair · where):');
    for (const [k, where] of contrastAll) console.log(`   ${k}   ← ${[...new Set(where)].slice(0, 4).join(', ')}${where.length > 4 ? ' …' : ''}`);
}
console.log(`\n${pages.length} pages at ${WIDTH}px · sideways ${totals.overflow} · cut off ${totals.clipped} · broken pictures ${totals.images} · emoji ${totals.emoji} · missing icons ${totals.icons} · low contrast ${contrastAll.size} kinds`);
ws.close(); chrome.kill();
await sleep(500);
rmSync(PROFILE, { recursive: true, force: true });
