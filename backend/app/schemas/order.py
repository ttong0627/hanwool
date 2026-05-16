from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class OrderCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_id: Optional[int] = None
    delivery_address: str
    dong: str
    items_desc: Optional[str] = None
    quantity: int = 1
    notes: Optional[str] = None
    request: Optional[str] = None
    weight_estimate: Optional[str] = None
    pickup_location: str = "경안시장"


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
    quantity: int
    notes: Optional[str] = None
    request: Optional[str] = None
    weight_estimate: Optional[str] = None
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
    quantity: Optional[int] = None
    notes: Optional[str] = None
    request: Optional[str] = None
    weight_estimate: Optional[str] = None
