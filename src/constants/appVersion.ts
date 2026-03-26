/**
 * 앱 버전 중앙 관리 — 단일 소스: package.json
 * 버전 변경 시 package.json의 "version" 필드만 수정하면 전체 반영
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json');

export const APP_VERSION: string = version;                                           // "11.0.0"
export const APP_VERSION_DISPLAY = `v${APP_VERSION.split('.').slice(0, 2).join('.')}`; // "v11.0"
export const ENGINE_NAME = 'Triple Engine';
export const ENGINE_SUMMARY = `${ENGINE_NAME} ${APP_VERSION_DISPLAY} — EV 3게임 + Hybrid 2게임`;
