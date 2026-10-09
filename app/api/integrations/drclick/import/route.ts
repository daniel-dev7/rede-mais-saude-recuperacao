import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {DRCLICK_CLINICS,fetchMissedAppointments,yesterdayBelem} from "../../../../../lib/drclick";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"));
const phoneValid=(s:string)=>{const d=s.replace(/\D/g,"");return (d.length===10||d.length===11||d.length===12||d.length===13)&&!/^0+$/.test(d)};
export async function POST(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if(!url||!key)return json({error:"Supabase não configurado"},503);
 if(!token)return json({error:"Não autorizado"},401);
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return json({error:"Não autorizado"},401);
 const {data:profile,error:profileError}=await client.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profileError||!profile?.active||profile.role!=="admin")return json({error:"Acesso negado"},403);
 let body:{date?:unknown;commit?:unknown;clinic?:unknown};
 try{body=await request.json()}catch{return json({error:"JSON inválido"},400)}
 const date=typeof body.date==="string"?body.date:yesterdayBelem();
 if(!validDate(date))return json({error:"Data inválida"},400);
 if(body.commit!==undefined&&typeof body.commit!=="boolean")return json({error:"commit inválido"},400);
 const commit=body.commit===true;
 const clinics=Object.entries(DRCLICK_CLINICS).filter(([name])=>body.clinic===undefined||body.clinic===name);
 if(!clinics.length)return json({error:"Unidade desconhecida"},400);
 if(commit&&!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"Importação indisponível: chave de serviço Supabase não configurada"},503);
 const {data:units,error:unitsError}=await client.from("clinic_units").select("id,name");
 if(unitsError)return json({error:"Não foi possível consultar unidades"},502);
 const unitMap=new Map((units||[]).map(u=>[u.name,u.id]));
 const summaries:unknown[]=[];
 for(const [name,clinicId] of clinics){
  const unitId=unitMap.get(name);
  if(!unitId){summaries.push({unit:name,error:"Unidade sem correspondência no Supabase"});continue}
  try{
   const response=await fetchMissedAppointments(date,clinicId);
   const unique=new Map<string,(typeof response.records)[number]>();
   for(const record of response.records){
    if(record.idagendamento&&!unique.has(record.idagendamento))unique.set(record.idagendamento,record);
   }
   const eligible=Array.from(unique.values()).filter(r=>r.patient_name?.trim()&&r.patient_phone&&phoneValid(r.patient_phone)&&r.scheduled_date&&!Number.isNaN(Date.parse(r.scheduled_date)));
   const skipped=unique.size-eligible.length;
   if(!commit){summaries.push({unit:name,raw:response.records.length,unique:unique.size,eligible:eligible.length,skipped,mode:"preview"});continue}
   const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
   const records=eligible.map(r=>({
    external_id:r.idagendamento,unit_id:unitId,patient_name:r.patient_name!.trim(),
    patient_phone:r.patient_phone!.replace(/\D/g,""),
    specialty:(r.category_name||r.item_name||"Não informada").trim(),
    appointment_at:r.scheduled_date,
    consultation_price:Number.isFinite(Number(r.amount))?Math.max(0,Number(r.amount)):0,
    paid_amount:Number.isFinite(Number(r.amount_paid))?Math.max(0,Number(r.amount_paid)):0,
    status:"pending"
   }));
   let inserted=0;
   for(let i=0;i<records.length;i+=100){
    const batch=records.slice(i,i+100);
    const {data,error}=await admin.from("missed_appointments").upsert(batch,{onConflict:"external_id",ignoreDuplicates:true}).select("id");
    if(error)throw new Error("Falha ao salvar lote de registros");
    inserted+=(data||[]).length;
   }
   await admin.from("audit_events").insert({operator_id:user.id,action:`drclick_manual_import:${date}:${name}:inserted=${inserted}`});
   summaries.push({unit:name,raw:response.records.length,unique:unique.size,eligible:eligible.length,skipped,inserted,mode:"import"});
  }catch(e){summaries.push({unit:name,error:e instanceof Error?e.message:"Falha na consulta"})}
 }
 return json({date,commit,units:summaries,automaticSyncEnabled:false});
}
