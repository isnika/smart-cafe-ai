import { http, HttpResponse } from 'msw';
import type { OpenTableSessionInput, TableSession } from '@/shared/types';
import { db, isExpired, nowNaive } from '../db';
import { fail, guarded, readJson, url } from '../utils';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export const storeHandlers = [
  // POST /store/table-sessions  { qrCode, customerId? }  → mở hoặc nối lại session của bàn
  http.post(
    url('/store/table-sessions'),
    guarded(async ({ request }) => {
      const input = await readJson<Partial<OpenTableSessionInput>>(request);
      if (!input.qrCode?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu qrCode');

      const table = db.tables.find((t) => t.qrCode === input.qrCode);
      if (!table) fail(404, 'TABLE_NOT_FOUND', 'Mã QR không hợp lệ');
      if (!table.isActive) fail(409, 'TABLE_INACTIVE', `Bàn ${table.tableNumber} đang tạm ngưng phục vụ`);

      // Nối lại: bàn đã có session Active chưa hết hạn → trả lại đúng session đó (200).
      const open = db.sessions.find((s) => s.tableId === table.id && s.status === 'Active' && !isExpired(s.expiresAt));
      if (open) {
        if (input.customerId && !open.customerId) open.customerId = input.customerId; // khách đăng nhập sau → gắn tài khoản để tích tem
        return HttpResponse.json(open, { status: 200 });
      }

      const session: TableSession = {
        id: ++db.seq.session,
        tableId: table.id,
        sessionCode: crypto.randomUUID().replaceAll('-', ''),
        customerId: input.customerId ?? null,
        status: 'Active',
        openedAt: nowNaive(),
        expiresAt: nowNaive(SESSION_TTL_MS),
        closedAt: null,
      };
      db.sessions.push(session);
      return HttpResponse.json(session, { status: 201 });
    }),
  ),
];