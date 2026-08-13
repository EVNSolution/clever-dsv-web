export const adminTabs = [
  { path: '/control', label: '관제', title: '관제', navDescription: '차량과 배송지 관제', description: '실시간 차량과 배송 경로를 확인합니다.' },
  { path: '/dispatch', label: '배차', title: '배차', navDescription: '주문과 배차 준비', description: '주문을 확인하고 출발 전 배차를 준비합니다.' },
  { path: '/records', label: '이력', title: '이력', navDescription: '배송 결과 확인', description: '완료된 배송의 시간, 증빙과 현장 메모를 확인합니다.' },
  { path: '/master-data', label: '관리', title: '관리', navDescription: '운영 기준정보 관리', description: '고객사, 배송처와 운송조건을 관리합니다.' },
  { path: '/settings', label: '설정', title: '설정', navDescription: '서비스와 알림 설정', description: '알림 기준과 서비스 연결을 설정합니다.' },
] as const;

export const defaultPath = '/control';
export const accountPasswordPath = '/account/password';
export const customerDeliveryPath = '/customer/delivery-inquiry';
export const adminCustomerDeliveryPath = '/customer/delivery-inquiry/admin';
export const customerLoginPath = '/customer/login';
export const customerAccountSetupPath = '/customer/account/setup';
export const adminAccountSetupPath = '/admin/account/setup';
export const legacyPathMap = {
  '/관제': '/control',
  '/배송원': '/master-data',
  '/업무': '/dispatch',
  '/운영': '/dispatch',
  '/기록': '/records',
  '/설정': '/settings',
  '/drivers': '/master-data',
  '/operations': '/dispatch',
  '/history': '/records',
} as const;

export type AdminPath = (typeof adminTabs)[number]['path'];
export type AppPath = AdminPath | '/login' | typeof accountPasswordPath | typeof adminCustomerDeliveryPath | typeof customerDeliveryPath | typeof customerLoginPath | typeof customerAccountSetupPath | typeof adminAccountSetupPath;
