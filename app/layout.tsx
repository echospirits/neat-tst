import { getCurrentUser, getUserDisplayName } from '../lib/auth';
import { getTenantConfig } from '../lib/tenantConfig';
import { isTasterRole } from '../lib/userAccess';
import { AppSidebarNavigation, MobileTabbar } from './components/AppNavigation';
import './styles.css';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const tenantConfig = getTenantConfig();
  const isTaster = user ? isTasterRole(user.role) : false;

  return (
    <html lang="en">
      <body>
        {user ? (
          <>
            <aside>
              <h2>{tenantConfig.entityName}</h2>
              <AppSidebarNavigation isAdmin={user.role === 'ADMIN'} isTaster={isTaster} />
              <div className="user-card">
                <span className="muted">Signed in as</span>
                <strong>{getUserDisplayName(user)}</strong>
                <span className="pill">{user.role === 'ADMIN' ? 'Admin' : isTaster ? 'Taster' : 'User'}</span>
                <form action="/api/auth/logout" method="post">
                  <button className="secondary" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            </aside>
            <main>{children}</main>
            <a className="fab" href="/visits/new" aria-label="Log Visit">
              +
            </a>
            <MobileTabbar isTaster={isTaster} />
          </>
        ) : (
          <main className="public-main">{children}</main>
        )}
      </body>
    </html>
  );
}
