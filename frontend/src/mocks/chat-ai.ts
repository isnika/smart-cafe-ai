import type { CaffeineLevel, ChatProductCard, MenuProduct, Temperature } from '@/shared/types';

/**
 * "AI" giả lập cho chat: đọc câu của khách, quy về tiêu chí (vị, caffeine, nóng/lạnh, loại món) rồi CHỌN MÓN TỪ CATALOG
 * đang bán (flavorTags, caffeineLevel, temperature, mô tả, tên, danh mục). Không có danh sách món nào được viết cứng ở đây —
 * chỉ có từ vựng ý định ("ít đắng" → ưu tiên vị ngọt/béo/trái cây, tránh vị đậm).
 */

export interface ChatCatalogItem {
  product: MenuProduct;
  categoryName?: string;
}

export interface AiReply {
  content: string;
  products: ChatProductCard[];
}

export const MAX_SUGGESTIONS = 3;

/** "Cà phê" → "ca phe": khách gõ không dấu vẫn hiểu. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

interface Wants {
  /** Nhãn hiển thị trong câu trả lời, vd "ít đắng". */
  labels: string[];
  prefer: Set<string>;
  avoid: Set<string>;
  /** Mức caffeine bị trừ điểm (không loại hẳn). */
  softAvoidCaffeine: Set<CaffeineLevel>;
  /** Mức caffeine được phép (loại hẳn món ngoài danh sách). */
  caffeine?: CaffeineLevel[];
  temperature?: Temperature[];
  kind: 'drink' | 'food' | 'any';
  recommend: boolean;
}

interface Rule {
  test: RegExp;
  apply: (w: Wants) => void;
}

const add = (set: Set<string>, ...values: string[]) => values.forEach((v) => set.add(v));

const LESS_BITTER = /\b(it|bot|khong|ko|tranh|dung)\s+(bi\s+)?dang\b|de uong|dang nhe|\bdiu\b|nhe nhang/;

const RULES: Rule[] = [
  {
    test: LESS_BITTER,
    apply: (w) => {
      w.labels.push('ít đắng');
      add(w.prefer, 'sweet', 'creamy', 'fruity', 'chocolate', 'refreshing');
      add(w.avoid, 'bold', 'earthy');
      w.softAvoidCaffeine.add('High');
    },
  },
  {
    // "đậm/mạnh/nhiều caffeine" — bỏ qua khi khách đã nói "ít đắng".
    test: /\bdam\b|\bdam da\b|manh|bold|tinh tao|nhieu (caffeine|cafein)|\bdang\b/,
    apply: (w) => {
      if (w.labels.includes('ít đắng')) return;
      w.labels.push('đậm vị');
      add(w.prefer, 'bold');
      w.caffeine = ['Medium', 'High'];
    },
  },
  {
    test: /\bngot\b/,
    apply: (w) => {
      w.labels.push('vị ngọt');
      add(w.prefer, 'sweet', 'chocolate');
    },
  },
  {
    test: /\bbeo\b|\bsua\b|creamy/,
    apply: (w) => {
      w.labels.push('béo, có sữa');
      add(w.prefer, 'creamy');
    },
  },
  {
    test: /trai cay|thanh mat|giai nhiet|fruity|\bchua\b/,
    apply: (w) => {
      w.labels.push('thanh mát, trái cây');
      add(w.prefer, 'fruity', 'refreshing');
    },
  },
  {
    test: /(khong|ko|khoi)\s+(co\s+)?(caffeine|cafein)|decaf|0\s*(caffeine|cafein)/,
    apply: (w) => {
      w.labels.push('không caffeine');
      w.caffeine = ['None'];
    },
  },
  {
    test: /\b(it|bot)\s+(caffeine|cafein)/,
    apply: (w) => {
      w.labels.push('ít caffeine');
      w.caffeine = ['None', 'Low'];
    },
  },
  {
    test: /\bnong\b/,
    apply: (w) => {
      w.labels.push('uống nóng');
      w.temperature = ['Hot', 'Hot_Or_Iced'];
    },
  },
  {
    test: /\blanh\b|\bda\b|da xay/,
    apply: (w) => {
      w.labels.push('uống lạnh');
      w.temperature = ['Iced', 'Blended', 'Hot_Or_Iced'];
    },
  },
  {
    test: /\bbanh\b|do an|an vat|an nhe|an kem/,
    apply: (w) => {
      w.kind = 'food';
    },
  },
  {
    test: /do uong|thuc uong|\buong\b|nuoc\b|drink/,
    apply: (w) => {
      if (w.kind === 'any') w.kind = 'drink';
    },
  },
  {
    test: /goi y|de xuat|recommend|nen (uong|thu|chon)|uong gi|an gi|mon nao|ban chay|noi bat/,
    apply: (w) => {
      w.recommend = true;
    },
  },
];

/** Từ không mang nghĩa tìm món → không dùng để khớp tên/mô tả/danh mục. */
const STOP = new Set([
  'goi', 'uong', 'cho', 'toi', 'minh', 'muon', 'nao', 'khong', 'mon', 'mot', 'hay', 'la', 'cua', 'quan', 'ban', 'voi',
  'nhe', 'nha', 'duoc', 'the', 'nen', 'thu', 'chon', 'nao', 'gi', 'nhieu', 'dang', 'ngot', 'beo', 'nong', 'lanh', 'caffeine',
  'cafein', 'banh', 'drink', 'recommend', 'thanh', 'mat', 'trai', 'cay', 'dam', 'manh', 'diu', 'chua', 'xin', 'chao',
  'hello', 'thanks', 'thank',
]);

const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

function parse(text: string): { wants: Wants; tokens: string[] } {
  const folded = fold(text);
  const wants: Wants = {
    labels: [], prefer: new Set(), avoid: new Set(), softAvoidCaffeine: new Set(), kind: 'any', recommend: false,
  };
  for (const rule of RULES) if (rule.test.test(folded)) rule.apply(wants);
  const tokens = [...new Set(words(text).filter((t) => t.length >= 3 && !STOP.has(t)))];
  return { wants, tokens };
}

export const toCard = (p: MenuProduct): ChatProductCard => ({
  productId: p.id, name: p.name, price: p.price, maxPrice: p.maxPrice, image: p.image ?? null,
});

interface Scored {
  item: ChatCatalogItem;
  score: number;
}

function score(item: ChatCatalogItem, wants: Wants, tokens: string[], foldedText: string): number | null {
  const p = item.product;
  const isDrink = p.temperature != null;
  if (wants.kind === 'drink' && !isDrink) return null;
  if (wants.kind === 'food' && isDrink) return null;
  if (wants.caffeine && !wants.caffeine.includes(p.caffeineLevel)) return null;
  if (wants.temperature && !(p.temperature && wants.temperature.includes(p.temperature))) return null;

  let s = 0;
  const tags = p.flavorTags ?? [];
  for (const tag of tags) {
    if (wants.prefer.has(tag)) s += 2;
    if (wants.avoid.has(tag)) s -= 3;
  }
  if (wants.softAvoidCaffeine.has(p.caffeineLevel)) s -= 2;

  const haystack = new Set([...words(p.name), ...words(p.description ?? ''), ...words(item.categoryName ?? ''), ...tags.map(fold)]);
  s += tokens.filter((t) => haystack.has(t)).length;
  if (foldedText.includes(fold(p.name))) s += 5;
  return s;
}

const GREETING = /^(xin\s+)?chao\b|^hello\b|^hi\b|^alo\b|^hey\b/;
const THANKS = /cam on|\bthanks?\b|\bthank you\b/;
const WANT_STAFF = /nhan vien|gap nguoi|nguoi that|khieu nai|hotline|quan ly/;

export const FALLBACK_REPLY =
  'Mình chưa hiểu rõ ý bạn lắm. Bạn muốn mình gợi ý đồ uống theo vị (ngọt, béo, ít đắng, thanh mát), theo mức caffeine hay uống nóng/lạnh? Mình sẽ chọn món từ menu cho bạn nhé.';

/** Tạo câu trả lời từ câu khách gõ + catalog đang bán. `catalog` nên chỉ gồm món còn bán. */
export function buildAiReply(text: string, catalog: ChatCatalogItem[]): AiReply {
  const folded = fold(text).trim();
  const { wants, tokens } = parse(text);
  // Tiêu chí do luật ý định nhận ra (khác với từ khoá tự do khớp tên món).
  const hasRuleCriteria =
    wants.prefer.size > 0 || wants.caffeine !== undefined || wants.temperature !== undefined || wants.kind !== 'any' || wants.recommend;
  const hasCriteria = hasRuleCriteria || tokens.length > 0;

  if (!hasRuleCriteria && THANKS.test(folded)) {
    return { content: 'Rất vui được giúp bạn! Cần gợi ý thêm món nào cứ hỏi mình nhé.', products: [] };
  }
  if (!hasRuleCriteria && GREETING.test(folded)) {
    return { content: 'Chào bạn! Mình là trợ lý AI của quán. Bạn muốn uống vị gì hôm nay — ngọt béo, ít đắng hay thanh mát?', products: [] };
  }
  if (WANT_STAFF.test(folded) && !hasRuleCriteria) {
    return { content: 'Bạn bấm nút "Chuyển nhân viên" ở đầu khung chat, nhân viên sẽ hỗ trợ bạn trực tiếp nhé.', products: [] };
  }

  if (hasCriteria) {
    const requireMatch = wants.prefer.size > 0 || tokens.length > 0;
    const ranked: Scored[] = [];
    for (const item of catalog) {
      const s = score(item, wants, tokens, folded);
      if (s === null) continue;
      if (requireMatch && s <= 0) continue;
      ranked.push({ item, score: s });
    }
    ranked.sort((a, b) => b.score - a.score || a.item.product.sortOrder - b.item.product.sortOrder || a.item.product.id - b.item.product.id);
    const picked = ranked.slice(0, MAX_SUGGESTIONS).map((r) => toCard(r.item.product));

    if (picked.length > 0) {
      const label = wants.labels.length > 0 ? ` ${wants.labels.join(', ')}` : '';
      const content =
        wants.labels.length > 0
          ? `Mình gợi ý ${picked.length > 1 ? 'vài' : 'một'} món${label} cho bạn:`
          : picked.length > 1
            ? 'Đây là vài món bạn có thể thích:'
            : 'Mình thấy món này khá hợp với bạn:';
      return { content, products: picked };
    }
    // Chỉ từ khoá lạ, không khớp món nào và không có tiêu chí rõ ràng → hỏi lại thay vì báo "không có".
    if (!hasRuleCriteria) return { content: FALLBACK_REPLY, products: [] };
    return {
      content:
        'Hiện mình chưa tìm thấy món nào đang bán đúng với yêu cầu này. Bạn thử đổi tiêu chí nhé, ví dụ vị ngọt béo, trà trái cây thanh mát hoặc mức caffeine khác?',
      products: [],
    };
  }

  return { content: FALLBACK_REPLY, products: [] };
}
