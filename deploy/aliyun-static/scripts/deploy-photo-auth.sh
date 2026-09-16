#!/bin/bash
# 用阿里云 CLI 更新 photo-auth 函数代码。
# 由 build-and-publish.sh 调用；单独使用时需要传入 ZIP_PATH。

set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

# 全局变量：EXIT trap 在 main 返回后执行
TMP_DIR=""
cleanup() {
  # 保留原退出码，否则 webhook 会把失败的构建记成成功
  local status=$?
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

main() {
  local name
  for name in ZIP_PATH ALIYUN_REGION FC_FUNCTION_NAME; do
    if [ -z "${!name:-}" ]; then
      log "错误：缺少环境变量 ${name}（ZIP_PATH 由构建脚本传入，其余在 deploy/aliyun-static/.env 中设置）"
      exit 1
    fi
  done
  local zip_path="$ZIP_PATH"
  local region="$ALIYUN_REGION"
  local function_name="$FC_FUNCTION_NAME"
  local profile="${ALIYUN_PROFILE:-default}"
  local cli_bin="${ALIYUN_CLI_BIN:-aliyun}"

  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/afilmory-fc-deploy.XXXXXX")"

  if [ ! -f "$zip_path" ]; then
    log "错误：找不到函数 ZIP：$zip_path"
    exit 1
  fi

  if ! command -v "$cli_bin" >/dev/null 2>&1; then
    log "错误：未安装阿里云 CLI，请先安装 aliyun 命令"
    exit 1
  fi

  if ! "$cli_bin" configure list --profile "$profile" >/dev/null 2>&1; then
    log "错误：未找到阿里云 CLI 配置 profile=$profile"
    exit 1
  fi

  if ! "$cli_bin" fc --help >/dev/null 2>&1; then
    log "错误：未安装 fc 插件，请先执行：aliyun plugin install --names fc"
    exit 1
  fi

  log "准备函数代码包"
  local payload_path="$TMP_DIR/update-function-body.json"
  printf '{"code":{"zipFile":"%s"}}' "$(base64 -w 0 "$zip_path")" >"$payload_path"

  log "开始更新函数代码：$function_name"
  if ! "$cli_bin" fc update-function \
    --profile "$profile" \
    --region "$region" \
    --function-name "$function_name" \
    --body "$(cat "$payload_path")" >"$TMP_DIR/update.out" 2>"$TMP_DIR/update.err"; then
    log "错误：函数更新失败"
    tail -n 30 "$TMP_DIR/update.err" | while IFS= read -r line; do
      log "  $line"
    done
    log "提示：请先执行 aliyun fc update-function --help 确认本机插件参数格式"
    exit 1
  fi

  log "函数代码更新成功：$function_name"
}

main "$@"
