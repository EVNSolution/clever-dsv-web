import type { ReactElement } from 'react';
import { Download, ShieldCheck, Smartphone } from 'lucide-react';

import { DRIVER_ANDROID_DOWNLOAD_URL } from '../config/driver-app';

export function DriverAppInstallPage(): ReactElement {
  return (
    <main className="driver-app-page">
      <section className="driver-app-card" aria-labelledby="driver-app-title">
        <header className="driver-app-brand">
          <span><b>Clever</b> Driver</span>
          <small>DSV 배송원 앱</small>
        </header>

        <div className="driver-app-hero">
          <span className="driver-app-hero-icon"><Smartphone aria-hidden="true" /></span>
          <p className="driver-app-eyebrow">공식 설치 페이지</p>
          <h1 id="driver-app-title">CLEVER Driver 설치</h1>
          <p>운영체제별 배포 상태를 확인하고 앱을 설치한 뒤, 로그인 화면의 <strong>회원가입</strong>을 누르세요.</p>
        </div>

        <section className="driver-app-platform" aria-labelledby="driver-android-title">
          <div>
            <span className="driver-app-platform-label">Android</span>
            <h2 id="driver-android-title">Android 설치 파일</h2>
            <p>아래 버튼에서 최신 정식 APK를 직접 내려받습니다.</p>
          </div>
          <a className="driver-app-store-link" href={DRIVER_ANDROID_DOWNLOAD_URL}>
            <Download aria-hidden="true" /> Android 설치 파일 받기
          </a>
        </section>

        <ol className="driver-app-steps" aria-label="설치 순서">
          <li><span>1</span><p><strong>설치 파일 받기</strong>위 Android 버튼을 누릅니다.</p></li>
          <li><span>2</span><p><strong>설치 허용</strong>휴대전화가 묻는 경우 이 출처의 앱 설치를 허용합니다.</p></li>
          <li><span>3</span><p><strong>회원가입</strong>앱에서 이름, 휴대전화 번호, 로그인 아이디와 비밀번호를 입력합니다.</p></li>
          <li><span>4</span><p><strong>배송 업무 연결</strong>DSV에 등록된 활성 배송원의 이름과 휴대전화 번호가 모두 일치하면 배송 업무가 자동으로 연결됩니다. 일치 정보가 없으면 연결 대기 상태로 가입됩니다.</p></li>
        </ol>

        <section className="driver-app-platform driver-app-guide" aria-labelledby="driver-guide-title">
          <div>
            <span className="driver-app-platform-label">PDF 가이드</span>
            <h2 id="driver-guide-title">설치 및 현장 교육 가이드</h2>
            <p>설치, 회원가입, 권한 설정과 배송 업무 절차를 확인할 수 있습니다.</p>
          </div>
          <a className="driver-app-store-link" href="/api/dsv/public/guides/driver?download=1">
            <Download aria-hidden="true" /> PDF 가이드 다운로드
          </a>
        </section>

        <section className="driver-app-ios" aria-labelledby="driver-ios-title">
          <span className="driver-app-platform-label">iPhone</span>
          <h2 id="driver-ios-title">아이폰 버전</h2>
          <p>아이폰용 CLEVER Driver는 전용 App Store 설치 링크 승인을 기다리고 있습니다. 승인 전에는 이 페이지에서 설치 링크를 제공하지 않습니다.</p>
        </section>

        <footer className="driver-app-trust">
          <ShieldCheck aria-hidden="true" /> DSV 공식 주소에서 제공하는 CLEVER Driver 설치 페이지입니다.
        </footer>
      </section>
    </main>
  );
}
