import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Bell, RotateCcw, X } from 'lucide-react';
import { recoverCancelledDispatchOrder } from '../services/dispatch';
import {
  loadOperationalNotifications,
  loadReadNotificationIds,
  saveReadNotificationIds,
} from '../services/notifications';
import type { NotificationItem, NotificationSeverity } from '../services/notifications';

type NotificationIslandProps = {
  onClose: () => void;
  onToggle: () => void;
  onVehicleLookup: (vehicleId: string) => void;
  open: boolean;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

const severityLabels: Record<NotificationSeverity, string> = {
  critical: '긴급',
  info: '안내',
  success: '완료',
  warning: '주의',
};

export function NotificationIsland({ open, onToggle, onClose }: NotificationIslandProps): ReactElement {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>(loadReadNotificationIds);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [actionId, setActionId] = useState<string>();

  const refreshNotifications = useCallback(async (signal?: AbortSignal) => {
    setLoadState((current) => current === 'ready' ? current : 'loading');
    try {
      const nextItems = await loadOperationalNotifications(signal);
      setItems(nextItems);
      setLoadState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadState('failed');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshNotifications(controller.signal);
    return () => controller.abort();
  }, [refreshNotifications]);

  useEffect(() => saveReadNotificationIds(readIds), [readIds]);

  const unreadCount = items.filter((item) => !readIds.includes(item.id)).length;
  const markRead = (id: string) => setReadIds((ids) => ids.includes(id) ? ids : [...ids, id]);
  const markAllRead = () => setReadIds((ids) => [...new Set([...ids, ...items.map((item) => item.id)])]);

  async function recoverOrder(item: NotificationItem): Promise<void> {
    if (item.sellerOrderId === undefined) return;
    markRead(item.id);
    setActionId(item.id);
    try {
      await recoverCancelledDispatchOrder(item.sellerOrderId);
      await refreshNotifications();
    } finally {
      setActionId(undefined);
    }
  }

  return (
    <div className="notification-island" aria-label="알림 센터">
      <button className="notification-bell" type="button" aria-label="알림 열기" aria-expanded={open} onClick={onToggle}>
        <Bell className="bell-icon" aria-hidden="true" />
        <span className="notification-count" hidden={unreadCount === 0}>{unreadCount}</span>
      </button>
      <div className="notification-stack overlay-scroll" hidden={!open}>
        <div className="notification-head">
          <span className="notification-head-copy"><strong>알림 센터</strong><small>읽지 않은 알림 {unreadCount}건</small></span>
          <span className="notification-head-actions">
            <button className="notification-action" type="button" disabled={unreadCount === 0} onClick={markAllRead}>전부 읽음</button>
            <button className="notification-action close" type="button" aria-label="알림 닫기" onClick={onClose}><X aria-hidden="true" /></button>
          </span>
        </div>
        <p className="notification-summary">운영 알림을 확인하세요.</p>
        {loadState === 'loading' ? <p className="notification-summary" role="status">알림을 불러오는 중입니다.</p> : null}
        {loadState === 'failed' ? <p className="notification-summary" role="alert">알림을 불러오지 못했습니다.</p> : null}
        {loadState === 'ready' && items.length === 0 ? <p className="notification-summary" role="status">알림이 없습니다.</p> : null}
        {items.map((item) => {
          const read = readIds.includes(item.id);
          const canRecover = item.recoverable && item.sellerOrderId !== undefined;
          const busy = actionId === item.id;
          return (
            <div className={`notification-item ${item.severity}${read ? ' read' : ''}`} key={item.id} data-notification-id={item.id}>
              <i>{read ? '✓' : '!'}</i>
              <span>
                <b>{item.title}</b>
                <span>{item.description}</span>
                <em>{severityLabels[item.severity]} · {read ? '읽음' : '읽지 않음'}</em>
              </span>
              <div className="notification-actions">
                {canRecover ? (
                  <button className="notification-action primary" type="button" disabled={busy} onClick={() => { void recoverOrder(item); }}>
                    <RotateCcw aria-hidden="true" />{busy ? '복구 중' : '주문 복구'}
                  </button>
                ) : null}
                <button className="notification-action" type="button" disabled={read} onClick={() => markRead(item.id)}>읽음</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
