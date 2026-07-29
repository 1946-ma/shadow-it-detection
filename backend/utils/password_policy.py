import re

# Applies only to newly-created/changed passwords going forward (POST
# /api/auth/users and /api/auth/change-password) — db/seed.py's demo
# credentials (admin/admin123, viewer/viewer123) are intentionally left
# untouched and are never run through this validator.
MIN_LENGTH = 12

_COMMON_WEAK_PASSWORDS = {
    "password", "password1", "password123", "admin123", "administrator",
    "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
    "letmein", "changeme", "welcome1", "iloveyou", "abc12345",
    "sunshine1", "princess1", "dragon123", "monkey123", "football1",
}


def validate_password(password: str) -> list[str]:
    """Return a list of validation error strings; empty list = valid."""
    errors = []
    password = password or ""

    if len(password) < MIN_LENGTH:
        errors.append(f"Password must be at least {MIN_LENGTH} characters")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain an uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain a lowercase letter")
    if not re.search(r"\d", password):
        errors.append("Password must contain a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must contain a special character")
    if password.lower() in _COMMON_WEAK_PASSWORDS:
        errors.append("Password is too common — choose a less predictable password")

    return errors
