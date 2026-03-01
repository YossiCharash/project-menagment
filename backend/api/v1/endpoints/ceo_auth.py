"""
CEO authentication endpoints.

POST /login  -- exchange credentials for a CEO JWT token
GET  /me     -- return the authenticated CEO's identity
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.ceo_security import create_ceo_access_token, get_current_ceo
from backend.core.security import verify_password
from backend.db.master_session import get_master_db
from backend.models.tenant import CEOCredential

router = APIRouter()


@router.post("/login")
async def ceo_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_master_db),
):
    """Authenticate CEO and return a bearer token."""
    stmt = select(CEOCredential).where(CEOCredential.email == form_data.username)
    result = await db.execute(stmt)
    ceo = result.scalar_one_or_none()

    if ceo is None or not verify_password(form_data.password, ceo.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CEO credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_ceo_access_token(data={"sub": ceo.email})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def ceo_me(ceo: CEOCredential = Depends(get_current_ceo)):
    """Return the authenticated CEO's identity."""
    return {"id": ceo.id, "email": ceo.email}
