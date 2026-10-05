// 游戏改编：所有能力采用固定成本和本地效果；不让叙事决定伤害或恢复数值。
const PROFILES = {
  seer: ["analysis", "analysis", "stun", "flame_jump", "火焰牵制", "stun", "spirit_threads", "灵体之线", "control"],
  apprentice: ["analysis", "analysis", "stun", "astrology", "星象推演", "analysis", "travel_blink", "空间干扰", "stun"],
  spectator: ["analysis", "analysis", "sanity", "psychoanalysis", "心理治疗", "sanity", "dream_pacify", "梦境安抚", "stun"],
  sailor: ["health", "stun", "analysis", "sea_strike", "海流冲击", "damage", "ocean_song", "海洋之歌", "stun"],
  bard: ["sanity", "analysis", "analysis", "sun_fire", "太阳之火", "damage", "light_healing", "圣光治疗", "health"],
  reader: ["analysis", "sanity", "analysis", "knowledge_guard", "守知静心", "sanity", "arcane_strike", "秘术冲击", "damage"],
  sleepless: ["sanity", "analysis", "stun", "nightmare", "梦魇侵袭", "stun", "spirit_binding", "灵巫束缚", "stun"],
  corpse_collector: ["analysis", "sanity", "analysis", "spirit_channel", "通灵问迹", "analysis", "death_gate", "死寂之门", "stun"],
  warrior: ["health", "damage", "stun", "weapon_mastery", "武器精通", "damage", "guardian_strike", "守护反击", "damage"],
  mystery_pryer: ["analysis", "analysis", "sanity", "witchcraft", "巫术冲击", "damage", "star_reading", "星象解析", "analysis"],
  generalist: ["analysis", "sanity", "analysis", "artifact_analysis", "器物鉴析", "analysis", "celestial_focus", "天象聚焦", "damage"],
  hunter: ["analysis", "stun", "analysis", "fireball", "火焰弹", "damage", "reaping", "收割弱点", "damage"],
  marauder: ["stun", "analysis", "stun", "decipher", "符文解密", "analysis", "dream_theft", "窃梦干扰", "stun"],
  assassin: ["health", "stun", "damage", "black_flame", "黑焰", "damage", "pain_curse", "痛苦诅咒", "damage"],
  arbiter: ["analysis", "stun", "analysis", "interrogation", "审讯威慑", "stun", "punishment", "惩戒打击", "damage"],
  lawyer: ["stun", "analysis", "sanity", "bribe_distraction", "贿赂干扰", "stun", "chaos_edict", "混乱敕令", "stun"],
  prisoner: ["health", "stun", "damage", "wolf_claw", "狼人利爪", "damage", "wraith_grasp", "怨魂之握", "stun"],
  criminal: ["sanity", "analysis", "damage", "fatal_strike", "致命追击", "damage", "desire_control", "欲望压制", "stun"],
  planter: ["analysis", "analysis", "health", "harvest_heal", "丰收治疗", "health", "nature_bind", "自然束缚", "stun"],
  apothecary: ["analysis", "health", "analysis", "blood_vitality", "血族再生", "health", "crimson_spell", "深红咒术", "damage"],
  monster: ["analysis", "stun", "analysis", "luck_strike", "幸运一击", "damage", "winning_chance", "胜机预见", "stun"],
  secret_suppliant: ["sanity", "analysis", "health", "hermit_rite", "隐修秘术", "damage", "shepherd_bind", "血肉束缚", "stun"],
};

export function abilityRule(effect, sequence = 9, upgraded = false) {
  const tier = sequence <= 5 ? 3 : sequence <= 7 ? 2 : 1;
  const power = tier + (upgraded ? 1 : 0);
  const amount = effect === "damage" ? 2 + power * 2 : effect === "analysis" ? power : 1 + power;
  const target = ["damage", "stun", "control"].includes(effect) ? "enemy" : effect === "analysis" ? "clue" : "self";
  return { effect, target: { kind: target }, cost: tier, amount, duration: effect === "stun" ? (upgraded ? 2 : 1) : 0 };
}

export function buildPathwayAbilities(pathwayId, sequence9) {
  const profile = PROFILES[pathwayId];
  const passiveRule = (effect, modifier = 1) => ({ effect: "check", checkKind: { analysis: "investigation", damage: "combat", stun: "avoidance", health: "endurance", sanity: "composure" }[effect], modifier, target: { kind: "self" }, cost: 0, amount: modifier, duration: 0 });
  const abilities = sequence9.map(([id, name, description], index) => ({
    id: `${pathwayId}:${id}`, name, description, sequence: 9,
    rule: passiveRule(profile[index]),
    upgrades: index < 2 ? [{ sequence: index === 0 ? 8 : 6, rule: passiveRule(profile[index], index === 0 ? 2 : 3) }] : [],
  }));
  for (const [offset, sequence] of [[3, 7], [6, 5]]) {
    const [id, name, effect] = profile.slice(offset, offset + 3);
    abilities.push({ id: `${pathwayId}:${id}`, name, description: `${name}的本地规则效果（原著职业特色的游戏改编）。`, sequence, rule: abilityRule(effect, sequence), upgrades: [] });
  }
  return abilities;
}

export function describeAbilityRule(rule) {
  if (rule.effect === "check") {
    const label = { investigation: "调查", combat: "战斗", avoidance: "闪避潜行", endurance: "体能耐受", composure: "专注镇定" }[rule.checkKind];
    return `被动：适用的${label}检定+${rule.modifier}，不消耗灵性；单次检定只采用一项能力加值。`;
  }
  const effects = { damage: `对目标造成${rule.amount}点伤害`, stun: `令目标${rule.duration}回合无法行动`, control: "同一目标的控制进度增加1点；跨回合累计3次后令其2回合无法行动并重置进度（无需连续，不产生永久秘偶）", analysis: `为已有线索增加${rule.amount}点解析进度（上限5，不编造新事实）`, health: `恢复${rule.amount}点生命`, sanity: `恢复${rule.amount}点理智` };
  return `消耗${rule.cost}点灵性；${effects[rule.effect]}。每回合至多使用一次能力。`;
}
