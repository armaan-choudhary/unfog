"""Domain exception classes for the sample microservice."""

from __future__ import annotations


class ServiceError(Exception):
    """Base exception for all service domain errors."""

    def __init__(self, message: str, code: str = "service_error") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class AuthenticationError(ServiceError):
    """Raised when authentication credentials or token are invalid."""

    def __init__(self, message: str = "Invalid credentials or token.") -> None:
        super().__init__(message, code="authentication_error")


class ValidationError(ServiceError):
    """Raised when input parameters fail domain validation rules."""

    def __init__(self, message: str = "Validation failed.") -> None:
        super().__init__(message, code="validation_error")


class OrderNotFoundError(ServiceError):
    """Raised when an order lookup fails to find a matching record."""

    def __init__(self, order_id: str) -> None:
        super().__init__(f"Order {order_id} not found.", code="order_not_found")


class PaymentError(ServiceError):
    """Raised when payment processing or authorization fails."""

    def __init__(self, message: str = "Payment authorization rejected.") -> None:
        super().__init__(message, code="payment_error")
