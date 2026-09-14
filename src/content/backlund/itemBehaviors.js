export const ITEM_BEHAVIORS = [
  {
    itemId: "heirloom-watch",
    actions: {
      inspect: [
        {
          id: "watch.inspect-exterior",
          when: [{ type: "fact", key: "watch.exterior-inspected", not: true }],
          result: {
            text: "擦去表盖边缘的暗垢后，你发现内盖有一圈并非装饰的浅刻痕，部分笔画被长期摩挲得发亮。",
            appendDiscovery: true,
            effects: [{ type: "discover-fact", factId: "watch.exterior-inspected" }],
          },
        },
        {
          id: "watch.find-inscription",
          when: [{ type: "fact", key: "watch.inscription-found", not: true }],
          result: {
            text: "顺着浅刻痕逐字辨认，你认出一枚被反复描深的羽毛笔形记号与年份“1332”；上紧发条后，秒针每逢整点都会无故迟滞半拍。",
            appendDiscovery: true,
            effects: [{ type: "discover-fact", factId: "watch.inscription-found" }],
          },
        },
        {
          id: "watch.open-mechanism",
          when: [{ type: "fact", key: "watch.mechanism-opened", not: true }],
          result: {
            text: "你谨慎掀开机芯护盖，发现一枚螺钉的磨损方向与其余不同，下面压着一片可以活动的薄黄铜隔板。",
            appendDiscovery: true,
            effects: [{ type: "discover-fact", factId: "watch.mechanism-opened" }],
          },
        },
        {
          id: "watch.recover-note",
          when: [{ type: "fact", key: "watch.note-recovered", not: true }],
          result: {
            text: "移开隔板后，一卷极薄的纸条从机芯夹层里松脱出来；纸上是陌生的速记符号，末尾重复着内盖上的羽毛笔记号。指腹碰到那个记号时，一段尘封的记忆忽然清晰：这枚怀表最后属于你的舅舅雷金纳德{characterSurnameSuffix}。他在数年前毫无征兆地失踪，此后再没有回家；怀表却在不久后被人无声送回，家里始终没人知道送表的人是谁。",
            appendDiscovery: true,
            effects: [
              { type: "discover-fact", factId: "watch.note-recovered" },
              { type: "discover-fact", factId: "watch.owner-is-maternal-uncle" },
              { type: "discover-fact", factId: "watch.uncle-missing-remembered" },
            ],
          },
        },
        {
          id: "watch.inspect-complete",
          fallback: true,
          result: {
            text: "怀表的刻字、整点迟滞与机芯夹层都已经检查过。你已经想起它最后属于失踪的舅舅雷金纳德{characterSurnameSuffix}；那卷速记纸条仍需要可靠的人或资料来辨认。",
          },
        },
      ],
    },
  },
  {
    itemId: "azik-copper-whistle",
    actions: {
      use: [
        {
          id: "azik-whistle.call-messenger",
          denyWhen: [{ type: "action", terms: ["攻击", "杀死", "消灭", "作战", "战斗召唤", "命令信使战斗", "命令信使攻击"] }],
          denyMessage: "阿兹克铜哨的骸骨信使只负责送信，不能被当作战斗召唤物",
          result: {
            logTemplate: "吹响「{itemName}」后，巨大的白骨信使无声出现，等待接收写给阿兹克的信件；铜哨散发的死亡气息也可能吸引亡灵、令附近尸体出现异动。",
            effects: [{
              type: "signal",
              kind: "azik.whistle-blown",
              text: "阿兹克的骸骨信使回应了铜哨，但不会参与战斗。",
            }],
            data: {
              messenger: { recipient: "阿兹克·艾格斯", combatCapable: false, attractsUndead: true },
            },
          },
        },
      ],
    },
  },
];
