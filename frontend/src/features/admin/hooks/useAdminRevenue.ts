import { useQuery } from '@tanstack/react-query';
import {
  getRevenueOverview,
  getRevenueByBranches,
  type RevenueReportParams,
  type RevenueOverviewResponse,
  type RevenueByBranchesResponse,
} from '@/shared/api/order';

export const ADMIN_REVENUE_KEYS = {
  all: ['admin', 'revenue'] as const,
  overview: (params?: RevenueReportParams) => ['admin', 'revenue', 'overview', params] as const,
  byBranches: (params?: RevenueReportParams) => ['admin', 'revenue', 'by-branches', params] as const,
};

export const BRANCH_META: Record<number, { name: string; shortName: string; city: string; color: string; bgLight: string; border: string }> = {
  1: {
    name: 'Smart Café - Flagship Nguyễn Huệ',
    shortName: 'Nguyễn Huệ (Q1)',
    city: 'TP. Hồ Chí Minh',
    color: '#0284c7', // Sky-600
    bgLight: 'bg-sky-50',
    border: 'border-sky-300',
  },
  2: {
    name: 'Smart Café - Landmark 81',
    shortName: 'Landmark 81 (Bình Thạnh)',
    city: 'TP. Hồ Chí Minh',
    color: '#059669', // Emerald-600
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  3: {
    name: 'Smart Café - Phố Cổ Hà Nội',
    shortName: 'Phố Cổ (Hoàn Kiếm)',
    city: 'Hà Nội',
    color: '#d97706', // Amber-600
    bgLight: 'bg-amber-50',
    border: 'border-amber-300',
  },
};

export function getBranchName(branchId: number): string {
  return BRANCH_META[branchId]?.name ?? `Chi nhánh #${branchId}`;
}

export function getBranchShortName(branchId: number): string {
  return BRANCH_META[branchId]?.shortName ?? `Chi nhánh ${branchId}`;
}

export function useAdminRevenueOverview(params?: RevenueReportParams) {
  return useQuery<RevenueOverviewResponse>({
    queryKey: ADMIN_REVENUE_KEYS.overview(params),
    queryFn: () => getRevenueOverview(params),
  });
}

export function useAdminRevenueByBranches(params?: RevenueReportParams) {
  return useQuery<RevenueByBranchesResponse>({
    queryKey: ADMIN_REVENUE_KEYS.byBranches(params),
    queryFn: () => getRevenueByBranches(params),
  });
}
