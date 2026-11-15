"""Unit tests for AST and Tree-sitter code parser."""

from __future__ import annotations

from app.codeintel.parser import parse_python_source, path_to_module_name


def test_path_to_module_name() -> None:
    assert path_to_module_name("service/auth.py") == "service.auth"
    assert path_to_module_name("service/__init__.py") == "service"
    assert path_to_module_name("orders.py") == "orders"
    assert path_to_module_name("") == ""


def test_parse_functions_and_classes() -> None:
    source = '''"""Example module docstring."""

from service.errors import AuthenticationError


def verify_token(token: str) -> bool:
    """Validates bearer tokens."""
    if not token:
        raise AuthenticationError()
    return True


class OrderManager:
    """Manages orders."""

    def __init__(self) -> None:
        pass

    def create_order(self, token: str) -> None:
        """Creates an order."""
        verify_token(token)
'''

    parsed = parse_python_source("service/test_sample.py", source)
    assert parsed.tree_sitter_valid is True
    assert parsed.tree_sitter_node_count > 0
    assert parsed.line_count == len(source.splitlines())

    symbol_names = {s.name for s in parsed.symbols}
    assert "verify_token" in symbol_names
    assert "OrderManager" in symbol_names
    assert "__init__" in symbol_names
    assert "create_order" in symbol_names

    token_fn = next(s for s in parsed.symbols if s.name == "verify_token")
    assert token_fn.kind == "function"
    assert token_fn.qualified_name == "service.test_sample.verify_token"
    assert token_fn.docstring == "Validates bearer tokens."
    assert token_fn.start_line == 6
    assert token_fn.end_line == 10

    order_cls = next(s for s in parsed.symbols if s.name == "OrderManager")
    assert order_cls.kind == "class"
    assert order_cls.qualified_name == "service.test_sample.OrderManager"
    assert order_cls.docstring == "Manages orders."

    create_fn = next(s for s in parsed.symbols if s.name == "create_order")
    assert create_fn.kind == "method"
    assert create_fn.parent_class == "OrderManager"
    assert create_fn.qualified_name == "service.test_sample.OrderManager.create_order"

    # Check calls
    calls = parsed.calls
    verify_calls = [c for c in calls if c.callee_name == "verify_token"]
    assert len(verify_calls) == 1
    assert verify_calls[0].caller_qualified_name == "service.test_sample.OrderManager.create_order"


def test_parse_syntax_error_graceful() -> None:
    bad_code = "def invalid_syntax(:\n    pass\n"
    # AST parse will raise SyntaxError
    import pytest

    with pytest.raises(SyntaxError):
        parse_python_source("service/bad.py", bad_code)
