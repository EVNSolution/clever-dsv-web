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
          <p>아래 버튼으로 앱을 설치한 뒤, 로그인 화면의 <strong>회원가입</strong>을 누르세요.</p>
        </div>

        <section className="driver-app-platform" aria-labelledby="driver-android-title">
          <div>
            <span className="driver-app-platform-label">Android</span>
            <h2 id="driver-android-title">갤럭시 등 안드로이드 휴대전화</h2>
            <p>항상 같은 주소에서 최신 정식 APK를 내려받습니다.</p>
          </div>
          <a className="driver-app-download" href={DRIVER_ANDROID_DOWNLOAD_URL}>
            <Download aria-hidden="true" /> Android 설치 파일 받기
          </a>
        </section>

        <ol className="driver-app-steps" aria-label="설치 순서">
          <li><span>1</span><p><strong>설치 파일 받기</strong>위 Android 버튼을 누릅니다.</p></li>
          <li><span>2</span><p><strong>설치 허용</strong>휴대전화가 묻는 경우 이 출처의 앱 설치를 허용합니다.</p></li>
          <li><span>3</span><p><strong>회원가입</strong>앱을 열고 이름과 휴대전화 번호로 계정을 만듭니다.</p></li>
        </ol>

        <section className="driver-app-ios" aria-labelledby="driver-ios-title">
          <span className="driver-app-platform-label">iPhone</span>
          <h2 id="driver-ios-title">아이폰 버전</h2>
          <p>TestFlight 설치 경로를 준비 중입니다. 배포가 열리면 이 페이지에 설치 버튼이 표시됩니다.</p>
        </section>

        <footer className="driver-app-trust">
          <ShieldCheck aria-hidden="true" /> DSV 공식 주소에서 제공하는 CLEVER Driver 설치 페이지입니다.
        </footer>
      </section>
    </main>
  );
}
