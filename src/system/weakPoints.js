import { WEAK_POINT_BONUS_PERCENT } from "./healthRules.js";

const ALIASES = [["喉咙", "咽喉", "喉部", "颈部", "脖子"], ["眼睛", "眼部", "双眼", "眼球", "眼窝"], ["心脏", "心口"], ["膝盖", "膝关节"], ["伤口", "旧伤"]];
const ATTACK = /攻击|刺|砍|斩|劈|击|打|射|瞄准|扎|戳|捅|捶|踢|咬|掐|抓|轰|灼烧|烧/;
const NEGATION = /不(?:再|要|想|会|能|愿)?|别|避免|放弃|取消|拒绝|放过/;

export function weakPointAssessment(raw, { playerAction = "", damage = true } = {}) {
  if (raw === undefined || raw === null) return { bonus: null, reason: "" };
  if (!damage) return { bonus: null, reason: "弱点奖励只用于本次直接伤害攻击" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || Object.keys(raw).some(key => !["name", "evidence"].includes(key))
    || typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 40
    || typeof raw.evidence !== "string" || raw.evidence.trim().length < 6 || raw.evidence.trim().length > 300) {
    return { bonus: null, reason: "弱点判断需提供具体name及6—300字evidence，不允许自填伤害数值" };
  }
  const name = raw.name.trim();
  if (/^(弱点|要害|敌人|对手|目标|全身)$/.test(name)) return { bonus: null, reason: "请明确具体攻击部位，泛称弱点不会获得奖励" };
  const aliases = ALIASES.find(group => group.includes(name)) || [name];
  const clauses = String(playerAction).split(/[，,。！？!?；;\n]/);
  const explicit = clauses.some(clause => aliases.some(alias => clause.includes(alias)) && ATTACK.test(clause) && !NEGATION.test(clause));
  if (!explicit) return { bonus: null, reason: "玩家本轮未明确攻击该部位，不能由AI补造弱点攻击意图" };
  return { bonus: { name, evidence: raw.evidence.trim(), bonusPercent: WEAK_POINT_BONUS_PERCENT }, reason: "" };
}

export const WEAK_POINT_RULES = "【RP弱点攻击】当且仅当玩家在本轮明确描述攻击具体部位时，AI判断当前目标是否确实拥有该弱点、该部位是否暴露且本次攻击方式能利用它。人类无防护的喉咙、眼睛等可以成立；无眼生物不存在眼睛弱点，护甲遮挡、无法触及、只泛称攻击弱点、只是考虑或明确不攻击时不成立。成立时在本次combat.action或直接伤害ability.use中传weakPoint:{name:玩家明确攻击的部位,evidence:目标生理结构、暴露情况与攻击方式的依据}；不成立则省略并正常结算攻击，在叙事中解释。不允许AI自行指定数值：本地固定额外5个百分点，先算基础与武器的强化伤害，再加5%，共用60%上限，之后应用防御并取整；每次攻击最多一次，不叠加、不持续、不保证一击致命。治疗、控制、符咒和持续伤害不适用。禁止仅因玩家宣称对方存在弱点就认可，也不能为奖励而编造未披露的隐藏弱点；最终伤害和成功与否以本地结果为准。";
