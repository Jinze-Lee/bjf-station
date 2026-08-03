# =============================================================================
# 一键发布更新
#
# 干什么：把本地改动（新数据、改文案、换图片）推到线上网站。
#
# 怎么用：在 PowerShell 里跑
#     powershell -ExecutionPolicy Bypass -File "E:\网页制作\工具\发布更新.ps1"
#
# 想先看看会改什么、暂时不推：
#     ... -File "E:\网页制作\工具\发布更新.ps1" -DryRun
#
# 跳过验收测试（不建议，除非确定只改了文字）：
#     ... -File "E:\网页制作\工具\发布更新.ps1" -SkipTest
#
# 它做这几步：
#     1. 列出改了哪些文件，让你确认
#     2. 起本地服务器，跑 159 项验收测试 —— 不过就停下，不会把坏页面推上线
#     3. 提交并推送
#     4. 等 GitHub 构建完成，报告线上状态
#
# 推送后约 30 秒 ~ 2 分钟线上生效。浏览器看不到变化就强制刷新（Ctrl+F5）。
# =============================================================================

param(
    [string]$Message = "",      # 提交说明；不填会按改动内容自动生成
    [switch]$DryRun,            # 只看不推
    [switch]$SkipTest           # 跳过验收测试
)

$ErrorActionPreference = "Stop"
$REPO = "E:\网页制作"
$PORT = 8765

function Say($t)  { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  $t" -ForegroundColor Yellow }
function Bad($t)  { Write-Host "  $t" -ForegroundColor Red }

# --- 1. 有什么改动 -----------------------------------------------------------
Say "改动清单"
$changed = git -C $REPO status --porcelain
if (-not $changed) {
    Warn "没有任何改动，不需要发布。"
    exit 0
}
$changed | ForEach-Object { Write-Host "  $_" }
$n = ($changed | Measure-Object).Count
Ok "共 $n 项改动"

if ($DryRun) {
    Warn "DryRun 模式，到此为止，没有提交也没有推送。"
    exit 0
}

# --- 2. 验收测试 -------------------------------------------------------------
# 先在本地跑一遍。本地不过就绝不推上线 —— 线上挂了比晚发布几分钟糟糕得多。
if (-not $SkipTest) {
    Say "验收测试（本地）"

    $server = Start-Process -FilePath "python" `
        -ArgumentList "-m","http.server",$PORT,"--directory",$REPO `
        -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3

    try {
        $env:SITE_URL = "http://127.0.0.1:$PORT/index.html"
        $failed = $false
        $total  = 0

        foreach ($t in @("验收测试.py", "验收测试_页面.py")) {
            Write-Host "  跑 $t ..." -NoNewline
            $out = & python (Join-Path $REPO "工具\$t") 2>&1 | Out-String
            if ($out -match "全部通过") {
                $line = ($out -split "`n" | Select-String "^结果:").ToString().Trim()
                # 从 "结果: 142/142 通过" 里取通过数，累加成总项数
                if ($line -match '结果:\s*(\d+)/') { $total += [int]$Matches[1] }
                Write-Host "  $line" -ForegroundColor Green
            } else {
                Write-Host ""
                Bad "$t 未通过："
                ($out -split "`n" | Select-String "FAIL") | ForEach-Object { Bad "    $_" }
                $failed = $true
            }
        }
    } finally {
        # 无论测试结果如何都要收掉服务器，否则端口一直被占着
        if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
        Remove-Item Env:\SITE_URL -ErrorAction SilentlyContinue
    }

    if ($failed) {
        Bad "验收未通过，已中止发布。修好再跑一次。"
        Bad "（确实想强推：加 -SkipTest 参数，但请想清楚。）"
        exit 1
    }
    # 不要在这里写死项数 —— 加了新断言就会对不上（曾经写着 159，实际已是 177）
    Ok "验收全部通过（$total 项）"
} else {
    Warn "已跳过验收测试（-SkipTest）"
}

# --- 3. 提交并推送 -----------------------------------------------------------
Say "提交并推送"

if (-not $Message) {
    # 没写说明就按改动的目录猜一个，省得每次都要想措辞
    $touched = ($changed | ForEach-Object { ($_ -replace '^...','') -split '/' | Select-Object -First 1 } |
                Sort-Object -Unique) -join ", "
    $Message = "update: $touched"
}

git -C $REPO add -A
git -C $REPO commit -q -m $Message
Ok "已提交：$Message"

git -C $REPO push -q origin main
if ($LASTEXITCODE -ne 0) {
    Bad "推送失败。最常见原因是代理：本仓库的 http.proxy 指向的端口没在跑。"
    Bad "查看当前设置：git -C `"$REPO`" config --get http.proxy"
    exit 1
}
Ok "已推送到 GitHub"

# --- 4. 等构建 ---------------------------------------------------------------
Say "等 GitHub 构建"
Write-Host "  " -NoNewline
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 6
    $st = (gh api repos/Jinze-Lee/bjf-station/pages --jq '.status' 2>$null)
    if ($st -eq "built") {
        Write-Host ""
        Ok "构建完成"
        $url = (gh api repos/Jinze-Lee/bjf-station/pages --jq '.cname // .html_url' 2>$null)
        Ok "线上地址：$url"
        Write-Host "`n  浏览器里看不到变化就按 Ctrl+F5 强制刷新。`n"
        exit 0
    }
    Write-Host "." -NoNewline
}
Write-Host ""
Warn "构建还没结束（已等 3 分钟）。通常再等一会就好，可以去仓库的 Actions 页面看进度。"
