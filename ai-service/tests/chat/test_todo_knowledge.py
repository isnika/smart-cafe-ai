from pathlib import Path

import numpy as np

from src.app.chat.intent import Intent
from src.app.chat.retriever import Retriever, load_chunks


TODO_SOURCE = "TODO_CHU_QUAN_DIEN.md"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _lexical_retriever() -> Retriever:
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = load_chunks()
    retriever.embeddings = np.zeros((len(retriever.chunks), 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()
    return retriever


def test_owner_todo_is_outside_the_retrievable_knowledge_base():
    assert (PROJECT_ROOT / "docs" / TODO_SOURCE).is_file()
    assert all(chunk.source != TODO_SOURCE for chunk in load_chunks())


def test_contact_query_never_returns_owner_todo_data():
    hits = _lexical_retriever().search(
        "hotline cua quan la gi",
        top_k=12,
        min_score=0.0,
        intent=Intent.CONTACT_QUERY,
    )

    assert hits
    assert all(hit.chunk.source != TODO_SOURCE for hit in hits)
    assert all("0900 000 000" not in hit.chunk.text for hit in hits)
