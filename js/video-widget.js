/* ==========================================================================
 * 悬浮视频入口 —— 安装与组网演示（B站外链播放器）
 *
 * 交互设计（用户 2026-09-04 确认）
 * --------------------------------
 *   · 悬浮球可拖动，位置存 localStorage，刷新后停在上次拖到的地方
 *   · 旁边的文字气泡「每次打开网页都出现，且不自动消失」——不是首次访问才有，
 *     也不是弹一下就自己淡出；要访客自己点掉，或者点开视频（自然带走气泡）
 *   · 点击（不是拖动）才打开视频，弹窗关闭时必须清空 iframe.src——
 *     不这样做的话音频会在弹窗关掉之后还在后台放
 *
 * 结构：气泡和按钮是同一个 fixed 容器（.video-widget）里的两个子元素，
 * 不是各自独立定位——拖动时只需要挪动这一个外层容器，气泡自然跟着走，
 * 不用另外写"气泡跟随按钮位置"的同步逻辑。
 *
 * 为什么不用 <iframe> 常驻页面
 * ----------------------------
 * B站播放器本身不轻（播放器运行时 + 可能的广告位），这个站从第一天就在做
 * "首屏能省一个字节是一个字节"的功课（图片压缩、地图/图表按需加载）。
 * 悬浮球只是个按钮，iframe 只在真正点开那一刻才插入。
 *
 * 视觉借鉴 js/gallery.js 的灯箱：同一套暗色蒙层 + 居中卡片 + 关闭按钮语言，
 * 不是另起一套弹窗风格；但结构不同（灯箱是图配文字导航，这里是单个视频），
 * 类名独立成 .video-modal，不是塞进 .lightbox 里硬改。
 *
 * B站视频信息（发布前已核实）：
 *   BV1qttV6zEQX，时长 110 秒，标题「北京森林生态系统定位研究站
 *   Sap Flow仪器安装与组网演示」，公开可看，官方"外链播放器"支持任意域名嵌入
 *   （响应头核实过：无 X-Frame-Options / CSP 限制，CORS 是 *）。
 *
 * 对外句柄：window.VideoWidget = { open, close }
 * ========================================================================== */

(function () {
    'use strict';

    var BVID = 'BV1qttV6zEQX';
    var EMBED_SRC = 'https://player.bilibili.com/player.html?bvid=' + BVID +
                    '&page=1&high_quality=1&danmaku=0';
    var POS_KEY = 'bfers-video-widget-pos';

    /* 拖动判定：按下到抬起，指针移动超过这个像素数才算"拖动"，
     * 否则原地按下抬起会被判成拖动，点击永远打不开。 */
    var DRAG_THRESHOLD = 6;
    var reduceMotion = false;

    var root = null, bubbleEl = null, btn = null, modal = null;

    function t(k) { return window.Lang ? Lang.t(k) : k; }

    /* --- 位置：拖动整个容器（气泡+按钮），持久化 ---------------------------- */

    function loadPos() {
        try {
            var raw = localStorage.getItem(POS_KEY);
            if (!raw) { return null; }
            var p = JSON.parse(raw);
            if (typeof p.right === 'number' && typeof p.top === 'number') { return p; }
        } catch (e) { /* 隐私模式下 localStorage 会抛错，忽略即可 */ }
        return null;
    }

    function savePos(p) {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); }
        catch (e) { /* 同上 */ }
    }

    /* 存的是"离右边多远/离顶边多远"（right/top），不是 right/bottom——
     * 用 top 而不是 bottom 是刻意的：sap flow 图表的 navigator/scrollbar
     * 拖拽手柄贴在页面最下方，一旦滚到可见，正好落在视口底部，跟默认
     * 挂在"bottom"角落的悬浮球会撞在一起（实测验证过，见下方 build() 里
     * 算默认位置那段）。改成贴顶部，天然避开图表控件所在的底部区域；
     * 转屏或调整窗口宽度时，容器依然贴在同一个角落附近，不会被挤出屏幕。 */
    function clampPos(right, top) {
        var w = root.offsetWidth || 200, h = root.offsetHeight || 56;
        var maxRight = Math.max(8, window.innerWidth - w - 4);
        var maxTop = Math.max(8, window.innerHeight - h - 4);
        return {
            right: Math.min(Math.max(right, 8), maxRight),
            top: Math.min(Math.max(top, 8), maxTop)
        };
    }

    function applyPos(p) {
        root.style.right = p.right + 'px';
        root.style.top = p.top + 'px';
    }

    /* 首次访问（没有拖动记录）时的默认落点：贴右下角，但留出比常规悬浮球
     * 更大的底部间距（96px，不是常见的 16~24px）。
     *
     * 排查过程（都是实测出来的，不是猜的）：
     *   - 贴最底部 24px：sap flow 图表的 navigator/scrollbar 拖拽手柄就在
     *     图表最下沿，用户往下滚到能看见它们时，"能看见"这个动作本身通常
     *     就是滚到手柄贴着视口底边为止——悬浮球正好也在那，两者会叠在一起
     *     （验收测试 4c/5c 实测到；4c/5c 用 scrollIntoViewIfNeeded 复现的
     *     正是这种"滚到刚好可见"的最常见落点，不是刁钻的边界情况）。
     *   - 贴顶部（头部下方）：滚到地图时，Leaflet 自带的缩放/图层控件在
     *     地图左上/右上角，一样会被压住（验收测试 11n 实测到）。
     *   - 竖直居中：sap flow 图表本身经常占满大半屏（"两图合计不超过 1.1
     *     屏"是既有设计约束），居中的悬浮球反而正好挡在图表中央的可点击
     *     区域上（验收测试 11i 实测到——比前两个都糟，挡的是图表本身）。
     * 三个位置各挡一个东西，唯独"贴底但留出足够间距"三处都躲开了：
     * 96px 的间距刚好能让悬浮球本体完全避开图表手柄那十几像素高的窄条，
     * 又还是视觉上的"右下角"，不会像居中那样违反悬浮球的常见观感。
     * 真要拖到别处挡住什么，本来就是可拖动的——这只是把默认位置放到
     * 平时打架概率最低的地方，不是要求全场景零重叠（做不到，见上面三条）。 */
    function defaultTop() {
        var h = root.offsetHeight || 56;
        return window.innerHeight - h - 96;
    }

    function setupDrag() {
        var dragging = false, moved = false;
        var startX, startY, startRight, startTop;

        /* 拖动手柄是按钮本身，不是整个容器——按在气泡文字/关闭叉上
         * 不应该触发拖动，否则会跟"点文字打开视频""点叉关闭气泡"打架。 */
        btn.addEventListener('pointerdown', function (e) {
            if (e.button !== undefined && e.button !== 0) { return; } /* 只认左键/触摸 */
            dragging = true; moved = false;
            startX = e.clientX; startY = e.clientY;
            var r = root.getBoundingClientRect();
            startRight = window.innerWidth - r.right;
            startTop = r.top;
            btn.setPointerCapture(e.pointerId);
            root.classList.add('is-dragging');
        });

        btn.addEventListener('pointermove', function (e) {
            if (!dragging) { return; }
            var dx = e.clientX - startX, dy = e.clientY - startY;
            if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) { moved = true; }
            applyPos(clampPos(startRight - dx, startTop + dy));
        });

        function endDrag(e) {
            if (!dragging) { return; }
            dragging = false;
            root.classList.remove('is-dragging');
            var r = root.getBoundingClientRect();
            var p = clampPos(window.innerWidth - r.right, r.top);
            applyPos(p);
            savePos(p);
            if (!moved) { open(); }   /* 没怎么动 = 当成一次点击 */
        }
        btn.addEventListener('pointerup', endDrag);
        btn.addEventListener('pointercancel', endDrag);

        /* 窗口变窄（比如手机转屏）时把容器拉回可见范围，不能被挤到屏幕外 */
        window.addEventListener('resize', function () {
            var r = root.getBoundingClientRect();
            applyPos(clampPos(window.innerWidth - r.right, r.top));
        });
    }

    /* --- 气泡：每次打开网页都出现，不自动消失，手动关 --------------------- */

    function paintBubble() {
        if (!bubbleEl) { return; }
        bubbleEl.querySelector('.vw-text').textContent = t('video.bubble');
        bubbleEl.querySelector('.vw-close').setAttribute('aria-label', t('video.bubbleClose'));
        bubbleEl.querySelector('.vw-close').setAttribute('title', t('video.bubbleClose'));
    }

    function dismissBubble() {
        if (bubbleEl) { bubbleEl.classList.add('is-hidden'); }
    }

    /* --- 视频弹窗 -------------------------------------------------------- */

    function buildModal() {
        modal = document.createElement('div');
        modal.className = 'video-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="vm-panel">' +
                '<button type="button" class="vm-close">&times;</button>' +
                '<div class="vm-frame"><iframe class="vm-iframe" allowfullscreen ' +
                    'scrolling="no" frameborder="0"></iframe></div>' +
                '<p class="vm-caption"></p>' +
            '</div>';
        document.body.appendChild(modal);

        modal.querySelector('.vm-close').addEventListener('click', close);
        /* 点蒙层空白处关闭，点面板本身不关——跟灯箱的约定一致 */
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { close(); }
        });
    }

    function open() {
        dismissBubble();
        if (!modal) { buildModal(); }
        modal.querySelector('.vm-caption').textContent = t('video.caption');
        modal.querySelector('.vm-close').setAttribute('aria-label', t('video.close'));
        /* 打开这一刻才真正加载播放器——关掉时会把 src 清空 */
        modal.querySelector('.vm-iframe').src = EMBED_SRC;
        modal.classList.add('is-open');
        document.body.classList.add('vm-lock');
        modal.querySelector('.vm-close').focus();
    }

    function close() {
        if (!modal) { return; }
        modal.classList.remove('is-open');
        document.body.classList.remove('vm-lock');
        /* 必须让 iframe 停止加载，不然弹窗关了视频还在后台放——图片灯箱
         * 不用管这个，是它和灯箱唯一一处不能照抄的地方。
         * 注意：不能写 iframe.src = ''——空字符串会被当成相对路径，
         * 解析成当前页面地址，iframe 反而去加载了一份本站首页（实测发现，
         * 见验收测试 12j）。要用 removeAttribute，读回 .src 才会是真正的空。 */
        modal.querySelector('.vm-iframe').removeAttribute('src');
        if (btn) { btn.focus(); }
    }

    function onKey(e) {
        if (modal && modal.classList.contains('is-open') && e.key === 'Escape') { close(); }
    }

    /* --- 初始化 ------------------------------------------------------------ */

    function build() {
        root = document.createElement('div');
        root.className = 'video-widget';

        bubbleEl = document.createElement('div');
        bubbleEl.className = 'video-bubble';
        bubbleEl.innerHTML =
            '<span class="vw-text" role="button" tabindex="0"></span>' +
            '<button type="button" class="vw-close"></button>';

        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'video-fab';
        btn.innerHTML = '<span class="vw-play" aria-hidden="true"></span>';

        /* 删除按钮：把它彻底关掉（记在本地，刷新也不再出现） */
        var kill = document.createElement('button');
        kill.type = 'button';
        kill.className = 'vw-kill';
        kill.innerHTML = '\u2715';
        kill.title = '不再显示';
        kill.addEventListener('click', function (e) {
            e.stopPropagation();
            root.style.display = 'none';
            try { localStorage.setItem('bfers-video-widget-hidden', '1'); } catch (e2) {}
        });
        root.appendChild(kill);

        root.appendChild(bubbleEl);
        root.appendChild(btn);
        document.body.appendChild(root);

        btn.setAttribute('aria-label', t('video.open'));
        bubbleEl.querySelector('.vw-close').addEventListener('click', dismissBubble);
        /* 点气泡文字本身也能直接打开视频，不用非得点小圆球 */
        var vwText = bubbleEl.querySelector('.vw-text');
        vwText.addEventListener('click', open);
        vwText.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });

        paintBubble();

        var saved = loadPos();
        applyPos(saved ? clampPos(saved.right, saved.top) : clampPos(24, defaultTop()));
        setupDrag();

        if (!reduceMotion) { root.classList.add('vw-enter'); }

        document.addEventListener('keydown', onKey);
    }

    function init() {
        /* 用户点过"删除"就不再出现 */
        try { if (localStorage.getItem('bfers-video-widget-hidden') === '1') { return; } } catch (e) {}
        reduceMotion = !!(window.matchMedia &&
                          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        build();
        if (window.Lang) { Lang.onChange(paintBubble); }
        window.VideoWidget = { open: open, close: close };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
