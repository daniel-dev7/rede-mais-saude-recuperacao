import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {DRCLICK_CLINICS,fetchMissedAppointments,fetchAttendedAppointments,yesterdayBelem} from "../../../../lib/drclick";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

// Vercel Cron uses UTC. 04:00 UTC = 01:00 in America/Belem (UTC-3).
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;
 const authorization=request.headers.get("authorization");
 if(!expected||authorization!==`Bearer ${expected}`)
  return NextResponse.json({error:"Não autorizado"},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Supabase não configurado"},{status:503});
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:units,error:unitError}=await admin.from("clinic_units").select("id,name");
 if(unitError||!units)return NextResponse.json({error:"Falha ao carregar unidades"},{status:502});
 const unitIds=new Map(units.map(u=>[u.name,u.id]));
 const date=yesterdayBelem();
 const results=await Promise.all(Object.entries(DRCLICK_CLINICS).map(async([name,clinicId])=>{
  const unitId=unitIds.get(name);
  if(!unitId)return {unit:name,error:"Unidade não mapeada"};
  try{
   const {records}=await fetchMissedAppointments(date,clinicId);
   const unique=new Map<string,(typeof records)[number]>();
   for(const r of records)if(r.idagendamento&&!unique.has(r.idagendamento))unique.set(r.idagendamento,r);
   const eligible=[...unique.values()].filter(r=>{
    const digits=(r.patient_phone||"").replace(/\D/g,"");
    return Number(r.amount)>0&&Boolean(r.patient_name?.trim()&&[10,11,12,13].includes(digits.length)&&!/^(0+)$/.test(digits)&&r.scheduled_date&&!Number.isNaN(Date.parse(r.scheduled_date)));
   });
   const rows=eligible.map(r=>({
    external_id:r.idagendamento,drclick_patient_id:/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(r.patient_id||'')?r.patient_id:null,unit_id:unitId,patient_name:r.patient_name!.trim(),
    patient_phone:r.patient_phone!.replace(/\D/g,""),
    specialty:(r.category_name||r.item_name||"Não informada").trim(),
    appointment_at:r.scheduled_date,
    consultation_price:Number.isFinite(Number(r.amount))?Math.max(0,Number(r.amount)):0,
    paid_amount:Number.isFinite(Number(r.amount_paid))?Math.max(0,Number(r.amount_paid)):0,
    status:"pending"
   }));
   let inserted=0;
   for(let i=0;i<rows.length;i+=100){
    const {data,error}=await admin.from("missed_appointments").upsert(rows.slice(i,i+100),{onConflict:"external_id",ignoreDuplicates:true}).select("id");
    if(error)throw new Error("Erro ao persistir registros");
    inserted+=(data||[]).length;
   }
   const {error:auditError}=await admin.from("audit_events").insert({action:`drclick_cron_import:${date}:${name}:inserted=${inserted}`});
   if(auditError)throw new Error("Falha ao registrar auditoria");
   return {unit:name,received:records.length,unique:unique.size,eligible:eligible.length,skipped:unique.size-eligible.length,inserted};
  }catch(e){return {unit:name,error:e instanceof Error?e.message:"Erro desconhecido"}}
 }));
 // Reconcile yesterday's attended appointments without human approval.
 // A patient match alone is insufficient: require a later appointment for the same procedure.
 const normalized=(s:string)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().toLowerCase().replace(/\\s+/g," ");
 const attendance=await Promise.all(Object.entries(DRCLICK_CLINICS).map(async([name,clinicId])=>{
  try{
   const {records}=await fetchAttendedAppointments(date,clinicId);
   const patientIds=[...new Set(records.map(r=>r.patient_id).filter((id):id is string=>Boolean(id)))];
   if(!patientIds.length)return {unit:name,attended:records.length,confirmed:0};
   let confirmed=0;
   for(let i=0;i<patientIds.length;i+=100){
    const {data:misses,error}=await admin.from("missed_appointments").select("id,drclick_patient_id,specialty,appointment_at,status").in("drclick_patient_id",patientIds.slice(i,i+100)).neq("status","attended").limit(1000);
    if(error)throw new Error("Falha ao consultar faltosos para conciliação");
    for(const miss of misses||[]){
     const matches=records.filter(r=>r.patient_id===miss.drclick_patient_id&&new Date(r.scheduled_date).getTime()>new Date(miss.appointment_at).getTime()&&normalized(r.category_name||r.item_name||"")===normalized(miss.specialty));
     if(matches.length!==1)continue;
     const {data:updated,error:updateError}=await admin.from("missed_appointments").update({status:"attended"}).eq("id",miss.id).eq("status",miss.status).select("id");
     if(updateError)throw new Error("Falha ao confirmar recuperação");
     confirmed+=(updated||[]).length;
    }
   }
   return {unit:name,attended:records.length,confirmed};
  }catch(e){return {unit:name,error:e instanceof Error?e.message:"Falha na validação de atendimentos"}}
 }));
 const failed=results.some(r=>"error" in r)||attendance.some(r=>"error" in r);
 return NextResponse.json({date,results,attendance,automaticSyncEnabled:true,success:!failed},{status:failed?502:200,headers:{"Cache-Control":"no-store"}});
}
