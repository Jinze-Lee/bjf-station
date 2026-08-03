/* ==========================================================================
 * 完整数据集解锁
 *
 * 站点公开的只有最近 7 天。完整数据集放在 data/full.enc，AES-256-GCM 加密，
 * 口令从不出现在任何代码或文件里 —— 只在访客手动输入时存在于他自己的浏览器里。
 *
 * 为什么这样能防住扒站
 * --------------------
 * 这是纯静态托管，没有服务端，凡是发布的文件谁都能按 URL 下载。所以
 * 「藏起来」是没用的（密钥写在 JS 里，扒下来就解了）。这里的做法是
 * **公开的那份本来就只有 7 天**，完整那份是密文 —— 扒走 data/full.enc
 * 得到的是 218 KB 随机字节。
 *
 * 诚实的边界
 * ----------
 * 1. 密文他能永久保存，可以离线慢慢跑字典。所以口令必须够长，
 *    发布脚本默认生成 24 位随机串（约 143 bit 熵）。PBKDF2 60 万轮
 *    只是把他每次尝试的成本乘一个常数，真正顶用的是口令本身的熵。
 * 2. 解锁之后数据就在这个浏览器里了，他要存下来无法阻止。
 *    这道闸拦的是**匿名批量抓取**，不是拿到授权的人。
 *
 * 解密流程（与 工具/发布数据.py 严格对应）
 * ----------------------------------------
 *   口令 ──PBKDF2-SHA256（轮数与盐从文件头读）──► 256 位密钥
 *   密文 ──AES-256-GCM 解密──► gzip 字节 ──DecompressionStream──► JSON
 *
 * 口令错误不需要单独判断：GCM 自带认证标签，密钥不对时 decrypt 直接抛错。
 *
 * 对外句柄：window.Unlock = { isUnlocked(), unlock(pass), lock() }
 * ========================================================================== */

(function () {
    'use strict';

    var ENC_URL = 'data/full.enc';
    var MAGIC = 'BFERSENC';
    var SS_KEY = 'bfers-unlock';     /* sessionStorage：本次会话内刷新不用重输 */

    var unlocked = false;
    var busy = false;

    function t(k) { return window.Lang ? Lang.t(k) : k; }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* --- 环境能力检查 -----------------------------------------------------
     * Web Crypto 要求安全上下文（HTTPS 或 localhost）；DecompressionStream
     * 是 Chrome 80+/Firefox 113+/Safari 16.4+。缺哪个都要**明说**，
     * 而不是让访客对着一个输入不进去的框猜自己哪里做错了。 */
    function capability() {
        if (!window.isSecureContext || !window.crypto || !crypto.subtle) {
            return 'insecure';
        }
        if (typeof DecompressionStream === 'undefined') { return 'nogzip'; }
        return 'ok';
    }

    /* --- 解密 ------------------------------------------------------------- */

    async function deriveKey(pass, salt, iters) {
        var base = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: iters, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }

    async function gunzip(buf) {
        var ds = new DecompressionStream('gzip');
        var stream = new Blob([buf]).stream().pipeThrough(ds);
        return new Response(stream).text();
    }

    async function fetchAndDecrypt(pass) {
        var res = await fetch(ENC_URL, { cache: 'force-cache' });
        if (!res.ok) { throw new Error('fetch ' + res.status); }
        var buf = new Uint8Array(await res.arrayBuffer());

        /* 文件头：magic(8) version(1) iters(u32 小端) salt(16) iv(12) */
        var magic = new TextDecoder().decode(buf.slice(0, 8));
        if (magic !== MAGIC) { throw new Error('bad magic: ' + magic); }
        var view = new DataView(buf.buffer, buf.byteOffset);
        var version = view.getUint8(8);
        if (version !== 1) { throw new Error('unsupported version ' + version); }
        var iters = view.getUint32(9, true);
        var salt = buf.slice(13, 29);
        var iv = buf.slice(29, 41);
        var body = buf.slice(41);

        var key = await deriveKey(pass, salt, iters);
        /* 口令不对时这里抛 OperationError —— GCM 的认证标签对不上。
         * 不需要我们自己比对什么，也没有「部分解开」这种中间状态。 */
        var packed = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv }, key, body);

        return JSON.parse(await gunzip(packed));
    }

    /* --- 把解开的数据接进页面 --------------------------------------------- */

    function apply(full) {
        window.OBS_META = full.meta;
        window.OBS_FD = full.fd;
        window.OBS_RAD = full.rad;
        window.ENV_META = full.envMeta;
        window.ENV_VARS = full.envVars;
        window.ENV_DATA = full.env;

        /* 两张图都要重建：setData 只换得了当前序列的点，
         * 换不掉「哪些树有数据」「时间轴到哪一天」。 */
        if (window.SiteChart && SiteChart.reload) { SiteChart.reload(); }
        if (window.EnvChart && EnvChart.reload) { EnvChart.reload(); }
        /* 下拉框里「本批无数据」的标注要按新数据重算 */
        document.dispatchEvent(new CustomEvent('lazy:chart'));
    }

    /* --- 提示条 ------------------------------------------------------------ */

    function fmtDate(ms) {
        var off = (window.OBS_META && OBS_META.timezoneOffsetMin) || 480;
        var d = new Date(ms + off * 60000);
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    }

    function fmtNum(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function paint() {
        var box = document.getElementById('unlockBar');
        if (!box) { return; }

        var meta = window.OBS_META || {};

        if (unlocked) {
            var span = (meta.full && meta.full.span) || meta.span || [0, 0];
            box.className = 'unlock-bar is-unlocked';
            box.innerHTML =
                '<div class="ub-text">' +
                    '<strong>' + esc(t('unlock.doneTitle')) + '</strong> ' +
                    esc(t('unlock.doneBody')
                        .replace('{from}', fmtDate(span[0]))
                        .replace('{to}', fmtDate(span[1]))
                        .replace('{points}', fmtNum(meta.points || 0))) +
                '</div>' +
                '<button type="button" class="ub-btn ub-ghost" id="unlockLock">' +
                    esc(t('unlock.relock')) + '</button>';
            document.getElementById('unlockLock')
                    .addEventListener('click', function () { lock(); });
            return;
        }

        var pub = meta.public || {};
        var fl = meta.full || {};
        box.className = 'unlock-bar';
        box.innerHTML =
            '<div class="ub-text">' +
                '<strong>' + esc(t('unlock.title').replace('{days}', pub.days || 7)) +
                '</strong> ' +
                esc(t('unlock.body')
                    .replace('{days}', String(fl.days || '—'))
                    .replace('{points}', fmtNum(fl.points || 0))) +
            '</div>' +
            '<form class="ub-form" id="unlockForm" autocomplete="off">' +
                '<input type="password" class="ub-input" id="unlockInput"' +
                    ' placeholder="' + esc(t('unlock.placeholder')) + '"' +
                    ' autocomplete="off" spellcheck="false" />' +
                '<button type="submit" class="ub-btn" id="unlockGo">' +
                    esc(t('unlock.go')) + '</button>' +
            '</form>' +
            '<p class="ub-msg" id="unlockMsg" role="status"></p>';

        document.getElementById('unlockForm')
                .addEventListener('submit', function (e) {
            e.preventDefault();
            unlock(document.getElementById('unlockInput').value);
        });
    }

    function say(text, kind) {
        var el = document.getElementById('unlockMsg');
        if (!el) { return; }
        el.textContent = text;
        el.className = 'ub-msg' + (kind ? ' ub-' + kind : '');
    }

    /* --- 主流程 ------------------------------------------------------------ */

    async function unlock(pass, quiet) {
        if (busy || unlocked) { return false; }
        pass = (pass || '').trim();
        if (!pass) { say(t('unlock.empty'), 'err'); return false; }

        var cap = capability();
        if (cap !== 'ok') {
            say(t(cap === 'insecure' ? 'unlock.insecure' : 'unlock.nogzip'), 'err');
            return false;
        }

        busy = true;
        var go = document.getElementById('unlockGo');
        if (go) { go.disabled = true; }
        /* PBKDF2 60 万轮要跑一两秒，必须给反馈，否则看着像点了没反应 */
        if (!quiet) { say(t('unlock.working'), 'busy'); }

        try {
            var full = await fetchAndDecrypt(pass);
            unlocked = true;
            apply(full);
            try { sessionStorage.setItem(SS_KEY, pass); } catch (e) { /* 隐私模式 */ }
            paint();
            return true;
        } catch (err) {
            /* 分清「口令错」和「文件没取到」——
             * 两者的处置完全不同，混成一句话会让人白试很多次。 */
            var net = /fetch|magic|version/i.test(String(err && err.message));
            if (!quiet) { say(t(net ? 'unlock.failFetch' : 'unlock.failPass'), 'err'); }
            try { sessionStorage.removeItem(SS_KEY); } catch (e) { /* 同上 */ }
            return false;
        } finally {
            busy = false;
            var g = document.getElementById('unlockGo');
            if (g) { g.disabled = false; }
        }
    }

    function lock() {
        try { sessionStorage.removeItem(SS_KEY); } catch (e) { /* 同上 */ }
        /* 内存里的完整数据没法「收回」—— 已经在这个页面里了。
         * 干脆重新载入页面，回到只有公开窗口的干净状态。 */
        location.reload();
    }

    function init() {
        /* 提示条挂在图表区下方，由 index.html 里的 #unlockBar 占位 */
        paint();
        if (window.Lang) { Lang.onChange(paint); }

        /* 本次会话内已经解过锁：静默重放，别让人每次刷新都重输 */
        var saved = null;
        try { saved = sessionStorage.getItem(SS_KEY); } catch (e) { /* 同上 */ }
        if (saved) { unlock(saved, true); }

        window.Unlock = {
            isUnlocked: function () { return unlocked; },
            unlock: unlock,
            lock: lock
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
