"use client";
import LedgerWorkbench, {type LedgerRequest} from "./LedgerWorkbench";
const request:LedgerRequest=async <T,>(path:string,method="GET",body?:unknown)=>{
 const response=await fetch(path,{method,headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as T & {error?:string};
 if(!response.ok)throw new Error(response.status===401?"请先登录后使用工作台。":data.error||"保存失败，请稍后重试。");
 return data;
};
export default function Page(){return <LedgerWorkbench request={request} storageMode="cloud"/>;}
