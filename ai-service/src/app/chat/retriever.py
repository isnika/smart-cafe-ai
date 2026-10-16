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
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

CHAT_DIR = Path(__file__).parent
KB_DIR = CHAT_DIR / "knowledge_base"
CACHE_DIR = CHAT_DIR / ".rag_cache"

EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
MAX_CHUNK_CHARS = 900
SUPPORTED_EXT = {".md", ".txt"}
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*\S)\s*$")


@dataclass
class Chunk:
    id: int
    text: str  # nội dung hiển thị / đưa vào LLM
    source: str  # đường dẫn tương đối, vd "menu/coffee.md"
    category: str  # thư mục cấp 1 trong knowledge_base
    heading: str


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
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue

        file_title = path.stem
        sections = _split_by_heading(text) or [("", text)]
        for heading, body in sections:
            for piece in _split_long(body):
                head = heading or file_title
                chunks.append(
                    Chunk(
                        id=len(chunks),
                        text=f"[{head}]\n{piece}",
                        source=rel.as_posix(),
                        category=category,
                        heading=head,
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
        self.chunks: list[Chunk] = []
        self.embeddings: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self.build_index()

    # -- model -------------------------------------------------------------- #
    def _get_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer

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

    def build_index(self, force: bool = False) -> None:
        """Tạo index; dùng cache nếu knowledge_base không đổi."""
        chunks = load_chunks(self.kb_dir)
        if not chunks:
            self.chunks, self.embeddings = [], np.zeros((0, 1), dtype=np.float32)
            return

        fp = self._fingerprint(chunks)
        CACHE_DIR.mkdir(exist_ok=True)
        emb_file = CACHE_DIR / f"{fp}.npy"
        meta_file = CACHE_DIR / f"{fp}.json"

        if not force and emb_file.exists() and meta_file.exists():
            self.embeddings = np.load(emb_file)
            self.chunks = [Chunk(**d) for d in json.loads(meta_file.read_text("utf-8"))]
            logger.info("Nạp index từ cache (%s)", fp)
            return

        logger.info("Đang embedding %d chunk...", len(chunks))
        self.embeddings = self._embed([c.text for c in chunks], "passage: ")
        self.chunks = chunks
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
        top_k: int = 4,
        min_score: float = 0.0,
        category: str | None = None,
    ) -> list[SearchHit]:
        if not self.chunks:
            return []

        q = self._embed([query], "query: ")[0]
        scores = self.embeddings @ q  # đã normalize -> cosine

        if category:
            mask = np.array([c.category == category for c in self.chunks])
            scores = np.where(mask, scores, -1.0)

        order = np.argsort(-scores)[:top_k]
        return [
            SearchHit(self.chunks[i], float(scores[i]))
            for i in order
            if scores[i] >= min_score
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