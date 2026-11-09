import { cashierHandlers } from './cashier'
import { catalogHandlers } from './catalog';
import { orderHandlers } from './order';
import { storeHandlers } from './store';
import { orderReadHandlers } from './order-read';
import { identityHandlers } from './identity';
import { authFlowHandlers } from './auth-flow';
import { branchHandlers } from './branch';
import { voucherHandlers } from './voucher';
import { paymentHandlers } from './payment';
import { paymentV1Handlers } from './payment-v1';
import { inventoryHandlers } from './inventory';
import { reviewHandlers } from './review';
import { intelligenceHandlers } from './intelligence';
import { chatHandlers } from './chat';
import { workforceHandlers } from './workforce';
import { dineInV1Handlers } from './dine-in-v1';
import { onlineV1Handlers } from './online-v1';
import { orderReadV1Handlers } from './order-read-v1';
import { orderCancelV1Handlers } from './order-cancel-v1';

// onlineV1Handlers đứng TRƯỚC: request không phải Online được nhả xuống handler Dine-in.
export const handlers = [...onlineV1Handlers, ...orderReadV1Handlers, ...orderCancelV1Handlers, ...dineInV1Handlers, ...cashierHandlers, ...catalogHandlers, ...storeHandlers, ...orderHandlers, ...identityHandlers, ...orderReadHandlers, ...authFlowHandlers, ...branchHandlers, ...voucherHandlers, ...paymentV1Handlers, ...paymentHandlers, ...inventoryHandlers, ...reviewHandlers, ...intelligenceHandlers, ...chatHandlers, ...workforceHandlers];