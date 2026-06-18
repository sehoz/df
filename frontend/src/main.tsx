import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const APP_BUILD_ID = 'station-name-fit-20260618-1';

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

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
  saleGross?: number;
  outputGrossValue?: number;
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
  error?: string;
  refreshed?: boolean;
  coolingDown?: boolean;
  refreshing?: boolean;
}

const sortLabels: Record<SortKey, string> = {
  profit: '总净收益',
  hourlyProfit: '每小时净收益',
  outputNetValue: '总产出',
  hourlyOutputValue: '每小时产出',
};

const stationOptions = [
  ['all', '全部'],
  ['1', '技术中心'],
  ['2', '工作台'],
  ['3', '制药台'],
  ['4', '防具台'],
];

const stationCards = stationOptions.filter(([value]) => value !== 'all');

function money(value: unknown) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(value) || 0));
}

function moneySigned(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return `${n >= 0 ? '+' : ''}${money(n)}`;
}

function valueText(row: ManufactureRow | undefined, key: SortKey) {
  if (!row) return '-';
  return key === 'profit' || key === 'hourlyProfit' ? moneySigned(row[key]) : money(row[key]);
}

function fmtTime(ts?: number) {
  return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function marketPrice(row: ManufactureRow) {
  return Number(row.saleGross ?? row.outputGrossValue ?? 0) || 0;
}

function nameClass(name: string) {
  if (name.length >= 20) return 'name-main name-xs';
  if (name.length >= 16) return 'name-main name-sm';
  return 'name-main';
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

  async function applyResponse(data: RankingsResponse) {
    if (data.ok && data.rows) {
      setRows(data.rows);
      setErrors(data.errors || []);
      setUpdatedAt(data.updatedAt || 0);
    }
  }

  async function loadRankings() {
    const res = await fetch(apiUrl('/api/rankings'));
    const data = await res.json() as RankingsResponse;
    await applyResponse(data);
  }

  async function refresh() {
    setStatus('刷新中...');
    try {
      const res = await fetch(apiUrl('/api/refresh'), { method: 'POST' });
      const data = await res.json() as RankingsResponse;
      if (!data.ok) {
        setStatus(data.error || '刷新失败');
        return;
      }
      await applyResponse(data);
      setStatus(data.refreshing ? '已有刷新正在进行' : data.coolingDown ? '已使用最近数据' : '已刷新');
    } catch {
      setStatus('刷新失败');
    }
  }

  useEffect(() => {
    loadRankings().catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (station !== 'all' && String(row.station) !== station) return false;
      if (q && !row.name.toLowerCase().includes(q)) return false;
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

  const stationBests = stationCards.map(([value, label]) => {
    const list = rows.filter((row) => String(row.station) === value);
    const best = [...list].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0))[0];
    return { value, label, best };
  });

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
        <div className="title-block">
          <h1>特勤处制造收益排行</h1>
        </div>
        <div className="header-tools">
          <div className="header-tool-left">
            <div className="status">{status}</div>
            <button className="button" onClick={refresh}>刷新数据</button>
          </div>
          <div className="header-tool-right">
            <span className="last-updated">更新时间：{fmtTime(updatedAt)}</span>
            <div className="search-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="搜索制造物名称" />
            </div>
          </div>
        </div>
      </header>

      <section className="panel settings">
        <div className="controls desktop-controls">
          <div className="segmented">
            {stationOptions.map(([value, label]) => (
              <button key={value} className={station === value ? 'active' : ''} onClick={() => setStation(value)}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="mobile-sticky-controls" aria-label="移动端筛选和排序">
        <div className="mobile-chip-row">
          {stationOptions.map(([value, label]) => (
            <button key={value} className={station === value ? 'active' : ''} onClick={() => setStation(value)}>{label}</button>
          ))}
        </div>
        <div className="mobile-chip-row sort-row">
          {(Object.keys(sortLabels) as SortKey[]).map((key) => (
            <button key={key} className={sortKey === key ? 'active' : ''} data-dir={sortKey === key ? sortDir : ''} onClick={() => onSort(key)}>
              {sortLabels[key]}
            </button>
          ))}
        </div>
      </section>

      <section className="summary-grid">
        <div className="best-grid-section">
          <div className="section-title">各制造台最优 · {sortLabels[sortKey]}</div>
          <div className="station-best-grid">
            {stationBests.map(({ value, label, best }) => (
              <button key={value} className="station-best-card" onClick={() => setStation(value)}>
                <div className="station-best-head">
                  <span>{label}</span>
                  <strong>{valueText(best, sortKey)}</strong>
                </div>
                {best ? (
                  <div className="station-best-item">
                    <ItemIcon row={best} />
                    <div>
                      <div className={nameClass(best.name)}>{best.name}</div>
                      <div className="muted">{best.period || '-'} h · 材料 {money(best.materialCost)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="muted">暂无数据</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {errors.length > 0 && <section className="error-box">接口异常 {errors.length} 个</section>}

      <section className="mobile-rank-divider">
        <span>制造排行</span>
        <strong>{sortLabels[sortKey]} {sortDir === 'desc' ? '从高到低' : '从低到高'}</strong>
      </section>

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
              <th>交易行价格</th>
              <th>材料成本</th>
              <th>手续费</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={11} className="muted">没有可显示的数据。</td></tr>
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
                <td>{money(marketPrice(row))}</td>
                <td>{money(row.materialCost)}</td>
                <td>{money(row.listingFee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mobile-list">
        {sorted.map((row) => (
          <article className="mobile-row" key={row.key}>
            <div className="mobile-row-main">
              <div className="mobile-rank">{row.rank}</div>
              <ItemIcon row={row} />
              <div className="mobile-name-block">
                <div className="name-main">{row.name}</div>
                <div className="mobile-meta">{row.stationName} · {row.period || '-'} h</div>
              </div>
            </div>
            <div className="mobile-metrics">
              <div className={`mobile-metric ${sortKey === 'profit' ? 'active' : ''}`}>
                <span>总净</span>
                <strong className={row.profit >= 0 ? 'positive' : 'negative'}>{moneySigned(row.profit)}</strong>
              </div>
              <div className={`mobile-metric ${sortKey === 'hourlyProfit' ? 'active' : ''}`}>
                <span>时净</span>
                <strong className={row.hourlyProfit >= 0 ? 'positive' : 'negative'}>{moneySigned(row.hourlyProfit)}</strong>
              </div>
              <div className={`mobile-metric ${sortKey === 'outputNetValue' ? 'active' : ''}`}>
                <span>总产</span>
                <strong>{money(row.outputNetValue)}</strong>
              </div>
              <div className={`mobile-metric ${sortKey === 'hourlyOutputValue' ? 'active' : ''}`}>
                <span>时产</span>
                <strong>{money(row.hourlyOutputValue)}</strong>
              </div>
            </div>
            <div className="mobile-costs">
              <span>交易行 {money(marketPrice(row))}</span>
              <span>材料 {money(row.materialCost)}</span>
              <span>手续费 {money(row.listingFee)}</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
document.documentElement.dataset.appBuild = APP_BUILD_ID;
