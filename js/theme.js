/* ==========================================================================
 * 日 / 夜主题切换
 *
 * 两套配色都定义在 css/style.css 里：
 *     :root                       深色森林（默认）
 *     :root[data-theme="light"]   暖白纸感
 * 本文件只负责在 <html> 上写 data-theme、记住选择、通知需要重绘的模块。
 *
 * ⚠️ 首屏的主题不是这里定的。
 * 这个文件在 <body> 末尾才加载，那时页面已经按默认深色画过一帧了 ——
 * 偏好浅色的访客每次都会看到一下深色闪屏。真正抢在首绘之前设置 data-theme 的，
 * 是 index.html <head> 里的那段内联脚本。两处的读取逻辑必须一致，改一处要同步。
 * 本文件在 init() 里只是把已经生效的值读回来，不重复设置。
 *
 * 谁需要在主题变化时重绘
 *   chart.js  Highcharts 的配色在建图时就烤进 SVG 了，redraw 改不动 -> 销毁重建
 *   map.js    标记颜色是建 marker 时写死的 -> 重设每个标记的样式
 *   其余      纯 CSS，变量一换就自动跟上，不用管
 *
 * 对外句柄：window.Theme = { current(), set(t), toggle(), onChange(fn) }
 * ========================================================================== */

var Theme = (function () {
    'use strict';

    var KEY = 'bfers-theme';
    var DEFAULT = 'dark';
    /* 默认深色、且**不跟随系统的 prefers-color-scheme**：
     * 这个站的深色是主视觉（对齐参考站 treewatch.net），不是「夜间模式」，
     * 不该因为访客系统开了浅色就被悄悄换掉。用户点了按钮才算数。 */

    var current = DEFAULT;
    var listeners = [];

    function read() {
        try {
            var v = localStorage.getItem(KEY);
            return (v === 'light' || v === 'dark') ? v : DEFAULT;
        } catch (e) {
            return DEFAULT;    /* 隐私模式下 localStorage 会抛错 */
        }
    }

    function paintButton() {
        var btn = document.getElementById('themeToggle');
        if (!btn) { return; }
        /* 按钮说的是「点了会变成什么」，不是「现在是什么」 */
        var key = current === 'dark' ? 'theme.toLight' : 'theme.toDark';
        var label = window.Lang ? Lang.t(key) : key;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.setAttribute('aria-pressed', current === 'light' ? 'true' : 'false');
    }

    function set(next) {
        if (next !== 'light' && next !== 'dark') { return; }
        current = next;

        /* 深色是默认值，就把属性拿掉而不是写 data-theme="dark" ——
         * 少一个属性，也让「没属性 = 默认」这条规则在 DOM 里一眼可见 */
        if (current === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        try { localStorage.setItem(KEY, current); } catch (e) { /* 忽略 */ }

        paintButton();

        /* 通知需要重绘的模块。
         * 放在 rAF 里等一帧：此刻浏览器还没重新计算样式，
         * 立刻回调的话 chart.js 用 getComputedStyle 读到的还是旧配色。 */
        window.requestAnimationFrame(function () {
            for (var i = 0; i < listeners.length; i++) {
                try {
                    listeners[i](current);
                } catch (e) {
                    /* 单个模块重绘失败不该连累其他模块 */
                    if (window.console) { console.error('[theme] 回调出错:', e); }
                }
            }
        });
    }

    function toggle() { set(current === 'dark' ? 'light' : 'dark'); }

    function onChange(fn) { listeners.push(fn); }

    function init() {
        /* <head> 里的内联脚本已经把 data-theme 设好了，这里只读回来对齐状态 */
        current = read();

        var btn = document.getElementById('themeToggle');
        if (btn) { btn.addEventListener('click', toggle); }
        paintButton();

        /* 语言切换后按钮的 aria-label / title 要跟着换语言 */
        if (window.Lang) { Lang.onChange(paintButton); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        current: function () { return current; },
        set: set,
        toggle: toggle,
        onChange: onChange
    };
}());

window.Theme = Theme;
