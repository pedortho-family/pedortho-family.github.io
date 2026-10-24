#!/usr/bin/env python3
"""Generate professional clinic QR materials.

  QR-Clinic-Poster.pdf      A4 poster; topics flow over pages 1-2, post-op procedures on page 3
  QR-Clinic-Cards.pdf       two cut-out cards per page, one per topic
  QR-Clinic-Table-Card.pdf  front = topics, back = post-op procedures

Run from anywhere: python3 tools/qr/generate_clinic_qr.py
"""

import os

import qrcode
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from qr_common import (CAT_STYLES, CATEGORIES, ALL_TOPICS, OUTPUT_DIR, topic_url, make_qr,
                       check_against_site, draw_centered, draw_right, draw_text, fit_size)

# Colors
PRIMARY = HexColor("#0891b2")
PRIMARY_DARK = HexColor("#0e7490")
DARK = HexColor("#1e293b")
GRAY = HexColor("#64748b")
LIGHT_GRAY = HexColor("#94a3b8")
BORDER = HexColor("#cbd5e1")
WHITE = HexColor("#ffffff")
BG_LIGHT = HexColor("#f8fafc")

ECC_H = qrcode.constants.ERROR_CORRECT_H


def rounded_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.5):
    c.saveState()
    if fill: c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(sw)
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    p.close()
    c.drawPath(p, fill=1 if fill else 0, stroke=1 if stroke else 0)
    c.restoreState()


def draw_header(c, w, h):
    """Draw the page header."""
    hdr = 36 * mm
    # Background layers
    c.setFillColor(HexColor("#155e75"))
    c.rect(0, h - hdr, w, hdr, fill=1, stroke=0)
    c.setFillColor(PRIMARY_DARK)
    c.rect(0, h - hdr + 1.5 * mm, w, hdr - 1.5 * mm, fill=1, stroke=0)
    c.setFillColor(PRIMARY)
    c.rect(0, h - hdr + 3 * mm, w, hdr - 3 * mm, fill=1, stroke=0)

    # Medical cross watermarks
    for cx_pos in [25 * mm, w - 25 * mm]:
        cy = h - hdr / 2
        c.saveState()
        c.setFillColor(WHITE)
        c.setFillAlpha(0.07)
        sz = 20 * mm
        c.rect(cx_pos - sz * 0.15, cy - sz / 2, sz * 0.3, sz, fill=1, stroke=0)
        c.rect(cx_pos - sz / 2, cy - sz * 0.15, sz, sz * 0.3, fill=1, stroke=0)
        c.restoreState()

    # Title
    c.setFillColor(WHITE)
    draw_centered(c, w / 2, h - 16 * mm, "بوابة تثقيف الأسرة", "ArabicBold", 24)

    # Subtitle
    c.setFillAlpha(0.9)
    draw_centered(c, w / 2, h - 25 * mm, "وحدة جراحة عظام الأطفال", "Arabic", 11)

    # Separator
    c.setStrokeColor(WHITE)
    c.setStrokeAlpha(0.25)
    c.setLineWidth(0.4)
    lw = 40 * mm
    c.line((w - lw) / 2, h - 28.5 * mm, (w + lw) / 2, h - 28.5 * mm)
    c.setStrokeAlpha(1)

    c.setFillAlpha(0.8)
    draw_centered(c, w / 2, h - 33 * mm, "امسح الرمز بكاميرا هاتفك للوصول المباشر للمعلومات", "Arabic", 8)
    c.setFillAlpha(1)

    return h - hdr - 4 * mm


def draw_mini_header(c, w, h, title):
    """Short header for the poster's later pages."""
    mini_h = 18 * mm
    c.setFillColor(PRIMARY)
    c.rect(0, h - mini_h, w, mini_h, fill=1, stroke=0)
    c.setFillColor(HexColor("#155e75"))
    c.rect(0, h - mini_h, w, 1.5 * mm, fill=1, stroke=0)

    c.setFillColor(WHITE)
    draw_centered(c, w / 2, h - 12 * mm, title, "ArabicBold", 14)
    return h - mini_h - 5 * mm


def draw_footer(c, w):
    c.setFillColor(BG_LIGHT)
    c.rect(0, 0, w, 9 * mm, fill=1, stroke=0)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.3)
    c.line(0, 9 * mm, w, 9 * mm)
    c.setFillColor(LIGHT_GRAY)
    draw_centered(c, w / 2, 3.5 * mm, "هذا المحتوى للأغراض التعليمية فقط  -  استشر طبيبك دائماً", "Arabic", 6.5)


def draw_topic_box(c, x, y, bw, bh, topic, cat_color):
    """Draw a single topic box with QR code inside."""
    # Box shadow effect
    rounded_rect(c, x + 0.5 * mm, y - 0.5 * mm, bw, bh, 3 * mm, fill=HexColor("#e2e8f0"))
    # White card
    rounded_rect(c, x, y, bw, bh, 3 * mm, fill=WHITE, stroke=BORDER, sw=0.6)

    # Top colored strip
    strip_h = 1.2 * mm
    c.saveState()
    c.setFillColor(cat_color)
    # Clip to rounded top
    clip = c.beginPath()
    clip.roundRect(x, y, bw, bh, 3 * mm)
    clip.close()
    c.clipPath(clip, stroke=0)
    c.rect(x, y + bh - strip_h, bw, strip_h, fill=1, stroke=0)
    c.restoreState()

    # QR code
    qr_size = bw * 0.62
    qr_x = x + (bw - qr_size) / 2
    qr_y = y + bh - strip_h - qr_size - 3 * mm

    # Light QR background
    qr_pad = 2 * mm
    rounded_rect(c, qr_x - qr_pad, qr_y - qr_pad, qr_size + 2 * qr_pad, qr_size + 2 * qr_pad,
                  2 * mm, fill=HexColor("#fafafa"), stroke=HexColor("#f1f5f9"), sw=0.3)

    c.drawImage(make_qr(topic_url(topic), ECC_H), qr_x, qr_y, qr_size, qr_size)

    # Arabic name
    c.setFillColor(DARK)
    size = fit_size(c, topic["name"], "ArabicBold", 7.5, bw - 4 * mm, 6)
    draw_centered(c, x + bw / 2, qr_y - 5.5 * mm, topic["name"], "ArabicBold", size)

    # English name in the category colour
    c.setFillColor(cat_color)
    size = fit_size(c, topic["en"], "Helvetica", 5.5, bw - 4 * mm, 4.5)
    draw_centered(c, x + bw / 2, qr_y - 9 * mm, topic["en"], "Helvetica", size)


def draw_main_qr_box(c, w, y):
    """Draw the prominent main portal QR box."""
    box_w = 90 * mm
    box_h = 34 * mm
    box_x = (w - box_w) / 2
    box_y = y - box_h

    # Shadow
    rounded_rect(c, box_x + 0.7 * mm, box_y - 0.7 * mm, box_w, box_h, 4 * mm, fill=HexColor("#d1d5db"))
    # Card
    rounded_rect(c, box_x, box_y, box_w, box_h, 4 * mm, fill=WHITE, stroke=PRIMARY, sw=1.5)

    # Right accent bar
    c.setFillColor(PRIMARY)
    c.rect(box_x + box_w - 3 * mm, box_y + 4 * mm, 1.5 * mm, box_h - 8 * mm, fill=1, stroke=0)

    # QR
    qr_s = 24 * mm
    c.drawImage(make_qr(topic_url(), ECC_H), box_x + 5 * mm, box_y + 5 * mm, qr_s, qr_s)

    # Text
    tx = box_x + qr_s + 12 * mm
    c.setFillColor(DARK)
    draw_text(c, tx, box_y + 23 * mm, "البوابة الرئيسية", "ArabicBold", 15)

    c.setFillColor(GRAY)
    draw_text(c, tx, box_y + 15 * mm, "جميع المواضيع والحالات", "Arabic", 8.5)

    c.setFillColor(PRIMARY)
    draw_text(c, tx, box_y + 8 * mm, "الصفحة الرئيسية للبوابة التعليمية", "Arabic", 7)

    return box_y - 5 * mm


def draw_category_header(c, w, y, style, margin, continued=False):
    """Draw a category section header."""
    bar_h = 7.5 * mm

    # Background
    c.setFillColor(style["bg"])
    c.rect(margin, y - bar_h, w - 2 * margin, bar_h, fill=1, stroke=0)

    # Right accent
    c.setFillColor(style["color"])
    c.rect(w - margin - 2.5 * mm, y - bar_h, 2.5 * mm, bar_h, fill=1, stroke=0)

    # Left accent line
    c.setFillColor(style["color"])
    c.rect(margin, y - bar_h, 2.5 * mm, bar_h, fill=1, stroke=0)

    # Category name
    c.setFillColor(DARK)
    name = style["name"] + (" (تابع)" if continued else "")
    draw_right(c, w - margin - 7 * mm, y - 5.8 * mm, name, "ArabicBold", 10)

    return y - bar_h - 3 * mm


# ============================================================
# MAIN: Generate poster
# ============================================================
def generate_poster():
    filepath = os.path.join(OUTPUT_DIR, "QR-Clinic-Poster.pdf")
    w, h = A4
    c = canvas.Canvas(filepath, pagesize=A4)

    margin = 9 * mm
    cols = 4
    cell_w = (w - 2 * margin) / cols
    box_w = cell_w - 3 * mm
    box_h = 44 * mm
    row_gap = 2 * mm
    bottom = 9 * mm + 2 * mm  # above the footer
    header_h = 10.5 * mm      # category bar + gap

    def new_page(title):
        c.showPage()
        c.setFillColor(WHITE)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        draw_footer(c, w)
        return draw_mini_header(c, w, h, title)

    # ===== PAGE 1 =====
    c.setFillColor(WHITE)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    draw_footer(c, w)
    y = draw_header(c, w, h)
    y = draw_main_qr_box(c, w, y)

    for cat in CATEGORIES:
        style = CAT_STYLES[cat["key"]]
        # Post-op procedures get their own sheet, for the discharge desk
        if cat["key"] == "procedure":
            y = new_page("بوابة تثقيف الأسرة  -  " + style["name"])

        rows = [cat["topics"][i:i + cols] for i in range(0, len(cat["topics"]), cols)]
        header_drawn = False
        for r, row in enumerate(rows):
            need = box_h + (0 if header_drawn else header_h)
            if y - need < bottom:
                y = new_page("بوابة تثقيف الأسرة  -  تابع")
                header_drawn = False
            if not header_drawn:
                y = draw_category_header(c, w, y, style, margin, continued=r > 0)
                header_drawn = True

            for col, topic in enumerate(row):
                # Column 0 on the right, as Arabic reads
                x = w - margin - (col + 1) * cell_w
                bx = x + (cell_w - box_w) / 2
                draw_topic_box(c, bx, y - box_h, box_w, box_h, topic, style["color"])
            y -= box_h + row_gap

        y -= 2 * mm

    c.save()
    print(f"  Poster:     {filepath}")


# ============================================================
# INDIVIDUAL CARDS
# ============================================================
def generate_cards():
    filepath = os.path.join(OUTPUT_DIR, "QR-Clinic-Cards.pdf")
    w, h = A4
    c = canvas.Canvas(filepath, pagesize=A4)
    card_h = h / 2 - 5 * mm

    all_items = [{"id": None, "name": "البوابة الرئيسية", "cat_key": None, "en": "Family Education Portal"}]
    all_items += ALL_TOPICS

    for i, item in enumerate(all_items):
        if i > 0 and i % 2 == 0:
            c.showPage()
        slot = i % 2
        base_y = h - 5 * mm - card_h if slot == 0 else 5 * mm

        cat_key = item.get("cat_key")
        style = CAT_STYLES.get(cat_key, {"color": PRIMARY, "bg": HexColor("#ecfeff"), "name": ""})

        cx = 8 * mm
        cw = w - 16 * mm
        ch = card_h

        # Card
        rounded_rect(c, cx, base_y, cw, ch, 4 * mm, fill=WHITE, stroke=BORDER, sw=0.8)

        # Header bar
        bar_h = 13 * mm
        c.saveState()
        clip = c.beginPath()
        clip.roundRect(cx, base_y, cw, ch, 4 * mm)
        clip.close()
        c.clipPath(clip, stroke=0)
        c.setFillColor(PRIMARY)
        c.rect(cx, base_y + ch - bar_h, cw, bar_h, fill=1, stroke=0)
        c.setFillColor(PRIMARY_DARK)
        c.rect(cx, base_y + ch - bar_h, cw, 1.5 * mm, fill=1, stroke=0)
        c.restoreState()

        c.setFillColor(WHITE)
        draw_centered(c, cx + cw / 2, base_y + ch - 9.5 * mm,
                      "بوابة تثقيف الأسرة  -  وحدة جراحة عظام الأطفال", "ArabicBold", 10)

        # QR
        qr_size = 55 * mm
        qr_x = cx + (cw - qr_size) / 2
        # Sits above centre so the category line clears the footer text
        qr_y = base_y + ch / 2 - qr_size / 2 + 8 * mm
        pad = 4 * mm
        rounded_rect(c, qr_x - pad, qr_y - pad, qr_size + 2 * pad, qr_size + 2 * pad,
                      3 * mm, fill=WHITE, stroke=BORDER, sw=0.6)
        c.drawImage(make_qr(topic_url(item if item["id"] else None), ECC_H),
                    qr_x, qr_y, qr_size, qr_size)

        # Name, English name
        c.setFillColor(DARK)
        size = fit_size(c, item["name"], "ArabicBold", 20, cw - 20 * mm, 14)
        draw_centered(c, cx + cw / 2, qr_y - 12 * mm, item["name"], "ArabicBold", size)
        c.setFillColor(GRAY)
        draw_centered(c, cx + cw / 2, qr_y - 18.5 * mm, item["en"], "Helvetica", 10)

        # Category
        if cat_key:
            c.setFillColor(style["color"])
            draw_centered(c, cx + cw / 2, qr_y - 25 * mm, style["name"], "Arabic", 9)

        # Footer
        c.setFillColor(GRAY)
        draw_centered(c, cx + cw / 2, base_y + 13 * mm, "امسح الرمز بكاميرا هاتفك للوصول المباشر", "Arabic", 8)

        c.setStrokeColor(BORDER)
        c.setLineWidth(0.3)
        c.line(cx + 20 * mm, base_y + 10 * mm, cx + cw - 20 * mm, base_y + 10 * mm)

        c.setFillColor(LIGHT_GRAY)
        draw_centered(c, cx + cw / 2, base_y + 4 * mm, "هذا المحتوى للأغراض التعليمية فقط", "Arabic", 6.5)

        # Cut line
        if slot == 0:
            c.saveState()
            c.setStrokeColor(LIGHT_GRAY)
            c.setLineWidth(0.3)
            c.setDash(4, 4)
            c.line(20 * mm, h / 2, w - 20 * mm, h / 2)
            c.restoreState()

    c.save()
    print(f"  Cards:      {filepath}")


# ============================================================
# TABLE CARD - front = topics, back = post-op procedures
# ============================================================
def draw_table_side(c, w, h, cats, subtitle, with_main):
    c.setFillColor(WHITE)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    hdr = 30 * mm
    c.setFillColor(PRIMARY)
    c.rect(0, h - hdr, w, hdr, fill=1, stroke=0)
    c.setFillColor(HexColor("#155e75"))
    c.rect(0, h - hdr, w, 1.5 * mm, fill=1, stroke=0)

    c.setFillColor(WHITE)
    draw_centered(c, w / 2, h - 14 * mm, "بوابة تثقيف الأسرة", "ArabicBold", 22)

    c.setFillAlpha(0.9)
    draw_centered(c, w / 2, h - 24 * mm, subtitle, "Arabic", 10)
    c.setFillAlpha(1)

    y = h - hdr - 4 * mm

    if with_main:
        box_w = 85 * mm
        box_h = 30 * mm
        box_x = (w - box_w) / 2
        box_y = y - box_h
        rounded_rect(c, box_x, box_y, box_w, box_h, 4 * mm, fill=WHITE, stroke=PRIMARY, sw=1.2)
        c.setFillColor(PRIMARY)
        c.rect(box_x + box_w - 2.5 * mm, box_y + 3 * mm, 1.2 * mm, box_h - 6 * mm, fill=1, stroke=0)

        qs = 22 * mm
        c.drawImage(make_qr(topic_url()), box_x + 4 * mm, box_y + 4 * mm, qs, qs)

        c.setFillColor(DARK)
        draw_text(c, box_x + qs + 10 * mm, box_y + 19 * mm, "البوابة الرئيسية", "ArabicBold", 13)
        c.setFillColor(GRAY)
        draw_text(c, box_x + qs + 10 * mm, box_y + 12 * mm, "جميع المواضيع والحالات", "Arabic", 8)
        c.setFillColor(PRIMARY)
        draw_text(c, box_x + qs + 10 * mm, box_y + 6 * mm, "الصفحة الرئيسية", "Arabic", 7)

        y = box_y - 3 * mm
    else:
        y -= 4 * mm

    margin = 7 * mm
    cols = 5
    cell_w = (w - 2 * margin) / cols
    qs2 = 17 * mm if with_main else 24 * mm
    cell_h = qs2 + 12 * mm

    for cat in cats:
        style = CAT_STYLES[cat["key"]]
        c.setFillColor(style["color"])
        c.rect(margin, y - 0.5 * mm, w - 2 * margin, 0.5 * mm, fill=1, stroke=0)
        draw_right(c, w - margin, y + 1.5 * mm, style["name"], "ArabicBold", 7.5)
        y -= 4.5 * mm

        for idx, topic in enumerate(cat["topics"]):
            col = idx % cols
            if col == 0 and idx > 0:
                y -= cell_h

            # Column 0 on the right, as Arabic reads
            tcx = w - margin - (col + 0.5) * cell_w
            c.drawImage(make_qr(topic_url(topic)), tcx - qs2 / 2, y - qs2, qs2, qs2)

            c.setFillColor(DARK)
            size = fit_size(c, topic["name"], "ArabicBold", 6.5, cell_w - 2 * mm, 5)
            draw_centered(c, tcx, y - qs2 - 3 * mm, topic["name"], "ArabicBold", size)
            c.setFillColor(GRAY)
            size = fit_size(c, topic["en"], "Helvetica", 4.8, cell_w - 2 * mm, 4)
            draw_centered(c, tcx, y - qs2 - 5.8 * mm, topic["en"], "Helvetica", size)

        y -= cell_h + 3 * mm

    # Footer
    c.setFillColor(BG_LIGHT)
    c.rect(0, 0, w, 8 * mm, fill=1, stroke=0)
    c.setFillColor(LIGHT_GRAY)
    draw_centered(c, w / 2, 3 * mm, "هذا المحتوى للأغراض التعليمية فقط  -  استشر طبيبك دائماً", "Arabic", 6)


def generate_table_card():
    filepath = os.path.join(OUTPUT_DIR, "QR-Clinic-Table-Card.pdf")
    w, h = A4
    c = canvas.Canvas(filepath, pagesize=A4)

    draw_table_side(c, w, h, [cat for cat in CATEGORIES if cat["key"] != "procedure"],
                    "وحدة جراحة عظام الأطفال  |  امسح الرمز بكاميرا هاتفك", with_main=True)
    c.showPage()
    draw_table_side(c, w, h, [cat for cat in CATEGORIES if cat["key"] == "procedure"],
                    "تعليمات ما بعد العمليات  |  كل رمز يفتح تعليمات عملية واحدة", with_main=False)

    c.save()
    print(f"  Table Card: {filepath}")


if __name__ == "__main__":
    check_against_site()
    print("Generating clinic QR materials...\n")
    generate_poster()
    generate_cards()
    generate_table_card()
    print("\nDone!")
