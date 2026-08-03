# -*- coding: utf-8 -*-
"""
把原始图片处理成适合上网的尺寸，输出到 ../images/

输入：桌面上的原始图片（路径见 SRC）
输出：images/ 下的压缩版本

照片原图 4032x3024 / 6.6 MB 直接上网太大，会拖慢加载；
这里统一压到长边 1200 px、quality 82，logo 与二维码保持清晰但缩到合理尺寸。
"""

from pathlib import Path
from PIL import Image

DESKTOP = Path(r"C:\Users\18256\Desktop")
OUT = Path(__file__).resolve().parent.parent / "images"
OUT.mkdir(exist_ok=True)

# (源文件, 目标文件, 长边上限, 质量)  —— PNG 的 quality 参数忽略
#
# 图集 install-1..4 的编排原则：**四张各讲一件事，不重复**
#   1 树上的整体安装（径向变化仪 + 液流探头同株）
#   2 隔热层下缘仰拍 —— 通风缝隙的细节，配合"下部有意不封死"那条方法学说明
#   3 机箱内部：可直接插卡的蒲公英路由器
#   4 机箱内部：无插卡功能的数采 + 加装 4G 工业路由器
#
# 2026-07-31 分两次调整到位：先把原来的 3、4 号（都是树干上的探头，与 1、2 号
# 重复）换成机箱照；随后发现 1、2 号仍是同类的传感器照，于是把 2 号也换掉，
# 改用仰拍通风缝隙那张（原 4 号图，留档在 _版本备份/v12.../install-4_旧.jpg）。
JOBS = [
    ("0eec8fbe20cac2782bc53d1a9fc8aaaf.jpg", "station.jpg",             1400, 84),
    ("71ae6b754cedf0b36245376bacf4f884.jpg", "sensor-installation.jpg",  900, 84),
    ("e798379a20ef4c332ef9216da6e10d00.jpg", "logo-bfers.png",           320, 95),
    ("bb5cbd4c-7c82-4935-b8bd-c13be221cde5.png", "logo-cas.png",         300, 95),
    ("2a6eca95-b53d-495a-9f25-e9e55b6a09bd.png", "logo-ibcas.png",       300, 95),
    ("aeed3d82-9504-4af9-8200-25ce0f14c9f7.png", "logo-cern.png",        300, 95),
    ("d57012c7ab25b4b636ad33947a8c471b.jpg", "wechat-qr.png",            420, 95),

    # 机箱内部（横构图，与前两张竖构图的传感器照并列）
    ("4906479cbd53bc49f82ecf3fcca114b1.jpg", "install-3.jpg",           1200, 84),
    ("0559b5ae23b341801f981a7a2bc4fcdd.jpg", "install-4.jpg",           1200, 84),
]

# 图集缩略图：主图之外还要一份小的，供右侧缩略栏与主图模糊背板使用
THUMBS = [("install-3.jpg", "install-3-thumb.jpg"),
          ("install-4.jpg", "install-4-thumb.jpg")]

for src_name, dst_name, maxside, q in JOBS:
    src = DESKTOP / src_name
    if not src.exists():
        print("  !! 缺失: %s" % src)
        continue

    im = Image.open(src)
    w0, h0 = im.size

    # 等比缩放到长边不超过 maxside
    scale = min(1.0, maxside / max(w0, h0))
    if scale < 1.0:
        im = im.resize((round(w0 * scale), round(h0 * scale)), Image.LANCZOS)

    dst = OUT / dst_name
    if dst_name.lower().endswith(".png"):
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        im.save(dst, "PNG", optimize=True)
    else:
        im.convert("RGB").save(dst, "JPEG", quality=q, optimize=True, progressive=True)

    print("  %-26s %5dx%-5d %6.0f KB  ->  %-24s %4dx%-5d %6.0f KB"
          % (src_name[:24], w0, h0, src.stat().st_size / 1024,
             dst_name, im.size[0], im.size[1], dst.stat().st_size / 1024))

for src_name, dst_name in THUMBS:
    src = OUT / src_name
    if not src.exists():
        print("  !! 缺失（先生成主图）: %s" % src)
        continue
    im = Image.open(src)
    w0, h0 = im.size
    scale = min(1.0, 460 / max(w0, h0))
    if scale < 1.0:
        im = im.resize((round(w0 * scale), round(h0 * scale)), Image.LANCZOS)
    dst = OUT / dst_name
    im.convert("RGB").save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    print("  %-26s %5dx%-5d          ->  %-24s %4dx%-5d %6.0f KB"
          % (src_name[:24], w0, h0, dst_name, im.size[0], im.size[1],
             dst.stat().st_size / 1024))

print("\n输出目录: %s" % OUT)
