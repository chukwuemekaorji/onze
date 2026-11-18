import { ROUTES } from '../../router.js';
import type { RouteId } from '../../router.js';
import { RouteLink } from '../RouteLink.js';

interface BinderTabsProps {
  active: RouteId;
}

/** index tabs on the binder's edge; plain links, so tab and enter just work */
export function BinderTabs({ active }: BinderTabsProps) {
  return (
    <nav className="binder-tabs" aria-label="Report sections">
      <ul className="binder-tabs__list">
        {ROUTES.map((route) => (
          <li key={route.id} className="binder-tabs__item">
            <RouteLink
              to={route.path}
              className="binder-tabs__tab"
              aria-current={route.id === active ? 'page' : undefined}
            >
              {route.label}
            </RouteLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
