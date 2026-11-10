from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def normalize_indian_phone(value: str) -> str:
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise ValueError("Enter a valid Indian mobile number")
    return f"+91{digits}"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PhoneRequest(StrictModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return normalize_indian_phone(value)


class VerifyOtpRequest(PhoneRequest):
    otp: str = Field(pattern=r"^\d{6}$")


class CompleteProfileRequest(StrictModel):
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Display name is required")
        return cleaned


class UpdateProfileRequest(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None

    @field_validator("display_name")
    @classmethod
    def clean_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Display name cannot be empty")
        return cleaned

    @model_validator(mode="after")
    def require_change(self) -> "UpdateProfileRequest":
        if not self.model_fields_set:
            raise ValueError("At least one profile field is required")
        if "display_name" in self.model_fields_set and self.display_name is None:
            raise ValueError("Display name cannot be null")
        return self


class UserResponse(BaseModel):
    id: UUID
    phone: str
    display_name: str
    email: str | None
    phone_verified_at: datetime | None
    created_at: datetime

    @classmethod
    def from_user(cls, user: object) -> "UserResponse":
        return cls(
            id=getattr(user, "id"),
            phone=getattr(user, "phone_e164"),
            display_name=getattr(user, "display_name"),
            email=getattr(user, "email_normalized"),
            phone_verified_at=getattr(user, "phone_verified_at"),
            created_at=getattr(user, "created_at"),
        )


class OtpRequestResponse(BaseModel):
    status: Literal["accepted"] = "accepted"
    expires_in_seconds: int
    resend_after_seconds: int
    development_otp: str | None = None


class VerifyOtpResponse(BaseModel):
    status: Literal["authenticated", "profile_required"]
    user: UserResponse | None = None


class AuthenticationResponse(BaseModel):
    status: Literal["authenticated"] = "authenticated"
    user: UserResponse
