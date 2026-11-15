"""Pricing, fee calculation, and discount computation module."""

from __future__ import annotations


def calculate_discount(amount: float, discount_code: str | None = None) -> float:
    """Calculates applicable discount deduction based on discount code."""
    if not discount_code:
        return 0.0
    code = discount_code.strip().upper()
    if code == "SAVE10":
        return round(amount * 0.10, 2)
    if code == "SAVE20":
        return round(amount * 0.20, 2)
    return 0.0


def calculate_tax(amount: float, tax_rate: float = 0.10) -> float:
    """Calculates sales tax based on taxable amount and tax rate."""
    if amount <= 0:
        return 0.0
    return round(amount * tax_rate, 2)


def calculate_fee(amount: float, shipping_tier: str = "standard") -> float:
    """Calculates order processing and shipping fee based on tier and amount."""
    tier = shipping_tier.strip().lower()
    if tier == "express":
        return 15.0
    if tier == "priority":
        return 10.0
    return 5.0


def calculate_total(
    amount: float,
    shipping_tier: str = "standard",
    discount_code: str | None = None,
) -> float:
    """Computes total payable amount including discounts, fees, and tax."""
    discount = calculate_discount(amount, discount_code)
    discounted_amount = max(0.0, amount - discount)
    fee = calculate_fee(amount, shipping_tier)
    tax = calculate_tax(discounted_amount)
    return round(discounted_amount + fee + tax, 2)
