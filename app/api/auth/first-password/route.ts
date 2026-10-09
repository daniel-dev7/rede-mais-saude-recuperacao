import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:"Serviço indisponível."},{status:503});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:"Sessão necessária."},{status:401});
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)return NextResponse.json({error:"Sessão inválida."},{status:401});
 if(user.app_metadata?.must_change_password!==true)return NextResponse.json({error:"Troca obrigatória não pendente."},{status:409});
 let input:unknown;try{input=await req.json()}catch{return NextResponse.json({error:"Dados inválidos."},{status:400})}
 const password=input&&typeof input==="object"&&"password" in input?(input as {password?:unknown}).password:null;
 if(typeof password!=="string"||password.length<12||password.length>128)return NextResponse.json({error:"Use uma senha de 12 a 128 caracteres."},{status:400});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await admin.from("operator_profiles").select("active").eq("user_id",user.id).maybeSingle();
 if(profileError||!profile?.active)return NextResponse.json({error:"Conta sem autorização."},{status:403});
 const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{password,app_metadata:{...user.app_metadata,must_change_password:false}});
 if(updateError)return NextResponse.json({error:"Não foi possível atualizar a senha."},{status:500});
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
