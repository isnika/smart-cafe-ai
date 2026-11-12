import numpy as np

from src.app.chat.intent import DocumentType, Intent
from src.app.chat.retriever import Retriever, load_chunks


TODO_SOURCE = "TODO_CHU_QUAN_DIEN.md"


def _lexical_retriever() -> Retriever:
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = load_chunks()
    retriever.embeddings = np.zeros((len(retriever.chunks), 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()
    return retriever


def test_owner_todo_file_is_internal_and_not_retrievable():
    todo_chunks = [chunk for chunk in load_chunks() if chunk.source == TODO_SOURCE]

    assert todo_chunks
    assert all(chunk.document_type == DocumentType.INTERNAL.value for chunk in todo_chunks)
    assert all(not chunk.retrievable for chunk in todo_chunks)


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
