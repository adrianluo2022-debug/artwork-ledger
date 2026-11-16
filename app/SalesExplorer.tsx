"use client";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Search, X, Wallet, FileText, LoaderCircle } from "lucide-react";
import { filterDeals, summarizeSales } from "../lib/ledger-query.mjs";

type Work = { id: string; title: string; createdDate: string; image: string; notes: string };
type Deal = { id: string; workId: string; kind: "commission" | "license"; client: string; domain: string; amount: number; soldDate: string; startDate: string; endDate: string; perpetual: boolean; exclusive: boolean; paid: number; notes: string };
type Summary = { amount: number; count: number; days: { date: string; amount: number; count: number }[]; undated: { amount: number; count: number } };
const exactDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);
const money = (amount: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(amount);
const localDay = () => new Date().toLocaleDateString("sv-SE");
const displayDate = (date: string) => date ? date.length === 4 ? `${date} 年（仅年份）` : date.replaceAll("-", ".") : "未填写成交日期";

export default function SalesExplorer({ works, deals, loading, error, onEdit }: { works: Work[]; deals: Deal[]; loading: boolean; error: string; onEdit: (deal: Deal) => void }) {
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [kind, setKind] = useState<"" | "commission" | "license">("");
  const invalid = !!(startDate && endDate && startDate > endDate);
  const hasDates = !!(startDate || endDate);
  const day = startDate && startDate === endDate ? startDate : "";
  const byId = useMemo(() => new Map(works.map(work => [work.id, work])), [works]);
  const filtered = useMemo(() => invalid ? [] : filterDeals(works, deals, { query, startDate, endDate, kind }) as Deal[], [works, deals, query, startDate, endDate, kind, invalid]);
  const summary = useMemo(() => summarizeSales(filtered) as Summary, [filtered]);
  const dated = filtered.filter(deal => exactDate(deal.soldDate)).sort((a, b) => b.soldDate.localeCompare(a.soldDate));
  const undated = filtered.filter(deal => !exactDate(deal.soldDate));
  const uncertainCount = deals.filter(deal => !exactDate(deal.soldDate)).length;
  const period = day ? displayDate(day) : startDate || endDate ? `${startDate ? displayDate(startDate) : "最早记录"} 至 ${endDate ? displayDate(endDate) : "最新记录"}` : "全部时间";
  const pickDay = (value: string) => { setStartDate(value); setEndDate(value); };
  const pickMonth = () => { const value = localDay(); const [year, month] = value.split("-").map(Number); setStartDate(`${value.slice(0, 7)}-01`); setEndDate(`${value.slice(0, 7)}-${new Date(year, month, 0).getDate()}`); };
  const reset = () => { setQuery(""); setKind(""); pickDay(""); };
  function detailTable(rows: Deal[], uncertain = false) {
    return <div className="table-scroll"><table className="records-table sales-table"><thead><tr><th>作品 / 客户</th><th>类别 · 用途</th><th>成交日期</th><th>售出金额</th><th>备注</th><th>操作</th></tr></thead><tbody>{rows.map(deal => { const work = byId.get(deal.workId); return <tr key={deal.id}><td><button className="work-cell" onClick={() => onEdit(deal)}><span><strong>{work?.title || "未命名作品"}</strong><small>{deal.client || "客户未填写"}</small></span></button></td><td><span className="domain-pill">{deal.kind === "commission" ? "约稿" : "授权"}</span><small className="table-note">{deal.domain || "领域未填写"}</small></td><td className="date-cell">{displayDate(deal.soldDate)}{uncertain && <small className="table-note">未分配到具体日期</small>}</td><td><strong className="amount-cell">{money(deal.amount)}</strong></td><td className="sales-notes"><span title={deal.notes}>{deal.notes || "—"}</span></td><td><button className="text-button" onClick={() => onEdit(deal)}>{uncertain ? "补充 / 编辑" : "编辑"}</button></td></tr>; })}</tbody></table></div>;
  }
  return <div className="sales-explorer">
    <section className="sales-filters" aria-label="日期与关键词筛选">
      <div className="sales-filter-heading"><div><CalendarDays size={18} /><h2>查某一天，也能查一段时间</h2></div><div className="sales-shortcuts"><button type="button" onClick={() => pickDay(localDay())}>今天</button><button type="button" onClick={pickMonth}>本月</button><button type="button" onClick={() => pickDay("")}>全部时间</button></div></div>
      <div className="sales-date-fields"><label className="field"><span>查看某天</span><input type="date" aria-label="查看某天" value={day} onChange={event => pickDay(event.target.value)} /></label><span className="sales-or">或</span><label className="field"><span>开始日期</span><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} aria-invalid={invalid} /></label><span className="sales-to">至</span><label className="field"><span>结束日期</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} aria-invalid={invalid} /></label></div>
      <div className="sales-search-row"><label className="search-field sales-search"><Search size={18} /><input aria-label="关键词查询" value={query} onChange={event => setQuery(event.target.value)} placeholder="查作品、客户、领域、备注、金额…" />{query && <button type="button" aria-label="清除关键词" onClick={() => setQuery("")}><X size={15} /></button>}</label><label className="field sales-kind"><span className="sales-sr-only">合作类别</span><select aria-label="合作类别" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="">全部类别</option><option value="commission">约稿</option><option value="license">授权</option></select></label><button className="text-button" onClick={reset}>清除筛选</button></div>
      <p className="sales-help">多个关键词用空格隔开，会同时匹配；日期按成交时间统计，起止日期均包含在内。</p>
      {invalid && <p className="form-error" role="alert">开始日期不能晚于结束日期。请调整日期后查看金额。</p>}
    </section>
    {loading ? <div className="loading-state"><LoaderCircle className="spin" size={24} /><p>正在读取合作记录…</p></div> : error ? <div className="sales-unavailable"><p>记录暂时无法读取，请使用上方按钮重试。</p></div> : invalid ? <div className="sales-unavailable"><CalendarDays size={25} /><p>日期范围有误，暂不计算金额与笔数。</p></div> : <>
      <section className="sales-totals" aria-label="查询结果概览" aria-live="polite"><article className="stat-card sales-amount"><div><span>{day ? "当天售出金额" : "筛选售出金额"}</span><Wallet size={18} /></div><strong className="money-stat">{money(summary.amount)}</strong><p>{period} · 按合作价格合计</p></article><article className="stat-card"><div><span>匹配合作</span><FileText size={17} /></div><strong>{summary.count}<small>笔</small></strong><p>约稿 {filtered.filter(deal => deal.kind === "commission").length} 笔 · 授权 {filtered.filter(deal => deal.kind === "license").length} 笔</p></article><article className="stat-card"><div><span>有明确成交日期</span><CalendarDays size={17} /></div><strong>{summary.days.length}<small>天</small></strong><p>{summary.undated.count ? `另有 ${summary.undated.count} 笔日期待补充，已计入总金额` : "明细可按日期逐日查看"}</p></article></section>
      {uncertainCount > 0 && <p className="sales-date-note"><CalendarDays size={15} /><span>全部记录中有 <b>{uncertainCount}</b> 笔只记了年份或未填成交日期，暂不分配到某一天。{hasDates ? "当前日期筛选已排除这些记录；清除日期后可查看。" : "符合关键词和类别的记录列在下方，金额计入本次合计。"}</span>{hasDates && <button className="text-button" onClick={() => pickDay("")}>清除日期</button>}</p>}
      <section className="records-panel sales-daily"><div className="panel-top"><div className="panel-title"><h2>每日售出金额</h2><span>{summary.days.length} 天</span></div><p className="sales-panel-hint">点击日期，查看当天明细</p></div>{summary.days.length ? <div className="table-scroll"><table className="records-table sales-daily-table"><thead><tr><th>成交日期</th><th>合作笔数</th><th>售出金额</th><th><span className="sales-sr-only">查看明细</span></th></tr></thead><tbody>{summary.days.map(item => <tr key={item.date}><td><button className="sales-day-button" onClick={() => pickDay(item.date)}>{displayDate(item.date)}</button></td><td>{item.count} 笔</td><td><strong className="amount-cell">{money(item.amount)}</strong></td><td><button className="text-button" aria-label={`查看 ${item.date} 的明细`} onClick={() => pickDay(item.date)}>查看明细 <ArrowRight size={14} /></button></td></tr>)}</tbody></table></div> : <div className="sales-empty"><CalendarDays size={25} strokeWidth={1.4} /><p>{undated.length ? "这些合作还没有具体成交日期" : "这个范围还没有成交记录"}</p><small>{undated.length ? "补充日期后，就能在这里按天统计。" : "可以调整日期、关键词或合作类别。"}</small></div>}<footer className="panel-footer"><span>售出金额按合作价格合计</span><span>约稿与授权分别按每一笔记录计算</span></footer></section>
      {dated.length > 0 && <section className="records-panel sales-details"><div className="panel-top"><div className="panel-title"><h2>{day ? "当天合作明细" : "合作明细"}</h2><span>{dated.length} 笔</span></div><span className="sales-panel-hint">{period}</span></div>{detailTable(dated)}</section>}
      {undated.length > 0 && <section className="records-panel sales-details"><div className="panel-top"><div className="panel-title"><h2>待补充具体成交日期</h2><span>{undated.length} 笔</span></div><span className="sales-panel-hint">合计 {money(summary.undated.amount)}</span></div>{detailTable(undated, true)}<footer className="panel-footer"><span>保留原本年份，不推测具体日期</span><span>补充日期后自动纳入每日金额</span></footer></section>}
    </>}
  </div>;
}
