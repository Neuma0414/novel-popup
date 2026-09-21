#!/usr/bin/env bash
# GitHub ⇄ Gitee 双向同步核心逻辑
#
# 前置条件：
#   - 当前目录是已检出完整历史的 git 工作区
#   - 远端 origin 指向 GitHub，远端 gitee 指向 Gitee
#
# 用法：bash scripts/sync.sh
# 可选环境变量：
#   SYNC_BRANCH   要同步的分支，默认 main
#   GITHUB_ENV    由 GitHub Actions 注入；本地运行时不存在，仅跳过结果回写
#
set -euo pipefail

BRANCH="${SYNC_BRANCH:-main}"

report() {
  # 把同步结论回写给 Actions，用于生成 Summary；本地运行时会静默跳过
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "direction=$1" >> "$GITHUB_ENV"
  fi
  echo "【同步结论】$1"
}

# ---------- 1. 取两端当前提交 ----------
git fetch --no-tags origin "$BRANCH"
GH=$(git rev-parse "origin/${BRANCH}")

GT=""
if git fetch --no-tags gitee "$BRANCH" 2>/dev/null; then
  GT=$(git rev-parse "gitee/${BRANCH}")
else
  echo "::warning::无法读取 gitee/${BRANCH}（仓库不存在或为空）"
fi

if [ -z "$GT" ]; then
  echo "▶ Gitee 侧尚无 ${BRANCH} 分支，执行初始化推送"
  git push --force --tags gitee "$GH:refs/heads/${BRANCH}"
  report "github→gitee（初始化）"
  exit 0
fi

echo "GitHub ${BRANCH} = ${GH:0:8}"
echo "Gitee  ${BRANCH} = ${GT:0:8}"

# ---------- 2. 两端一致 ----------
if [ "$GH" = "$GT" ]; then
  echo "✅ 两端已一致，无需任何操作"
  report "无（已一致）"
  exit 0
fi

# ---------- 3. GitHub 领先 ----------
if git merge-base --is-ancestor "$GT" "$GH"; then
  echo "▶ GitHub 领先 Gitee，执行 GitHub → Gitee"
  git push --force --tags gitee "$GH:refs/heads/${BRANCH}"
  report "github→gitee"
  exit 0
fi

# ---------- 4. Gitee 领先 ----------
if git merge-base --is-ancestor "$GH" "$GT"; then
  echo "▶ Gitee 领先 GitHub，执行 Gitee → GitHub（快进）"
  git push --tags origin "$GT:refs/heads/${BRANCH}"
  report "gitee→github"
  exit 0
fi

# ---------- 5. 两端分叉：优先合并，冲突时以较新的一端为准 ----------
echo "⚠ 两端已分叉，尝试三方合并以保留双方提交"
if git merge --no-edit -m "chore(sync): 合并 GitHub 与 Gitee 的并行提交 [skip ci]" "$GT"; then
  echo "✅ 合并成功，双方提交均已保留"
  git push --tags origin "HEAD:refs/heads/${BRANCH}"
  git push --force --tags gitee "HEAD:refs/heads/${BRANCH}"
  report "分叉→合并"
  exit 0
fi

echo "::warning::合并产生冲突，回退为「以较新的一端为准」的覆盖式同步，请事后确认是否需要人工恢复。"
git merge --abort || true

GH_T=$(git log -1 --format=%ct "$GH")
GT_T=$(git log -1 --format=%ct "$GT")
echo "GitHub 最新提交时间戳 = $GH_T / Gitee 最新提交时间戳 = $GT_T"

if [ "$GH_T" -ge "$GT_T" ]; then
  echo "▶ GitHub 侧更新，覆盖 Gitee"
  git push --force --tags gitee "$GH:refs/heads/${BRANCH}"
  report "分叉→以 GitHub 为准覆盖"
else
  echo "▶ Gitee 侧更新，覆盖 GitHub"
  git push --force --tags origin "$GT:refs/heads/${BRANCH}"
  report "分叉→以 Gitee 为准覆盖"
fi
