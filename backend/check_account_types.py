# check_account_types.py
import asyncio
from sqlalchemy import select
from app.db import SessionLocal
from app.models import MerchantAccount

async def main():
    async with SessionLocal() as s:
        accts = (await s.execute(select(MerchantAccount))).scalars().all()
        for a in accts:
            creds = a.credentials_json or {}
            kind = "OAuth" if creds.get("_oauth") else "Service Account"
            extra = f" (via {creds.get('email','?')})" if creds.get("_oauth") else ""
            print(f"{a.account_id}  {a.display_name:30}  [{kind}]{extra}")

asyncio.run(main())