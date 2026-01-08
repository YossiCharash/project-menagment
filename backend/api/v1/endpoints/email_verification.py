from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from backend.core.deps import DBSessionDep
from backend.core.config import settings
from backend.schemas.email_verification import (
    EmailVerificationRequest, 
    EmailVerificationConfirm, 
    EmailVerificationStatus
)
from backend.repositories.email_verification_repository import EmailVerificationRepository
from backend.services.email_service import EmailService
from backend.services.auth_service import AuthService
from backend.models.email_verification import EmailVerification
from backend.models.user import UserRole


router = APIRouter()


@router.post("/send", response_model=EmailVerificationStatus)
async def send_verification_email(
    db: DBSessionDep,
    request: EmailVerificationRequest
):
    """Send email verification code or link"""
    verification_repo = EmailVerificationRepository(db)
    email_service = EmailService()
    
    # Check if user already exists
    auth_service = AuthService(db)
    existing_user = await auth_service.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Check if there's already a pending verification
    existing_verification = await verification_repo.get_by_email_and_type(
        request.email, 
        request.verification_type
    )
    
    if existing_verification and not existing_verification.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification already sent. Please wait before requesting another."
        )
    
    # Group code validation removed - members are now created by admin only
    group_id = None

    # Create verification with both code and token (support both methods)
    verification_code = EmailVerification.generate_verification_code()
    verification_token = EmailVerification.generate_verification_token()
    
    verification = EmailVerification(
        email=request.email,
        verification_code=verification_code,
        verification_token=verification_token,
        verification_type=request.verification_type,
        full_name=request.full_name,
        group_id=group_id,
        role=UserRole.ADMIN.value if request.verification_type == 'admin_register' else UserRole.MEMBER.value,
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    
    created_verification = await verification_repo.create(verification)
    
    # Send email with both code and link (user can use either)
    verification_link = f"{settings.FRONTEND_URL}/email-register?token={verification_token}"
    email_sent = await email_service.send_verification_email(
        email=request.email,
        verification_code=created_verification.verification_code,
        verification_link=verification_link,
        full_name=request.full_name,
        verification_type=request.verification_type
    )
    
    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email"
        )
    
    return EmailVerificationStatus(
        email=request.email,
        verification_sent=True,
        message="Verification email sent successfully"
    )


@router.post("/confirm", response_model=dict)
async def confirm_verification(
    db: DBSessionDep,
    request: EmailVerificationConfirm
):
    """Confirm verification using either code or token"""
    verification_repo = EmailVerificationRepository(db)
    auth_service = AuthService(db)
    
    # Get verification by code or token
    verification = None
    if request.verification_code:
        verification = await verification_repo.get_by_code(request.verification_code)
    elif request.verification_token:
        verification = await verification_repo.get_by_token(request.verification_token)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either verification_code or verification_token must be provided"
        )
    
    if not verification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid verification code or token"
        )
    
    # Check if verification is valid
    if not verification.is_valid():
        if verification.is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification has already been used"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification has expired"
            )
    
    # Check email matches (if provided)
    if request.email and verification.email != request.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email does not match verification"
        )
    
        # Create user based on verification type with email verified
    if verification.verification_type == 'admin_register':
        user = await auth_service.register(
            email=verification.email,
            full_name=verification.full_name,
            password=request.password,
            role=UserRole.ADMIN.value,
            email_verified=True  # Email is verified through this flow
        )
    elif verification.verification_type == 'member_register':
        user = await auth_service.register(
            email=verification.email,
            full_name=verification.full_name,
            password=request.password,
            role=UserRole.MEMBER.value,
            group_id=verification.group_id,
            email_verified=True  # Email is verified through this flow
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification type"
        )

    # Mark verification as used
    verification.is_verified = True
    verification.verified_at = datetime.utcnow()
    await verification_repo.update(verification)
    
    return {
        "message": "Email verified and user created successfully",
        "user_id": user.id,
        "email": user.email
    }
