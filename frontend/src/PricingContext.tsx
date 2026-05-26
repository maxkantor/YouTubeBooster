import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { publicApi } from './lib/api';
import { formatPriceLabel } from './config/pricing';

type PricingState = {
  loading: boolean;
  error: string | null;
  /** backend-reported amount (display is formatted separately) */
  oneTimePrice: string;
  currency: string;
  /** e.g. "$9.99" for USD */
  oneTimePriceLabel: string;
  refresh: () => Promise<void>;
};

const Ctx = createContext<PricingState | null>(null);

export function PricingProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oneTimePrice, setOneTimePrice] = useState('9.99');
  const [currency, setCurrency] = useState('USD');

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await publicApi.getPricing();
      if (data.oneTimePrice) setOneTimePrice(data.oneTimePrice);
      if (data.currency) setCurrency(data.currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load pricing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const oneTimePriceLabel = useMemo(
    () => formatPriceLabel(oneTimePrice, currency),
    [oneTimePrice, currency]
  );

  const value = useMemo<PricingState>(
    () => ({
      loading,
      error,
      oneTimePrice,
      currency,
      oneTimePriceLabel,
      refresh
    }),
    [loading, error, oneTimePrice, currency, oneTimePriceLabel, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePricing(): PricingState {
  const v = useContext(Ctx);
  if (!v) {
    return {
      loading: false,
      error: null,
      oneTimePrice: '9.99',
      currency: 'USD',
      oneTimePriceLabel: formatPriceLabel('9.99', 'USD'),
      refresh: async () => undefined
    };
  }
  return v;
}
