import { useEffect, useState } from 'react';
import type { DistrictFeature } from './lib/geo.ts';
import type { School, Summary } from './lib/types.ts';
import { DesktopLayout } from './layouts/DesktopLayout.tsx';
import { PhoneLayout } from './layouts/PhoneLayout.tsx';
import { ExplorerProvider, type AppData } from './state/Explorer.tsx';

const BASE = import.meta.env.BASE_URL;
const PHONE = '(max-width: 760px)';

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}data/${path}`).then((r) => {
    if (!r.ok) throw new Error(`Couldn’t load ${path} (${r.status})`);
    return r.json() as Promise<T>;
  });
}

async function loadData(): Promise<AppData> {
  const [schools, summary, districts] = await Promise.all([
    get<School[]>('schools.json'),
    get<Summary>('summary.json'),
    get<{ features: DistrictFeature[] }>('districts.geojson'),
  ]);
  return { schools, summary, districts: districts.features };
}

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Closing the reviewers' button hides it until the next page load.
  const [reviewersHidden, setReviewersHidden] = useState(false);
  const phone = usePhone();

  useEffect(() => {
    loadData().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <main className="loading" role="alert">
        <p>Something went wrong loading the school data. {error}</p>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="loading" aria-busy="true">
        <p>Loading the map of NYC charter schools…</p>
      </main>
    );

  const Layout = phone ? PhoneLayout : DesktopLayout;
  return (
    <ExplorerProvider data={data}>
      <Layout reviewersHidden={reviewersHidden} hideReviewers={() => setReviewersHidden(true)} />
    </ExplorerProvider>
  );
}
