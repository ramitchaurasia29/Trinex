from app.core.config import get_settings


class OtpDeliveryUnavailable(RuntimeError):
    """Raised when no production SMS delivery adapter is configured."""


async def deliver_otp(phone_e164: str, otp: str) -> None:
    """Deliver an OTP without ever logging its value or destination."""
    settings = get_settings()
    if settings.environment == "development" and settings.sms_provider == "development":
        return
    raise OtpDeliveryUnavailable("OTP delivery is unavailable")
