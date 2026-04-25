# wipe_oauth.py
import asyncio
from sqlalchemy import delete
from app.db import SessionLocal
from app.oauth import OAuthToken

async def main():
    async with SessionLocal() as s:
        result = await s.execute(delete(OAuthToken))
        await s.commit()
        print(f"Deleted {result.rowcount} OAuth tokens.")

asyncio.run(main())