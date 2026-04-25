"""
One-shot: normalize every products.status value to lowercase.

Idempotent — safe to re-run; rows that are already lowercase are unchanged.

Usage (from the backend/ directory, venv activated):
    python normalize_statuses.py
"""

import asyncio
from sqlalchemy import func, select, update

from app.db import SessionLocal
from app.models import Product


async def main():
    async with SessionLocal() as s:
        # Count rows that actually need updating
        mixed = (await s.execute(
            select(func.count(Product.id))
            .where(Product.status != func.lower(Product.status))
        )).scalar_one()

        if mixed == 0:
            print("✅ Nothing to do — all statuses are already lowercase.")
            return

        print(f"Found {mixed} rows with mixed-case status. Normalizing…")

        result = await s.execute(
            update(Product).values(status=func.lower(Product.status))
        )
        await s.commit()

        print(f"✅ Normalized {result.rowcount} rows.")

        # Verify
        rows = (await s.execute(
            select(Product.status, func.count(Product.id))
            .group_by(Product.status)
        )).all()
        print("\nPost-cleanup distribution:")
        for status, count in rows:
            print(f"  {status!r:20} → {count}")


if __name__ == "__main__":
    asyncio.run(main())