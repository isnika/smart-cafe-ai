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
import { inventoryHandlers } from './inventory';
import { reviewHandlers } from './review';
import { intelligenceHandlers } from './intelligence';
import { chatHandlers } from './chat';
import { workforceHandlers } from './workforce';
import { dineInV1Handlers } from './dine-in-v1';

export const handlers = [...dineInV1Handlers, ...cashierHandlers, ...catalogHandlers, ...storeHandlers, ...orderHandlers, ...identityHandlers, ...orderReadHandlers, ...authFlowHandlers, ...branchHandlers, ...voucherHandlers, ...paymentHandlers, ...inventoryHandlers, ...reviewHandlers, ...intelligenceHandlers, ...chatHandlers, ...workforceHandlers];