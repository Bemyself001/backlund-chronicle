import { TAROT_CLUB_NAME_CARDS } from "../content/backlund/easterEggs.js";

function normalizedName(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/[\s·・•‧∙⋅.]/g, "").toLowerCase() : "";
}

const cardsByName = new Map(TAROT_CLUB_NAME_CARDS.flatMap(card =>
  [card.name, ...card.aliases].map(name => [normalizedName(name), card])
));

export function tarotNameEasterEgg(name) {
  const card = cardsByName.get(normalizedName(name));
  return card ? {
    code: card.code,
    title: "灰雾的回绝",
    message: `灰雾之上的力量拒绝了你，一张塔罗牌浮现在眼前：‘${card.code}’。`,
    closeLabel: "更换姓名",
  } : null;
}
