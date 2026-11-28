import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { getMe, isAccessActive } from '../../services/access';
import type { MeResponse } from '../../services/access/types';
import { useAuth } from '../../services/auth/AuthProvider';
import { getOfficialHistory, getOfficialPreview, getOfficialSummary, getOfficialToday } from '../../services/official';
import { PredictionArchive, PreviousPicks, PublishedLists, TrackRecord } from './OfficialArchive';
import { DailyList } from './OfficialDailyList';
import { FeaturedMatch, ForecastNotes } from './OfficialFeaturedMatch';
import { control, panel } from './OfficialMatchCard';

type Resource<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

function useOfficialResource<T>(request: () => Promise<{ data: T }>, enabled: boolean, key = 0) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: number; resource: Resource<T> }>();
  const cache = useRef(new Map<number, T>());
  const inFlight = useRef(new Map<number, Promise<T>>());

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const cached = cache.current.get(key);
    if (cached !== undefined) {
      setResult({ key, resource: { status: 'ready', data: cached } });
      return;
    }
    setResult({ key, resource: { status: 'loading' } });
    let pending = inFlight.current.get(key);
    if (!pending) {
      pending = request().then(({ data }) => {
        // Keep a few recently loaded pages while browsing across tabs.
        if (cache.current.size >= 5) {
          const oldest = cache.current.keys().next();
          if (!oldest.done) cache.current.delete(oldest.value);
        }
        cache.current.set(key, data);
        return data;
      }).finally(() => { inFlight.current.delete(key); });
      inFlight.current.set(key, pending);
    }
    void pending.then(
      data => { if (active) setResult({ key, resource: { status: 'ready', data } }); },
      () => { if (active) setResult({ key, resource: { status: 'error' } }); },
    );
    return () => { active = false; };
  }, [attempt, enabled, key, request]);

  const resource: Resource<T> = result?.key === key ? result.resource : { status: 'loading' };
  return { resource, retry: () => setAttempt(value => value + 1) };
}

function Feed<T>({ feed, label, children }: {
  feed: { resource: Resource<T>; retry: () => void };
  label: string;
  children: (data: T) => React.ReactNode;
}) {
  if (feed.resource.status === 'ready') return <>{children(feed.resource.data)}</>;
  return (
    <div className={`${panel} p-5`}>
      {feed.resource.status === 'loading' ? (
        <>
          <p role="status" className="text-sm text-slate-300">Loading {label}…</p>
          <div aria-hidden="true" className="mt-4 space-y-3 motion-safe:animate-pulse">
            <div className="h-4 w-2/5 rounded bg-slate-700" />
            <div className="h-3 w-3/4 rounded bg-slate-700" />
            <div className="h-3 w-1/2 rounded bg-slate-700" />
          </div>
        </>
      ) : (
        <>
          <p role="alert" className="text-sm text-rose-200">We could not load {label}. Please try again.</p>
          <button type="button" className={`${control} mt-3`} onClick={feed.retry}>Try again</button>
        </>
      )}
    </div>
  );
}

const PremiumDiscovery: React.FC = () => {
  const uid = useAuth().user?.uid;
  const [access, setAccess] = useState<{ uid: string; me: MeResponse }>();
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void getMe().then(
      ({ data }) => { if (active) setAccess({ uid, me: data }); },
      () => { if (active) setAccess(undefined); },
    );
    return () => { active = false; };
  }, [uid]);
  const premium = access && access.uid === uid && isAccessActive(access.me);
  return (
    <aside className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5">
      <div>
        <h2 className="text-lg font-bold">Want to analyse your own leagues?</h2>
        <p className="mt-1 text-sm text-slate-200">{premium
          ? 'Choose your leagues and create a new set of personalised predictions.'
          : 'Unlock premium access to choose your leagues and generate personalised predictions.'}</p>
      </div>
      <Link to={premium ? '/BetAndFixturesScreen' : '/access'} className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-300 px-4 text-sm font-bold text-slate-900 hover:bg-emerald-200">
        {premium ? 'Generate Predictions' : 'Explore Premium Access'} <span aria-hidden="true" className="ml-2">↗</span>
      </Link>
    </aside>
  );
};

const tabs = [
  { key: 'today', to: '/history', label: 'Today’s Picks' },
  { key: 'previous', to: '/history?view=past', label: 'Previous Picks' },
  { key: 'predictions', to: '/history?view=predictions', label: 'Prediction History' },
];

const OfficialHistoryScreen: React.FC = () => {
  const { hash, search } = useLocation();
  const params = new URLSearchParams(search);
  const mode = params.get('view');
  const view = mode === 'past' || mode === 'archive' ? 'previous' : mode === 'predictions' ? 'predictions' : 'today';
  const pageParam = Number(params.get('page'));
  const page = mode !== 'past' && Number.isSafeInteger(pageParam) && pageParam >= 1 ? pageParam : 1;
  const showToday = view === 'today';
  const requestHistory = useCallback(() => getOfficialHistory(page), [page]);
  const today = useOfficialResource(getOfficialToday, showToday);
  const preview = useOfficialResource(getOfficialPreview, showToday);
  const history = useOfficialResource(requestHistory, !showToday, page);
  const summary = useOfficialResource(getOfficialSummary, view === 'predictions');
  const featuredRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hash === '#featured-match' && showToday) {
      featuredRef.current?.focus({ preventScroll: true });
      featuredRef.current?.scrollIntoView?.();
    } else {
      document.documentElement.scrollTop = 0;
    }
  }, [hash, mode, page, showToday]);

  return (
    <main className="min-h-screen bg-[#0d1626] pb-12 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <header className="py-7 sm:py-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-emerald-200">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" />
            </svg>
            Free access
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Results &amp; Daily Picks</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Explore daily football selections, previous predictions and actual match outcomes.
          </p>
        </header>

        <nav aria-label="Results and picks" className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-700 bg-[#111c2e] p-1.5 sm:gap-2">
          {tabs.map(tab => (
            <Link key={tab.key} to={tab.to} aria-current={view === tab.key ? 'page' : undefined}
              className={`flex min-h-[48px] items-center justify-center rounded-lg px-1.5 py-2 text-center text-xs font-bold leading-tight sm:text-sm ${view === tab.key
                ? 'bg-emerald-300 text-slate-900' : 'bg-[#152136] text-slate-200 hover:bg-slate-700'}`}>
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 space-y-7">
          {showToday ? (
            <>
              <section aria-labelledby="today-heading" className="space-y-4">
                <h2 id="today-heading" className="text-xl font-bold">Today’s daily selections</h2>
                <Feed feed={today} label="today’s picks">
                  {list => <DailyList list={list} emptyAction={
                    <Link to="/history?view=past" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-bold text-emerald-200 underline underline-offset-4">Browse previous picks</Link>
                  } />}
                </Feed>
              </section>
              <div id="featured-match" className="space-y-4" tabIndex={-1} ref={featuredRef}>
                <Feed feed={preview} label="the featured match">
                  {data => <><FeaturedMatch preview={data} /><ForecastNotes preview={data} /></>}
                </Feed>
              </div>
            </>
          ) : (
            <>
              {view === 'predictions' && <Feed feed={summary} label="the track record">{data => <TrackRecord summary={data} />}</Feed>}
              <Feed feed={history} label={view === 'predictions' ? 'prediction history' : 'previous picks'}>
                {data => view === 'predictions' ? <PredictionArchive key={data.page} history={data} /> :
                  mode === 'archive' ? <PublishedLists history={data} /> : <PreviousPicks history={data} date={params.get('date')} />}
              </Feed>
            </>
          )}
          <PremiumDiscovery />
        </div>
      </div>
    </main>
  );
};

export default OfficialHistoryScreen;
