/* ==========================================================================
 * 图表尺寸度量（共享）
 *
 * 为什么单独成一个模块
 * --------------------
 * 上下两张图的**绘图区左右边距必须严格相等**，否则同一时刻不在同一条竖线上，
 * 跨图联动指针（chart-env.js 直接传 chartX 像素）就会错位。
 * 原先这个值以 92 写死在 chart.js 和 chart-env.js 两处，靠注释互相提醒 ——
 * 一旦要按屏幕宽度自适应，两边各算各的迟早会分叉。所以收到这里，只有一个来源。
 *
 * 手机上为什么非改不可（实测）
 * ----------------------------
 *   iPhone SE  310 px 宽 -> 绘图区 126 px，只占 41%，六成宽度是边距
 *   iPhone 12  366 px 宽 -> 绘图区 182 px，占 50%
 * 92 px 的边距是为了容纳竖排的轴标题（"Sap flux density" 那种）。窄屏上
 * 轴标题本来就该收掉 —— 图例和彩色标签已经说明了哪条线是什么 —— 边距也就
 * 能一起收到 44，绘图区回到七成以上。
 *
 * 对外句柄：window.ChartMetrics = { plotMargin(), heights(), showAxisTitles(), isNarrow() }
 * ========================================================================== */

(function () {
    'use strict';

    /* 断点与 css/style.css 里的窄屏断点保持一致，改一处要同步改另一处 */
    var NARROW = 700;      /* 收轴标题、收边距 */
    var TINY = 480;        /* 进一步压缩高度与内边距 */

    function vw() {
        return window.innerWidth || document.documentElement.clientWidth || 1024;
    }

    function isNarrow() { return vw() < NARROW; }
    function isTiny()   { return vw() < TINY; }

    /* 绘图区左右边距。两张图共用此值 —— 这是它存在的全部理由。 */
    function plotMargin() {
        if (isTiny())   { return 44; }   /* 够放 "-60" 这种三字符刻度 */
        if (isNarrow()) { return 58; }
        return 92;                        /* 宽屏：容纳竖排轴标题 */
    }

    /* 轴标题在窄屏上是竖排长文本，很占宽度，收掉。
     * 信息不丢：上图有图例，下图的变量名写在彩色标签上。 */
    function showAxisTitles() { return !isNarrow(); }

    /* 图表高度。手机上两张图原先合计 720 px，比 iPhone SE 的 568 px 视口还高，
     * 想同时看到曲线和时间轴得来回滚。压到 520 上下，一屏内能看个大概。 */
    function heights() {
        if (isTiny())   { return { main: 290, env: 230 }; }
        if (isNarrow()) { return { main: 330, env: 260 }; }
        return { main: null, env: 340 };   /* main: null = 沿用 CSS 高度 */
    }

    window.ChartMetrics = {
        plotMargin: plotMargin,
        heights: heights,
        showAxisTitles: showAxisTitles,
        isNarrow: isNarrow,
        isTiny: isTiny
    };
}());
