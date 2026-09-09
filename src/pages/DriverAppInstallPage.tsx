import type { ReactElement } from 'react';
import { Download, ExternalLink, ShieldCheck, Smartphone } from 'lucide-react';

import { DRIVER_ANDROID_PLAY_URL, DRIVER_IOS_APP_STORE_URL } from '../config/driver-app';

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
          <p>사용 중인 휴대전화에 맞는 스토어를 선택하세요.</p>
        </div>

        <div className="driver-app-store-grid" aria-label="운영체제별 설치">
          <section className="driver-app-platform" aria-labelledby="driver-android-title">
            <div>
              <span className="driver-app-platform-label">Android</span>
              <h2 id="driver-android-title">Google Play</h2>
              <p>Google Play에서 최신 정식 버전을 설치하거나 업데이트합니다.</p>
            </div>
            <a className="driver-app-store-link" href={DRIVER_ANDROID_PLAY_URL} rel="noopener noreferrer" target="_blank">
              <ExternalLink aria-hidden="true" /> Google Play에서 설치 및 업데이트
            </a>
          </section>

          <section className="driver-app-platform" aria-labelledby="driver-ios-title">
            <div>
              <span className="driver-app-platform-label">iPhone</span>
              <h2 id="driver-ios-title">App Store</h2>
              <p>검색 결과 대신 전용 링크에서 설치하거나 업데이트합니다.</p>
            </div>
            <a className="driver-app-store-link" href={DRIVER_IOS_APP_STORE_URL} rel="noopener noreferrer" target="_blank">
              <ExternalLink aria-hidden="true" /> App Store에서 설치 및 업데이트
            </a>
          </section>
        </div>

        <section className="driver-app-details" aria-labelledby="driver-details-title">
          <div className="driver-app-section-heading">
            <span className="driver-app-platform-label">설치 후 안내</span>
            <h2 id="driver-details-title">앱 설치 후 회원가입</h2>
          </div>
          <ol className="driver-app-steps" aria-label="설치 후 이용 순서">
            <li><span>1</span><p><strong>앱 설치</strong>사용 중인 휴대전화의 스토어에서 앱을 설치합니다.</p></li>
            <li><span>2</span><p><strong>회원가입</strong>이름, 휴대전화 번호, 로그인 아이디와 비밀번호를 입력합니다.</p></li>
            <li><span>3</span><p><strong>배송 업무 연결</strong>DSV에 등록된 활성 배송원의 이름과 휴대전화 번호가 모두 일치하면 배송 업무가 자동으로 연결됩니다. 일치 정보가 없으면 연결 대기 상태로 가입됩니다.</p></li>
          </ol>
        </section>

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

        <footer className="driver-app-trust">
          <ShieldCheck aria-hidden="true" /> DSV 공식 주소에서 제공하는 CLEVER Driver 설치 페이지입니다.
        </footer>
      </section>
    </main>
  );
}
