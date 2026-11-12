"""Đánh giá retrieval theo nhóm bằng Recall@K và MRR."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from statistics import mean

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.app.chat.intent import Intent, classify_intent
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.normalize import fold_text
from src.app.chat.rag import RAGPipeline, _clean_history
from src.app.chat.retriever import Retriever, load_chunks
from src.app.chat.schemas import ChatMessage

DEFAULT_DATASET = ROOT / "evaluation/retrieval_eval.jsonl"
DEFAULT_KS = (1, 3, 5, 10, 12)


def _lexical_retriever() -> Retriever:
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = load_chunks()
    retriever.embeddings = np.zeros((len(retriever.chunks), 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()
    return retriever


def _pipeline(use_embeddings: bool) -> RAGPipeline:
    try:
        retriever = Retriever() if use_embeddings else _lexical_retriever()
    except Exception as exc:
        print(
            f"WARNING: không khởi tạo được embedding retriever ({type(exc).__name__}); "
            "chuyển sang lexical-only.",
            file=sys.stderr,
        )
        retriever = _lexical_retriever()
    llm = ExtractiveLLM()
    return RAGPipeline(retriever=retriever, llm=llm, fallback_llm=llm)


def _matches(hit, expected_terms: list[str]) -> bool:
    haystack = fold_text(
        " ".join((hit.chunk.source, hit.chunk.category, hit.chunk.heading, hit.chunk.text))
    )
    return all(fold_text(term) in haystack for term in expected_terms)


def _recall_at_k(hits: list, expected_terms: list[str], k: int) -> float:
    return float(any(_matches(hit, expected_terms) for hit in hits[:k]))


def _mrr_at_k(hits: list, expected_terms: list[str], k: int) -> float:
    for rank, hit in enumerate(hits[:k], start=1):
        if _matches(hit, expected_terms):
            return 1.0 / rank
    return 0.0


def _mean_metric(rows: list[dict], key: str) -> float:
    return round(mean(row[key] for row in rows), 4) if rows else 0.0


async def _evaluate_case(
    pipeline: RAGPipeline,
    row: dict,
    max_k: int,
    ks: tuple[int, ...],
    min_score: float,
) -> dict:
    history = [
        ChatMessage(role=item["role"], content=item["content"])
        for item in row.get("history", [])
    ]
    clean_history = _clean_history(history)
    standalone = await pipeline._condense(row["query"], clean_history)

    original_decision = classify_intent(row["query"])
    contextual_decision = classify_intent(standalone)
    decision = contextual_decision
    if contextual_decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
        decision = original_decision

    hits = pipeline.retriever.search(
        standalone,
        top_k=max_k,
        min_score=min_score,
        intent=decision.intent,
    )
    expected_terms = row["expected_terms"]
    first_rank = next(
        (rank for rank, hit in enumerate(hits, start=1) if _matches(hit, expected_terms)),
        None,
    )
    return {
        "id": row["id"],
        "group": row["group"],
        "query": row["query"],
        "standalone_query": standalone,
        "intent": decision.intent.value,
        "expected_terms": expected_terms,
        "hits": [
            {
                "rank": rank,
                "score": round(hit.score, 4),
                "source": hit.chunk.source,
                "heading": hit.chunk.heading,
            }
            for rank, hit in enumerate(hits[:max_k], start=1)
        ],
        "first_relevant_rank": first_rank,
        "recall": {
            f"recall@{k}": _recall_at_k(hits, expected_terms, k)
            for k in ks
            if k <= max_k
        },
        "mrr": _mrr_at_k(hits, expected_terms, max_k),
    }


async def evaluate(
    dataset: Path,
    ks: tuple[int, ...],
    min_score: float,
    use_embeddings: bool,
) -> dict:
    rows = [
        json.loads(line)
        for line in dataset.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    rows = [row for row in rows if row.get("expected_terms") and row.get("group")]
    max_k = max(ks)
    pipeline = _pipeline(use_embeddings)
    results = [
        await _evaluate_case(
            pipeline,
            row,
            max_k=max_k,
            ks=ks,
            min_score=min_score,
        )
        for row in rows
    ]

    groups = sorted({row["group"] for row in results})
    group_metrics: dict[str, dict[str, float | int]] = {}
    for group in groups:
        group_rows = [row for row in results if row["group"] == group]
        group_metrics[group] = {
            "cases": len(group_rows),
            **{
                f"recall@{k}": round(
                    mean(row["recall"].get(f"recall@{k}", 0.0) for row in group_rows),
                    4,
                )
                for k in ks
            },
            "mrr": _mean_metric([{"mrr": row["mrr"]} for row in group_rows], key="mrr"),
        }

    overall = {
        "cases": len(results),
        **{
            f"recall@{k}": round(
                mean(
                    row["recall"].get(f"recall@{k}", 0.0)
                    for row in results
                ),
                4,
            )
            if results
            else 0.0
            for k in ks
        },
        "mrr": round(mean(row["mrr"] for row in results), 4) if results else 0.0,
    }
    failures = [
        row for row in results
        if row["first_relevant_rank"] is None or row["first_relevant_rank"] > max(ks)
    ]
    try:
        dataset_label = dataset.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        dataset_label = dataset.resolve().as_posix()
    return {
        "dataset": dataset_label,
        "retriever": "hybrid" if use_embeddings else "lexical-only",
        "min_score": min_score,
        "ks": list(ks),
        "overall": overall,
        "groups": group_metrics,
        "failures": failures[:50],
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--ks", default="1,3,5,10,12")
    parser.add_argument("--min-score", type=float, default=0.0)
    parser.add_argument(
        "--lexical-only",
        action="store_true",
        help="Không load embedding model; dùng để benchmark retrieval lexical.",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    ks = tuple(sorted({
        max(1, min(int(value.strip()), 15))
        for value in args.ks.split(",")
        if value.strip()
    }))
    if not ks:
        raise SystemExit("--ks phải chứa ít nhất một số nguyên dương.")

    result = asyncio.run(
        evaluate(
            args.dataset,
            ks=ks,
            min_score=max(0.0, args.min_score),
            use_embeddings=not args.lexical_only,
        )
    )
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()

