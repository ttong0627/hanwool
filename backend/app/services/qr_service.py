"""QR 코드 + 배송 라벨 생성 서비스"""
import io
from typing import List

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import Image, SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER


def generate_qr_bytes(data: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_labels_pdf(orders: List[dict]) -> bytes:
    """A4 4분할 QR 라벨지 생성"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=0.5*cm, leftMargin=0.5*cm,
        topMargin=0.5*cm, bottomMargin=0.5*cm,
    )
    elements = []
    label_style = ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=10, alignment=TA_CENTER)
    addr_style = ParagraphStyle("addr", fontName="Helvetica", fontSize=8, alignment=TA_CENTER)

    # 4개씩 묶어서 2x2 배치
    for i in range(0, len(orders), 4):
        batch = orders[i:i+4]
        while len(batch) < 4:
            batch.append(None)

        cells = []
        for order in batch:
            if order is None:
                cells.append("")
                continue
            qr_data = f"접수번호:{order.get('order_no','')}\n성명:{order.get('customer_name','')}\n주소:{order.get('delivery_address','')}"
            qr_bytes = generate_qr_bytes(qr_data)
            qr_img = Image(io.BytesIO(qr_bytes), width=3*cm, height=3*cm)
            cell_content = [
                Paragraph(f"[{order.get('order_no','')}]", label_style),
                qr_img,
                Paragraph(order.get('customer_name', ''), label_style),
                Paragraph(order.get('delivery_address', ''), addr_style),
            ]
            cells.append(cell_content)

        row1 = [cells[0], cells[1]]
        row2 = [cells[2], cells[3]]
        table = Table([row1, row2], colWidths=[9.5*cm, 9.5*cm], rowHeights=[13*cm, 13*cm])
        table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        elements.append(table)

    doc.build(elements)
    return buffer.getvalue()
