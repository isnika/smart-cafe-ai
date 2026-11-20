const API = 'https://provinces.open-api.vn/api/v2';

export const normalizeLocationName = (value: string) => value.toLocaleLowerCase('vi')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export interface ProvinceOption { code: string; name: string }
export interface WardOption { code: string; name: string; provinceCode: string }

interface Division { code: number; name: string }
interface Ward extends Division { province_code: number }

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Không tải được dữ liệu địa giới.');
  return response.json() as Promise<unknown>;
}

function isDivision(value: unknown): value is Division {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Division>;
  return Number.isInteger(v.code) && typeof v.name === 'string' && v.name.trim().length > 0;
}

export async function listProvinces(signal?: AbortSignal): Promise<ProvinceOption[]> {
  const data = await getJson(`${API}/p/`, signal);
  if (!Array.isArray(data) || !data.every(isDivision)) throw new Error('Dữ liệu tỉnh/thành phố không hợp lệ.');
  return data.map((p) => ({ code: String(p.code), name: p.name }));
}

export async function listWards(provinceCode: string, signal?: AbortSignal): Promise<WardOption[]> {
  if (!/^\d+$/.test(provinceCode)) throw new Error('Mã tỉnh/thành phố không hợp lệ.');
  const data = await getJson(`${API}/w/?province=${encodeURIComponent(provinceCode)}`, signal);
  if (!Array.isArray(data) || !data.every((ward: unknown) => isDivision(ward) && String((ward as Ward).province_code) === provinceCode)) throw new Error('Dữ liệu phường/xã không hợp lệ.');
  return (data as Ward[]).map((ward) => ({ code: String(ward.code), name: ward.name, provinceCode }));
}
