/* ==========================================================================
 * 数据来源提示条
 *
 * 读 js/observations.js 的 OBS_META.source：
 *   'sample'   -> 显示橙色警示条：这是合成数据，不是实测值
 *   'measured' -> 换成中性的信息条：数据范围、批次、导入时间
 *
 * 这样「站上现在展示的到底是不是真数据」永远一目了然，
 * 不需要靠人记得去改文案 —— 导入实测数据后警示条自动消失。
 *
 * 对外句柄：window.DataSource = { meta, isSample() }
 * ========================================================================== */

(function () {
    'use strict';

    function t(k) { return window.Lang ? Lang.t(k) : k; }
    function isZh() { return window.Lang && Lang.current === 'zh'; }

    function fmt(ms) {
        /* 数据时间戳按当地时区（默认 UTC+8）显示 */
        var offMin = (window.OBS_META && OBS_META.timezoneOffsetMin) || 480;
        var d = new Date(ms + offMin * 60000);
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
               ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    }

    function render() {
        var box = document.getElementById('dataSource');
        if (!box) { return; }

        /* 两条警示路径都要把 display 显式改回来 —— 实测那一支会把它设成 none，
         * 而语言切换会重新调用本函数：不复位的话，一旦走过实测分支，
         * 之后即使换成合成数据，警示条也再不会出现。 */
        var meta = window.OBS_META;
        if (!meta) {
            box.className = 'footnote demo-warning';
            box.style.display = '';
            box.innerHTML = '<strong>' + t('src.missingTitle') + '</strong> ' + t('src.missingBody');
            return;
        }

        if (meta.source === 'sample') {
            box.className = 'footnote demo-warning';
            box.style.display = '';
            box.innerHTML =
                '<strong>' + t('treedata.demoTitle') + '</strong> ' +
                t('treedata.demoBody');
            return;
        }

        /* 实测数据：什么都不显示。
         *
         * 这里原本有一块「实测数据」信息条，列时间范围、规模、最新更新时间。
         * 2026-08-02 按要求去掉 —— 时间范围图表自己就写着，最新更新时间已经
         * 挪到联系方式末尾的版本行里，这块属于重复。
         *
         * 但**警示路径保留**（见上面的 sample 分支）：万一以后误把合成数据
         * 导进来，页面仍会弹出橙色警示条。那是防止「假数据被当成实测发布」
         * 的最后一道闸，不能因为现在用不上就一并删掉。 */
        box.className = 'footnote data-info';
        box.innerHTML = '';
        box.style.display = 'none';
    }

    /* 联系方式末尾那行「数据更新至 …」的日期。
     * 从 OBS_META.span 取，不手写 —— 手写的日期迟早会忘了改，
     * 到时候页面上写着旧日期、图表里是新数据，比不写还糟。 */
    function renderDataDate() {
        var el = document.getElementById('siteDataDate');
        if (!el) { return; }
        var span = window.OBS_META && OBS_META.span;
        if (!span) { el.textContent = ''; return; }
        el.textContent = fmt(span[1]).slice(0, 10);   // 只要日期，不要时分
    }

    function init() {
        render();
        renderDataDate();
        if (window.Lang) { Lang.onChange(render); }
        window.DataSource = {
            meta: window.OBS_META || null,
            isSample: function () {
                return !window.OBS_META || OBS_META.source === 'sample';
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
