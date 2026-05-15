from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    phone_enc: Mapped[str] = mapped_column(String(512))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="sent")
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
