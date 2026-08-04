import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, QrCode, UserPlus, X } from 'lucide-react';
import { issueDriverSignupInvite } from '../services/management';
import type { DriverSignupInvite } from '../services/management';
import { createQrCodeModules } from '../utils/qr-code';

export function DriverInviteDialog({ onClose }: { onClose: () => void }): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [invite, setInvite] = useState<DriverSignupInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'copied' | 'error' | 'idle'>('idle');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const issueInvite = async () => {
    setBusy(true);
    setError(null);
    setCopyState('idle');
    try {
      setInvite(await issueDriverSignupInvite());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '배송원 초대 링크를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (invite === null) return;
    try {
      await navigator.clipboard.writeText(invite.signupUrl);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <dialog
      aria-describedby="driver-invite-description"
      aria-labelledby="driver-invite-title"
      className="driver-invite-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-invite-header">
        <span>
          <strong id="driver-invite-title">배송원 초대</strong>
          <small>{invite === null ? '가입 링크를 만들어 배송원에게 전달하세요.' : '링크를 전달하면 배송원이 직접 가입합니다.'}</small>
        </span>
        <button aria-label="배송원 초대 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
      </header>

      <div className="driver-invite-body">
        {invite === null ? (
          <div className="driver-invite-ready">
            <span className="driver-invite-icon"><UserPlus aria-hidden="true" /></span>
            <strong>배송원 정보는 미리 입력하지 않습니다.</strong>
            <p id="driver-invite-description">초대받은 배송원이 앱에서 이름, 휴대전화 번호와 로그인 정보를 입력하면 배송원 리스트에 자동으로 추가됩니다.</p>
            <p className="driver-invite-warning">새 링크를 만들면 이전에 사용하지 않은 초대 링크는 즉시 만료됩니다.</p>
          </div>
        ) : (
          <div className="driver-invite-result" id="driver-invite-description">
            <div className="driver-invite-qr-card">
              <QrCode aria-hidden="true" />
              <InviteQrCode value={invite.signupUrl} />
              <small>배송원 앱이 설치된 휴대전화로 스캔하세요.</small>
            </div>
            <div className="driver-invite-details">
              <span className="driver-invite-success"><Check aria-hidden="true" /> 초대 링크가 생성되었습니다.</span>
              <label>가입 링크
                <input aria-label="배송원 가입 링크" readOnly value={invite.signupUrl} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <dl>
                <div><dt>유효기간</dt><dd>{formatExpiry(invite.expiresAt)}</dd></div>
                <div><dt>사용 횟수</dt><dd>1회</dd></div>
              </dl>
              <p>가입이 완료되면 이 링크는 사용할 수 없으며, 새 배송원이 관리 목록에 표시됩니다.</p>
              {copyState === 'copied' ? <span className="driver-invite-copy-status success" role="status">링크를 복사했습니다.</span> : null}
              {copyState === 'error' ? <span className="driver-invite-copy-status" role="alert">복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.</span> : null}
            </div>
          </div>
        )}
        {error ? <p className="driver-invite-error" role="alert">{error}</p> : null}
      </div>

      <footer className="driver-invite-footer">
        <button type="button" onClick={onClose}>{invite === null ? '취소' : '닫기'}</button>
        {invite === null ? (
          <button className="primary" disabled={busy} type="button" onClick={() => void issueInvite()}>
            {busy ? '생성 중' : error ? '다시 생성' : '초대 링크 생성'}
          </button>
        ) : (
          <button className="primary" type="button" onClick={() => void copyInvite()}><Copy aria-hidden="true" /> 링크 복사</button>
        )}
      </footer>
    </dialog>
  );
}

function InviteQrCode({ value }: { value: string }): ReactElement {
  const path = useMemo(() => createQrCodeModules(value).flatMap((row, y) => row.flatMap((dark, x) => dark ? `M${x},${y}h1v1h-1z` : [])).join(''), [value]);
  return (
    <svg aria-label="배송원 가입 링크 QR 코드" className="driver-invite-qr" role="img" shapeRendering="crispEdges" viewBox="-4 -4 45 45">
      <rect fill="#fff" height="45" width="45" x="-4" y="-4" />
      <path d={path} fill="#111" />
    </svg>
  );
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}
