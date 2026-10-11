import { BEYONDER_EQUIPMENT_SLOTS, isBeyonderEquipment } from "./beyonderItems.js";

export const WEAPON_KINDS = { melee: "刀剑与近战武器", firearm: "枪械" };
export const WEAPON_QUALITIES = {
  crude: { name: "粗制", melee: [2, 4], firearm: [5, 9] },
  common: { name: "普通", melee: [5, 10], firearm: [10, 20] },
  fine: { name: "精良", melee: [11, 15], firearm: [21, 25] },
  rare: { name: "珍稀", melee: [16, 20], firearm: [26, 30] },
  extraordinary: { name: "非凡", melee: [21, 25], firearm: [31, 35] },
};
const QUALITY_ALIASES = { 粗制: "crude", 劣质: "crude", 普通: "common", 精良: "fine", 少见: "fine", 稀有: "rare", 珍稀: "rare", 珍贵: "rare", 非凡: "extraordinary", 史诗: "extraordinary", 传说: "extraordinary", 唯一: "extraordinary" };
const record = value => value && typeof value === "object" && !Array.isArray(value);
const registered = (catalog, value) => typeof value === "string" && Object.hasOwn(catalog, value);
const NON_WEAPON = /枪套|剑鞘|刀鞘|子弹|弹药|弹匣|弹壳|瞄准镜|零件|图纸|材料|配方|枪油|说明书|玩具|模型|符咒|魔药/;
const FIREARM = /枪械|手枪|步枪|左轮|转轮|燧发枪|火枪|霰弹枪|散弹枪|猎枪|冲锋枪|机枪|火铳/;
const MELEE = /匕首|短刀|长刀|军刀|猎刀|折刀|刺刀|短剑|长剑|刺剑|细剑|佩剑|刀剑|长枪|长矛|短矛|战斧|手斧|战锤|铁棍|木棍|警棍|手杖剑|指虎/;

function inferredKind(item) {
  if (NON_WEAPON.test(String(item.name || "")) || item.potion || item.talisman
    || ["服装", "货币", "魔药", "消耗品", "药剂", "食物", "饮品", "弹药", "材料"].includes(item.category)) return null;
  if (registered(WEAPON_KINDS, item.weapon?.kind)) return item.weapon.kind;
  if (FIREARM.test(String(item.name || "")) || item.category === "枪械") return "firearm";
  if (MELEE.test(String(item.name || "")) || ["武器", "近战武器", "刀剑"].includes(item.category)) return "melee";
  return null;
}

function stableRoll(seed, minimum, maximum) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return minimum + (hash >>> 0) % (maximum - minimum + 1);
}

// Saved rolls are authoritative. Legacy items get a deterministic first roll, never a reroll on load.
export function weaponProfile(item = {}) {
  if (item.potion || item.talisman) return null;
  const raw = item.weapon;
  if (record(raw) && raw.version === 1 && registered(WEAPON_KINDS, raw.kind) && registered(WEAPON_QUALITIES, raw.quality)) {
    const [minimum, maximum] = WEAPON_QUALITIES[raw.quality][raw.kind];
    if (Number.isInteger(raw.bonusPercent) && raw.bonusPercent >= minimum && raw.bonusPercent <= maximum) {
      return { version: 1, kind: raw.kind, quality: raw.quality, bonusPercent: raw.bonusPercent };
    }
  }
  const kind = inferredKind(item);
  if (!kind) return null;
  const quality = registered(WEAPON_QUALITIES, raw?.quality) ? raw.quality
    : registered(QUALITY_ALIASES, item.rarity) ? QUALITY_ALIASES[item.rarity] : "common";
  const [minimum, maximum] = WEAPON_QUALITIES[quality][kind];
  return { version: 1, kind, quality, bonusPercent: stableRoll(`${item.instanceId || item.itemId || item.name}:${kind}:${quality}`, minimum, maximum) };
}

export function normalizeWeaponItem(item) {
  const { weapon: _discarded, ...base } = item;
  const weapon = weaponProfile(item);
  return weapon ? { ...base, category: "武器", weapon, tags: [...new Set([...(Array.isArray(item.tags) ? item.tags : []), "装备", "武器"])] } : base;
}

// The model may classify a new weapon, but may never supply a roll or replace an existing one.
export function newWeaponGate(item = {}) {
  if (item.weapon === undefined) return "";
  if (!record(item.weapon) || !registered(WEAPON_KINDS, item.weapon.kind) || !registered(WEAPON_QUALITIES, item.weapon.quality)) return "武器需使用登记的 kind 与 quality";
  if (Object.keys(item.weapon).some(key => !["kind", "quality"].includes(key))) return "武器伤害由本地在创建时固定，不能自行指定数值或版本";
  if (!inferredKind(item)) return "该物品不能登记为武器";
  return "";
}

export function equippedWeapon(game) {
  const candidates = (game.inventory || []).filter(item => item.equipped && item.quantity > 0 && weaponProfile(item));
  const item = candidates.find(entry => !isBeyonderEquipment(entry) && entry.instanceId === game.equipment?.["武器"])
    || candidates.find(entry => !isBeyonderEquipment(entry))
    || BEYONDER_EQUIPMENT_SLOTS.map(slot => candidates.find(entry => entry.instanceId === game.equipment?.[slot])).find(Boolean)
    || candidates[0];
  return item ? { instanceId: item.instanceId, name: item.name, ...weaponProfile(item) } : null;
}

export function weaponBonus(game, rule) {
  return rule.effect === "damage" && rule.weaponAttack === true ? equippedWeapon(game) : null;
}

export function normalizeWeaponEquipment(game) {
  const normalWeapons = (game.inventory || []).filter(item => !isBeyonderEquipment(item) && weaponProfile(item));
  const weapon = normalWeapons.find(item => item.equipped && item.quantity > 0 && item.instanceId === game.equipment?.["武器"])
    || normalWeapons.find(item => item.equipped && item.quantity > 0);
  game.equipment = { ...game.equipment };
  const weaponIds = new Set(normalWeapons.map(item => item.instanceId));
  for (const [slot, id] of Object.entries(game.equipment)) if (slot === "武器" || weaponIds.has(id)) delete game.equipment[slot];
  for (const item of game.inventory || []) if (weaponIds.has(item.instanceId)) item.equipped = item.instanceId === weapon?.instanceId;
  if (weapon) game.equipment["武器"] = weapon.instanceId;
}

export function describeWeapon(item) {
  const weapon = weaponProfile(item);
  return weapon ? `${WEAPON_QUALITIES[weapon.quality].name} · ${WEAPON_KINDS[weapon.kind]} · 附加目标最大生命值${weapon.bonusPercent}%伤害` : "";
}

export const WEAPON_RULES = "【固定武器伤害】新购买、制作或获得的武器用inventory.add登记，可填写weapon:{kind:melee或firearm,quality:crude/common/fine/rare/extraordinary}，品质须符合交易与剧情证据；不得填写伤害数值。本地在入库时固定weapon.bonusPercent，后续描述、检视、换装、读档或inventory.update都不能重掷或修改。普通刀剑5—10%、普通枪械10—20%；更高品质加成更高，同品质枪械通常更高。只有当前装备的一件武器生效，背包与多把武器不叠加。普通攻击和rule.weaponAttack=true的能力先加武器百分比，再乘狼人强化倍率；法术、利爪、治疗、持续伤害和符咒不附加武器伤害。弱点奖励再相加，总比例最高60%，目标防御再减半，最后只取整一次。以combatRules.equippedWeapon、requestedCombatPreview和本地工具结果为准。不得另用enemy.damage或编造固定伤害点数重复结算。";
