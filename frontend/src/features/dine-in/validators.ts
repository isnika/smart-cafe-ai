/** Mã bàn là giá trị Tables.qr_code (vd "QR-B1-T05"). Chỉ chặn đầu vào rõ ràng sai; tồn tại hay không do server quyết định. */
const TABLE_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidTableCode = (code: string | undefined): code is string => !!code && TABLE_CODE_RE.test(code);
