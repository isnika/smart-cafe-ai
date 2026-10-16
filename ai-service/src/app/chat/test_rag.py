"""Test nhanh RAG.

Chạy từ thư mục src/:
    python -m app.chat.test_rag retrieval            # chỉ test truy xuất, không cần API key
    python -m app.chat.test_rag retrieval "matcha giá bao nhiêu"
    python -m app.chat.test_rag chat                 # test full RAG (cần ANTHROPIC_API_KEY)
    python -m app.chat.test_rag chat "quán mở cửa lúc mấy giờ"
    python -m app.chat.test_rag interactive          # chat qua terminal, có nhớ lịch sử
"""
import asyncio
import logging
import sys

from .rag import RAGPipeline
from .retriever import get_retriever
from .schemas import ChatMessage

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

SAMPLE_QUESTIONS = [
    "Menu có những loại cà phê nào?",
    "Matcha latte giá bao nhiêu?",
    "Quán mở cửa lúc mấy giờ?",
    "Chính sách đổi trả như thế nào?",
    "Quán có wifi không?",
    "Hôm nay thời tiết thế nào?",  # câu ngoài phạm vi -> kỳ vọng score thấp / fallback
]


def test_retrieval(questions: list[str]) -> None:
    r = get_retriever()
    print(f"\nĐã nạp {len(r.chunks)} chunk\n")
    for q in questions:
        print("=" * 70)
        print("Q:", q)
        for h in r.search(q, top_k=3):  # min_score=0 để xem toàn bộ điểm
            print(f"  [{h.score:.3f}] {h.chunk.source} | {h.chunk.heading}")
            print("        ", h.chunk.text[:100].replace("\n", " "), "...")


async def test_chat(questions: list[str]) -> None:
    pipeline = RAGPipeline()
    for q in questions:
        print("=" * 70)
        print("Q:", q)
        answer, sources = await pipeline.answer(q)
        print("A:", answer)
        print("Nguồn:", [(s.source, s.score) for s in sources])


async def interactive() -> None:
    pipeline = RAGPipeline()
    history: list[ChatMessage] = []
    print("Gõ 'exit' để thoát.")
    while True:
        q = input("\nBạn: ").strip()
        if q.lower() in {"exit", "quit", ""}:
            break
        answer, sources = await pipeline.answer(q, history)
        print("Bot:", answer)
        print("   (nguồn:", [s.source for s in sources], ")")
        history += [ChatMessage(role="user", content=q), ChatMessage(role="assistant", content=answer)]


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "retrieval"
    qs = [sys.argv[2]] if len(sys.argv) > 2 else SAMPLE_QUESTIONS
    if mode == "retrieval":
        test_retrieval(qs)
    elif mode == "chat":
        asyncio.run(test_chat(qs))
    elif mode == "interactive":
        asyncio.run(interactive())
    else:
        print(__doc__)