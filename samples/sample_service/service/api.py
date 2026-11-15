"""HTTP handler endpoints routing requests to service modules."""

from __future__ import annotations

from typing import Any

from service.orders import OrderManager

order_manager = OrderManager()


def handle_create_order(request_data: dict[str, Any]) -> dict[str, Any]:
    """Endpoint handling customer order submissions."""
    token = request_data.get("token", "")
    items = request_data.get("items", [])
    shipping_tier = request_data.get("shipping_tier", "standard")
    discount_code = request_data.get("discount_code")

    order = order_manager.create_order(
        token=token,
        items=items,
        shipping_tier=shipping_tier,
        discount_code=discount_code,
    )
    return {
        "status": "success",
        "order": order,
    }


def handle_get_order(order_id: str) -> dict[str, Any]:
    """Endpoint fetching order status by ID."""
    order = order_manager.get_order(order_id)
    return {
        "status": "success",
        "order": order,
    }


def handle_health_check() -> dict[str, str]:
    """Endpoint returning service health status."""
    return {"status": "ok", "service": "sample_service"}
