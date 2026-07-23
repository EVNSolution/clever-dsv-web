import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { adminTabs, customerDeliveryPath, defaultPath, legacyPathMap } from './app-routes';
import type { AppPath } from './app-routes';
import { CustomerDeliveryInquiryPage } from './pages/CustomerDeliveryInquiryPage';
import { AdminShell } from './components/AdminShell';
import { LoginPage } from './pages/LoginPage';
import { apiConfig } from './api/config';
import { hasRole, restoreSession } from './services/auth';
import type { PrincipalRole } from './services/auth';

type SessionGate = {
  status: 'checking' | 'ready' | 'blocked';
  message?: string;
};

function readPath(): AppPath {
  const decodedPath = decodeURI(window.location.pathname);
  const path: string = legacyPathMap[decodedPath as keyof typeof legacyPathMap] ?? decodedPath;
  if (path === '/login' || path === customerDeliveryPath || adminTabs.some((tab) => tab.path === path)) return path as AppPath;
  return defaultPath;
}

function navigate(path: AppPath): void {
  if (decodeURI(window.location.pathname) !== path) window.history.pushState({}, '', path);
}

export function App(): ReactElement {
  const [path, setPath] = useState(readPath);
  const [sessionGate, setSessionGate] = useState<SessionGate>(() => apiConfig.mode === 'mock' ? { status: 'ready' } : { status: 'checking' });

  useEffect(() => {
    const sync = () => setPath(readPath());
    if (decodeURI(window.location.pathname) !== path) window.history.replaceState({}, '', path);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [path]);

  useEffect(() => {
    if (apiConfig.mode === 'mock' || path === '/login') {
      setSessionGate({ status: 'ready' });
      return;
    }
    const requiredRole = roleForPath(path);
    let active = true;
    setSessionGate({ status: 'checking' });
    restoreSession()
      .then((principal) => {
        if (!active) return;
        if (hasRole(principal, requiredRole)) {
          setSessionGate({ status: 'ready' });
          return;
        }
        if (requiredRole === 'DSV_ADMIN') {
          navigate('/login');
          setPath('/login');
          setSessionGate({ status: 'ready' });
          return;
        }
        setSessionGate({ status: 'blocked', message: '고객 계정 권한이 확인되지 않아 배송 조회를 표시하지 않습니다.' });
      })
      .catch(() => {
        if (!active) return;
        if (requiredRole === 'DSV_ADMIN') {
          navigate('/login');
          setPath('/login');
          setSessionGate({ status: 'ready' });
          return;
        }
        setSessionGate({ status: 'blocked', message: '고객 세션을 확인할 수 없어 배송 조회를 표시하지 않습니다.' });
      });
    return () => { active = false; };
  }, [path]);

  function go(nextPath: AppPath): void {
    navigate(nextPath);
    setPath(nextPath);
  }

  if (path === '/login') return <LoginPage onLogin={() => { setSessionGate({ status: 'checking' }); go(defaultPath); }} />;
  if (sessionGate.status === 'checking') return <SessionState label={path === customerDeliveryPath ? '고객 세션 확인' : '관리자 세션 확인'} message={path === customerDeliveryPath ? '고객 세션 권한을 확인하고 있습니다.' : '관리자 세션 권한을 확인하고 있습니다.'} />;
  if (sessionGate.status === 'blocked') return <SessionState label="세션 차단" message={sessionGate.message ?? '세션 권한을 확인할 수 없습니다.'} alert />;
  if (path === customerDeliveryPath) return <CustomerDeliveryInquiryPage />;
  return <AdminShell activePath={path} onNavigate={(nextPath) => go(nextPath)} />;
}

function roleForPath(path: AppPath): PrincipalRole {
  return path === customerDeliveryPath ? 'CUSTOMER_USER' : 'DSV_ADMIN';
}

function SessionState({ alert = false, label, message }: { alert?: boolean; label: string; message: string }): ReactElement {
  return (
    <main className="login-screen" aria-label={label}>
      <p role={alert ? 'alert' : 'status'}>{message}</p>
    </main>
  );
}
