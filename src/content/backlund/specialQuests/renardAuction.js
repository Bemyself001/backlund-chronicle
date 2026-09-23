// The auction has one authored treatment lot. Its display name can change without
// changing the identity used by saves and the Renard quest.
export const RENARD_AUCTION_MEDICINE = {
  itemId: "renard-healing-draught",
  name: "重伤治疗药剂",
  description: "适合本次骨折和内伤，不是晋升魔药。",
  category: "药剂",
  tags: ["消耗品"],
  pricePence: 960,
};

export const RENARD_TREATMENT_SCENES = {
  solo: "雷纳德子爵宅邸里，重伤治疗药剂交到医护人员手中。片刻后，小姐的呼吸与脉搏渐渐平稳，医生确认她已脱离危险。子爵当场将二十镑酬金交给你，感谢你带回救命的药剂。",
  shared: "雷纳德子爵宅邸里，埃德蒙完成了救治，小姐的呼吸与脉搏渐渐平稳。医生确认她已脱离危险。子爵当场支付二十镑酬金；依照你们事先约定的分工，你得到十镑，埃德蒙得到另外十镑。",
};
