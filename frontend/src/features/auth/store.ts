import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Role = 'customer' | 'staff' | 'manager' | 'admin'

export interface AuthUser {
  id: string
  name: string
  role: Role
}

interface AuthState {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'smart-cafe-auth' },
  ),
)

/** Trang chủ của từng vai trò: dùng khi đăng nhập xong hoặc bị chặn nhầm khu vực */
export const roleHome: Record<Role, string> = {
  customer: '/',
  staff: '/staff',
  manager: '/manager',
  admin: '/admin',
}