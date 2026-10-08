import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {fetchMissedAppointments,yesterdayBelem} from "../../../../../lib/drclick";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function shape(value:unknown):string{
 if(value===null)return "null";
 if(Array.isArray(value))return "array";
 if(typeof value==="string")return "string";
 if(typeof value==="number")return "number";
 if(typeof value==="boolean")return "boolean";
 return "object";
}
export async function POST(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if(!url||!key)return NextResponse.json({error:"Configuração incompleta"},{status:503});
 if(!token)return NextResponse.json({error:"Não autorizado"},{status:401});
 const client=createClient(url,key);
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)return NextResponse.json({error:"Não autorizado"},{status:401});
 const {data:profile}=await client.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(!profile?.active||profile.role!=="admin")return NextResponse.json({error:"Acesso negado"},{status:403});
 if(!process.env.DRCLICK_API_TOKEN&&!process.env.DRCLICK_API_KEY)return NextResponse.json({error:"Credencial DrClick ainda não configurada"},{status:503});
 let date=yesterdayBelem();
 try{const body:unknown=await request.json();if(body&&typeof body==="object"&&"date" in body&&typeof body.date==="string")date=body.date}catch{return NextResponse.json({error:"JSON inválido"},{status:400})}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Data inválida"},{status:400});
 try{
  const result=await fetchMissedAppointments(date);
  const first=result.records.find(x=>x&&typeof x==="object"&&!Array.isArray(x));
  const fields=first?Object.entries(first as Record<string,unknown>).map(([name,value])=>({name,type:shape(value)})):[];
  return NextResponse.json({date,count:result.records.length,container:result.rawShape,fields,importEnabled:false},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha na consulta"},{status:502,headers:{"Cache-Control":"no-store"}})}
}
