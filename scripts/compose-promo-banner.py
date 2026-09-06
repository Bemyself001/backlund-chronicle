# -*- coding: utf-8 -*-
"""在宣传图左上暗区叠加游戏标题，输出成品横幅。"""
from PIL import Image, ImageDraw, ImageFont

SRC = "assets/promo-16x9.png"
DST = "assets/promo-banner.png"
SONG = "C:/Windows/Fonts/STSONG.TTF"
SERIF = "C:/Windows/Fonts/georgia.ttf"

img = Image.open(SRC).convert("RGBA")
W, H = img.size  # 2048x1152
layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

BRASS = (216, 184, 120, 255)
BRASS_DIM = (176, 150, 102, 255)
INK_SOFT = (196, 185, 162, 235)

x0 = 150
y = 170

def spaced(text, gap):
    out = []
    for ch in text:
        out.append(ch)
        out.append(" " * 0)  # placeholder
    return out

def draw_spaced(draw, pos, text, font, fill, tracking=0, shadow=True):
    x, y0 = pos
    for ch in text:
        if shadow:
            draw.text((x + 3, y0 + 4), ch, font=font, fill=(0, 0, 0, 170))
        draw.text((x, y0), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x

# 系列名（小字、宽字距）
f_series = ImageFont.truetype(SONG, 44)
draw_spaced(d, (x0 + 6, y), "诡秘之主", f_series, INK_SOFT, tracking=26)
y += 96

# 主标题
f_title = ImageFont.truetype(SONG, 150)
draw_spaced(d, (x0, y), "贝克兰德纪事", f_title, BRASS, tracking=14)
y += 196

# 英文副标
f_en = ImageFont.truetype(SERIF, 34)
draw_spaced(d, (x0 + 6, y), "BACKLUND CHRONICLE", f_en, BRASS_DIM, tracking=10)
y += 78

# 黄铜分隔线
d.rectangle([x0 + 4, y, x0 + 560, y + 3], fill=(169, 137, 82, 220))
d.ellipse([x0 + 572, y - 4, x0 + 584, y + 8], outline=BRASS_DIM, width=2)
d.rectangle([x0 + 596, y, x0 + 700, y + 3], fill=(169, 137, 82, 140))
y += 40

# 标语
f_tag = ImageFont.truetype(SONG, 38)
draw_spaced(d, (x0 + 6, y), "煤烟与隐秘之间 · 单人 AI 文字冒险沙盒", f_tag, INK_SOFT, tracking=4)

img = Image.alpha_composite(img, layer).convert("RGB")
img.save(DST, quality=95)
print("saved", DST, img.size)
