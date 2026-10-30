#!/usr/bin/env python3
"""Builds the five printable QR PDFs in the portal's own design: the same fonts,
colours, icons and card shapes as the website (C2). Each PDF is an HTML page
printed by Chrome, so a change to the site's look is easy to carry over here.

  QR-All-Topics.pdf         conditions; fractures (2 pages); post-op procedures and care guides
  QR-Individual-Topics.pdf  one page per topic, large code
  QR-Clinic-Poster.pdf      wall poster, larger codes: conditions, care guides, fractures, procedures
  QR-Clinic-Cards.pdf       two cut-out cards per page, one per topic
  QR-Clinic-Table-Card.pdf  the same pages as All Topics, under the clinic's heading

Codes hold the short links (tools/qr/qr_common.py topic_url) and are also links
themselves, so a PDF read on a phone opens by tapping; the short-link pages
are rebuilt first (tools/links/build_links.py), and the topic list is checked
against the site before anything is built. The build stops if a page no longer
fits its sheet, so a new topic can never push codes off the paper unnoticed.

Run from anywhere: python3 tools/qr/build_qr_pdfs.py   (QR_OUT=<dir> for a trial set)
"""

import html
import json
import os
import re
import subprocess
import sys
import tempfile

import qrcode

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qr_common import ALL_TOPICS, OUTPUT_DIR, ROOT, check_against_site, topic_url  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SITE_LABEL = "pedortho-family.github.io"

# The website's groups, in its order (js/app.js GROUPS), plus the post-op procedures.
GROUPS = [
    ("neuro", "الأعصاب والعضلات", "brain"),
    ("bone", "العظام والمفاصل", "bone"),
    ("hip", "الورك والمشي", "footprints"),
    ("fracture", "الكسور", "activity"),
    ("care", "أدلة العناية", "heart-handshake"),
]
POSTOP = ("care", "تعليمات ما بعد العمليات", "clipboard-list")
# Fracture pages by region, as on the website (js/app.js REGIONS). Unknown regions go last.
REGIONS = [("upper", "الكسور: الطرف العلوي"), ("lower", "الكسور: الحوض والطرف السفلي"), ("general", "الكسور: معلومات عامة")]


def fracture_blocks(groups):
    """The fractures group split by region: [(key, heading, icon, items), ...]."""
    key, _, ic, items = next(g for g in groups if g[0] == "fracture")
    known = [r for r, _ in REGIONS]
    out = []
    for i, (region, title) in enumerate(REGIONS):
        part = [t for t in items if t.get("region") == region or (i == len(REGIONS) - 1 and t.get("region") not in known)]
        if part:
            out.append((key, title, ic, part))
    return out

READ_SITE = r"""
    const vm = require('vm'), fs = require('fs'), path = require('path');
    const dir = path.join(process.argv[1], 'js', 'data');
    const ctx = { window: {} }; vm.createContext(ctx);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')))
        vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
    const w = ctx.window, pick = (a) => (a || []).map(c => ({ id: c.id, name: c.name, en: c.englishName || '', desc: c.shortDesc || '', region: c.region || '' }));
    console.log(JSON.stringify({ neuro: pick(w.conditionsNeuro), bone: pick(w.conditionsSkeletal), hip: pick(w.conditionsHip),
                                 fracture: pick(w.conditionsFractures), care: pick(w.castCareData) }));
"""


# ---------------------------------------------------------------- pieces

def load_icons():
    """The site's line icons (js/icons.js) as inline SVG, by name."""
    src = open(os.path.join(ROOT, "js", "icons.js")).read()
    return {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="i-([a-z0-9-]+)"[^>]*>(.*?)</symbol>', src)}


ICONS = load_icons()


def icon(name, cls="ic"):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>')


def qr_svg(url):
    """A crisp vector QR code in the site's ink colour."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    qr.add_data(url)
    qr.make(fit=True)
    m = qr.get_matrix()
    n = len(m)
    runs = []
    for y, row in enumerate(m):
        x = 0
        while x < n:
            if row[x]:
                start = x
                while x < n and row[x]:
                    x += 1
                runs.append(f"M{start} {y}h{x - start}v1h-{x - start}z")
            else:
                x += 1
    return (f'<svg class="qr" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            f'<path fill="#263540" d="{"".join(runs)}"/></svg>')


def esc(text):
    return html.escape(text or "")


def topics_by_group():
    """[(group key, name, icon, [topic, ...]), ...] with each topic's short link."""
    site = json.loads(subprocess.run(["node", "-e", READ_SITE, ROOT], check=True,
                                     capture_output=True, text=True).stdout)
    surgery = {"id": "surgery-guide", "name": "دليل ما قبل وبعد الجراحة", "en": "Before and After Surgery",
               "desc": "تعليمات شاملة للتحضير للعمليات الجراحية والعناية بعدها", "icon": "stethoscope"}
    postop = {"id": "procedures-guide", "name": "تعليمات ما بعد العمليات", "en": "Post-op Instructions",
              "desc": "اختاروا عملية طفلكم: الجبس، والأدوية، والمتابعة، والتأهيل", "icon": "clipboard-list"}
    # The small tiles use the short names written for the QR sheets (qr_common);
    # single pages and cards use the website's full names.
    short = {t["id"]: (t["name"], t["en"]) for t in ALL_TOPICS if t.get("section") is None}
    out = []
    for key, name, ic in GROUPS:
        items = site[key]
        if key == "care":
            items = [surgery] + items + [postop]
        for t in items:
            t.setdefault("icon", ic)
            t["url"] = topic_url({"id": t["id"]})
            t["short"], t["short_en"] = short.get(t["id"], (t["name"], t["en"]))
        out.append((key, name, ic, items))
    return out


def procedures():
    out = []
    for t in ALL_TOPICS:
        if t.get("section") is None:
            continue
        out.append({"id": "procedures-guide", "n": t["section"], "name": t["name"], "en": t["en"],
                    "short": t["name"], "short_en": t["en"],
                    "desc": "تعليمات ما بعد العملية: الجبس، والأدوية، والمتابعة، والتأهيل",
                    "url": topic_url(t)})
    return out


# ---------------------------------------------------------------- style

def fonts_css():
    """The site's @font-face rules, pointed at the font files on disk."""
    css = open(os.path.join(ROOT, "css", "fonts.css")).read()
    return css.replace("url('../fonts/", f"url('file://{ROOT}/fonts/")


CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
a { color: inherit; text-decoration: none; }
:root {
  --page: #F3F5F4; --surface: #FCFDFC; --ink: #263540; --ink-2: #5F6E78; --ink-3: #85919A;
  --line: #D8DEDC; --edge: #56636D; --teal: #2F6F68; --deep: #2D5D66; --deep-dark: #1E4148;
  --neuro: #DDE6EF; --neuro-d: #A9BACC; --bone: #EEE5D3; --bone-d: #CBB991; --hip: #DCE8DE; --hip-d: #A7C3AE;
  --fracture: #E4E6E1; --fracture-d: #BCC1B7; --care: #D4E8E5; --care-d: #9BC4BE;
}
body { font-family: 'IBM Plex Sans Arabic', sans-serif; color: var(--ink); direction: rtl; }
.g-neuro { --g: var(--neuro); --g-d: var(--neuro-d); } .g-bone { --g: var(--bone); --g-d: var(--bone-d); }
.g-hip { --g: var(--hip); --g-d: var(--hip-d); } .g-fracture { --g: var(--fracture); --g-d: var(--fracture-d); }
.g-care { --g: var(--care); --g-d: var(--care-d); }
.display { font-family: 'Baloo Bhaijaan 2', 'IBM Plex Sans Arabic', sans-serif; font-weight: 700; }
.ic { width: 1em; height: 1em; stroke-width: 1.8; flex: none; }
.qr { display: block; width: 100%; height: auto; }
.en { direction: ltr; font-family: 'IBM Plex Sans Arabic', sans-serif; color: var(--ink-2); }

.page { width: 210mm; height: 297mm; padding: 11mm 12mm 0; display: flex; flex-direction: column; overflow: hidden; break-after: page; background: #fff; }
.page:last-child { break-after: auto; }

/* the portal's mark: deep teal tile, white bone */
.mark { background: var(--deep); color: #fff; border-radius: 28%; display: grid; place-items: center; flex: none; box-shadow: 0 0.9mm 0 var(--deep-dark); }
.mark .ic { width: 58%; height: 58%; stroke-width: 2; }

/* header of a sheet */
.head { display: flex; align-items: center; gap: 4mm; padding-bottom: 3mm; border-bottom: 0.3mm solid var(--line); margin-bottom: 3mm; }
.head .mark { width: 15mm; height: 15mm; }
.head h1 { font-size: 21pt; line-height: 1.15; }
.head p { font-size: 10pt; color: var(--ink-2); }
.head .grow { flex: 1; }
.head .main-qr { display: flex; align-items: center; gap: 3mm; background: var(--deep); color: #fff; border-radius: 4mm; padding: 2.5mm 3mm; box-shadow: 0 1mm 0 var(--deep-dark); }
.head .main-qr .box { width: 22mm; background: #fff; border-radius: 2mm; padding: 1.4mm; }
.head .main-qr b { display: block; font-size: 11pt; }
.head .main-qr span { font-size: 8pt; color: #CFE0E2; }

/* a group heading, as on the website */
.group-h { display: flex; align-items: center; gap: 2.5mm; font-size: 12pt; margin: 1mm 0 1.8mm; }
.dot { width: 7mm; height: 7mm; border-radius: 50%; background: var(--g); display: grid; place-items: center; font-size: 4.6mm; }

/* topic tiles: the website's two-tone cards with an outline and a soft lower edge */
.tiles { display: grid; gap: 2.6mm; margin-bottom: 2.4mm; }
.tile { background: var(--g); border: 0.4mm solid var(--edge); border-radius: 4mm; box-shadow: 0 1mm 0 var(--g-d);
        padding: 2mm; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; }
.tile .box { width: 100%; background: #fff; border-radius: 2.4mm; padding: 1.5mm; }
.tile .name { font-size: 9pt; line-height: 1.2; margin-top: 1.4mm; }
.tile .en { font-size: 6.4pt; line-height: 1.3; margin-top: 0.4mm; }
.tile .num { width: 7mm; height: 7mm; border-radius: 50%; background: var(--care); border: 0.3mm solid var(--edge); display: grid; place-items: center; font-size: 10pt; margin: -0.5mm auto 1.4mm; }

.tiles .label { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; text-align: center; font-size: 11pt; line-height: 1.25; }
.tiles .label .dot { width: 11mm; height: 11mm; font-size: 6mm; border: 0.4mm solid var(--edge); }

/* how to scan (poster) */
.howto ol { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; counter-reset: step; }
.howto li { counter-increment: step; position: relative; background: var(--surface); border: 0.3mm solid var(--line); border-radius: 4mm;
            padding: 4mm 4mm 4mm 4mm; padding-inline-start: 15mm; display: flex; flex-direction: column; font-size: 9.5pt; color: var(--ink-2); }
.howto li b { font-size: 11.5pt; color: var(--ink); }
.howto li::before { content: counter(step); position: absolute; inset-inline-start: 4mm; top: 4mm; width: 8mm; height: 8mm; border-radius: 50%;
            background: var(--care); display: grid; place-items: center; font-family: 'Baloo Bhaijaan 2', sans-serif; font-weight: 700; font-size: 11pt; color: var(--ink); }

/* footer on every page */
.foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 4mm; padding: 3mm 0 6mm;
        border-top: 0.3mm solid var(--line); font-size: 8pt; color: var(--ink-2); }
.foot .note { display: flex; align-items: center; gap: 1.5mm; }
.foot .note .ic { font-size: 3.6mm; }
.foot .url { direction: ltr; font-weight: 600; color: var(--teal); }

/* one topic per page */
.solo { align-items: center; text-align: center; }
.solo .brand { display: flex; align-items: center; gap: 3mm; align-self: stretch; padding-bottom: 4mm; border-bottom: 0.3mm solid var(--line); }
.solo .brand .mark { width: 11mm; height: 11mm; }
.solo .brand b { font-size: 13pt; }
.solo .brand span { font-size: 9pt; color: var(--ink-2); }
.sticker { width: 34mm; height: 34mm; border-radius: 50%; background: var(--g); border: 0.45mm solid var(--edge);
           box-shadow: 0 1.6mm 0 var(--g-d); display: grid; place-items: center; margin: 10mm 0 6mm; font-size: 16mm; }
.sticker .ic { stroke-width: 1.7; }
.sticker .n { font-size: 17mm; line-height: 1; }
.solo h2 { font-size: 27pt; line-height: 1.2; max-width: 170mm; }
.solo .en { font-size: 12pt; margin-top: 1mm; }
.solo .desc { font-size: 12pt; color: var(--ink-2); max-width: 150mm; margin-top: 3mm; line-height: 1.6; }
.qrcard { background: #fff; border: 0.45mm solid var(--edge); border-radius: 6mm; box-shadow: 0 1.6mm 0 var(--line); padding: 7mm; margin-top: 9mm; }
.solo .qrcard { width: 96mm; }
.scan { display: flex; align-items: center; gap: 2mm; justify-content: center; font-size: 12pt; margin-top: 6mm; }
.scan .ic { font-size: 6mm; color: var(--teal); }
.solo .url { direction: ltr; font-size: 10pt; color: var(--teal); font-weight: 600; margin-top: 1.5mm; }

/* two cut-out cards per page */
.cards { padding: 9mm 14mm 0; }
.cut { flex: 1; display: flex; align-items: center; justify-content: center; }
.card { width: 150mm; height: 128mm; background: var(--g); border: 0.45mm solid var(--edge); border-radius: 7mm; box-shadow: 0 1.6mm 0 var(--g-d);
        padding: 6mm 7mm; display: grid; grid-template-columns: 1fr 64mm; gap: 6mm; align-items: center; }
.card .side { display: flex; flex-direction: column; gap: 2mm; height: 100%; }
.card .brand { display: flex; align-items: center; gap: 2mm; font-size: 9pt; }
.card .brand .mark { width: 8mm; height: 8mm; }
.card .tag { width: 15mm; height: 15mm; border-radius: 50%; background: var(--surface); border: 0.4mm solid var(--edge); display: grid; place-items: center; font-size: 7.5mm; margin-top: auto; }
.card .tag .n { font-size: 8mm; }
.card h3 { font-size: 19pt; line-height: 1.2; }
.card .en { font-size: 9.5pt; }
.card .scan { justify-content: flex-start; font-size: 9.5pt; margin-top: auto; }
.card .box { background: #fff; border-radius: 4mm; padding: 4mm; border: 0.3mm solid var(--line); }
.card .url { direction: ltr; text-align: center; font-size: 8pt; color: var(--teal); font-weight: 600; margin-top: 1.5mm; }
.cutline { display: flex; align-items: center; gap: 2mm; color: var(--ink-3); font-size: 8pt; }
.cutline::before, .cutline::after { content: ''; flex: 1; border-top: 0.35mm dashed var(--ink-3); }
.cutline .ic { font-size: 4mm; }
"""


# ---------------------------------------------------------------- layouts

def foot(page_label=""):
    return (f'<div class="foot"><span class="note">{icon("info")}هذا المحتوى للأغراض التعليمية فقط - استشر طبيب طفلك دائماً</span>'
            f'<span class="url">{SITE_LABEL}{page_label}</span></div>')


def head(title, sub, with_main=True):
    main = ""
    if with_main:
        main = (f'<a class="main-qr" href="{esc(topic_url())}"><div><b class="display">البوابة الرئيسية</b><span>جميع المواضيع</span></div>'
                f'<div class="box">{qr_svg(topic_url())}</div></a>')
    return (f'<div class="head"><div class="mark">{icon("bone")}</div>'
            f'<div class="grow"><h1 class="display">{esc(title)}</h1><p>{esc(sub)}</p></div>{main}</div>')


def tile(t, group, number=False):
    num = f'<div class="num display">{t["n"]}</div>' if number else ""
    return (f'<a class="tile g-{group}" href="{esc(t["url"])}">{num}<div class="box">{qr_svg(t["url"])}</div>'
            f'<div class="name display">{esc(t.get("short", t["name"]))}</div><div class="en">{esc(t.get("short_en", t["en"]))}</div></a>')


def group_block(key, name, ic, items, cols, number=False):
    return (f'<section class="g-{key}"><h2 class="group-h display"><span class="dot">{icon(ic)}</span>{esc(name)}</h2>'
            f'<div class="tiles" style="grid-template-columns: repeat({cols}, 1fr)">'
            + "".join(tile(t, key, number) for t in items) + "</div></section>")


def group_row(key, name, ic, items, cols):
    """A group's tiles with its name in the first box, so the rows sit tight on the page."""
    label = f'<div class="label"><span class="dot">{icon(ic)}</span><b class="display">{esc(name)}</b></div>'
    return (f'<div class="tiles g-{key}" style="grid-template-columns: repeat({cols}, 1fr)">{label}'
            + "".join(tile(t, key) for t in items) + "</div>")


def sheet_pages(groups, procs, title, sub, cols, proc_cols):
    """Conditions on the first page (one row per group), then the fractures (upper
    limb; pelvis, lower limb and general), then the procedures with the care guides."""
    topics = "".join(group_row(k, n, i, items, cols) for k, n, i, items in groups if k not in ("fracture", "care"))
    care = "".join(group_row(k, n, i, items, cols) for k, n, i, items in groups if k == "care")
    pages = [f'<div class="page">{head(title, sub)}{topics}{foot()}</div>']
    blocks = fracture_blocks(groups)
    for chunk in (blocks[:1], blocks[1:]):
        if chunk:
            pages.append(f'<div class="page">{head("الكسور", "امسح رمز الكسر لفتح صفحته مباشرةً", with_main=False)}'
                         + "".join(group_block(k, n, i, items, proc_cols) for k, n, i, items in chunk) + f'{foot()}</div>')
    pages.append(f'<div class="page">{head(POSTOP[1], "رمز لكل عملية: يفتح تعليماتها مباشرةً", with_main=False)}'
                 f'{group_block(POSTOP[0], POSTOP[1], POSTOP[2], procs, proc_cols, number=True)}{care}{foot()}</div>')
    return "".join(pages)


HOWTO = (f'<section class="howto"><h2 class="group-h display"><span class="dot" style="background:var(--care)">{icon("qr-code")}</span>كيف تفتح الموضوع</h2>'
         '<ol><li><b class="display">افتح كاميرا الهاتف</b><span>لا تحتاج إلى أي تطبيق</span></li>'
         '<li><b class="display">وجّهها إلى رمز الموضوع</b><span>يظهر رابط أعلى الشاشة</span></li>'
         '<li><b class="display">اضغط الرابط</b><span>تُفتح الصفحة مباشرةً بالعربية</span></li></ol></section>')


def poster_pages(groups, procs):
    """Larger codes: neuromuscular and bone conditions, then hip and care guides with
    how-to, then fractures, then procedures."""
    p1 = "".join(group_block(k, n, i, items, 5) for k, n, i, items in groups if k in ("neuro", "bone"))
    p2 = "".join(group_block(k, n, i, items, 5) for k, n, i, items in groups if k in ("hip", "care"))
    blocks = fracture_blocks(groups)
    fractures = "".join(
        f'<div class="page">{head("الكسور", "امسح رمز الكسر لفتح صفحته مباشرةً", with_main=False)}'
        + "".join(group_block(k, n, i, items, 5) for k, n, i, items in chunk) + f'{foot()}</div>'
        for chunk in (blocks[:1], blocks[1:]) if chunk)
    return (f'<div class="page">{head("بوابة تثقيف الأسرة", "امسح الرمز بكاميرا هاتفك لفتح الموضوع مباشرةً")}{p1}{foot()}</div>'
            f'<div class="page">{head("بوابة تثقيف الأسرة", "امسح الرمز بكاميرا هاتفك لفتح الموضوع مباشرةً", with_main=False)}{p2}{HOWTO}{foot()}</div>'
            + fractures +
            f'<div class="page">{head(POSTOP[1], "رمز لكل عملية: يفتح تعليماتها مباشرةً", with_main=False)}'
            f'{group_block(POSTOP[0], POSTOP[1], POSTOP[2], procs, 5, number=True)}{foot()}</div>')


def solo_page(t, group, ic, number=None):
    art = f'<span class="n display">{number}</span>' if number is not None else icon(ic)
    link = t["url"].replace("https://", "")
    return (f'<div class="page solo g-{group}">'
            f'<div class="brand"><div class="mark">{icon("bone")}</div><div style="text-align:right"><b class="display">بوابة تثقيف الأسرة</b><br><span>وحدة جراحة عظام الأطفال</span></div></div>'
            f'<div class="sticker">{art}</div><h2 class="display">{esc(t["name"])}</h2><div class="en">{esc(t["en"])}</div>'
            f'<p class="desc">{esc(t.get("desc", ""))}</p>'
            f'<a class="qrcard" href="{esc(t["url"])}">{qr_svg(t["url"])}</a>'
            f'<div class="scan">{icon("qr-code")}امسح الرمز بكاميرا هاتفك لفتح هذه الصفحة</div><div class="url">{esc(link)}</div>'
            f'{foot()}</div>')


def card(t, group, ic, number=None):
    tag = f'<span class="n display">{number}</span>' if number is not None else icon(ic)
    link = t["url"].replace("https://", "")
    return (f'<div class="card g-{group}"><div class="side">'
            f'<div class="brand"><div class="mark">{icon("bone")}</div><b class="display">بوابة تثقيف الأسرة</b></div>'
            f'<div class="tag">{tag}</div><h3 class="display">{esc(t["name"])}</h3><div class="en">{esc(t["en"])}</div>'
            f'<div class="scan">{icon("qr-code")}امسح الرمز بكاميرا هاتفك</div></div>'
            f'<a href="{esc(t["url"])}"><div class="box">{qr_svg(t["url"])}</div><div class="url">{esc(link)}</div></a></div>')


def cards_pages(items):
    pages = []
    for i in range(0, len(items), 2):
        pair = items[i:i + 2]
        inner = f'<div class="cut">{pair[0]}</div>'
        if len(pair) > 1:
            inner += f'<div class="cutline">{icon("scissors")}قصّ هنا</div><div class="cut">{pair[1]}</div>'
        pages.append(f'<div class="page cards">{inner}{foot()}</div>')
    return "".join(pages)


# ---------------------------------------------------------------- build

# A .page is a fixed A4 box that hides what spills out of it, so a page that grows
# loses its last codes without any error. This names such pages on the <html> tag.
MEASURE = """<script>
addEventListener('load', () => document.fonts.ready.then(() => {
  const pages = [...document.querySelectorAll('.page')];
  document.documentElement.dataset.overflow = pages.flatMap((p, i) => p.scrollHeight > p.clientHeight ? [i + 1] : []).join(' ') || 'none';
}));
</script>"""


def check_fits(chrome, page, out_path):
    dom = subprocess.run([*chrome, "--dump-dom", "file://" + page], check=True, capture_output=True, text=True).stdout
    found = re.search(r'data-overflow="([^"]*)"', dom)
    if not found:
        sys.exit(f"Could not measure the pages of {os.path.basename(out_path)}.")
    if found.group(1) != "none":
        sys.exit(f"{os.path.basename(out_path)}: page {found.group(1)} does not fit A4. Move a group to another page.")


def print_pdf(body, out_path, tmp):
    doc = (f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
           f'<style>{fonts_css()}{CSS}</style>{MEASURE}</head><body>{body}</body></html>')
    page = os.path.join(tmp, "page.html")
    open(page, "w").write(doc)
    chrome = [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={tmp}/profile",
              "--allow-file-access-from-files", "--no-pdf-header-footer", "--virtual-time-budget=6000"]
    check_fits(chrome, page, out_path)
    subprocess.run([*chrome, f"--print-to-pdf={out_path}", "file://" + page], check=True, capture_output=True)
    print("Created:", out_path)


def main():
    check_against_site()
    # The short links the codes point to are rebuilt with them, so they match.
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "links", "build_links.py")], check=True)
    groups = topics_by_group()
    procs = procedures()
    home = {"id": "home", "name": "البوابة الرئيسية", "en": "Family Education Portal",
            "desc": "جميع المواضيع: الحالات، والعمليات، والعناية بعد الجراحة", "url": topic_url()}
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        print_pdf(sheet_pages(groups, procs, "رموز QR - جميع المواضيع", "امسح الرمز بكاميرا هاتفك للوصول المباشر", 6, 5),
                  os.path.join(OUTPUT_DIR, "QR-All-Topics.pdf"), tmp)

        solos = [solo_page(home, "care", "house")]
        for key, _, ic, items in groups:
            solos += [solo_page(t, key, t["icon"]) for t in items]
        solos += [solo_page(p, "care", "clipboard-list", number=p["n"]) for p in procs]
        print_pdf("".join(solos), os.path.join(OUTPUT_DIR, "QR-Individual-Topics.pdf"), tmp)

        print_pdf(poster_pages(groups, procs), os.path.join(OUTPUT_DIR, "QR-Clinic-Poster.pdf"), tmp)

        cards = [card(home, "care", "house")]
        for key, _, ic, items in groups:
            cards += [card(t, key, t["icon"]) for t in items]
        cards += [card(p, "care", "clipboard-list", number=p["n"]) for p in procs]
        print_pdf(cards_pages(cards), os.path.join(OUTPUT_DIR, "QR-Clinic-Cards.pdf"), tmp)

        print_pdf(sheet_pages(groups, procs, "بوابة تثقيف الأسرة", "امسح الرمز بكاميرا هاتفك - وحدة جراحة عظام الأطفال", 6, 5),
                  os.path.join(OUTPUT_DIR, "QR-Clinic-Table-Card.pdf"), tmp)


if __name__ == "__main__":
    main()
