"""Diagnose what status values live in the products table."""
import asyncio
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Product


async def main():
    async with SessionLocal() as s:
        rows = (await s.execute(
            select(Product.status, func.count(Product.id))
            .group_by(Product.status)
            .order_by(func.count(Product.id).desc())
        )).all()

        print("\n=== Status distribution in products table ===\n")
        if not rows:
            print("  (no products in database)\n")
            return

        total = 0
        for status, count in rows:
            print(f"  {status!r:20} -> {count}")
            total += count
        print(f"\n  Total rows: {total}")

        raw = {s for s, _ in rows}
        expected = {"approved", "pending", "disapproved"}

        print("\n=== Interpretation ===")
        if raw <= expected:
            print("  [OK] All statuses are already correct lowercase.")
            print("  -> If KPIs are 0, your backend wasn't restarted. Restart uvicorn.")
        elif {s.lower() for s in raw} <= expected:
            print("  [WARN] Found UPPERCASE / mixed-case statuses.")
            print("  -> Run normalize_statuses.py to fix existing rows.")
        else:
            unexpected = raw - expected - {s for s in raw if s.lower() in expected}
            print(f"  [WARN] Unexpected status values: {unexpected}")


if __name__ == "__main__":
    asyncio.run(main())