/**
 * need_more_jlu - 全局核心常量与配置清单
 * 集中管理所有网络端点、WebVPN Hash 路由、教务排课时段及系统默认值，杜绝分散硬编码。
 */

// ============================================================================
// 1. 网络超时与网关 Hash 配置
// ============================================================================

export const DEFAULT_TIMEOUT_MS = 5000;
export const PROBE_TIMEOUT_MS = 4500;
export const PROBE_CACHE_TTL_MS = 30000; // 30 秒缓存探测状态

export const WEBVPN_HASH = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
export const OA_WEBVPN_HASH = '/https/48714f71342f7a336d582f7e2857373750cd3d1004df80a0b5971c1b1a';

// ============================================================================
// 2. 双通道定义（校园网直连 vs 校外 WebVPN 网关）
// ============================================================================

export const CHANNELS = {
  DIRECT: {
    id: 'DIRECT',
    name: '校园网直连',
    probeUrl: 'https://oa.jlu.edu.cn/defaultroot/PortalInformation!jldxList.action?channelId=179577',
    apiUrl: 'https://iedu.jlu.edu.cn/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do',
    referer: 'https://iedu.jlu.edu.cn/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en',
    origin: 'https://iedu.jlu.edu.cn',
    oaUrl: 'https://oa.jlu.edu.cn/defaultroot/PortalInformation!jldxList.action?channelId=179577',
    authUrl: 'https://cas.jlu.edu.cn/tpass/login?service=https%3A%2F%2Fiedu.jlu.edu.cn%2Fjwapp%2Fsys%2Fkxjas%2F*default%2Findex.do%3FTHEME%3Dpurple%26EMAP_LANG%3Den'
  },
  WEBVPN: {
    id: 'WEBVPN',
    name: '校外 WebVPN 网关',
    probeUrl: 'https://vpn.jlu.edu.cn/',
    apiUrl: `https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do?vpn-12-o2-iedu.jlu.edu.cn`,
    referer: `https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en`,
    origin: 'https://vpn.jlu.edu.cn',
    oaUrl: `https://vpn.jlu.edu.cn${OA_WEBVPN_HASH}/defaultroot/PortalInformation!jldxList.action?channelId=179577`,
    authUrl: 'https://vpn.jlu.edu.cn/login?cas_login=true'
  }
};

// ============================================================================
// 3. 吉大标准作息时刻表 (1~12节完整排课时段)
// ============================================================================

export const SESSION_SLOTS = [
  { slot: 1, name: '第1节', time: '08:00-08:45', start: '08:00', end: '08:45', period: 'morning' },
  { slot: 2, name: '第2节', time: '08:55-09:40', start: '08:55', end: '09:40', period: 'morning' },
  { slot: 3, name: '第3节', time: '10:00-10:45', start: '10:00', end: '10:45', period: 'morning' },
  { slot: 4, name: '第4节', time: '10:55-11:40', start: '10:55', end: '11:40', period: 'morning' },
  { slot: 5, name: '第5节', time: '13:30-14:15', start: '13:30', end: '14:15', period: 'afternoon' },
  { slot: 6, name: '第6节', time: '14:25-15:10', start: '14:25', end: '15:10', period: 'afternoon' },
  { slot: 7, name: '第7节', time: '15:30-16:15', start: '15:30', end: '16:15', period: 'afternoon' },
  { slot: 8, name: '第8节', time: '16:25-17:10', start: '16:25', end: '17:10', period: 'afternoon' },
  { slot: 9, name: '第9节', time: '18:20-19:05', start: '18:20', end: '19:05', period: 'evening' },
  { slot: 10, name: '第10节', time: '19:06-19:50', start: '19:06', end: '19:50', period: 'evening' },
  { slot: 11, name: '第11节', time: '20:00-20:45', start: '20:00', end: '20:45', period: 'evening' },
  { slot: 12, name: '第12节', time: '20:46-21:30', start: '20:46', end: '21:30', period: 'evening' }
];

// ============================================================================
// 4. 校区、楼栋与教室类型代码
// ============================================================================

export const ALL_ROOM_TYPES_CODE = '03,02,01,04,05,06,13,08,09,10,11,12,07';

export const CAMPUS_NAMES = {
  '01': '前卫校区',
  'qianwei': '前卫校区',
  '02': '南岭校区',
  'nanling': '南岭校区',
  '03': '新民校区',
  'xinmin': '新民校区',
  '04': '朝阳校区',
  'chaoyang': '朝阳校区',
  '05': '南湖校区',
  'nanhu': '南湖校区',
  '06': '和平校区',
  'heping': '和平校区'
};

export const DEFAULT_CAMPUS_CODE = '02';
export const DEFAULT_BUILDING_CODE = '65';
export const DEFAULT_BUILDINGS = '65,82,73';

// ============================================================================
// 5. 默认系统设置与预设壁纸
// ============================================================================

export const DEFAULT_SETTINGS = {
  theme: 'light',
  customWallpaper: '',
  oaToolsEnabled: true,
  drawerEnabled: true,
  uiOpacity: 0.85,
  wallpaperOpacity: 0.90
};

export const PRESET_WALLPAPERS = {
  'default': '',
  'light-clean': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="lg1" cx="10%" cy="20%" r="50%"><stop offset="0%" stop-color="%2300479d" stop-opacity="0.08"/><stop offset="100%" stop-color="%23f0f4f9" stop-opacity="0"/></radialGradient><radialGradient id="lg2" cx="90%" cy="80%" r="50%"><stop offset="0%" stop-color="%230284c7" stop-opacity="0.08"/><stop offset="100%" stop-color="%23f0f4f9" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="%23f0f4f9"/><rect width="100%" height="100%" fill="url(%23lg1)"/><rect width="100%" height="100%" fill="url(%23lg2)"/></svg>',
  'jlu-navy': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="ng1" cx="50%" cy="0%" r="70%"><stop offset="0%" stop-color="%2317325c"/><stop offset="100%" stop-color="%23081324"/></radialGradient></defs><rect width="100%" height="100%" fill="%230b1a30"/><rect width="100%" height="100%" fill="url(%23ng1)"/></svg>'
};
