import { describe, expect, it } from 'vitest';
import { parseTableCodeFromQr } from './qr';

describe('parseTableCodeFromQr', () => {
  it('nhận URL bàn (đủ origin hoặc chỉ path) và mã bàn thuần', () => {
    expect(parseTableCodeFromQr('https://cafe.example.com/dine-in/table/QR-B1-T05')).toBe('QR-B1-T05');
    expect(parseTableCodeFromQr('/dine-in/table/QR-B1-T05/')).toBe('QR-B1-T05');
    expect(parseTableCodeFromQr('  QR-B1-T05 ')).toBe('QR-B1-T05');
  });
  it('từ chối QR không phải mã bàn', () => {
    for (const bad of ['', 'https://example.com/khuyen-mai', 'hello world', 'https://x.com/dine-in/table/', 'https://x.com/dine-in/table/a b', 'https://x.com/dine-in/table/a/b']) {
      expect(parseTableCodeFromQr(bad)).toBeNull();
    }
  });
});
