// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { latte } from '@/test/helpers';
import { changeOnlineCartOwner, useOnlineCartStore } from './store';

describe('online cart ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnlineCartStore.setState({ ownerId: null, fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
  });

  it('persists guest items, but does not persist account data', () => {
    useOnlineCartStore.getState().addLine(latte, 2);
    expect(localStorage.getItem('smartcafe.online-cart.v2')).toContain(latte.productName);
    changeOnlineCartOwner('account-a');
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
    expect(localStorage.getItem('smartcafe.online-cart.v2')).not.toContain(latte.productName);
  });

  it('clears account data on logout and switching accounts', () => {
    changeOnlineCartOwner('account-a');
    useOnlineCartStore.getState().addLine(latte);
    useOnlineCartStore.getState().setDelivery({ receiverName: 'A', phone: '123', addressLine: 'private' });
    changeOnlineCartOwner('account-b');
    expect(useOnlineCartStore.getState()).toMatchObject({ ownerId: 'account-b', lines: [], delivery: null });
    useOnlineCartStore.getState().addLine(latte);
    changeOnlineCartOwner(null);
    expect(useOnlineCartStore.getState()).toMatchObject({ ownerId: null, lines: [], delivery: null });
  });
});
