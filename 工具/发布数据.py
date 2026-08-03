# -*- coding: utf-8 -*-
"""
把全量观测数据切成「公开 7 天」+「加密全量」两份，供网站发布。

为什么要这一步
--------------
站点是纯静态托管（GitHub Pages），没有服务端代码，凡是发布出去的文件
任何人都能按 URL 直接下载。所以「只让部分人看完整数据」只有一条路：
**公开的那份本来就只有 7 天，完整那份是密文。**

不是「推送了再用 JS 藏起来」—— 那种做法把密钥写在代码里，扒下来就解了。
这里的口令从不进入仓库，只在访客手动输入时存在于他自己的浏览器内存里。

流程
----
    原始数据/全量/observations.js   （全量明文，gitignore，不进仓库）
    原始数据/全量/environment.js
                  │
                  ├──►  js/observations.js    最近 7 天，公开
                  ├──►  js/environment.js     最近 7 天，公开
                  ├──►  js/obs-meta.js        元信息（公开窗口 + 全量规模）
                  └──►  data/full.enc         全量，gzip 后 AES-GCM 加密

加密细节
--------
    口令 ──PBKDF2-HMAC-SHA256（600,000 轮，16 字节随机盐）──► 256 位密钥
    JSON ──gzip──► AES-256-GCM（12 字节随机 IV）──► data/full.enc

**先压缩再加密**，顺序不能反：密文是不可压缩的，先加密的话传输量会从
178 KB 涨回 904 KB，把之前做的性能优化全吃回去。

轮数取 600,000 是因为攻击者手里握有密文，可以离线慢慢跑字典。轮数抬高
只是把他的单次尝试成本乘以一个常数；真正决定安全性的是**口令本身的熵**。
所以脚本默认生成一个高强度随机口令，而不是让人随手起一个。

文件格式（二进制）
------------------
    0   magic     b"BFERSENC"   8 字节
    8   version   u8            = 1
    9   iters     u32 小端       PBKDF2 轮数
    13  salt      16 字节
    29  iv        12 字节
    41  ciphertext + GCM tag

用法
----
    python 工具\\发布数据.py                 # 生成新口令并打印
    python 工具\\发布数据.py --pass "你的口令"  # 用指定口令
    python 工具\\发布数据.py --days 14        # 改公开窗口长度

⚠️ 口令不会被写进任何文件。丢了只能换一个新的重新发布。
"""
import argparse
import gzip
import json
import os
import re
import secrets
import string
import struct
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    sys.exit("缺少依赖：pip install cryptography")

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "原始数据" / "全量"
JS = BASE / "js"
ENC_OUT = BASE / "data" / "full.enc"

MAGIC = b"BFERSENC"
VERSION = 1
ITERS = 600_000
DAY_MS = 86_400_000


# ---------------------------------------------------------------- 读全量数据

def js_global(text, name):
    """从生成的 JS 文件里抠出 `var NAME = <字面量>;` 并解析成 Python 对象。

    这些文件是本项目自己的脚本生成的，格式固定（每个全局都从行首的
    `var NAME = ` 开始，到行首的 `};` 或 `];` 结束），所以不需要真正的
    JS 解析器，做三步文本转换就够：单引号串转双引号、裸键名补引号、去尾逗号。

    转换是有风险的（比如串里若含撇号就会错切），所以调用方**必须**用
    check_parsed() 拿元信息回验。宁可报错也不要把一份被悄悄改坏的数据
    发布出去 —— 那种错在页面上看着一切正常。

    找不到就抛错，不静默返回空。
    """
    m = re.search(r"^var %s = ([\[{].*?^[\]}]);" % name, text, re.S | re.M)
    if not m:
        raise ValueError("在文件里找不到 var %s" % name)
    body = m.group(1)
    body = re.sub(r"'((?:[^'\\]|\\.)*)'",
                  lambda mm: json.dumps(mm.group(1)), body)   # 'x' -> "x"
    body = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', body)  # {k: -> {"k":
    body = re.sub(r",(\s*[}\]])", r"\1", body)                # 去尾逗号
    return json.loads(body)


def check_parsed(label, series, meta_points=None, meta_span=None, meta_trees=None):
    """用生成时写进元信息的数字回验解析结果。

    js_global 是文本转换出来的，一旦哪天生成格式变了，解析可能**部分**成功 ——
    少几条序列、截断几个点，页面照样能画，错得悄无声息。这里把它变成硬错误。
    """
    n = sum(len(p) for p in series.values())
    if meta_points is not None and n != meta_points:
        raise ValueError("%s 点数对不上：解析出 %d，元信息说 %d" % (label, n, meta_points))
    if meta_trees is not None and len(series) != meta_trees:
        raise ValueError("%s 序列数对不上：解析出 %d，元信息说 %d"
                         % (label, len(series), meta_trees))
    if meta_span and n:
        lo = min(p[0] for pts in series.values() for p in pts)
        hi = max(p[0] for pts in series.values() for p in pts)
        if [lo, hi] != list(meta_span):
            raise ValueError("%s 时间跨度对不上：解析出 [%d, %d]，元信息说 %s"
                             % (label, lo, hi, meta_span))


def load_full():
    obs_p, env_p = SRC / "observations.js", SRC / "environment.js"
    if not obs_p.exists() or not env_p.exists():
        sys.exit(
            "找不到全量数据：\n"
            "  %s\n  %s\n"
            "先跑 工具/导入观测数据.py 与 工具/导入环境数据.py。" % (obs_p, env_p)
        )
    obs, env = obs_p.read_text(encoding="utf-8"), env_p.read_text(encoding="utf-8")
    full = {
        "obsMeta": js_global(obs, "OBS_META"),
        "fd":      js_global(obs, "OBS_FD"),
        "rad":     js_global(obs, "OBS_RAD"),
        "envMeta": js_global(env, "ENV_META"),
        "envVars": js_global(env, "ENV_VARS"),
        "env":     js_global(env, "ENV_DATA"),
    }

    # 回验：OBS_META.points 是液流与径向两套之和，trees 是两套的并集
    m = full["obsMeta"]
    n_obs = sum(len(p) for p in full["fd"].values()) + \
            sum(len(p) for p in full["rad"].values())
    if n_obs != m.get("points"):
        raise ValueError("观测数据点数对不上：解析出 %d，OBS_META 说 %s"
                         % (n_obs, m.get("points")))
    n_trees = len(set(full["fd"]) | set(full["rad"]))
    if n_trees != m.get("trees"):
        raise ValueError("树木数对不上：解析出 %d，OBS_META 说 %s"
                         % (n_trees, m.get("trees")))
    check_parsed("液流", full["fd"], meta_span=m.get("span"))
    check_parsed("环境", full["env"], meta_span=full["envMeta"].get("span"))
    if len(full["envVars"]) != len(full["env"]):
        raise ValueError("环境变量数对不上：ENV_VARS %d 个，ENV_DATA %d 条"
                         % (len(full["envVars"]), len(full["env"])))
    return full


# ------------------------------------------------------------------ 切公开窗口

def latest_ms(*series_dicts):
    hi = 0
    for d in series_dicts:
        for pts in d.values():
            if pts:
                hi = max(hi, pts[-1][0])
    return hi


def cut(series, since):
    """只保留 since 之后的点。整条序列都在窗口外的树/变量直接不出现 ——
    留一个空数组会让前端把它当成「有这棵树但没数据」，语义不同。"""
    out = {}
    for k, pts in series.items():
        kept = [p for p in pts if p[0] >= since]
        if kept:
            out[k] = kept
    return out


# -------------------------------------------------------------------- 写 JS

def fmt_series(name, data, banner):
    lines = [banner, "var %s = {" % name]
    for k, pts in data.items():
        body = ",".join("[%d,%s]" % (t, ("%.6g" % v) if v is not None else "null")
                        for t, v in pts)
        lines.append("  '%s': [%s]," % (k, body))
    lines.append("};")
    return "\n".join(lines) + "\n"


PUBLIC_BANNER = """/* ⚠️ 这是**公开窗口**的数据，不是全量。由 工具/发布数据.py 生成，请勿手工编辑。
 *
 * 只含最近 %d 天。完整数据集在 data/full.enc 里，AES-256-GCM 加密，
 * 需要访客手动输入口令才能解开（见 js/unlock.js）。
 *
 * 全量明文在 原始数据/全量/ 下，不进仓库（.gitignore 已排除）。
 */
"""


def write_public(full, days, pub_since):
    fd = cut(full["fd"], pub_since)
    rad = cut(full["rad"], pub_since)
    env = cut(full["env"], pub_since)

    banner = PUBLIC_BANNER % days

    n_pub = sum(len(p) for p in fd.values()) + sum(len(p) for p in rad.values())
    n_all = (sum(len(p) for p in full["fd"].values())
             + sum(len(p) for p in full["rad"].values()))

    span_all = full["obsMeta"]["span"]
    meta = dict(full["obsMeta"])
    meta["span"] = [pub_since, span_all[1]]
    meta["points"] = n_pub
    meta["trees"] = len(set(fd) | set(rad))
    # 前端用这几项显示「公开 7 天 / 完整 XX 天」的提示，以及解锁后的对比
    meta["public"] = {
        "days": days,
        "since": pub_since,
        "points": n_pub,
    }
    meta["full"] = {
        "span": span_all,
        "points": n_all,
        "trees": len(set(full["fd"]) | set(full["rad"])),
        "days": round((span_all[1] - span_all[0]) / DAY_MS, 2),
    }
    # batches 里含原始 CSV 文件名与行数，属于内部信息，公开版不带
    meta.pop("batches", None)

    (JS / "observations.js").write_text(
        banner + "\n"
        + fmt_series("OBS_FD", fd, "/* 液流通量密度 g m^-2 s^-1 */") + "\n"
        + fmt_series("OBS_RAD", rad, "/* 茎半径读数 μm（前端按首点归零） */"),
        encoding="utf-8")

    (JS / "obs-meta.js").write_text(
        "/* 观测数据元信息 —— 由 工具/发布数据.py 生成，请勿手工编辑。\n"
        " *\n"
        " * 单独成文件是为了让首屏不必下载整份观测数据。\n"
        " * meta.public / meta.full 分别是公开窗口与完整数据集的规模，\n"
        " * 解锁提示条用它们显示「现在给你看多少、完整的有多少」。\n"
        " */\n\n"
        "var OBS_META = %s;\n" % json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8")

    env_meta = dict(full["envMeta"])
    env_meta["span"] = [pub_since, span_all[1]]
    (JS / "environment.js").write_text(
        banner + "\n"
        + "var ENV_META = %s;\n\n" % json.dumps(env_meta, ensure_ascii=False, indent=2)
        + "var ENV_VARS = %s;\n\n" % json.dumps(full["envVars"], ensure_ascii=False, indent=2)
        + fmt_series("ENV_DATA", env, "/* 环境变量时间序列 */"),
        encoding="utf-8")

    return n_pub, n_all


# -------------------------------------------------------------------- 加密

def encrypt(full, passphrase):
    payload = json.dumps({
        "meta":    full["obsMeta"],
        "fd":      full["fd"],
        "rad":     full["rad"],
        "envMeta": full["envMeta"],
        "envVars": full["envVars"],
        "env":     full["env"],
    }, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    raw = len(payload)
    packed = gzip.compress(payload, 9)          # 先压缩，再加密

    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=salt, iterations=ITERS).derive(passphrase.encode("utf-8"))
    blob = AESGCM(key).encrypt(iv, packed, None)

    ENC_OUT.parent.mkdir(parents=True, exist_ok=True)
    ENC_OUT.write_bytes(
        MAGIC + struct.pack("<BI", VERSION, ITERS) + salt + iv + blob)
    return raw, len(packed), ENC_OUT.stat().st_size


def gen_pass(n=24):
    """默认口令：24 位、大小写字母加数字，约 143 bit 熵。
    去掉 0/O/l/1/I 这些抄写时容易看错的字符。"""
    alpha = "".join(c for c in string.ascii_letters + string.digits
                    if c not in "0Ol1I")
    return "".join(secrets.choice(alpha) for _ in range(n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass", dest="pw", help="加密口令；不给则生成一个随机的")
    ap.add_argument("--days", type=int, default=7, help="公开窗口天数（默认 7）")
    args = ap.parse_args()

    full = load_full()
    hi = latest_ms(full["fd"], full["rad"], full["env"])
    if not hi:
        sys.exit("全量数据里一个点都没有，请先检查导入步骤。")
    pub_since = hi - args.days * DAY_MS

    n_pub, n_all = write_public(full, args.days, pub_since)

    pw = args.pw or gen_pass()
    raw, packed, enc = encrypt(full, pw)

    print("公开窗口 %d 天" % args.days)
    print("  js/observations.js  %6.0f KB   %d 点（全量的 %.0f%%）"
          % ((JS / "observations.js").stat().st_size / 1024, n_pub, 100 * n_pub / n_all))
    print("  js/environment.js   %6.0f KB" % ((JS / "environment.js").stat().st_size / 1024))
    print("  js/obs-meta.js      %6.0f KB" % ((JS / "obs-meta.js").stat().st_size / 1024))
    print()
    print("加密全量")
    print("  明文 JSON      %7.0f KB" % (raw / 1024))
    print("  gzip 后        %7.0f KB" % (packed / 1024))
    print("  data/full.enc  %7.0f KB   （AES-256-GCM，PBKDF2 %s 轮）"
          % (enc / 1024, format(ITERS, ",")))
    print()
    if args.pw:
        print("口令：使用了命令行给定的口令，未打印。")
    else:
        print("=" * 62)
        print("  口令（只显示这一次，不会写进任何文件）：")
        print()
        print("      %s" % pw)
        print()
        print("  存好它。丢了只能换一个新口令重新跑本脚本。")
        print("=" * 62)


if __name__ == "__main__":
    main()
