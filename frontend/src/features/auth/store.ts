import { create } from 'zustand';
import { identityApi } from '@/shared/api';
import type { AuthSession, LoginInput, RoleName, User } from '@/shared/types';

/**
 * booting       : có token trong storage, đang gọi /me để xác nhận → guard hiển thị loading
 * authenticated : đã có user
 * anonymous     : không có (hoặc không còn) phiên hợp lệ → guard chuyển về /login
 */
export type AuthStatus = 'booting' | 'authenticated' | 'anonymous';

// ── Persist thủ công: chỉ lưu "claims" của token, KHÔNG lưu user (luôn lấy mới từ /me) ──
const STORAGE_KEY = 'smartcafe.auth';

interface Persisted {
  accessToken: string;
  refreshToken: string | null;
  roleName: RoleName;
  branchId: number | null;
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Persisted>;
    if (typeof p.accessToken !== 'string' || !p.roleName) return null;
    return {
      accessToken: p.accessToken,
      refreshToken: p.refreshToken ?? null,
      roleName: p.roleName,
      branchId: p.branchId ?? null,
    };
  } catch {
    return null; // JSON hỏng / storage bị chặn
  }
}

function save(p: Persisted | null): void {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota → bỏ qua, phiên chỉ sống trong RAM */
  }
}

// ── Store ─────────────────────────────────────────────────────────────
interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  roleName: RoleName | null;
  branchId: number | null;

  login: (input: LoginInput) => Promise<AuthSession>;
  /**
   * Áp dụng một phiên đã được server cấp (lưu storage + chuyển sang authenticated).
   * Dùng cho login và cho auto-login sau khi xác minh OTP đăng ký.
   */
  applySession: (session: AuthSession) => void;
  /** Gọi API logout (best-effort) rồi xoá phiên local. */
  logout: () => Promise<void>;
  /** Gọi 1 lần ở entry sau khi MSW sẵn sàng. */
  hydrate: () => Promise<void>;
  /** Xoá phiên local, không gọi API. Dùng cho 401. */
  clear: () => void;
}

// Đọc đồng bộ lúc tạo store → status ban đầu đúng ngay từ render đầu tiên (không bị flash /login).
const saved = load();

export const useAuthStore = create<AuthState>((set, get) => ({
  status: saved ? 'booting' : 'anonymous',
  accessToken: saved?.accessToken ?? null,
  refreshToken: saved?.refreshToken ?? null,
  user: null,
  roleName: saved?.roleName ?? null,
  branchId: saved?.branchId ?? null,

  login: async (input) => {
    const session = await identityApi.login(input); // auth:false → 401 sai mật khẩu không kích hoạt onUnauthorized
    get().applySession(session);
    return session;
  },

  applySession: (session) => {
    save({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      roleName: session.roleName,
      branchId: session.branchId ?? null,
    });
    set({
      status: 'authenticated',
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      user: session.user,
      roleName: session.roleName,
      branchId: session.branchId ?? null,
    });
  },

  logout: async () => {
    try {
      await identityApi.logout(); // cần token nên phải gọi TRƯỚC khi clear
    } catch {
      /* token có thể đã hết hạn / mất mạng — vẫn đăng xuất phía client */
    }
    get().clear();
  },

  hydrate: async () => {
    const token = get().accessToken;
    if (!token) {
      set({ status: 'anonymous' });
      return;
    }
    try {
      const user = await identityApi.getMe();
      // Trong lúc chờ, user có thể đã logout / bị 401 clear / login tài khoản khác → bỏ kết quả cũ.
      if (get().accessToken !== token) return;
      set({ user, status: 'authenticated' });
    } catch {
      // 401: onUnauthorized đã clear() rồi (token đổi → nhánh dưới bị bỏ qua).
      // Lỗi mạng / 5xx: giữ token để lần reload sau thử lại, nhưng chưa cho vào app.
      if (get().accessToken === token) set({ status: 'anonymous' });
    }
  },

  clear: () => {
    save(null);
    set({ status: 'anonymous', accessToken: null, refreshToken: null, user: null, roleName: null, branchId: null });
  },
}));