"""
Create or update a user. Run once to bootstrap yourself, then use it any
time you need to add a team member or reset a password.

Usage:
    python create_user.py vantatechca@gmail.com
    python create_user.py someone@company.com --name "Jane Doe"
    python create_user.py someone@company.com --reset

Run from the `backend/` folder so the `app` package is on the path.

Self-contained: hashes passwords with its own CryptContext instead of
importing from app.user_auth, so it works regardless of whether user_auth's
import-time env checks are satisfied.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from passlib.context import CryptContext
from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import User

# Must match user_auth.py's scheme list so hashes created here verify there.
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def run(email: str, name: str | None, reset: bool, password: str):
    # Ensure the users table exists before insert.
    # init_db() is idempotent (create_all + IF NOT EXISTS migrations).
    await init_db()

    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user and not reset:
            print(
                f"User {email} already exists. Use --reset to change password.",
                file=sys.stderr,
            )
            sys.exit(1)

        if user:
            user.password_hash = pwd.hash(password)
            if name:
                user.display_name = name
            action = "updated"
        else:
            # Don't set created_at — the model has server_default=func.now(),
            # so Postgres fills it in. Passing a tz-aware datetime into a
            # naive TIMESTAMP column breaks under asyncpg.
            user = User(
                email=email,
                password_hash=pwd.hash(password),
                display_name=name,
            )
            db.add(user)
            action = "created"

        await db.commit()
        await db.refresh(user)
        print(f"\u2713 User {action}: #{user.id} {user.email}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--name", default=None, help="Display name")
    parser.add_argument(
        "--reset", action="store_true", help="Reset password on existing user"
    )
    args = parser.parse_args()

    email = args.email.strip().lower()

    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm:  ")
    if password != confirm:
        print("Passwords don't match.", file=sys.stderr)
        sys.exit(1)
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(run(email, args.name, args.reset, password))


if __name__ == "__main__":
    main()