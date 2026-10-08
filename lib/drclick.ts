import "server-only";
const BASE="https://api-maissaude.drclick.com.br";
const CLINIC="3fe2145e-ec64-442b-a967-864afb4d4393";
export type DrClickResult={records:unknown[];rawShape:string};
export function yesterdayBelem(now=new Date()){const local=new Date(now.toLocaleString("en-US",{timeZone:"America/Belem"}));local.setDate(local.getDate()-1);return [local.getFullYear(),String(local.getMonth()+1).padStart(2,"0"),String(local.getDate()).padStart(2,"0")].join("-")}
export async function fetchMissedAppointments(date:string):Promise<DrClickResult>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Data inválida");
 const token=process.env.DRCLICK_API_TOKEN;
 const apiKey=process.env.DRCLICK_API_KEY;
 if(!token&&!apiKey)throw new Error("Credencial da DrClick não configurada");
 const url=new URL("/api/reports/appointmentbystatus",BASE);
 url.searchParams.set("idclinica",CLINIC);url.searchParams.set("status","faltou");url.searchParams.set("start_date",date);url.searchParams.set("end_date",date);
 const headers:HeadersInit={Accept:"application/json"};
 if(token)headers.Authorization="Bearer "+token;
 if(apiKey)headers["x-api-key"]=apiKey;
 const res=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error("DrClick retornou HTTP "+res.status);
 const payload:unknown=await res.json();
 if(Array.isArray(payload))return {records:payload,rawShape:"array"};
 if(payload&&typeof payload==="object"){
 const obj=payload as Record<string,unknown>;
 for(const key of ["data","results","appointments","items"]){if(Array.isArray(obj[key]))return {records:obj[key] as unknown[],rawShape:key}}
 }
 throw new Error("Formato de resposta ainda não reconhecido; integração exige mapeamento validado");
}
