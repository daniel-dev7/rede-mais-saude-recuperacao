import "server-only";

/** Dr Click official missed-appointments API (integration guide v1.0). */
export type DrClickAppointment={
  idagendamento:string;
  status:string;
  scheduled_date:string;
  patient_id?:string;
  patient_name?:string;
  patient_phone?:string|null;
  professional_name?:string;
  category_name?:string;
  item_name?:string;
  clinica?:{idclinica?:string;nome?:string};
  amount?:number;
  amount_paid?:number;
};
export type DrClickResult={records:DrClickAppointment[];rawShape:string};

/** Clinic IDs observed in the DrClick scheduling system; verify acceptance by the missed-appointments API. */
export const DRCLICK_CLINICS={
  "Almirante Barroso":"12706efb-9be9-47d6-a997-7a910c57ef4a",
  "Augusto Montenegro":"d24730aa-27e0-4666-9b1a-3cc220e2311b",
  "Cidade Nova 6":"3fe2145e-ec64-442b-a967-864afb4d4393",
  "Guamá":"f09c72bf-27ab-40b2-a15e-ec1ffed9e579",
  "Jurunas":"960d2a28-b716-481c-951f-8b9a5bf1feec",
  "Padre Eutíquio":"bf7f6157-8775-4766-be38-8aa34ec07070"
} as const;
export const DRCLICK_CLINIC_IDS=Object.values(DRCLICK_CLINICS) as string[];


export function yesterdayBelem(now=new Date()){
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Belem",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const previous=new Date(date+"T12:00:00Z");previous.setUTCDate(previous.getUTCDate()-1);
  return previous.toISOString().slice(0,10);
}

export async function fetchMissedAppointments(date:string,clinicId?:string):Promise<DrClickResult>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))throw new Error("Data inválida");
  const clinic=clinicId||process.env.DRCLICK_CLINIC_ID;
  if(!clinic||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinic))throw new Error("Identificador de clínica DrClick não configurado");
  const base=process.env.DRCLICK_API_BASE_URL;
  if(!base||!/^https:\/\//i.test(base))throw new Error("URL base HTTPS da DrClick não configurada");
  const token=process.env.DRCLICK_API_TOKEN;
  const apiKey=process.env.DRCLICK_API_KEY;
  if(!token&&!apiKey)throw new Error("Credencial da DrClick não configurada");
  const url=new URL("/api/bots/appointmentbystatus",base);
  url.searchParams.set("idclinica",clinic);
  url.searchParams.set("status","faltou");
  url.searchParams.set("start_date",date);
  url.searchParams.set("end_date",date);
  const headers:HeadersInit={Accept:"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  if(apiKey)headers["x-api-key"]=apiKey;
  const res=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error("DrClick retornou HTTP "+res.status);
  const payload:unknown=await res.json();
  if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Resposta DrClick inválida");
  const root=payload as Record<string,unknown>;
  if(root.success!==true)throw new Error("DrClick informou falha na consulta");
  const data=root.data;
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Envelope data ausente");
  const records=(data as Record<string,unknown>).analytic_results_appointments;
  if(!Array.isArray(records))throw new Error("Campo analytic_results_appointments ausente");
  const valid=records.filter((r):r is DrClickAppointment=>Boolean(r)&&typeof r==="object"&&!Array.isArray(r)&&typeof r.idagendamento==="string"&&r.status==="faltou");
  return {records:valid,rawShape:"data.analytic_results_appointments"};
}

/** Detailed attended appointments only. Aggregated patient IDs are not proof of a matching procedure. */
export async function fetchAttendedAppointments(date:string,clinicId:string):Promise<DrClickResult>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Data inválida");
 const base=process.env.DRCLICK_API_BASE_URL,token=process.env.DRCLICK_API_TOKEN,apiKey=process.env.DRCLICK_API_KEY;
 if(!base||!/^https:\/\//i.test(base)||(!token&&!apiKey))throw new Error("Credenciais DrClick indisponíveis");
 const url=new URL("/api/bots/appointmentbystatus",base);
 for(const [k,v] of Object.entries({idclinica:clinicId,status:"atendido",start_date:date,end_date:date}))url.searchParams.set(k,v);
 const headers:HeadersInit={Accept:"application/json"};
 if(token)headers.Authorization="Bearer "+token;
 if(apiKey)headers["x-api-key"]=apiKey;
 const res=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error("Consulta de atendidos retornou HTTP "+res.status);
 const payload:unknown=await res.json();
 if(!payload||typeof payload!=="object")throw new Error("Resposta inválida");
 const root=payload as Record<string,unknown>;
 if(root.success!==true)throw new Error("Consulta de atendidos sem sucesso");
 const data=root.data as Record<string,unknown>|undefined;
 const records=data?.analytic_results_appointments;
 if(!Array.isArray(records))throw new Error("Relatório não oferece atendimentos individuais");
 const valid=records.filter((r):r is DrClickAppointment=>Boolean(r)&&typeof r==="object"&&!Array.isArray(r)&&r.status==="atendido"&&typeof r.patient_id==="string"&&typeof r.scheduled_date==="string"&&typeof r.idagendamento==="string"&&Boolean((r.category_name||r.item_name||"").trim()));
 return {records:valid,rawShape:"data.analytic_results_appointments"};
}
