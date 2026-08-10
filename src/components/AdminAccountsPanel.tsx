import type { FormEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, X } from 'lucide-react';
import { AdminSectionHeader } from './AdminUi';
import {
  deleteAdminAccount,
  inviteAdminAccount,
  loadAdminAccounts,
  setAdminAccountStatus,
} from '../services/admin-accounts';
import type { AdminAccount } from '../services/admin-accounts';

type ViewState = 'error' | 'loading' | 'ready';
type AuthoritySort = 'admin-first' | 'operator-first';

export function AdminAccountsPanel({ canWrite, currentAccountId }: { canWrite: boolean; currentAccountId: string | null }): ReactElement {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [authoritySort, setAuthoritySort] = useState<AuthoritySort>('admin-first');
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAccountId, setPendingAccountId] = useState<string>();

  useEffect(() => {
    let active = true;
    setViewState('loading');
    loadAdminAccounts()
      .then((result) => {
        if (!active) return;
        setAccounts(result);
        setViewState('ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(errorMessage(loadError));
        setViewState('error');
      });
    return () => { active = false; };
  }, []);

  const sendInvitation = async (input: { displayName: string; email: string; message: string }) => {
    setError('');
    setMessage('');
    setPendingAccountId('invite');
    try {
      await inviteAdminAccount(input);
      setInviteOpen(false);
      setMessage('DSV 관제 운영 계정 초대 이메일 발송을 요청했습니다.');
    } catch (inviteError) {
      setError(errorMessage(inviteError));
    } finally {
      setPendingAccountId(undefined);
    }
  };

  const toggleStatus = async (account: AdminAccount) => {
    setError('');
    setPendingAccountId(account.id);
    try {
      const updated = await setAdminAccountStatus(account.id, account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      replaceAccount(setAccounts, updated);
    } catch (statusError) {
      setError(errorMessage(statusError));
    } finally {
      setPendingAccountId(undefined);
    }
  };

  const deleteAccount = async (account: AdminAccount) => {
    setError('');
    setMessage('');
    setPendingAccountId(account.id);
    try {
      await deleteAdminAccount(account.id);
      setAccounts((current) => current.filter((entry) => entry.id !== account.id));
      setDeleteTarget(null);
      setMessage(`${account.loginId} 계정을 영구 삭제했습니다.`);
    } catch (deleteError) {
      setDeleteTarget(null);
      setError(errorMessage(deleteError));
    } finally {
      setPendingAccountId(undefined);
    }
  };

  const sortedAccounts = [...accounts].sort((left, right) => compareAuthority(left, right, authoritySort));

  return (
    <div className="settings-account-layout">
      <section className="page-panel settings-account-panel wide">
        <AdminSectionHeader
          title="관리자 계정"
          side={canWrite ? <button className="btn" type="button" onClick={() => setInviteOpen(true)}>계정 초대</button> : null}
        />
        <p className="settings-account-description">이 화면은 CLEVER 개발 관리자만 사용합니다. 새 계정은 DSV 관제 운영 계정으로 초대되며 개발 관리 권한은 부여되지 않습니다.</p>
        {inviteOpen ? <DsvAdminInviteDialog busy={pendingAccountId === 'invite'} onClose={() => setInviteOpen(false)} onSubmit={sendInvitation} /> : null}
        {deleteTarget ? <AdminAccountDeleteDialog account={deleteTarget} busy={pendingAccountId === deleteTarget.id} onClose={() => setDeleteTarget(null)} onConfirm={deleteAccount} /> : null}
        {message ? <p className="settings-account-state success" role="status">{message}</p> : null}
        {error ? <p className="settings-account-error" role="alert">{error}</p> : null}
        {viewState === 'loading' ? <p className="settings-account-state" role="status">관리자 계정을 불러오는 중입니다.</p> : null}
        {viewState === 'error' ? <p className="settings-account-state">관리자 계정을 불러오지 못했습니다.</p> : null}
        {viewState === 'ready' ? (
          <div className="admin-table-frame overlay-scroll settings-account-table-wrap">
            <table className="page-table settings-account-table">
              <thead><tr><th>계정</th><th aria-sort={authoritySort === 'admin-first' ? 'ascending' : 'descending'}><button className="settings-account-sort" type="button" aria-label={`권한 정렬: ${authoritySort === 'admin-first' ? '개발 관리 먼저' : '관제 운영 먼저'}`} onClick={() => setAuthoritySort((current) => current === 'admin-first' ? 'operator-first' : 'admin-first')}>권한 <ArrowUpDown aria-hidden="true" /></button></th><th>상태</th><th>마지막 로그인</th><th aria-label="계정 작업" /></tr></thead>
              <tbody>
                {sortedAccounts.map((account) => {
                  const isCurrent = account.id === currentAccountId;
                  const pending = pendingAccountId === account.id;
                  const authority = account.scopes.includes('dsv:accounts:write') ? '개발 관리' : '관제 운영';
                  return (
                    <tr key={account.id}>
                      <td><strong>{account.displayName ?? account.loginId}</strong><small>{account.loginId}{isCurrent ? ' · 현재 계정' : ''}</small></td>
                      <td>{authority}</td>
                      <td><span className={`settings-account-status ${account.status.toLowerCase()}`}>{account.status === 'ACTIVE' ? '사용 중' : '비활성'}</span>{account.lockedUntil ? <small>로그인 잠김</small> : null}</td>
                      <td>{formatDateTime(account.lastAuthenticatedAt)}</td>
                      <td>
                        {canWrite ? <span className="settings-account-row-actions">
                          <button type="button" disabled={pending || (isCurrent && account.status === 'ACTIVE')} onClick={() => void toggleStatus(account)}>{account.status === 'ACTIVE' ? '비활성화' : '활성화'}</button>
                          {account.status === 'DISABLED' && !isCurrent ? <button className="danger" type="button" disabled={pending} onClick={() => setDeleteTarget(account)}>삭제</button> : null}
                        </span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="page-panel settings-onboarding-panel">
        <AdminSectionHeader title="고객 계정" />
        <p>운송 고객은 공개 회원가입을 받지 않고, 관제 고객 운영자가 등록된 고객사에 초대 메일을 보내는 방식으로 관리합니다.</p>
        <ol>
          <li>관제 고객 운영자가 관리에서 고객사를 선택합니다.</li>
          <li>담당자 이메일로 일회성 초대를 발송합니다.</li>
          <li>고객이 본인 아이디와 비밀번호를 설정합니다.</li>
          <li>계정은 해당 고객사의 배송만 조회합니다.</li>
        </ol>
        <small>고객 계정 발급 기능은 인증 계약을 확정한 뒤 별도 작업으로 연결합니다.</small>
      </section>
    </div>
  );
}

function AdminAccountDeleteDialog({
  account,
  busy,
  onClose,
  onConfirm,
}: {
  account: AdminAccount;
  busy: boolean;
  onClose: () => void;
  onConfirm: (account: AdminAccount) => Promise<void>;
}): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation === account.loginId;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby="admin-account-delete-description"
      aria-labelledby="admin-account-delete-title"
      className="driver-invite-dialog customer-account-invite-dialog admin-account-delete-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-invite-header">
        <span>
          <strong id="admin-account-delete-title">계정 영구 삭제</strong>
          <small>비활성 계정을 복구할 수 없는 방식으로 삭제합니다.</small>
        </span>
        <button aria-label="계정 영구 삭제 닫기" type="button" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <form className="customer-account-invite-form admin-account-delete-form" id="admin-account-delete-form" onSubmit={(event) => {
        event.preventDefault();
        if (confirmed) void onConfirm(account);
      }}>
        <p className="admin-account-delete-warning" id="admin-account-delete-description"><strong>{account.loginId}</strong> 계정과 현재 세션 접근을 영구적으로 제거합니다.</p>
        <label className="customer-account-invite-message">삭제 확인
          <span>계속하려면 <strong>{account.loginId}</strong>을(를) 입력하세요.</span>
          <input autoComplete="off" disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
      </form>
      <footer className="driver-invite-footer">
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        <button className="danger" disabled={busy || !confirmed} form="admin-account-delete-form" type="submit">{busy ? '삭제 중' : '영구 삭제'}</button>
      </footer>
    </dialog>
  );
}

function DsvAdminInviteDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { displayName: string; email: string; message: string }) => Promise<void>;
}): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('CLEVER DSV 관제 운영 계정 설정을 안내드립니다.');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({ displayName: displayName.trim(), email: email.trim(), message: message.trim() });
  };

  const previewName = displayName.trim() || 'DSV 관제 운영자';

  return (
    <dialog
      aria-describedby="dsv-admin-invite-preview"
      aria-labelledby="dsv-admin-invite-title"
      className="driver-invite-dialog customer-account-invite-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-invite-header">
        <span>
          <strong id="dsv-admin-invite-title">DSV 관제 운영 계정 초대</strong>
          <small>CLEVER 고객사인 DSV의 관제 운영자에게 계정 설정 이메일을 보냅니다.</small>
        </span>
        <button aria-label="DSV 관제 운영 계정 초대 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <form className="customer-account-invite-form" id="dsv-admin-invite-form" aria-label="DSV 관제 운영 계정 초대" onSubmit={submit}>
        <label>수신자 이메일
          <input name="email" type="email" required autoComplete="email" placeholder="operator@example.com" disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>표시 이름
          <input name="displayName" required maxLength={120} autoComplete="name" placeholder="DSV 관제 운영자" disabled={busy} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="customer-account-invite-message">안내 문장
          <textarea name="message" required maxLength={1000} rows={3} placeholder="수신자에게 전달할 안내 문장을 입력하세요." disabled={busy} value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
      </form>
      <section className="customer-account-invite-preview" id="dsv-admin-invite-preview" aria-label="DSV 관제 운영 계정 초대 미리보기">
        <strong>초대 이메일 미리보기</strong>
        <p className="customer-account-invite-message-preview">{message.trim()}</p>
        <p>{previewName}님에게 DSV 관제 운영 계정 설정 링크가 발송됩니다. 링크는 48시간 동안 한 번만 사용할 수 있습니다.</p>
        <dl>
          <div><dt>계정 범위</dt><dd>CLEVER 고객사 DSV의 관제 운영 계정</dd></div>
          <div><dt>로그인 아이디</dt><dd>수신자가 설정 화면에서 직접 만듭니다.</dd></div>
          <div><dt>비밀번호</dt><dd>수신자가 설정 화면에서 직접 만듭니다.</dd></div>
        </dl>
      </section>
      <footer className="driver-invite-footer">
        <button type="button" onClick={onClose}>취소</button>
        <button className="primary" disabled={busy} form="dsv-admin-invite-form" type="submit">{busy ? '초대 중' : '초대 이메일 보내기'}</button>
      </footer>
    </dialog>
  );
}

function replaceAccount(setAccounts: (value: (current: AdminAccount[]) => AdminAccount[]) => void, account: AdminAccount): void {
  setAccounts((current) => current.map((entry) => entry.id === account.id ? account : entry));
}

function compareAuthority(left: AdminAccount, right: AdminAccount, sort: AuthoritySort): number {
  const leftAdmin = left.scopes.includes('dsv:accounts:write');
  const rightAdmin = right.scopes.includes('dsv:accounts:write');
  if (leftAdmin !== rightAdmin) return (leftAdmin ? -1 : 1) * (sort === 'admin-first' ? 1 : -1);
  return left.loginId.localeCompare(right.loginId, 'ko');
}

function formatDateTime(value: string | null): string {
  if (value === null) return '로그인 기록 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '계정 작업을 완료하지 못했습니다.';
}
