import { cashierHandlers } from './cashier'
import { catalogHandlers } from './catalog';
import { orderHandlers } from './order';
import { storeHandlers } from './store';

export const handlers = [...cashierHandlers, ...catalogHandlers, ...storeHandlers, ...orderHandlers]