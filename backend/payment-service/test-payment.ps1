# ==============================================================================
# SMART CAFE AI - PAYMENT SERVICE AUTOMATED TEST SCRIPT
# Flow: Open Shift -> Create Cash Payment -> Confirm Cash -> Check Discrepancy -> Close Shift
# ==============================================================================

$BaseUrl = "http://localhost:8085"
$Token = "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzdGFmZl8wMDEiLCJ1c2VyX2lkIjoic3RhZmZfMDAxIiwicm9sZXMiOlsiUk9MRV9TVEFGRiIsIlJPTEVfQ0FTSElFUiIsIlJPTEVfTUFOQUdFUiIsIlJPTEVfQURNSU4iXSwiYnJhbmNoX2lkIjoxLCJpYXQiOjE3OTI1Njg1MjksImV4cCI6MTgyNDEwNDUyOX0.KNFZWRWiy-ezTB2nqCD6TYTmVjkiZNLTb7aqWrOLSZprXLTKAQZwze5leFzG_MZeowFRtF2xUyGXOgplqJJ1kQ"

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SMART CAFE AI - TEST SUITE CHO PAYMENT SERVICE (PORT 8085)  " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. MỞ CA THU NGÂN
Write-Host "`n[1/7] Thu ngân mở ca (Opening cash: 1,000,000 VND)..." -ForegroundColor Green
$openShiftBody = @{
    branch_id = 1
    register_code = "MAIN"
    opening_cash = 1000000
} | ConvertTo-Json

try {
    $shiftRes = Invoke-RestMethod -Uri "$BaseUrl/cashier-shifts/open" -Method POST -Headers $Headers -Body $openShiftBody
    $shiftId = $shiftRes.data.id
    Write-Host "-> Mở ca thành công! Shift ID: $shiftId" -ForegroundColor White
} catch {
    Write-Host "-> Đã có ca đang mở hoặc trùng quầy, lấy ca hiện tại..." -ForegroundColor Yellow
    $curRes = Invoke-RestMethod -Uri "$BaseUrl/cashier-shifts/current" -Method GET -Headers $Headers
    $shiftId = $curRes.data.id
    Write-Host "-> Shift ID hiện tại: $shiftId" -ForegroundColor White
}

# 2. XEM THÔNG TIN CA HIỆN TẠI
Write-Host "`n[2/7] Kiểm tra thông tin ca hiện tại..." -ForegroundColor Green
$curShift = Invoke-RestMethod -Uri "$BaseUrl/cashier-shifts/current" -Method GET -Headers $Headers
Write-Host "-> Quầy: $($curShift.data.register_code) | Tiền đầu ca: $($curShift.data.opening_cash) VND | Trạng thái: $($curShift.data.status)" -ForegroundColor White

# 3. TẠO GIAO DỊCH TIỀN MẶT (CASH PAYMENT)
Write-Host "`n[3/7] Khách gọi món -> Khởi tạo giao dịch tiền mặt (Fallback Mock Order: 50,000 VND)..." -ForegroundColor Green
$payBody = @{
    order_id = 10024
    payment_method = "Cash"
} | ConvertTo-Json

$payRes = Invoke-RestMethod -Uri "$BaseUrl/payments" -Method POST -Headers $Headers -Body $payBody
$paymentId = $payRes.data.id
Write-Host "-> Khởi tạo thanh toán thành công! Payment ID: $paymentId | Số tiền: $($payRes.data.amount) VND | Trạng thái: $($payRes.data.status)" -ForegroundColor White

# 4. THU NGÂN XÁC NHẬN THU TIỀN MẶT
Write-Host "`n[4/7] Khách đưa 100,000 VND -> Thu ngân xác nhận tiền mặt (confirm-cash)..." -ForegroundColor Green
$confirmBody = @{
    cash_received = 100000
} | ConvertTo-Json

$confirmRes = Invoke-RestMethod -Uri "$BaseUrl/payments/$paymentId/confirm-cash" -Method POST -Headers $Headers -Body $confirmBody
Write-Host "-> Xác nhận tiền mặt thành công!" -ForegroundColor White
Write-Host "-> Tiền khách đưa: $($confirmRes.data.cash_received) VND | Tiền thối lại: $($confirmRes.data.change_amount) VND | Trạng thái: $($confirmRes.data.status)" -ForegroundColor Yellow

# 5. TẠO THANH TOÁN VNPAY SANDBOX (ONLINE)
Write-Host "`n[5/7] Tạo thử thanh toán VNPay Sandbox để lấy URL thanh toán..." -ForegroundColor Green
$vnpayBody = @{
    order_id = 10025
    payment_method = "VNPay"
    return_url = "http://localhost:3000/order/10025/result"
} | ConvertTo-Json

$vnpayRes = Invoke-RestMethod -Uri "$BaseUrl/payments" -Method POST -Headers $Headers -Body $vnpayBody
Write-Host "-> Tạo thanh toán VNPay thành công! Payment ID: $($vnpayRes.data.id)" -ForegroundColor White
Write-Host "-> Link VNPay Sandbox Checkout:`n$($vnpayRes.data.payment_url)" -ForegroundColor DarkCyan

# 6. YÊU CẦU XUẤT HÓA ĐƠN VAT VÀ TẢI PDF
Write-Host "`n[6/7] Yêu cầu xuất hóa đơn điện tử VAT cho đơn hàng..." -ForegroundColor Green
$invoiceBody = @{
    order_id = 10024
    buyer_name = "Cong ty TNHH Smart Cafe AI"
    buyer_tax_code = "0109988776"
    buyer_address = "Toa nha Smart Cafe, Ha Noi"
    email = "ketoan@smartcafe.vn"
} | ConvertTo-Json

$invoiceRes = Invoke-RestMethod -Uri "$BaseUrl/invoices" -Method POST -Headers $Headers -Body $invoiceBody
$invoiceId = $invoiceRes.data.id
Write-Host "-> Tạo hóa đơn thành công! Invoice ID: $invoiceId | Tiền hàng: $($invoiceRes.data.subtotal_amount) | VAT: $($invoiceRes.data.vat_amount)" -ForegroundColor White

Write-Host "-> Phát hành hóa đơn (Issue)..." -ForegroundColor Green
$issueRes = Invoke-RestMethod -Uri "$BaseUrl/invoices/$invoiceId/issue" -Method POST -Headers $Headers
Write-Host "-> Số hóa đơn: $($issueRes.data.invoice_number) | Mã tra cứu: $($issueRes.data.lookup_code)" -ForegroundColor White
Write-Host "-> Endpoint tải file PDF: GET $BaseUrl/invoices/$invoiceId/pdf" -ForegroundColor DarkCyan

# 7. ĐÓNG CA THU NGÂN (CHỐT KÉT TIỀN)
Write-Host "`n[7/7] Thu ngân kiểm đếm két và đóng ca (Khai báo tiền mặt: 1,050,000 VND)..." -ForegroundColor Green
$closeShiftBody = @{
    closing_cash = 1050000
} | ConvertTo-Json

$closeRes = Invoke-RestMethod -Uri "$BaseUrl/cashier-shifts/$shiftId/close" -Method POST -Headers $Headers -Body $closeShiftBody
Write-Host "-> Đóng ca thành công! Trạng thái: $($closeRes.data.status)" -ForegroundColor White
Write-Host "-> Tiền dự kiến (Expected): $($closeRes.data.expected_cash) VND" -ForegroundColor White
Write-Host "-> Tiền thực tế (Closing):  $($closeRes.data.closing_cash) VND" -ForegroundColor White
Write-Host "-> Chênh lệch (Discrepancy): $($closeRes.data.discrepancy) VND" -ForegroundColor Yellow

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  HOÀN TẤT KIỂM THỬ PAYMENT SERVICE THÀNH CÔNG RỰC RỠ!  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
