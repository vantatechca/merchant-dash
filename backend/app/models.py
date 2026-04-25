

# """SQLAlchemy async models for GMC dashboard."""

# from __future__ import annotations

# from datetime import datetime
# from typing import Any, Optional

# from sqlalchemy import (
#     JSON,
#     DateTime,
#     ForeignKey,
#     Integer,
#     String,
#     delete,
#     func,
#     select,
#     update,
# )
# from sqlalchemy.ext.asyncio import AsyncSession
# from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# class Base(DeclarativeBase):
#     pass


# class MerchantAccount(Base):
#     __tablename__ = "merchant_accounts"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     account_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
#     display_name: Mapped[str] = mapped_column(String(255))
#     credentials_json: Mapped[dict] = mapped_column(JSON)
#     created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

#     @classmethod
#     async def all(cls, session: AsyncSession):
#         """
#         Returns all accounts with a derived `auth_type` label so the frontend
#         can render badges without inspecting credentials_json (which holds
#         secrets for per-user OAuth rows).
#         """
#         res = await session.execute(select(cls))
#         out = []
#         for a in res.scalars():
#             creds = a.credentials_json or {}
#             if creds.get("_admin"):
#                 auth_type = "admin"
#             elif creds.get("_oauth"):
#                 auth_type = "direct"
#             else:
#                 auth_type = "service_account"
#             out.append({
#                 "account_id":   a.account_id,
#                 "display_name": a.display_name,
#                 "id":           a.id,
#                 "auth_type":    auth_type,
#             })
#         return out

#     @classmethod
#     async def get(cls, session: AsyncSession, account_id: str):
#         res = await session.execute(select(cls).where(cls.account_id == account_id))
#         return res.scalar_one_or_none()

#     @classmethod
#     async def upsert(cls, session: AsyncSession, **kw):
#         existing = await cls.get(session, kw["account_id"])
#         if existing:
#             existing.display_name = kw["display_name"]
#             existing.credentials_json = kw["credentials_json"]
#         else:
#             existing = cls(**kw)
#             session.add(existing)
#         await session.commit()
#         await session.refresh(existing)
#         return {
#             "account_id": existing.account_id,
#             "display_name": existing.display_name,
#             "id": existing.id,
#         }

#     @classmethod
#     async def remove(cls, session: AsyncSession, account_id: str):
#         await session.execute(delete(cls).where(cls.account_id == account_id))
#         await session.commit()


# class Product(Base):
#     __tablename__ = "products"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     account_id: Mapped[str] = mapped_column(String(64), index=True)
#     offer_id: Mapped[str] = mapped_column(String(128), index=True)
#     title: Mapped[str] = mapped_column(String(500))
#     status: Mapped[str] = mapped_column(String(32), index=True, default="pending")
#     content_language: Mapped[str] = mapped_column(String(8), default="en")
#     feed_label: Mapped[str] = mapped_column(String(16), default="CA")
#     data_source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
#     issue_count: Mapped[int] = mapped_column(Integer, default=0)
#     raw: Mapped[dict] = mapped_column(JSON, default=dict)
#     updated_at: Mapped[datetime] = mapped_column(
#         DateTime, server_default=func.now(), onupdate=func.now()
#     )

#     @classmethod
#     async def search(
#         cls,
#         session: AsyncSession,
#         account_id: Optional[str] = None,
#         status: Optional[str] = None,
#         limit: int = 100,
#         offset: int = 0,
#     ):
#         q = select(cls)
#         if account_id:
#             q = q.where(cls.account_id == account_id)
#         if status:
#             q = q.where(cls.status == status)
#         q = q.order_by(cls.updated_at.desc()).limit(limit).offset(offset)
#         res = await session.execute(q)
#         return [
#             {
#                 "id": p.id,
#                 "account_id": p.account_id,
#                 "offer_id": p.offer_id,
#                 "title": p.title,
#                 "status": p.status,
#                 "issue_count": p.issue_count,
#                 "updated_at": p.updated_at.isoformat() if p.updated_at else None,
#             }
#             for p in res.scalars()
#         ]

#     @classmethod
#     async def get(cls, session: AsyncSession, pid: int):
#         res = await session.execute(select(cls).where(cls.id == pid))
#         return res.scalar_one_or_none()

#     @classmethod
#     async def upsert(cls, session: AsyncSession, **kw):
#         existing = await session.execute(
#             select(cls).where(
#                 cls.account_id == kw["account_id"], cls.offer_id == kw["offer_id"]
#             )
#         )
#         row = existing.scalar_one_or_none()
#         if row:
#             for k, v in kw.items():
#                 setattr(row, k, v)
#         else:
#             row = cls(**kw)
#             session.add(row)
#         await session.commit()
#         await session.refresh(row)
#         return {
#             "id": row.id,
#             "account_id": row.account_id,
#             "offer_id": row.offer_id,
#             "title": row.title,
#             "status": row.status,
#         }

#     @classmethod
#     async def update_status(
#         cls, session: AsyncSession, account_id: str, offer_id: str, status_value: str
#     ):
#         await session.execute(
#             update(cls)
#             .where(cls.account_id == account_id, cls.offer_id == offer_id)
#             .values(status=status_value)
#         )
#         await session.commit()

#     @classmethod
#     async def delete(cls, session: AsyncSession, pid: int):
#         await session.execute(delete(cls).where(cls.id == pid))
#         await session.commit()

#     @classmethod
#     async def stats(cls, session: AsyncSession, account_id: Optional[str] = None):
#         q = select(cls.status, func.count(cls.id))
#         if account_id:
#             q = q.where(cls.account_id == account_id)
#         q = q.group_by(cls.status)
#         res = await session.execute(q)
#         counts = {row[0]: row[1] for row in res.all()}
#         total = sum(counts.values())
#         return {
#             "total": total,
#             "approved": counts.get("approved", 0),
#             "pending": counts.get("pending", 0),
#             "disapproved": counts.get("disapproved", 0),
#         }


# class Notification(Base):
#     __tablename__ = "notifications"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     account_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
#     event_type: Mapped[str] = mapped_column(String(64), index=True)
#     offer_id: Mapped[Optional[str]] = mapped_column(String(128), index=True)
#     old_value: Mapped[Optional[str]] = mapped_column(String(32))
#     new_value: Mapped[Optional[str]] = mapped_column(String(32))
#     reporting_context: Mapped[Optional[str]] = mapped_column(String(64))
#     event_time: Mapped[datetime] = mapped_column(DateTime, index=True)
#     raw: Mapped[dict] = mapped_column(JSON)
#     received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

#     @classmethod
#     async def create(cls, session: AsyncSession, **kw):
#         row = cls(**kw)
#         session.add(row)
#         await session.commit()
#         return row.id

#     @classmethod
#     async def recent(
#         cls, session: AsyncSession, account_id: Optional[str] = None, limit: int = 50
#     ):
#         q = select(cls).order_by(cls.event_time.desc()).limit(limit)
#         if account_id:
#             q = q.where(cls.account_id == account_id)
#         res = await session.execute(q)
#         return [
#             {
#                 "id": n.id,
#                 "account_id": n.account_id,
#                 "event_type": n.event_type,
#                 "offer_id": n.offer_id,
#                 "old_value": n.old_value,
#                 "new_value": n.new_value,
#                 "reporting_context": n.reporting_context,
#                 "event_time": n.event_time.isoformat(),
#             }
#             for n in res.scalars()
#         ]


# class ProductEvent(Base):
#     """Internal event log (audit trail of dashboard actions)."""

#     __tablename__ = "product_events"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
#     action: Mapped[str] = mapped_column(String(32))
#     payload: Mapped[dict] = mapped_column(JSON, default=dict)
#     created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())





"""SQLAlchemy async models for GMC dashboard."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    delete,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MerchantAccount(Base):
    __tablename__ = "merchant_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255))
    credentials_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @classmethod
    async def all(cls, session: AsyncSession):
        """
        Returns all accounts with a derived `auth_type` label so the frontend
        can render badges without inspecting credentials_json (which holds
        secrets for per-user OAuth rows).
        """
        res = await session.execute(select(cls))
        out = []
        for a in res.scalars():
            creds = a.credentials_json or {}
            if creds.get("_admin"):
                auth_type = "admin"
            elif creds.get("_oauth"):
                auth_type = "direct"
            else:
                auth_type = "service_account"
            out.append({
                "account_id":   a.account_id,
                "display_name": a.display_name,
                "id":           a.id,
                "auth_type":    auth_type,
            })
        return out

    @classmethod
    async def get(cls, session: AsyncSession, account_id: str):
        res = await session.execute(select(cls).where(cls.account_id == account_id))
        return res.scalar_one_or_none()

    @classmethod
    async def upsert(cls, session: AsyncSession, **kw):
        existing = await cls.get(session, kw["account_id"])
        if existing:
            existing.display_name = kw["display_name"]
            existing.credentials_json = kw["credentials_json"]
        else:
            existing = cls(**kw)
            session.add(existing)
        await session.commit()
        await session.refresh(existing)
        return {
            "account_id": existing.account_id,
            "display_name": existing.display_name,
            "id": existing.id,
        }

    @classmethod
    async def remove(cls, session: AsyncSession, account_id: str):
        await session.execute(delete(cls).where(cls.account_id == account_id))
        await session.commit()


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    offer_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(32), index=True, default="pending")
    content_language: Mapped[str] = mapped_column(String(8), default="en")
    feed_label: Mapped[str] = mapped_column(String(16), default="CA")
    data_source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    issue_count: Mapped[int] = mapped_column(Integer, default=0)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    @classmethod
    async def search(
        cls,
        session: AsyncSession,
        account_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ):
        q = select(cls)
        if account_id:
            q = q.where(cls.account_id == account_id)
        if status:
            q = q.where(cls.status == status)
        q = q.order_by(cls.updated_at.desc()).limit(limit).offset(offset)
        res = await session.execute(q)
        return [
            {
                "id": p.id,
                "account_id": p.account_id,
                "offer_id": p.offer_id,
                "title": p.title,
                "status": p.status,
                "issue_count": p.issue_count,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in res.scalars()
        ]

    @classmethod
    async def get(cls, session: AsyncSession, pid: int):
        res = await session.execute(select(cls).where(cls.id == pid))
        return res.scalar_one_or_none()

    @classmethod
    async def upsert(cls, session: AsyncSession, **kw):
        existing = await session.execute(
            select(cls).where(
                cls.account_id == kw["account_id"], cls.offer_id == kw["offer_id"]
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            for k, v in kw.items():
                setattr(row, k, v)
        else:
            row = cls(**kw)
            session.add(row)
        await session.commit()
        await session.refresh(row)
        return {
            "id": row.id,
            "account_id": row.account_id,
            "offer_id": row.offer_id,
            "title": row.title,
            "status": row.status,
        }

    @classmethod
    async def update_status(
        cls, session: AsyncSession, account_id: str, offer_id: str, status_value: str
    ):
        await session.execute(
            update(cls)
            .where(cls.account_id == account_id, cls.offer_id == offer_id)
            .values(status=status_value)
        )
        await session.commit()

    @classmethod
    async def delete(cls, session: AsyncSession, pid: int):
        await session.execute(delete(cls).where(cls.id == pid))
        await session.commit()

    @classmethod
    async def stats(cls, session: AsyncSession, account_id: Optional[str] = None):
        q = select(cls.status, func.count(cls.id))
        if account_id:
            q = q.where(cls.account_id == account_id)
        q = q.group_by(cls.status)
        res = await session.execute(q)
        counts = {row[0]: row[1] for row in res.all()}
        total = sum(counts.values())
        return {
            "total": total,
            "approved": counts.get("approved", 0),
            "pending": counts.get("pending", 0),
            "disapproved": counts.get("disapproved", 0),
        }


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    offer_id: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    old_value: Mapped[Optional[str]] = mapped_column(String(32))
    new_value: Mapped[Optional[str]] = mapped_column(String(32))
    reporting_context: Mapped[Optional[str]] = mapped_column(String(64))
    event_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    raw: Mapped[dict] = mapped_column(JSON)
    received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @classmethod
    async def create(cls, session: AsyncSession, **kw):
        row = cls(**kw)
        session.add(row)
        await session.commit()
        return row.id

    @classmethod
    async def recent(
        cls, session: AsyncSession, account_id: Optional[str] = None, limit: int = 50
    ):
        q = select(cls).order_by(cls.event_time.desc()).limit(limit)
        if account_id:
            q = q.where(cls.account_id == account_id)
        res = await session.execute(q)
        return [
            {
                "id": n.id,
                "account_id": n.account_id,
                "event_type": n.event_type,
                "offer_id": n.offer_id,
                "old_value": n.old_value,
                "new_value": n.new_value,
                "reporting_context": n.reporting_context,
                "event_time": n.event_time.isoformat(),
            }
            for n in res.scalars()
        ]


class ProductEvent(Base):
    """Internal event log (audit trail of dashboard actions)."""

    __tablename__ = "product_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class User(Base):
    """
    Dashboard user (human logging into the control panel).

    Not to be confused with the "admin" concept in oauth_tokens — that's the
    shared GMC content-scope token. This is the human operating the UI.
    """

    __tablename__ = "users"

    id:            Mapped[int]                = mapped_column(primary_key=True)
    email:         Mapped[str]                = mapped_column(String(255), unique=True, index=True)
    # Null for OAuth-only users (signed up via Google, never set a password).
    password_hash: Mapped[Optional[str]]      = mapped_column(String(255), nullable=True)
    # Google's stable account identifier. Set on first Google sign-in.
    google_sub:    Mapped[Optional[str]]      = mapped_column(String(255), unique=True, index=True, nullable=True)
    display_name:  Mapped[Optional[str]]      = mapped_column(String(255), nullable=True)
    created_at:    Mapped[datetime]           = mapped_column(DateTime, server_default=func.now())
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    @classmethod
    async def get_by_email(cls, session: AsyncSession, email: str):
        res = await session.execute(select(cls).where(cls.email == email.lower()))
        return res.scalar_one_or_none()

    @classmethod
    async def get_by_google_sub(cls, session: AsyncSession, sub: str):
        res = await session.execute(select(cls).where(cls.google_sub == sub))
        return res.scalar_one_or_none()

    @classmethod
    async def get(cls, session: AsyncSession, user_id: int):
        res = await session.execute(select(cls).where(cls.id == user_id))
        return res.scalar_one_or_none()