import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProvinces, listWards } from './locations';

afterEach(() => vi.unstubAllGlobals());

describe('Province Open API v2', () => {
  it('lấy tỉnh và chuẩn hóa mã thành chuỗi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ code: 1, name: 'Thành phố Hà Nội' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await listProvinces()).toEqual([{ code: '1', name: 'Thành phố Hà Nội' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://provinces.open-api.vn/api/v2/p/');
  });

  it('chỉ nhận phường thuộc tỉnh đã chọn', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify([{ code: 4, name: 'Phường Ba Đình', province_code: 1 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await listWards('1')).toEqual([{ code: '4', name: 'Phường Ba Đình', provinceCode: '1' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://provinces.open-api.vn/api/v2/w/?province=1');
    await expect(listWards('2')).rejects.toThrow('Dữ liệu phường/xã không hợp lệ.');
  });

  it('báo lỗi khi dịch vụ bên ngoài không thành công', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(listProvinces()).rejects.toThrow('Không tải được dữ liệu địa giới.');
  });
});
