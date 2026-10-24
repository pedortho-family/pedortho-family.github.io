"""Shared topic list, links and text helpers for the printable QR PDFs.

Both generators read the topics from here so the five PDFs always carry the
same set. check_against_site() compares the list with the portal's own data
files and stops the build when a page is missing, renamed, or a procedure has
moved to a different section number.
"""

import io
import json
import os
import subprocess
from urllib.parse import urlencode

import arabic_reshaper
import qrcode
from bidi.algorithm import get_display
from fontTools.ttLib import TTFont as FTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---- Paths and links ----
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# The PDFs sit next to index.html, where the QR page links them. Set QR_OUT
# to write a trial set somewhere else.
OUTPUT_DIR = os.environ.get("QR_OUT", ROOT)

BASE_URL = "https://pedortho-family.github.io/"
ACCESS_TOKEN = "PedOrtho-Portal-2026"


def topic_url(item=None):
    """Same short link the site's share buttons and on-screen QR codes use (js/share.js):
    /cerebral-palsy/, a post-op procedure /post-op/6/, the portal itself /."""
    if not item or not item.get("id"):
        return BASE_URL
    if item["id"] == "procedures-guide" and item.get("section") is not None:
        return f"{BASE_URL}post-op/{item['section']}/"
    return f"{BASE_URL}{item['id']}/"


# ---- Fonts ----
# SF Arabic has no Latin letters ("QR" printed as a box), so any character it
# lacks is drawn in Helvetica instead.
AR_FONT_FILE = "/System/Library/Fonts/SFArabic.ttf"
AR_BOLD_FILE = "/System/Library/Fonts/SFArabicRounded.ttf"
pdfmetrics.registerFont(TTFont("Arabic", AR_FONT_FILE))
pdfmetrics.registerFont(TTFont("ArabicBold", AR_BOLD_FILE))
_AR_CMAP = set(FTFont(AR_FONT_FILE).getBestCmap())
LATIN_FALLBACK = {"Arabic": "Helvetica", "ArabicBold": "Helvetica-Bold"}


def ar(text):
    return get_display(arabic_reshaper.reshape(text))


def _runs(text, font):
    """Split visual-order text into (chunk, font) runs by glyph coverage."""
    fallback = LATIN_FALLBACK.get(font)
    runs = []
    for ch in ar(text):
        f = font if (fallback is None or ord(ch) in _AR_CMAP) else fallback
        if runs and runs[-1][1] == f:
            runs[-1][0] += ch
        else:
            runs.append([ch, f])
    return runs


def text_width(c, text, font, size):
    return sum(c.stringWidth(s, f, size) for s, f in _runs(text, font))


def draw_text(c, x, y, text, font, size):
    for s, f in _runs(text, font):
        c.setFont(f, size)
        c.drawString(x, y, s)
        x += c.stringWidth(s, f, size)


def draw_centered(c, cx, y, text, font, size):
    draw_text(c, cx - text_width(c, text, font, size) / 2, y, text, font, size)


def draw_right(c, right_x, y, text, font, size):
    draw_text(c, right_x - text_width(c, text, font, size), y, text, font, size)


def fit_size(c, text, font, size, max_w, min_size):
    """Largest size from `size` down to `min_size` that fits in max_w."""
    while size > min_size and text_width(c, text, font, size) > max_w:
        size -= 0.25
    return size


def make_qr(data, ecc=qrcode.constants.ERROR_CORRECT_M):
    qr = qrcode.QRCode(version=None, error_correction=ecc, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="#263540", back_color="white").get_image().save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


# ---- Topics ----
CAT_STYLES = {
    "neuro":     {"name": "الحالات العصبية والعضلية", "color": HexColor("#3D6378"), "bg": HexColor("#DDE6EF")},
    "bone":      {"name": "أمراض العظام والمفاصل",    "color": HexColor("#85652A"), "bg": HexColor("#EEE5D3")},
    "fracture":  {"name": "الكسور",                   "color": HexColor("#56636D"), "bg": HexColor("#E4E6E1")},
    "guide":     {"name": "أدلة العناية",              "color": HexColor("#3F7A55"), "bg": HexColor("#DCE8DE")},
    "procedure": {"name": "تعليمات ما بعد العمليات",   "color": HexColor("#2D5D66"), "bg": HexColor("#D4E8E5")},
}

# Procedure items point at one section of the post-op guide. `match` is text
# from that section's title on the site; the check fails if it is not there.
CATEGORIES = [
    {"key": "neuro", "topics": [
        {"id": "cerebral-palsy",           "name": "الشلل الدماغي",        "en": "Cerebral Palsy"},
        {"id": "spina-bifida",             "name": "الصلب المشقوق",        "en": "Spina Bifida"},
        {"id": "charcot-marie-tooth",      "name": "شاركو-ماري-توث",      "en": "CMT"},
        {"id": "neuromuscular-conditions", "name": "أمراض عصبية عضلية",   "en": "Neuromuscular"},
    ]},
    {"key": "bone", "topics": [
        {"id": "osteogenesis-imperfecta", "name": "تكوّن العظم الناقص",   "en": "Osteogenesis Imperfecta"},
        {"id": "clubfoot",                "name": "القدم الحنفاء",        "en": "Clubfoot"},
        {"id": "ddh",                     "name": "خلع الورك التطوري",    "en": "DDH"},
        {"id": "flatfoot",                "name": "القدم المسطحة",        "en": "Flatfoot"},
        {"id": "talocalcaneal-coalition", "name": "الالتحام الرَّصغي",     "en": "Tarsal Coalition"},
        {"id": "perthes",                 "name": "مرض بيرثيز",           "en": "Perthes Disease"},
        {"id": "scfe",                    "name": "انزلاق رأس الفخذ",     "en": "SCFE"},
        {"id": "toe-walking",             "name": "المشي على الأصابع",     "en": "Toe Walking"},
        {"id": "in-toeing",               "name": "انحراف القدمين للداخل", "en": "In-toeing"},
        {"id": "arthrogryposis",          "name": "تيبّس المفاصل الخلقي",  "en": "Arthrogryposis"},
    ]},
    {"key": "fracture", "topics": [
        {"id": "clavicle-fracture", "name": "كسر الترقوة", "en": "Clavicle Fracture"},
        {"id": "proximal-humerus-fracture", "name": "كسر أعلى العضد", "en": "Proximal Humerus"},
        {"id": "humeral-shaft-fracture", "name": "كسر جسم العضد", "en": "Humeral Shaft"},
        {"id": "supracondylar-fracture", "name": "كسر فوق اللقمة", "en": "Supracondylar Fracture"},
        {"id": "lateral-condyle-fracture", "name": "كسر اللقمة الوحشية", "en": "Lateral Condyle Fx"},
        {"id": "medial-epicondyle-fracture", "name": "كسر النتوء الإنسي", "en": "Medial Epicondyle Fx"},
        {"id": "elbow-dislocation", "name": "خلع المرفق", "en": "Elbow Dislocation"},
        {"id": "olecranon-fracture", "name": "كسر الزُّج", "en": "Olecranon Fracture"},
        {"id": "radial-head-neck-fracture", "name": "كسر رأس الكعبرة", "en": "Radial Head/Neck Fx"},
        {"id": "monteggia-fracture", "name": "كسر مونتيجيا", "en": "Monteggia Fracture"},
        {"id": "forearm-fractures", "name": "كسور الساعد", "en": "Forearm Fractures"},
        {"id": "distal-radius-fracture", "name": "كسر أسفل الكعبرة", "en": "Distal Radius"},
        {"id": "buckle-fracture", "name": "الكسر الانبعاجي", "en": "Buckle Fracture"},
        {"id": "scaphoid-fracture", "name": "كسر العظم الزورقي", "en": "Scaphoid Fracture"},
        {"id": "metacarpal-fracture", "name": "كسور مشط اليد", "en": "Metacarpal Fractures"},
        {"id": "pelvic-avulsion-fracture", "name": "كسر قلعي بالحوض", "en": "Pelvic Avulsion"},
        {"id": "femur-fractures", "name": "كسور عظم الفخذ", "en": "Femur Fractures"},
        {"id": "distal-femur-fracture", "name": "كسر أسفل الفخذ", "en": "Distal Femur Fracture"},
        {"id": "tibial-spine-fracture", "name": "كسر شوكة الظنبوب", "en": "Tibial Spine Fracture"},
        {"id": "tibial-tubercle-fracture", "name": "كسر حدبة الظنبوب", "en": "Tibial Tubercle Fx"},
        {"id": "tibia-fractures", "name": "كسور عظم الساق", "en": "Tibia Fractures"},
        {"id": "toddler-fracture", "name": "كسر الطفل الدارج", "en": "Toddler's Fracture"},
        {"id": "ankle-fracture", "name": "كسور الكاحل", "en": "Ankle Fractures"},
        {"id": "transitional-ankle-fracture", "name": "كسر كاحل انتقالي", "en": "Tillaux & Triplane"},
        {"id": "calcaneus-fracture", "name": "كسر عظم الكعب", "en": "Heel Bone Fracture"},
        {"id": "midfoot-fracture", "name": "كسور منتصف القدم", "en": "Midfoot Fractures"},
        {"id": "metatarsal-fracture", "name": "كسور مشط القدم", "en": "Metatarsal Fractures"},
        {"id": "growth-plate-fracture", "name": "كسور صفيحة النمو", "en": "Growth Plate Fractures"},
        {"id": "greenstick-fracture", "name": "كسر الغصن الأخضر", "en": "Greenstick Fracture"},
        {"id": "fracture-remodeling", "name": "إعادة تشكل الكسور", "en": "Fracture Remodeling"},
    ]},
    {"key": "guide", "topics": [
        {"id": "surgery-guide",    "name": "دليل الجراحة",            "en": "Surgery Guide"},
        {"id": "procedures-guide", "name": "تعليمات ما بعد العمليات",  "en": "Post-op Instructions (all)"},
        {"id": "cast-care",        "name": "العناية بالجبيرة",         "en": "Cast Care"},
        {"id": "spica-cast-care",  "name": "الجبيرة الحوضية",          "en": "Spica Cast Care"},
        {"id": "silicone-gel",     "name": "جل السيليكون للندبات",    "en": "Silicone Gel for Scars"},
    ]},
    {"key": "procedure", "topics": [
        {"section": 1,  "name": "الرد المغلق لخلع الورك",          "en": "DDH Closed Reduction",              "match": "DDH Closed Reduction"},
        {"section": 2,  "name": "الرد المفتوح وقطع الحوض",         "en": "DDH Open Reduction + Pelvic Osteotomy", "match": "DDH Open Reduction"},
        {"section": 3,  "name": "قطع عظم الحوض",                  "en": "Pelvic Osteotomy",                  "match": "Pelvic Osteotomy Alone"},
        {"section": 4,  "name": "تثبيت انزلاق رأس الفخذ",          "en": "SCFE Screw Fixation",               "match": "SCFE Screw Fixation"},
        {"section": 5,  "name": "قطع أعلى الفخذ بالشريحة",         "en": "Proximal Femoral Osteotomy",        "match": "Proximal Femoral Osteotomy"},
        {"section": 6,  "name": "إعادة بناء الورك العصبي",         "en": "Neuromuscular Hip Reconstruction",  "match": "Neuromuscular Hip Reconstruction"},
        {"section": 7,  "name": "توجيه نمو أعلى الفخذ",            "en": "Proximal Femur Guided Growth",      "match": "Proximal Femur Guided Growth"},
        {"section": 8,  "name": "استئصال أعلى عظم الفخذ",          "en": "Proximal Femoral Resection",        "match": "Proximal Femoral Resection"},
        {"section": 9,  "name": "إطالة الأنسجة الرخوة",            "en": "Soft Tissue Releases",              "match": "Soft Tissue Releases"},
        {"section": 10, "name": "دعامة تحت الكاحل وإطالة السمانة",  "en": "Subtalar Arthroereisis",            "match": "Subtalar Arthroereisis"},
        {"section": 11, "name": "دمج مفاصل القدم",                 "en": "Foot Fusion",                       "match": "Foot Fusion"},
        {"section": 12, "name": "توجيه نمو الركبة بالشريحة",        "en": "Knee Guided Growth (8-Plate)",      "match": "Knee Guided Growth"},
        {"section": 13, "name": "إطالة وتر أخيل",                  "en": "Achilles Tendon Lengthening",       "match": "Achilles Tendon Lengthening"},
        {"section": 14, "name": "بضع وتر أخيل للقدم الحنفاء",       "en": "Clubfoot Tenotomy",                 "match": "Clubfoot Percutaneous Tenotomy"},
        {"section": 15, "name": "جراحة القدم الحنفاء",             "en": "Clubfoot Reconstruction",           "match": "Clubfoot Releases"},
    ]},
]

for _cat in CATEGORIES:
    for _t in _cat["topics"]:
        _t["cat_key"] = _cat["key"]
        if _cat["key"] == "procedure":
            _t["id"] = "procedures-guide"

ALL_TOPICS = [t for cat in CATEGORIES for t in cat["topics"]]


def check_against_site():
    """Stop if the list above no longer matches the portal's data files."""
    script = r"""
        const vm = require('vm'), fs = require('fs'), path = require('path');
        const dir = path.join(process.argv[1], 'js', 'data');
        const ctx = { window: {} }; vm.createContext(ctx);
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')))
            vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
        const w = ctx.window;
        const pages = [w.conditionsNeuro, w.conditionsSkeletal, w.conditionsHip,
                       w.conditionsFractures, w.castCareData]
            .flatMap(a => (a || []).map(c => c.id))
            .concat(['surgery-guide', 'procedures-guide']);
        const sections = w.proceduresGuideData.sections.map(s => ({ type: s.type, title: s.title }));
        console.log(JSON.stringify({ pages, sections }));
    """
    site = json.loads(subprocess.run(["node", "-e", script, ROOT], check=True,
                                     capture_output=True, text=True).stdout)
    problems = []
    listed = {t["id"] for t in ALL_TOPICS}
    for page in site["pages"]:
        if page not in listed:
            problems.append(f"site page not in the QR list: {page}")
    for t in ALL_TOPICS:
        if t["id"] not in site["pages"]:
            problems.append(f"QR list page not on the site: {t['id']}")
    procedure_sections = {i for i, s in enumerate(site["sections"]) if s["type"] != "guide-index"}
    listed_sections = {t["section"] for t in ALL_TOPICS if t.get("section") is not None}
    for i in sorted(procedure_sections - listed_sections):
        problems.append(f"post-op section {i} not in the QR list: {site['sections'][i]['title']}")
    for t in ALL_TOPICS:
        if t.get("section") is None:
            continue
        i = t["section"]
        title = site["sections"][i]["title"] if i < len(site["sections"]) else ""
        if t["match"] not in title:
            problems.append(f"post-op section {i} is now '{title}', expected '{t['match']}'")
    if problems:
        raise SystemExit("QR list is out of date with the site:\n  " + "\n  ".join(problems))
    print(f"Topic list matches the site: {len(ALL_TOPICS)} topics "
          f"({len(listed_sections)} post-op procedures)")
