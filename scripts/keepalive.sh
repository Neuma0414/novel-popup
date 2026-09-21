#!/usr/bin/env bash
# GitHub Actions 定时任务保活
#
# 为什么需要：
#   GitHub 规定「公开仓库在 60 天内没有任何仓库活动时，schedule 类型的 workflow
#   会被自动禁用」，且不会发出任何通知。一旦被禁用，Gitee → GitHub 方向的定时
#   同步就会静默停摆，只能人工去 Actions 页面重新启用。
#
# 做法：
#   当 main 上最后一次提交距今超过 THRESHOLD_DAYS（默认 45 天）时，更新心跳文件
#   并提交一次，使 60 天计时归零。因为 45 < 60，只要定时任务还活着，它就能把
#   自己不断续下去，形成自维持循环。
#
# 为什么不会自我触发：
#   推送到 GitHub 使用的是 Actions 内置的 GITHUB_TOKEN，它触发的 push 不会唤起
#   新的 workflow 运行，因此不会形成循环。
#
# 前置条件：
#   sync.sh 已成功执行，两端 main 一致；工作区干净。
#
# 用法：bash scripts/keepalive.sh
# 环境变量：
#   SYNC_BRANCH     分支名，默认 main
#   THRESHOLD_DAYS  空闲天数阈值，默认 45
#   FORCE           设为 true 时忽略空闲时长，强制插入一次心跳（用于验证）
#   KEEPALIVE_FILE  心跳文件路径，默认 .github/keepalive.txt
#
set -euo pipefail

BRANCH="${SYNC_BRANCH:-main}"
THRESHOLD_DAYS="${THRESHOLD_DAYS:-45}"
FORCE="${FORCE:-false}"
KEEPALIVE_FILE="${KEEPALIVE_FILE:-.github/keepalive.txt}"

report() {
  # 把结论回写给 Actions 用于生成 Summary；本地运行时会静默跳过
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "heartbeat=$1" >> "$GITHUB_ENV"
  fi
}

# ---------- 0. 安全检查 ----------
if [ -n "$(git status --porcelain)" ]; then
  echo "::error::工作区存在未提交改动，为避免覆盖已中止。请在干净的工作区中运行。" >&2
  exit 1
fi

git fetch --no-tags origin "$BRANCH"
git fetch --no-tags gitee "$BRANCH" 2>/dev/null || true

# 心跳的前提是两端已经一致，否则提交下去会把分叉带进 Gitee
if git rev-parse -q --verify "gitee/${BRANCH}" >/dev/null 2>&1; then
  GH_SHA=$(git rev-parse "origin/${BRANCH}")
  GT_SHA=$(git rev-parse "gitee/${BRANCH}")
  if [ "$GH_SHA" != "$GT_SHA" ]; then
    echo "::error::两端 ${BRANCH} 不一致（GitHub ${GH_SHA:0:8} / Gitee ${GT_SHA:0:8}），请先运行 scripts/sync.sh 对齐。" >&2
    exit 1
  fi
fi

# ---------- 1. 判断是否真的需要心跳 ----------
if [ "$FORCE" != "true" ]; then
  LAST_TS=$(git log -1 --format=%ct "origin/${BRANCH}")
  NOW_TS=$(date +%s)
  IDLE_DAYS=$(( (NOW_TS - LAST_TS) / 86400 ))
  echo "${BRANCH} 上最后一次提交距今 ${IDLE_DAYS} 天（阈值 ${THRESHOLD_DAYS} 天）"

  if [ "$IDLE_DAYS" -lt "$THRESHOLD_DAYS" ]; then
    echo "✅ 仓库近期有活动，无需心跳"
    report "未触发（空闲 ${IDLE_DAYS} 天，不足 ${THRESHOLD_DAYS} 天）"
    exit 0
  fi
  echo "⚠ 空闲已超过阈值，插入心跳以避免定时任务被 GitHub 自动禁用"
else
  echo "▶ 强制模式：跳过空闲时长判断"
fi

# ---------- 2. 把本地分支对齐到刚同步完的状态 ----------
git checkout -q -B "$BRANCH" "origin/${BRANCH}"

# ---------- 3. 写心跳文件并提交 ----------
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$KEEPALIVE_FILE" <<EOF
保活心跳文件
============

本文件由 GitHub Actions 的「条件心跳」步骤自动更新，请勿手动编辑。

为什么存在
----------
GitHub 规定：公开仓库在 60 天内没有任何仓库活动时，schedule 类型的 workflow
会被自动禁用，且不会发出任何通知。一旦被禁用，Gitee → GitHub 方向的定时同步
就会静默停摆，只能人工到 Actions 页面重新启用。

本文件每次被更新都会产生一次真实提交，使 60 天计时归零。心跳阈值设为 45 天，
早于 GitHub 的 60 天，因此只要定时任务还在运行，它就能不断把自己续下去。

最后心跳时间（UTC）：${NOW_ISO}
EOF

git add "$KEEPALIVE_FILE"
git commit -q -m "chore(sync): 保活心跳 ${NOW_ISO} [skip ci]"

# ---------- 4. 推送到两端，保持镜像一致 ----------
git push origin "HEAD:refs/heads/${BRANCH}"
git push gitee  "HEAD:refs/heads/${BRANCH}"

SHA=$(git rev-parse --short HEAD)
echo "✅ 心跳已提交并推送到两端：${SHA}"
report "已插入（${SHA}）"
