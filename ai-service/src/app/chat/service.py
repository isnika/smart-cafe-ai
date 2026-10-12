from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "recommendation" / "data_mock"


class CafeChatService:
    """Cafe assistant with menu retrieval and optional OpenAI-compatible LLM."""

    def __init__(self):
        products_path = DATA_DIR / "products.csv"
        self.products = pd.read_csv(products_path) if products_path.exists() else pd.DataFrame()

    def _menu_context(self, message: str) -> str:
        if self.products.empty:
            return "Menu hiện chưa được cấu hình."
        text = message.lower()
        terms = [t for t in text.replace("?", " ").replace(",", " ").split() if len(t) > 2]
        df = self.products.copy()
        searchable = (df["name"].fillna("").astype(str) + " " + df["category"].fillna("").astype(str) + " " + df["description"].fillna("").astype(str)).str.lower()
        matches = df[searchable.apply(lambda s: any(term in s for term in terms))] if terms else df.iloc[0:0]
        if matches.empty:
            matches = df.head(8)
        lines = []
        for row in matches.head(8).itertuples(index=False):
            lines.append(f"- {row.name} | {row.category} | {int(row.price_vnd):,} VND | {row.description}")
        return "MENU HIỆN CÓ:\n" + "\n".join(lines)

    def _fallback_answer(self, message: str, context: str) -> str:
        q = message.lower()
        if any(word in q for word in ["giá", "bao nhiêu", "menu", "món", "thực đơn"]):
            return "Mình gửi bạn một số món trong menu hiện tại nhé:\n" + context.replace("MENU HIỆN CÓ:\n", "") + "\nBạn muốn mình gợi ý món cà phê, trà hay matcha?"
        if any(word in q for word in ["giờ", "mở cửa", "đóng cửa", "địa chỉ", "ở đâu"]):
            return "Mình chưa được cấu hình giờ mở cửa hoặc địa chỉ của quán. Bạn hãy bổ sung thông tin này vào cấu hình Smart Café để mình trả lời chính xác nhé."
        if any(word in q for word in ["ít caffeine", "không caffeine", "không cafein", "ít cà phê"]):
            return "Bạn có thể cân nhắc các món trà hoặc matcha tùy mức caffeine trong menu. Mình có thể liệt kê các món hiện có để bạn chọn nhé.\n" + context
        return "Chào bạn! Mình là trợ lý Smart Café ☕ Mình có thể giúp bạn xem menu, tham khảo giá và chọn món. Bạn thích vị cà phê đậm, béo sữa, ngọt hay thanh mát?"

    def _ask_llm(self, message: str, context: str) -> str | None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        payload = {
            "model": model,
            "temperature": 0.4,
            "messages": [
                {"role": "system", "content": "Bạn là nhân viên tư vấn Smart Café, trả lời bằng tiếng Việt, thân thiện, ngắn gọn. Chỉ khẳng định giá/tên món có trong ngữ cảnh menu. Nếu không có dữ liệu thì nói rõ chưa được cấu hình; không tự bịa giờ mở cửa, địa chỉ hoặc khuyến mãi. Ngữ cảnh menu:\n" + context},
                {"role": "user", "content": message},
            ],
        }
        req = Request(
            base_url + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=25) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
        except (HTTPError, URLError, TimeoutError, KeyError, ValueError):
            return None

    def reply(self, message: str, user_id: str | None = None) -> dict:
        cleaned = message.strip()
        if not cleaned:
            raise ValueError("message không được để trống")
        context = self._menu_context(cleaned)
        answer = self._ask_llm(cleaned, context) or self._fallback_answer(cleaned, context)
        return {
            "response": answer,
            "user_id": user_id,
            "mode": "llm" if os.getenv("OPENAI_API_KEY") else "menu_fallback",
        }
