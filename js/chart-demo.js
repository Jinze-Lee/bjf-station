/* 实时演示：模拟「鼠标往右拖」
 * ---------------------------------------------------------------------------
 * 点一下按钮，从最早的历史数据开始，可见时间窗一点点往右拉宽 ——
 * 数据逐渐堆上去，从几小时的小尺度平滑过渡到全时段的大尺度。
 *
 * 为什么这样写
 *   · 两张图（液流/径向 + 环境）的时间轴本来就是联动的（chart-env.js 的 linkMain），
 *     所以这里只驱动主图；为了稳妥，环境图也一起设一遍同样的区间。
 *   · 窗口宽度按「对数插值」：起点约 6 小时，终点是全时段。这样前半段能看清半小时级的
 *     采样点，后半段自然过渡到几个月的大尺度，不会一开始就糊成一片。
 *   · 用 requestAnimationFrame 逐帧推进，1× 约 40 秒走完；速度按钮在 0.5/1/2/4 之间循环。
 *   · 用户在图上自己拖动/缩放，或数据还没加载好时，自动停下，不跟用户抢控制权。
 *
 * 对外：window.ChartDemo = { toggle, start, stop, cycleSpeed, speed, running }
 */
(function () {
    'use strict';

    var SPEEDS = [0.5, 1, 2, 4];
    var speedIdx = 1;
    var raf = null, t0 = 0, span = null, running = false;

    /* 注意：SiteChart.chart / EnvChart.chart 是 Highcharts 实例本身（不是取图函数），
       但历史上也出现过函数形式，两种都兼容。 */
    function pick(host) {
        if (!host) { return null; }
        var c = host.chart;
        return (typeof c === 'function') ? c() : (c || null);
    }
    function mainChart() { return pick(window.SiteChart); }
    function envChart() { return pick(window.EnvChart); }

    function dataSpan() {
        var ch = mainChart();
        if (!ch || !ch.xAxis || !ch.xAxis[0]) { return null; }
        var ax = ch.xAxis[0];
        if (ax.dataMin == null || ax.dataMax == null || ax.dataMax <= ax.dataMin) { return null; }
        return { min: ax.dataMin, max: ax.dataMax };
    }

    /* 对数插值：p=0 -> 约 6 小时的小窗；p=1 -> 全时段 */
    function windowEnd(sp, p) {
        var total = sp.max - sp.min;
        var w0 = Math.min(6 * 3600 * 1000, total / 20);
        return sp.min + w0 * Math.pow(total / w0, p);
    }

    function apply(min, max) {
        var ch = mainChart();
        if (ch && ch.xAxis && ch.xAxis[0]) { ch.xAxis[0].setExtremes(min, max, true, false); }
        var e = envChart();
        if (e && e.xAxis && e.xAxis[0]) { e.xAxis[0].setExtremes(min, max, true, false); }
    }

    function tick() {
        if (!running) { return; }
        if (!span) { span = dataSpan(); }
        if (!span) { stop(); return; }                       // 数据还没到位，先停
        var dur = 40000 / SPEEDS[speedIdx];                  // 1× 约 40 秒
        var p = Math.min(1, (Date.now() - t0) / dur);
        apply(span.min, windowEnd(span, p));
        if (p >= 1) { stop(); return; }
        raf = requestAnimationFrame(tick);
    }

    function start() {
        var sp = dataSpan();
        if (!sp) { return false; }                           // 没有数据就别装样子
        span = sp;
        running = true;
        t0 = Date.now();
        apply(span.min, windowEnd(span, 0));
        if (raf) { cancelAnimationFrame(raf); }
        raf = requestAnimationFrame(tick);
        paint();
        return true;
    }

    function stop() {
        running = false;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        paint();
    }

    function toggle() {
        if (running) { stop(); } else { start(); }
        return running;
    }

    function cycleSpeed() {
        /* 改速度时保持当前进度不变（按进度反推新的起点时间），否则一按就跳到终点 */
        var oldDur = 40000 / SPEEDS[speedIdx];
        var p = running ? Math.min(1, (Date.now() - t0) / oldDur) : 0;
        speedIdx = (speedIdx + 1) % SPEEDS.length;
        if (running) { t0 = Date.now() - p * (40000 / SPEEDS[speedIdx]); }
        paint();
        return SPEEDS[speedIdx];
    }

    /* 按钮文案跟随状态与语言 */
    function T(k, fallback) {
        return (window.Lang && Lang.t) ? (Lang.t(k) || fallback) : fallback;
    }
    function paint() {
        var b = document.getElementById('demoBtn');
        var s = document.getElementById('demoSpeed');
        if (b) {
            b.textContent = running ? T('demo.stop', '■ 停止演示') : T('demo.play', '▶ 实时演示');
            b.classList.toggle('on', running);
        }
        if (s) { s.textContent = T('demo.speed', '速度') + ' ' + SPEEDS[speedIdx] + '×'; }
    }

    function init() {
        var b = document.getElementById('demoBtn');
        var s = document.getElementById('demoSpeed');
        if (b) { b.addEventListener('click', function () { toggle(); }); }
        if (s) { s.addEventListener('click', function () { cycleSpeed(); }); }
        /* 用户自己上手就停，不跟他抢；但控件条（全选/演示/速度）要排除掉，
           否则点按钮时 mousedown 先停、click 又启，等于永远停不下来。 */
        var stack = document.querySelector('.chart-stack');
        if (stack) {
            ['mousedown', 'wheel', 'touchstart'].forEach(function (ev) {
                stack.addEventListener(ev, function (e) {
                    if (!running) { return; }
                    if (e.target && e.target.closest && e.target.closest('.env-bar')) { return; }
                    stop();
                }, { passive: true });
            });
        }
        if (window.Lang && Lang.onChange) { Lang.onChange(paint); }
        paint();
    }

    window.ChartDemo = {
        toggle: toggle, start: start, stop: stop,
        cycleSpeed: cycleSpeed, speed: function () { return SPEEDS[speedIdx]; },
        running: function () { return running; },
        repaint: paint
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
