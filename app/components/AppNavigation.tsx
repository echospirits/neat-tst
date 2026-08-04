'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  matchAccountSection?: boolean;
};

type NavGroup = {
  items: NavItem[];
  label: string;
};

const workItems: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/alerts', label: 'Worklist' },
  { href: '/my-week', label: 'My Week' },
  { href: '/visits', label: 'Visit History' },
];

const accountItems: NavItem[] = [
  { href: '/accounts', label: 'Accounts Overview' },
  { href: '/agencies', label: 'Agencies' },
  { href: '/wholesale', label: 'Wholesale' },
  { href: '/targets', label: 'Target Queue' },
];

const adminItems: NavItem[] = [
  { href: '/users', label: 'Users' },
  { href: '/admin/target-import', label: 'Target Import' },
  { href: '/admin/data-status', label: 'Data Health' },
  { href: '/admin/weekly-digest', label: 'Weekly Digest' },
];

const mobileItems: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/alerts', label: 'Work' },
  { href: '/accounts', label: 'Accounts', matchAccountSection: true },
  { href: '/visits', label: 'Visits' },
];

const isActivePath = (pathname: string, item: NavItem) => {
  if (item.href === '/') return pathname === '/';
  if (item.href === '/visits') return pathname === item.href;
  if (item.matchAccountSection) {
    return ['/accounts', '/agencies', '/wholesale', '/targets', '/tags'].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = isActivePath(pathname, item);

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={isActive ? 'app-nav-link is-active' : 'app-nav-link'}
      href={item.href}
    >
      {item.label}
    </Link>
  );
}

function NavGroupLinks({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <section className="app-nav-group">
      <p className="app-nav-label">{group.label}</p>
      {group.items.map((item) => (
        <NavLink item={item} key={item.href} pathname={pathname} />
      ))}
    </section>
  );
}

export function AppSidebarNavigation({ isAdmin, isTaster }: { isAdmin: boolean; isTaster: boolean }) {
  const pathname = usePathname();

  if (isTaster) {
    return (
      <nav aria-label="Primary navigation" className="app-sidebar-nav">
        <Link aria-current="page" className="app-nav-link app-nav-primary" href="/visits/new">
          Log Visit
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary navigation" className="app-sidebar-nav">
      <Link
        aria-current={pathname === '/visits/new' ? 'page' : undefined}
        className="app-nav-link app-nav-primary"
        href="/visits/new"
      >
        <span aria-hidden="true">＋</span>
        Log Visit
      </Link>

      <NavGroupLinks group={{ label: 'My work', items: workItems }} pathname={pathname} />
      <NavGroupLinks group={{ label: 'Accounts', items: accountItems }} pathname={pathname} />

      {isAdmin ? (
        <details
          className="app-nav-disclosure"
          open={pathname === '/users' || pathname.startsWith('/admin/') ? true : undefined}
        >
          <summary>Administration</summary>
          <div className="app-nav-disclosure-links">
            {adminItems.map((item) => (
              <NavLink item={item} key={item.href} pathname={pathname} />
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}

const getBreadcrumbs = (pathname: string): NavItem[] => {
  if (pathname === '/') return [];

  const home = { href: '/', label: 'Home' };
  const routeMap: Array<{ prefix: string; crumbs: NavItem[] }> = [
    { prefix: '/visits/new', crumbs: [{ href: '/visits/new', label: 'Log Visit' }] },
    { prefix: '/visits/confirmed', crumbs: [{ href: '/visits', label: 'Visits' }, { href: pathname, label: 'Confirmed' }] },
    { prefix: '/visits', crumbs: [{ href: '/visits', label: 'Visit History' }] },
    { prefix: '/alerts', crumbs: [{ href: '/alerts', label: 'Worklist' }] },
    { prefix: '/my-week', crumbs: [{ href: '/alerts', label: 'My Work' }, { href: '/my-week', label: 'My Week' }] },
    { prefix: '/agencies/', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/agencies', label: 'Agencies' }, { href: pathname, label: 'Agency' }] },
    { prefix: '/agencies', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/agencies', label: 'Agencies' }] },
    { prefix: '/wholesale/', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/wholesale', label: 'Wholesale' }, { href: pathname, label: 'Account' }] },
    { prefix: '/wholesale', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/wholesale', label: 'Wholesale' }] },
    { prefix: '/targets', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/targets', label: 'Target Queue' }] },
    { prefix: '/tags', crumbs: [{ href: '/accounts', label: 'Accounts' }, { href: '/tags', label: 'Tags' }] },
    { prefix: '/accounts', crumbs: [{ href: '/accounts', label: 'Accounts' }] },
    { prefix: '/users', crumbs: [{ href: '/users', label: 'Administration' }, { href: '/users', label: 'Users' }] },
    { prefix: '/admin/target-import', crumbs: [{ href: '/users', label: 'Administration' }, { href: pathname, label: 'Target Import' }] },
    { prefix: '/admin/data-status', crumbs: [{ href: '/users', label: 'Administration' }, { href: pathname, label: 'Data Health' }] },
    { prefix: '/admin/weekly-digest', crumbs: [{ href: '/users', label: 'Administration' }, { href: pathname, label: 'Weekly Digest' }] },
    { prefix: '/profile', crumbs: [{ href: '/profile', label: 'Profile' }] },
  ];
  const match = routeMap.find((route) => pathname === route.prefix || pathname.startsWith(route.prefix));

  return [home, ...(match?.crumbs ?? [])];
};

export function AppBreadcrumbs({ isTaster }: { isTaster: boolean }) {
  const pathname = usePathname();
  const breadcrumbs = isTaster ? [] : getBreadcrumbs(pathname);

  if (breadcrumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="app-breadcrumbs">
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <span key={`${item.href}-${index}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {isLast ? <strong aria-current="page">{item.label}</strong> : <Link href={item.href}>{item.label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

export function MobileTabbar({ isAdmin, isTaster }: { isAdmin: boolean; isTaster: boolean }) {
  const pathname = usePathname();

  if (isTaster) return null;

  return (
    <nav className="mobile-tabbar" aria-label="Quick field actions">
      {mobileItems.map((item) => (
        <NavLink item={item} key={item.href} pathname={pathname} />
      ))}
      <details className="mobile-more">
        <summary>More</summary>
        <div className="mobile-more-menu">
          <NavLink item={{ href: '/my-week', label: 'My Week' }} pathname={pathname} />
          <NavLink item={{ href: '/agencies', label: 'Agencies' }} pathname={pathname} />
          <NavLink item={{ href: '/wholesale', label: 'Wholesale' }} pathname={pathname} />
          <NavLink item={{ href: '/targets', label: 'Target Queue' }} pathname={pathname} />
          <NavLink item={{ href: '/tags', label: 'Tags' }} pathname={pathname} />
          <NavLink item={{ href: '/profile', label: 'Profile' }} pathname={pathname} />
          {isAdmin ? <NavLink item={{ href: '/users', label: 'Administration' }} pathname={pathname} /> : null}
        </div>
      </details>
    </nav>
  );
}
