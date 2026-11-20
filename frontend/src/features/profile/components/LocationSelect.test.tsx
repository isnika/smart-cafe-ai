// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationSelect } from './LocationSelect';
import { normalizeLocationName } from '../locations';

describe('LocationSelect', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  const options = [{ code: '1', name: 'Thành phố Đà Nẵng' }, { code: '2', name: 'Hà Nội' }];

  it('dùng một ô để tìm không dấu và chọn bằng bàn phím', () => {
    const onChange = vi.fn();
    const props = { label: 'Tỉnh / thành phố', placeholder: 'Chọn tỉnh / thành phố', options, onChange, onRetry: vi.fn() };
    const { rerender } = render(<LocationSelect {...props} value="" />);
    const input = screen.getByRole('combobox', { name: 'Tỉnh / thành phố' }) as HTMLInputElement;
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'da nang' } });
    expect(screen.getByRole('option', { name: 'Thành phố Đà Nẵng' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Hà Nội' })).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('1');
    rerender(<LocationSelect {...props} value="1" />);
    expect(input.value).toBe('Thành phố Đà Nẵng');
    expect(normalizeLocationName('Đắk Lắk')).toBe(normalizeLocationName('dak lak'));
  });

  it('xóa lựa chọn cũ khi người dùng nhập lại', () => {
    const onChange = vi.fn();
    render(<LocationSelect label="Tỉnh" placeholder="Chọn tỉnh" value="1" options={options} onChange={onChange} onRetry={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Tỉnh' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Hà' } });
    expect(onChange).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('option', { name: 'Hà Nội' }));
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('vô hiệu hóa lựa chọn và cho phép thử lại khi tải lỗi', () => {
    const retry = vi.fn();
    render(<LocationSelect label="Phường / xã" placeholder="Chọn phường / xã" value="" options={[]} error onChange={vi.fn()} onRetry={retry} />);
    expect((screen.getByRole('combobox', { name: 'Phường / xã' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('mở danh sách phía trên khi không đủ chỗ phía dưới', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740, left: 10, right: 410, width: 400, height: 40, x: 10, y: 700, toJSON: () => ({}) });
    render(<LocationSelect label="Tỉnh" placeholder="Chọn tỉnh" value="" options={options} onChange={vi.fn()} onRetry={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Tỉnh' }));
    const list = screen.getByRole('listbox', { name: 'Tỉnh' });
    expect(list.style.bottom).toBe(`${window.innerHeight - 700 + 4}px`);
    expect(list.style.top).toBe('');
  });
});
