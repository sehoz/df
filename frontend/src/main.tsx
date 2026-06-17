import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type SortKey = 'profit' | 'hourlyProfit' | 'outputNetValue' | 'hourlyOutputValue';
type SortDir = 'asc' | 'desc';

interface ManufactureRow {
  key: string;
  rank?: number;
  station: number;
  stationName: string;
  name: string;
  qualityKey: string;
  iconUrl: string;
  period: number;
  profit: number;
  hourlyProfit: number;
  outputNetValue: number;
  hourlyOutputValue: number;
  materialCost: number;
  listingFee: number;
  updatedAt?: number;
}

interface RankingsResponse {
  ok: boolean;
  rows?: ManufactureRow[];
  updatedAt?: number;
  errors?: string[];
  source?: { manufactureCount: number; stationCount: number; assetCount: number };
  error?: string;
  refreshed?: boolean;
  coolingDown?: boolean;
  refreshing?: boolean;
}

const sortLabels: Record<SortKey, string> = {
  profit: '净收益',
  hourlyProfit: '每小时净收益',
  outputNetValue: '总产出',
  hourlyOutputValue: '每小时产出',
};

function money(value: unknown) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(value) || 0));
}

function moneySigned(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return `${n >= 0 ? '+' : ''}${money(n)}`;
}

function fmtTime(ts?: number) {
  return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function quality(row: ManufactureRow) {
  return ['common', 'green', 'blue', 'purple', 'gold', 'red'].includes(row.qualityKey) ? row.qualityKey : 'common';
}

function ItemIcon({ row }: { row: ManufactureRow }) {
  const cls = `item-icon-frame quality-${quality(row)}`;
  if (row.iconUrl) {
    return (
      <span className={cls}>
        <img className="item-icon" src={row.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      </span>
    );
  }
  return <span className={`${cls} fallback`} aria-hidden="true">{row.name.trim().slice(0, 1) || '?'}</span>;
}

function SortButton({ sortKey, currentKey, dir, onSort }: { sortKey: SortKey; currentKey: SortKey; dir: SortDir; onSort: (key: SortKey) => void }) {
  const active = sortKey === currentKey;
  return (
    <button className={`sort-head ${active ? 'active' : ''}`} data-dir={active ? dir : ''} onClick={() => onSort(sortKey)}>
      {sortLabels[sortKey]}
    </button>
  );
}

function App() {
  const [rows, setRows] = useState<ManufactureRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [status, setStatus] = useState('就绪，点击刷新获取数据');
  const [station, setStation] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('hourlyProfit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function loadRankings() {
    const res = await fetch('/api/rankings');
    const data = await res.json() as RankingsResponse;
    if (data.ok && data.rows) {
      setRows(data.rows);
      setErrors(data.errors || []);
      setUpdatedAt(data.updatedAt || 0);
    }
  }

  async function refresh() {
    setStatus('刷新中...');
    const res = await fetch('/api/refresh', { method: 'POST' });
    const data = await res.json() as RankingsResponse;
    if (!data.ok) {
      setStatus(data.error || '刷新失败');
      return;
    }
    if (data.rows) {
      setRows(data.rows);
      setErrors(data.errors || []);
      setUpdatedAt(data.updatedAt || Date.now());
    }
    setStatus(data.refreshing ? '已有刷新正在进行' : data.coolingDown ? '已使用最近数据' : '已刷新');
  }

  useEffect(() => {
    loadRankings().catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (station !== 'all' && String(row.station) !== station) return false;
      if (q && ![row.name, row.stationName].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, station, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered]
      .sort((a, b) => {
        const primary = ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * dir;
        return primary || b.hourlyProfit - a.hourlyProfit || b.profit - a.profit;
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [filtered, sortKey, sortDir]);

  const bestBy = (key: SortKey) => [...filtered].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0];
  const stats = [
    { label: '总条目', value: rows.length, sub: `${filtered.length} 条在当前筛选中` },
    { label: '最佳每小时净收益', value: bestBy('hourlyProfit') ? moneySigned(bestBy('hourlyProfit').hourlyProfit) : '-', sub: bestBy('hourlyProfit')?.name || '-' },
    { label: '最佳总净收益', value: bestBy('profit') ? moneySigned(bestBy('profit').profit) : '-', sub: bestBy('profit')?.name || '-' },
    { label: '最佳每小时产出', value: bestBy('hourlyOutputValue') ? money(bestBy('hourlyOutputValue').hourlyOutputValue) : '-', sub: bestBy('hourlyOutputValue')?.name || '-' },
    { label: '最佳总产出', value: bestBy('outputNetValue') ? money(bestBy('outputNetValue').outputNetValue) : '-', sub: bestBy('outputNetValue')?.name || '-' },
  ];

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((value) => value === 'desc' ? 'asc' : 'desc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortClass = (key: SortKey) => key === sortKey ? ' sorted-col' : '';

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">三角洲行动 · 默认 L3 满级</div>
          <h1>特勤处制造收益排行</h1>
        </div>
        <div className="status">{status}</div>
      </header>

      <section className="panel settings">
        <div className="action-row">
          <button className="button" onClick={refresh}>刷新数据</button>
          <span className="last-updated">更新时间：{fmtTime(updatedAt)}</span>
        </div>
        <div className="controls">
          <div className="segmented">
            {[
              ['all', '全部'],
              ['1', '技术中心'],
              ['2', '工作台'],
              ['3', '制药台'],
              ['4', '防具台'],
            ].map(([value, label]) => (
              <button key={value} className={station === value ? 'active' : ''} onClick={() => setStation(value)}>{label}</button>
            ))}
          </div>
          <div className="search-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="搜索物品、台子" />
          </div>
        </div>
      </section>

      <section className="stats">
        {stats.map((item) => (
          <div className="stat" key={item.label}>
            <div className="label">{item.label}</div>
            <div className="value">{item.value}</div>
            <div className="sub">{item.sub}</div>
          </div>
        ))}
      </section>

      {errors.length > 0 && <section className="error-box">接口异常 {errors.length} 个</section>}

      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>制造物</th>
              <th>台子</th>
              <th><SortButton sortKey="profit" currentKey={sortKey} dir={sortDir} onSort={onSort} /></th>
              <th><SortButton sortKey="hourlyProfit" currentKey={sortKey} dir={sortDir} onSort={onSort} /></th>
              <th><SortButton sortKey="outputNetValue" currentKey={sortKey} dir={sortDir} onSort={onSort} /></th>
              <th><SortButton sortKey="hourlyOutputValue" currentKey={sortKey} dir={sortDir} onSort={onSort} /></th>
              <th>时长</th>
              <th>材料成本</th>
              <th>产出到手价</th>
              <th>手续费</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={12} className="muted">没有可显示的数据。</td></tr>
            ) : sorted.map((row) => (
              <tr key={row.key}>
                <td>{row.rank}</td>
                <td><div className="name-cell"><ItemIcon row={row} /><div className="name-main">{row.name}</div></div></td>
                <td><span className="pill">{row.stationName}</span></td>
                <td className={`${row.profit >= 0 ? 'positive' : 'negative'}${sortClass('profit')}`}>{moneySigned(row.profit)}</td>
                <td className={`${row.hourlyProfit >= 0 ? 'positive' : 'negative'}${sortClass('hourlyProfit')}`}>{moneySigned(row.hourlyProfit)}</td>
                <td className={sortClass('outputNetValue')}>{money(row.outputNetValue)}</td>
                <td className={sortClass('hourlyOutputValue')}>{money(row.hourlyOutputValue)}</td>
                <td>{row.period || '-'} h</td>
                <td>{money(row.materialCost)}</td>
                <td>{money(row.outputNetValue)}</td>
                <td>{money(row.listingFee)}</td>
                <td className="muted">{fmtTime(row.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mobile-list">
        {sorted.map((row) => (
          <article className="mobile-card" key={row.key}>
            <div className="mobile-card-head">
              <ItemIcon row={row} />
              <div>
                <div className="name-main">{row.name}</div>
                <div className="muted">{row.stationName} · {row.period || '-'} h</div>
              </div>
            </div>
            <div className="mobile-grid">
              <span>净收益 <strong className={row.profit >= 0 ? 'positive' : 'negative'}>{moneySigned(row.profit)}</strong></span>
              <span>每小时 <strong className={row.hourlyProfit >= 0 ? 'positive' : 'negative'}>{moneySigned(row.hourlyProfit)}</strong></span>
              <span>总产出 <strong>{money(row.outputNetValue)}</strong></span>
              <span>每小时产出 <strong>{money(row.hourlyOutputValue)}</strong></span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
