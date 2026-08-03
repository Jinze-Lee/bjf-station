# -*- coding: utf-8 -*-
"""
把 数据/ 目录里的实测 CSV 导入成前端数据文件 js/observations.js

用法：
    python 工具/导入观测数据.py                 # 导入 数据/ 下全部 CSV
    python 工具/导入观测数据.py --dir 别的目录
    python 工具/导入观测数据.py --dry-run       # 只校验与统计，不写文件

流程：
    1. 逐个文件走 校验观测数据.py 的检查，**有错误直接终止**，不写半成品
    2. 读同名 meta.json（若有），按其中声明的单位换算到规范单位
    3. 丢弃 quality = bad 的点
    4. 多批次合并，按 (tree_id, timestamp, variable) 去重
       —— 后导入的文件覆盖先导入的，便于事后补发修正版
    5. 按时间排序，写出 js/observations.js（source = 'measured'）

⚠️ 本脚本会**覆盖** js/observations.js。若想切回合成示例数据，
   重跑 工具/生成示例数据.py 即可。

文件名以「示例_」开头的会被跳过（那是格式样例，不是观测数据）。
"""

import argparse
import io
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _数据文件格式 import write_observations, UNITS          # noqa: E402
import 校验观测数据 as V                                      # noqa: E402

# 全量明文写到 原始数据/全量/ ——**不是** js/。
#
# js/observations.js 现在是「最近 7 天」的公开版，由 工具/发布数据.py 从这里切出来；
# 完整数据集以密文形式发布在 data/full.enc。如果本脚本还往 js/ 写，
# 下一次导入就会把公开版覆盖成全量明文，然后随下一次 git push 泄出去。
#
# 导入完记得跑：python 工具\发布数据.py --pass "你的口令"
OUT = BASE / "原始数据" / "全量" / "observations.js"

# 声明单位 -> 规范单位的换算系数
UNIT_FACTOR = {
    "sap_flux_density": {
        "g m-2 s-1":      1.0,
        "kg m-2 s-1":     1000.0,
        "cm3 cm-2 s-1":   10000.0,        # 1 cm/s 水 = 1 g cm^-2 s^-1 = 10000 g m^-2 s^-1
        "dm3 dm-2 h-1":   10000.0 / 3600, # 1 dm/h = 10 cm/3600 s
    },
    "stem_radius": {
        "um": 1.0,
        "mm": 1000.0,
        "cm": 10000.0,
    },
}


def load_meta(csv_path):
    """找同批次的 meta.json：优先 <同名前缀>_meta.json，其次目录下的 meta.json"""
    stem = csv_path.stem
    for cand in (csv_path.with_name(stem.replace("观测数据", "meta") + ".json"),
                 csv_path.with_suffix(".json"),
                 csv_path.parent / "meta.json"):
        if cand.exists():
            try:
                return json.loads(cand.read_text(encoding="utf-8")), cand.name
            except json.JSONDecodeError as e:
                raise SystemExit("!! %s 不是合法 JSON: %s" % (cand, e))
    return {}, None


def factor_for(var, declared):
    if not declared:
        return 1.0, UNITS[var]
    table = UNIT_FACTOR.get(var, {})
    key = declared.strip()
    if key not in table:
        raise SystemExit(
            "!! 变量 %s 声明了不支持的单位 %r\n   支持: %s"
            % (var, declared, ", ".join(table)))
    return table[key], key


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(BASE / "数据"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data_dir = Path(args.dir)
    files = sorted(p for p in data_dir.glob("*.csv") if not p.name.startswith("示例_"))
    if not files:
        print("在 %s 下没找到可导入的 CSV。" % data_dir)
        print("（文件名以「示例_」开头的会被跳过）")
        return 1

    valid_ids = V.load_tree_ids()
    print("待导入 %d 个文件，合法树号 %d 个\n" % (len(files), len(valid_ids)))

    # ---- 1. 先全部校验，有错就不往下走 ----------------------------------
    total_err = 0
    for p in files:
        errors, warnings, _, _ = V.check_file(p, valid_ids)
        status = "错误 %d" % len(errors) if errors else "通过"
        print("  校验 %-44s %s%s" % (p.name, status,
                                     "，警告 %d" % len(warnings) if warnings else ""))
        for e in errors[:10]:
            print("      [错误] " + e)
        if len(errors) > 10:
            print("      ... 另有 %d 条" % (len(errors) - 10))
        total_err += len(errors)

    if total_err:
        print("\n共 %d 个错误，**未写出任何文件**。" % total_err)
        print("请修正后重跑；逐条明细可用 工具/校验观测数据.py 单独查看。")
        return 1

    # ---- 2. 读取 + 换算 + 合并 ------------------------------------------
    # merged[(var, tid)][ms] = value   —— 用 dict 天然完成「后来者覆盖」
    merged = {}
    batches = []
    dropped_bad = 0

    for p in files:
        meta, meta_name = load_meta(p)
        declared = (meta.get("units") or {})
        factors = {}
        for var in UNITS:
            f, used = factor_for(var, declared.get(var))
            factors[var] = f
            if f != 1.0:
                print("  换算 %-18s %s -> %s  (×%g)" % (var, used, UNITS[var], f))

        n_rows = 0
        with io.open(p, encoding="utf-8-sig", newline="") as f:
            import csv as _csv
            for row in _csv.DictReader(f):
                row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
                if (row.get("quality") or "ok") == "bad":
                    dropped_bad += 1
                    continue
                var = row["variable"]
                ms = int(V.parse_ts(row["timestamp"]).timestamp() * 1000)
                val = float(row["value"]) * factors[var]
                merged.setdefault((var, row["tree_id"]), {})[ms] = val
                n_rows += 1

        batches.append({
            "file": p.name,
            "meta": meta_name,
            "rows": n_rows,
            "batch": meta.get("batch"),
            "notes": meta.get("notes"),
        })
        print("  读入 %-44s %6d 行%s" % (p.name, n_rows,
                                        "  (meta: %s)" % meta_name if meta_name else ""))

    if dropped_bad:
        print("\n  已剔除 quality=bad 的点: %d 个" % dropped_bad)

    # ---- 3. 整理成前端结构 ----------------------------------------------
    fd, rad = {}, {}
    for (var, tid), pts in merged.items():
        target = fd if var == "sap_flux_density" else rad
        target[tid] = sorted(pts.items())
    dia = rad

    if not fd and not dia:
        print("\n没有可用数据点。")
        return 1

    # ---- 4. 汇总 ---------------------------------------------------------
    CST = timezone(timedelta(hours=8))
    all_ms = [ms for pts in list(fd.values()) + list(dia.values()) for ms, _ in pts]
    lo = datetime.fromtimestamp(min(all_ms) / 1000, CST)
    hi = datetime.fromtimestamp(max(all_ms) / 1000, CST)

    print("\n" + "=" * 62)
    print("  树木数    : %d / %d" % (len(set(fd) | set(dia)), len(valid_ids)))
    print("  时间范围  : %s ~ %s (UTC+8)" % (lo.strftime("%Y-%m-%d %H:%M"),
                                             hi.strftime("%Y-%m-%d %H:%M")))
    print("  液流点数  : %d" % sum(len(p) for p in fd.values()))
    print("  径向点数  : %d" % sum(len(p) for p in rad.values()))
    missing = valid_ids - (set(fd) | set(rad))
    if missing:
        print("  [警告] 无数据的树: %s" % ", ".join(sorted(missing)))
    only_fd = set(fd) - set(rad)
    only_dia = set(rad) - set(fd)
    if only_fd:
        print("  [警告] 只有液流没有径向: %s" % ", ".join(sorted(only_fd)))
    if only_dia:
        print("  [警告] 只有径向没有液流: %s" % ", ".join(sorted(only_dia)))
    print("=" * 62)

    if args.dry_run:
        print("\n--dry-run：未写出文件。")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    meta = write_observations(OUT, fd, dia, source="measured",
                              extra={"batches": batches})
    print("\n写出: %s  (%.0f KB)" % (OUT, OUT.stat().st_size / 1024))
    print("这是**全量明文**，不进仓库（.gitignore 已排除 原始数据/全量/）。")
    print()
    print("=" * 62)
    print("  还差一步：网页上的数据还没更新。")
    print()
    print("      python 工具\\发布数据.py --pass \"你的口令\"")
    print()
    print("  它会把全量切成「公开 7 天」写进 js/，")
    print("  再把完整数据加密成 data/full.enc。")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
