/* ==========================================================================
 * 导航行为
 *  - 窄屏汉堡菜单展开/收起
 *  - 窄屏下点父项展开二级菜单（触屏没有 hover）
 *  - 锚点跳转时避开固定表头的遮挡
 * ========================================================================== */

(function () {
    'use strict';

    function init() {
        var toggle = document.querySelector('.nav-toggle');
        var nav    = document.querySelector('.primary-menu');
        var header = document.getElementById('header-container');
        if (!toggle || !nav) { return; }

        toggle.addEventListener('click', function () {
            var open = nav.classList.toggle('is-open');
            toggle.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        /* 窄屏：点父项展开子菜单，而不是直接跳走 */
        nav.querySelectorAll('.has-children > a').forEach(function (a) {
            a.addEventListener('click', function (e) {
                if (window.matchMedia('(max-width: 899px)')   /* 必须与 style.css 的汉堡断点一致 */.matches) {
                    e.preventDefault();
                    a.parentNode.classList.toggle('is-open');
                }
            });
        });

        /* 点导航里的锚点后收起菜单 */
        nav.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function () {
                nav.classList.remove('is-open');
                toggle.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });

        /* 锚点定位时留出表头高度，避免标题被固定表头盖住 */
        function offsetAnchor() {
            if (!location.hash) { return; }
            var target = document.querySelector(location.hash);
            if (!target) { return; }
            var h = header ? header.offsetHeight : 0;
            window.scrollTo({
                top: target.getBoundingClientRect().top + window.pageYOffset - h - 12,
                behavior: 'smooth'
            });
        }
        document.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var id = a.getAttribute('href');
                if (id.length < 2) { return; }
                var target = document.querySelector(id);
                if (!target) { return; }
                e.preventDefault();
                history.replaceState(null, '', id);
                offsetAnchor();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
