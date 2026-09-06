from pathlib import Path
from PIL import Image, ImageFilter

root = Path(r"C:\Users\ASUS\Documents\ChatGPT\ai沙盒游戏")
src = Image.open(root / "assets" / "icon-source.png").convert("RGB")

# 1) 用同质皮革纹理盖住左下角「AI生成」水印（约 x 0–250, y 1860–2000）
patch = src.crop((700, 1500, 1000, 1700)).transpose(Image.FLIP_LEFT_RIGHT)
patch = patch.filter(ImageFilter.GaussianBlur(1))
src.paste(patch, (0, 1800))
src.save(root / "assets" / "icon-clean.png")

# 2) 生成 Android 各密度图标
base = src  # 2048x2048，方图标直接用全图
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
res = root / "android" / "app" / "src" / "main" / "res"

def circular(img):
    mask = Image.new("L", img.size, 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, img.size[0], img.size[1]), fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out

for density, px in sizes.items():
    icon = base.resize((px, px), Image.LANCZOS)
    icon.save(res / f"mipmap-{density}" / "ic_launcher.png")
    circular(icon).save(res / f"mipmap-{density}" / "ic_launcher_round.png")

# 3) 自适应图标前景：内容缩到 66% 安全区，透明背景
fg_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for density, px in fg_sizes.items():
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    inner = base.resize((int(px * 0.66),) * 2, Image.LANCZOS).convert("RGBA")
    offset = (px - inner.size[0]) // 2
    canvas.paste(inner, (offset, offset), inner)
    canvas.save(res / f"mipmap-{density}" / "ic_launcher_foreground.png")

print("done:", sorted(p.name for p in (root / "assets").glob("icon-*")))
