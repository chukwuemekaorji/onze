import { DealtCard } from '../report/DealtCard.js';
import { PriceAlertsCard } from '../report/PriceAlertsCard.js';
import { BinderPage } from './BinderPage.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

export function PricesPage({ shown, focusTitle }: BinderPageProps) {
  return (
    <BinderPage title="Prices" focusTitle={focusTitle} className="prices-page">
      <p className="page-lede">
        Expected rises and falls for players in your squad. FPL's price changes are
        secret, so these are signals, not promises.
      </p>
      <DealtCard cardKey="price-alerts" order={0} dealt={false}>
        <PriceAlertsCard
          alerts={shown.summary.priceAlerts.alerts}
          note={aiNote(shown, 'priceAlerts')}
        />
      </DealtCard>
    </BinderPage>
  );
}
