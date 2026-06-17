export type QualityKey = 'common' | 'green' | 'blue' | 'purple' | 'gold' | 'red' | '';

export type StationId = 1 | 2 | 3 | 4;

export interface Ingredient {
  name: string;
  count: number;
  oid?: string;
  raw?: unknown;
  priceName?: string;
  unitPrice?: number;
  netPrice?: number;
  totalPrice?: number;
  priceSource?: 'market' | 'missing';
}

export interface ManufactureRow {
  key: string;
  station: number;
  stationName: string;
  level: number;
  unlockLevel: number;
  name: string;
  qualityKey: QualityKey;
  iconUrl: string;
  oid?: unknown;
  objectID?: unknown;
  primaryClass: string;
  secondClass: string;
  secondClassCN: string;
  period: number;
  saleGross: number;
  fee: number;
  outputGrossValue: number;
  listingFee: number;
  outputNetValue: number;
  hourlyOutputValue: number;
  marketNet: number | null;
  marketGross: number | null;
  materialCost: number;
  profit: number;
  hourlyProfit: number;
  recipeSource: 'recipe' | 'inferred';
  ingredients: Ingredient[];
  source: Record<string, unknown>;
  note: string;
  rank?: number;
  updatedAt?: number;
}

export interface DashboardStats {
  total: number;
  positive: number;
  best: ManufactureRow | null;
  worst: ManufactureRow | null;
  avgHourly: number;
}

const STATION_NAMES: Record<number, string> = {
  1: '技术中心',
  2: '工作台',
  3: '制药台',
  4: '防具台',
};

const INGREDIENT_KEYS = new Set([
  'materials',
  'material',
  'materialslist',
  'materiallist',
  'materials_list',
  'material_list',
  'consume',
  'consumes',
  'consumables',
  'items',
  'itemlist',
  'item_list',
  'need',
  'needs',
  'requirements',
  'requirementlist',
  'requirement_list',
  'costitems',
  'cost_items',
  'components',
  'componentlist',
  'component_list',
  'recipe',
  'recipes',
  'craft',
  'crafts',
  'resource',
  'resourcelist',
  'resource_list',
]);

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value: unknown): number {
  return Math.round(toNumber(value, 0));
}

export function round2(value: unknown): number {
  const n = toNumber(value, 0);
  return Math.round(n * 100) / 100;
}

export function stationName(type: unknown): string {
  return STATION_NAMES[Number(type)] || `未知台${type}`;
}

export function stationTypeName(type: unknown): string {
  return stationName(type);
}

function normalizedKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function pick(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ingredientShape(obj: Record<string, unknown>): boolean {
  return [
    'name',
    'objectName',
    'itemName',
    'oid',
    'objectID',
    'id',
    'count',
    'num',
    'quantity',
    'amount',
    'need',
    'needNum',
    'need_num',
  ].some((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

export function normalizeIngredient(rawValue: unknown): Ingredient {
  const raw = recordOf(rawValue);
  const name = pick(raw.name, raw.objectName, raw.itemName, raw.title, raw.label);
  const count = toNumber(
    pick(raw.count, raw.num, raw.quantity, raw.amount, raw.need, raw.needNum, raw.need_num, raw.n),
    1,
  );
  const oid = pick(raw.oid, raw.objectID, raw.objectId, raw.id, raw.tid);
  return {
    name: name ? String(name) : '',
    count,
    oid: oid === undefined ? undefined : String(oid),
    raw,
  };
}

export function flattenIngredients(node: unknown, depth = 0, seen = new Set<string>()): Ingredient[] {
  if (!node || depth > 4) {
    return [];
  }

  const out: Ingredient[] = [];
  if (Array.isArray(node)) {
    for (const item of node) {
      out.push(...flattenIngredients(item, depth + 1, seen));
    }
    return out;
  }

  if (!isPlainObject(node)) {
    return [];
  }

  const candidateId = [
    node.oid,
    node.objectID,
    node.id,
    node.name,
    node.objectName,
    node.itemName,
  ]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v))
    .join('|');

  if (candidateId && seen.has(candidateId)) {
    return [];
  }

  if (candidateId && ingredientShape(node)) {
    seen.add(candidateId);
    out.push(normalizeIngredient(node));
  }

  for (const [key, value] of Object.entries(node)) {
    if (INGREDIENT_KEYS.has(normalizedKey(key))) {
      out.push(...flattenIngredients(value, depth + 1, seen));
    }
  }
  return out;
}

function dedupeIngredients(items: Ingredient[]): Ingredient[] {
  const map = new Map<string, Ingredient>();
  for (const item of items) {
    const key = normalizedKey(item.oid || item.name || JSON.stringify(item.raw ?? item));
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const previous = map.get(key);
      if (previous) previous.count += item.count;
    }
  }
  return [...map.values()];
}

export function extractIngredients(recordValue: unknown): Ingredient[] {
  const record = recordOf(recordValue);
  const collected: Ingredient[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (INGREDIENT_KEYS.has(normalizedKey(key))) {
      collected.push(...flattenIngredients(value));
    }
  }
  return dedupeIngredients(collected);
}

export function inferMaterialCost(recordValue: unknown): number | null {
  const record = recordOf(recordValue);
  const gross = toNumber(pick(record.priceMax, record.price_max, record.salePrice, record.sellPrice), 0);
  const fee = toNumber(pick(record.sxf, record.fee, record.serviceFee), 0);
  const profit = toNumber(pick(record.price, record.netProfit, record.profit), 0);
  if (!gross && !fee && !profit) {
    return null;
  }
  return money(gross - fee - profit);
}

export function normalizeIconUrl(value: unknown): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `https://orzice.com${raw}`;
  return raw;
}

export function normalizeQuality(value: unknown): QualityKey {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (['1', 'white', 'grey', 'gray', 'common', 'normal', '普通', '白', '灰'].includes(raw)) return 'common';
  if (['2', 'green', 'uncommon', '优秀', '绿'].includes(raw)) return 'green';
  if (['3', 'blue', 'rare', '稀有', '蓝'].includes(raw)) return 'blue';
  if (['4', 'purple', 'epic', '史诗', '紫'].includes(raw)) return 'purple';
  if (['5', 'gold', 'orange', 'legendary', '传说', '金', '橙'].includes(raw)) return 'gold';
  if (['6', 'red', '红'].includes(raw)) return 'red';
  if (raw.includes('红')) return 'red';
  if (raw.includes('金') || raw.includes('橙') || raw.includes('legend')) return 'gold';
  if (raw.includes('紫') || raw.includes('epic')) return 'purple';
  if (raw.includes('蓝') || raw.includes('rare')) return 'blue';
  if (raw.includes('绿') || raw.includes('uncommon')) return 'green';
  return '';
}

export function normalizeManufactureRow(rawValue: unknown, context: { station?: number; level?: number } = {}): ManufactureRow {
  const raw = recordOf(rawValue);
  const station = toNumber(pick(context.station, raw.t, raw.station, raw.type, 0), 0);
  const level = toNumber(pick(context.level, raw.l, raw.grade, 0), 0);
  const ingredients = extractIngredients(raw);
  const inferredMaterialCost = inferMaterialCost(raw);
  const saleGross = money(pick(raw.priceMax, raw.price_max, raw.salePrice, raw.sellPrice, raw.priceGross, 0));
  const fee = money(pick(raw.sxf, raw.fee, raw.serviceFee, 0));
  const outputGrossValue = saleGross;
  const listingFee = fee;
  const outputNetValue = money(outputGrossValue - listingFee);
  const profitValue = pick(raw.price, raw.netProfit, raw.profit);
  const apiProfit = profitValue !== undefined ? money(profitValue) : null;
  const hourlyProfitValue = pick(raw.price_hour, raw.priceHour, raw.hourlyProfit);
  const apiHourlyProfit = hourlyProfitValue !== undefined ? money(hourlyProfitValue) : null;
  const period = round2(pick(raw.period, raw.duration, raw.manufactureHour, 0));
  const enrichedIngredients = ingredients.map((ingredient) => ({
    ...ingredient,
    priceName: ingredient.name,
    unitPrice: 0,
    netPrice: 0,
    totalPrice: 0,
    priceSource: 'missing' as const,
  }));
  const materialCost = inferredMaterialCost ?? 0;
  const calculatedProfit = money(outputNetValue - materialCost);
  const profit = apiProfit ?? calculatedProfit;
  const hourlyProfit = apiHourlyProfit ?? (period > 0 ? money(profit / period) : 0);
  const hourlyOutputValue = period > 0 ? money(outputNetValue / period) : 0;

  return {
    key: [station, level, raw.oid ?? raw.objectID ?? raw.id ?? raw.name].join(':'),
    station,
    stationName: stationName(station),
    level,
    unlockLevel: toNumber(pick(raw.unlockLevel, raw.unlock_level, raw.grade, 0), 0),
    name: String(pick(raw.name, raw.objectName, raw.itemName, raw.title) || ''),
    qualityKey: normalizeQuality(pick(raw.quality, raw.qualityName, raw.quality_name, raw.rarity, raw.rarityName, raw.rarity_name, raw.grade, raw.gradeName, raw.grade_name, raw.level, raw.levelName, raw.level_name, raw.color, raw.colorName, raw.color_name)),
    iconUrl: normalizeIconUrl(pick(raw.icon, raw.iconUrl, raw.icon_url, raw.image, raw.imageUrl, raw.image_url, raw.pic, raw.picUrl, raw.pic_url, raw.picture, raw.pictureUrl, raw.picture_url, raw.objectIcon, raw.objectIconUrl, raw.objectPic, raw.objectPicUrl, raw.objectImage, raw.objectImageUrl, raw.avatar, raw.logo)),
    oid: pick(raw.oid, raw.objectID, raw.id),
    objectID: pick(raw.objectID, raw.objectId, raw.tid),
    primaryClass: String(raw.primaryClass || ''),
    secondClass: String(raw.secondClass || ''),
    secondClassCN: String(raw.secondClassCN || ''),
    period,
    saleGross,
    fee,
    outputGrossValue,
    listingFee,
    outputNetValue,
    hourlyOutputValue,
    marketNet: null,
    marketGross: null,
    materialCost,
    profit,
    hourlyProfit,
    recipeSource: 'inferred',
    ingredients: enrichedIngredients,
    source: raw,
    note: '材料成本由售价、手续费和净利润反推',
  };
}

export function sortRows(rows: ManufactureRow[], mode = 'hourly_desc'): ManufactureRow[] {
  const copy = [...rows];
  switch (mode) {
    case 'profit_desc':
      copy.sort((a, b) => b.profit - a.profit || b.hourlyProfit - a.hourlyProfit);
      break;
    case 'hourly_output_desc':
      copy.sort((a, b) => b.hourlyOutputValue - a.hourlyOutputValue || b.outputNetValue - a.outputNetValue);
      break;
    case 'output_desc':
      copy.sort((a, b) => b.outputNetValue - a.outputNetValue || b.hourlyOutputValue - a.hourlyOutputValue);
      break;
    default:
      copy.sort((a, b) => b.hourlyProfit - a.hourlyProfit || b.profit - a.profit);
      break;
  }
  return copy.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function summarizeRows(rows: ManufactureRow[]): DashboardStats {
  const sorted = [...rows].sort((a, b) => b.hourlyProfit - a.hourlyProfit);
  return {
    total: rows.length,
    positive: rows.filter((row) => row.profit >= 0).length,
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null,
    avgHourly: rows.length ? money(rows.reduce((sum, row) => sum + row.hourlyProfit, 0) / rows.length) : 0,
  };
}
