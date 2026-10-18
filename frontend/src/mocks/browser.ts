import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { bumpVersion, db, resetDb } from './db';
import { mockConfig } from './utils';

export const worker = setupWorker(...handlers)

export async function enableMocking(): Promise<void> {
  // Không truyền tuỳ chọn unhandled: mặc định msw (2.x lẫn 3.x) là cảnh báo trong console khi gặp endpoint chưa mock
  // (vd /identity/auth/login), nên không bị lọt ra mạng thật một cách lặng lẽ.
  await worker.start();
 
  // Tay nắm debug trong DevTools: __mock.bumpVersion(1), __mock.db.orders, __mock.config.enforceAuth = true ...
  Object.assign(window, { __mock: { db, resetDb, bumpVersion, config: mockConfig } });
}
 