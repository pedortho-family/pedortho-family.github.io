// Opens every QR-code link in a real (headless) Chrome and checks it lands on
// the right page and, for procedure links, the right section.
// Printed QR codes and links already sent to families depend on this.
//
// usage: node tools/check-links.mjs [base-url]
//   base-url defaults to http://localhost:8161/index.html (launch config "parents-education")
// The topic list comes from tools/qr/qr_common.py, the same list the QR PDFs use.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.argv[2] || 'http://localhost:8161/index.html';
const TOKEN = 'PedOrtho-Portal-2026';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const topics = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools/qr')
import qr_common
print(json.dumps([{k: t.get(k) for k in ('id', 'section', 'match', 'en')} for t in qr_common.ALL_TOPICS]))
`], { cwd: ROOT, encoding: 'utf8' }));

const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'linkcheck-'))}`, 'about:blank'], { stdio: 'ignore' });
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
await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

// Runs inside the page: what did this link open?
const probe = (t) => `(() => {
    const t = ${JSON.stringify(t)};
    const main = document.getElementById('mainContent');
    const h1 = main && main.querySelector('h1');
    const page = new URLSearchParams(location.hash.slice(1)).get('page');
    const out = { gate: !!document.getElementById('access-gate'), page, h1: h1 ? h1.textContent.trim() : '' };
    const all = [].concat(window.conditionsNeuro || [], window.conditionsSkeletal || [], window.conditionsHip || [],
                          window.conditionsFractures || [], window.castCareData || []);
    const data = all.find((c) => c.id === t.id);
    out.expectH1 = data ? data.name : null;
    if (t.section !== null && t.section !== undefined) {
        const sec = document.getElementById('section-' + t.section);
        out.sectionFound = !!sec;
        // A topic section has its own heading; a post-op procedure opens as its own page with a hero.
        out.sectionText = sec ? (sec.querySelector('.section-header h2') || sec.querySelector('.hero') || sec).textContent.replace(/\\s+/g, ' ').trim() : '';
        out.sectionVisible = !!(sec && sec.offsetParent !== null && sec.getBoundingClientRect().height > 0);
    }
    return out;
})()`;

let failures = 0;
for (const t of topics) {
    const hash = `#access=${TOKEN}&page=${t.id}` + (t.section != null ? `&section=${t.section}` : '');
    await s('Page.navigate', { url: 'about:blank' });
    await sleep(100);
    await s('Page.navigate', { url: BASE + hash });
    await sleep(2900);
    const r = (await s('Runtime.evaluate', { expression: probe(t), returnByValue: true })).result.result.value;
    const problems = [];
    if (r.gate) problems.push('access gate shown');
    if (r.page !== t.id) problems.push(`page is "${r.page}"`);
    if (!r.h1) problems.push('no page title');
    if (r.expectH1 && r.h1 !== r.expectH1) problems.push(`title "${r.h1}" ≠ "${r.expectH1}"`);
    if (t.section != null) {
        if (!r.sectionFound) problems.push(`section ${t.section} missing`);
        else if (!r.sectionVisible) problems.push(`section ${t.section} not shown`);
        if (t.match && !r.sectionText.includes(t.match)) problems.push(`section ${t.section} is "${r.sectionText.slice(0, 80)}"`);
    }
    const label = t.id + (t.section != null ? ` §${t.section}` : '');
    console.log(problems.length ? `✗ ${label}: ${problems.join('; ')}` : `✓ ${label}`);
    failures += problems.length ? 1 : 0;
}
console.log(`\n${topics.length - failures}/${topics.length} links open the right place`);
ws.close(); chrome.kill();
process.exit(failures ? 1 : 0);
