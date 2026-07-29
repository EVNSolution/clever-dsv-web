export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  vehicleId: string;
};

export const notificationItems: readonly NotificationItem[] = [];

const readStateKey = 'clever.notification.readIds';

export function loadReadNotificationIds(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(readStateKey) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string' && notificationItems.some((item) => item.id === id))
      : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationIds(ids: string[]): void {
  window.localStorage.setItem(readStateKey, JSON.stringify(ids));
}
