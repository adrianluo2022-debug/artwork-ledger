"use client";
import {useEffect,useId,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,X} from "lucide-react";
import {formatCalendarDate,localTodayISO,monthCells,parseExactDate} from "../lib/calendar.mjs";

type Props={value:string;onChange:(value:string)=>void};
type Cursor={year:number;month:number};
function initialMonth(value:string):Cursor{
 const exact=parseExactDate(value), current=parseExactDate(localTodayISO())!;
 return {year:exact?.getFullYear()||(/^\d{4}$/.test(value)&&Number(value)>0?Number(value):current.getFullYear()),month:(exact||current).getMonth()+1};
}
export default function SaleDateField({value,onChange}:Props){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDialogElement>(null),focusRequested=useRef(false);
 const [open,setOpen]=useState(false),[cursor,setCursor]=useState(()=>initialMonth(value));
 const [yearText,setYearText]=useState(String(cursor.year)),[onlyYear,setOnlyYear]=useState(value.length===4?value:""),[focusedDay,setFocusedDay]=useState("");
 const cells=useMemo(()=>monthCells(cursor.year,cursor.month),[cursor.year,cursor.month]);
 const today=localTodayISO();
 const display=value?(value.length===4?`${value} 年（仅年份）`:value.replaceAll("-",".")):"选择成交日期";
 useEffect(()=>{if(!open)return;const dialog=panel.current;dialog?.showModal();return()=>dialog?.close();},[open]);
 useEffect(()=>{if(open&&focusedDay&&focusRequested.current){panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDay}"]`)?.focus({preventScroll:true});focusRequested.current=false;}},[open,focusedDay,cursor]);
 function toggle(){
  if(open){setOpen(false);return;}
  const next=initialMonth(value);setCursor(next);setYearText(String(next.year));setOnlyYear(value.length===4?value:"");
  setFocusedDay(parseExactDate(value)?value:today.startsWith(`${String(next.year).padStart(4,"0")}-${String(next.month).padStart(2,"0")}`)?today:`${String(next.year).padStart(4,"0")}-${String(next.month).padStart(2,"0")}-01`);
  focusRequested.current=true;setOpen(true);
 }
 function close(){panel.current?.close();setOpen(false);trigger.current?.focus();}
 function choose(date:string){onChange(date);close();}
 function setMonth(next:Cursor){setCursor(next);setYearText(String(next.year));setFocusedDay(`${String(next.year).padStart(4,"0")}-${String(next.month).padStart(2,"0")}-01`);}
 function shiftMonth(offset:number){const total=cursor.year*12+cursor.month-1+offset;const next={year:Math.floor(total/12),month:total%12+1};if(next.year>=1&&next.year<=9999)setMonth(next);}
 function commitYear(){const year=Number(yearText);if(/^\d{1,4}$/.test(yearText)&&year>=1&&year<=9999){setMonth({year,month:cursor.month});}else setYearText(String(cursor.year));}
 function moveDay(event:KeyboardEvent<HTMLButtonElement>,date:string){
  const offsets:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(!(event.key in offsets))return;
  event.preventDefault();const next=parseExactDate(date);if(!next)return;
  next.setDate(next.getDate()+offsets[event.key]);const formatted=formatCalendarDate(next);if(!parseExactDate(formatted))return;
  focusRequested.current=true;const nextCursor={year:next.getFullYear(),month:next.getMonth()+1};setCursor(nextCursor);setYearText(String(nextCursor.year));setFocusedDay(formatted);
 }
 return <div className="sale-date-field field span-two" onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();close();}}}>
  <label htmlFor={id}>成交日期</label>
  <button id={id} ref={trigger} type="button" className="sale-date-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-calendar`} aria-describedby={`${id}-value`} onClick={toggle}><span id={`${id}-value`}>{display}</span><CalendarDays size={19}/></button>
  {open&&<dialog id={`${id}-calendar`} ref={panel} className="sale-calendar" aria-label="成交日期日历" onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="sale-calendar-title"><h3>选择成交日期</h3><button type="button" aria-label="关闭日历" onClick={close}><X size={20}/></button></div>
   <div className="sale-calendar-heading">
    <button type="button" aria-label="上个月" disabled={cursor.year===1&&cursor.month===1} onClick={()=>shiftMonth(-1)}><ChevronLeft size={20}/></button>
    <label className="sale-calendar-year"><input aria-label="日历年份" type="text" inputMode="numeric" maxLength={4} value={yearText} onChange={e=>setYearText(e.target.value)} onBlur={commitYear} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitYear();}}}/><span>年</span></label>
    <select aria-label="日历月份" value={cursor.month} onChange={e=>setMonth({...cursor,month:Number(e.target.value)})}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} 月</option>)}</select>
    <button type="button" aria-label="下个月" disabled={cursor.year===9999&&cursor.month===12} onClick={()=>shiftMonth(1)}><ChevronRight size={20}/></button>
   </div>
   <div className="sale-calendar-weekdays" aria-hidden="true">{"一二三四五六日".split("").map(day=><span key={day}>{day}</span>)}</div>
   <div className="sale-calendar-days" aria-label={`${cursor.year}年${cursor.month}月`}>
    {cells.map((cell:{date:string;day:number;inMonth:boolean;lunar:string},i:number)=><button key={cell.date||i} type="button" data-date={cell.date} disabled={!cell.date} tabIndex={cell.date===focusedDay?0:-1} className={`sale-calendar-day${cell.inMonth?"":" other-month"}${cell.date===value?" selected":""}${cell.date===today?" is-today":""}`} aria-label={`${cell.date}${cell.lunar?` 农历${cell.lunar}`:""}`} aria-pressed={cell.date===value} aria-current={cell.date===today?"date":undefined} onClick={()=>choose(cell.date)} onFocus={()=>setFocusedDay(cell.date)} onKeyDown={e=>moveDay(e,cell.date)}><span>{cell.day}</span><small>{cell.lunar||"　"}</small></button>)}
   </div>
   <div className="sale-calendar-actions"><button type="button" onClick={()=>choose(today)}>今天</button><button type="button" onClick={()=>choose("")}>清空日期</button><button type="button" onClick={close}>收起</button></div>
   <details className="sale-year-only"><summary>只记得年份</summary><div><input aria-label="仅记录年份" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(/^\d{4}$/.test(onlyYear)&&Number(onlyYear)>0)choose(onlyYear);}}} inputMode="numeric" maxLength={4} value={onlyYear} onChange={e=>setOnlyYear(e.target.value.replace(/\D/g,""))} placeholder="例如 2024"/><button type="button" disabled={!/^\d{4}$/.test(onlyYear)||Number(onlyYear)===0} onClick={()=>choose(onlyYear)}>保存年份</button></div></details>
  </dialog>}
  <small>点选日期；不记得可以留空。</small>
 </div>;
}
