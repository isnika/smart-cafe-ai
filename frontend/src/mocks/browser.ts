import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { MOCK_ACCOUNTS, resetAuthMock, revokeAllTokens } from './handlers/identity';
import { MOCK_OTP, authFlowConfig, resetAuthFlowMock } from './handlers/auth-flow';
import { bumpVersion, db, resetDb } from './db';
import { seedDemoOrders } from './seed';
import { mockConfig } from './utils';

export const worker = setupWorker(...handlers);

export async function enableMocking(): Promise<void> {
  await worker.start({
    onUnhandledFrame({ frame, defaults }) {
      // Chỉ cảnh báo với request /api chưa có handler; bỏ qua file tĩnh, HMR, điều hướng trang
      const { request } = frame.data as { request?: Request };
      if (request && new URL(request.url).pathname.startsWith('/api')) {
        defaults.warn();
      }
    },
  });

  seedDemoOrders();

  const resetAuth = () => {
    resetAuthMock();
    resetAuthFlowMock();
  };
  const resetWithDemoData = () => {
    resetDb();
    resetAuth();
    seedDemoOrders();
  };

  Object.assign(window, {
    __mock: {
      db,
      resetDb,
      resetWithDemoData,
      seedDemoOrders,
      bumpVersion,
      config: mockConfig,
      auth: {
        accounts: MOCK_ACCOUNTS, // xem/sửa tài khoản (đổi status = 'Banned' để test...)
        otp: MOCK_OTP,
        config: authFlowConfig, // vd: __mock.auth.config.otpTtlMs = 1000
        revokeAllTokens, // → request kế tiếp trả 401 → test onUnauthorized
        reset: resetAuth,
      },
    },
  });
}