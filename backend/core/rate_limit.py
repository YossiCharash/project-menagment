"""
Simple in-memory rate limiter for authentication endpoints.
Prevents brute-force attacks on login, registration, and password reset.
"""
import time
from collections import defaultdict
from fastapi import HTTPException, Request, status


class RateLimiter:
    """In-memory rate limiter using sliding window."""
    
    def __init__(self):
        # {key: [(timestamp, ...),]}
        self._requests: dict[str, list[float]] = defaultdict(list)
    
    def _cleanup(self, key: str, window_seconds: int):
        """Remove expired entries."""
        cutoff = time.monotonic() - window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]
    
    def check(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Check if the request is allowed.
        Returns True if allowed, False if rate limited.
        """
        self._cleanup(key, window_seconds)
        if len(self._requests[key]) >= max_requests:
            return False
        self._requests[key].append(time.monotonic())
        return True
    
    def get_retry_after(self, key: str, window_seconds: int) -> int:
        """Get seconds until the oldest request expires."""
        if not self._requests[key]:
            return 0
        oldest = min(self._requests[key])
        return max(1, int(window_seconds - (time.monotonic() - oldest)))


# Global rate limiter instance
_limiter = RateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, considering proxy headers."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def rate_limit(max_requests: int = 10, window_seconds: int = 60):
    """
    FastAPI dependency for rate limiting.
    
    Args:
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds
    """
    async def _rate_limit_dep(request: Request):
        client_ip = get_client_ip(request)
        endpoint = request.url.path
        key = f"{client_ip}:{endpoint}"
        
        if not _limiter.check(key, max_requests, window_seconds):
            retry_after = _limiter.get_retry_after(key, window_seconds)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
    
    return _rate_limit_dep
