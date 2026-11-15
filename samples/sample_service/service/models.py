"""Domain models and dataclasses for sample microservice."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class User:
    """Represents an authenticated service user."""

    user_id: str
    username: str
    email: str
    roles: list[str] = field(default_factory=lambda: ["user"])

    def has_role(self, role: str) -> bool:
        """Check if user has a specific authorization role."""
        return role in self.roles


@dataclass
class OrderItem:
    """Represents an individual line item in an order."""

    item_id: str
    name: str
    unit_price: float
    quantity: int = 1

    def subtotal(self) -> float:
        """Calculate line item subtotal."""
        return round(self.unit_price * self.quantity, 2)


@dataclass
class Order:
    """Represents a customer order lifecycle record."""

    order_id: str
    user_id: str
    items: list[OrderItem]
    total_amount: float
    shipping_tier: str = "standard"
    status: str = "pending"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        """Convert order record to dictionary representation."""
        return {
            "order_id": self.order_id,
            "user_id": self.user_id,
            "items": [
                {
                    "item_id": item.item_id,
                    "name": item.name,
                    "unit_price": item.unit_price,
                    "quantity": item.quantity,
                }
                for item in self.items
            ],
            "total_amount": self.total_amount,
            "shipping_tier": self.shipping_tier,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }
