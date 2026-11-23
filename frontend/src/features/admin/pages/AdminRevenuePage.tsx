import { PageHeading } from '@/features/admin/pages/AdminPages';
import { AdminRevenueSection } from '../components/AdminRevenueSection';

export function AdminRevenuePage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeading title="Quản lý Doanh thu toàn chuỗi" />
      <AdminRevenueSection />
    </div>
  );
}

export default AdminRevenuePage;
