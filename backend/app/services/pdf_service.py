"""PDF 문서 생성 서비스 (ReportLab)"""
from datetime import datetime, timezone
from html import escape
import io
import os
from typing import List
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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
    """일반 폰트명"""
    _ensure_fonts()
    return "NanumGothic" if _FONT_REGISTERED else "Helvetica"

def _FB():
    """볼드 폰트명"""
    _ensure_fonts()
    return "NanumGothicBold" if _FONT_REGISTERED else "Helvetica-Bold"


def _get_doc(buffer, title: str):
    return SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title=title
    )


def _header_style():
    return ParagraphStyle("header", fontName=_FB(), fontSize=16, alignment=TA_CENTER, spaceAfter=12)


def _sub_style():
    return ParagraphStyle("sub", fontName=_F(), fontSize=10, alignment=TA_CENTER, spaceAfter=6, textColor=colors.grey)


def _pdf_text(value) -> str:
    if value is None:
        return ""
    return escape(str(value).strip()).replace("\n", "<br/>")


def _fmt_delivery_time(value) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return str(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M")


def generate_delivery_list_pdf(orders: List[dict], date_str: str) -> bytes:
    buffer = io.BytesIO()
    # 가로(landscape) A4 — 사용 폭 약 267mm (29.7 - 여백 3cm)
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        title="배송 명단",
    )
    elements = []

    elements.append(Paragraph("경안시장 집배송 서비스", _header_style()))
    elements.append(Paragraph(f"배송 일자: {date_str}  |  총 {len(orders)}건", _sub_style()))
    elements.append(Spacer(1, 0.3*cm))

    # 가로 267mm에 맞춰 열 너비 조정 (합계 26.7cm)
    headers   = ["순번", "성명",  "접수번호",  "연락처",  "주소",    "물품내역", "수량", "요청사항", "비고"]
    col_widths = [1.2*cm, 2.2*cm, 3.0*cm, 3.2*cm, 8.0*cm, 4.5*cm, 1.5*cm, 4.5*cm, 2.6*cm]

    data = [headers]
    for o in orders:
        data.append([
            str(o.get("sequence", "")),
            o.get("customer_name", ""),
            o.get("order_no", ""),
            o.get("customer_phone", ""),
            o.get("delivery_address", ""),
            o.get("items_desc", ""),
            str(o.get("quantity", 1)),
            o.get("request", "") or "",
            o.get("notes", "") or "",
        ])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#F97316")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, -1), _F()),
        ("FONTNAME",      (0, 0), (-1, 0),  _FB()),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("ALIGN",         (4, 1), (4, -1),  "LEFT"),   # 주소 열은 왼쪽 정렬
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#FFF7ED")]),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()


def _signature_flowable(order: dict):
    """완료 서명(delivery_signature_url='/photos/x.png')을 PDF 이미지로 변환. 없으면 None."""
    url = order.get("delivery_signature_url")
    if not url:
        return None
    path = url.lstrip("/")  # '/photos/x.png' -> 'photos/x.png' (백엔드 cwd=/app 기준)
    if not os.path.exists(path):
        return None
    try:
        img = Image(path, width=6 * cm, height=2.4 * cm, kind="proportional")
        img.hAlign = "CENTER"
        return img
    except Exception:
        return None


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
        ["수령 방법", "경비실 수령" if order.get("received_by_security") else "본인/직접 수령"],
        ["배송 완료 시각", order.get("delivered_at", "")],
        ["담당 기사", order.get("driver_name", "")],
    ]
    if order.get("delivery_memo"):
        data.append(["배송 메모", order.get("delivery_memo")])
    table = Table(data, colWidths=[4*cm, 13*cm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _F()),
        ("FONTNAME", (0, 0), (0, -1), _FB()),
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
        ParagraphStyle("confirm", fontName=_F(), fontSize=11, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph(
        f"수령일: {order.get('delivered_at', '')}",
        ParagraphStyle("date", fontName=_F(), fontSize=10, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 0.5*cm))
    _sig = _signature_flowable(order)
    if _sig is not None:
        elements.append(Paragraph(
            "수령인 서명",
            ParagraphStyle("signlbl", fontName=_F(), fontSize=11, alignment=TA_CENTER)
        ))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(_sig)
    elif order.get("received_by_security"):
        elements.append(Paragraph(
            "경비실 수령 — 배송 완료 사진으로 수령을 확인합니다.",
            ParagraphStyle("sign", fontName=_F(), fontSize=11, alignment=TA_CENTER)
        ))
    else:
        elements.append(Paragraph(
            "수령인 서명: ___________________",
            ParagraphStyle("sign", fontName=_F(), fontSize=12, alignment=TA_CENTER)
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
        ("FONTNAME", (0, 0), (-1, -1), _F()),
        ("FONTNAME", (0, 0), (0, -1), _FB()),
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
        ParagraphStyle("date", fontName=_F(), fontSize=10, alignment=TA_CENTER, textColor=colors.grey)
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(
        "담당자 서명: ___________________",
        ParagraphStyle("sign", fontName=_F(), fontSize=12, alignment=TA_CENTER)
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
        ("FONTNAME", (0, 0), (-1, -1), _F()),
        ("FONTNAME", (0, 0), (0, -1), _FB()),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FFF7ED")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()


def _logo_flowable():
    """수령확인증 상단 로고. 없거나 오류면 None."""
    path = "app/assets/hanwool_logo.png"
    if not os.path.exists(path):
        return None
    try:
        img = Image(path, width=1.6 * cm, height=1.6 * cm, kind="proportional")
        img.hAlign = "CENTER"
        return img
    except Exception:
        return None


def generate_delivery_receipts_pdf(orders: List[dict], date_str: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=0.9 * cm,
        leftMargin=0.9 * cm,
        topMargin=0.8 * cm,
        bottomMargin=1.0 * cm,
        title="배송 수령증 목록",
    )
    elements: list = []

    title_style = ParagraphStyle(
        "receipt_title",
        fontName=_FB(),
        fontSize=18,
        leading=22,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#111827"),
    )
    meta_style = ParagraphStyle(
        "receipt_meta",
        fontName=_F(),
        fontSize=8,
        leading=10,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#6B7280"),
    )
    small_style = ParagraphStyle(
        "receipt_small",
        fontName=_F(),
        fontSize=7,
        leading=9,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#374151"),
    )
    small_center_style = ParagraphStyle(
        "receipt_small_center",
        fontName=_F(),
        fontSize=7,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#374151"),
    )
    small_bold_style = ParagraphStyle(
        "receipt_small_bold",
        fontName=_FB(),
        fontSize=7,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.white,
    )
    note_style = ParagraphStyle(
        "receipt_note",
        fontName=_F(),
        fontSize=8,
        leading=11,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#4B5563"),
    )

    _logo = _logo_flowable()
    title_block = [
        Paragraph("배송 수령확인증", title_style),
        Paragraph("(주)한울 · 경안시장 집배송 서비스", note_style),
    ]
    if _logo is not None:
        title_block.insert(0, _logo)
    header = Table(
        [[title_block, Paragraph(f"발행일: {datetime.now().strftime('%Y-%m-%d %H:%M')}<br/>조회기간: {date_str}", meta_style)]],
        colWidths=[18.8 * cm, 8.1 * cm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
    ]))
    elements.append(header)
    elements.append(Spacer(1, 0.25 * cm))

    signature_count = sum(1 for order in orders if order.get("delivery_signature_url"))
    photo_count = sum(1 for order in orders if order.get("delivery_photo_url"))
    driver_count = len({order.get("driver_id") for order in orders if order.get("driver_id")})
    summary = Table(
        [[
            Paragraph("총 수령증", small_center_style), Paragraph(f"{len(orders)}건", small_center_style),
            Paragraph("사진 증빙", small_center_style), Paragraph(f"{photo_count}건", small_center_style),
            Paragraph("서명 증빙", small_center_style), Paragraph(f"{signature_count}건", small_center_style),
            Paragraph("담당 기사", small_center_style), Paragraph(f"{driver_count}명", small_center_style),
        ]],
        colWidths=[2.4 * cm, 2.0 * cm, 2.4 * cm, 2.0 * cm, 2.4 * cm, 2.0 * cm, 2.4 * cm, 2.0 * cm],
        hAlign="LEFT",
    )
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("FONTNAME", (1, 0), (1, 0), _FB()),
        ("FONTNAME", (3, 0), (3, 0), _FB()),
        ("FONTNAME", (5, 0), (5, 0), _FB()),
        ("FONTNAME", (7, 0), (7, 0), _FB()),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(summary)
    elements.append(Spacer(1, 0.25 * cm))
    elements.append(Paragraph(
        "아래 내역은 배송 완료 처리된 주문의 수령 확인 자료입니다. 출력 후 현장 보관 또는 정산 증빙 용도로 사용할 수 있습니다.",
        note_style,
    ))
    elements.append(Spacer(1, 0.2 * cm))

    headers = ["주문번호", "수령인", "연락처", "배송동", "배송 주소", "물품/수량", "요청사항", "완료시간", "기사", "증빙", "확인"]
    rows = [[Paragraph(header, small_bold_style) for header in headers]]
    for order in orders:
        rows.append([
            Paragraph(_pdf_text(order.get("order_no", "")), small_center_style),
            Paragraph(_pdf_text(order.get("customer_name", "")), small_center_style),
            Paragraph(_pdf_text(order.get("customer_phone", "")), small_center_style),
            Paragraph(_pdf_text(order.get("dong", "")), small_center_style),
            Paragraph(_pdf_text(order.get("delivery_address", "")), small_style),
            Paragraph(_pdf_text(f"{order.get('items_desc') or '-'} / {order.get('quantity', 1)}개"), small_style),
            Paragraph(
                _pdf_text(
                    (order.get("request") or "-")
                    + (f" / 메모: {order.get('delivery_memo')}" if order.get("delivery_memo") else "")
                ),
                small_style,
            ),
            Paragraph(_pdf_text(_fmt_delivery_time(order.get("delivered_at"))), small_center_style),
            Paragraph(_pdf_text(order.get("driver_name") or "-"), small_center_style),
            Paragraph(
                _pdf_text(
                    (
                        "사진+서명" if order.get("delivery_photo_url") and order.get("delivery_signature_url")
                        else "사진" if order.get("delivery_photo_url")
                        else "서명" if order.get("delivery_signature_url")
                        else "-"
                    )
                    + ("·경비실" if order.get("received_by_security") else "")
                ),
                small_center_style,
            ),
            Paragraph("완료", small_center_style),
        ])

    table = Table(
        rows,
        colWidths=[2.2*cm, 1.7*cm, 2.45*cm, 1.35*cm, 5.25*cm, 2.8*cm, 2.75*cm, 2.6*cm, 1.65*cm, 1.45*cm, 0.9*cm],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), _F()),
        ("FONTNAME", (0, 0), (-1, 0), _FB()),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(table)

    def draw_footer(canvas, document):
        canvas.saveState()
        canvas.setFont(_F(), 7)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(document.leftMargin, 0.45 * cm, "경안시장 집배송 서비스 · 배송 수령확인증")
        canvas.drawRightString(landscape(A4)[0] - document.rightMargin, 0.45 * cm, f"{document.page}쪽")
        canvas.restoreState()

    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buffer.getvalue()
