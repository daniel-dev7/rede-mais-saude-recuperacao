import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {DRCLICK_CLINICS,isAllowedMissedService,fetchMissedAppointments} from "../../../../lib/drclick";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const FOUNDER="bfdcf3a9-331f-4541-a5d5-94026aef5b6c";
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:"Configuração incompleta."},{status:503});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:"Não autenticado."},{status:401});
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user||user.id!==FOUNDER)return NextResponse.json({error:"Acesso restrito ao fundador."},{status:403});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await admin.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profile?.role!=="admin"||!profile.active)return NextResponse.json({error:"Acesso não autorizado."},{status:403});
 let body:unknown;try{body=await req.json()}catch{return NextResponse.json({error:"JSON inválido."},{status:400})}
 const date=body&&typeof body==="object"&&"date" in body?(body as {date:unknown}).date:null;
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Belem",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||date<"2026-10-01"||date>=today)return NextResponse.json({error:"Data fora do período permitido."},{status:400});
 const {data:units,error:unitError}=await admin.from("clinic_units").select("id,name");
 if(unitError||!units)return NextResponse.json({error:"Unidades indisponíveis."},{status:503});
 const unitIds=new Map(units.map(u=>[u.name,u.id]));
 const results=await Promise.all(Object.entries(DRCLICK_CLINICS).map(async([name,clinicId])=>{
  const unitId=unitIds.get(name);if(!unitId)return {unit:name,error:"Unidade não mapeada"};
  try{
   const {records}=await fetchMissedAppointments(date,clinicId);
   const unique=new Map(records.map(r=>[r.idagendamento,r]));
   const eligible=[...unique.values()].filter(r=>{const digits=(r.patient_phone||"").replace(/\\D/g,"");return Number(r.amount)>0&&isAllowedMissedService(r)&&Boolean(r.patient_name?.trim()&&[10,11,12,13].includes(digits.length)&&r.scheduled_date&&!Number.isNaN(Date.parse(r.scheduled_date)))});
   const rows=eligible.map(r=>({external_id:r.idagendamento,drclick_patient_id:/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(r.patient_id||'')?r.patient_id:null,unit_id:unitId,patient_name:r.patient_name!.trim(),patient_phone:r.patient_phone!.replace(/\\D/g,""),specialty:(r.category_name||r.item_name||"Não informada").trim(),appointment_at:r.scheduled_date,consultation_price:Number(r.amount),paid_amount:Number.isFinite(Number(r.amount_paid))?Math.max(0,Number(r.amount_paid)):0,status:"pending"}));
   let inserted=0;for(let i=0;i<rows.length;i+=100){const {data,error}=await admin.from("missed_appointments").upsert(rows.slice(i,i+100),{onConflict:"external_id",ignoreDuplicates:true}).select("id");if(error)throw new Error("Falha ao salvar registros");inserted+=(data||[]).length}
   // Backfill patient IDs on existing appointments without changing their status or contact history.
   let patientIdsUpdated=0;
   const withIds=eligible.filter(r=>r.patient_id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.patient_id));
   // Bounded concurrency to avoid long serial requests and protect Supabase.
   for(let i=0;i<withIds.length;i+=20){
    const batch=await Promise.all(withIds.slice(i,i+20).map(async r=>{
     const {data,error}=await admin.from("missed_appointments").update({drclick_patient_id:r.patient_id}).eq("external_id",r.idagendamento).is("drclick_patient_id",null).select("id");
     if(error)throw new Error("Falha ao atualizar identificadores de pacientes");
     return (data||[]).length;
    }));
    patientIdsUpdated+=batch.reduce((sum,n)=>sum+n,0);
   }
   return {unit:name,received:records.length,eligible:eligible.length,excluded:unique.size-eligible.length,inserted,patientIdsUpdated};
  }catch(e){return {unit:name,error:e instanceof Error?e.message:"Falha na importação"}}
 }));
 return NextResponse.json({date,results,success:results.every(r=>!("error" in r))},{status:results.some(r=>"error" in r)?502:200});
}
