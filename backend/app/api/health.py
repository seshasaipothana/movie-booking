
from fastapi import APIRouter , HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health() -> dict[str , str]:
    """Liveness check - is the app running?"""
    return {"status": "ok"}

@router.get("/db")
async def health_db() -> dict[str , str]:
    """Readiness check — can we reach the database?"""
    engine = create_async_engine(settings.database_url,echo=False)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unreachable:{exc}") from exc

    finally:
        await engine.dispose()
    return {"db" : "ok"}
