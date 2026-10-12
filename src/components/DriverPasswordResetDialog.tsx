import { useEffect, useRef, useState } from 'react';
import { apiConfig } from '../api/config';
import type { ManagementDriver } from '../demo/management';
import { describeAccountStatus, describeSessionState, type DriverAccountSummary } from '../services/driver-account-summary';
import { fetchDriverAccountSummary, issueDriverPasswordReset, type DriverPasswordResetLink } from '../services/driver-password-reset';

export function DriverPasswordResetDialog({ driver, onClose }: { driver: ManagementDriver; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const secretRef = useRef<DriverPasswordResetLink | null>(null);
  const [link, setLink] = useState<DriverPasswordResetLink | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<'confirm' | 'issuing' | 'issued' | 'cleared'>('confirm');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [account, setAccount] = useState<DriverAccountSummary | 'loading' | 'missing' | 'failed'>('loading');

  // Show the login id first: a driver who forgot it only needs the id, not a new password.
  useEffect(() => {
    if (apiConfig.mode === 'mock') { setAccount('missing'); return undefined; }
    const controller = new AbortController();
    fetchDriverAccountSummary(driver.id, controller.signal)
      .then((summary) => { if (!controller.signal.aborted) setAccount(summary ?? 'missing'); })
      .catch(() => { if (!controller.signal.aborted) setAccount('failed'); });
    return () => controller.abort();
  }, [driver.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const clear = () => {
      requestRef.current?.abort();
      secretRef.current = null;
      setLink(null);
      setPhase('cleared');
      setNotice('화면을 벗어나 링크 표시를 종료했습니다.');
    };
    const hide = () => { if (document.visibilityState === 'hidden') clear(); };
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', hide);
    return () => {
      requestRef.current?.abort();
      secretRef.current = null;
      dialog?.close();
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  useEffect(() => {
    if (!link) return;
    const timeout = window.setTimeout(() => {
      secretRef.current = null;
      setLink(null);
      setPhase('cleared');
      setNotice('링크가 만료되었습니다. 필요한 경우 새 링크를 발급해 주세요.');
    }, Math.max(0, Date.parse(link.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [link]);

  const issue = async () => {
    if (!confirmed || phase !== 'confirm' || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase('issuing');
    setError('');
    try {
      const result = await issueDriverPasswordReset(driver.id, controller.signal);
      if (controller.signal.aborted) return;
      if (Date.parse(result.expiresAt) <= Date.now()) {
        setPhase('cleared');
        setNotice('링크가 만료되었습니다. 필요한 경우 새 링크를 발급해 주세요.');
        return;
      }
      secretRef.current = result;
      setLink(result);
      setPhase('issued');
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : '초기화 요청을 확인하지 못했습니다.');
      setPhase('cleared');
    }
  };

  const copy = async () => {
    const result = secretRef.current;
    if (!result) return;
    // Consume before awaiting the clipboard to prevent repeated or racing copies.
    secretRef.current = null;
    setLink(null);
    setPhase('cleared');
    if (Date.parse(result.expiresAt) <= Date.now()) {
      setNotice('링크가 만료되었습니다. 필요한 경우 새 링크를 발급해 주세요.');
      return;
    }
    try {
      await navigator.clipboard.writeText(result.setupUrl);
      setNotice('링크를 복사하고 화면에서 지웠습니다. 확인한 배송원 본인에게 전달해 주세요.');
    } catch {
      setError('복사하지 못해 링크 표시를 종료했습니다. 필요한 경우 창을 닫고 새 링크를 발급해 주세요.');
    }
  };

  return (
    <dialog ref={dialogRef} className="driver-install-dialog" aria-labelledby="driver-reset-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="driver-install-header"><strong id="driver-reset-title">CLEVER Driver 계정 확인 · 비밀번호 초기화</strong></header>
      <div className="driver-install-body">
        <div className="driver-install-details">
          <dl className="management-detail compact">
            <div><dt>배송원</dt><dd>{driver.name}</dd></div>
            <div><dt>연락처</dt><dd>{driver.phone || '미등록'}</dd></div>
            <div><dt>배송원 ID</dt><dd>{driver.id}</dd></div>
            <div><dt>로그인 아이디</dt><dd data-testid="driver-account-login-id">{
              account === 'loading' ? '확인 중' : account === 'missing' ? '연결된 앱 계정 없음' : account === 'failed' ? '확인 불가'
                : <strong>{account.loginId ?? '아이디 미설정'}</strong>
            }</dd></div>
            <div><dt>앱 계정 상태</dt><dd>{
              typeof account === 'string' ? '-' : `${describeAccountStatus(account.status)} · ${describeSessionState(account)}`
            }</dd></div>
          </dl>
          <p>배송원이 로그인 아이디를 잊은 경우 위 아이디를 본인에게 안내합니다. 비밀번호를 모르는 경우에만 아래 초기화 링크를 발급합니다. 계정 연결과 차량 배정은 유지됩니다.</p>
          {phase === 'confirm' || phase === 'issuing' ? <>
            <p>새 링크를 발급하면 기존 미사용 링크는 폐기됩니다. 링크는 30분 동안 한 번 사용할 수 있으며, 비밀번호 변경 후 기존 앱 세션은 종료됩니다.</p>
            <label className="driver-reset-confirm"><input type="checkbox" checked={confirmed} disabled={phase === 'issuing'} onChange={(event) => setConfirmed(event.target.checked)} />배송원 본인과 앱 계정 연결을 확인했습니다.</label>
          </> : null}
          {link ? <>
            <p>이 창에서만 한 번 표시됩니다. 복사하거나 창을 닫으면 다시 볼 수 없습니다.</p>
            <label>일회용 초기화 링크<input aria-label="일회용 초기화 링크" readOnly value={link.setupUrl} autoComplete="off" onCopy={(event) => { event.preventDefault(); void copy(); }} onCut={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} /></label>
            <p>만료: {new Date(link.expiresAt).toLocaleString('ko-KR')}</p>
          </> : null}
          {notice ? <p role="status">{notice}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
      <footer className="driver-install-footer">
        <button type="button" onClick={onClose}>닫기</button>
        {phase === 'confirm' || phase === 'issuing' ? <button type="button" className="primary" disabled={!confirmed || phase === 'issuing'} onClick={() => void issue()}>{phase === 'issuing' ? '발급 중' : '초기화 링크 발급'}</button> : null}
        {link ? <button type="button" className="primary" onClick={() => void copy()}>링크 한 번 복사</button> : null}
      </footer>
    </dialog>
  );
}
