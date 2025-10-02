"use client";
import { useEffect, useState } from 'react';


// Month-focused view: pick a month and show top artists/tracks in that month

export default function Home() {
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [yearView, setYearView] = useState<number>(() => new Date().getUTCFullYear());
  const [rows, setRows] = useState<{ name: string; artist: string; album: string; plays: number }[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const pageSize = 25;
  const [available, setAvailable] = useState<Set<string>>(new Set()); // 'YYYY-MM'
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Load available months once and default month to latest available
    (async () => {
      const res = await fetch('/api/stats/months').then(r => r.json());
      const keys: string[] = res.rows.map((r: { year: number; month: number }) => `${r.year}-${String(r.month).padStart(2,'0')}`);
      setAvailable(new Set(keys));
      if (keys.length > 0) {
        const latest = keys[keys.length - 1];
        setMonth(latest);
        setYearView(Number(latest.slice(0,4)));
      }
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    // Validate `month` as YYYY-MM before computing dates
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [yStr, mStr] = month.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return;
    // Compute UTC month start and end
    const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const sp = new URLSearchParams();
    sp.set('start', startDate.toISOString());
    sp.set('end', endDate.toISOString());
    sp.set('limit', String(pageSize));
    sp.set('offset', String(page * pageSize));
    const qs = sp.toString();
    (async () => {
      const tt = await fetch(`/api/top/tracks?${qs}`).then(r => r.json());
      setRows(tt.rows ?? []);
      setTotal(tt.total ?? 0);
    })();
  }, [month, page]);

  const numPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Listening in a Given Month</h1>
      <MonthPicker month={month} yearView={yearView} available={available} isLoading={isLoading} onChangeMonth={(y, m) => { setMonth(`${y}-${String(m).padStart(2, '0')}`); setPage(0); }} onChangeYear={setYearView} />

      <section className="space-y-3">
        <h2 className="text-xl font-medium">All Songs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Track</th>
                <th className="py-2 pr-4">Artist</th>
                <th className="py-2 pr-4">Album</th>
                <th className="py-2 pr-4">Plays</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.name}|${r.artist}|${r.album}`} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.artist}</td>
                  <td className="py-2 pr-4">{r.album}</td>
                  <td className="py-2 pr-4">{r.plays.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <button className="border rounded px-2 py-1" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</button>
          <div className="text-sm">Page {page + 1} / {Math.max(1, numPages)}</div>
          <button className="border rounded px-2 py-1" disabled={page + 1 >= numPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </section>
    </div>
  );
}

function MonthPicker(props: { month: string; yearView: number; available: Set<string>; isLoading: boolean; onChangeMonth: (y: number, m: number) => void; onChangeYear: (y: number) => void }) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const selectedYear = Number(props.month.slice(0,4));
  const selectedMonth = Number(props.month.slice(5,7));
  
  if (props.isLoading) {
    return <div className="text-gray-500">Loading available months...</div>;
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button className="border rounded px-2 py-1" onClick={() => props.onChangeYear(props.yearView - 1)}>&larr;</button>
        <div className="font-medium">{props.yearView}</div>
        <button className="border rounded px-2 py-1" onClick={() => props.onChangeYear(props.yearView + 1)}>&rarr;</button>
      </div>
      <div className="grid grid-cols-4 gap-2 max-w-md">
        {months.map((label, idx) => {
          const m = idx + 1;
          const isSelected = props.yearView === selectedYear && m === selectedMonth;
          const key = `${props.yearView}-${String(m).padStart(2,'0')}`;
          const hasData = props.available.has(key);
          return (
            <button
              key={m}
              className={`border rounded px-3 py-2 text-sm ${isSelected ? 'bg-blue-600 text-white' : hasData ? 'hover:bg-gray-100 dark:hover:bg-gray-800' : 'opacity-40 cursor-not-allowed'}`}
              onClick={() => hasData && props.onChangeMonth(props.yearView, m)}
              disabled={!hasData}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

