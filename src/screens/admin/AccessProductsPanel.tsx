import React, { useCallback, useEffect, useState } from 'react';

import { createAdminAccessProduct, getAdminAccessProducts, setAdminAccessProductActive } from '../../services/admin';
import type { AdminAccessProductsResponse } from '../../services/admin/types';
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
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await getAdminAccessProducts();
      setData(response.data);
    } catch (caught) {
      setError(`Could not load products: ${validationMessage(caught)}`);
    }
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
    <section aria-labelledby="access-products-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="access-products-heading" className="text-lg font-bold">Membership products</h2>
      <p className="mt-2 text-sm text-slate-600">
        New products are immediately available for purchase. Product terms cannot be edited; create a product
        with a new code and deactivate the old one to change them. Deactivation does not cancel existing purchases.
        Payment gateway configuration is separate.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-teal-700">{notice}</p>}
      {!data ? (
        <button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-teal-700">
          Retry loading products
        </button>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {data.products.map((product) => (
              <li key={product.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <span>{product.name} ({product.code}) — {product.currency} {product.price_amount}, {product.duration_days} days — {product.is_active ? 'Active' : 'Inactive'}</span>
                <button type="button" disabled={busy} onClick={() => void toggle(product.code, !product.is_active)}
                  aria-label={`${product.is_active ? 'Deactivate' : 'Activate'} ${product.name} (${product.code})`}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50">
                  {product.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </li>
            ))}
            {!data.products.length && <li className="text-sm text-slate-500">No products configured.</li>}
          </ul>
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
              <button type="submit" disabled={busy || !confirmed} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Create active product
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
};

export default AccessProductsPanel;
