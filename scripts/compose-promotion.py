"""Compose screenshot-led promotional posters; editable copy lives in JSON sidecars."""
from pathlib import Path
import importlib.util
import json
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/promo-2026-09'
RENDERER = Path(os.environ.get('TEXT_OVERLAY_RENDERER', Path.home() / '.codex/skills/image-text-overlay/scripts/render_text.py'))
spec = importlib.util.spec_from_file_location('text_overlay', RENDERER)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

POSTERS = [
    ('01-story', '自由叙事', '写下行动', '让故事回应', '自由输入行动、提问与对话。\n连接 AI，让下一幕围绕你的选择展开。', ['自由输入', '动态叙事', '纸色 · 夜读']),
    ('02-character', '角色与途径', '你的出身', '你的非凡之路', '自定义职业、背景与秘密，选择普通人开局，\n或从 22 条途径中的序列 9 开始。', ['私人档案', '22 条途径', '能力与晋升']),
    ('03-map', '城市探索', '走进迷雾', '发现另一座城', '在六边形城区图上探索、移动与调查。\n逐步发现地点，让新的故事连接成路线。', ['六边形地图', '迷雾探索', '剧情地点']),
    ('04-journal', '调查手记', '零散的线索', '未完的真相', '将任务、线索与人物关系收进调查手记。\n回看已经获得的信息，决定下一步追查什么。', ['案件任务', '线索记录', '人物关系']),
    ('05-inventory', '行囊管理', '带上你的行囊', '准备下一次远行', '查看资金与负重，按名称和分类寻找物品。\n检查、使用与装备，让每件随身物品各尽其用。', ['资金与负重', '搜索与分类', '物品交互']),
    ('06-saves', '独立存档', '每一种人生', '都有自己的书签', '自动保存进度，也能为关键时刻手动留档。\n导入与导出，把未完的故事带在身边。', ['自动保存', '多份档案', '导入与导出']),
    ('07-special-actions', '特殊行动', '以非凡本领', '在雾都谋生', '接取途径专属委托，在选择中完成工作。\n部分途径可制作物品，也能申请加入值夜者。', ['途径委托', '配方与制作', '身份与组织']),
]


def box(text, x, y, width, height, size, fill='#EFE7D1', font='Microsoft YaHei', **kw):
    return dict(text=text, x=x, y=y, width=width, height=height, font_size=size, font=font, fill=fill, **kw)


def compose(index, item):
    slug, category, line1, line2, description, tags = item
    art = ImageOps.fit(Image.open(ROOT / 'assets/promo-16x9.png').convert('RGB'), (1080, 1920), centering=(0.76, 0.5)).filter(ImageFilter.GaussianBlur(3))
    base = art.convert('RGBA')
    shade = Image.new('RGBA', base.size)
    pixels = ImageDraw.Draw(shade)
    for y in range(1920):
        pixels.line((0, y, 1080, y), fill=(6, 19, 17, int(231 - 33 * y / 1920)))
    base = Image.alpha_composite(base, shade)
    draw = ImageDraw.Draw(base)
    gold = '#B99A5C'
    dim = '#4A4935'
    draw.rectangle((34, 34, 1046, 1886), outline=dim, width=2)
    for x, y, sx, sy in [(34,34,1,1),(1046,34,-1,1),(34,1886,1,-1),(1046,1886,-1,-1)]:
        draw.line((x,y,x+sx*62,y),fill=gold,width=3)
        draw.line((x,y,x,y+sy*62),fill=gold,width=3)
    # Thin astronomical engraving echoes the original artwork.
    for r in (126, 150, 166):
        draw.ellipse((875-r,238-r,875+r,238+r),outline='#414335',width=1)
    for angle in range(0, 360, 15):
        a = math.radians(angle)
        draw.line((875+153*math.cos(a),238+153*math.sin(a),875+164*math.cos(a),238+164*math.sin(a)),fill='#5D5840',width=2)
    ink = '#968458'
    if index == 1:
        draw.line([(820,281),(915,186),(926,197),(831,292),(820,281)],fill=ink,width=3)
        draw.line((811,303,938,303),fill=ink,width=2)
        draw.line((820,281,815,297,831,292),fill=ink,width=2)
    elif index == 2:
        draw.polygon([(875,174),(934,238),(875,302),(816,238)],outline=ink,width=2)
        draw.ellipse((835,219,915,257),outline=ink,width=2)
        draw.ellipse((862,225,888,251),outline=ink,width=2)
    elif index == 3:
        for cx,cy in [(850,211),(902,211),(876,256)]:
            points=[(cx+30*math.cos(math.radians(60*k+30)),cy+30*math.sin(math.radians(60*k+30))) for k in range(6)]
            draw.polygon(points,outline=ink,width=2)
    elif index == 4:
        draw.ellipse((817,177,900,260),outline=ink,width=3)
        draw.ellipse((826,186,891,251),outline=ink,width=1)
        draw.line((889,249,936,296),fill=ink,width=6)
    elif index == 5:
        draw.rounded_rectangle((818,206,934,289),radius=8,outline=ink,width=3)
        draw.rounded_rectangle((852,187,899,212),radius=5,outline=ink,width=3)
        draw.line((839,208,839,287),fill=ink,width=2)
        draw.line((913,208,913,287),fill=ink,width=2)
        draw.line((820,241,932,241),fill=ink,width=2)
    elif index == 6:
        draw.rectangle((823,186,927,294),outline=ink,width=3)
        draw.line((824,240,926,240),fill=ink,width=2)
        draw.rectangle((860,208,890,219),outline=ink,width=2)
        draw.rectangle((860,262,890,273),outline=ink,width=2)
    else:
        draw.polygon([(875,173),(888,223),(940,238),(888,253),(875,303),(862,253),(810,238),(862,223)],outline=ink,width=3)
        draw.ellipse((859,222,891,254),outline=ink,width=2)
    draw.line((84,135,996,135),fill=dim,width=2)
    draw.polygon([(84,98),(94,88),(104,98),(94,108)],fill=gold)
    draw.line((84,489,996,489),fill=dim,width=2)
    draw.line((84,489,220,489),fill=gold,width=3)

    shot = Image.open(OUT / 'screenshots' / f'{slug}.png').convert('RGB')
    fitted = ImageOps.contain(shot, (880, 1160), Image.Resampling.LANCZOS)
    x = (1080-fitted.width)//2
    y = 552 + (1160-fitted.height)//2
    shadow = Image.new('RGBA',base.size)
    ImageDraw.Draw(shadow).rounded_rectangle((x-16,y-12,x+fitted.width+16,y+fitted.height+20),radius=18,fill=(0,0,0,170))
    base = Image.alpha_composite(base,shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle((x-9,y-9,x+fitted.width+9,y+fitted.height+9),radius=12,fill='#0C1713',outline=gold,width=2)
    base.paste(fitted,(x,y))
    draw = ImageDraw.Draw(base)
    for t in range(3):
        left=84+t*310
        draw.rounded_rectangle((left,1745,left+292,1799),radius=3,fill='#15251E',outline='#625B40',width=1)
    draw.line((84,1823,996,1823),fill=dim,width=1)
    boxes = [
        box('贝克兰德纪事',120,76,440,47,30,font='SimSun'),
        box(f'游戏特点  /  {index:02d}',720,80,276,38,23,fill='#C3AE7E',align='right'),
        box(category+'  /  BACKLUND CHRONICLE',84,157,850,42,22,fill='#BFA772'),
        box(line1,80,207,924,105,78,font='SimSun'),
        box(line2,80,304,924,105,78,fill='#DFC182',font='SimSun'),
        box(description,84,409,925,80,27,fill='#C6C6B3',line_spacing=4),
        box('界 面 实 录',84,507,450,34,20,fill='#AFA98F'),
        box(f'FEATURE  {index:02d} / {len(POSTERS):02d}',700,507,296,34,20,fill='#AFA98F',align='right'),
        *[box(tag,84+t*310,1752,292,40,24,fill='#D6C495',align='center') for t,tag in enumerate(tags)],
        box('AI 文字沙盒 · 单人叙事',84,1841,590,35,23,fill='#C5B17E'),
        box('实机截图 · 演示档案',625,1843,371,34,20,fill='#ABA994',align='right'),
    ]
    (OUT / 'editable').mkdir(parents=True,exist_ok=True)
    base.save(OUT / 'editable' / f'{slug}-base.png')
    (OUT / 'editable' / f'{slug}-text.json').write_text(json.dumps({'boxes':boxes},ensure_ascii=False,indent=2),encoding='utf-8')
    for n,b in enumerate(boxes,1):
        renderer.render_box(base,b,n)
    base.convert('RGB').save(OUT / f'{slug}.png')
    base.convert('RGB').save(OUT / f'{slug}.jpg',quality=94,subsampling=0)
    return base.convert('RGB')


if __name__ == '__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    posters = [compose(i,item) for i,item in enumerate(POSTERS,1)]
    columns = 4
    sheet = Image.new('RGB',(2220,1980),'#101A16')
    for i,p in enumerate(posters):
        thumb = p.resize((540,960),Image.Resampling.LANCZOS)
        offset = 276 if i >= 4 and len(posters) == 7 else 0
        sheet.paste(thumb,(12+(i%columns)*552+offset,12+(i//columns)*984))
    sheet.save(OUT / 'contact-sheet.jpg',quality=94)
    print(f'Created {len(posters)} posters in {OUT}')
