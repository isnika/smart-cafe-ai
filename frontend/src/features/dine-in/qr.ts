import { isValidTableCode } from './validators';

/**
 * Lấy mã bàn từ nội dung mã QR. Chấp nhận:
 *  - URL (đầy đủ hoặc chỉ path) dạng .../dine-in/table/<mã>
 *  - hoặc chính mã bàn (vd "QR-B1-T05")
 * Trả null với mọi thứ khác (QR quảng cáo, link lạ...) để không đưa khách vào bàn giả.
 */
export function parseTableCodeFromQr(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (isValidTableCode(text)) return text;
  try {
    const { pathname } = new URL(text, 'http://placeholder.local');
    const m = /^\/dine-in\/table\/([^/]+)\/?$/.exec(pathname);
    const code = m?.[1] ? decodeURIComponent(m[1]) : null;
    return isValidTableCode(code ?? undefined) ? code : null;
  } catch {
    return null;
  }
}
