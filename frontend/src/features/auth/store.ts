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
  loginWithGoogle: (idToken: string) => Promise<AuthSession>;
  /**
   * Áp dụng một phiên đã được server cấp (lưu storage + chuyển sang authenticated).
   * Dùng cho login và cho auto-login sau khi xác minh OTP đăng ký.
   */
  applySession: (session: AuthSession) => void;
  /** Gọi API logout (best-effort) rồi xoá phiên local. */
  logout: () => Promise<void>;
  /**
   * Đổi refresh token lấy cặp token mới (refresh token bị xoay → lưu cặp mới).
   * http.ts gọi qua configureHttp({ refresh }) và đã gộp single-flight. true = thành công.
   */
  refresh: () => Promise<boolean>;
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

  loginWithGoogle: async (idToken) => {
    const session = await identityApi.loginWithGoogle(idToken);
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

  refresh: async () => {
    const rt = get().refreshToken;
    if (!rt) return false;
    try {
      const t = await identityApi.refresh(rt);
      // Phiên đã bị clear / đổi tài khoản trong lúc chờ → bỏ kết quả cũ
      if (get().refreshToken !== rt) return false;
      const next = { accessToken: t.accessToken, refreshToken: t.refreshToken ?? rt };
      const { roleName, branchId } = get();
      if (roleName) save({ ...next, roleName, branchId });
      set(next);
      return true;
    } catch {
      return false; // refresh hỏng/hết hạn → http.ts gọi onUnauthorized
    }
  },

  logout: async () => {
    const refreshToken = get().refreshToken;
    try {
      await identityApi.logout(refreshToken); // cần refresh token để thu hồi phiên server trước khi clear
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
      const roleName = identityApi.roleFromUser(user) ?? get().roleName;
      if (!roleName) throw new Error('API /users/me không trả về vai trò hợp lệ');
      const branchId = get().branchId;
      save({ accessToken: token, refreshToken: get().refreshToken, roleName, branchId });
      set({ user, roleName, status: 'authenticated' });
    } catch {
      // HTTP client đã thử refresh một lần khi /me trả 401. Nếu refresh thất bại,
      // onUnauthorized sẽ clear store; lỗi mạng / 5xx vẫn giữ phiên để tải lại sau.
      if (get().accessToken === token) set({ status: 'anonymous' });
    }
  },

  clear: () => {
    save(null);
    set({ status: 'anonymous', accessToken: null, refreshToken: null, user: null, roleName: null, branchId: null });
  },
}));
