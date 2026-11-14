# Luồng chatbot Smart Café hiện tại

Tài liệu này mô tả **code đang chạy trong repository hiện tại**, không phải thiết kế
tương lai. Phạm vi chính là ai-service/src/app/chat; các file bên ngoài được nhắc
đến khi chúng là điểm vào hoặc điểm tích hợp trực tiếp của chatbot.

## 1. Tóm tắt kiến trúc

Chatbot là một FastAPI service nhận câu hỏi tại POST /chat. Pipeline xử lý hiện tại:

    Frontend / client
            |
            | POST /chat
            v
    FastAPI route: api/routes/chat.py
            |
            v
    ChatService
            |
            v
    RAGPipeline.answer()
            |
            +--> Làm sạch history + tạo conversation context
            +--> Chuẩn hóa câu hỏi
            +--> Phân loại intent bằng rule/regex
            +--> Xử lý greeting, chitchat, complaint, follow-up, order code...
            +--> Nếu có DATA_API_BASE_URL: gọi catalog/order API
            +--> Nếu không: tìm knowledge_base bằng hybrid retrieval
            |       (lexical/BM25 + fuzzy + dense embedding nếu bật)
            +--> Tạo câu trả lời extractive grounded
            +--> LLM rewrite/condense/naturalize ở các nhánh phù hợp
            +--> Kiểm tra an toàn và grounding giá
            v
    ChatResponse: { answer, sources[] }

Điểm quan trọng của implementation hiện tại:

- Intent được phân loại deterministic bằng rule/regex, không giao cho LLM.
- Câu trả lời fact lookup chủ yếu được tạo bởi ExtractiveLLM, tức là trích xuất và
  định dạng lại dữ liệu đã retrieval; không phải LLM tự do sinh câu trả lời từ đầu.
- LLM OpenAI-compatible/Ollama được dùng cho rewrite câu hỏi follow-up dài và
  naturalize một số câu trả lời sản phẩm. Khi LLM lỗi, pipeline có fallback an toàn.
- Khi đã cấu hình operational API, các câu hỏi sản phẩm không tự động rơi về dữ liệu
  tĩnh nếu API hiện hành bị lỗi; hệ thống trả lời rằng chưa truy cập được dữ liệu mới.
- Chat không giữ session server-side. Client gửi history trong từng request.

## 2. Điểm vào HTTP và vòng đời service

### src/app/main.py

- Tạo đối tượng FastAPI với tên Smart Cafe AI Service.
- Đăng ký CORSMiddleware từ biến môi trường CORS_ALLOWED_ORIGINS.
- Đăng ký các router health, chat, recommendation và forecasting.
- Lifespan gọi get_chat_service().preload() nếu PRELOAD_CHAT=true.
  - Có thể warm embedding model.
  - Có thể warm LLM nếu LLM_WARMUP=true.
  - Nếu preload lỗi, ứng dụng vẫn khởi động nhưng trạng thái readiness có thể là 503.

### src/app/api/routes/chat.py

Có hai endpoint:

#### POST /chat

- Nhận ChatRequest.
- Chạy enforce_chat_rate_limit trước khi vào service.
- Nhận thêm Authorization, được chuyển tiếp khi tra cứu đơn hàng operational.
- Nhận X-Branch-ID, dùng khi tìm catalog theo chi nhánh.
- Gọi ChatService.chat().
- Lỗi nội bộ được log ở server và trả về 503 với thông báo chung, không làm lộ
  URL nội bộ, trace hay cấu hình.

#### POST /chat/reindex

- Gọi ChatService.reindex() để đọc lại knowledge_base và tạo index.
- Bắt buộc header X-Reindex-Key khớp CHAT_REINDEX_API_KEY.
- Nếu chưa cấu hình key, endpoint trả 503; key sai trả 403.

### src/app/api/routes/health.py

- GET /health: liveness đơn giản, trả status=ok; không chứng minh model/index đã
  sẵn sàng.
- GET /ready: đọc trạng thái từ ChatService.readiness(); yêu cầu index có chunk.
  Response còn cho biết số chunk, embedding có bật hay không và operational data có
  được cấu hình hay không.

### src/app/core/security.py

- Rate limit in-memory dạng sliding window, mặc định 60 request/phút/instance.
- Nếu chạy nhiều replica, code hiện tại vẫn cần gateway/Redis để rate limit tập trung.
- Khóa reindex được so sánh bằng hmac.compare_digest.
- TRUST_PROXY_HEADERS quyết định có dùng X-Forwarded-For làm địa chỉ client hay không.

## 3. Hợp đồng dữ liệu request/response

### schemas.py

ChatMessage:

- role chỉ nhận user hoặc assistant.
- content bắt buộc, dài 1–2000 ký tự sau khi trim.

ChatRequest:

- message bắt buộc, dài 1–2000 ký tự.
- history là danh sách ChatMessage, tối đa 30 phần tử ở tầng API.
- History được gửi kèm để chatbot hiểu các câu nối tiếp.

ChatResponse:

    {
      "answer": "Câu trả lời tiếng Việt",
      "sources": [
        {
          "source": "products.csv",
          "category": "menu",
          "heading": "Danh mục sản phẩm > Matcha latte",
          "score": 0.91,
          "content": "..."
        }
      ]
    }

ChatService._public_sources() lọc nguồn theo CHAT_SOURCE_MODE:

- off: không trả source.
- metadata (mặc định): trả source, category, heading, nhưng xóa score và content.
- full: trả toàn bộ source chunk.

## 4. Luồng xử lý một câu hỏi trong RAGPipeline

### Bước 1 — Giới hạn và làm sạch history

rag.py dùng _clean_history() để:

- Chỉ giữ tối đa 10 message gần nhất.
- Giới hạn tổng nội dung history khoảng 3200 ký tự.
- Gộp các message liên tiếp cùng role.
- Loại assistant message ở đầu nếu history không bắt đầu bằng user.

Vì vậy, history 30 phần tử nhận từ API không đồng nghĩa toàn bộ 30 phần tử đều được
đưa vào retrieval hoặc prompt.

### Bước 2 — Tạo context hội thoại

context.py gọi build_conversation_context() để suy ra:

- Món hiện tại và các món được nhắc trong history.
- Intent gần nhất của user.
- Câu hỏi hiện tại có phải contextual follow-up hay không.
- Intent đang chờ từ câu hỏi trước, ví dụ bot vừa hỏi có muốn xem giá không.
- Assistant message gần nhất và phần câu hỏi cuối của assistant.

Context này chỉ tồn tại trong request hiện tại. session_id hiện luôn là None; server
không lưu state giữa các request.

### Bước 3 — Chuẩn hóa câu hỏi

normalize.py cung cấp:

- clean_text(): chuẩn hóa Unicode và khoảng trắng.
- canonicalize_query(): chuẩn hóa một số cách viết chat phổ biến như viết tắt,
  không dấu, cafe/coffee/cf, onl, wf, ship, lỗi gõ phổ biến.
- fold_text(): bỏ dấu để lexical matching; chuỗi đã fold chỉ dùng tìm kiếm, không
  dùng làm nội dung trả lời.
- search_tokens(): tạo token tìm kiếm và loại stop word.
- is_contextual_followup(): nhận biết câu như “giá bao nhiêu?”, “món đó”, “còn
  không?”, “tại sao?”, “ít ngọt”.
- contextualize_followup(): nối câu hỏi ngắn với câu user trước đó và đôi khi với
  assistant answer trước đó để tạo query tìm kiếm độc lập.
- needs_llm_rewrite(): chỉ gọi LLM condense cho câu dài vẫn còn đại từ mơ hồ; câu
  follow-up ngắn ưu tiên xử lý local để giảm latency và tránh thêm dữ kiện.

### Bước 4 — Phân loại intent

intent.py định nghĩa các nhóm intent:

- Sản phẩm: menu, giá, còn món, chi tiết, thông tin, yêu thích, so sánh, tùy chỉnh,
  gợi ý, lọc.
- Đơn hàng/dịch vụ: đặt món, đặt online, trạng thái đơn, giao hàng, thanh toán,
  khuyến mãi, dịch vụ.
- Thông tin quán: giờ mở cửa, Wi-Fi, địa chỉ, liên hệ, thông tin quán.
- Hội thoại: greeting, affirmation, negation, confirmation, chitchat, complaint,
  follow-up, unknown.
- Chính sách: POLICY_QUERY cho đổi/trả/hủy/hoàn.

classify_intent() chạy các rule theo thứ tự ưu tiên. Một số nguyên tắc:

- Greeting, phủ định, xác nhận ngắn và complaint được bắt sớm.
- Prompt injection, yêu cầu API key/mật khẩu/system prompt và chủ đề ngoài phạm vi
  như Bitcoin, thời tiết, chính trị bị đưa về UNKNOWN với rule out-of-scope.
- Wi-Fi, giờ mở cửa, liên hệ, địa chỉ, đơn hàng, thanh toán, khuyến mãi và chính sách
  được phân loại trước nhiều rule sản phẩm chung.
- “Bao nhiêu” không mặc định là giá; calories, caffeine, dung tích và khối lượng
  được xử lý như thuộc tính sản phẩm.
- Có classify_compound_intents() để tách nhiều yêu cầu business trong một câu,
  ví dụ địa chỉ và giờ mở cửa.
- allowed_document_types() giới hạn loại tài liệu được phép retrieval theo intent.
- fallback_for_intent() cung cấp fallback đúng chủ đề, tránh trả câu “không có
  trong menu” cho câu hỏi về đơn hàng/chính sách.

### Bước 5 — Các nhánh trả lời sớm

RAGPipeline.answer() không phải câu nào cũng gọi retrieval. Các nhánh trả lời sớm:

- Greeting, chitchat, negation, complaint.
- Out-of-scope/prompt injection.
- Câu “tại sao?” giải thích giới hạn của câu trả lời trước nếu câu trước nói chưa
  có dữ liệu xác nhận.
- Compound business: tách từng ý, retrieval riêng, sau đó ghép câu trả lời.
- Compound product: tách các ý sản phẩm; dùng live catalog nếu có, nếu không thì
  retrieval tĩnh cho từng ý.
- Order code: nhận diện chuỗi mã đơn 6–24 ký tự có chứa số. Cách xử lý phụ thuộc
  operational API và Authorization.
- Affirmation/confirmation: cố gắng khôi phục câu hỏi trước, đặc biệt trường hợp bot
  vừa hỏi user có muốn xem giá một món hay không.

### Bước 6 — Viết lại follow-up và suy luận intent

Với intent sản phẩm, UNKNOWN hoặc FOLLOW_UP, pipeline tạo standalone query:

1. Giữ nguyên câu nếu user đã nêu tên món rõ ràng.
2. Dùng contextualize_followup() cho follow-up local.
3. Dùng LLM với CONDENSE_SYSTEM/CONDENSE_USER khi câu dài và vẫn mơ hồ.
4. Resolve lại tên món trong standalone query.
5. Nếu query mới đã rõ intent thì cập nhật decision.
6. Nếu vẫn unknown/follow-up, trả fallback an toàn thay vì đoán.

### Bước 7 — Operational catalog/order API

live_data.py cung cấp OperationalDataClient. Nhánh này bật khi DATA_API_BASE_URL
khác rỗng.

#### Catalog

search_catalog() gọi:

    GET {DATA_API_BASE_URL}{DATA_API_CATALOG_PATH}
        ?q=<query>&intent=<intent>&branch_id=<optional>

Response được parse thành:

- LiveProduct: id, tên, mô tả, nhiệt độ, caffeine, tags, variants, chi nhánh,
  updated time.
- LiveVariant: id, tên, giá, còn bán hay không, lý do hết món.

Các intent sản phẩm như giá, availability, detail, info, comparison, filter, menu,
recommendation được format bởi format_catalog_answer(). Source tương ứng có
source=operational-catalog-api, score=1.0.

Nếu operational API đã bật nhưng gọi API lỗi, pipeline không lấy catalog tĩnh để trả
thay cho dữ liệu hiện hành; nó trả thông báo chưa truy cập được menu hiện tại.

#### Order

Khi câu hỏi là ORDER_STATUS hoặc đang chờ mã đơn và user gửi mã:

- Nếu operational API chưa bật: chatbot chỉ xác nhận đã nhận mã và hướng dẫn user
  dùng kênh đặt hàng/nhân viên; không giả vờ đã tra cứu.
- Nếu API bật nhưng không có Authorization: yêu cầu user đăng nhập/dùng lại kênh
  đặt hàng.
- Nếu có Authorization: gọi
  GET {DATA_API_BASE_URL}{DATA_API_ORDER_PATH} với mã đơn đã URL-encode.
- Status và payment status được đổi sang nhãn tiếng Việt bởi format_order_answer().

Các lỗi HTTP, JSON hoặc transport ở adapter được log theo loại lỗi và trả None, không
đưa URL/query có thể chứa PII vào log.

### Bước 8 — Retrieval knowledge base tĩnh

Khi không dùng được operational catalog, hoặc với các câu hỏi business/policy, pipeline
gọi Retriever.search().

retriever.py tạo hybrid retriever gồm:

1. Exact/lexical match sau khi bỏ dấu.
2. Fuzzy token matching bằng difflib.SequenceMatcher cho lỗi gõ nhẹ.
3. BM25 tự cài đặt bằng Counter và NumPy.
4. Dense embedding bằng sentence-transformers với model mặc định
   intfloat/multilingual-e5-small.
5. Blend lexical và cosine score theo RAG_LEXICAL_WEIGHT.

Các guard quan trọng:

- Lọc theo document_type và intent metadata.
- Với câu hỏi giá/chi tiết/còn món, resolve tên món trước khi xếp hạng semantic để
  không lấy nhầm giá của món khác vì một token chung như “đá” hoặc “sữa”.
- Product filter hỗ trợ ngân sách, caffeine và một số tag vị.
- Menu/recommendation ưu tiên các record sản phẩm thật, không lấy overview/FAQ làm
  tên món.
- Nếu lexical score đủ mạnh cho các intent fact lookup, dùng lexical fast path và
  không cần load embedding model cho request đó.
- Nếu embedding không có hoặc bị lỗi, retriever tự chuyển sang lexical search.
- Nếu không có hit đạt ngưỡng, pipeline dùng fallback_for_intent().

Ngưỡng mặc định trong rag.py là TOP_K=12 (giới hạn 15) và MIN_SCORE=0.68. Retriever
luôn tạo candidate pool ít nhất 12 chunk, sau đó rerank bằng exact phrase, heading,
Q/A và synonym. Dense embedding chỉ mở rộng candidate pool khi lexical/entity match
chưa đủ chắc chắn; thứ tự cuối cùng vẫn do lexical rerank quyết định.

### Bước 9 — Tạo context và câu trả lời

Các hit được:

- Loại chunk gần trùng bằng _deduplicate_hits().
- Cắt vào tối đa khoảng 4800 ký tự bằng _format_context().
- Chuyển thành prompt theo USER_TEMPLATE, gồm intent, context và câu hỏi hiện tại.
- Ghép history đã làm sạch vào messages.

Với DIRECT_ANSWER_INTENTS, pipeline gọi fallback_llm, mặc định là ExtractiveLLM.
Lớp này dùng response.py để:

- Parse context thành các block.
- Tìm cặp Q/A phù hợp nếu là FAQ/business/policy.
- Đọc các field sản phẩm như tên, giá, mô tả, nhiệt độ, caffeine, độ ngọt, tùy chỉnh.
- Tạo câu trả lời riêng cho giá, availability, comparison, filter, recommendation,
  giờ mở cửa và thông tin sản phẩm.
- Không sử dụng thông tin nằm ngoài context.

Nếu câu trả lời extractive rỗng, pipeline fallback theo intent. Với intent không nằm
trong nhóm direct, pipeline thử self.llm; nếu provider lỗi thì quay lại extractive.

### Bước 10 — Sanitize, kiểm tra grounding và naturalize

response.py và RAGPipeline áp dụng các lớp bảo vệ:

- sanitize_generated_answer() loại prefix máy móc và dòng metadata nội bộ.
- answer_prices_are_grounded() từ chối câu trả lời chứa giá không xuất hiện trong
  context.
- Naturalizer chỉ áp dụng cho một số intent sản phẩm. NATURALIZE_SYSTEM yêu cầu
  giữ nguyên tên món, số, giá, điều kiện và mức độ chưa xác nhận.
- _naturalization_is_safe() kiểm tra số, phrase được bảo vệ, mức độ không chắc chắn
  và các fact bắt buộc trước khi nhận bản rewrite.
- Nếu naturalizer làm thay đổi fact hoặc sinh giá không grounded, giữ bản extractive
  ban đầu.

## 5. Ý nghĩa các file trong src/app/chat

### File Python đang tham gia pipeline

| File | Vai trò |
|---|---|
| __init__.py | Đánh dấu package Python; hiện không chứa logic. |
| schemas.py | Pydantic request/response model cho chat và source chunk. |
| normalize.py | Chuẩn hóa query, bỏ dấu để tìm kiếm, token hóa và xử lý follow-up. |
| intent.py | Enum intent, rule classifier, compound intent, document type và fallback. |
| context.py | Suy ra món hiện tại, intent trước, pending intent và assistant context từ history. |
| retriever.py | Đọc knowledge base, chunking, indexing, cache và hybrid search. |
| rag.py | Orchestrator chính kết nối history, intent, live API, retriever, prompt và answer. |
| response.py | Extractive answer, format các nhóm câu hỏi và kiểm tra generated answer. |
| prompts.py | System prompt, user template, condense/naturalize prompt và canned answer. |
| llm.py | Adapter OpenAI-compatible/Ollama và ExtractiveLLM fallback. |
| live_data.py | Client gọi catalog/order API và formatter cho dữ liệu operational. |
| service.py | Facade ChatService, singleton service, preload, readiness, reindex và public sources. |
| test_rag.py | CLI test thủ công cho retrieval, full chat và interactive chat. Không phải router HTTP. |

### Dữ liệu và tài nguyên

| Path | Vai trò hiện tại |
|---|---|
| knowledge_base/products.csv | Catalog tĩnh chính. Mỗi sản phẩm được tạo thành một chunk; giá, nhiệt độ, caffeine, tag và ngày mở bán được đọc từ đây. |
| knowledge_base/faq/faq.md | FAQ về thông tin quán, dịch vụ, hotline, giờ hoạt động, đặt bàn, giao hàng và hỗ trợ. |
| knowledge_base/policies/payment.md | Tài liệu mẫu về thanh toán; được gán POLICY và PAYMENT_QUERY. |
| knowledge_base/policies/refund.md | Tài liệu mẫu về hủy, đổi, hoàn tiền; được gán POLICY và POLICY_QUERY. |
| docs/TODO_CHU_QUAN_DIEN.md | Danh sách thông tin nội bộ cần chủ quán xác nhận; nằm ngoài knowledge_base nên không được index. |
| knowledge_base/intent.py | Hiện là file rỗng, không được import trong pipeline. Logic intent thực tế nằm ở chat/intent.py. |
| effective_knowledge/effective_knowledge.txt | Hiện rỗng và không được retriever.py đọc. |
| effective_knowledge/*.png | Ảnh tài nguyên hiện chưa có đường đi xử lý trong chatbot hiện tại. |
| .rag_cache/*.npy | Cache dense embedding theo fingerprint nội dung và tên model. |
| .rag_cache/*.json | Cache metadata chunk tương ứng với embedding. |
| note.txt | Ghi chú phát triển/thử nghiệm, không được import khi service chạy. |

retriever.load_chunks() chỉ đọc .md và .txt trong knowledge_base ngoài việc đọc riêng
products.csv. Khi catalog CSV có dữ liệu, các record sản phẩm trùng trong menu/*.md
sẽ bị bỏ qua để tránh trả hai mức giá cho một món. Section Markdown được tách theo
heading; các section có Q/A được tách thành từng cặp độc lập, còn phần văn bản thường
dài hơn 900 ký tự tiếp tục được cắt nhỏ.

## 6. Các công nghệ đang sử dụng

- Python 3.11–3.13: ngôn ngữ runtime.
- FastAPI + Uvicorn: HTTP API, dependency injection, middleware CORS và lifecycle.
- Pydantic v2: validate request/response và giới hạn payload.
- asyncio: xử lý API/LLM bất đồng bộ; retrieval/index embedding được đẩy sang thread
  bằng asyncio.to_thread để không chặn event loop.
- httpx: gọi OpenAI-compatible LLM API và operational catalog/order API.
- Ollama hoặc OpenAI-compatible provider: mặc định cấu hình model qwen2.5:3b
  qua endpoint /v1/chat/completions.
- sentence-transformers: tạo dense embedding, mặc định
  intfloat/multilingual-e5-small.
- NumPy: lưu vector, cosine similarity và tính điểm retrieval.
- Regex, Counter, SequenceMatcher: rule intent, tokenization, BM25 và fuzzy match.
- CSV/Markdown/TXT: định dạng knowledge base hiện tại.
- JSON/NumPy cache: cache index embedding trong .rag_cache.

Mặc dù chromadb có trong requirements.txt, retriever chatbot hiện tại không dùng
ChromaDB để tìm kiếm; index được tự quản lý trong retriever.py bằng NumPy và lexical
index in-memory.

## 7. Biến môi trường ảnh hưởng chatbot

| Biến | Ý nghĩa mặc định |
|---|---|
| LLM_PROVIDER | openai_compatible; extractive dùng fallback không gọi model. |
| LLM_BASE_URL | http://localhost:11434/v1. |
| LLM_MODEL | qwen2.5:3b. |
| LLM_TIMEOUT_SECONDS | 45. |
| LLM_MAX_RETRIES | 2, giới hạn tối đa 4. |
| LLM_TEMPERATURE | 0.1. |
| RAG_EMBEDDING_MODEL | intfloat/multilingual-e5-small. |
| RAG_ALLOW_MODEL_DOWNLOAD | true. |
| RAG_DISABLE_EMBEDDINGS | false. |
| RAG_LEXICAL_WEIGHT | 0.30. |
| RAG_TOP_K | 12, giới hạn 1–15. |
| RAG_MIN_SCORE | 0.68. |
| RAG_WARM_EMBEDDING_MODEL | true. |
| LLM_WARMUP | false. |
| PRELOAD_CHAT | true. |
| CHAT_SOURCE_MODE | metadata. |
| CHAT_RATE_LIMIT_ENABLED | true. |
| CHAT_RATE_LIMIT_PER_MINUTE | 60. |
| DATA_API_BASE_URL | Rỗng; rỗng nghĩa là dùng knowledge base tĩnh cho catalog/order. |
| DATA_API_CATALOG_PATH | /api/ai/catalog/search. |
| DATA_API_ORDER_PATH | /api/ai/orders/{order_code}. |
| DATA_API_KEY | Rỗng; nếu có sẽ gửi bằng X-API-Key. |
| CORS_ALLOWED_ORIGINS | http://localhost:5173,http://127.0.0.1:5173. |
| CHAT_REINDEX_API_KEY | Rỗng; cần đặt để bật reindex endpoint. |

src/app/core/config.py đọc biến môi trường khi module khởi tạo settings. File .env
không được tự đọc trực tiếp bởi config.py; local process cần inject environment hoặc
chạy Uvicorn với --env-file, còn Docker Compose chịu trách nhiệm inject biến.

## 8. Các giới hạn và trạng thái hiện tại

- Không có session store phía server; client phải gửi lại history.
- Không có chức năng tạo/sửa/hủy đơn thật trong chat. Những intent này chỉ hướng dẫn,
  hoặc tra cứu trạng thái nếu operational order API đã tích hợp và request có quyền.
- Policies hiện là tài liệu mẫu, cần thay bằng chính sách chính thức trước production.
- Một số thông tin quán vẫn là TODO và bị chặn khỏi retrieval.
- Không có xác nhận tồn kho realtime nếu DATA_API_BASE_URL chưa cấu hình.
- Không có ChromaDB/vector database service trong flow hiện tại.
- GET /health không kiểm tra LLM provider; /ready chủ yếu kiểm tra knowledge index.
- Naturalization phụ thuộc provider LLM; khi provider lỗi, câu trả lời grounded vẫn có
  thể được trả bằng extractive fallback.

## 9. Cách chạy và kiểm tra nhanh

Từ thư mục ai-service:

    python -m uvicorn src.app.main:app --reload --port 8000 --env-file .env

Một số URL:

    GET  http://127.0.0.1:8000/health
    GET  http://127.0.0.1:8000/ready
    POST http://127.0.0.1:8000/chat

CLI test nằm ở test_rag.py và có thể chạy từ package phù hợp với PYTHONPATH:

    python -m app.chat.test_rag retrieval
    python -m app.chat.test_rag retrieval "matcha giá bao nhiêu"
    python -m app.chat.test_rag chat "quán mở cửa lúc mấy giờ"
    python -m app.chat.test_rag interactive

Sau khi sửa file trong knowledge_base, có thể gọi POST /chat/reindex với
X-Reindex-Key, hoặc khởi động lại service để index được tạo lại. Cache embedding chỉ
được dùng lại khi fingerprint của nội dung và model không đổi.

