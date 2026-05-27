"""QR 코드 + 배송 라벨 생성 서비스"""
import io
from typing import List

import qrcode
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Table, TableStyle

_FONT_REGISTERED = False

def _ensure_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    try:
        pdfmetrics.registerFont(TTFont("NanumGothic", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"))
        pdfmetrics.registerFont(TTFont("NanumGothicBold", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"))
        _FONT_REGISTERED = True
    except Exception:
        _FONT_REGISTERED = False

def _F():
    _ensure_fonts()
    return "NanumGothic" if _FONT_REGISTERED else "Helvetica"

def _FB():
    _ensure_fonts()
    return "NanumGothicBold" if _FONT_REGISTERED else "Helvetica-Bold"


def generate_qr_bytes(data: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_labels_pdf(orders: List[dict]) -> bytes:
    """A4 3×4 QR 라벨지 생성 (한 장에 12개)"""
    buffer = io.BytesIO()
    # 3열 × 4행 = 12개/페이지
    # A4: 210×297mm, 여백 0.3cm → 사용 폭 203.4mm, 높이 290.4mm
    COL = 3
    ROW = 4
    PER_PAGE = COL * ROW
    col_w = 6.5 * cm   # 3열: 6.5*3=19.5cm ≈ 203.4mm 맞춤
    row_h = 7.0 * cm   # 4행: 7.0*4=28cm ≈ 290.4mm 맞춤

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=0.3*cm, leftMargin=0.3*cm,
        topMargin=0.3*cm, bottomMargin=0.3*cm,
    )
    elements = []
    label_style = ParagraphStyle("label", fontName=_FB(), fontSize=8, alignment=TA_CENTER, leading=10)
    addr_style  = ParagraphStyle("addr",  fontName=_F(),  fontSize=7, alignment=TA_CENTER, leading=9)
    no_style    = ParagraphStyle("no",    fontName=_F(),  fontSize=7, alignment=TA_CENTER, textColor=colors.grey)

    def _make_cell(order):
        if order is None:
            return ""
        qr_data = (
            f"접수번호:{order.get('order_no','')}\n"
            f"성명:{order.get('customer_name','')}\n"
            f"주소:{order.get('delivery_address','')}"
        )
        qr_bytes = generate_qr_bytes(qr_data)
        qr_img = Image(io.BytesIO(qr_bytes), width=2.8*cm, height=2.8*cm)
        return [
            Paragraph(f"[{order.get('order_no','')}]", no_style),
            qr_img,
            Paragraph(order.get('customer_name', ''), label_style),
            Paragraph(order.get('delivery_address', ''), addr_style),
        ]

    for i in range(0, len(orders), PER_PAGE):
        batch = orders[i:i+PER_PAGE]
        while len(batch) < PER_PAGE:
            batch.append(None)

        rows = []
        for r in range(ROW):
            row = [_make_cell(batch[r * COL + c]) for c in range(COL)]
            rows.append(row)

        table = Table(
            rows,
            colWidths=[col_w] * COL,
            rowHeights=[row_h] * ROW,
        )
        table.setStyle(TableStyle([
            ("BOX",       (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
            ("VALIGN",    (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",     (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)

    doc.build(elements)
    return buffer.getvalue()
