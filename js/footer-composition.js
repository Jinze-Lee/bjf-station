/* ==========================================================================
 * 页脚 · 监测规模一行
 *
 *      20 棵树 · 8 个树种 · 3 个样点
 *
 * 替换原先「20 棵监测树木 / 分布于 3 个样点」那两个数字方块。
 *
 * 为什么只有一行
 * --------------
 * 中间做过一版「树种组成条」：堆叠条 + 四类木材构造的图例 + 汇总行，三行。
 * 信息是全的，但页脚不该让人停下来解读 —— 要配图例才看得懂，说明它在
 * 这个位置讲不清楚自己。木材构造那层信息在「监测树木」一节的表格里本来
 * 就有，页脚重复一遍没有增益。
 *
 * 所以收成一行：数字用主题绿加粗立住，单位弱化成灰。安静，但信息比
 * 原来那两个方块还多一项（树种数）。
 *
 * 所有数字都从 js/trees.js 现算。原来的 HTML 里 20 和 3 是硬编码的，
 * 以后加树、加样点会悄悄过期。
 *
 * 对外句柄：window.FooterComposition = { render }
 * ========================================================================== */

(function () {
    'use strict';

    function t(k) { return window.Lang ? Lang.t(k) : k; }

    function render() {
        var host = document.getElementById('footerComposition');
        if (!host || typeof TREES === 'undefined' || !TREES.length) { return; }

        function uniq(key) {
            var seen = {};
            TREES.forEach(function (tr) { seen[tr[key]] = 1; });
            return Object.keys(seen).length;
        }

        var parts = [
            [TREES.length, t('trees.nTrees')],
            [uniq('species'), t('trees.nSpecies')],
            [uniq('plot'), t('footer.locations')]
        ];

        host.innerHTML = parts.map(function (p) {
            return '<span class="fs-item"><b>' + p[0] + '</b> ' + p[1] + '</span>';
        }).join('<span class="fs-dot">·</span>');
    }

    function init() {
        render();
        if (window.Lang) { Lang.onChange(render); }
        window.FooterComposition = { render: render };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
