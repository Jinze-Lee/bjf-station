/* ==========================================================================
 * 仪器安装图集
 *
 * 布局：左侧一张主图占大头，右侧竖排三张缩略图。
 * 交互：
 *   自动轮播   每 5 秒翻一张，循环；主图下方进度条显示剩余时间
 *   点缩略图   换成主图，计时重新开始
 *   点主图     打开灯箱看大图（Esc 关闭，← → 切换）
 *
 * 轮播在这四种情况下暂停：
 *   ① 灯箱打开 —— 用户在放大细看，翻页会打断（明确要求）
 *   ② 鼠标悬停 / 键盘聚焦 —— 正在看就别翻走
 *   ③ 图集滚出视野 —— 看不见就不必跑
 *   ④ 系统开启「减少动态效果」 —— 与数据传输示意图的处理一致
 *
 * 计时用 requestAnimationFrame 而不是 setInterval：
 * 进度条与翻页由同一个时间源驱动，不会出现「条走完了图还没翻」的错位；
 * 暂停时只是不累加 elapsed，恢复后从原处接着走，也不会跳。
 *
 * 图片文件由 工具/准备图片.py 生成两套尺寸：
 *   images/install-N.webp        800 px 长边，用于主图与灯箱
 *   images/install-N-thumb.webp  240 px 长边，用于缩略图与模糊背板
 *
 * 对外句柄：
 *   window.SiteGallery = { select, open, close, current, count, isPlaying, progress }
 * ========================================================================== */

(function () {
    'use strict';

    var N = 4;                       // 图片张数
    var DURATION = 5000;             // 每张停留时长（ms）

    var current = 0;
    var box = null;                  // 灯箱元素
    var elapsed = 0;                 // 当前这张已停留时长
    var lastTs = 0;
    var rafId = null;

    var hovering = false;            // 鼠标悬停
    var focused  = false;            // 键盘焦点在图集内
    var visible = true;
    var reduceMotion = false;

    function t(k) { return window.Lang ? Lang.t(k) : k; }
    function cap(i) { return t('gal.cap' + (i + 1)); }

    /* alt / aria-label 是纯文本属性，标签要剥掉 */
    function plain(html) { return String(html).replace(/<[^>]*>/g, ''); }

    function lightboxOpen() {
        return !!(box && box.classList.contains('is-open'));
    }

    /* 只要有任一条成立就暂停 */
    function playing() {
        return !lightboxOpen() && !hovering && !focused && visible && !reduceMotion;
    }

    /* --- 主图 + 图注 --- */
    function select(i) {
        if (i < 0 || i >= N) { return; }
        current = i;
        elapsed = 0;                                  // 切图即重新计时

        var img = document.getElementById('galleryMainImg');
        if (img) {
            img.src = 'images/install-' + (i + 1) + '.webp';
            img.alt = plain(cap(i));
        }
        /* 照片是竖构图，主图区两侧会空出来。用同一张图的模糊放大版做背板填满，
         * 比大片纯黑看着更像有意为之。用 -thumb 那张就够（反正要糊掉），省流量。 */
        var bg = document.getElementById('galleryMainBg');
        if (bg) {
            bg.style.backgroundImage = 'url("images/install-' + (i + 1) + '-thumb.webp")';
        }
        /* 图注里含 <strong> 等行内标签，用 innerHTML。
         * 文案来自 i18n 词典（自己写的），不是用户输入，无注入风险。 */
        var c = document.getElementById('galleryCaption');
        if (c) { c.innerHTML = cap(i); }

        var cnt = document.getElementById('galleryCount');
        if (cnt) { cnt.textContent = (i + 1) + ' / ' + N; }

        var thumbs = document.querySelectorAll('#galleryThumbs .gt');
        for (var k = 0; k < thumbs.length; k++) {
            var idx = parseInt(thumbs[k].getAttribute('data-idx'), 10);
            thumbs[k].classList.toggle('is-active', idx === i);
            thumbs[k].setAttribute('aria-pressed', idx === i ? 'true' : 'false');
        }

        paintBar();
        if (lightboxOpen()) { paintBox(); }
    }

    /* --- 进度条 --- */
    function paintBar() {
        var bar = document.getElementById('galleryBar');
        if (!bar) { return; }
        bar.style.width = (100 * Math.min(elapsed / DURATION, 1)).toFixed(2) + '%';
        var row = bar.parentNode && bar.parentNode.parentNode;
        if (row && row.classList) { row.classList.toggle('is-paused', !playing()); }
    }

    function tick(ts) {
        if (lastTs && playing()) { elapsed += ts - lastTs; }
        lastTs = ts;                                  // 暂停时也更新，恢复后才不会跳
        if (elapsed >= DURATION) {
            select((current + 1) % N);                // select 内部会把 elapsed 归零
        } else {
            paintBar();
        }
        rafId = window.requestAnimationFrame(tick);
    }

    /* --- 缩略图 --- */
    function buildThumbs() {
        var wrap = document.getElementById('galleryThumbs');
        if (!wrap) { return; }
        wrap.innerHTML = '';

        for (var i = 1; i < N; i++) {                 // 第 1 张是主图，不重复出现在缩略栏
            (function (idx) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'gt';
                b.setAttribute('data-idx', idx);
                b.setAttribute('aria-label', plain(cap(idx)));
                b.innerHTML = '<img src="images/install-' + (idx + 1) +
                              '-thumb.webp" alt="" loading="lazy" />';
                b.addEventListener('click', function () { select(idx); });
                wrap.appendChild(b);
            }(i));
        }
    }

    /* --- 灯箱 --- */
    function paintBox() {
        box.querySelector('.lb-img').src = 'images/install-' + (current + 1) + '.webp';
        box.querySelector('.lb-img').alt = plain(cap(current));
        box.querySelector('.lb-cap').innerHTML = cap(current);
        box.querySelector('.lb-n').textContent = (current + 1) + ' / ' + N;
    }

    function buildBox() {
        box = document.createElement('div');
        box.className = 'lightbox';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML =
            '<button type="button" class="lb-close" aria-label="Close">&times;</button>' +
            '<button type="button" class="lb-nav lb-prev" aria-label="Previous">&#10094;</button>' +
            '<figure class="lb-fig">' +
              '<img class="lb-img" src="" alt="" />' +
              '<figcaption><span class="lb-n"></span><span class="lb-cap"></span></figcaption>' +
            '</figure>' +
            '<button type="button" class="lb-nav lb-next" aria-label="Next">&#10095;</button>';
        document.body.appendChild(box);

        box.querySelector('.lb-close').addEventListener('click', close);
        box.querySelector('.lb-prev').addEventListener('click', function (e) {
            e.stopPropagation(); select((current - 1 + N) % N);
        });
        box.querySelector('.lb-next').addEventListener('click', function (e) {
            e.stopPropagation(); select((current + 1) % N);
        });
        /* 点空白处关闭，但点图片本身不关 */
        box.addEventListener('click', function (e) {
            if (e.target === box || e.target.classList.contains('lb-fig')) { close(); }
        });
    }

    function open() {
        if (!box) { buildBox(); }
        paintBox();
        box.classList.add('is-open');
        document.body.classList.add('lb-lock');
        elapsed = 0;                 // 关掉灯箱后从头计时，而不是立刻翻页
        paintBar();
        box.querySelector('.lb-close').focus();
    }

    function close() {
        if (!box) { return; }
        box.classList.remove('is-open');
        document.body.classList.remove('lb-lock');
        elapsed = 0;
        paintBar();
        var b = document.getElementById('galleryMainBtn');
        if (b) {
            b.focus();
            /* focus() 会同步触发 focusin，把 focused 置为 true。但这个焦点是关闭
             * 灯箱后**程序还回去**的，不代表用户正在操作图集，所以立刻撤销 ——
             * 否则关掉灯箱后轮播就再也不会自己恢复。 */
            focused = false;
            paintBar();
        }
    }

    function onKey(e) {
        if (!lightboxOpen()) { return; }
        if (e.key === 'Escape')     { close(); }
        if (e.key === 'ArrowLeft')  { select((current - 1 + N) % N); }
        if (e.key === 'ArrowRight') { select((current + 1) % N); }
    }

    function init() {
        var gal = document.getElementById('methodGallery');
        if (!gal || !document.getElementById('galleryThumbs')) { return; }

        reduceMotion = !!(window.matchMedia &&
                          window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        buildThumbs();
        select(0);

        var mainBtn = document.getElementById('galleryMainBtn');
        if (mainBtn) { mainBtn.addEventListener('click', open); }
        document.addEventListener('keydown', onKey);

        /* 悬停 / 键盘聚焦在图集内时暂停 */
        gal.addEventListener('mouseenter', function () { hovering = true;  paintBar(); });
        gal.addEventListener('mouseleave', function () { hovering = false; paintBar(); });
        gal.addEventListener('focusin',    function () { focused  = true;  paintBar(); });
        gal.addEventListener('focusout',   function () { focused  = false; paintBar(); });

        /* 滚出视野就停 */
        if (window.IntersectionObserver) {
            new IntersectionObserver(function (es) {
                visible = es[0].isIntersecting;
                paintBar();
            }, { threshold: 0.15 }).observe(gal);
        }

        if (!reduceMotion) { rafId = window.requestAnimationFrame(tick); }
        paintBar();

        /* 语言切换：图注、aria 文案跟着变 */
        if (window.Lang) {
            Lang.onChange(function () { buildThumbs(); select(current); });
        }

        window.SiteGallery = {
            select: select, open: open, close: close,
            current: function () { return current; },
            count: N,
            duration: DURATION,
            isPlaying: playing,
            _flags: function () { return { lb: lightboxOpen(), hover: hovering, focus: focused, visible: visible, reduce: reduceMotion }; },
            progress: function () { return Math.min(elapsed / DURATION, 1); }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
