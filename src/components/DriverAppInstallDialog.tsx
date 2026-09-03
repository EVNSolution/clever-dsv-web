import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, Share2, X } from 'lucide-react';

import { DRIVER_APP_INSTALL_PAGE_URL } from '../config/driver-app';

export function DriverAppInstallDialog({ onClose }: { onClose: () => void }): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shareState, setShareState] = useState<'copied' | 'error' | 'idle' | 'shared'>('idle');
  const canShare = typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

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
      setShareState('copied');
    } catch {
      setShareState('error');
    }
  };

  const shareInstallLink = async () => {
    if (!canShare) {
      await copyInstallLink();
      return;
    }

    try {
      await navigator.share({
        title: 'CLEVER Driver 설치 안내',
        text: 'CLEVER Driver 설치 안내입니다.',
        url: DRIVER_APP_INSTALL_PAGE_URL,
      });
      setShareState('shared');
    } catch {
      await copyInstallLink();
    }
  };

  return (
    <dialog
      aria-describedby="driver-install-description"
      aria-labelledby="driver-app-install-title"
      className="driver-install-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-install-header">
        <span>
          <strong id="driver-app-install-title">배송원 앱 안내</strong>
          <small>설치 페이지에서 운영체제별 배포 상태를 확인하고 앱에서 직접 회원가입합니다.</small>
        </span>
        <button aria-label="배송원 앱 안내 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
      </header>

      <div className="driver-install-body">
        <div className="driver-install-details">
          <span className="driver-install-section-title"><Download aria-hidden="true" /> CLEVER Driver 설치</span>
          <label>설치 링크
            <input aria-label="배송원 앱 설치 링크" readOnly value={DRIVER_APP_INSTALL_PAGE_URL} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <p id="driver-install-description">설치 후 앱 로그인 화면에서 회원가입을 누르면 됩니다. 일회용 초대 링크는 필요하지 않습니다. 등록된 배송원의 이름과 연락처가 일치하면 배송 업무가 자동으로 연결됩니다.</p>
          <a className="driver-install-open-link" href={DRIVER_APP_INSTALL_PAGE_URL} rel="noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" /> 설치 페이지 열기</a>
          {shareState === 'shared' ? <span className="driver-install-copy-status success" role="status">설치 안내를 전달했습니다.</span> : null}
          {shareState === 'copied' ? <span className="driver-install-copy-status success" role="status">설치 링크를 복사했습니다.</span> : null}
          {shareState === 'error' ? <span className="driver-install-copy-status" role="alert">설치 링크를 복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.</span> : null}
        </div>
      </div>

      <footer className="driver-install-footer">
        <button type="button" onClick={onClose}>닫기</button>
        <button className="primary" type="button" onClick={() => void shareInstallLink()}>
          {canShare ? <Share2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {canShare ? '설치 링크 공유' : '설치 링크 복사'}
        </button>
      </footer>
    </dialog>
  );
}
