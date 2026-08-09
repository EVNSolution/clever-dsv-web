import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { AdminSectionHeader } from './AdminUi';
import {
  createAdminAccount,
  loadAdminAccounts,
  resetAdminAccountPassword,
  setAdminAccountStatus,
} from '../services/admin-accounts';
import type { AdminAccount, AdminAccountCredential } from '../services/admin-accounts';

type ViewState = 'error' | 'loading' | 'ready';

export function AdminAccountsPanel({ canWrite, currentAccountId }: { canWrite: boolean; currentAccountId: string | null }): ReactElement {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pendingAccountId, setPendingAccountId] = useState<string>();
  const [credential, setCredential] = useState<AdminAccountCredential>();
  const [copyState, setCopyState] = useState<'copied' | 'error' | 'idle'>('idle');

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

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPendingAccountId('new');
    try {
      const result = await createAdminAccount({ displayName: displayName.trim(), loginId: loginId.trim() });
      setAccounts((current) => [...current, result.account].sort(accountOrder));
      setCredential(result);
      setCopyState('idle');
      setLoginId('');
      setDisplayName('');
      setShowCreate(false);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setPendingAccountId(undefined);
    }
  };

  const resetPassword = async (account: AdminAccount) => {
    setError('');
    setPendingAccountId(account.id);
    try {
      const result = await resetAdminAccountPassword(account.id);
      replaceAccount(setAccounts, result.account);
      setCredential(result);
      setCopyState('idle');
    } catch (resetError) {
      setError(errorMessage(resetError));
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

  const copyCredential = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(`아이디: ${credential.account.loginId}\n임시 비밀번호: ${credential.temporaryPassword}`);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <div className="settings-account-layout">
      <section className="page-panel settings-account-panel wide">
        <AdminSectionHeader
          title="관리자 계정"
          side={canWrite ? <button className="btn" type="button" onClick={() => setShowCreate((current) => !current)}>{showCreate ? '취소' : '계정 등록'}</button> : null}
        />
        <p className="settings-account-description">이 화면은 CLEVER 개발 관리자만 사용합니다. 새 계정은 관제 고객의 운영 계정으로 발급되며 개발 관리 권한은 부여되지 않습니다.</p>
        {showCreate ? (
          <form className="settings-account-form" onSubmit={(event) => void createAccount(event)}>
            <label><span>아이디</span><input autoComplete="off" required maxLength={80} value={loginId} onChange={(event) => setLoginId(event.target.value)} /></label>
            <label><span>표시 이름</span><input autoComplete="off" required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <button className="btn primary" type="submit" disabled={pendingAccountId !== undefined}>등록</button>
          </form>
        ) : null}
        {credential ? (
          <div className="settings-credential" role="status">
            <div><strong>임시 로그인 정보</strong><span>이 화면을 닫으면 비밀번호를 다시 확인할 수 없습니다.</span></div>
            <code>{credential.account.loginId}</code>
            <code>{credential.temporaryPassword}</code>
            <button className="btn" type="button" onClick={() => void copyCredential()}><Copy aria-hidden="true" /> 복사</button>
            <button className="text-button" type="button" onClick={() => setCredential(undefined)}>닫기</button>
            {copyState === 'copied' ? <small>로그인 정보를 복사했습니다.</small> : null}
            {copyState === 'error' ? <small className="error">복사하지 못했습니다. 직접 선택해 복사해 주세요.</small> : null}
          </div>
        ) : null}
        {error ? <p className="settings-account-error" role="alert">{error}</p> : null}
        {viewState === 'loading' ? <p className="settings-account-state" role="status">관리자 계정을 불러오는 중입니다.</p> : null}
        {viewState === 'error' ? <p className="settings-account-state">관리자 계정을 불러오지 못했습니다.</p> : null}
        {viewState === 'ready' ? (
          <div className="admin-table-frame overlay-scroll settings-account-table-wrap">
            <table className="page-table settings-account-table">
              <thead><tr><th>계정</th><th>권한</th><th>상태</th><th>마지막 로그인</th><th aria-label="계정 작업" /></tr></thead>
              <tbody>
                {accounts.map((account) => {
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
                          <button type="button" disabled={pending} onClick={() => void resetPassword(account)}>비밀번호 재발급</button>
                          <button type="button" disabled={pending || (isCurrent && account.status === 'ACTIVE')} onClick={() => void toggleStatus(account)}>{account.status === 'ACTIVE' ? '비활성화' : '활성화'}</button>
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

function replaceAccount(setAccounts: (value: (current: AdminAccount[]) => AdminAccount[]) => void, account: AdminAccount): void {
  setAccounts((current) => current.map((entry) => entry.id === account.id ? account : entry).sort(accountOrder));
}

function accountOrder(left: AdminAccount, right: AdminAccount): number {
  if (left.status !== right.status) return left.status === 'ACTIVE' ? -1 : 1;
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
