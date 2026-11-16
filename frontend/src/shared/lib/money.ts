const vnd = new Intl.NumberFormat('vi-VN');

/** 39000 → "39.000đ". Giá VND luôn là số nguyên. */
export const formatVnd = (amount: number): string => `${vnd.format(Math.round(amount))}đ`;
