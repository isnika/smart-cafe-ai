import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { bumpVersion, db, resetDb } from './db';
import { seedDemoOrders } from './seed';
import { mockConfig } from './utils';

export const worker = setupWorker(...handlers)

export async function enableMocking(): Promise<void> {
  await worker.start();

  seedDemoOrders();

  const resetWithDemoData = () => { resetDb(); seedDemoOrders(); };

  Object.assign(window, { __mock: { db, resetDb, resetWithDemoData, seedDemoOrders, bumpVersion, config: mockConfig } });
}