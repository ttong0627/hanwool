from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ComplaintCreate(BaseModel):
    order_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    channel: str = "phone"
    content: str


class ComplaintUpdate(BaseModel):
    status: Optional[str] = None
    handler_id: Optional[int] = None
    result: Optional[str] = None
    result_channel: Optional[str] = None


class ComplaintOut(BaseModel):
    id: int
    order_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    channel: str
    content: str
    status: str
    handler_id: Optional[int] = None
    result: Optional[str] = None
    result_channel: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
