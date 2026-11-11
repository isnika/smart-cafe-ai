"""Retriever hybrid: catalog/Markdown -> BM25 + lexical/fuzzy + dense cosine.

Phụ thuộc: numpy, sentence-transformers
Model mặc định: intfloat/multilingual-e5-small (hỗ trợ tiếng Việt, nhẹ, chạy CPU tốt).
"""
from __future__ import annotations

import hashlib
import csv
import json
import logging
import math
import os
import re
import threading
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

from .intent import (
    BUSINESS_INTENTS,
    PRODUCT_INTENTS,
    DocumentType,
    Intent,
    allowed_document_types,
)
from .normalize import canonicalize_query, fold_text, search_tokens

logger = logging.getLogger(__name__)

CHAT_DIR = Path(__file__).parent
KB_DIR = CHAT_DIR / "knowledge_base"
CACHE_DIR = CHAT_DIR / ".rag_cache"

EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
ALLOW_MODEL_DOWNLOAD = os.getenv("RAG_ALLOW_MODEL_DOWNLOAD", "true").lower() in {"1", "true", "yes"}
DISABLE_EMBEDDINGS = os.getenv("RAG_DISABLE_EMBEDDINGS", "false").lower() in {"1", "true", "yes"}
LEXICAL_WEIGHT = max(0.0, min(float(os.getenv("RAG_LEXICAL_WEIGHT", "0.30")), 1.0))
MAX_CHUNK_CHARS = 900
SUPPORTED_EXT = {".md", ".txt"}
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*\S)\s*$")

# Các từ mô tả thuộc tính không phải là tên sản phẩm. Loại chúng ra khỏi
# entity guard để "trà sữa khoai môn giá bao nhiêu" không match một món chỉ vì có từ "sữa".
_PRODUCT_ATTRIBUTE_TOKENS = {
    "bao", "nhieu", "tien", "gia", "may", "dong", "mon", "do", "uong",
    "thanh", "phan", "nguyen", "lieu", "caffeine", "huong", "vi", "ngot",
    "duong", "it", "dang", "beo", "nong", "lanh", "tuy", "chinh",
    "them", "bot", "nhieu", "topping", "size", "xem", "kiem", "tra",
    "thi", "sao", "the", "nao", "ngon",
}
_GENERIC_SINGLE_PRODUCT_TOKENS = {"da", "sua", "xay", "nong", "lanh"}
_PRODUCT_LOOKUP_INTENTS = frozenset({
    Intent.PRODUCT_AVAILABILITY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.CUSTOMIZE_DRINK,
    Intent.PRODUCT_COMPARISON,
})
_LEXICAL_FAST_PATH_INTENTS = frozenset({
    Intent.PRODUCT_AVAILABILITY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.CUSTOMIZE_DRINK,
    Intent.OPENING_HOURS,
    Intent.WIFI_QUERY,
    Intent.LOCATION_QUERY,
    Intent.STORE_INFO,
    Intent.SERVICE_QUERY,
    Intent.ORDER_INTENT,
    Intent.ORDER_ONLINE,
    Intent.ORDER_STATUS,
    Intent.DELIVERY_QUERY,
    Intent.PAYMENT_QUERY,
    Intent.PROMOTION_QUERY,
    Intent.CONTACT_QUERY,
    Intent.POLICY_QUERY,
})


@dataclass
class Chunk:
    id: int
    text: str  # nội dung hiển thị / đưa vào LLM
    source: str  # đường dẫn tương đối, vd "menu/coffee.md"
    category: str  # thư mục cấp 1 trong knowledge_base
    heading: str
    document_type: str = DocumentType.INTERNAL.value
    intents: list[str] = field(default_factory=list)
    retrievable: bool = True


@dataclass
class SearchHit:
    chunk: Chunk
    score: float


# --------------------------------------------------------------------------- #
# Chunking
# --------------------------------------------------------------------------- #
def _split_by_heading(text: str) -> list[tuple[str, str]]:
    """Tách markdown thành các (heading_path, body)."""
    sections: list[tuple[str, str]] = []
    stack: list[tuple[int, str]] = []
    buf: list[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        if body:
            sections.append((" > ".join(t for _, t in stack), body))
        buf.clear()

    for line in text.splitlines():
        m = HEADING_RE.match(line)
        if m:
            flush()
            level, title = len(m.group(1)), m.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
        else:
            buf.append(line)
    flush()
    return sections


def _split_long(body: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Cắt section dài theo đoạn, đoạn quá dài thì cắt theo dòng."""
    if len(body) <= max_chars:
        return [body]

    units: list[str] = []
    for para in re.split(r"\n\s*\n", body):
        if len(para) <= max_chars:
            units.append(para)
        else:
            units.extend(line for line in para.splitlines() if line.strip())

    chunks: list[str] = []
    cur = ""
    for u in units:
        if cur and len(cur) + len(u) + 1 > max_chars:
            chunks.append(cur.strip())
            cur = u  # không overlap để tránh trùng dòng bảng/giá
        else:
            cur = f"{cur}\n{u}" if cur else u
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


def _section_metadata(source: str, heading: str) -> tuple[str, list[str], bool]:
    """Ánh xạ metadata từ cấu trúc KB; không chứa dữ liệu trả lời nghiệp vụ."""
    normalized_heading = fold_text(heading)
    if source.startswith("menu/"):
        return (
            DocumentType.PRODUCT.value,
            sorted(intent.value for intent in PRODUCT_INTENTS),
            True,
        )

    if source.startswith("policies/"):
        policy_intents = (
            [Intent.PAYMENT_QUERY.value]
            if source.endswith("payment.md")
            else [Intent.POLICY_QUERY.value]
        )
        return (
            DocumentType.POLICY.value,
            policy_intents,
            True,
        )

    if source.startswith("faq/"):
        if "thong tin quan" in normalized_heading:
            return (
                DocumentType.BUSINESS.value,
                [
                    Intent.OPENING_HOURS.value,
                    Intent.WIFI_QUERY.value,
                    Intent.LOCATION_QUERY.value,
                    Intent.CONTACT_QUERY.value,
                    Intent.STORE_INFO.value,
                    Intent.SERVICE_QUERY.value,
                    Intent.DELIVERY_QUERY.value,
                ],
                True,
            )
        if "tu van do uong" in normalized_heading or "di ung" in normalized_heading:
            return (
                DocumentType.PRODUCT.value,
                [
                    Intent.PRODUCT_DETAIL.value,
                    Intent.PRODUCT_INFO.value,
                    Intent.PRODUCT_INTEREST.value,
                    Intent.PRODUCT_COMPARISON.value,
                    Intent.CUSTOMIZE_DRINK.value,
                    Intent.PRODUCT_FILTER.value,
                    Intent.PRODUCT_RECOMMENDATION.value,
                ],
                True,
            )
        if "menu va gia" in normalized_heading:
            return (
                DocumentType.PRODUCT.value,
                [Intent.MENU_QUERY.value, Intent.PRODUCT_PRICE.value],
                True,
            )
        if "dat hang" in normalized_heading:
            return (
                DocumentType.BUSINESS.value,
                [
                    Intent.SERVICE_QUERY.value,
                    Intent.ORDER_INTENT.value,
                    Intent.ORDER_ONLINE.value,
                    Intent.ORDER_STATUS.value,
                    Intent.DELIVERY_QUERY.value,
                ],
                True,
            )
        if "khuyen mai" in normalized_heading or "thanh vien" in normalized_heading:
            return (
                DocumentType.BUSINESS.value,
                [Intent.PROMOTION_QUERY.value],
                True,
            )

    # Các section hướng dẫn nội bộ không được đưa vào context trả lời khách.
    return DocumentType.INTERNAL.value, [], False


def _menu_advisory_fields(menu_dir: Path) -> dict[str, dict[str, str]]:
    """Giữ mô tả/tư vấn giàu thông tin từ Markdown, không lấy giá cũ."""
    result: dict[str, dict[str, str]] = {}
    labels = ("Mô tả", "Phù hợp với", "Độ ngọt", "Tùy chỉnh", "Lưu ý")
    if not menu_dir.exists():
        return result
    for path in sorted(menu_dir.glob("*.md")):
        for heading, body in _split_by_heading(path.read_text(encoding="utf-8")):
            if "Mã món:" not in body:
                continue
            fields: dict[str, str] = {}
            for label in labels:
                match = re.search(rf"^\s*[-*]\s*{re.escape(label)}:\s*(.+)$", body, re.I | re.M)
                if match:
                    fields[label] = match.group(1).strip()
            if fields:
                result[fold_text(heading.split(" > ")[-1])] = fields
    return result


def _load_product_catalog(path: Path, advisory: dict[str, dict[str, str]]) -> list[Chunk]:
    """Nạp products.csv làm catalog ưu tiên, một sản phẩm trên mỗi chunk."""
    if not path.exists():
        return []
    chunks: list[Chunk] = []
    temperature_labels = {
        "hot": "Nóng", "cold": "Lạnh", "either": "Nóng hoặc lạnh", "neutral": "Không áp dụng",
    }
    caffeine_labels = {"high": "Cao", "medium": "Trung bình", "low": "Thấp", "none": "Không"}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("name") or "").strip()
            product_id = (row.get("product_id") or "").strip()
            price_text = (row.get("price_vnd") or "").strip()
            if not name or not product_id or not price_text.isdigit():
                logger.warning("Bỏ qua dòng products.csv không hợp lệ: id=%r name=%r", product_id, name)
                continue
            launch_date = (row.get("launch_date") or "").strip()
            try:
                if launch_date and date.fromisoformat(launch_date) > date.today():
                    continue
            except ValueError:
                logger.warning("Ngày mở bán không hợp lệ cho product_id=%s", product_id)
            price = f"{int(price_text):,}".replace(",", ".")
            heading = f"Danh mục sản phẩm > {name}"
            advice = advisory.get(fold_text(name), {})
            fields = [
                f"* Mã món: {product_id}",
                f"* Danh mục: {(row.get('category') or '').strip()}",
                f"* Giá: {price} VND",
                f"* Mô tả: {advice.get('Mô tả') or (row.get('description') or '').strip()}",
                f"* Nhiệt độ: {temperature_labels.get((row.get('temperature') or '').strip(), (row.get('temperature') or '').strip())}",
                f"* Caffeine: {caffeine_labels.get((row.get('caffeine_level') or '').strip(), (row.get('caffeine_level') or '').strip())}",
                f"* Hương vị: {(row.get('flavor_tags') or '').replace('|', ', ').strip()}",
                f"* Ngày mở bán: {launch_date}",
            ]
            for label in ("Phù hợp với", "Độ ngọt", "Tùy chỉnh", "Lưu ý"):
                if advice.get(label):
                    fields.append(f"* {label}: {advice[label]}")
            chunks.append(Chunk(
                id=len(chunks),
                text=f"[{heading}]\n" + "\n".join(fields),
                source=path.name,
                category="menu",
                heading=heading,
                document_type=DocumentType.PRODUCT.value,
                intents=sorted(intent.value for intent in PRODUCT_INTENTS),
                retrievable=True,
            ))
    logger.info("Đã nạp %d sản phẩm từ %s", len(chunks), path.name)
    return chunks


def load_chunks(kb_dir: Path = KB_DIR) -> list[Chunk]:
    advisory = _menu_advisory_fields(kb_dir / "menu")
    chunks: list[Chunk] = _load_product_catalog(kb_dir / "products.csv", advisory)
    has_primary_catalog = bool(chunks)
    if not kb_dir.exists():
        logger.warning("Không tìm thấy knowledge base: %s", kb_dir)
        return chunks

    for path in sorted(kb_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXT:
            continue
        rel = path.relative_to(kb_dir)
        category = rel.parts[0] if len(rel.parts) > 1 else path.stem
        source = rel.as_posix()
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue

        file_title = path.stem
        sections = _split_by_heading(text) or [("", text)]
        for heading, body in sections:
            # CSV mới là nguồn catalog ưu tiên; giữ Markdown cho quy tắc/Q&A,
            # nhưng không index record món cũ để tránh hai mức giá cho một món.
            if has_primary_catalog and source.startswith("menu/") and "Mã món:" in body:
                continue
            for piece in _split_long(body):
                head = heading or file_title
                document_type, intents, retrievable = _section_metadata(source, head)
                chunks.append(
                    Chunk(
                        id=len(chunks),
                        text=f"[{head}]\n{piece}",
                        source=source,
                        category=category,
                        heading=head,
                        document_type=document_type,
                        intents=intents,
                        retrievable=retrievable,
                    )
                )
    logger.info("Đã tạo %d chunk từ %s", len(chunks), kb_dir)
    return chunks


# --------------------------------------------------------------------------- #
# Retriever
# --------------------------------------------------------------------------- #
class Retriever:
    def __init__(self, kb_dir: Path = KB_DIR, model_name: str = EMBEDDING_MODEL):
        self.kb_dir = kb_dir
        self.model_name = model_name
        self._model = None
        self._lock = threading.Lock()
        self._index_lock = threading.RLock()
        self._embedding_disabled = DISABLE_EMBEDDINGS
        self.chunks: list[Chunk] = []
        self.embeddings: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self._chunk_tokens: list[set[str]] = []
        self._chunk_token_counts: list[Counter[str]] = []
        self._document_frequency: Counter[str] = Counter()
        self._average_document_length = 0.0
        self._chunk_folded: list[str] = []
        self.build_index()

    # -- model -------------------------------------------------------------- #
    def _get_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer
                    try:
                        # Ưu tiên cache local để tránh các request HEAD không cần thiết.
                        self._model = SentenceTransformer(
                            self.model_name,
                            local_files_only=True,
                        )
                    except Exception:
                        if not ALLOW_MODEL_DOWNLOAD:
                            raise
                        logger.info("Model embedding chưa có đủ trong cache; cho phép tải model")
                        self._model = SentenceTransformer(self.model_name)
        return self._model

    def _embed(self, texts: list[str], prefix: str) -> np.ndarray:
        # e5 yêu cầu prefix "query: " / "passage: "
        vecs = self._get_model().encode(
            [prefix + t for t in texts],
            normalize_embeddings=True,
            batch_size=32,
            show_progress_bar=False,
        )
        return np.asarray(vecs, dtype=np.float32)

    # -- index -------------------------------------------------------------- #
    def _fingerprint(self, chunks: list[Chunk]) -> str:
        h = hashlib.sha256(self.model_name.encode())
        for c in chunks:
            h.update(c.source.encode())
            h.update(c.text.encode())
        return h.hexdigest()[:16]

    def _refresh_lexical_index(self) -> None:
        token_lists = [search_tokens(c.text) for c in self.chunks]
        self._chunk_token_counts = [Counter(tokens) for tokens in token_lists]
        self._chunk_tokens = [set(tokens) for tokens in token_lists]
        self._document_frequency = Counter(
            token for tokens in self._chunk_tokens for token in tokens
        )
        self._average_document_length = (
            sum(len(tokens) for tokens in token_lists) / len(token_lists)
            if token_lists else 0.0
        )
        self._chunk_folded = [fold_text(c.text) for c in self.chunks]

    def _bm25_scores(self, query_tokens: set[str]) -> np.ndarray:
        """BM25 nhẹ, không thêm dependency; chuẩn hóa về [0, 1] để blend với cosine."""
        scores = np.zeros(len(self.chunks), dtype=np.float32)
        coverages = np.zeros(len(self.chunks), dtype=np.float32)
        if not query_tokens or not self.chunks or self._average_document_length <= 0:
            return scores
        total = len(self.chunks)
        k1, b = 1.5, 0.75
        for index, counts in enumerate(self._chunk_token_counts):
            doc_length = sum(counts.values())
            matched_terms = 0
            for token in query_tokens:
                frequency = counts.get(token, 0)
                if not frequency:
                    continue
                matched_terms += 1
                document_frequency = self._document_frequency.get(token, 0)
                inverse_frequency = math.log(
                    1 + (total - document_frequency + 0.5) / (document_frequency + 0.5)
                )
                denominator = frequency + k1 * (
                    1 - b + b * doc_length / self._average_document_length
                )
                scores[index] += inverse_frequency * frequency * (k1 + 1) / denominator
            coverages[index] = matched_terms / len(query_tokens)
        maximum = float(np.max(scores)) if len(scores) else 0.0
        return (scores / maximum) * coverages if maximum > 0 else scores

    @staticmethod
    def _lexical_score(query_tokens: set[str], query_folded: str,
                       chunk_tokens: set[str], chunk_folded: str) -> float:
        if not query_tokens or not chunk_tokens:
            return 0.0
        if len(query_folded) >= 4 and query_folded in chunk_folded:
            return 1.0

        matched = 0
        for query_token in query_tokens:
            if query_token in chunk_tokens:
                matched += 1
                continue
            # Fuzzy token matching xử lý lỗi gõ nhẹ như "late"/"latte".
            if len(query_token) >= 4 and any(
                abs(len(query_token) - len(candidate)) <= 2
                and SequenceMatcher(None, query_token, candidate).ratio() >= 0.82
                for candidate in chunk_tokens
            ):
                matched += 1
        return matched / len(query_tokens)

    @staticmethod
    def _token_matches(query_token: str, candidates: set[str]) -> bool:
        if query_token in candidates:
            return True
        return len(query_token) >= 4 and any(
            abs(len(query_token) - len(candidate)) <= 2
            and SequenceMatcher(None, query_token, candidate).ratio() >= 0.82
            for candidate in candidates
        )

    @classmethod
    def _product_entity_score(cls, entity_tokens: set[str], heading: str) -> float:
        heading_tokens = set(search_tokens(heading.split(" > ")[-1]))
        if not entity_tokens or not heading_tokens:
            return 0.0
        # Chấm coverage theo tên món, không theo toàn bộ query. Query nối tiếp
        # có thể chứa thêm lời bot trước đó; các token này không được làm
        # loãng entity đã xuất hiện rõ như "Matcha Latte".
        matched = sum(cls._token_matches(token, entity_tokens) for token in heading_tokens)
        return matched / len(heading_tokens)

    @staticmethod
    def _is_product_record(chunk: Chunk) -> bool:
        return chunk.document_type == DocumentType.PRODUCT.value and "Mã món:" in chunk.text

    @staticmethod
    def _product_price(chunk: Chunk) -> int | None:
        match = re.search(r"^\s*[-*]\s*Giá(?: mẫu)?:\s*([\d.,]+)", chunk.text, re.I | re.M)
        if not match:
            return None
        digits = re.sub(r"\D", "", match.group(1))
        return int(digits) if digits else None

    @staticmethod
    def _budget_filter(query_folded: str) -> tuple[str, int] | None:
        match = re.search(
            r"\b(duoi|tren|tu|ngan sach)\s*(?:gia\s*)?([0-9][0-9.,]*)\s*(k|nghin|vnd|d|dong)?\b",
            query_folded,
        )
        if not match:
            return None
        raw = match.group(2)
        digits = re.sub(r"\D", "", raw)
        if not digits:
            return None
        amount = int(digits)
        suffix = match.group(3) or ""
        if suffix in {"k", "nghin"} or (amount < 1000 and "." not in raw and "," not in raw):
            amount *= 1000
        return match.group(1), amount

    def _product_match_mask(
        self,
        query_canonical: str,
        query_folded: str,
        query_tokens: set[str],
        base_mask: np.ndarray,
    ) -> np.ndarray:
        """Resolve tên món theo exact -> alias đã chuẩn hóa -> fuzzy có ràng buộc.

        Dense similarity không tham gia bước này. Nó chỉ được xếp hạng sau khi
        danh tính sản phẩm đã được xác nhận bằng tên/alias, tránh lấy giá của món
        khác chỉ vì cùng có một từ như "đá".
        """
        product_mask = np.array([
            self._is_product_record(chunk) for chunk in self.chunks
        ], dtype=bool)
        candidates = base_mask & product_mask
        if not candidates.any():
            return np.zeros(len(self.chunks), dtype=bool)

        exact_occurrences: list[tuple[int, int, int, int]] = []
        for index, chunk in enumerate(self.chunks):
            if not candidates[index]:
                continue
            name = fold_text(chunk.heading.split(" > ")[-1])
            for match in re.finditer(rf"(?<!\w){re.escape(name)}(?!\w)", query_folded):
                exact_occurrences.append(
                    (match.start(), match.end(), index, len(search_tokens(name)))
                )

        if exact_occurrences:
            # Chọn tên dài nhất trên các span chồng nhau như "Latte" bên
            # trong "Matcha Latte", nhưng vẫn giữ entity Latte độc lập ở vế sau.
            selected: list[tuple[int, int, int, int]] = []
            for occurrence in sorted(
                exact_occurrences,
                key=lambda item: (-(item[1] - item[0]), item[0]),
            ):
                start, end, _, _ = occurrence
                if any(other_start <= start and end <= other_end for other_start, other_end, _, _ in selected):
                    continue
                selected.append(occurrence)
            resolved = np.zeros(len(self.chunks), dtype=bool)
            for _, _, index, _ in selected:
                resolved[index] = True
            return resolved

        entity_tokens = query_tokens - _PRODUCT_ATTRIBUTE_TOKENS
        # Sau khi bỏ dấu, "trà" trùng với động từ trong "kiểm tra" và "môn"
        # trùng với từ chung "món". Giữ lại chúng khi bản query có dấu cho thấy
        # đây thực sự là một phần tên món, nếu không "Trà sữa khoai môn" có thể
        # bị rút còn "sữa khoai" rồi khớp sai "Sữa tươi khoai môn".
        canonical_words = set(re.findall(r"[0-9a-zA-ZÀ-ỹđĐ]+", query_canonical.lower()))
        if "trà" in canonical_words:
            entity_tokens.add("tra")
        if "môn" in canonical_words:
            entity_tokens.add("mon")
        if not entity_tokens:
            return np.zeros(len(self.chunks), dtype=bool)
        if len(entity_tokens) == 1 and next(iter(entity_tokens)) in _GENERIC_SINGLE_PRODUCT_TOKENS:
            return np.zeros(len(self.chunks), dtype=bool)

        # "mát cha" đã được canonicalize thành "matcha". Đây là alias danh mục
        # rõ ràng nên có thể trả về các biến thể Matcha, không tự chọn một biến thể.
        matcha_family = len(entity_tokens) == 1 and self._token_matches(
            next(iter(entity_tokens)), {"matcha"}
        )
        resolved = np.zeros(len(self.chunks), dtype=bool)
        specificity = np.zeros(len(self.chunks), dtype=np.float32)
        for index, chunk in enumerate(self.chunks):
            if not candidates[index]:
                continue
            heading_tokens = set(search_tokens(chunk.heading.split(" > ")[-1]))
            if matcha_family:
                resolved[index] = "matcha" in heading_tokens
                continue
            entity_coverage = sum(
                self._token_matches(token, heading_tokens) for token in entity_tokens
            ) / len(entity_tokens)
            name_coverage = sum(
                self._token_matches(token, entity_tokens) for token in heading_tokens
            ) / len(heading_tokens)
            resolved[index] = entity_coverage == 1.0 and name_coverage >= 0.50
            specificity[index] = name_coverage if resolved[index] else 0.0
        if resolved.sum() > 1:
            best_specificity = float(np.max(specificity[resolved]))
            resolved &= specificity >= best_specificity
        return resolved

    def resolve_product_names(self, query: str) -> tuple[str, ...]:
        """Resolve catalog entity mà không embedding hoặc gọi LLM."""
        canonical = canonicalize_query(query)
        base_mask = np.array([
            chunk.retrievable and self._is_product_record(chunk)
            for chunk in self.chunks
        ], dtype=bool)
        resolved = self._product_match_mask(
            canonical, fold_text(canonical), set(search_tokens(canonical)), base_mask
        )
        return tuple(
            chunk.heading.split(" > ")[-1]
            for index, chunk in enumerate(self.chunks)
            if resolved[index]
        )

    def build_index(self, force: bool = False) -> None:
        lock = getattr(self, "_index_lock", None)
        if lock is None:
            lock = self._index_lock = threading.RLock()
        with lock:
            self._build_index_unlocked(force=force)

    def _build_index_unlocked(self, force: bool = False) -> None:
        """Tạo index; dùng cache nếu knowledge_base không đổi."""
        chunks = load_chunks(self.kb_dir)
        if not chunks:
            self.chunks, self.embeddings = [], np.zeros((0, 1), dtype=np.float32)
            self._refresh_lexical_index()
            return

        fp = self._fingerprint(chunks)
        CACHE_DIR.mkdir(exist_ok=True)
        emb_file = CACHE_DIR / f"{fp}.npy"
        meta_file = CACHE_DIR / f"{fp}.json"

        if not force and emb_file.exists() and meta_file.exists():
            self.embeddings = np.load(emb_file)
            # Embedding cache phụ thuộc content; metadata luôn lấy từ code/chunks
            # hiện tại để thay đổi routing không buộc phải vector hóa lại.
            self.chunks = chunks
            self._refresh_lexical_index()
            logger.info("Nạp index từ cache (%s)", fp)
            return

        self.chunks = chunks
        self._refresh_lexical_index()
        if self._embedding_disabled:
            self.embeddings = np.zeros((len(chunks), 1), dtype=np.float32)
            logger.warning("Dense embedding đã tắt; retriever dùng lexical search")
            return

        logger.info("Đang embedding %d chunk...", len(chunks))
        try:
            self.embeddings = self._embed([c.text for c in chunks], "passage: ")
        except Exception:
            # Chat vẫn hoạt động ở chế độ lexical khi model embedding không sẵn sàng.
            self._embedding_disabled = True
            self.embeddings = np.zeros((len(chunks), 1), dtype=np.float32)
            logger.exception("Không nạp được model embedding; chuyển sang lexical search")
            return
        np.save(emb_file, self.embeddings)
        meta_file.write_text(
            json.dumps([asdict(c) for c in chunks], ensure_ascii=False), "utf-8"
        )
        # dọn cache cũ
        for f in CACHE_DIR.iterdir():
            if f.stem != fp:
                f.unlink(missing_ok=True)

    # -- search ------------------------------------------------------------- #
    def search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.0,
        category: str | None = None,
        intent: Intent | str | None = None,
    ) -> list[SearchHit]:
        lock = getattr(self, "_index_lock", None)
        if lock is None:
            lock = self._index_lock = threading.RLock()
        with lock:
            return self._search_unlocked(query, top_k, min_score, category, intent)

    def _search_unlocked(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.0,
        category: str | None = None,
        intent: Intent | str | None = None,
    ) -> list[SearchHit]:
        if not self.chunks:
            return []

        canonical_query = canonicalize_query(query)
        query_folded = fold_text(canonical_query)
        query_tokens = set(search_tokens(canonical_query))
        lexical_scores = np.asarray([
            self._lexical_score(query_tokens, query_folded, tokens, folded)
            for tokens, folded in zip(self._chunk_tokens, self._chunk_folded)
        ], dtype=np.float32)
        bm25_scores = self._bm25_scores(query_tokens)
        lexical_scores = np.maximum(lexical_scores, bm25_scores)

        mask = np.array([chunk.retrievable for chunk in self.chunks], dtype=bool)
        if category:
            mask &= np.array([c.category == category for c in self.chunks])

        parsed_intent = Intent.UNKNOWN
        catalog_browse = False
        entity_mask: np.ndarray | None = None
        if intent:
            intent_value = intent.value if isinstance(intent, Intent) else str(intent)
            try:
                parsed_intent = Intent(intent_value)
            except ValueError:
                parsed_intent = Intent.UNKNOWN
            allowed_types = {item.value for item in allowed_document_types(parsed_intent)}
            if parsed_intent is not Intent.UNKNOWN:
                mask &= np.array([
                    chunk.document_type in allowed_types and intent_value in chunk.intents
                    for chunk in self.chunks
                ])

            # Lookup fact theo món bắt buộc qua entity resolver trước semantic ranking.
            if parsed_intent in _PRODUCT_LOOKUP_INTENTS:
                entity_mask = self._product_match_mask(
                    canonical_query, query_folded, query_tokens, mask
                )
                mask &= entity_mask

            # Với bộ lọc vị mặn, không để token chung "món" hay fuzzy mon/man kéo
            # về các đồ uống bất kỳ. Chỉ giữ record thật sự khai báo mặn/salty.
            if parsed_intent is Intent.PRODUCT_FILTER:
                mask &= np.array([
                    self._is_product_record(chunk) for chunk in self.chunks
                ], dtype=bool)
                if "man" in query_tokens:
                    mask &= np.array([
                        bool({"man", "salty"} & tokens)
                        for tokens in self._chunk_tokens
                    ], dtype=bool)
                if "caffeine" in query_tokens and "khong" in fold_text(query):
                    mask &= np.array([
                        bool(re.search(r"^\s*[-*]\s*Caffeine:\s*(Không|None)\b", chunk.text, re.I | re.M))
                        for chunk in self.chunks
                    ], dtype=bool)
                budget = self._budget_filter(query_folded)
                if budget:
                    operator, amount = budget
                    prices = [self._product_price(chunk) for chunk in self.chunks]
                    if operator in {"duoi", "ngan sach"}:
                        mask &= np.array([price is not None and price < amount for price in prices])
                    elif operator == "tren":
                        mask &= np.array([price is not None and price > amount for price in prices])
                    else:
                        mask &= np.array([price is not None and price >= amount for price in prices])

            # Menu/gợi ý chỉ lấy record sản phẩm thật, không lấy overview/FAQ.
            if parsed_intent in {
                Intent.MENU_QUERY,
                Intent.PRODUCT_RECOMMENDATION,
                Intent.PRODUCT_FILTER,
            }:
                mask &= np.array([
                    self._is_product_record(chunk) for chunk in self.chunks
                ], dtype=bool)
                catalog_browse = parsed_intent in {Intent.MENU_QUERY, Intent.PRODUCT_FILTER} or any(
                    cue in query_folded
                    for cue in ("mon gi ngon", "gi ngon", "goi y mon", "khong biet nen uong gi")
                )

        if not mask.any():
            return []

        # Fact lookup có lexical match mạnh và đã được metadata-filter không cần
        # nạp model embedding. Fast path này loại cold-start và không ảnh hưởng
        # các truy vấn tư vấn/lọc phức tạp vẫn dùng hybrid retrieval.
        lexical_fast_path = (
            parsed_intent in _LEXICAL_FAST_PATH_INTENTS
            and float(np.max(lexical_scores[mask])) >= 0.34
        )
        dense_available = (
            not lexical_fast_path
            and not catalog_browse
            and not self._embedding_disabled
            and len(self.embeddings) == len(self.chunks)
        )
        if dense_available:
            try:
                q = self._embed([canonical_query], "query: ")[0]
                dense_scores = self.embeddings @ q  # đã normalize -> cosine
            except Exception:
                # Tránh để outage của model/Hugging Face làm sập toàn bộ endpoint.
                self._embedding_disabled = True
                dense_available = False
                dense_scores = np.zeros(len(self.chunks), dtype=np.float32)
                logger.exception("Embedding query thất bại; chuyển sang lexical search")
        else:
            dense_scores = np.zeros(len(self.chunks), dtype=np.float32)

        if dense_available:
            blended = (1.0 - LEXICAL_WEIGHT) * dense_scores + LEXICAL_WEIGHT * lexical_scores
            # Giữ tương thích với ngưỡng cosine cũ, lexical chỉ được phép tăng điểm.
            scores = np.maximum(dense_scores, blended)
        else:
            scores = lexical_scores

        if entity_mask is not None:
            # Entity resolver đã xác nhận chính xác tên món. Không để các
            # từ nối trong query nhiều sản phẩm làm một entity rơi dưới
            # ngưỡng retrieval.
            scores = np.where(entity_mask, np.maximum(scores, 0.70), scores)

        if catalog_browse:
            # Truy vấn duyệt menu không có entity để chấm overlap. Mọi record ở
            # đây đều là món thật; điểm nền chỉ giúp lấy 3–5 món ổn định.
            scores = np.where(mask, np.maximum(scores, 0.50), scores)

        scores = np.where(mask, scores, -1.0)

        # RAG_MIN_SCORE là ngưỡng cosine. Khi model embedding không sẵn sàng,
        # lexical overlap có thang điểm khác; dùng ngưỡng bảo thủ hơn nhưng vẫn
        # giữ intent/document mask và product entity guard phía trên.
        effective_min_score = min_score if dense_available else min(min_score, 0.34)
        order = np.argsort(-scores, kind="stable")[:top_k]
        return [
            SearchHit(self.chunks[i], float(scores[i]))
            for i in order
            if scores[i] >= effective_min_score
        ]


_retriever: Retriever | None = None
_retriever_lock = threading.Lock()


def get_retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        with _retriever_lock:
            if _retriever is None:
                _retriever = Retriever()
    return _retriever
