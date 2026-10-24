#!/usr/bin/env python3
"""Generate QR code PDFs for Parents Education Portal.

  QR-All-Topics.pdf         page 1 = conditions and care guides, page 2 = post-op procedures
  QR-Individual-Topics.pdf  one page per topic

Run from anywhere: python3 tools/qr/generate_qr_pdfs.py
"""

import os

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from qr_common import (CAT_STYLES, CATEGORIES, ALL_TOPICS, OUTPUT_DIR, topic_url, make_qr,
                       check_against_site, draw_centered, draw_right, draw_text, fit_size)

PRIMARY_COLOR = HexColor("#0891b2")
DARK_COLOR = HexColor("#1e293b")
GRAY_COLOR = HexColor("#64748b")
WHITE = HexColor("#ffffff")


def draw_header(c, width, height, title_text, subtitle_text=None):
    """Draw a styled header bar at the top of the page."""
    header_h = 28 * mm
    c.setFillColor(PRIMARY_COLOR)
    c.rect(0, height - header_h, width, header_h, fill=1, stroke=0)

    c.setFillColor(WHITE)
    draw_centered(c, width / 2, height - 18 * mm, title_text, "Arabic", 18)
    if subtitle_text:
        draw_centered(c, width / 2, height - 24 * mm, subtitle_text, "Arabic", 10)

    return height - header_h


def draw_footer(c, width):
    """Draw footer at the bottom."""
    c.setFillColor(GRAY_COLOR)
    draw_centered(c, width / 2, 10 * mm, "وحدة جراحة عظام الأطفال - بوابة تثقيف الأسرة", "Arabic", 8)


def draw_main_box(c, width, y):
    """Main portal QR, centred under the header."""
    qr_size = 22 * mm
    box_w = 70 * mm
    box_h = 32 * mm
    box_x = (width - box_w) / 2
    box_y = y - box_h - 2 * mm

    c.setFillColor(HexColor("#ecfeff"))
    c.roundRect(box_x, box_y, box_w, box_h, 4 * mm, fill=1, stroke=0)
    c.drawImage(make_qr(topic_url()), box_x + 3 * mm, box_y + 5 * mm, qr_size, qr_size)

    c.setFillColor(DARK_COLOR)
    draw_text(c, box_x + qr_size + 8 * mm, box_y + 20 * mm, "البوابة الرئيسية", "Arabic", 11)
    c.setFillColor(GRAY_COLOR)
    draw_text(c, box_x + qr_size + 8 * mm, box_y + 13 * mm, "الصفحة الرئيسية للبوابة", "Arabic", 7)
    return box_y - 6 * mm


def draw_grid(c, width, y, cats):
    """Categories as rows of QR codes, right to left like the site."""
    cols = 5
    margin_x = 10 * mm
    cell_w = (width - 2 * margin_x) / cols
    qr_img_size = 24 * mm
    row_h = qr_img_size + 11 * mm

    for cat in cats:
        style = CAT_STYLES[cat["key"]]
        c.setFillColor(style["color"])
        draw_right(c, width - margin_x, y, style["name"], "Arabic", 10)
        c.setStrokeColor(HexColor("#e2e8f0"))
        c.setLineWidth(0.5)
        c.line(margin_x, y - 2 * mm, width - margin_x, y - 2 * mm)
        y -= 5 * mm

        for idx, topic in enumerate(cat["topics"]):
            col = idx % cols
            if col == 0 and idx > 0:
                y -= row_h
            # Column 0 on the right, as Arabic reads
            cell_center_x = width - margin_x - (col + 0.5) * cell_w
            qr_y = y - qr_img_size
            c.drawImage(make_qr(topic_url(topic)), cell_center_x - qr_img_size / 2, qr_y,
                        qr_img_size, qr_img_size)

            c.setFillColor(DARK_COLOR)
            size = fit_size(c, topic["name"], "Arabic", 7.5, cell_w - 3 * mm, 6)
            draw_centered(c, cell_center_x, qr_y - 4 * mm, topic["name"], "Arabic", size)
            c.setFillColor(GRAY_COLOR)
            size = fit_size(c, topic["en"], "Helvetica", 5.5, cell_w - 3 * mm, 4.5)
            draw_centered(c, cell_center_x, qr_y - 7 * mm, topic["en"], "Helvetica", size)

        y -= row_h + 3 * mm
    return y


# ============================================================
# PDF 1: All topics - conditions on page 1, procedures on page 2
# ============================================================
def generate_all_in_one_pdf():
    filepath = os.path.join(OUTPUT_DIR, "QR-All-Topics.pdf")
    width, height = A4
    c = canvas.Canvas(filepath, pagesize=A4)

    topics = [cat for cat in CATEGORIES if cat["key"] != "procedure"]
    procedures = [cat for cat in CATEGORIES if cat["key"] == "procedure"]

    y = draw_header(c, width, height, "رموز QR - جميع المواضيع", "امسح الرمز بكاميرا هاتفك للوصول المباشر")
    draw_footer(c, width)
    y = draw_main_box(c, width, y - 4 * mm)
    draw_grid(c, width, y, topics)

    c.showPage()
    y = draw_header(c, width, height, "رموز QR - تعليمات ما بعد العمليات",
                    "كل رمز يفتح تعليمات عملية واحدة مباشرةً")
    draw_footer(c, width)
    draw_grid(c, width, y - 10 * mm, procedures)

    c.save()
    print(f"Created: {filepath}")


# ============================================================
# PDF 2: Each topic on its own page
# ============================================================
def generate_individual_pages_pdf():
    filepath = os.path.join(OUTPUT_DIR, "QR-Individual-Topics.pdf")
    width, height = A4
    c = canvas.Canvas(filepath, pagesize=A4)

    # First page: Main portal QR
    draw_page(c, width, height,
              title="البوابة الرئيسية",
              en="Family Education Portal",
              subtitle="بوابة تثقيف الأسرة - جراحة عظام الأطفال",
              url=topic_url(),
              instruction="امسح رمز QR بكاميرا هاتفك للدخول إلى البوابة التعليمية")

    # Each topic on its own page
    for topic in ALL_TOPICS:
        c.showPage()
        draw_page(c, width, height,
                  title=topic["name"],
                  en=topic["en"],
                  subtitle=CAT_STYLES[topic["cat_key"]]["name"],
                  url=topic_url(topic),
                  instruction="امسح رمز QR بكاميرا هاتفك للوصول المباشر لهذا الموضوع")

    c.save()
    print(f"Created: {filepath}")


def draw_page(c, width, height, title, en, subtitle, url, instruction):
    """Draw a single topic page with a large QR code."""
    # Background
    c.setFillColor(WHITE)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Top colored bar
    bar_h = 50 * mm
    c.setFillColor(PRIMARY_COLOR)
    c.rect(0, height - bar_h, width, bar_h, fill=1, stroke=0)

    # Decorative circle in header
    c.setFillColor(HexColor("#0e7490"))
    c.circle(width / 2, height - bar_h / 2, 60 * mm, fill=1, stroke=0)
    c.setFillColor(PRIMARY_COLOR)
    c.circle(width / 2, height - bar_h / 2, 55 * mm, fill=1, stroke=0)

    # Title in header
    c.setFillColor(WHITE)
    size = fit_size(c, title, "Arabic", 26, 100 * mm, 18)
    draw_centered(c, width / 2, height - 22 * mm, title, "Arabic", size)

    # English name, then category
    c.setFillAlpha(0.85)
    draw_centered(c, width / 2, height - 30 * mm, en, "Helvetica", 11)
    draw_centered(c, width / 2, height - 38 * mm, subtitle, "Arabic", 12)
    c.setFillAlpha(1)

    # QR Code - large centered
    qr_display_size = 75 * mm
    qr_y = height / 2 - qr_display_size / 2 + 5 * mm
    qr_x = (width - qr_display_size) / 2

    # White card behind QR
    card_padding = 8 * mm
    c.setFillColor(WHITE)
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(1)
    c.roundRect(
        qr_x - card_padding,
        qr_y - card_padding,
        qr_display_size + 2 * card_padding,
        qr_display_size + 2 * card_padding,
        6 * mm, fill=1, stroke=1
    )

    c.drawImage(make_qr(url), qr_x, qr_y, qr_display_size, qr_display_size)

    # Instruction text below QR
    inst_y = qr_y - card_padding - 12 * mm
    c.setFillColor(DARK_COLOR)
    draw_centered(c, width / 2, inst_y, instruction, "Arabic", 13)

    # URL display
    c.setFillColor(GRAY_COLOR)
    c.setFont("Helvetica", 7)
    # Truncate URL for display
    display_url = url if len(url) < 70 else url[:67] + "..."
    url_w = c.stringWidth(display_url, "Helvetica", 7)
    c.drawString((width - url_w) / 2, inst_y - 10 * mm, display_url)

    # Bottom section
    c.setFillColor(HexColor("#f8fafc"))
    c.rect(0, 0, width, 22 * mm, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.line(0, 22 * mm, width, 22 * mm)

    c.setFillColor(GRAY_COLOR)
    draw_centered(c, width / 2, 13 * mm, "وحدة جراحة عظام الأطفال", "Arabic", 9)
    draw_centered(c, width / 2, 7 * mm, "هذا المحتوى للأغراض التعليمية فقط - استشر طبيبك دائما", "Arabic", 8)


# ---- Run ----
if __name__ == "__main__":
    check_against_site()
    print("Generating QR code PDFs...")
    generate_all_in_one_pdf()
    generate_individual_pages_pdf()
    print("Done!")
