import React, { useCallback, useEffect, useState } from 'react';

import { createAdminAccessProduct, getAdminAccessProducts, setAdminAccessProductActive } from '../../services/admin';
import type { AdminAccessProductsResponse } from '../../services/admin/types';
import { Badge, Feedback, Panel } from './admin-ui';
import { ApiRequestError } from '../../services/api/client';

const validationMessage = (error: unknown): string => {
  if (error instanceof ApiRequestError && error.status === 400 && error.validationErrors &&
      typeof error.validationErrors === 'object' && !Array.isArray(error.validationErrors)) {
    const messages = Object.entries(error.validationErrors).flatMap(([field, value]) => {
      const text = typeof value === 'string' ? value : Array.isArray(value) ? value.filter((v) => typeof v === 'string').join(' ') : '';
      return text ? [`${field === 'detail' ? '' : `${field}: `}${text}`] : [];
    });
    if (messages.length) return messages.join(' ');
  }
  return error instanceof Error ? error.message : 'The request failed. Please try again.';
};

const AccessProductsPanel: React.FC = () => {
  const [data, setData] = useState<AdminAccessProductsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminAccessProducts();
      setData(response.data);
    } catch (caught) {
      setError(`Could not load products: ${validationMessage(caught)}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await createAdminAccessProduct({
        code, name, price_amount: price, duration_days: Number(duration), confirm_activation: confirmed,
      });
      setData((current) => current && { ...current, products: [...current.products, response.data] });
      setCode(''); setName(''); setPrice(''); setDuration(''); setConfirmed(false);
      setNotice('Product created and active.');
    } catch (caught) {
      setError(validationMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (codeToUpdate: string, active: boolean) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await setAdminAccessProductActive(codeToUpdate, active);
      setData((current) => current && {
        ...current, products: current.products.map((product) => product.code === codeToUpdate ? response.data : product),
      });
      setNotice(`Product ${codeToUpdate} ${active ? 'activated' : 'deactivated'}.`);
    } catch (caught) {
      setError(validationMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <Feedback error>{error}</Feedback>}
      {notice && <Feedback>{notice}</Feedback>}
      <div className="ax-grid">
        <Panel title="Membership products" subtitle="Current and retired checkout products"
          action={<button type="button" onClick={() => void load()} disabled={loading || busy} className="ax-button">Refresh products</button>}>
          {loading && <Feedback>Loading products…</Feedback>}
          {!data && error && <button type="button" onClick={() => void load()} className="ax-button">Retry loading products</button>}
          {data && <ul className="ax-row-list">
            {data.products.map(product => <li key={product.code}>
              <div className="min-w-0 break-words"><strong>{product.name} ({product.code})</strong><p className="ax-muted text-xs">{product.currency} {product.price_amount} · {product.duration_days} days</p>
                <Badge state={product.is_active ? 'active' : 'inactive'} label={product.is_active ? 'Active' : 'Inactive'} /></div>
              <button type="button" disabled={busy || loading} onClick={() => void toggle(product.code, !product.is_active)}
                className="ax-button" aria-label={`${product.is_active ? 'Deactivate' : 'Activate'} ${product.name} (${product.code})`}>
                {product.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </li>)}
            {data.products.length === 0 && <li className="ax-muted">No products configured.</li>}
          </ul>}
        </Panel>
        {data && <Panel title="Create a pass" subtitle="New products are immediately available for purchase. Use a new product code when terms change.">
          <form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Product code
              <input required maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={code} onChange={(e) => setCode(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">Product name
              <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">Price (ZAR; minimum {data.minimumPrice})
              <input required type="number" min={data.minimumPrice} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">Duration (days)
              <input required type="number" min="1" max="32767" step="1" value={duration} onChange={(e) => setDuration(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input required type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I confirm this product will be active immediately.
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy || loading || !confirmed} className="ax-button ax-primary">
                Create active product
              </button>
            </div>
          </form>
          <p className="ax-muted mt-3 text-xs">Retiring a product leaves existing purchases and access in place.</p>
        </Panel>}
      </div>
    </>
  );
};

export default AccessProductsPanel;
