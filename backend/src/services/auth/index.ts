/**
 * 统一认证服务导出
 */

export { credentialStore } from './credentialStore.js';
// 各平台函数单独导出，避免类型命名冲突
export {
  getWechatStatus,
  saveWechatCredential,
  deleteWechatCredential,
  verifyWechatCredential,
} from './platforms/wechatAuth.js';
export {
  getWeiboStatus,
  startWeiboSession,
  getWeiboSession,
  cancelWeiboSession,
  saveWeiboCredential,
  deleteWeiboCredential,
} from './platforms/weiboAuth.js';
export {
  getXStatus,
  saveXCredential,
  deleteXCredential,
} from './platforms/xAuth.js';
export {
  getXiaohongshuStatus,
  startXiaohongshuSession,
  getXiaohongshuSession,
  cancelXiaohongshuSession,
  saveXiaohongshuCredential,
  deleteXiaohongshuCredential,
} from './platforms/xiaohongshuAuth.js';
export {
  getZhihuStatus,
  saveZhihuCredential,
  deleteZhihuCredential,
} from './platforms/zhihuAuth.js';
