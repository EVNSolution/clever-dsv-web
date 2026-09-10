import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { accountPasswordPath, adminAccountSetupPath, adminCustomerDeliveryPath, adminTabs, customerAccountSetupPath, customerDeliveryPath, customerLoginPath, defaultPath, driverAppPath, driverPasswordResetPath, legacyPathMap } from './app-routes';
import type { AppPath } from './app-routes';
import { AdminShell } from './components/AdminShell';
import { AdminAccountSetupPage } from './pages/AdminAccountSetupPage';
import { CustomerAccountSetupPage } from './pages/CustomerAccountSetupPage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { LoginPage } from './pages/LoginPage';
import { apiConfig } from './api/config';
import { AUTH_EXPIRED_EVENT } from './api/auth-session';
import { ApiError } from './api/client';
import { hasRole, logout, restoreSession } from './services/auth';
import type { Principal, PrincipalRole } from './services/auth';
import { MapPreview } from './components/MapPreview';
import { logoutCustomerAccount } from './services/customer-accounts';
import { PasswordChangePage } from './pages/PasswordChangePage';
import { DriverAppInstallPage } from './pages/DriverAppInstallPage';
import { DriverPasswordResetPage } from './pages/DriverPasswordResetPage';

const CustomerDeliveryInquiryPage = lazy(() => import('./pages/CustomerDeliveryInquiryPage').then((module) => ({ default: module.CustomerDeliveryInquiryPage })));

type SessionGate = {
  status: 'checking' | 'ready' | 'blocked';
  message?: string;
};

const SESSION_REVALIDATION_INTERVAL_MS = 60_000;

function readPath(): AppPath {
  const decodedPath = decodeURI(window.location.pathname);
  const path: string = legacyPathMap[decodedPath as keyof typeof legacyPathMap] ?? decodedPath;
  if (path === '/login' || path === driverAppPath || path === driverPasswordResetPath || path === accountPasswordPath || path === customerLoginPath || path === customerAccountSetupPath || path === adminAccountSetupPath || path === adminCustomerDeliveryPath || path === customerDeliveryPath || adminTabs.some((tab) => tab.path === path)) return path as AppPath;
  return defaultPath;
}

function navigate(path: AppPath): void {
  if (decodeURI(window.location.pathname) !== path) window.history.pushState({}, '', path);
}

function isPublicPath(path: AppPath): boolean {
  return path === '/login' || path === driverAppPath || path === driverPasswordResetPath || path === customerLoginPath || path === customerAccountSetupPath || path === adminAccountSetupPath;
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
      navigate(customerLoginPath);
      setPath(customerLoginPath);
      setSessionGate({ status: 'ready' });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
  }, []);

  useEffect(() => {
    if (apiConfig.mode === 'mock' || isPublicPath(path)) {
      setSessionGate({ status: 'ready' });
      return;
    }
    const requiredRole = roleForPath(path);
    if (principal) {
      if (principal.mustChangePassword && path !== accountPasswordPath) {
        navigate(accountPasswordPath);
        setPath(accountPasswordPath);
        return;
      }
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
        if (restoredPrincipal.mustChangePassword && path !== accountPasswordPath) {
          setPrincipal(restoredPrincipal);
          navigate(accountPasswordPath);
          setPath(accountPasswordPath);
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
        if (error instanceof ApiError && error.status === 401) {
          const loginPath = requiredRole === 'CUSTOMER_USER' ? customerLoginPath : '/login';
          navigate(loginPath);
          setPath(loginPath);
          setSessionGate({ status: 'ready' });
          return;
        }
        setSessionGate({ status: 'blocked', message: '세션 정보를 확인할 수 없습니다.' });
      });
    return () => { active = false; };
  }, [path, principal]);

  useEffect(() => {
    if (apiConfig.mode !== 'remote' || isPublicPath(path) || principal === null) return;
    let active = true;
    let checking = false;
    const revalidate = async () => {
      if (!active || checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const restoredPrincipal = await restoreSession();
        if (!active) return;
        if (restoredPrincipal.mustChangePassword && path !== accountPasswordPath) {
          setPrincipal(restoredPrincipal);
          navigate(accountPasswordPath);
          setPath(accountPasswordPath);
          return;
        }
        setPrincipal(restoredPrincipal);
        setSessionGate(accessGateFor(restoredPrincipal, path));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return;
      } finally {
        checking = false;
      }
    };
    const onFocus = () => { void revalidate(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(() => { void revalidate(); }, SESSION_REVALIDATION_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [path, principal?.id]);

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

  function handleCustomerLogout(): void {
    void logoutCustomerAccount().catch(() => undefined).then(() => {
      setPrincipal(null);
      setSessionGate({ status: 'ready' });
      go(customerLoginPath);
    });
  }

  const effectiveSessionGate = apiConfig.mode === 'remote' && !isPublicPath(path) && principal
    ? accessGateFor(principal, path)
    : sessionGate;

  if (path === '/login') return <LoginPage onLogin={() => { setPrincipal(null); setSessionGate({ status: 'checking' }); go(defaultPath); }} />;
  if (path === driverAppPath) return <DriverAppInstallPage />;
  if (path === driverPasswordResetPath) return <DriverPasswordResetPage />;
  if (path === customerLoginPath) return <CustomerLoginPage onLogin={(nextPath) => { setPrincipal(null); setSessionGate({ status: 'checking' }); go(nextPath); }} />;
  if (path === customerAccountSetupPath) return <CustomerAccountSetupPage onComplete={(nextPath) => { setPrincipal(null); setSessionGate({ status: 'checking' }); go(nextPath); }} />;
  if (path === adminAccountSetupPath) return <AdminAccountSetupPage onComplete={(nextPath) => { setPrincipal(null); setSessionGate({ status: 'checking' }); go(nextPath); }} />;
  if (path === accountPasswordPath && effectiveSessionGate.status === 'ready') {
    return <PasswordChangePage onLogout={handleLogout} onUpdated={(updatedPrincipal) => { setPrincipal(updatedPrincipal); setSessionGate({ status: 'ready' }); go(defaultPath); }} />;
  }
  if (effectiveSessionGate.status === 'checking') {
    if (path === '/control') {
      return (
        <AdminShell
          activePath="/control"
          previewOnly
          principalId={principal?.id ?? null}
          principalScopes={principal?.scopes ?? []}
          onNavigate={(nextPath) => go(nextPath)}
          onLogout={handleLogout}
          onSessionUpdate={setPrincipal}
        />
      );
    }
    if (path === customerDeliveryPath || path === adminCustomerDeliveryPath) {
      return (
        <main className="session-map-preview" aria-busy="true" aria-label="세션 확인 중">
          <MapPreview />
        </main>
      );
    }
    return <SessionState label="세션 확인 중" />;
  }
  if (effectiveSessionGate.status === 'blocked') return <SessionState label="세션 차단" message={effectiveSessionGate.message ?? '세션 권한을 확인할 수 없습니다.'} alert />;
  if (path === adminCustomerDeliveryPath) {
    return (
      <Suspense fallback={<CustomerDeliveryFallback />}>
        <CustomerDeliveryInquiryPage
          adminCustomerId={new URLSearchParams(window.location.search).get('customer') ?? undefined}
          principalDisplayName={principal?.displayName ?? undefined}
        />
      </Suspense>
    );
  }
  if (path === customerDeliveryPath) {
    return (
      <Suspense fallback={<CustomerDeliveryFallback />}>
        <CustomerDeliveryInquiryPage onLogout={handleCustomerLogout} principalDisplayName={principal?.displayName ?? undefined} />
      </Suspense>
    );
  }
  if (path === accountPasswordPath) return <SessionState label="비밀번호 변경 준비 중" />;
  return (
    <AdminShell
      key={`${principal?.id}:${principal?.shopId}`}
      activePath={path}
      principalId={principal?.id ?? null}
      principalScopes={principal?.scopes ?? []}
      onNavigate={(nextPath) => go(nextPath)}
      onLogout={handleLogout}
      onSessionUpdate={setPrincipal}
    />
  );
}

function CustomerDeliveryFallback(): ReactElement {
  return (
    <main className="session-map-preview" aria-busy="true" aria-label="배송 조회 불러오는 중">
      <MapPreview />
    </main>
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
  '/inquiries': ['dsv:accounts:read'],
  [adminCustomerDeliveryPath]: ['dsv:customers:read', 'dsv:dispatches:read'],
  [customerDeliveryPath]: ['dsv:customer-deliveries:read'],
  '/login': [],
  [accountPasswordPath]: ['dsv:session:read'],
  [customerLoginPath]: [],
  [customerAccountSetupPath]: [],
  [adminAccountSetupPath]: [],
  [driverAppPath]: [],
  [driverPasswordResetPath]: [],
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
