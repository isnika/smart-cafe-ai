import DineInCartPage from '@/features/dine-in/pages/DineInCartPage';
import { useOnlineCartStore } from '../store';
import OnlineCartPage from './OnlineCartPage';

/**
 * /cart dùng chung cho hai luồng nhưng KHÔNG chung dữ liệu: khách đã chọn Giao hàng/Mang đi → giỏ Online,
 * ngược lại → giỏ Dine-in như trước đây.
 */
export default function CartPage() {
  const online = useOnlineCartStore((s) => s.fulfillmentType !== null);
  return online ? <OnlineCartPage /> : <DineInCartPage />;
}
