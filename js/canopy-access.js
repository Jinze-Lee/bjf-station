/* 三维展示口令入口。仅控制静态页面的展示，不替代服务端数据访问权限。 */
(function () {
    'use strict';
    var required = location.hostname === 'jinze-lee.github.io';
    var granted = !required;
    try {
        if (required && window.parent !== window && window.parent.location.origin === location.origin) {
            granted = !!(window.parent.CanopyAccess && window.parent.CanopyAccess.isUnlocked());
        }
    } catch (e) { /* 独立页面使用自己的口令入口 */ }
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });
    if (granted) { resolveReady(); }
    else { document.documentElement.classList.add('canopy-locked'); }
    var busy = false;
    var message = '';
    var words = {
        zh: { title: '三维林相 · 访问验证', body: '输入访问密码，查看林相点云与设备报警。', label: '访问密码', show: '显示密码', open: '验证并打开三维林相', working: '正在验证…', empty: '请输入访问密码。', wrong: '密码不正确，请重新输入。', unavailable: '验证暂不可用，请刷新后重试。', loading: '正在加载三维场景…', failure: '场景加载失败，请刷新后重试。', back: '← 返回网站', noscript: '请启用 JavaScript 后访问三维林相。' },
        en: { title: '3D canopy · Access', body: 'Enter the access password to explore the point cloud and device alerts.', label: 'Access password', show: 'Show password', open: 'Unlock the 3D canopy', working: 'Verifying…', empty: 'Enter the access password.', wrong: 'Incorrect password. Please try again.', unavailable: 'Verification is unavailable. Please refresh and retry.', loading: 'Loading the 3D scene…', failure: 'The scene could not load. Please refresh and retry.', back: '← Back to website', noscript: 'Enable JavaScript to view the 3D canopy.' }
    };
    function language() {
        if (window.Lang) { return Lang.current; }
        try { return localStorage.getItem('bfers-3d-lang') || 'zh'; } catch (e) { return 'zh'; }
    }
    function t(key) { return (words[language()] || words.zh)[key]; }
    function paint() {
        var box = document.getElementById('canopyGate');
        if (!box) { return; }
        box.hidden = granted;
        box.querySelectorAll('[data-access-text]').forEach(function (el) { el.textContent = t(el.getAttribute('data-access-text')); });
        var status = box.querySelector('[role="status"]');
        status.textContent = message ? t(message) : '';
        var button = box.querySelector('button[type="submit"]');
        button.disabled = busy;
        button.textContent = t(busy ? 'working' : 'open');
    }
    function allow() {
        if (granted) { return; }
        granted = true;
        document.documentElement.classList.remove('canopy-locked');
        paint();
        resolveReady();
        document.dispatchEvent(new CustomEvent('canopy:unlocked'));
    }
    async function submit(e) {
        e.preventDefault();
        if (busy) { return; }
        var input = document.getElementById('canopyPassword');
        var pass = input.value;
        input.removeAttribute('aria-invalid');
        if (!pass) { message = 'empty'; paint(); input.focus(); return; }
        busy = true; message = ''; paint();
        try {
            var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
            var bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('bfers-canopy-access-v1'), iterations: 210000}, key, 256);
            var hash = Array.from(new Uint8Array(bits)).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
            if (hash === 'fa09d4edbfa57474c8daaaf4eeef5dc8e3685702a5a8866608756a1bed3a0693') {
                input.value = ''; allow();
                var load = document.getElementById('canopyLoad');
                if (load) { load.focus({preventScroll: true}); }
            } else { message = 'wrong'; input.setAttribute('aria-invalid', 'true'); input.focus(); }
        } catch (err) { message = 'unavailable'; }
        finally { pass = ''; busy = false; paint(); }
    }
    function init() {
        var box = document.getElementById('canopyGate');
        if (!box) { return; }
        box.innerHTML = '<span class="canopy-gate-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z"/><path d="M12 14v3"/></svg></span>' +
            '<div class="canopy-gate-copy"><h4 data-access-text="title"></h4><p data-access-text="body"></p>' +
            '<form id="canopyAccessForm"><label for="canopyPassword" data-access-text="label"></label><div class="canopy-gate-fields"><input id="canopyPassword" type="password" autocomplete="off" required aria-describedby="canopyAccessStatus"><button type="submit"></button></div>' +
            '<label class="canopy-password-show"><input type="checkbox" id="canopyShowPassword"><span data-access-text="show"></span></label><p id="canopyAccessStatus" role="status" aria-live="polite"></p></form></div>';
        if (document.getElementById('canopyScene')) {
            var back = document.createElement('a');
            back.className = 'canopy-gate-back'; back.href = '../index.html#canopy'; back.setAttribute('data-access-text', 'back');
            box.querySelector('.canopy-gate-copy').appendChild(back);
        }
        box.querySelector('form').addEventListener('submit', submit);
        box.querySelector('#canopyShowPassword').addEventListener('change', function (e) { box.querySelector('#canopyPassword').type = e.target.checked ? 'text' : 'password'; });
        paint();
        if (window.Lang) { Lang.onChange(paint); }
    }
    /* 场景放在 template 中：未验证前脚本、JSON 和点云均不会加载。按原顺序执行以保留全局变量。 */
    async function mountScene() {
        await ready;
        var template = document.getElementById('canopyScene');
        var loading = document.getElementById('canopySceneStatus');
        loading.hidden = false; loading.textContent = t('loading');
        try {
            var fragment = template.content.cloneNode(true);
            var scripts = Array.from(fragment.querySelectorAll('script')).map(function (script) {
                var slot = document.createComment('canopy-script');
                var item = {attributes: Array.from(script.attributes).map(function (a) { return {name: a.name, value: a.value}; }), src: script.getAttribute('src'), text: script.textContent, slot: slot};
                script.replaceWith(slot);
                return item;
            });
            document.body.appendChild(fragment);
            for (var i = 0; i < scripts.length; i++) {
                var old = scripts[i];
                var script = document.createElement('script');
                old.attributes.forEach(function (attr) { script.setAttribute(attr.name, attr.value); });
                if (old.src) {
                    await new Promise(function (resolve, reject) {
                        script.async = false; script.onload = resolve; script.onerror = reject;
                        old.slot.replaceWith(script);
                    });
                } else { script.textContent = old.text; old.slot.replaceWith(script); }
            }
            template.remove(); loading.hidden = true;
        } catch (err) { loading.textContent = t('failure'); }
    }
    window.CanopyAccess = { isUnlocked: function () { return granted; }, whenUnlocked: function () { return ready; }, mountScene: mountScene };
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
}());
