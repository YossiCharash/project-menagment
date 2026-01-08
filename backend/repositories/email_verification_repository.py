from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.email_verification import EmailVerification


class EmailVerificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_code(self, verification_code: str) -> EmailVerification | None:
        """Get verification by code"""
        res = await self.db.execute(select(EmailVerification).where(EmailVerification.verification_code == verification_code))
        return res.scalar_one_or_none()

    async def get_by_token(self, verification_token: str) -> EmailVerification | None:
        """Get verification by token"""
        res = await self.db.execute(select(EmailVerification).where(EmailVerification.verification_token == verification_token))
        return res.scalar_one_or_none()

    async def get_by_email_and_type(self, email: str, verification_type: str) -> EmailVerification | None:
        """Get verification by email and type"""
        res = await self.db.execute(
            select(EmailVerification)
            .where(EmailVerification.email == email)
            .where(EmailVerification.verification_type == verification_type)
            .where(EmailVerification.is_verified == False)
        )
        return res.scalar_one_or_none()

    async def create(self, verification: EmailVerification) -> EmailVerification:
        """Create new verification"""
        self.db.add(verification)
        await self.db.commit()
        await self.db.refresh(verification)
        return verification

    async def update(self, verification: EmailVerification) -> EmailVerification:
        """Update verification"""
        await self.db.commit()
        await self.db.refresh(verification)
        return verification

    async def delete(self, verification: EmailVerification) -> None:
        """Delete verification"""
        await self.db.delete(verification)
        await self.db.commit()

    async def cleanup_expired(self) -> int:
        """Clean up expired verifications"""
        from datetime import datetime
        res = await self.db.execute(
            select(EmailVerification).where(EmailVerification.expires_at < datetime.utcnow())
        )
        expired = list(res.scalars().all())
        
        for verification in expired:
            await self.db.delete(verification)
        
        await self.db.commit()
        return len(expired)
