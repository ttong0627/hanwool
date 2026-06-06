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
