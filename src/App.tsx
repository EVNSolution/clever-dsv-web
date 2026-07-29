import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { adminTabs, customerDeliveryPath, defaultPath, legacyPathMap } from './app-routes';
import type { AppPath } from './app-routes';
import { CustomerDeliveryInquiryPage } from './pages/CustomerDeliveryInquiryPage';
import { AdminShell } from './components/AdminShell';
import { LoginPage } from './pages/LoginPage';
import { apiConfig } from './api/config';
import { AUTH_EXPIRED_EVENT } from './api/auth-session';
import { ApiError } from './api/client';
import { hasRole, logout, restoreSession } from './services/auth';
import type { Principal, PrincipalRole } from './services/auth';
import { MapPreview } from './components/MapPreview';

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
  const [principal, setPrincipal] = useState<Principal | null>(null);

  useEffect(() => {
    const sync = () => setPath(readPath());
    if (decodeURI(window.location.pathname) !== path) window.history.replaceState({}, '', path);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [path]);

  useEffect(() => {
    const expire = () => {
      setPrincipal(null);
      const currentPath = readPath();
      if (roleForPath(currentPath) === 'DSV_ADMIN') {
        navigate('/login');
        setPath('/login');
        setSessionGate({ status: 'ready' });
        return;
      }
      setSessionGate({ status: 'blocked', message: '고객 세션이 만료되어 배송 조회를 표시하지 않습니다.' });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
  }, []);

  useEffect(() => {
    if (apiConfig.mode === 'mock' || path === '/login') {
      setSessionGate({ status: 'ready' });
      return;
    }
    const requiredRole = roleForPath(path);
    if (principal) {
      setSessionGate(accessGateFor(principal, path));
      return;
    }
    let active = true;
    setSessionGate({ status: 'checking' });
    restoreSession()
      .then((restoredPrincipal) => {
        if (!active) return;
        if (!hasRole(restoredPrincipal, requiredRole)) {
          setSessionGate({ status: 'blocked', message: '이 계정은 현재 화면을 볼 수 없습니다.' });
          return;
        }
        if (!hasRequiredScopes(restoredPrincipal, path)) {
          setSessionGate({ status: 'blocked', message: '이 계정에는 현재 화면의 조회 권한이 없습니다.' });
          return;
        }
        setPrincipal(restoredPrincipal);
        setSessionGate({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (requiredRole === 'DSV_ADMIN' && error instanceof ApiError && error.status === 401) {
          navigate('/login');
          setPath('/login');
          setSessionGate({ status: 'ready' });
          return;
        }
        setSessionGate({ status: 'blocked', message: '세션 정보를 확인할 수 없습니다.' });
      });
    return () => { active = false; };
  }, [path, principal]);

  function go(nextPath: AppPath): void {
    navigate(nextPath);
    setPath(nextPath);
  }

  function handleLogout(): void {
    void logout().catch(() => undefined).then(() => {
      setPrincipal(null);
      setSessionGate({ status: 'ready' });
      go('/login');
    });
  }

  const effectiveSessionGate = apiConfig.mode === 'remote' && path !== '/login' && principal
    ? accessGateFor(principal, path)
    : sessionGate;

  if (path === '/login') return <LoginPage onLogin={() => { setPrincipal(null); setSessionGate({ status: 'checking' }); go(defaultPath); }} />;
  if (effectiveSessionGate.status === 'checking') {
    if (path === '/control') {
      return (
        <AdminShell
          activePath="/control"
          previewOnly
          onNavigate={(nextPath) => go(nextPath)}
          onLogout={handleLogout}
        />
      );
    }
    if (path === customerDeliveryPath) {
      return (
        <main className="session-map-preview" aria-busy="true" aria-label="세션 확인 중">
          <MapPreview />
        </main>
      );
    }
    return <SessionState label="세션 확인 중" />;
  }
  if (effectiveSessionGate.status === 'blocked') return <SessionState label="세션 차단" message={effectiveSessionGate.message ?? '세션 권한을 확인할 수 없습니다.'} alert />;
  if (path === customerDeliveryPath) return <CustomerDeliveryInquiryPage />;
  return (
    <AdminShell
      activePath={path}
      onNavigate={(nextPath) => go(nextPath)}
      onLogout={handleLogout}
    />
  );
}

function roleForPath(path: AppPath): PrincipalRole {
  return path === customerDeliveryPath ? 'CUSTOMER_USER' : 'DSV_ADMIN';
}

const requiredScopesByPath: Record<AppPath, string[]> = {
  '/control': ['dsv:control:read'],
  '/dispatch': ['dsv:dispatches:read'],
  '/records': ['dsv:records:read'],
  '/master-data': [
    'dsv:resources:read',
    'dsv:customers:read',
    'dsv:destinations:read',
    'dsv:conditions:read',
  ],
  '/settings': ['dsv:settings:read'],
  [customerDeliveryPath]: ['dsv:customer-deliveries:read'],
  '/login': [],
};

function hasRequiredScopes(principal: Principal, path: AppPath): boolean {
  const scopes = requiredScopesByPath[path] ?? [];
  return scopes.every((scope) => principal.scopes.includes(scope));
}

function accessGateFor(principal: Principal, path: AppPath): SessionGate {
  if (!hasRole(principal, roleForPath(path))) return { status: 'blocked', message: '이 계정은 현재 화면을 볼 수 없습니다.' };
  if (!hasRequiredScopes(principal, path)) return { status: 'blocked', message: '이 계정에는 현재 화면의 조회 권한이 없습니다.' };
  return { status: 'ready' };
}

function SessionState({ alert = false, label, message }: { alert?: boolean; label: string; message?: string }): ReactElement {
  return (
    <main className="session-screen" aria-label={label}>
      {message ? <p role={alert ? 'alert' : 'status'}>{message}</p> : null}
    </main>
  );
}
