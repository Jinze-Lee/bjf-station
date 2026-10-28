# -*- coding: utf-8 -*-
"""从当前公开实测批次和已核实的订正规则生成三维设备报警快照。

python 工具/生成设备报警.py

只写 3d/alarms.json，不修改监测值、不读取未公开全量、不根据电脑日期判离线。
报警按 20 个监测位置聚合；液流、径向各自评估。采样间隔 30 分钟，
连续缺少至少两次记录才记缺测事件。批次内部恢复的缺测只进入历史。
"""
import json
import math
import re
import runpy
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
STEP = 30 * 60 * 1000
MIN_MISSING = 2


def js_value(path, name):
    text = path.read_text(encoding="utf-8")
    match = re.search(r"^var " + re.escape(name) + r"\s*=\s*([\[{].*?^[\]}]);",
                      text, re.S | re.M)
    if not match:
        raise ValueError(f"{path.name}: 缺少 {name}")
    body = re.sub(r"'([^'\\]*)'\s*:", lambda m: json.dumps(m[1]) + ":", match[1])
    body = re.sub(r",(\s*[}\]])", r"\1", body)
    return json.loads(body)


def assess(points, start, end, fault_start=None):
    """返回可追溯事件；lastValid 仅来自此公开批次，不推测窗口外记录。"""
    valid = []
    invalid = 0
    for ts, value in points:
        if isinstance(value, (int, float)) and math.isfinite(value):
            valid.append([ts, value])
        else:
            invalid += 1
    if any(b[0] <= a[0] for a, b in zip(valid, valid[1:])):
        raise ValueError("观测时间必须严格递增")
    if any(ts < start or ts > end for ts, _ in valid):
        raise ValueError("观测时间超出公开批次")
    raw_fault = [p for p in valid if fault_start is not None and p[0] >= fault_start]
    # 故障段原始读数可供查看，但不能作为有效记录或设备恢复的依据。
    if fault_start is not None:
        valid = [p for p in valid if p[0] < fault_start]
    events = []
    for a, b in zip(valid, valid[1:]):
        missing = max(0, round((b[0] - a[0]) / STEP) - 1)
        if missing >= MIN_MISSING:
            events.append(dict(kind="gap", state="recovered", severity="warning",
                               start=a[0] + STEP, end=b[0], missing=missing))
    if valid and valid[0][0] - start >= MIN_MISSING * STEP:
        events.append(dict(kind="gap", state="recovered", severity="warning",
                           start=start, end=valid[0][0],
                           missing=round((valid[0][0] - start) / STEP)))
    last = valid[-1][0] if valid else None
    if fault_start is not None and fault_start <= end:
        events.append(dict(kind="confirmedFault", state="active", severity="critical",
                           start=fault_start, end=None, source="STEM_RADIUS_DROP_FROM"))
    elif not valid:
        events.append(dict(kind="noData", state="active", severity="warning",
                           start=start, end=None))
    elif end - last >= MIN_MISSING * STEP:
        events.append(dict(kind="gap", state="active", severity="warning",
                           start=last + STEP, end=None, missing=(end - last) // STEP))
    if invalid:
        events.append(dict(kind="invalid", state="review", severity="warning",
                           start=start, end=end, count=invalid))
    active = [e for e in events if e["state"] in ("active", "review")]
    status = "critical" if any(e["severity"] == "critical" for e in active) else (
        "warning" if active else "ok")
    return dict(status=status, samples=len(valid), lastValid=last,
                suspectSamples=len(raw_fault), lastSuspect=raw_fault[-1][0] if raw_fault else None,
                events=events)


def build_snapshot():
    meta = js_value(BASE / "js/obs-meta.js", "OBS_META")
    if meta["source"] != "measured":
        raise ValueError("报警只接受 source=measured 的真实批次")
    fd = js_value(BASE / "js/observations.js", "OBS_FD")
    rad = js_value(BASE / "js/observations.js", "OBS_RAD")
    ids = re.findall(r"\{\s*id:\s*'([^']+)'", (BASE / "js/trees.js").read_text(encoding="utf-8"))
    if len(ids) != 20 or len(set(ids)) != 20 or set(fd) | set(rad) != set(ids):
        raise ValueError("必须与 20 个监测点逐一对应")
    total = sum(len(p) for data in (fd, rad) for p in data.values())
    if total != meta["points"]:
        raise ValueError("观测点数与元信息不符")
    start, end = meta["span"]
    times = [t for data in (fd, rad) for p in data.values() for t, _ in p]
    if [min(times), max(times)] != [start, end]:
        raise ValueError("观测时间范围与元信息不符")
    rules = runpy.run_path(str(BASE / "工具/预处理raw数据.py"), run_name="alarm_rules")
    faults = {tid: int(dt.timestamp() * 1000) for tid, dt, _ in rules["STEM_RADIUS_DROP_FROM"]}
    # 各设备数据导出截止时间不同；以各观测类型自身的最新记录为批次末，
    # 不把径向文件未包含的后续半天错误判成全部设备离线。
    fd_end = max(t for p in fd.values() for t, _ in p)
    rad_end = max(t for p in rad.values() for t, _ in p)
    points = []
    for tid in ids:
        channels = {
            "sapflow": assess(fd.get(tid, []), start, fd_end),
            "radial": assess(rad.get(tid, []), start, rad_end, faults.get(tid)),
        }
        channels["sapflow"]["asOf"] = fd_end
        channels["radial"]["asOf"] = rad_end
        # 已订正阶跃保留为历史证据，不计作当前故障。来源已在预处理配置中核实。
        for tree, dt, offset, _ in rules["STEM_RADIUS_JUMP_FIXES"]:
            ts = int(dt.timestamp() * 1000)
            if tree == tid and ts <= end:
                channels["radial"]["events"].append(dict(
                    kind="correctedStep", state="corrected", severity="info",
                    start=ts, end=ts, offsetUm=offset, source="STEM_RADIUS_JUMP_FIXES"))
        statuses = [c["status"] for c in channels.values()]
        status = "critical" if "critical" in statuses else ("warning" if "warning" in statuses else "ok")
        points.append(dict(id=tid, status=status, channels=channels))
    return dict(
        schemaVersion=1, source="measured", sourceGeneratedAt=meta["generatedAt"],
        span=[start, end], asOf=end, timezoneOffsetMin=480,
        rules=dict(sampleMinutes=30, consecutiveMissing=MIN_MISSING,
                   reference="channelBatchEnd", correctedEventsAreActive=False),
        provenance=["js/obs-meta.js", "js/observations.js", "js/trees.js",
                    "工具/预处理raw数据.py:STEM_RADIUS_DROP_FROM",
                    "工具/预处理raw数据.py:STEM_RADIUS_JUMP_FIXES"],
        summary=dict(points=len(points), channels=2 * len(points),
                     activePoints=sum(p["status"] != "ok" for p in points),
                     historyPoints=sum(any(e["state"] in ("recovered", "corrected")
                                           for c in p["channels"].values()
                                           for e in c["events"]) for p in points)),
        points=points)


if __name__ == "__main__":
    snapshot = build_snapshot()
    target = BASE / "3d/alarms.json"
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(snapshot["summary"], ensure_ascii=False))
    for point in snapshot["points"]:
        if point["status"] != "ok":
            print(point["id"], point["status"])
