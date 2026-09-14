import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/contexts/auth-context";
/** Saves only view preferences, scoped to the signed-in user on this browser. */
export function useSavedFilters<T extends Record<string,string|number>>(name:string, defaults:T): [T,Dispatch<SetStateAction<T>>,()=>void] {
  const {user}=useAuth(), key=name&&user ? "sonacol:view:"+user.id+":"+name : "";
  const read=():T=>{
    try {
      const stored=key?JSON.parse(localStorage.getItem(key)??"{}"):{};
      return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,typeof stored?.[k]===typeof v?stored[k]:v])) as T;
    } catch {return {...defaults};}
  };
  const [state,setState]=useState({key,value:read()});
  useEffect(()=>{setState({key,value:read()});},[key]); // eslint-disable-line react-hooks/exhaustive-deps
  const value=state.key===key?state.value:defaults;
  const setValue:Dispatch<SetStateAction<T>>=next=>setState(previous=>{
    const current=previous.key===key?previous.value:read();
    const updated=typeof next==="function"?next(current):next;
    try {if(key)localStorage.setItem(key,JSON.stringify(updated));}catch { /* Storage may be disabled. */ }
    return {key,value:updated};
  });
  return [value,setValue,()=>setValue({...defaults})];
}
