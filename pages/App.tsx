"use client";
import LedgerWorkbench, {type LedgerRequest} from "../app/LedgerWorkbench";
import {localApi} from "./local-store.mjs";
const request:LedgerRequest=async <T,>(path:string,method="GET",body?:unknown)=>await localApi(path,method,body) as T;
export default function App(){return <LedgerWorkbench request={request} storageMode="local"/>;}
