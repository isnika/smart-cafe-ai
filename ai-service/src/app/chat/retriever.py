"""Retriever: nạp knowledge_base -> chunk theo heading -> embedding -> tìm kiếm cosine.

Phụ thuộc: numpy, sentence-transformers
Model mặc định: intfloat/multilingual-e5-small (hỗ trợ tiếng Việt, nhẹ, chạy CPU tốt).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from dataclasses import asdict, dataclass, field
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
    "thi", "sao", "the", "nao",
}
_GENERIC_SINGLE_PRODUCT_TOKENS = {"da", "sua", "xay", "nong", "lanh"}
_PRODUCT_LOOKUP_INTENTS = frozenset({
    Intent.PRODUCT_AVAILABILITY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.CUSTOMIZE_DRINK,
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
        return (
            DocumentType.POLICY.value,
            [Intent.POLICY_QUERY.value, Intent.SERVICE_QUERY.value],
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
                    Intent.STORE_INFO.value,
                    Intent.SERVICE_QUERY.value,
                ],
                True,
            )
        if "tu van do uong" in normalized_heading:
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
                ],
                True,
            )

    # Các section hướng dẫn nội bộ không được đưa vào context trả lời khách.
    return DocumentType.INTERNAL.value, [], False


def load_chunks(kb_dir: Path = KB_DIR) -> list[Chunk]:
    chunks: list[Chunk] = []
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
        self._embedding_disabled = DISABLE_EMBEDDINGS
        self.chunks: list[Chunk] = []
        self.embeddings: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self._chunk_tokens: list[set[str]] = []
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
        self._chunk_tokens = [set(search_tokens(c.text)) for c in self.chunks]
        self._chunk_folded = [fold_text(c.text) for c in self.chunks]

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

    def _product_match_mask(
        self,
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

        exact_indices: list[int] = []
        exact_lengths: list[int] = []
        for index, chunk in enumerate(self.chunks):
            if not candidates[index]:
                continue
            name = fold_text(chunk.heading.split(" > ")[-1])
            if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", query_folded):
                exact_indices.append(index)
                exact_lengths.append(len(search_tokens(name)))

        if exact_indices:
            # "Matcha Latte" cũng chứa tên món "Latte"; luôn giữ tên đầy đủ nhất.
            longest = max(exact_lengths)
            resolved = np.zeros(len(self.chunks), dtype=bool)
            for index, length in zip(exact_indices, exact_lengths):
                if length == longest:
                    resolved[index] = True
            return resolved

        entity_tokens = query_tokens - _PRODUCT_ATTRIBUTE_TOKENS
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
        return resolved

    def build_index(self, force: bool = False) -> None:
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
        if not self.chunks:
            return []

        canonical_query = canonicalize_query(query)
        query_folded = fold_text(canonical_query)
        query_tokens = set(search_tokens(canonical_query))
        lexical_scores = np.asarray([
            self._lexical_score(query_tokens, query_folded, tokens, folded)
            for tokens, folded in zip(self._chunk_tokens, self._chunk_folded)
        ], dtype=np.float32)

        mask = np.array([chunk.retrievable for chunk in self.chunks], dtype=bool)
        if category:
            mask &= np.array([c.category == category for c in self.chunks])

        parsed_intent = Intent.UNKNOWN
        catalog_browse = False
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
                mask &= self._product_match_mask(query_folded, query_tokens, mask)

            # Menu/gợi ý chỉ lấy record sản phẩm thật, không lấy overview/FAQ.
            if parsed_intent in {Intent.MENU_QUERY, Intent.PRODUCT_RECOMMENDATION}:
                mask &= np.array([
                    self._is_product_record(chunk) for chunk in self.chunks
                ], dtype=bool)
                catalog_browse = parsed_intent is Intent.MENU_QUERY or any(
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
            and float(np.max(lexical_scores[mask])) >= 0.50
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

        if catalog_browse:
            # Truy vấn duyệt menu không có entity để chấm overlap. Mọi record ở
            # đây đều là món thật; điểm nền chỉ giúp lấy 3–5 món ổn định.
            scores = np.where(mask, np.maximum(scores, 0.50), scores)

        scores = np.where(mask, scores, -1.0)

        # RAG_MIN_SCORE là ngưỡng cosine. Khi model embedding không sẵn sàng,
        # lexical overlap có thang điểm khác; dùng ngưỡng bảo thủ hơn nhưng vẫn
        # giữ intent/document mask và product entity guard phía trên.
        effective_min_score = min_score if dense_available else min(min_score, 0.34)
        order = np.argsort(-scores)[:top_k]
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
