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

// 仅借用职业特色；所有新能力仍由既有本地系统结算一次主要行动。
const SEQUENCE_FOUR_ABILITIES = {
  seer: [
    ["marionette_coordination", "秘偶协同", "damage", "以灵体之线协调诡术，对选定敌人发动一次打击；不创建永久秘偶或额外行动。"],
    ["spirit_thread_suppression", "灵线压制", "stun", "将灵体之线的牵制集中到选定敌人，暂时压制其行动。"],
  ],
  apprentice: [
    ["space_concealment", "空间隐秘", "stun", "以隐秘空间暂时隔断选定敌人的行动；本地结算不改变地点或解锁地图。"],
    ["illusion_discernment", "幻象辨析", "analysis", "以强化的灵性直觉和星象感知辨析已有证据中的幻象与异常。"],
  ],
  spectator: [
    ["subconscious_manipulation", "潜意识操纵", "control", "以潜意识暗示逐步积累对选定敌人的控制；达到阈值后仅暂时阻止其行动。"],
    ["mental_plague", "精神瘟疫", "damage", "将精神瘟疫化为一次针对选定敌人的心灵冲击；不向其他角色传播。"],
  ],
  sailor: [
    ["hurricane_strike", "飓风冲击", "damage", "将猛烈飓风集中为对选定敌人的一次冲击。"],
    ["storm_restraint", "风暴牵制", "stun", "以旋转风流困住选定敌人，使其暂时无法行动。"],
  ],
  bard: [
    ["unshadowed_purification", "无暗净化", "damage", "以净化光辉灼伤选定敌人，伤害按本地固定比例结算。"],
    ["purifying_serenity", "净光静心", "sanity", "以无暗光辉平复自身精神；仅恢复理智，不自动清除剧情诅咒。"],
  ],
  reader: [
    ["prophetic_deduction", "未来推演", "analysis", "将预言家的推演用于梳理已有线索；不生成未来事实或提前揭示真相。"],
    ["astral_mystic_art", "星界秘术", "damage", "调用已掌握的星界秘术，对选定敌人施加一次法术打击。"],
  ],
  sleepless: [
    ["night_domain", "黑夜领域", "stun", "将黑夜领域的压制作用集中于选定敌人，暂时限制其行动。"],
    ["deep_night_requiem", "深夜安魂", "sanity", "以安魂力量稳定自身灵魂，恢复受损的理智。"],
  ],
  corpse_collector: [
    ["underworld_seal", "冥界封印", "stun", "借冥界之力暂时封住选定敌人的行动；不修改其永久属性。"],
    ["undying_mending", "不死修复", "health", "以肉体与灵体交界处的韧性修补自身损伤；仅治疗，不复活或重置死亡。"],
  ],
  warrior: [
    ["demon_hunting_eye", "猎魔之眼", "analysis", "以猎魔经验与灵性直觉，解析已有证据中的腐化痕迹和异常。"],
    ["dawn_hunt", "曙光猎魔", "damage", "让当前武器披上曙光，对选定敌人发动一次猎魔打击。"],
  ],
  mystery_pryer: [
    ["mystical_reenactment", "神秘再现", "damage", "从已掌握的神秘知识中重现固定法术，对选定敌人发动一次打击。"],
    ["mystic_insight", "窥秘解析", "analysis", "借神秘知识辨析已有线索，不以未知秘密替代现场证据。"],
  ],
  generalist: [
    ["alchemical_construct_strike", "炼金造物击", "damage", "以临时炼金造物攻击选定敌人；本地仅结算一次伤害，不额外生成物品。"],
    ["artifact_trace", "器物追迹", "analysis", "以炼金器具梳理已有证物的关联，推进现存线索的解析。"],
  ],
  hunter: [
    ["weaponized_strike", "武器化打击", "damage", "将当前武器的杀伤潜力化为一次铁血打击，攻击选定敌人。"],
    ["iron_will", "铁血意志", "sanity", "以钢铁般勇气稳住自身精神，恢复受损的理智。"],
  ],
  marauder: [
    ["deep_parasitism", "深层寄生", "control", "将寄生侵入改编为对选定敌人的控制进度；只产生暂时牵制，不创建宿主分身。"],
    ["parasite_mending", "寄生修复", "health", "将寄生者的灵体韧性用于修复自身伤势，本地结算为定量治疗。"],
  ],
  assassin: [
    ["despair_plague", "衰败瘟疫", "damage", "将衰败瘟疫集中为对选定敌人的一次伤害，不追加传播或持续扣血。"],
    ["mirror_maze", "镜面迷宫", "stun", "以交错镜面迷惑选定敌人，暂时阻断其行动；不改变真实地点。"],
  ],
  arbiter: [
    ["imperative_confinement", "律令禁锢", "stun", "以禁锢律令暂时禁止选定敌人的行动。"],
    ["execution_verdict", "处刑裁决", "damage", "向选定敌人宣告处刑裁决；仅按固定伤害比例结算，不直接判定死亡。"],
  ],
  lawyer: [
    ["negative_bestowal", "负面赐予", "stun", "向选定敌人赐予迟缓与意志涣散，暂时限制其行动。"],
    ["magnified_strike", "攻击放大", "damage", "放大一次攻击的影响，对选定敌人造成固定比例伤害。"],
  ],
  prisoner: [
    ["poltergeist_restraint", "死物牵制", "stun", "短暂活化周围死物以牵制选定敌人，不取得场景物品的所有权。"],
    ["puppet_temperance", "木偶自制", "sanity", "以木偶化约束自身欲望，恢复理智；本次施放占用当前主要行动。"],
  ],
  criminal: [
    ["hellfire", "地狱火", "damage", "以地狱火灼伤选定敌人，伤害由本地规则固定结算。"],
    ["mind_misdirection", "心智误导", "stun", "以魔鬼般的狡诈干扰选定敌人的判断，令其暂时错失行动。"],
  ],
  planter: [
    ["life_mutation", "生命畸变", "damage", "将生命畸变的力量集中于选定敌人；仅结算一次伤害，不永久改写其身体。"],
    ["life_transmutation_mending", "炼生修复", "health", "以强化的生命炼成和治疗力量修复自身伤势，不凭空创建生命或物品。"],
  ],
  apothecary: [
    ["blood_moon_arrow", "血月之箭", "damage", "凝聚血月力量，向选定敌人射出一次咒术箭矢。"],
    ["abyss_shackles", "深渊枷锁", "stun", "以月亮与黑暗领域的枷锁暂时束缚选定敌人。"],
  ],
  monster: [
    ["misfortune_field", "厄运领域", "stun", "将厄运场作用集中于选定敌人，令其暂时陷入无法行动的不利境地。"],
    ["fate_perception", "命运感知", "analysis", "从现存线索中分析命运征兆；不生成确定预言或未知事实。"],
  ],
  secret_suppliant: [
    ["spiritual_flesh_blade", "灵肉之刃", "damage", "以堕落之力凝成灵肉之刃，对选定敌人发动一次打击。"],
    ["shadow_commandeering", "影子束缚", "stun", "操纵选定敌人的影子，将其暂时束缚在原地。"],
  ],
};

export function abilityRule(effect, sequence = 9, upgraded = false) {
  const tier = sequence <= 4 ? 4 : sequence <= 5 ? 3 : sequence <= 7 ? 2 : 1;
  const power = tier + (upgraded ? 1 : 0);
  const magnitude = effect === "damage"
    ? { damagePercent: (tier === 4 ? 55 : tier === 3 ? 50 : tier === 2 ? 30 : 20) + (upgraded ? (tier === 4 ? 5 : 10) : 0) }
    : effect === "health" ? { healPercent: (tier === 4 ? 40 : tier === 3 ? 30 : tier === 2 ? 20 : 10) + (upgraded ? 5 : 0) }
      : { amount: effect === "analysis" ? power : 1 + power };
  const target = ["damage", "stun", "control"].includes(effect) ? "enemy" : effect === "analysis" ? "clue" : "self";
  return { effect, target: { kind: target }, cost: tier, ...magnitude, duration: effect === "stun" ? (tier === 4 || upgraded ? 2 : 1) : 0 };
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
    const rule = abilityRule(effect, sequence);
    if (pathwayId === "warrior" && effect === "damage") rule.weaponAttack = true;
    if (pathwayId === "prisoner" && sequence === 7) rule.preparation = { id: "wolf-strength", name: "狼人强化", multiplier: 1.2, maxStacks: 3, cost: 1, duration: 1 };
    abilities.push({ id: `${pathwayId}:${id}`, name, description: `${name}的本地规则效果（原著职业特色的游戏改编）。`, sequence, rule, upgrades: [] });
  }
  for (const [id, name, effect, description] of SEQUENCE_FOUR_ABILITIES[pathwayId]) {
    const rule = abilityRule(effect, 4);
    if (["warrior", "hunter"].includes(pathwayId) && effect === "damage") rule.weaponAttack = true;
    abilities.push({ id: `${pathwayId}:${id}`, name, description: `${description}（原著职业特色的游戏改编。）`, sequence: 4, rule, upgrades: [] });
  }
  return abilities;
}

export function describeAbilityRule(rule) {
  if (rule.effect === "check") {
    const label = { investigation: "调查", combat: "战斗", avoidance: "闪避潜行", endurance: "体能耐受", composure: "专注镇定" }[rule.checkKind];
    return `被动：适用的${label}检定+${rule.modifier}，不消耗灵性；单次检定只采用一项能力加值。`;
  }
  const effects = { damage: `对目标造成其最大生命值${rule.damagePercent}%的伤害（向上取整，至少1点）`, stun: `令目标${rule.duration}回合无法行动`, control: "同一目标的控制进度增加1点；跨回合累计3次后令其2回合无法行动并重置进度（无需连续，不产生永久秘偶）", analysis: `为已有线索增加${rule.amount}点解析进度（上限5，不编造新事实）`, health: `恢复自身最大生命值${rule.healPercent}%的生命（向下取整，至少1点，不超过上限）`, sanity: `恢复${rule.amount}点理智` };
  const preparation = rule.preparation ? ` 可在本回合攻击前使用${rule.preparation.name}，每层消耗${rule.preparation.cost}点灵性、伤害乘1.2，最多3层；回合结束清空，伤害比例最高60%。` : "";
  return `消耗${rule.cost}点灵性；${effects[rule.effect]}。${rule.weaponAttack ? "武器技能：附加当前装备武器的固定伤害比例，再计算强化，总比例最高60%。" : ""}每回合至多执行一次主要行动。${preparation}`;
}
