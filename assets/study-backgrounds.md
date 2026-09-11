# 调查员书房背景

使用内置图片生成工具制作，网页标题和按钮由 React/CSS 实时绘制，不包含在背景图中。

- `study-landscape.webp` / `.jpg`：1600 × 900，桌面和平板使用。
- `study-portrait.webp` / `.jpg`：720 × 1280，独立竖构图，600px 及以下使用。
- `study-placeholder.webp`：24 × 14，清晰图片载入前的轻量占位。

原始生成图保留于本地图片生成目录；项目运行只依赖本目录中的优化资源。优化使用 Sharp 等比例裁切和压缩，WebP quality 78、JPEG quality 80。

## 横版最终提示词

Use case: stylized-concept. Asset type: landscape 16:9 background art for a Chinese Victorian detective narrative game main menu, no UI or typography. Create a beautifully composed cinematic painterly investigator's private study in rainy foggy fictional Victorian city Backlund, deep charcoal green shadows and restrained antique brass amber lamp light. Large rain-streaked window occupies right half, distant fog-shrouded gothic clock tower and rooftops. Dark walnut desk across lower right holds elegant lit brass desk lamp, a few case folders, old map, sealed letter, fountain pen, modest worn leather chair. Keep left 45 percent very dark quiet wood wall and subtle book silhouettes, intentionally low detail for legible menu overlay. Lamp positioned right near lower third, warm pools of light on tactile paper, cool blue grey night beyond. Sophisticated oil painting / realistic game environment concept art, rich material depth, intimate mysterious lived-in atmosphere, not horror. No people, no readable writing, no logos, no buttons, no borders, no watermarks. Wide landscape composition, 1920x1080 if possible.

## 竖版最终提示词

横版图作为场景与风格参考。

Use case: stylized-concept. Recompose the reference study into a distinct PORTRAIT 9:16 mobile game background, 1080x1920 if possible. Reference is style and scene reference, preserve same rainy Victorian investigator study: cool foggy gothic clock tower through rain-streaked window in UPPER RIGHT, dark walnut wood, brass lamp and case folders, map and sealed letter. Vertical composition: upper half shows window/city and lamp on right, darker quiet negative space upper left and middle for title overlay, lower 40 percent dark desk front and shadows for menu overlay. Rich cinematic painterly material detail, warm amber vs deep charcoal green, intimate beautiful and mysterious. No people, no text, no UI, no lettering, no watermark.
