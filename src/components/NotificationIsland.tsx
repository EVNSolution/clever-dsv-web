import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { loadReadNotificationIds, notificationItems, saveReadNotificationIds } from '../services/notifications';

export function NotificationIsland({ open, onToggle, onClose, onVehicleLookup }: { open: boolean; onToggle: () => void; onClose: () => void; onVehicleLookup: (vehicleId: string) => void }): ReactElement {
  const [readIds, setReadIds] = useState<string[]>(loadReadNotificationIds);
  useEffect(() => saveReadNotificationIds(readIds), [readIds]);
  const unreadCount = notificationItems.length - readIds.length;
  const markRead = (id: string) => setReadIds((ids) => ids.includes(id) ? ids : [...ids, id]);
  return (
    <div className="notification-island" aria-label="알림 센터">
      <button className="notification-bell" type="button" aria-label="알림 열기" aria-expanded={open} onClick={onToggle}>
        <Bell className="bell-icon" aria-hidden="true" />
        <span className="notification-count" hidden={unreadCount === 0}>{unreadCount}</span>
      </button>
      <div className="notification-stack overlay-scroll" hidden={!open}>
        <div className="notification-head"><span className="notification-head-copy"><strong>알림 센터</strong><small>읽지 않은 알림 {unreadCount}건</small></span><span className="notification-head-actions"><button className="notification-action" type="button" disabled={unreadCount === 0} onClick={() => setReadIds(notificationItems.map((item) => item.id))}>전부 읽음</button><button className="notification-action close" type="button" aria-label="알림 닫기" onClick={onClose}><X aria-hidden="true" /></button></span></div>
        <p className="notification-summary">운영 알림을 확인하세요.</p>
        {!notificationItems.length ? <p className="notification-summary" role="status">알림이 없습니다.</p> : null}
        {notificationItems.map((item) => {
          const read = readIds.includes(item.id);
          return (
            <div className={`notification-item${read ? ' read' : ''}`} key={item.id} data-notification-id={item.id}>
              <i>{read ? '✓' : '!'}</i><span><b>{item.title}</b><span>{item.description}</span><em>{read ? '읽음' : '읽지 않음'}</em></span>
              <div className="notification-actions"><button className="notification-action primary" type="button" onClick={() => { markRead(item.id); onVehicleLookup(item.vehicleId); }}>차량 조회</button><button className="notification-action" type="button" disabled={read} onClick={() => markRead(item.id)}>읽음</button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
