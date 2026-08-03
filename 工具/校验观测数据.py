# -*- coding: utf-8 -*-
"""
校验观测数据 CSV 是否符合 docs/数据接口规范.md

用法：
    python 工具/校验观测数据.py 数据/2026-07-13_2026-07-27_观测数据.csv
    python 工具/校验观测数据.py 数据/            # 校验目录下全部 CSV

退出码 0 = 通过（可能有警告），1 = 有错误，不要上传。

设计原则：**报行号、报具体值、不自动修**。
数据是观测记录，脚本不该替人改数；它只负责把问题指出来。
"""

import csv
import io
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

REQUIRED = ["tree_id", "timestamp", "variable", "value"]
OPTIONAL = ["quality"]

VARIABLES = {
    # 变量名: (中文名, 规范单位, 合理量程 low, high)
    "sap_flux_density": ("液流通量密度",   "g m-2 s-1", -5.0, 400.0),
    # stem_radius 存的是径向变化仪的**原始位移读数**（μm），零点由传感器安装
    # 位置决定，因此绝对值本身没有意义；网页按序列首点归零后显示为径向变化量。
    # 量程按常见点式径向变化仪 0–30 mm 行程放宽到 200 mm，容纳不同型号。
    "stem_radius":      ("茎半径读数",     "um",        -1e3, 2e5),
}

QUALITY = {"ok", "suspect", "bad"}

# ISO 8601 且必须带时区偏移（+08:00 / +0800 / Z）
TS_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?"
    r"(Z|[+-]\d{2}:?\d{2})$"
)


def load_tree_ids():
    """从 js/trees.js 读取合法树号，避免规范与代码两处维护。"""
    src = (BASE / "js" / "trees.js").read_text(encoding="utf-8")
    ids = re.findall(r"id:\s*'([^']+)'", src)
    if not ids:
        raise SystemExit("!! 无法从 js/trees.js 解析树号，请先运行 工具/生成树木数据.py")
    return set(ids)


def parse_ts(s):
    t = s.strip().replace(" ", "T")
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    # +0800 -> +08:00
    m = re.search(r"([+-]\d{2})(\d{2})$", t)
    if m:
        t = t[:m.start()] + m.group(1) + ":" + m.group(2)
    return datetime.fromisoformat(t)


def check_file(path, valid_ids):
    errors, warnings = [], []
    seen = set()
    per_tree = defaultdict(list)
    per_var = defaultdict(int)

    with io.open(path, encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        if "\t" in sample.split("\n")[0] and "," not in sample.split("\n")[0]:
            errors.append("表头看起来是制表符分隔，规范要求逗号分隔的 CSV")
        reader = csv.DictReader(f)

        cols = [c.strip().lower() for c in (reader.fieldnames or [])]
        missing = [c for c in REQUIRED if c not in cols]
        if missing:
            errors.append("表头缺少必填列: %s（当前表头: %s）" % (", ".join(missing), cols))
            return errors, warnings, per_tree, per_var

        unknown = [c for c in cols if c not in REQUIRED + OPTIONAL]
        if unknown:
            warnings.append("表头有未定义的列，会被忽略: %s" % ", ".join(unknown))

        for n, row in enumerate(reader, start=2):      # 2 = 表头之后第一行
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}

            tid = row.get("tree_id", "")
            ts_raw = row.get("timestamp", "")
            var = row.get("variable", "")
            val_raw = row.get("value", "")
            qual = row.get("quality", "") or "ok"

            # --- tree_id ---
            if tid not in valid_ids:
                hint = ""
                for good in valid_ids:
                    if good.lower() == tid.lower():
                        hint = "（大小写不符，应为 %s）" % good
                        break
                errors.append("第 %d 行: tree_id %r 不在清单内%s" % (n, tid, hint))

            # --- timestamp ---
            ts = None
            if not TS_RE.match(ts_raw):
                if re.match(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}", ts_raw):
                    errors.append("第 %d 行: timestamp %r **缺少时区偏移**，"
                                  "北京时间应写成 ...+08:00" % (n, ts_raw))
                else:
                    errors.append("第 %d 行: timestamp %r 不是合法 ISO 8601" % (n, ts_raw))
            else:
                try:
                    ts = parse_ts(ts_raw)
                except ValueError as e:
                    errors.append("第 %d 行: timestamp %r 解析失败 (%s)" % (n, ts_raw, e))

            # --- variable ---
            if var not in VARIABLES:
                errors.append("第 %d 行: variable %r 未定义，可用: %s"
                              % (n, var, ", ".join(VARIABLES)))

            # --- value ---
            try:
                val = float(val_raw)
            except ValueError:
                errors.append("第 %d 行: value %r 不是数字" % (n, val_raw))
                val = None
            else:
                if val != val:                                   # NaN
                    errors.append("第 %d 行: value 是 NaN，缺测请整行不写" % n)
                elif var in VARIABLES:
                    _, _, lo, hi = VARIABLES[var]
                    if not (lo <= val <= hi):
                        warnings.append("第 %d 行: %s = %g 超出常见量程 [%g, %g]，请确认"
                                        % (n, var, val, lo, hi))

            # --- quality ---
            if qual not in QUALITY:
                errors.append("第 %d 行: quality %r 非法，应为 %s"
                              % (n, qual, "/".join(sorted(QUALITY))))

            # --- 重复 ---
            key = (tid, ts_raw, var)
            if key in seen:
                errors.append("第 %d 行: 与前面重复 (tree_id=%s, timestamp=%s, variable=%s)"
                              % (n, tid, ts_raw, var))
            seen.add(key)

            if ts and var in VARIABLES:
                per_tree[tid].append(ts)
                per_var[var] += 1

    return errors, warnings, per_tree, per_var


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    target = Path(sys.argv[1])
    files = sorted(target.glob("*.csv")) if target.is_dir() else [target]
    if not files:
        print("没找到 CSV 文件: %s" % target)
        return 1

    valid_ids = load_tree_ids()
    print("合法树号 %d 个（读自 js/trees.js）\n" % len(valid_ids))

    total_err = 0
    for path in files:
        print("=" * 66)
        print("校验: %s" % path)
        print("=" * 66)
        errors, warnings, per_tree, per_var = check_file(path, valid_ids)

        for e in errors[:40]:
            print("  [错误] " + e)
        if len(errors) > 40:
            print("  ... 另有 %d 条错误未列出" % (len(errors) - 40))
        for w in warnings[:20]:
            print("  [警告] " + w)
        if len(warnings) > 20:
            print("  ... 另有 %d 条警告未列出" % (len(warnings) - 20))

        if per_var:
            print("\n  变量计数:")
            for v, c in sorted(per_var.items()):
                print("    %-20s %8d 行  (%s, %s)"
                      % (v, c, VARIABLES[v][0], VARIABLES[v][1]))

        if per_tree:
            print("\n  各树时间覆盖:")
            for tid in sorted(per_tree):
                ts = sorted(per_tree[tid])
                span_h = (ts[-1] - ts[0]).total_seconds() / 3600
                # 按 30 min 间隔估算应有点数（两个变量各一份）
                expect = int(span_h * 2) * len(per_var) if per_var else 0
                miss = ""
                if expect and len(ts) < expect * 0.9:
                    miss = "  缺测约 %.0f%%" % (100 * (1 - len(ts) / expect))
                print("    %-16s %s ~ %s  %6d 点%s"
                      % (tid, ts[0].strftime("%Y-%m-%d %H:%M"),
                         ts[-1].strftime("%Y-%m-%d %H:%M"), len(ts), miss))
            absent = valid_ids - set(per_tree)
            if absent:
                print("\n  [警告] 本批次没有以下树的数据: %s" % ", ".join(sorted(absent)))

        print()
        if errors:
            print("  结果: 不通过，%d 个错误 —— 请修正后再上传\n" % len(errors))
            total_err += len(errors)
        else:
            print("  结果: 通过%s\n" % ("（有 %d 条警告，请过目）" % len(warnings) if warnings else ""))

    return 1 if total_err else 0


if __name__ == "__main__":
    sys.exit(main())
