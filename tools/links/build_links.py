"""Builds the portal's short links: one small page per topic and procedure.

    https://pedortho-family.github.io/cerebral-palsy/
    https://pedortho-family.github.io/post-op/6/
    https://pedortho-family.github.io/cerebral-palsy/?section=8   (one section)

Each page carries the title and description WhatsApp shows in its preview card,
then opens the portal at that page (#access=...&page=...&section=...).
Share links (js/share.js) and the QR PDFs (tools/qr) point here.

The pages are built from the data files and kept in the repository (one folder per
page at the site root, plus post-op/). tools/qr/build_qr_pdfs.py rebuilds them every
time it runs, so after adding or renaming a topic, rebuilding the QR PDFs also
brings the short links up to date. To build them on their own:
    python3 tools/links/build_links.py [out-dir]
404.html at the site root forwards any short link that has no page of its own.
"""
import html
import json
import os
import subprocess
import sys

SITE = "https://pedortho-family.github.io/"
ACCESS_TOKEN = "PedOrtho-Portal-2026"
PORTAL = "بوابة تثقيف الأسرة - وحدة جراحة عظام الأطفال"
CARD = SITE + "images/share-card.png"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT

# Pages that are not in the data files, with what the preview card says.
FIXED = {
    "categories": ("جميع الأقسام", "تصفح جميع الحالات والمواضيع المتاحة"),
    "qr-codes": ("رموز QR للطباعة", "امسح الرمز بكاميرا هاتفك للوصول المباشر لكل موضوع"),
    "surgery-guide": ("دليل ما قبل وبعد الجراحة", "كل ما تحتاج معرفته للتحضير لعملية طفلك والعناية به بعدها"),
    "procedures-guide": ("تعليمات ما بعد العمليات", "اختاروا عملية طفلكم: الجبس، والأدوية، والمتابعة، والتأهيل"),
}

READ_DATA = r"""
    const vm = require('vm'), fs = require('fs'), path = require('path');
    const dir = path.join(process.argv[1], 'js', 'data');
    const ctx = { window: {} }; vm.createContext(ctx);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')))
        vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
    const w = ctx.window;
    const topics = [w.conditionsNeuro, w.conditionsSkeletal, w.conditionsHip, w.conditionsFractures, w.castCareData]
        .flatMap(a => (a || []).map(c => ({ id: c.id, name: c.name, en: c.englishName || '', desc: c.shortDesc || '' })));
    const procedures = w.proceduresGuideData.sections.map((s, i) => ({ i, type: s.type, title: s.title }));
    console.log(JSON.stringify({ topics, procedures }));
"""

PAGE = """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | بوابة تثقيف الأسرة</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ar_SA">
<meta property="og:site_name" content="{portal}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{card}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="بوابة تثقيف الأسرة">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/images/app-icon.svg">
<script>
  var s = new URLSearchParams(location.search).get('section');
  location.replace('/#access={token}&page={page}{section}' + (s !== null ? '&section=' + encodeURIComponent(s) : ''));
</script>
</head>
<body style="font-family:system-ui;text-align:center;padding:40px;background:#F3F5F4;color:#263540">
<p><a href="/#access={token}&page={page}{section}">{title}</a></p>
</body>
</html>
"""


def write_page(path, title, desc, page, section=None):
    url = SITE + path
    folder = os.path.join(OUT, path)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.html"), "w") as f:
        f.write(PAGE.format(title=html.escape(title), desc=html.escape(desc), portal=html.escape(PORTAL),
                            url=url, card=CARD, token=ACCESS_TOKEN, page=page,
                            section="" if section is None else f"&section={section}"))


def split_title(title):
    """'6. Arabic name (English name)' -> ('6', 'Arabic name', 'English name')"""
    head, _, rest = title.partition(". ")
    if not head.isdigit():
        return "", title, ""
    ar, _, en = rest.rpartition(" (")
    return (head, ar, en.rstrip(")")) if ar else (head, rest, "")


def main():
    data = json.loads(subprocess.run(["node", "-e", READ_DATA, ROOT], check=True,
                                     capture_output=True, text=True).stdout)
    count = 0
    for page, (title, desc) in FIXED.items():
        write_page(page + "/", title, desc, page)
        count += 1
    for t in data["topics"]:
        desc = t["desc"] + (f" ({t['en']})" if t["en"] else "")
        write_page(t["id"] + "/", t["name"], desc, t["id"])
        count += 1
    for p in data["procedures"]:
        if p["type"] == "guide-index":
            continue
        n, ar, en = split_title(p["title"])
        desc = "تعليمات ما بعد العملية: الجبس، والأدوية، والمتابعة، والتأهيل" + (f" ({en})" if en else "")
        write_page(f"post-op/{p['i']}/", f"العملية {n or p['i']}: {ar}", desc, "procedures-guide", p["i"])
        count += 1
    print(f"{count} short links written to {OUT}")


if __name__ == "__main__":
    main()
