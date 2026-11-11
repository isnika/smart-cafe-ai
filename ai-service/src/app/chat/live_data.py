"""Adapter đọc catalog, availability và order từ Backend nghiệp vụ.

AI service không query chéo database của Catalog/Order Service. Backend cung cấp
hai endpoint read-only đã chuẩn hóa; adapter này chuyển response thành câu trả
lời grounded. Khi API không cấu hình hoặc bị lỗi, caller tự quyết định
fallback và tuyệt đối không coi catalog tĩnh là tồn kho thời gian thực.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

from src.app.core.config import Settings, get_settings

from .intent import Intent
from .schemas import SourceChunk

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LiveVariant:
    id: str
    name: str
    price: int | None
    is_available: bool | None
    unavailable_reason: str | None = None


@dataclass(frozen=True)
class LiveProduct:
    id: str
    name: str
    description: str = ""
    temperature: str = ""
    caffeine_level: str = ""
    flavor_tags: tuple[str, ...] = ()
    variants: tuple[LiveVariant, ...] = ()
    branch_name: str | None = None
    updated_at: str | None = None


@dataclass(frozen=True)
class LiveCatalogResult:
    products: tuple[LiveProduct, ...]
    authoritative: bool = True


@dataclass(frozen=True)
class LiveOrder:
    order_code: str
    status: str
    payment_status: str
    fulfillment_type: str = ""
    branch_name: str = ""
    updated_at: str = ""


def _integer(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in {0, 1}:
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "available", "yes"}:
            return True
        if normalized in {"false", "0", "unavailable", "no"}:
            return False
    return None


def _records(payload: Any, *keys: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _records(value, *keys)
            if nested:
                return nested
    return []


def _parse_product(item: dict[str, Any]) -> LiveProduct | None:
    name = str(item.get("name") or item.get("product_name") or "").strip()
    product_id = str(item.get("id") or item.get("product_id") or "").strip()
    if not name or not product_id:
        return None
    raw_variants = _records(item, "variants", "product_variants", "items")
    if not raw_variants and any(key in item for key in ("price", "price_vnd")):
        raw_variants = [item]
    variants: list[LiveVariant] = []
    for raw in raw_variants:
        variants.append(LiveVariant(
            id=str(raw.get("id") or raw.get("variant_id") or product_id),
            name=str(raw.get("name") or raw.get("variant_name") or "Standard").strip(),
            price=_integer(raw.get("price", raw.get("price_vnd"))),
            is_available=_optional_bool(raw.get("is_available")),
            unavailable_reason=(
                str(raw.get("unavailable_reason")).strip()
                if raw.get("unavailable_reason") else None
            ),
        ))
    tags = item.get("flavor_tags") or []
    if isinstance(tags, str):
        tags = [value.strip() for value in re.split(r"[,|]", tags) if value.strip()]
    if not isinstance(tags, list):
        tags = []
    return LiveProduct(
        id=product_id,
        name=name,
        description=str(item.get("description") or "").strip(),
        temperature=str(item.get("temperature") or "").strip(),
        caffeine_level=str(item.get("caffeine_level") or "").strip(),
        flavor_tags=tuple(str(tag) for tag in tags),
        variants=tuple(variants),
        branch_name=(str(item.get("branch_name")).strip() if item.get("branch_name") else None),
        updated_at=(str(item.get("updated_at")).strip() if item.get("updated_at") else None),
    )


def _money(value: int) -> str:
    return f"{value:,}".replace(",", ".") + "đ"


def _variant_prices(product: LiveProduct) -> str:
    priced = [variant for variant in product.variants if variant.price is not None]
    if not priced:
        return "chưa có giá được xác nhận"
    if len(priced) == 1 and priced[0].name.lower() in {"standard", "mặc định"}:
        return _money(priced[0].price or 0)
    return ", ".join(f"{item.name}: {_money(item.price or 0)}" for item in priced[:6])


def _catalog_source(product: LiveProduct) -> SourceChunk:
    details = [f"Mã sản phẩm: {product.id}", f"Tên: {product.name}"]
    if product.description:
        details.append(f"Mô tả: {product.description}")
    for variant in product.variants:
        details.append(
            f"Biến thể {variant.name}: "
            f"{_money(variant.price) if variant.price is not None else 'chưa có giá'}, "
            f"availability={variant.is_available}"
        )
    return SourceChunk(
        source="operational-catalog-api",
        category="live-catalog",
        heading=product.name,
        score=1.0,
        content="\n".join(details),
    )


def format_catalog_answer(
    intent: Intent,
    products: tuple[LiveProduct, ...],
    branch_id: int | None,
) -> tuple[str, list[SourceChunk]]:
    sources = [_catalog_source(product) for product in products[:8]]
    if not products:
        return (
            "Mình không tìm thấy món phù hợp trong menu hiện hành. "
            "Bạn thử cho mình tên món chính xác hơn nhé!",
            [],
        )
    if intent is Intent.PRODUCT_PRICE:
        values = "; ".join(f"{p.name}: {_variant_prices(p)}" for p in products[:6])
        return f"Giá hiện tại: {values}.", sources
    if intent is Intent.PRODUCT_AVAILABILITY:
        if branch_id is None:
            names = ", ".join(product.name for product in products[:6])
            return (
                f"{names} có trong menu hiện hành. Bạn chọn chi nhánh để mình "
                "kiểm tra tình trạng còn món theo thời gian thực nhé!",
                sources,
            )
        available: list[str] = []
        unavailable: list[str] = []
        unknown: list[str] = []
        for product in products[:6]:
            states = [variant.is_available for variant in product.variants]
            if any(state is True for state in states):
                available.append(product.name)
            elif states and all(state is False for state in states):
                unavailable.append(product.name)
            else:
                unknown.append(product.name)
        parts: list[str] = []
        if available:
            parts.append(f"Chi nhánh đang có thể bán {', '.join(available)}")
        if unavailable:
            parts.append(f"hiện tạm hết {', '.join(unavailable)}")
        if unknown:
            parts.append(f"chưa xác nhận tồn món cho {', '.join(unknown)}")
        return ". ".join(parts) + ".", sources
    if intent is Intent.PRODUCT_COMPARISON:
        rows = []
        for product in products[:4]:
            detail = product.description or "chưa có mô tả"
            rows.append(f"{product.name}: {_variant_prices(product)}; {detail}")
        return "So sánh theo menu hiện tại: " + ". ".join(rows) + ".", sources
    if intent is Intent.PRODUCT_FILTER:
        rows = "; ".join(f"{product.name} ({_variant_prices(product)})" for product in products[:6])
        return f"Các món phù hợp là {rows}.", sources
    if intent in {
        Intent.PRODUCT_DETAIL,
        Intent.PRODUCT_INFO,
        Intent.PRODUCT_INTEREST,
    }:
        rows: list[str] = []
        for product in products[:4]:
            details = [item for item in (
                product.description,
                f"nhiệt độ: {product.temperature}" if product.temperature else "",
                f"caffeine: {product.caffeine_level}" if product.caffeine_level else "",
                f"giá: {_variant_prices(product)}",
            ) if item]
            rows.append(f"{product.name}: {'; '.join(details)}")
        return ". ".join(rows) + ".", sources
    if intent in {Intent.MENU_QUERY, Intent.PRODUCT_RECOMMENDATION}:
        rows = []
        for product in products[:6]:
            description = f"; {product.description}" if product.description else ""
            rows.append(f"{product.name} ({_variant_prices(product)}{description})")
        prefix = "Một số món trong menu hiện tại: "
        if intent is Intent.PRODUCT_RECOMMENDATION:
            prefix = "Bạn có thể tham khảo: "
        return prefix + "; ".join(rows) + ".", sources
    return "Mình tìm thấy " + ", ".join(product.name for product in products[:6]) + ".", sources


_ORDER_STATUS_LABELS = {
    "Pending_Payment": "đang chờ thanh toán",
    "Pending": "đang chờ xác nhận",
    "Confirmed": "đã được xác nhận",
    "Preparing": "đang được chuẩn bị",
    "Ready": "đã sẵn sàng",
    "Shipping": "đang giao",
    "Served": "đã phục vụ",
    "Completed": "đã hoàn tất",
    "Cancelled": "đã hủy",
    "Rejected": "đã bị từ chối",
}


def format_order_answer(order: LiveOrder) -> str:
    status = _ORDER_STATUS_LABELS.get(order.status, order.status.replace("_", " ").lower())
    payment = {
        "Unpaid": "chưa thanh toán",
        "Paid": "đã thanh toán",
        "Partially_Refunded": "đã hoàn một phần",
        "Refunded": "đã hoàn tiền",
    }.get(order.payment_status, order.payment_status.replace("_", " ").lower())
    return f"Đơn {order.order_code} {status} và {payment}."


class OperationalDataClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.data_api_base_url)

    def _headers(self, authorization: str | None = None) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.data_api_key:
            headers["X-API-Key"] = self.settings.data_api_key
        if authorization:
            headers["Authorization"] = authorization
        return headers

    async def search_catalog(
        self,
        query: str,
        intent: Intent,
        branch_id: int | None,
    ) -> LiveCatalogResult | None:
        if not self.enabled:
            return None
        url = self.settings.data_api_base_url + "/" + self.settings.data_api_catalog_path.lstrip("/")
        params: dict[str, str | int] = {"q": query, "intent": intent.value}
        if branch_id is not None:
            params["branch_id"] = branch_id
        try:
            async with httpx.AsyncClient(timeout=self.settings.data_api_timeout_seconds) as client:
                response = await client.get(url, params=params, headers=self._headers())
                response.raise_for_status()
            raw_products = _records(response.json(), "products", "items", "data")
            products = tuple(filter(None, (_parse_product(item) for item in raw_products)))
            return LiveCatalogResult(products=products)
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            # Không log URL/query vì có thể chứa tên, mã đơn hoặc PII.
            logger.warning(
                "Operational catalog API không khả dụng (error_type=%s)",
                type(exc).__name__,
            )
            return None

    async def lookup_order(
        self,
        order_code: str,
        authorization: str | None,
    ) -> LiveOrder | None:
        if not self.enabled or not authorization:
            return None
        encoded_code = quote(order_code, safe="")
        path = self.settings.data_api_order_path.replace(":order_code", encoded_code).format(
            order_code=encoded_code
        )
        url = self.settings.data_api_base_url + "/" + path.lstrip("/")
        try:
            async with httpx.AsyncClient(timeout=self.settings.data_api_timeout_seconds) as client:
                response = await client.get(url, headers=self._headers(authorization))
                if response.status_code == 404:
                    return None
                response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
                payload = payload["data"]
            if not isinstance(payload, dict):
                return None
            code = str(payload.get("order_code") or order_code).strip()
            status = str(payload.get("status") or "").strip()
            if not code or not status:
                return None
            return LiveOrder(
                order_code=code,
                status=status,
                payment_status=str(payload.get("payment_status") or "").strip(),
                fulfillment_type=str(payload.get("fulfillment_type") or "").strip(),
                branch_name=str(payload.get("branch_name") or "").strip(),
                updated_at=str(payload.get("updated_at") or "").strip(),
            )
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning(
                "Operational order API không khả dụng (error_type=%s)",
                type(exc).__name__,
            )
            return None
