import { cashierHandlers } from './cashier'
import { catalogHandlers } from './catalog';
import { orderHandlers } from './order';
import { storeHandlers } from './store';
import { orderReadHandlers } from './order-read';
import { identityHandlers } from './identity';

export const handlers = [...cashierHandlers, ...catalogHandlers, ...storeHandlers, ...orderHandlers, ...identityHandlers, ...orderReadHandlers];