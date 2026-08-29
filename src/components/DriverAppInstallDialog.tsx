import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, X } from 'lucide-react';

import { DRIVER_APP_INSTALL_PAGE_URL } from '../config/driver-app';
import { createQrCodeModules } from '../utils/qr-code';

export function DriverAppInstallDialog({ onClose }: { onClose: () => void }): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copyState, setCopyState] = useState<'copied' | 'error' | 'idle'>('idle');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const copyInstallLink = async () => {
    try {
      await navigator.clipboard.writeText(DRIVER_APP_INSTALL_PAGE_URL);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <dialog
      aria-describedby="driver-install-description"
      aria-labelledby="driver-app-install-title"
      className="driver-invite-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-invite-header">
        <span>
          <strong id="driver-app-install-title">배송원 앱 안내</strong>
          <small>설치 링크 하나만 전달하면 앱에서 바로 회원가입할 수 있습니다.</small>
        </span>
        <button aria-label="배송원 앱 안내 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
      </header>

      <div className="driver-invite-body">
        <div className="driver-invite-result">
          <div className="driver-invite-qr-card">
            <Download aria-hidden="true" />
            <LinkQrCode label="배송원 앱 설치 링크 QR 코드" value={DRIVER_APP_INSTALL_PAGE_URL} />
            <small>배송원이 사용할 휴대전화로 스캔하세요.</small>
          </div>
          <div className="driver-invite-details">
            <span className="driver-invite-section-title"><Download aria-hidden="true" /> CLEVER Driver 설치</span>
            <label>설치 링크
              <input aria-label="배송원 앱 설치 링크" readOnly value={DRIVER_APP_INSTALL_PAGE_URL} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <p id="driver-install-description">설치 후 앱 로그인 화면에서 회원가입을 누르면 됩니다. 일회용 초대 링크는 필요하지 않습니다.</p>
            <a className="driver-invite-open-link" href={DRIVER_APP_INSTALL_PAGE_URL} rel="noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" /> 설치 페이지 열기</a>
            {copyState === 'copied' ? <span className="driver-invite-copy-status success" role="status">설치 링크를 복사했습니다.</span> : null}
            {copyState === 'error' ? <span className="driver-invite-copy-status" role="alert">설치 링크를 복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.</span> : null}
          </div>
        </div>
      </div>

      <footer className="driver-invite-footer">
        <button type="button" onClick={onClose}>닫기</button>
        <button className="primary" type="button" onClick={() => void copyInstallLink()}><Copy aria-hidden="true" /> 설치 링크 복사</button>
      </footer>
    </dialog>
  );
}

function LinkQrCode({ label, value }: { label: string; value: string }): ReactElement {
  const modules = useMemo(() => createQrCodeModules(value), [value]);
  const path = useMemo(() => modules.flatMap((row, y) => row.flatMap((dark, x) => dark ? `M${x},${y}h1v1h-1z` : [])).join(''), [modules]);
  const size = modules.length;
  return (
    <svg aria-label={label} className="driver-invite-qr" role="img" shapeRendering="crispEdges" viewBox={`-4 -4 ${size + 8} ${size + 8}`}>
      <rect fill="#fff" height={size + 8} width={size + 8} x="-4" y="-4" />
      <path d={path} fill="#111" />
    </svg>
  );
}
