import { PATHWAYS, getPathway, pathwayIdForName } from "../content/index.js";

export const CHARACTERISTIC_MAX_SEQUENCE = 7;

export const CHARACTERISTIC_ADVANCEMENT_RULE = "【非凡特性晋升】获得非凡特性时，inventory.add填写characteristic={pathwayId,sequence,identified}，与potion互斥；只有可靠确认身份后identified才为true。持有或获得特性本身不自动晋升。玩家本轮明确决定吸收，并确认消耗一份当前途径下一序列的特性后，目标序列7至0可通过advancement.promote的characteristicInstanceId直接晋升，无需另外取得配方、调制魔药或满足仪式条件；与potionInstanceId必须且只能选一个。序列8和9的特性仍需调制为魔药，普通人不能直接吸收非凡特性，禁止跨途径、跳级、重复吸收及一回合连续晋升。直接特性晋升的三项上限正常增长，当前生命、理智、灵性先分别增加本次晋升增长值，再各自扣除50%（剩余值向下取整）；以增长后的当前值为基数，不按新上限、不先回满。惩罚只在成功晋升时执行一次，回合结束和读档不再减半，之后的伤害、消耗和恢复正常结算；不能用character.update、item.use或inventory.remove代替或重复结算晋升。魔药名称采用本地登记的序列职业名加“魔药”，如诡法师魔药、秘法师魔药、操纵师魔药。特性吸收惩罚属于本游戏规则改编，不作为原著设定宣称；晋升与能力效果必须等待本地确认结果。";

// Identity belongs to an inventory instance, not to the character's advancement.
export function normalizeCharacteristic(item = {}) {
  const name = String(item.name || "").replace(/\s|[「」“”"']/g, "").replace(/^(?:一份|一枚)/, "");
  if (/配方|原料|材料|残渣|碎片|粉末/.test(name)) return null;
  // 魔药教授 is a profession: its complete characteristic is not a potion.
  const namedIdentity = name.includes("魔药") ? characteristicIdentityForName(name) : null;
  if (name.includes("魔药") && !namedIdentity) return null;
  const raw = item.characteristic;
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { identified: false };
    const pathway = getPathway(String(raw.pathwayId || pathwayIdForName(raw.pathwayName) || "").trim());
    const sequence = raw.sequence === null || raw.sequence === "" ? NaN : Number(raw.sequence);
    if (!pathway || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return { identified: false };
    return { pathwayId: pathway.id, pathwayName: pathway.name, sequence, identified: raw.identified === true };
  }
  // Older saves used exact profession names without structured characteristics.
  return namedIdentity || characteristicIdentityForName(name) || (name.includes("非凡特性") ? { identified: false } : null);
}

function characteristicIdentityForName(name) {
  for (const pathway of PATHWAYS) {
    for (let sequence = 0; sequence <= 9; sequence += 1) {
      const rank = pathway.sequences[9 - sequence];
      if ([`${rank}非凡特性`, `${rank}（序列${sequence}）非凡特性`, `${pathway.name}途径序列${sequence}非凡特性`].includes(name)) {
        return { pathwayId: pathway.id, pathwayName: pathway.name, sequence, identified: true };
      }
    }
  }
  return null;
}
