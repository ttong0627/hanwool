"""
Create the first super admin account safely.

Usage:
  python create_admin.py
  python create_admin.py --name "Admin" --phone "010-0000-0000"

Environment alternatives:
  HANWOOL_ADMIN_NAME
  HANWOOL_ADMIN_PHONE
  HANWOOL_ADMIN_PASSWORD
"""

import argparse
import asyncio
import logging
import os
import re
import sys
import traceback
from getpass import getpass

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import encrypt_field, hash_password, hash_phone, hash_phone_legacy
from app.models.user import User, UserRole

LOG_FILE = "create_admin.log"
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def _read_required(label: str, env_name: str, provided: str | None = None) -> str:
    value = provided or os.getenv(env_name)
    if value:
        return value.strip()
    return input(f"{label}: ").strip()


def _read_password() -> str:
    password = os.getenv("HANWOOL_ADMIN_PASSWORD")
    if password:
        return password

    password = getpass("Password: ")
    confirm = getpass("Confirm password: ")
    if password != confirm:
        raise ValueError("Passwords do not match.")
    return password


def _validate_name(name: str) -> None:
    if not name:
        raise ValueError("Name is required.")
    if len(name) > 50:
        raise ValueError("Name must be 50 characters or fewer.")


def _validate_phone(phone: str) -> None:
    if not phone:
        raise ValueError("Phone is required.")
    if len(phone) > 20:
        raise ValueError("Phone must be 20 characters or fewer.")
    if not re.fullmatch(r"[0-9+\-()\s]+", phone):
        raise ValueError("Phone may contain only numbers, spaces, +, -, (, and ).")


def _validate_password(password: str) -> None:
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    checks = [
        (r"[A-Za-z]", "one letter"),
        (r"[0-9]", "one number"),
    ]
    missing = [label for pattern, label in checks if not re.search(pattern, password)]
    if missing:
        raise ValueError("Password must include " + ", ".join(missing) + ".")


async def create_admin(name: str, phone: str, password: str, reset_existing: bool = False) -> User:
    async with AsyncSessionLocal() as db:
        phone_hashes = {hash_phone(phone), hash_phone_legacy(phone)}
        existing_phone = await db.execute(select(User).where(User.phone_hash.in_(phone_hashes)))
        phone_user = existing_phone.scalar_one_or_none()
        if phone_user:
            if not reset_existing:
                raise RuntimeError("A user with this phone already exists. Use --reset-existing to update it.")
            phone_user.name_enc = encrypt_field(name)
            phone_user.phone_enc = encrypt_field(phone)
            phone_user.phone_hash = hash_phone(phone)
            phone_user.password_hash = hash_password(password)
            phone_user.role = UserRole.super_admin
            phone_user.is_active = True
            await db.commit()
            await db.refresh(phone_user)
            return phone_user

        existing_super_admin = await db.execute(
            select(User).where(
                User.role == UserRole.super_admin,
                User.deleted_at == None,
                User.is_active == True,
            )
        )
        super_admin = existing_super_admin.scalar_one_or_none()
        if super_admin:
            if not reset_existing:
                raise RuntimeError("An active super admin already exists. No account was created.")
            super_admin.name_enc = encrypt_field(name)
            super_admin.phone_enc = encrypt_field(phone)
            super_admin.phone_hash = hash_phone(phone)
            super_admin.password_hash = hash_password(password)
            super_admin.is_active = True
            await db.commit()
            await db.refresh(super_admin)
            return super_admin
        phone_hash = hash_phone(phone)
        user = User(
            name_enc=encrypt_field(name),
            phone_enc=encrypt_field(phone),
            phone_hash=phone_hash,
            password_hash=hash_password(password),
            role=UserRole.super_admin,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


async def main() -> int:
    parser = argparse.ArgumentParser(description="Create the first Hanwool super admin account.")
    parser.add_argument("--name", help="Admin display name")
    parser.add_argument("--phone", help="Admin login phone number")
    parser.add_argument("--reset-existing", action="store_true", help="Reset an existing user with this phone")
    args = parser.parse_args()

    try:
        name = _read_required("Name", "HANWOOL_ADMIN_NAME", args.name)
        phone = _read_required("Phone", "HANWOOL_ADMIN_PHONE", args.phone)
        password = _read_password()

        _validate_name(name)
        _validate_phone(phone)
        _validate_password(password)

        user = await create_admin(
            name=name,
            phone=phone,
            password=password,
            reset_existing=args.reset_existing,
        )
    except Exception as exc:
        logging.error("create_admin failed: %s\n%s", exc, traceback.format_exc())
        print(f"ERROR: {exc}", file=sys.stderr)
        print(f"See {LOG_FILE} for details.", file=sys.stderr)
        return 1

    logging.info("super admin ready: id=%s phone=%s reset_existing=%s", user.id, phone, args.reset_existing)
    print("Super admin created successfully.")
    print(f"User ID: {user.id}")
    print(f"Phone: {phone}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
