"""PDF 문서 생성 서비스 (ReportLab)"""
import io
from datetime import datetime
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)


def _get_doc(buffer, title: str):
    return SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title=title
    )


def _header_style():
    return ParagraphStyle("header", fontName="Helvetica-Bold", fontSize=16, alignment=TA_CENTER, spaceAfter=12)


def _sub_style():
    return ParagraphStyle("sub", fontName="Helvetica", fontSize=10, alignment=TA_CENTER, spaceAfter=6, textColor=colors.grey)


def generate_delivery_list_pdf(orders: List[dict], date_str: str) -> bytes:
    buffer = io.BytesIO()
    doc = _get_doc(buffer, "배송 명단")
    elements = []

    elements.append(Paragraph("경안시장 집배송 서비스", _header_style()))
    elements.append(Paragraph(f"배송 일자: {date_str}  |  총 {len(orders)}건", _sub_style()))
    elements.append(Spacer(1, 0.3*cm))

    headers = ["순번", "일자", "성명", "접수번호", "연락처", "주소", "물품내역", "수량", "요청사항", "비고"]
    col_widths = [1.2*cm, 2.0*cm, 2.0*cm, 2.5*cm, 3.0*cm, 5.0*cm, 3.5*cm, 1.5*cm, 3.0*cm, 2.0*cm]

    data = [headers]
    for o in orders:
        data.append([
            str(o.get("sequence", "")),
            o.get("date", date_str),
            o.get("customer_name", ""),
            o.get("order_no", ""),
            o.get("customer_phone", ""),
            o.get("delivery_address", ""),
            o.get("items_desc", ""),
            str(o.get("quantity", 1)),
            o.get("request", ""),
            o.get("notes", ""),
        ])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F97316")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFF7ED")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()


def generate_receipt_pdf(order: dict) -> bytes:
    buffer = io.BytesIO()
    doc = _get_doc(buffer, "수령증")
    elements = []

    elements.append(Paragraph("배 달 수 령 증", _header_style()))
    elements.append(Paragraph("경안시장 집배송 서비스", _sub_style()))
    elements.append(Spacer(1, 0.5*cm))

    data = [
        ["접수번호", order.get("order_no", "")],
        ["수령인", order.get("customer_name", "")],
        ["연락처", order.get("customer_phone", "")],
        ["배송 주소", order.get("delivery_address", "")],
        ["물품 내역", order.get("items_desc", "")],
        ["수량", str(order.get("quantity", 1))],
        ["배송 완료 시각", order.get("delivered_at", "")],
        ["담당 기사", order.get("driver_name", "")],
    ]
    table = Table(data, colWidths=[4*cm, 13*cm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FFF7ED")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph(
        "위 물품을 정상적으로 수령하였음을 확인합니다.",
        ParagraphStyle("confirm", fontName="Helvetica", fontSize=11, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph(
        f"수령일: {order.get('delivered_at', '')}",
        ParagraphStyle("date", fontName="Helvetica", fontSize=10, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(
        "수령인 서명: ___________________",
        ParagraphStyle("sign", fontName="Helvetica", fontSize=12, alignment=TA_CENTER)
    ))
    doc.build(elements)
    return buffer.getvalue()


def generate_privacy_destruction_pdf(info: dict) -> bytes:
    buffer = io.BytesIO()
    doc = _get_doc(buffer, "개인정보 폐기 확인서")
    elements = []

    elements.append(Paragraph("개 인 정 보 폐 기 확 인 서", _header_style()))
    elements.append(Paragraph("경안시장 집배송 서비스", _sub_style()))
    elements.append(Spacer(1, 0.5*cm))

    data = [
        ["기관명", "경기도 광주시 경안시장 집배송 서비스"],
        ["폐기 일시", info.get("destroyed_at", "")],
        ["폐기 항목", "고객 성명, 연락처, 주소, 주문 개인정보, 민원 개인정보, SMS 로그"],
        ["폐기 방법", "AES-256 암호화 필드 [DELETED] 덮어쓰기 및 해시 초기화"],
        ["폐기 사유", info.get("reason", "계약 종료에 따른 개인정보 보호법 제21조 이행")],
        ["처리 담당자", info.get("confirmed_by_name", "")],
        ["확인 내용", "위와 같이 개인정보를 완전히 폐기하였음을 확인합니다."],
    ]
    table = Table(data, colWidths=[4.5*cm, 12.5*cm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FEE2E2")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 1.5*cm))
    elements.append(Paragraph(
        f"폐기 일자: {info.get('destroyed_at', '')}",
        ParagraphStyle("date", fontName="Helvetica", fontSize=10, alignment=TA_CENTER, textColor=colors.grey)
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(
        "담당자 서명: ___________________",
        ParagraphStyle("sign", fontName="Helvetica", fontSize=12, alignment=TA_CENTER)
    ))
    doc.build(elements)
    return buffer.getvalue()


def generate_complaint_report_pdf(complaint: dict) -> bytes:
    buffer = io.BytesIO()
    doc = _get_doc(buffer, "민원 처리 확인증")
    elements = []

    elements.append(Paragraph("민 원 처 리 확 인 증", _header_style()))
    elements.append(Paragraph("경안시장 집배송 서비스", _sub_style()))
    elements.append(Spacer(1, 0.5*cm))

    data = [
        ["민원번호", str(complaint.get("id", ""))],
        ["접수일시", complaint.get("created_at", "")],
        ["민원인", complaint.get("customer_name", "")],
        ["연락처", complaint.get("customer_phone", "")],
        ["접수 경로", complaint.get("channel", "")],
        ["민원 내용", complaint.get("content", "")],
        ["처리 결과", complaint.get("result", "")],
        ["처리 완료일", complaint.get("resolved_at", "")],
        ["담당자", complaint.get("handler_name", "")],
    ]
    table = Table(data, colWidths=[4*cm, 13*cm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FFF7ED")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()
