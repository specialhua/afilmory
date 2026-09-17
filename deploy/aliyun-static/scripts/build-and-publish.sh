#!/bin/bash
# 构建照片 manifest 与静态站点，发布到 OSS，并（可选）更新 photo-auth 函数。
# 由 webhook 调用，也可以手动执行：bash deploy/aliyun-static/scripts/build-and-publish.sh
#
# 整个流程包在 main 里：bash 会先读完函数再执行，
# 构建期间即使 git pull 改写了本文件，也不会执行到半新半旧的内容。

set -euo pipefail
shopt -s nullglob
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"
# 放在全局：EXIT trap 在 main 返回后才执行，局部变量那时已不可见
FC_BUILD_DIR=""

cleanup() {
  # 保留原退出码，否则 webhook 会把失败的构建记成成功
  local status=$?
  if [ -n "$FC_BUILD_DIR" ] && [ -d "$FC_BUILD_DIR" ]; then
    rm -rf "$FC_BUILD_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

main() {
  if [ -f "$DEPLOY_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$DEPLOY_DIR/.env"
    set +a
  fi

  if [ -z "${OSS_SITE_BUCKET:-}" ]; then
    log "错误：请在 deploy/aliyun-static/.env 中设置 OSS_SITE_BUCKET，例如 oss://my-site-bucket"
    exit 1
  fi
  local site_bucket="$OSS_SITE_BUCKET"
  local auto_deploy_fc="${AUTO_DEPLOY_FC:-1}"
  local build_log_dir="${BUILD_LOG_DIR:-/tmp/afilmory-build-logs}"
  local manifest_path="$PROJECT_DIR/apps/web/src/data/photos-manifest.json"
  local dist_dir="$PROJECT_DIR/apps/web/dist"
  local fc_photo_auth_dir="$PROJECT_DIR/fc/photo-auth"
  local fc_manifest_api_dir="$PROJECT_DIR/fc/manifest-api"
  local deploy_fc_script="$SCRIPT_DIR/deploy-fc-function.sh"
  local manifest_api_function="${FC_MANIFEST_API_FUNCTION_NAME:-}"
  mkdir -p "$build_log_dir"

  run_step() {
    local step_name="$1"
    local log_name="$2"
    shift 2

    local log_file="$build_log_dir/$log_name"
    log "开始：$step_name"
    if "$@" >"$log_file" 2>&1; then
      log "成功：$step_name"
    else
      log "失败：$step_name"
      log "最近日志（${log_name}）："
      tail -n 30 "$log_file" | while IFS= read -r line; do
        log "  $line"
      done
      exit 1
    fi
  }

  # ossutil 2.x：--content-type / --cache-control 直接在上传时写入
  upload_file() {
    local local_path="$1"
    local remote_path="$2"
    shift 2
    ossutil cp "$local_path" "$remote_path" -f --no-progress "$@" >/dev/null
    log "上传完成：$(basename "$local_path")"
  }

  set_props() {
    local remote_path="$1"
    shift
    if ossutil set-props "$remote_path" "$@" --metadata-directive update -f >/dev/null 2>&1; then
      log "元数据已更新：$(basename "$remote_path")"
    else
      log "元数据更新失败：$remote_path"
    fi
  }

  log "=========================================="
  log "开始自动构建 Afilmory（私有原图模式）"
  log "=========================================="

  if ! ossutil version 2>/dev/null | grep -q '^2\.'; then
    log "错误：需要 ossutil 2.x，当前：$(ossutil version 2>&1 | head -n 1)"
    exit 1
  fi

  cd "$PROJECT_DIR"

  if [ -f .env ]; then
    log "加载项目环境变量"
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  else
    log "警告：项目根目录 .env 不存在，继续执行"
  fi

  run_step "运行 Builder 处理照片" "build-manifest.log" pnpm run build:manifest -- --no-ui

  if [ ! -f "$manifest_path" ]; then
    log "错误：找不到 manifest 文件：$manifest_path"
    exit 1
  fi
  log "已生成 manifest"

  run_step "构建静态站点" "build-web.log" pnpm --filter web build

  if [ ! -d "$dist_dir" ]; then
    log "错误：dist 目录不存在：$dist_dir"
    exit 1
  fi
  log "已生成静态资源"

  log "准备临时函数目录"
  FC_BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/afilmory-fc-build.XXXXXX")"

  # 两个函数都在冷启动时读取同目录下的 manifest.photos.json，
  # 所以每次构建都要把最新 manifest 打进代码包重新上传
  package_fc_function() {
    local label="$1"
    local source_dir="$2"

    if [ ! -d "$source_dir" ]; then
      log "错误：找不到函数源码目录：$source_dir"
      exit 1
    fi

    local stage_dir="$FC_BUILD_DIR/stage-$label"
    mkdir -p "$stage_dir"
    cp -R "$source_dir"/. "$stage_dir"/
    cp "$manifest_path" "$stage_dir/manifest.photos.json"
    (cd "$stage_dir" && run_step "打包函数 ZIP $label" "build-fc-zip-$label.log" zip -rq "$FC_BUILD_DIR/$label.zip" .)
  }

  package_fc_function photo-auth "$fc_photo_auth_dir"
  if [ -n "$manifest_api_function" ]; then
    package_fc_function manifest-api "$fc_manifest_api_dir"
  else
    log "跳过打包 manifest-api：未设置 FC_MANIFEST_API_FUNCTION_NAME"
  fi

  for dir in assets vendor thumbnails; do
    if [ -d "$dist_dir/$dir" ]; then
      run_step "发布 $dir 到 OSS" "sync-$dir.log" ossutil sync "$dist_dir/$dir/" "$site_bucket/$dir/" -f --delete --no-progress
    fi
  done

  for wasm_file in "$dist_dir"/assets/*.wasm; do
    set_props "$site_bucket/assets/$(basename "$wasm_file")" --content-type application/wasm
  done

  # 根目录文件全部上传（index.html、sw.js、favicon、og-image、sitemap 等），
  # 不维护固定清单，避免构建新增文件时漏传。入口与 Service Worker 相关文件禁用缓存。
  log "上传根目录静态文件"
  local no_cache='no-cache, no-store, must-revalidate'
  local file name
  for file in "$dist_dir"/*; do
    [ -f "$file" ] || continue
    name="$(basename "$file")"
    case "$name" in
      index.html)
        upload_file "$file" "$site_bucket/$name" --content-type text/html --cache-control "$no_cache"
        ;;
      sw.js | registerSW.js | workbox-*.js)
        upload_file "$file" "$site_bucket/$name" --content-type application/javascript --cache-control "$no_cache"
        ;;
      manifest.webmanifest)
        upload_file "$file" "$site_bucket/$name" --content-type application/manifest+json --cache-control "$no_cache"
        ;;
      *)
        upload_file "$file" "$site_bucket/$name"
        ;;
    esac
  done

  if [ "$auto_deploy_fc" = "1" ]; then
    run_step "自动部署函数 photo-auth" "deploy-fc-photo-auth.log" \
      env ZIP_PATH="$FC_BUILD_DIR/photo-auth.zip" FC_FUNCTION_NAME="${FC_FUNCTION_NAME:-}" bash "$deploy_fc_script"

    if [ -n "$manifest_api_function" ]; then
      run_step "自动部署函数 manifest-api" "deploy-fc-manifest-api.log" \
        env ZIP_PATH="$FC_BUILD_DIR/manifest-api.zip" FC_FUNCTION_NAME="$manifest_api_function" bash "$deploy_fc_script"
    fi
  else
    log "跳过自动部署：AUTO_DEPLOY_FC=$auto_deploy_fc"
  fi

  log "=========================================="
  log "构建并发布完成"
  log "=========================================="
}

main "$@"
exit 0
