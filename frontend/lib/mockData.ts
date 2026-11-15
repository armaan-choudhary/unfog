import {
  SourceGraph,
  FileDetailResponse,
  LearningChallenge,
  AiExplainResponse,
  AiChatResponse,
  ChallengeEvaluationResponse,
} from "./types";

export const MOCK_SNAPSHOT_ID = "b87c1f80-928d-4a11-8557-fa29bebc3a01";
export const MOCK_REPO_ID = "a1b2c3d4-e5f6-4a12-8b3c-4d5e6f7a8b9c";

export const MOCK_FILE_CONTENTS: Record<string, FileDetailResponse> = {
  "service/auth.py": {
    path: "service/auth.py",
    language: "python",
    line_count: 36,
    content_hash:
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    content: `"""Authentication and token verification service."""
import hashlib
import hmac
import time
from typing import Optional, Dict, Any

SECRET_KEY = "unfog-sample-service-secret-key"
ALGORITHM = "HS256"


def verify_token(token: str) -> Dict[str, Any]:
    """Validates incoming bearer tokens and returns payload."""
    if not token or not token.startswith("Bearer "):
        raise ValueError("Invalid authorization header format")
    raw_token = token.split(" ", 1)[1]
    parts = raw_token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT token segments")
    # Verify cryptographic signature and expiry
    header, payload, signature = parts
    expected_sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_sig):
        raise PermissionError("Signature verification failed")
    return {"sub": "user_42", "scope": "orders:write", "exp": time.time() + 3600}


def hash_password(password: str, salt: str = "salt123") -> str:
    """Generates secure sha256 hash for passwords."""
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def create_session(user_id: str, scope: str) -> str:
    """Creates a new user session and returns bearer token."""
    header = "eyJhbGciOiJIUzI1NiJ9"
    payload = f"user_{user_id}_{scope}"
    sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"Bearer {header}.{payload}.{sig}"
`,
    symbols: [
      {
        id: "s1000000-0000-4000-8000-000000000001",
        name: "verify_token",
        kind: "function",
        range: { start_line: 12, end_line: 25 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000002",
        name: "hash_password",
        kind: "function",
        range: { start_line: 28, end_line: 30 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000003",
        name: "create_session",
        kind: "function",
        range: { start_line: 33, end_line: 38 },
      },
    ],
  },

  "service/orders.py": {
    path: "service/orders.py",
    language: "python",
    line_count: 42,
    content_hash:
      "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    content: `"""Order processing workflow module."""
from typing import Dict, Any, List
from service.auth import verify_token
from service.pricing import calculate_fee
from service.database import get_db_session
from service.errors import ValidationError, InsufficientInventoryError


class OrderProcessor:
    """Coordinates order creation, payment validation, and inventory deduction."""

    def __init__(self, db_session=None):
        self.db = db_session or get_db_session()

    def process_order(self, auth_header: str, order_data: Dict[str, Any]) -> Dict[str, Any]:
        """Main order processing pipeline."""
        # Step 1: Token verification
        user_info = verify_token(auth_header)
        
        # Step 2: Validate inventory availability
        items: List[Dict[str, Any]] = order_data.get("items", [])
        if not items:
            raise ValidationError("Order must contain at least one line item")
        for item in items:
            if item.get("quantity", 0) <= 0:
                raise ValidationError(f"Invalid quantity for item {item.get('id')}")

        # Step 3: Compute fees and taxes
        subtotal = float(order_data.get("amount", 0.0))
        shipping_mode = order_data.get("shipping_mode", "standard")
        fee = calculate_fee(subtotal, shipping_mode)
        total = subtotal + fee

        # Step 4: Persist order
        order_record = {
            "order_id": "ord_98712",
            "user_id": user_info["sub"],
            "total": total,
            "status": "confirmed"
        }
        return order_record
`,
    symbols: [
      {
        id: "s1000000-0000-4000-8000-000000000004",
        name: "OrderProcessor",
        kind: "class",
        range: { start_line: 9, end_line: 42 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000005",
        name: "process_order",
        kind: "method",
        range: { start_line: 14, end_line: 42 },
      },
    ],
  },

  "service/pricing.py": {
    path: "service/pricing.py",
    language: "python",
    line_count: 28,
    content_hash:
      "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    content: `"""Pricing, fee calculation, and discount engine."""


def calculate_fee(amount: float, shipping_mode: str = "standard") -> float:
    """Calculates shipping and handling fees based on subtotal and shipping tier.
    
    Standard shipping fee is 5.0 for amounts >= 50, otherwise 8.0.
    Express shipping adds 10.0 flat rate.
    """
    if amount <= 0:
        return 0.0
    
    base_fee = 5.0 if amount >= 50.0 else 8.0
    if shipping_mode == "express":
        return base_fee + 10.0
    elif shipping_mode == "standard":
        return base_fee
    elif shipping_mode == "economy":
        return 2.5
    return base_fee


def apply_discount(subtotal: float, coupon_code: str) -> float:
    """Applies percentage or fixed discount to order subtotal."""
    if coupon_code == "UNFOG20":
        return max(0.0, subtotal * 0.8)
    return subtotal
`,
    symbols: [
      {
        id: "s1000000-0000-4000-8000-000000000006",
        name: "calculate_fee",
        kind: "function",
        range: { start_line: 4, end_line: 20 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000007",
        name: "apply_discount",
        kind: "function",
        range: { start_line: 23, end_line: 27 },
      },
    ],
  },

  "service/database.py": {
    path: "service/database.py",
    language: "python",
    line_count: 22,
    content_hash:
      "sha256:d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
    content: `"""Database session and persistence manager."""
from typing import Dict, Any


class DatabaseConnection:
    """Manages active connection pool to PostgreSQL."""

    def __init__(self, dsn: str = "postgresql://localhost:5432/orders"):
        self.dsn = dsn
        self.connected = True

    def execute_query(self, query: str, params: Dict[str, Any]):
        return {"rows_affected": 1, "status": "ok"}


def get_db_session() -> DatabaseConnection:
    """Provides singleton scoped database connection."""
    return DatabaseConnection()
`,
    symbols: [
      {
        id: "s1000000-0000-4000-8000-000000000008",
        name: "DatabaseConnection",
        kind: "class",
        range: { start_line: 5, end_line: 14 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000009",
        name: "get_db_session",
        kind: "function",
        range: { start_line: 17, end_line: 19 },
      },
    ],
  },

  "service/errors.py": {
    path: "service/errors.py",
    language: "python",
    line_count: 26,
    content_hash:
      "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
    content: `"""Standard domain exception definitions."""


class ServiceError(Exception):
    """Base exception for all domain service errors."""

    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class ValidationError(ServiceError):
    """Raised when request payload or parameters fail schema validation."""

    def __init__(self, message: str):
        super().__init__(message, code="VALIDATION_FAILED")


class InsufficientInventoryError(ServiceError):
    """Raised when requested item quantity exceeds warehouse stock."""

    def __init__(self, item_id: str):
        super().__init__(f"Item {item_id} is out of stock", code="OUT_OF_STOCK")
`,
    symbols: [
      {
        id: "s1000000-0000-4000-8000-000000000010",
        name: "ServiceError",
        kind: "class",
        range: { start_line: 4, end_line: 11 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000011",
        name: "ValidationError",
        kind: "class",
        range: { start_line: 14, end_line: 18 },
      },
      {
        id: "s1000000-0000-4000-8000-000000000012",
        name: "InsufficientInventoryError",
        kind: "class",
        range: { start_line: 21, end_line: 25 },
      },
    ],
  },
};

export const MOCK_SOURCE_GRAPH: SourceGraph = {
  schema_version: "1.0",
  snapshot: {
    id: MOCK_SNAPSHOT_ID,
    repository_id: MOCK_REPO_ID,
    repository_name: "sample_service",
    revision: {
      kind: "content_manifest",
      value: "snapshot-v1",
    },
    manifest_hash:
      "sha256:4a8b71d4e0e6498cbe638217bb7d5d2b7810ec5483fbe924d5eec3a41b212f7a",
  },
  files: [
    {
      id: "f1000000-0000-4000-8000-000000000001",
      snapshot_id: MOCK_SNAPSHOT_ID,
      path: "service/auth.py",
      language: "python",
      content_hash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      line_count: 38,
    },
    {
      id: "f1000000-0000-4000-8000-000000000002",
      snapshot_id: MOCK_SNAPSHOT_ID,
      path: "service/orders.py",
      language: "python",
      content_hash:
        "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      line_count: 42,
    },
    {
      id: "f1000000-0000-4000-8000-000000000003",
      snapshot_id: MOCK_SNAPSHOT_ID,
      path: "service/pricing.py",
      language: "python",
      content_hash:
        "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
      line_count: 28,
    },
    {
      id: "f1000000-0000-4000-8000-000000000004",
      snapshot_id: MOCK_SNAPSHOT_ID,
      path: "service/database.py",
      language: "python",
      content_hash:
        "sha256:d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
      line_count: 22,
    },
    {
      id: "f1000000-0000-4000-8000-000000000005",
      snapshot_id: MOCK_SNAPSHOT_ID,
      path: "service/errors.py",
      language: "python",
      content_hash:
        "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
      line_count: 26,
    },
  ],
  symbols: [
    {
      id: "s1000000-0000-4000-8000-000000000001",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000001",
      name: "verify_token",
      qualified_name: "service.auth.verify_token",
      kind: "function",
      language: "python",
      range: { start_line: 12, end_line: 25 },
      docstring: "Validates incoming bearer tokens and returns payload.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000002",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000001",
      name: "hash_password",
      qualified_name: "service.auth.hash_password",
      kind: "function",
      language: "python",
      range: { start_line: 28, end_line: 30 },
      docstring: "Generates secure sha256 hash for passwords.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000003",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000001",
      name: "create_session",
      qualified_name: "service.auth.create_session",
      kind: "function",
      language: "python",
      range: { start_line: 33, end_line: 38 },
      docstring: "Creates a new user session and returns bearer token.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000004",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000002",
      name: "OrderProcessor",
      qualified_name: "service.orders.OrderProcessor",
      kind: "class",
      language: "python",
      range: { start_line: 9, end_line: 42 },
      docstring:
        "Coordinates order creation, payment validation, and inventory deduction.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000005",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000002",
      name: "process_order",
      qualified_name: "service.orders.OrderProcessor.process_order",
      kind: "method",
      language: "python",
      range: { start_line: 14, end_line: 42 },
      docstring: "Main order processing pipeline.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000006",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000003",
      name: "calculate_fee",
      qualified_name: "service.pricing.calculate_fee",
      kind: "function",
      language: "python",
      range: { start_line: 4, end_line: 20 },
      docstring:
        "Calculates shipping and handling fees based on subtotal and shipping tier.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000007",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000003",
      name: "apply_discount",
      qualified_name: "service.pricing.apply_discount",
      kind: "function",
      language: "python",
      range: { start_line: 23, end_line: 27 },
      docstring: "Applies percentage or fixed discount to order subtotal.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000008",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000004",
      name: "DatabaseConnection",
      qualified_name: "service.database.DatabaseConnection",
      kind: "class",
      language: "python",
      range: { start_line: 5, end_line: 14 },
      docstring: "Manages active connection pool to PostgreSQL.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000009",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000004",
      name: "get_db_session",
      qualified_name: "service.database.get_db_session",
      kind: "function",
      language: "python",
      range: { start_line: 17, end_line: 19 },
      docstring: "Provides singleton scoped database connection.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000010",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000005",
      name: "ServiceError",
      qualified_name: "service.errors.ServiceError",
      kind: "class",
      language: "python",
      range: { start_line: 4, end_line: 11 },
      docstring: "Base exception for all domain service errors.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000011",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000005",
      name: "ValidationError",
      qualified_name: "service.errors.ValidationError",
      kind: "class",
      language: "python",
      range: { start_line: 14, end_line: 18 },
      docstring:
        "Raised when request payload or parameters fail schema validation.",
    },
    {
      id: "s1000000-0000-4000-8000-000000000012",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000005",
      name: "InsufficientInventoryError",
      qualified_name: "service.errors.InsufficientInventoryError",
      kind: "class",
      language: "python",
      range: { start_line: 21, end_line: 25 },
      docstring: "Raised when requested item quantity exceeds warehouse stock.",
    },
  ],
  citations: [
    {
      id: "c1000000-0000-4000-8000-000000000001",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000001",
      path: "service/auth.py",
      range: { start_line: 12, end_line: 25 },
      content_hash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "c1000000-0000-4000-8000-000000000002",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000002",
      path: "service/orders.py",
      range: { start_line: 18, end_line: 19 },
      content_hash:
        "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    },
    {
      id: "c1000000-0000-4000-8000-000000000003",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000003",
      path: "service/pricing.py",
      range: { start_line: 4, end_line: 20 },
      content_hash:
        "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    },
    {
      id: "c1000000-0000-4000-8000-000000000004",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000004",
      path: "service/database.py",
      range: { start_line: 17, end_line: 19 },
      content_hash:
        "sha256:d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
    },
    {
      id: "c1000000-0000-4000-8000-000000000005",
      snapshot_id: MOCK_SNAPSHOT_ID,
      file_id: "f1000000-0000-4000-8000-000000000005",
      path: "service/errors.py",
      range: { start_line: 14, end_line: 18 },
      content_hash:
        "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
    },
  ],
  edges: [
    {
      id: "e1000000-0000-4000-8000-000000000001",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000005", // process_order
      target_symbol_id: "s1000000-0000-4000-8000-000000000001", // verify_token
      kind: "calls",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000002"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
    {
      id: "e1000000-0000-4000-8000-000000000002",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000005", // process_order
      target_symbol_id: "s1000000-0000-4000-8000-000000000006", // calculate_fee
      kind: "calls",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000003"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
    {
      id: "e1000000-0000-4000-8000-000000000003",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000004", // OrderProcessor
      target_symbol_id: "s1000000-0000-4000-8000-000000000009", // get_db_session
      kind: "calls",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000004"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
    {
      id: "e1000000-0000-4000-8000-000000000004",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000005", // process_order
      target_symbol_id: "s1000000-0000-4000-8000-000000000011", // ValidationError
      kind: "references",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000005"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
    {
      id: "e1000000-0000-4000-8000-000000000005",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000011", // ValidationError
      target_symbol_id: "s1000000-0000-4000-8000-000000000010", // ServiceError
      kind: "extends",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000005"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
    {
      id: "e1000000-0000-4000-8000-000000000006",
      snapshot_id: MOCK_SNAPSHOT_ID,
      source_symbol_id: "s1000000-0000-4000-8000-000000000012", // InsufficientInventoryError
      target_symbol_id: "s1000000-0000-4000-8000-000000000010", // ServiceError
      kind: "extends",
      provenance: "static_verified",
      evidence_citation_ids: ["c1000000-0000-4000-8000-000000000005"],
      analyzer: "tree-sitter-python",
      confidence: 1.0,
    },
  ],
};

export const MOCK_CHALLENGES: LearningChallenge[] = [
  {
    id: "challenge-locate-auth",
    type: "locate",
    title: "Locate Token Verification",
    prompt:
      "Which function is responsible for validating the incoming bearer token and verifying cryptographic signatures?",
    options: [
      "verify_token",
      "hash_password",
      "create_session",
      "check_permission",
    ],
    target_path: "service/auth.py",
    hint: "Inspect `service/auth.py` around line 12. Look for the function checking header format and HMAC SHA256 digest.",
  },
  {
    id: "challenge-trace-order",
    type: "trace",
    title: "Trace Order Processing Flow",
    prompt:
      "When an order is submitted to `OrderProcessor.process_order`, what is the very first validation check performed?",
    options: [
      "Token verification (`verify_token`)",
      "Inventory availability check",
      "Calculate shipping fee",
      "Database connection test",
    ],
    target_path: "service/orders.py",
    hint: "Open `service/orders.py` and inspect the top of `process_order` method around line 18.",
  },
  {
    id: "challenge-predict-fee",
    type: "predict",
    title: "Predict Fee Calculation",
    prompt:
      'What does `calculate_fee(100.0, "standard")` return according to the pricing engine logic?',
    options: ["5.0", "8.0", "10.0", "15.0"],
    target_path: "service/pricing.py",
    hint: "Examine `calculate_fee` in `service/pricing.py`. Note the standard rate condition when amount >= 50.0.",
  },
];

export const MOCK_CHALLENGE_EVALUATIONS: Record<
  string,
  Record<string, ChallengeEvaluationResponse>
> = {
  "challenge-locate-auth": {
    verify_token: {
      is_correct: true,
      score: 100,
      feedback:
        "Correct! `verify_token` in `service/auth.py` performs the cryptographic signature check using HMAC-SHA256 and validates the token expiration timestamp.",
      citations: [
        {
          path: "service/auth.py",
          range: { start_line: 12, end_line: 25 },
          snippet:
            "def verify_token(token: str) -> Dict[str, Any]:\n    # Verify cryptographic signature and expiry",
        },
      ],
    },
    default: {
      is_correct: false,
      score: 0,
      feedback:
        "Incorrect. While other auth helpers exist, `verify_token` is the specific function that parses bearer tokens and validates their signature.",
      citations: [
        {
          path: "service/auth.py",
          range: { start_line: 12, end_line: 25 },
          snippet: "def verify_token(token: str) -> Dict[str, Any]:",
        },
      ],
    },
  },
  "challenge-trace-order": {
    "Token verification (`verify_token`)": {
      is_correct: true,
      score: 100,
      feedback:
        "Correct! `process_order` starts by immediately calling `verify_token(auth_header)` in Step 1 before attempting to parse line items or calculate fees.",
      citations: [
        {
          path: "service/orders.py",
          range: { start_line: 17, end_line: 20 },
          snippet:
            "# Step 1: Token verification\nuser_info = verify_token(auth_header)",
        },
      ],
    },
    default: {
      is_correct: false,
      score: 0,
      feedback:
        "Incorrect. Look at `OrderProcessor.process_order`: token verification happens before any inventory checks or database writes.",
      citations: [
        {
          path: "service/orders.py",
          range: { start_line: 17, end_line: 20 },
          snippet: "user_info = verify_token(auth_header)",
        },
      ],
    },
  },
  "challenge-predict-fee": {
    "5.0": {
      is_correct: true,
      score: 100,
      feedback:
        "Correct! For subtotal >= 50.0 with standard shipping, `base_fee` is 5.0 and no additional express surcharge is applied.",
      citations: [
        {
          path: "service/pricing.py",
          range: { start_line: 12, end_line: 18 },
          snippet:
            'base_fee = 5.0 if amount >= 50.0 else 8.0\nelif shipping_mode == "standard":\n    return base_fee',
        },
      ],
    },
    default: {
      is_correct: false,
      score: 0,
      feedback:
        "Incorrect. In `calculate_fee`, `base_fee` evaluates to `5.0` because `amount` (100) >= 50. For standard shipping, it returns `base_fee` directly.",
      citations: [
        {
          path: "service/pricing.py",
          range: { start_line: 12, end_line: 18 },
          snippet: "base_fee = 5.0 if amount >= 50.0 else 8.0",
        },
      ],
    },
  },
};

export const MOCK_AI_EXPLANATIONS: Record<string, AiExplainResponse> = {
  verify_token: {
    explanation:
      "### `verify_token` Overview\n\n`verify_token` in `service/auth.py` validates incoming bearer tokens using HMAC-SHA256 signature verification.\n\nKey behaviors:\n- Rejects requests without proper `Bearer <token>` prefixes.\n- Splits the JWT into header, payload, and signature segments.\n- Recomputes the expected HMAC-SHA256 digest with constant-time equality check (`hmac.compare_digest`) to prevent timing attacks.\n- Returns decoded user claims including subject identifier and permissions.",
    citations: [
      {
        path: "service/auth.py",
        range: { start_line: 12, end_line: 25 },
        snippet:
          "def verify_token(token: str) -> Dict[str, Any]:\n    # Verify cryptographic signature and expiry",
      },
    ],
    provenance: "static_verified",
    model: "gemini-2.5-flash",
  },
  OrderProcessor: {
    explanation:
      "### `OrderProcessor` Architecture\n\n`OrderProcessor` in `service/orders.py` orchestrates the complete checkout workflow:\n1. **Authentication**: Calls `verify_token` to validate requester identity.\n2. **Inventory Validation**: Checks line items and quantities, raising `ValidationError` if empty.\n3. **Pricing & Surcharge**: Invokes `calculate_fee` based on order amount and shipping tier.\n4. **Persistence**: Saves confirmed order payload using `get_db_session()`.",
    citations: [
      {
        path: "service/orders.py",
        range: { start_line: 9, end_line: 42 },
        snippet:
          'class OrderProcessor:\n    """Coordinates order creation..."""',
      },
      {
        path: "service/pricing.py",
        range: { start_line: 4, end_line: 20 },
        snippet:
          'def calculate_fee(amount: float, shipping_mode: str = "standard") -> float:',
      },
    ],
    provenance: "static_verified",
    model: "gemini-2.5-flash",
  },
  calculate_fee: {
    explanation:
      "### `calculate_fee` Logic\n\n`calculate_fee` in `service/pricing.py` computes logistics fees:\n- If order subtotal >= $50, standard rate is $5.00 (incentivizing larger orders).\n- If order subtotal < $50, standard rate is $8.00.\n- Express shipping adds an additional $10.00 surcharge.\n- Economy shipping offers a flat $2.50 discount rate.",
    citations: [
      {
        path: "service/pricing.py",
        range: { start_line: 4, end_line: 20 },
        snippet:
          'base_fee = 5.0 if amount >= 50.0 else 8.0\nif shipping_mode == "express": return base_fee + 10.0',
      },
    ],
    provenance: "static_verified",
    model: "gemini-2.5-flash",
  },
  default: {
    explanation:
      "### Code Analysis\n\nThis symbol is part of the `sample_service` microservice architecture. It interacts with the domain core via strict static type annotations and verified dependency edges.",
    citations: [
      {
        path: "service/orders.py",
        range: { start_line: 1, end_line: 42 },
        snippet: '"""Order processing workflow module."""',
      },
    ],
    provenance: "static_verified",
    model: "gemini-2.5-flash",
  },
};

export const MOCK_AI_CHAT_REPLIES: Record<string, AiChatResponse> = {
  default: {
    reply:
      "### Architecture & Flow\n\nThe `sample_service` codebase is structured around clean microservice boundaries:\n- **`service/auth.py`**: Handles token verification (`verify_token`) and cryptographic hashing.\n- **`service/orders.py`**: The `OrderProcessor` coordinates token checks, inventory validation, and pricing.\n- **`service/pricing.py`**: Houses `calculate_fee` for shipping fee computation.\n- **`service/errors.py`**: Domain hierarchy rooted in `ServiceError`.\n\nAll calls between modules are statically verified by AST analysis.",
    citations: [
      {
        path: "service/orders.py",
        range: { start_line: 9, end_line: 42 },
        snippet: "class OrderProcessor:",
      },
      {
        path: "service/auth.py",
        range: { start_line: 12, end_line: 25 },
        snippet: "def verify_token(token: str):",
      },
      {
        path: "service/errors.py",
        range: { start_line: 4, end_line: 18 },
        snippet: "class ServiceError(Exception):",
      },
    ],
    model: "gemini-2.5-flash",
  },
};
