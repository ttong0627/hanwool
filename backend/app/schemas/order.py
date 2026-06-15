from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrderCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_id: Optional[int] = None
    delivery_address: str
    dong: str
    items_desc: Optional[str] = None
    item_code: Optional[str] = None
    quantity: int = Field(1, ge=1, le=999)
    notes: Optional[str] = None
    request: Optional[str] = None
    weight_estimate: Optional[str] = None
    dong_override: bool = False
    pickup_location: str = "경안시장"
    birth_year: Optional[int] = None  # 출생연도 (고객 기본정보)


class SingleOrderCreate(BaseModel):
    """ManualTab / QR / Excel 단건 자동저장용"""
    customer_name: str
    customer_phone: str
    delivery_address: str
    detail_address: Optional[str] = None
    dong: str
    items_desc: Optional[str] = None
    item_code: Optional[str] = None
    quantity: int = Field(1, ge=1, le=999)
    request: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    dong_override: bool = False
    birth_year: Optional[int] = None  # 출생연도 (고객 기본정보)


class OrderUpdate(BaseModel):
    driver_id: Optional[int] = None
    status: Optional[str] = None
    sequence: Optional[int] = None
    notes: Optional[str] = None
    request: Optional[str] = None


class OrderOut(BaseModel):
    id: int
    order_no: str
    customer_name: str
    customer_phone: str
    customer_id: Optional[int] = None
    receiver_id: Optional[int] = None
    driver_id: Optional[int] = None
    status: str
    sequence: Optional[int] = None
    pickup_location: str
    delivery_address: str
    dong: str
    items_desc: Optional[str] = None
    item_code: Optional[str] = None
    quantity: int
    notes: Optional[str] = None
    request: Optional[str] = None
    dong_override: bool = False
    created_at: datetime
    assigned_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderListOut(BaseModel):
    items: list[OrderOut]
    total: int
    page: int
    page_size: int


class OrderTransferRequest(BaseModel):
    to_driver_id: int
    reason: Optional[str] = None


class OrderTransferOut(BaseModel):
    id: int
    order_id: int
    from_driver_id: int
    to_driver_id: int
    reason: Optional[str] = None
    transferred_at: datetime

    class Config:
        from_attributes = True


class OrderEditRequest(BaseModel):
    delivery_address: Optional[str] = None
    detail_address: Optional[str] = None
    dong: Optional[str] = None
    items_desc: Optional[str] = None
    item_code: Optional[str] = None
    quantity: Optional[int] = Field(None, ge=1, le=999)
    notes: Optional[str] = None
    request: Optional[str] = None


# ── 요청 본문 검증용 스키마 (raw dict 입력 대체) ──────────────────────────────

class DispatchByDriversRequest(BaseModel):
    """우선순위 배차 / 배정요청 해소 — 기사 ID 목록"""
    driver_ids: list[int] = Field(default_factory=list)
    dong_groups: Optional[list[list[str]]] = None


class DispatchByDongRequest(BaseModel):
    """동(洞) 단위 배정 — 선택한 동들의 오늘 주문을 한 기사에게 배정/재배정"""
    driver_id: int
    dongs: list[str] = Field(min_length=1)


class DispatchByDongMultiRequest(BaseModel):
    """동 단위 분배 배정 — 선택한 동들을 선택한 여러 기사에게 균등 분배(같은 동=같은 기사)"""
    driver_ids: list[int] = Field(min_length=1)
    dongs: list[str] = Field(min_length=1)


class ResequenceItem(BaseModel):
    order_id: int
    sequence: int


class ResequenceRequest(BaseModel):
    sequences: list[ResequenceItem] = Field(min_length=1)


class SignatureUploadRequest(BaseModel):
    image_base64: str


class BatchCreateRequest(BaseModel):
    """복수 주문 일괄 등록 — 행 내부는 소스(QR/엑셀/직접)별로 가변이라 dict 유지"""
    rows: list[dict] = Field(min_length=1)
    is_test: bool = False


class AddressConfirmRequest(BaseModel):
    """담당자 주소 확인 확정 — 미매칭/저신뢰 주문의 정확 주소를 담당자가 확정한다."""
    standard_road_address: str = Field(min_length=2)
    # 배송동 미제공 시 서버가 표준주소에서 자동 판별한다(담당자가 동을 고를 필요 없음).
    service_dong: Optional[str] = None
    # 좌표 미제공(로컬 매칭은 좌표가 없음) 시 서버가 표준주소로 지오코딩한다.
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    jibun_address: Optional[str] = None
    legal_emd: Optional[str] = None
    detail_address: Optional[str] = None
    memo: Optional[str] = None
    save_override: bool = True  # 같은 주소 입력 시 다음부터 자동 매칭되도록 보정 규칙 저장
