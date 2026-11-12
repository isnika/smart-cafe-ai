"""Chạy evaluation offline: intent F1, Recall@K, groundedness, task success, p95."""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.app.chat.intent import classify_intent
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.normalize import fold_text
from src.app.chat.rag import RAGPipeline
from src.app.chat.response import answer_prices_are_grounded
from src.app.chat.retriever import Retriever, load_chunks

DEFAULT_DATASET = ROOT / "evaluation/chat_eval_seed.jsonl"


def _pipeline() -> RAGPipeline:
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = load_chunks()
    retriever.embeddings = np.zeros((len(retriever.chunks), 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()
    llm = ExtractiveLLM()
    return RAGPipeline(retriever=retriever, llm=llm, fallback_llm=llm)


def _percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return ordered[index]


def _macro_f1(expected: list[str], predicted: list[str]) -> float:
    labels = sorted(set(expected) | set(predicted))
    scores = []
    for label in labels:
        tp = sum(e == label and p == label for e, p in zip(expected, predicted))
        fp = sum(e != label and p == label for e, p in zip(expected, predicted))
        fn = sum(e == label and p != label for e, p in zip(expected, predicted))
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return sum(scores) / len(scores) if scores else 0.0


async def evaluate(dataset: Path, top_k: int) -> dict:
    rows = [json.loads(line) for line in dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    rows = [row for row in rows if not row.get("needs_review") and row.get("expected_intent")]
    pipeline = _pipeline()
    pipeline.top_k = top_k
    expected: list[str] = []
    predicted: list[str] = []
    recalls: list[float] = []
    grounded: list[float] = []
    task_success: list[float] = []
    latencies: list[float] = []
    failures: list[dict] = []
    confusion: Counter[tuple[str, str]] = Counter()

    for row in rows:
        query = row["query"]
        expected_intent = row["expected_intent"]
        predicted_intent = classify_intent(query).intent.value
        started = time.perf_counter()
        answer, sources = await pipeline.answer(query)
        latencies.append((time.perf_counter() - started) * 1000)
        expected.append(expected_intent)
        predicted.append(predicted_intent)
        confusion[(expected_intent, predicted_intent)] += 1

        source_text = fold_text(" ".join(
            f"{source.source} {source.heading} {source.content}" for source in sources
        ))
        source_terms = [fold_text(term) for term in row.get("expected_source_terms", [])]
        source_ok = all(term in source_text for term in source_terms)
        if not source_terms:
            source_ok = not sources
        recalls.append(float(source_ok))

        context = "\n".join(source.content for source in sources)
        grounded_ok = answer_prices_are_grounded(answer, context)
        grounded_ok &= "todo_chu_quan_dien" not in fold_text(answer)
        grounded.append(float(grounded_ok))

        folded_answer = fold_text(answer)
        required = [fold_text(term) for term in row.get("required_answer_terms", [])]
        forbidden = [fold_text(term) for term in row.get("forbidden_answer_terms", [])]
        task_ok = (
            predicted_intent == expected_intent
            and all(term in folded_answer for term in required)
            and all(term not in folded_answer for term in forbidden)
        )
        task_success.append(float(task_ok))
        if not (source_ok and grounded_ok and task_ok) and len(failures) < 30:
            failures.append({
                "id": row["id"],
                "query": query,
                "expected_intent": expected_intent,
                "predicted_intent": predicted_intent,
                "answer": answer,
                "source_ok": source_ok,
                "grounded": grounded_ok,
                "task_success": task_ok,
            })

    try:
        dataset_label = dataset.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        dataset_label = dataset.name
    return {
        "dataset": dataset_label,
        "cases": len(rows),
        "top_k": top_k,
        "intent_macro_f1": round(_macro_f1(expected, predicted), 4),
        "retrieval_recall_at_k": round(sum(recalls) / len(recalls), 4),
        "groundedness": round(sum(grounded) / len(grounded), 4),
        "task_success": round(sum(task_success) / len(task_success), 4),
        "latency_p50_ms": round(_percentile(latencies, 0.50), 2),
        "latency_p95_ms": round(_percentile(latencies, 0.95), 2),
        "confusion": {
            f"{left}->{right}": count
            for (left, right), count in sorted(confusion.items())
            if left != right
        },
        "sample_failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--top-k", type=int, default=12)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = asyncio.run(evaluate(args.dataset, max(1, min(args.top_k, 15))))
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
