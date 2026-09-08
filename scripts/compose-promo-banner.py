# -*- coding: utf-8 -*-
"""去除宣传图左下角 AI 生成水印（羽化贴补），并叠加游戏名生成仅含标题的横幅。"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = "assets/promo-16x9.png"
DST = "assets/promo-banner.png"
SONG = "C:/Windows/Fonts/STSONG.TTF"

img = Image.open(SRC).convert("RGB")
W, H = img.size

# --- 1. 去水印：水印约位于 x 0–140 / y 1055–1125，用右侧相近雾面纹理羽化贴补 ---
box = (0, 1025, 300, H)          # 修补区（略大于水印）
donor = (330, 1025, 630, H)      # 供体区（右侧同高度、相近亮度纹理）
patch = img.crop(donor)
mask = Image.new("L", (box[2] - box[0], box[3] - box[1]), 0)
md = ImageDraw.Draw(mask)
md.rectangle([0, 0, 210, 127], fill=255)     # 核心覆盖水印
mask = mask.filter(ImageFilter.GaussianBlur(22))
img.paste(patch, box[:2], mask)
img.save(SRC, quality=95)
print("watermark cleaned", img.size)

# --- 2. 横幅：仅保留游戏名 ---
layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
BRASS = (216, 184, 120, 255)

title = "贝克兰德纪事"
f_title = ImageFont.truetype(SONG, 170)
tracking = 18
width = sum(d.textlength(ch, font=f_title) for ch in title) + tracking * (len(title) - 1)
x = 130
y = 210
cx = x
for ch in title:
    d.text((cx + 4, y + 5), ch, font=f_title, fill=(0, 0, 0, 180))
    d.text((cx, y), ch, font=f_title, fill=BRASS)
    cx += d.textlength(ch, font=f_title) + tracking

out = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
out.save(DST, quality=95)
print("banner saved", DST, out.size, "title width", round(width))
