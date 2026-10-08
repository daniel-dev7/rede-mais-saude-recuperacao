import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:"Cadastro administrativo ainda não configurado."},{status:503});
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)return NextResponse.json({error:"Não autenticado."},{status:401});
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(bearer);
 if(authError||!user)return NextResponse.json({error:"Sessão inválida."},{status:401});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await admin.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profile?.role!=="admin"||!profile.active)return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
 let body:unknown;
 try{body=await req.json()}catch{return NextResponse.json({error:"JSON inválido."},{status:400})}
 if(!body||typeof body!=="object")return NextResponse.json({error:"Dados inválidos."},{status:400});
 const input=body as Record<string,unknown>;
 const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
 const name=typeof input.name==="string"?input.name.trim():"";
 const unitIds=Array.isArray(input.unitIds)?input.unitIds:[];
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||name.length>120||unitIds.length===0||unitIds.length>30||!unitIds.every(x=>typeof x==="string"&&/^[a-f0-9-]{36}$/i.test(x))||new Set(unitIds).size!==unitIds.length)
 return NextResponse.json({error:"Informe nome, e-mail e pelo menos uma unidade válida."},{status:400});
 const {data:units,error:unitsError}=await admin.from("clinic_units").select("id").in("id",unitIds);
 if(unitsError||units?.length!==unitIds.length)return NextResponse.json({error:"Unidades inválidas."},{status:400});
 const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:name}});
 if(inviteError||!invited.user)return NextResponse.json({error:"Não foi possível convidar o usuário. Verifique se o e-mail já existe."},{status:409});
 const newId=invited.user.id;
 const {error:profileError}=await admin.from("operator_profiles").upsert({user_id:newId,display_name:name,role:"operator",active:true});
 if(profileError){await admin.auth.admin.deleteUser(newId);return NextResponse.json({error:"Falha ao atribuir perfil."},{status:500})}
 const {error:assignmentError}=await admin.from("operator_units").insert(unitIds.map(unit_id=>({user_id:newId,unit_id})));
 if(assignmentError){await admin.auth.admin.deleteUser(newId);return NextResponse.json({error:"Falha ao atribuir unidades."},{status:500})}
 return NextResponse.json({ok:true,message:"Convite enviado ao operador."},{status:201});
}
