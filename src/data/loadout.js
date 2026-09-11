import { makeId } from "../utils/id.js";

export const DEFAULT_CLOTHING = "旧呢外套、白衬衫、黑长裤、磨损的皮靴";
export const CLOTHING_SLOTS = ["外套", "上装", "下装", "鞋履", "头饰", "手套", "围饰"];
const clothingPatterns = [
  ["外套", /外套|大衣|风衣|披风|斗篷|夹克/, 1.8],
  ["鞋履", /鞋|靴/, 0.9], ["头饰", /帽/, 0.2], ["手套", /手套/, 0.1],
  ["围饰", /围巾|领带|领巾|披肩/, 0.2], ["下装", /裤|半身裙|长裙|短裙/, 0.5],
  ["上装", /衬衫|背心|毛衣|上衣|连衣裙|礼服|长袍/, 0.4],
];

export function equipmentSlot(item) {
  return item.category === "服装" && CLOTHING_SLOTS.includes(item.slot) ? `服装:${item.slot}` : item.category;
}

export function loadoutInput(character) {
  const clothing = String(character.clothingDescription ?? DEFAULT_CLOTHING).trim();
  const name = String(character.carriedItemName || "").trim();
  const description = String(character.carriedItemDescription || "").trim();
  if (!clothing || clothing.length > 600) throw new Error("请填写 1—600 字的衣着描述。");
  if (name.length > 40 || description.length > 300) throw new Error("随身物品名称最多 40 字，描述最多 300 字。");
  if (!name && description) throw new Error("请为随身物品填写名称，或清空描述以不携带物品。");
  if (/魔药|封印物/.test(name)) throw new Error("开局自选物品需为普通物品；魔药与封印物需在剧情中获得。");
  if (/[、，,；;\n+＋]/.test(name) || /装满|一套武器|一批|一箱武器|内含.*[、，,]|附带.*[、，,]/.test(name + description)) {
    throw new Error("自选名额限一件物品，请拆开填写；容器不附赠箱内物资。");
  }
  return { clothing, name, description };
}

function validText(value, maximum, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`行装中的${label}无效，请重新整理。`);
  return value.trim();
}

function validWeight(value, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.01 || value > maximum) throw new Error(`行装重量需在 0.01—${maximum} kg 之间，请重新整理。`);
  return Math.round(value * 100) / 100;
}

// 只接收名称、描述、部位和估算重量；模型不能发放金钱、魔药、能力或嵌套物资。
export function validateLoadout(raw, character) {
  const input = loadoutInput(character);
  if (!raw || !Array.isArray(raw.clothes) || raw.clothes.length < 1 || raw.clothes.length > CLOTHING_SLOTS.length) throw new Error("衣物清单应包含 1—7 件衣物，请重新整理。");
  const slots = new Set();
  const names = new Set();
  const clothes = raw.clothes.map((entry) => {
    if (!entry || !CLOTHING_SLOTS.includes(entry.slot) || slots.has(entry.slot)) throw new Error("衣物穿戴部位重复或无效，请合并同部位衣物后重新整理。");
    slots.add(entry.slot);
    const name = validText(entry.name, 40, "衣物名称");
    if (/魔药|封印物/.test(name)) throw new Error("开局衣物不能包含魔药或封印物，请重新整理。");
    if (names.has(name)) throw new Error("衣物重复，请重新整理。");
    names.add(name);
    if (entry.quantity != null && entry.quantity !== 1) throw new Error("每项开局物品数量固定为 1。");
    return { name, description: validText(entry.description, 240, "衣物描述"), slot: entry.slot, weight: validWeight(entry.weight, 4) };
  });
  if (raw.carriedItem?.accepted === false && input.name) throw new Error("随身物品需为一件普通物品，请调整描述；特殊能力和额外物资不能在开局直接获得。");
  const carriedItem = input.name ? { name: input.name, description: input.description || "一件随身携带的个人物品。", weight: validWeight(raw.carriedItem?.weight, 5) } : null;
  const weight = clothes.reduce((sum, item) => sum + item.weight, 0) + (carriedItem?.weight || 0) + (character.talent === "heirloom-watch" ? 0.1 : 0);
  if (weight > 12) throw new Error("开局行装超过 12 kg，请精简衣着或随身物品。");
  return { clothes, carriedItem };
}

export function localLoadout(character) {
  const input = loadoutInput(character);
  const clothes = input.clothing.split(/[、，,；;。\n]+|以及|和/).filter((entry) => entry.trim()).map((entry) => {
    const match = clothingPatterns.find(([, pattern]) => pattern.test(entry));
    if (!match) throw new Error("本地整理无法识别这段衣着。请用顿号分隔具体衣物名称，或在 API 设置中启用 AI 生成。");
    return { name: entry.trim(), description: entry.trim(), slot: match[0], weight: match[2] };
  });
  return validateLoadout({ clothes, carriedItem: input.name ? { weight: 1 } : null }, character);
}

export function loadoutInventory(loadout) {
  const createItem = (entry, index, clothing) => ({
    instanceId: makeId("item"), itemId: `starting-${clothing ? "clothing" : "personal"}-${index}`,
    name: entry.name, description: entry.description, weight: entry.weight, quantity: 1,
    category: clothing ? "服装" : "随身物品", ...(clothing ? { slot: entry.slot } : {}),
    equipped: clothing, tags: clothing ? ["装备"] : ["可检查"], rarity: "普通", importance: "normal",
    condition: "良好", properties: {}, hiddenInfo: "", discoveredInfo: entry.description,
    acquiredAt: "第 0 轮", source: clothing ? "开局衣着" : "自选随身物品", isNew: false,
  });
  return [...loadout.clothes.map((entry, index) => createItem(entry, index, true)), ...(loadout.carriedItem ? [createItem(loadout.carriedItem, 0, false)] : [])];
}
