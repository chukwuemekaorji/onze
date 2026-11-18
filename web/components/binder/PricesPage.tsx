import { DealtCard } from '../report/DealtCard.js';
import { PriceAlertsCard } from '../report/PriceAlertsCard.js';
import { BinderPage } from './BinderPage.js';
import { aiNote } from './page-props.js';
import type { BinderPageProps } from './page-props.js';

export function PricesPage({ shown, focusTitle }: BinderPageProps) {
  return (
    <BinderPage title="Prices" focusTitle={focusTitle} className="prices-page">
      <p className="page-lede">
        Price moves in your squad this gameweek, and players being heavily bought or
        sold. FPL only shares transfer totals for the whole gameweek and keeps its price
        rules secret, so demand is a signal, not a prediction for tonight.
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
