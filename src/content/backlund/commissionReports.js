// Original, limited investigation leads. These reports never resolve fixed story stages.
export function commissionReportLeads(objective, knownLocations, sourceClues = []) {
  if (/舅舅|雷金纳德/.test(objective)) return [
    { title: "旧钟表工坊的查访索引", locationId: "hillston-market",
      detail: "夏洛克查到一份钟表行业名录的旧雇员索引，并在报告中标出了核对舅舅工作经历的入口：希尔斯顿区商会街的钟表行。带上已知姓名和怀表，向店员询问旧雇员登记与工坊转介记录，可以继续核对他失踪前的工作往来。这条线索尚未证明他的现状。" },
    { title: "失踪日期的报刊交叉检索", locationId: "queen-library",
      detail: "夏洛克整理了核对失踪时间的报刊检索记录：乔伍德区公共图书馆保存的旧报刊目录，可以按家人最后一次收到消息的日期，交叉查找钟表工坊的招工广告与地址变更。先向馆员调取对应日期的目录，再与工坊登记对照，可缩小下一次查访的时间范围；现有记录还不足以确认他的下落。" },
  ];
  const referenced = knownLocations.find(location => objective.includes(location.name.split("·").at(-1)));
  const location = referenced || knownLocations.find(entry => entry.id === "queen-library") || { id: "queen-library", name: "乔伍德区公共图书馆" };
  const source = sourceClues[0];
  return [{ title: `${objective.slice(0, 22)}：查访记录索引`, locationId: location?.id,
    detail: `夏洛克把「${objective}」涉及的姓名、日期与地址整理成了一份查访索引${source ? `，其中标注了与「${source.title}」需要交叉核对的记录` : "，并列出了下一步核对身份与行踪的入口"}。${location ? `报告建议带上这份索引，前往${location.name}核对公开名录或向当地接待人员查问对应记录` : "下一步可带着索引，当面核对目标的最后联系时间与已知地址"}。这是可以继续调查的具体方向，尚未确认目标的去向或身份。` }];
}
