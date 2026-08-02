import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';

export function AdminPageHeader({
  actions,
  className = '',
  description,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description: string;
  title: string;
}): ReactElement {
  return (
    <div className={`page-hero admin-page-header ${className}`.trim()}>
      <div><h2>{title}</h2><p>{description}</p></div>
      {actions}
    </div>
  );
}

export function AdminSectionHeader({
  className = '',
  side,
  title,
}: {
  className?: string;
  side?: ReactNode;
  title: string;
}): ReactElement {
  return (
    <div className={`tab-line section-heading admin-section-header ${className}`.trim()}>
      <span>{title}</span>
      {side}
    </div>
  );
}

export function AdminTableFrame({ children, className = '' }: { children: ReactNode; className?: string }): ReactElement {
  return <div className={`admin-table-frame overlay-scroll ${className}`.trim()}>{children}</div>;
}

export function ManagementListActions({
  canDelete,
  disabled = false,
  name,
  onCreate,
  onDelete,
}: {
  canDelete: boolean;
  disabled?: boolean;
  name: string;
  onCreate: () => void;
  onDelete: () => void;
}): ReactElement {
  return (
    <span className="management-actions">
      <button type="button" aria-label={`${name} 등록`} disabled={disabled} onClick={onCreate}>등록</button>
      <button className="danger" type="button" aria-label={`${name} 삭제`} disabled={disabled || !canDelete} onClick={onDelete}>삭제</button>
    </span>
  );
}

export function ManagementDetailAction({ disabled = false, name, onEdit }: { disabled?: boolean; name: string; onEdit: () => void }): ReactElement {
  return <span className="management-actions"><button type="button" aria-label={`${name} 수정`} disabled={disabled} onClick={onEdit}>수정</button></span>;
}

export function ManagementSelectionClear({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <span className="management-actions">
      <button className="management-selection-clear" type="button" aria-label="선택 취소" title="선택 취소" onClick={onClick}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
}

export function ManagementFormActions({ onCancel }: { onCancel: () => void }): ReactElement {
  return (
    <div className="management-form-actions">
      <button type="button" onClick={onCancel}>취소</button>
      <button className="primary" type="submit">저장</button>
    </div>
  );
}

export function ManagementEmptyState({ children }: { children: ReactNode }): ReactElement {
  return <div className="management-empty" role="status">{children}</div>;
}
