## AI Module — Smart AI Cafe

### 1. Chatbot AI (NLP)
- **Bài toán:** Closed-domain chatbot — trả lời trong phạm vi kiến thức đã cấu hình, ngoài phạm vi thì chuyển nhân viên thật.
- **Kiến trúc:** Retrieval-Augmented Generation (RAG) + Intent Classification.
- **Cơ chế:**
  1. Câu hỏi → vector embedding
  2. Tìm đoạn tri thức gần nhất bằng **cosine similarity**
  3. Độ tương đồng ≥ ngưỡng (vd. 0.6) → LLM diễn đạt lại câu trả lời
  4. Thấp hơn ngưỡng → trả "ngoài phạm vi" + chuyển nhân viên
- **Công cụ:** FAISS/ChromaDB, sentence embedding, LLM API.

### 2. Hệ thống gợi ý món (Recommender System)
- **Công thức:**
Score(món) = 0.8 × Score_cá_nhân_hóa + 0.2 × Score_hot_trend
- **Cá nhân hóa (80%):** Collaborative Filtering (Matrix Factorization) + Content-Based Filtering (cosine similarity).
- **Xu hướng chung (20%):** Độ phổ biến gần đây, có time-decay.
- **Cold-start:** Khách mới → ưu tiên hot-trend, tăng trọng số cá nhân hóa dần sau 3–5 đơn.
- **Công cụ:** Surprise / LightFM, scikit-learn.

### 3. Dự đoán doanh thu (Revenue Forecasting)
- **Bài toán:** Time Series Forecasting — dự báo doanh thu theo ngày/tuần/tháng.
- **Đầu vào:** Lịch sử đơn hàng, ngày lễ/cuối tuần, thời tiết, chương trình khuyến mãi.
- **Thuật toán:**
  - **Baseline:** Moving Average, Exponential Smoothing (Holt-Winters) — nắm xu hướng & mùa vụ.
  - **Nâng cao:** Prophet (Facebook) hoặc ARIMA/SARIMA — xử lý tính mùa vụ (theo tuần, theo giờ cao điểm).
  - **Machine Learning:** XGBoost/LightGBM với feature engineering (lag features, rolling mean, ngày trong tuần).
- **Đánh giá:** MAE, RMSE, MAPE so với số liệu thực tế.
- **Ứng dụng:** Lập kế hoạch nhập hàng, xếp ca nhân viên, đặt mục tiêu doanh số.
- **Công cụ:** Prophet, statsmodels, scikit-learn/XGBoost.

### 4. Quản lý tồn kho (Inventory Prediction)
- **Bài toán:** Dự báo nhu cầu nguyên vật liệu để tối ưu nhập hàng, giảm thất thoát (hết hạn, thiếu hàng).
- **Cơ chế:**
  1. Từ dự báo doanh thu/số lượng món bán ra → quy đổi ra nguyên liệu cần dùng (theo công thức/định lượng món — BOM: Bill of Materials).
  2. Tính **điểm đặt hàng lại (Reorder Point)**:
 ROP = (Nhu cầu trung bình/ngày × Thời gian giao hàng) + Tồn kho an toàn
  3. Cảnh báo tự động khi tồn kho chạm ngưỡng ROP hoặc gần hạn sử dụng (đặc biệt nguyên liệu tươi: sữa, trái cây...).
- **Thuật toán:** Time Series Forecasting (kết hợp module doanh thu) + Safety Stock calculation (dựa trên độ lệch chuẩn nhu cầu).
- **Ứng dụng:** Gợi ý số lượng nhập hàng tối ưu, cảnh báo hết hàng/hết hạn, giảm lãng phí nguyên liệu.
- **Công cụ:** pandas, statsmodels, quy tắc BOM tự định nghĩa theo thực đơn.

### Kiến trúc tổng thể
- Mỗi module = backend service độc lập (Python/FastAPI), giao tiếp qua REST API.
- Dữ liệu: SQL (đơn hàng/hóa đơn/tồn kho) + Vector DB (tìm kiếm ngữ nghĩa chatbot).
- Module Doanh thu & Tồn kho dùng chung tầng Time Series, chia sẻ dữ liệu lịch sử bán hàng.

| Module | Bài toán AI | Thuật toán chính | Toán học nền tảng |
|---|---|---|---|
| Chatbot | NLP | RAG + Intent Classification | Đại số tuyến tính, Xác suất thống kê |
| Gợi ý món | Recommender System | Matrix Factorization + Content-Based + Popularity | Đại số tuyến tính, Thống kê |
| Dự đoán doanh thu | Time Series Forecasting | Prophet/SARIMA, XGBoost | Thống kê, Hồi quy |
| Tồn kho | Demand Forecasting + Inventory Optimization | Time Series + Reorder Point | Thống kê, Xác suất |