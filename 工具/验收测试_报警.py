# -*- coding: utf-8 -*-
"""报警数据与三维交互验收。python 工具/验收测试_报警.py

本地预览服务需先运行。可通过 SITE_URL 指定三维页地址。
测试以 Range 请求路由补足旧版本地服务器不支持的点云分段读取，
只对浏览器测试生效，不改变网站和本地服务器。
"""
import importlib.util
import json
import os
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("alarm_generator", BASE / "工具/生成设备报警.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


class AlarmDataTests(unittest.TestCase):
    def test_saved_snapshot_matches_source(self):
        saved = json.loads((BASE / "3d/alarms.json").read_text(encoding="utf-8"))
        self.assertEqual(saved, gen.build_snapshot())

    def test_real_batch_and_scope(self):
        data = gen.build_snapshot()
        self.assertEqual(data["source"], "measured")
        self.assertEqual(data["asOf"], 1790064000000)
        self.assertEqual(data["summary"]["points"], 20)
        self.assertEqual(data["summary"]["channels"], 40)
        active = [p for p in data["points"] if p["status"] != "ok"]
        self.assertEqual([p["id"] for p in active], ["DT3-LYS1-1150"])
        self.assertEqual(active[0]["channels"]["sapflow"]["status"], "ok")
        self.assertEqual(active[0]["channels"]["radial"]["status"], "critical")

    def test_single_missing_sample_is_not_alarm(self):
        p = gen.assess([[0, 0], [2 * gen.STEP, 1]], 0, 2 * gen.STEP)
        self.assertEqual(p["status"], "ok")
        self.assertEqual(p["events"], [])

    def test_zero_is_valid_sapflow(self):
        p = gen.assess([[i * gen.STEP, 0] for i in range(10)], 0, 9 * gen.STEP)
        self.assertEqual(p["status"], "ok")
        self.assertEqual(p["samples"], 10)

    def test_gap_recovered_is_history(self):
        p = gen.assess([[0, 3], [3 * gen.STEP, 4]], 0, 3 * gen.STEP)
        self.assertEqual(p["status"], "ok")
        self.assertEqual(p["events"][0]["state"], "recovered")
        self.assertEqual(p["events"][0]["missing"], 2)

    def test_unresolved_tail_uses_batch_end(self):
        p = gen.assess([[0, 3]], 0, 2 * gen.STEP)
        self.assertEqual(p["status"], "warning")
        self.assertEqual(p["events"][0]["state"], "active")

    def test_no_data_without_evidence_is_review(self):
        p = gen.assess([], 0, 4 * gen.STEP)
        self.assertEqual(p["status"], "warning")
        self.assertEqual(p["events"][0]["kind"], "noData")

    def test_confirmed_fault_needs_matching_time(self):
        p = gen.assess([], 0, 4 * gen.STEP, 5 * gen.STEP)
        self.assertEqual(p["status"], "warning")
        p = gen.assess([], 0, 4 * gen.STEP, 2 * gen.STEP)
        self.assertEqual(p["status"], "critical")

    def test_valid_recovery_clears_old_fault(self):
        p = gen.assess([[i * gen.STEP, 2] for i in range(5)], 0, 4 * gen.STEP, gen.STEP)
        self.assertEqual(p["status"], "ok")

    def test_corrected_steps_are_history(self):
        data = gen.build_snapshot()
        p = next(p for p in data["points"] if p["id"] == "DT2-MD2-1249")
        corrected = [e for e in p["channels"]["radial"]["events"] if e["kind"] == "correctedStep"]
        self.assertEqual(len(corrected), 3)
        self.assertTrue(all(e["state"] == "corrected" for e in corrected))
        self.assertEqual(p["status"], "ok")

    def test_out_of_order_data_rejected(self):
        with self.assertRaises(ValueError):
            gen.assess([[gen.STEP, 2], [0, 1]], 0, gen.STEP)


def browser_tests():
    from playwright.sync_api import sync_playwright
    url = os.environ.get("SITE_URL", "http://127.0.0.1:8000/3d/index.html?v=20261021-alarm112")
    passed = []

    def check(label, ok):
        print(("PASS " if ok else "FAIL ") + label, flush=True)
        if not ok:
            raise AssertionError(label)
        passed.append(label)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        def binary(route):
            # 让测试使用正确的 HTTP Range 语义，避免原有静态服务造成解码噪声。
            name = route.request.url.split("/3d/pointclouds/", 1)[1].split("?", 1)[0]
            target = (BASE / "3d/pointclouds" / name).resolve()
            root = (BASE / "3d/pointclouds").resolve()
            if not target.is_relative_to(root) or not target.is_file():
                route.continue_()
                return
            raw = route.request.headers.get("range", "")
            if not raw.startswith("bytes="):
                route.fulfill(path=str(target))
                return
            first, last = raw[6:].split("-")
            size = target.stat().st_size
            start, end = int(first), min(int(last) if last else size - 1, size - 1)
            with target.open("rb") as source:
                source.seek(start)
                body = source.read(end - start + 1)
            route.fulfill(status=206, body=body, headers={
                "Content-Type": "application/octet-stream",
                "Content-Range": f"bytes {start}-{end}/{size}",
                "Access-Control-Allow-Origin": "*",
            })

        page.route("**/3d/pointclouds/**/*.bin", binary)
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_function("window.DeviceAlarms && document.getElementById('alarmCount').textContent==='1'")
        page.evaluate("LANG='zh';applyLang()")
        check("报警入口计数为 1，初始面板收起", page.locator("#alarmCount").inner_text() == "1" and not page.locator("#alarmPanel").is_visible())
        check("首屏不加载图表观测大文件", page.evaluate("!performance.getEntriesByType('resource').some(e=>/observations.js|highstock.js/.test(e.name))"))
        page.locator("#alarmBtn").click()
        check("打开列表并避让图层面板", page.locator("#alarmPanel").is_visible() and not page.locator("#layersPanel").is_visible())
        check("默认启用增强版并保留经典切换", page.locator("#alarmBoost").get_attribute("aria-pressed") == "true" and page.locator("#alarmClassic").is_visible())
        check("标注批次末时间与 20 点 40 路范围", "2026-09-22 16:00" in page.locator("#alarmBatch").inner_text() and page.locator(".alarm-summary b").all_text_contents() == ["1", "20", "40"])
        check("通道状态条准确显示 39 路未报警与 1 路故障",
              page.locator(".alarm-segments i").count() == 40 and
              page.locator(".alarm-segments .ok").count() == 39 and
              page.locator(".alarm-segments .critical").count() == 1)
        check("只有真实故障进入异常列表", page.locator(".alarm-point").count() == 1 and "DT3-LYS1-1150" in page.locator(".alarm-point").inner_text())
        page.locator(".alarm-point").click()
        page.wait_for_timeout(1600)
        check("详情区分正常液流与故障径向", page.locator(".alarm-channel.critical").count() == 1 and "175.926" in page.locator("#alarmContent").inner_text())
        check("缺失有效记录不捏造最后数据时间", "本批无有效记录" in page.locator("#alarmContent").inner_text())
        check("DOM 感叹号存在且保持可点击", page.locator("#labels .alarm-pin:visible").count() == 1)
        page.wait_for_function("document.getElementById('alarmField').style.display==='block'")
        check("定位光环使用有效投影且引导线连至面板",
              page.locator(".alarm-floor-outline").get_attribute("d").startswith("M") and
              "NaN" not in page.locator("#alarmField").inner_html() and
              bool(page.locator(".alarm-link").get_attribute("d")))
        page.locator("#alarmClassic").click()
        check("经典版关闭增强层并保留当前设备详情",
              page.locator("#alarmField").evaluate("e=>getComputedStyle(e).display") == "none" and
              "DT3-LYS1-1150" in page.locator(".alarm-detail-title").first.inner_text() and
              page.locator("#alarmCount").inner_text() == "1")
        page.locator("#alarmBoost").click()
        page.wait_for_function("document.getElementById('alarmField').style.display==='block'")
        check("可即时切回增强版", page.locator("#alarmBoost").get_attribute("aria-pressed") == "true")
        pin = page.locator(".alarm-pin:visible")
        check("呼吸光圈启用", pin.evaluate("e=>getComputedStyle(e,'::before').animationName") == "alarm-breathe")
        page.locator("#chkName").evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change'))}")
        page.locator("#chkDevAll").evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change'))}")
        check("关闭名称/普通设备图层仍可找到报警", pin.is_visible())
        page.locator('[data-action="back"]').click()
        pin.click()
        check("直接点击感叹号打开对应详情", "DT3-LYS1-1150" in page.locator(".alarm-detail-title").first.inner_text())
        page.locator('[data-action="back"]').click()
        page.locator('[data-tab="history"]').click()
        check("历史事件独立列出且不增加异常计数", page.locator(".alarm-point").count() == 7 and page.locator("#alarmCount").inner_text() == "1")
        page.locator('[data-point="DT2-MD2-1249"]').click()
        check("已订正阶跃保留历史证据", "已订正" in page.locator("#alarmContent").inner_text() and page.locator(".alarm-channel.critical").count() == 0)
        page.wait_for_function("document.getElementById('alarmField').classList.contains('history')")
        check("历史定位的空间光环保持静态", page.locator(".alarm-floor-scan").evaluate("e=>getComputedStyle(e).animationName") == "none")
        page.locator("#langBtn").click()
        check("语言切换更新面板与事件文案", page.locator("#alarmTitle").inner_text() == "Device alerts" and "corrected" in page.locator("#alarmContent").inner_text())
        page.locator('[data-action="chart"]').click()
        page.wait_for_function("document.getElementById('tpFrame').contentWindow.SiteChart")
        frame = page.frame_locator("#tpFrame")
        page.wait_for_function("document.getElementById('tpFrame').contentWindow.document.getElementById('treeSelect').value === 'DT2-MD2-1249'")
        check("曲线窗口选中对应树木", frame.locator("#treeSelect").input_value() == "DT2-MD2-1249")
        page.locator("#tpClose").click()
        page.locator("#alarmClose").click()
        check("关闭报警隐藏感叹号并恢复原有浏览", not page.locator("#alarmPanel").is_visible() and page.locator(".alarm-pin:visible").count() == 0)
        # 换回当前故障，覆盖定位、窄屏、减弱动画和键盘关闭。
        page.locator("#alarmBtn").click()
        check("重新打开报警入口回到异常列表", page.locator(".alarm-point").count() == 1)
        page.locator(".alarm-point").click()
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(300)
        check("减弱动画偏好关闭呼吸与扫描动画",
              page.locator(".alarm-pin.critical:visible").evaluate("e=>getComputedStyle(e,'::before').animationName") == "none" and
              page.locator(".alarm-pin.critical:visible .alarm-orbit").evaluate("e=>getComputedStyle(e).animationName") == "none" and
              page.locator("#alarmPanel").evaluate("e=>getComputedStyle(e).animationName") == "none" and
              page.locator(".alarm-floor-scan").evaluate("e=>getComputedStyle(e).animationName") == "none" and
              page.locator(".alarm-link-flow").evaluate("e=>getComputedStyle(e).animationName") == "none" and
              page.locator(".alarm-beam-flow").evaluate("e=>getComputedStyle(e).animationName") == "none")
        for width, height in [(1920, 1080), (1280, 720), (768, 1024), (390, 844), (360, 640)]:
            page.set_viewport_size({"width": width, "height": height})
            page.locator('[data-action="locate"]').click()
            page.wait_for_timeout(600)
            fits = page.locator("#alarmPanel").evaluate(
                "e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight}")
            check(f"{width}×{height} 报警面板在视口内且可滚动查看", fits)
        page.keyboard.press("Escape")
        check("Esc 关闭并归还焦点", not page.locator("#alarmPanel").is_visible() and page.locator("#alarmBtn").evaluate("e=>e===document.activeElement"))
        # 加载失败必须明确提示，不能显示“0 个异常”。
        # 使用独立页面，避免刚关闭的曲线 iframe 的导航等待影响按钮测试。
        page.close()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/3d/pointclouds/**/*.bin", binary)
        page.route("**/alarms.json?*", lambda route: route.fulfill(status=503, body="unavailable"))
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_function("document.getElementById('alarmCount').textContent==='!'")
        page.locator("#alarmBtn").click(no_wait_after=True)
        check("数据不可用显示失败与重试入口", page.locator('[data-action="retry"]').is_visible())
        page.unroute("**/alarms.json?*")
        page.locator('[data-action="retry"]').click(no_wait_after=True)
        page.wait_for_function("document.getElementById('alarmCount').textContent==='1'")
        check("重试后恢复真实报警计数", page.locator(".alarm-point").count() == 1)
        page.goto(url.split("?", 1)[0] + "?v=20261021-alarm111", wait_until="domcontentloaded")
        page.wait_for_function("window.AlarmVisuals && document.getElementById('alarmCount').textContent==='1'")
        page.locator("#alarmBtn").click(no_wait_after=True)
        check("原 v111 地址默认保留经典风格", page.locator("#alarmClassic").get_attribute("aria-pressed") == "true" and not page.evaluate("document.body.classList.contains('alarms-boost')"))
        check("报警交互无页面脚本异常：" + str(errors), not errors)
        browser.close()
    print(f"浏览器验收：{len(passed)}/{len(passed)} 通过", flush=True)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AlarmDataTests))
    if not result.wasSuccessful():
        raise SystemExit(1)
    browser_tests()
