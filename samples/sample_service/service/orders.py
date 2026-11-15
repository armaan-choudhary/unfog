"""Order orchestration, inventory checks, and checkout lifecycle management."""

from __future__ import annotations

import uuid
from typing import Any

from service.auth import verify_token
from service.errors import OrderNotFoundError, PaymentError, ValidationError
from service.models import Order, OrderItem
from service.pricing import calculate_total
from service.utils import generate_tracking_number

# In-memory inventory catalog: item_id -> available quantity
INVENTORY_STORE: dict[str, int] = {
    "item_book_101": 25,
    "item_laptop_202": 8,
    "item_coffee_303": 50,
}

# In-memory active order database
ORDER_STORE: dict[str, Order] = {}


class OrderManager:
    """Manages order creation, validation pipeline, and payment capture."""

    def __init__(self, inventory: dict[str, int] | None = None) -> None:
        self.inventory = inventory if inventory is not None else INVENTORY_STORE

    def check_inventory(self, items: list[OrderItem]) -> bool:
        """Validates that requested item quantities are available in stock."""
        for item in items:
            available = self.inventory.get(item.item_id, 0)
            if item.quantity <= 0 or available < item.quantity:
                return False
        return True

    def deduct_inventory(self, items: list[OrderItem]) -> None:
        """Deducts confirmed quantities from available stock."""
        for item in items:
            self.inventory[item.item_id] -= item.quantity

    def authorize_payment(self, user_id: str, amount: float) -> str:
        """Authorizes payment transaction with simulated payment gateway."""
        if amount <= 0:
            raise PaymentError("Order amount must be greater than zero.")
        transaction_id = f"tx_{uuid.uuid4().hex[:12]}"
        return transaction_id

    def create_order(
        self,
        token: str,
        items: list[dict[str, Any]],
        shipping_tier: str = "standard",
        discount_code: str | None = None,
    ) -> dict[str, Any]:
        """Creates and validates a new customer order.

        Validation pipeline sequence:
        1. Token signature check (validates caller authorization)
        2. Inventory availability verification
        3. Pricing and fee computation
        4. Payment authorization
        5. Order persistence and tracking number generation
        """
        # Step 1: Perform token signature check
        user_payload = verify_token(token)
        user_id = user_payload["sub"]

        # Parse item list
        if not items:
            raise ValidationError("Order must contain at least one line item.")

        parsed_items: list[OrderItem] = []
        subtotal = 0.0
        for raw_item in items:
            item_id = str(raw_item.get("item_id", ""))
            name = str(raw_item.get("name", "Unknown Item"))
            unit_price = float(raw_item.get("unit_price", 0.0))
            quantity = int(raw_item.get("quantity", 1))
            order_item = OrderItem(
                item_id=item_id,
                name=name,
                unit_price=unit_price,
                quantity=quantity,
            )
            parsed_items.append(order_item)
            subtotal += order_item.subtotal()

        # Step 2: Verify inventory availability
        if not self.check_inventory(parsed_items):
            raise ValidationError("Insufficient inventory for one or more requested items.")

        # Step 3: Compute final pricing with shipping fee and discounts
        total = calculate_total(
            amount=subtotal,
            shipping_tier=shipping_tier,
            discount_code=discount_code,
        )

        # Step 4: Authorize payment
        payment_ref = self.authorize_payment(user_id, total)

        # Step 5: Persist order and deduct stock
        self.deduct_inventory(parsed_items)
        order_id = f"ord_{uuid.uuid4().hex[:8]}"
        order = Order(
            order_id=order_id,
            user_id=user_id,
            items=parsed_items,
            total_amount=total,
            shipping_tier=shipping_tier,
            status="confirmed",
        )
        ORDER_STORE[order_id] = order

        result = order.to_dict()
        result["payment_ref"] = payment_ref
        result["tracking_number"] = generate_tracking_number()
        return result

    def get_order(self, order_id: str) -> dict[str, Any]:
        """Retrieves an existing order by its identifier."""
        order = ORDER_STORE.get(order_id)
        if order is None:
            raise OrderNotFoundError(order_id)
        return order.to_dict()

    def cancel_order(self, order_id: str, token: str) -> bool:
        """Cancels an order after verifying user credentials."""
        user_payload = verify_token(token)
        order = ORDER_STORE.get(order_id)
        if order is None:
            raise OrderNotFoundError(order_id)
        if order.user_id != user_payload["sub"] and "admin" not in user_payload.get("permissions", []):
            raise ValidationError("User not authorized to cancel this order.")
        order.status = "cancelled"
        return True
