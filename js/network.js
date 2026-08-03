/* ==========================================================================
 * 数据传输示意图的交互
 *
 * 职责：
 *   1. 点击/键盘聚焦节点 -> 在下方显示该环节的说明
 *   2. 播放 / 暂停动画（SMIL 用 pauseAnimations，CSS 动画用 class 控制）
 *   3. 尊重系统的 prefers-reduced-motion：默认就暂停
 *   4. 语言切换时刷新说明文字与按钮文案
 *
 * SVG 结构写在 index.html 里，动画写在 style.css 里，本文件只管行为。
 *
 * 对外句柄：window.SiteNetwork = { play(), pause(), select(node), isPaused() }
 * ========================================================================== */

(function () {
    'use strict';

    var svg, wrap, detail, btn, btnLabel;
    var paused = false;
    var activeNode = null;
    var explored = false;   /* 用户是否已经自己动过手 */

    function t(k) { return window.Lang ? Lang.t(k) : k; }

    /* 节点 -> 说明文案的键 */
    var TITLE = {
        tree:   'net.tree',
        dendro: 'net.dr',
        logger: 'net.logger',
        modem:  'net.modem',
        lab:    'net.lab'
    };
    var BODY = {
        tree:   'net.d.tree',
        dendro: 'net.d.dendro',
        logger: 'net.d.logger',
        modem:  'net.d.modem',
        lab:    'net.d.lab'
    };

    function showDetail(node) {
        if (!detail) { return; }
        if (!node) {
            detail.innerHTML = '';
            return;
        }
        detail.innerHTML = '<strong>' + t(TITLE[node]) + '</strong> &nbsp;' + t(BODY[node]);
    }

    /* 幽灵光标只在「用户还没意识到这里能点」时才有意义。
     * 一旦真的动了手（点击 / 悬停 / 键盘聚焦任一节点），就永久停掉 ——
     * 已经会用了还在旁边演，就从提示变成了干扰。
     *
     * 只加 class，不删元素：CSS 里用 .net-wrap:not(.is-explored) 控制动画，
     * 保留元素才能在「减少动态效果」下继续显示那个静止的光标。 */
    function markExplored() {
        if (explored || !wrap) { return; }
        explored = true;
        wrap.classList.add('is-explored');
    }

    function select(node) {
        activeNode = node;
        var nodes = svg.querySelectorAll('.node');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.toggle('is-active',
                nodes[i].getAttribute('data-node') === node);
        }
        showDetail(node);
    }

    function setPaused(p) {
        paused = p;
        wrap.classList.toggle('is-paused', p);
        /* SMIL（animateMotion 驱动的数据包）只能用这两个 API 控制 */
        if (svg.pauseAnimations && svg.unpauseAnimations) {
            if (p) { svg.pauseAnimations(); } else { svg.unpauseAnimations(); }
        }
        if (btn) { btn.setAttribute('aria-pressed', p ? 'true' : 'false'); }
        if (btnLabel) { btnLabel.textContent = t(p ? 'net.play' : 'net.pause'); }
    }

    function init() {
        svg    = document.getElementById('netDiagram');
        wrap   = document.querySelector('.net-wrap');
        detail = document.getElementById('netDetail');
        btn    = document.getElementById('netToggle');
        btnLabel = document.getElementById('netToggleLabel');
        if (!svg || !wrap) { return; }

        /* 节点点击 / 键盘操作 */
        var nodes = svg.querySelectorAll('.node');
        for (var i = 0; i < nodes.length; i++) {
            (function (el) {
                var name = el.getAttribute('data-node');
                el.addEventListener('click', function () { markExplored(); select(name); });
                el.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        markExplored();
                        select(name);
                    }
                });
                /* 悬停和聚焦也算「已经知道能点了」 —— 鼠标一停在节点上，
                 * 节点自己的 hover 反馈就已经把「可点」说清楚了。 */
                el.addEventListener('mouseenter', markExplored);
                el.addEventListener('focus', markExplored);
            }(nodes[i]));
        }

        if (btn) {
            btn.addEventListener('click', function () { setPaused(!paused); });
        }

        /* 系统要求减少动态效果时，默认就是暂停状态 */
        var reduce = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setPaused(!!reduce);

        /* 首屏先给出径向变化仪的说明 —— 「它独立走线、不经数采」是本图最容易被
         * 看漏、也最需要讲清楚的一点，所以让它默认亮着。 */
        select('dendro');

        if (window.Lang) {
            Lang.onChange(function () {
                showDetail(activeNode);
                if (btnLabel) { btnLabel.textContent = t(paused ? 'net.play' : 'net.pause'); }
            });
        }

        window.SiteNetwork = {
            play:  function () { setPaused(false); },
            pause: function () { setPaused(true); },
            select: select,
            isPaused: function () { return paused; },
            activeNode: function () { return activeNode; },
            isExplored: function () { return explored; },
            markExplored: markExplored
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
