export const notificationItems = [
  { id: 'temperature', title: '온도 경고 (31자 7104)', description: '냉장칸 온도가 상한 8℃를 3분간 초과했습니다.', vehicleId: 'unload04' },
  { id: 'delay', title: '배송 지연 (32바 7207)', description: '교통 지연으로 다음 배송지 도착이 18분 늦어졌습니다.', vehicleId: 'delay07' },
  { id: 'proof', title: '증빙 확인 (33사 7311)', description: '11번 배송지의 POD 사진이 누락되어 확인이 필요합니다.', vehicleId: 'proof11' },
] as const;

const readStateKey = 'clever.notification.readIds';

export function loadReadNotificationIds(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(readStateKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && notificationItems.some((item) => item.id === id)) : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationIds(ids: string[]): void {
  window.localStorage.setItem(readStateKey, JSON.stringify(ids));
}
