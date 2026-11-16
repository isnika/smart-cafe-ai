import { beforeEach, describe, expect, it } from 'vitest';
import { buildAiReply, FALLBACK_REPLY, fold, MAX_SUGGESTIONS, type ChatCatalogItem } from './chat-ai';
import { BRANCH_ID, db, isSellable, resetDb, toMenuProduct } from './db';
import { seedCategories } from './fixtures';

/** Catalog đúng như handler dùng: món Active còn bán, lấy từ db mock (không dựng tay trong test). */
function catalog(): ChatCatalogItem[] {
  const names = new Map(seedCategories().map((c) => [c.id, c.name]));
  return db.products
    .filter((s) => s.product.status === 'Active' && s.variants.some((v) => isSellable(BRANCH_ID, s, v)))
    .map((s) => toMenuProduct(s, BRANCH_ID))
    .map((product) => ({ product, categoryName: names.get(product.categoryId) }));
}

const byId = (id: number) => db.products.find((s) => s.product.id === id)!.product;

beforeEach(() => resetDb());

describe('fold', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(fold('Cà phê Đá xay')).toBe('ca phe da xay');
  });
});

describe('buildAiReply — "gợi ý đồ uống ít đắng"', () => {
  it('trả 2–3 thẻ lấy từ catalog, chỉ là đồ uống còn bán', () => {
    const reply = buildAiReply('gợi ý đồ uống ít đắng', catalog());
    expect(reply.products.length).toBeGreaterThanOrEqual(2);
    expect(reply.products.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    for (const card of reply.products) {
      const product = byId(card.productId);
      expect(card.name).toBe(product.name);
      expect(card.price).toBe(toMenuProduct(db.products.find((s) => s.product.id === card.productId)!, BRANCH_ID).price);
      expect(product.temperature).not.toBeNull(); // không phải bánh
    }
    expect(reply.content).toMatch(/ít đắng/);
  });

  it('tránh món vị đậm (bold/earthy) và món hết hàng', () => {
    const reply = buildAiReply('gợi ý đồ uống ít đắng', catalog());
    for (const card of reply.products) {
      const tags = byId(card.productId).flavorTags ?? [];
      expect(tags).not.toContain('bold');
      expect(tags).not.toContain('earthy');
    }
    // Matcha (variant 41) đang hết hàng ở chi nhánh → không bao giờ được gợi ý
    expect(reply.products.map((p) => p.productId)).not.toContain(4);
  });

  it('khách gõ không dấu / viết hoa vẫn hiểu', () => {
    const a = buildAiReply('GOI Y DO UONG IT DANG', catalog());
    const b = buildAiReply('gợi ý đồ uống ít đắng', catalog());
    expect(a.products.map((p) => p.productId)).toEqual(b.products.map((p) => p.productId));
  });

  it('bám theo dữ liệu catalog: đổi tag trong db thì kết quả đổi theo', () => {
    const before = buildAiReply('gợi ý đồ uống ít đắng', catalog()).products.map((p) => p.productId);
    const target = db.products.find((s) => s.product.id === before[0])!;
    target.product.flavorTags = ['bold']; // thành món đậm → phải bị loại
    const after = buildAiReply('gợi ý đồ uống ít đắng', catalog()).products.map((p) => p.productId);
    expect(after).not.toContain(before[0]);
  });
});

describe('buildAiReply — các ý định khác', () => {
  it('"không caffeine" chỉ gồm món caffeine None', () => {
    const reply = buildAiReply('mình muốn đồ uống không caffeine', catalog());
    expect(reply.products.length).toBeGreaterThan(0);
    for (const card of reply.products) expect(byId(card.productId).caffeineLevel).toBe('None');
  });

  it('"bánh" chỉ gồm món không phải đồ uống', () => {
    const reply = buildAiReply('có bánh gì không', catalog());
    expect(reply.products.length).toBeGreaterThan(0);
    for (const card of reply.products) expect(byId(card.productId).temperature ?? null).toBeNull();
  });

  it('gõ tên món thì món đó đứng đầu', () => {
    const reply = buildAiReply('cho mình xem trà đào cam sả', catalog());
    expect(reply.products[0]?.name).toBe(byId(5).name);
  });

  it('"cà phê đậm" ưu tiên món bold', () => {
    const reply = buildAiReply('cà phê đậm', catalog());
    expect(reply.products.length).toBeGreaterThan(0);
    expect(byId(reply.products[0]!.productId).flavorTags).toContain('bold');
  });

  it('có tiêu chí hợp lệ nhưng không món nào khớp → báo không có, không bịa món', () => {
    const empty = catalog().filter((i) => i.product.temperature == null); // chỉ còn bánh
    const reply = buildAiReply('gợi ý đồ uống ít đắng', empty);
    expect(reply.products).toEqual([]);
    expect(reply.content).toMatch(/chưa tìm thấy/);
  });
});

describe('buildAiReply — trả lời mặc định', () => {
  it('câu không hiểu → hỏi lại, không kèm món', () => {
    const reply = buildAiReply('asdf qwer zxcv', catalog());
    expect(reply).toEqual({ content: FALLBACK_REPLY, products: [] });
  });

  it('chào hỏi / cảm ơn / hỏi nhân viên → không kèm món', () => {
    expect(buildAiReply('xin chào', catalog()).products).toEqual([]);
    expect(buildAiReply('cảm ơn nhé', catalog()).products).toEqual([]);
    const staff = buildAiReply('cho mình gặp nhân viên', catalog());
    expect(staff.products).toEqual([]);
    expect(staff.content).toMatch(/Chuyển nhân viên/);
  });

  it('catalog rỗng không làm hỏng', () => {
    expect(buildAiReply('gợi ý đồ uống ít đắng', []).products).toEqual([]);
  });
});
