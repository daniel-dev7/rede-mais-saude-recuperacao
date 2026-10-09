import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
async function authorized(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return {error:NextResponse.json({error:"Configure SUPABASE_SERVICE_ROLE_KEY no servidor."},{status:503})};
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)return {error:NextResponse.json({error:"Não autenticado."},{status:401})};
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(bearer);
 if(authError||!user)return {error:NextResponse.json({error:"Sessão inválida."},{status:401})};
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await admin.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profile?.role!=="admin"||!profile.active)return {error:NextResponse.json({error:"Acesso restrito ao administrador."},{status:403})};
 return {admin,user};
}
export async function GET(req:NextRequest){
 const ctx=await authorized(req);if(ctx.error)return ctx.error;
 const {data,error}=await ctx.admin!.from("operator_profiles").select("user_id,display_name,role,active,created_at").order("created_at",{ascending:false});
 if(error)return NextResponse.json({error:"Não foi possível listar usuários."},{status:500});
 return NextResponse.json({users:data??[]});
}
export async function PATCH(req:NextRequest){
 const ctx=await authorized(req);if(ctx.error)return ctx.error;
 let input:Record<string,unknown>;try{input=await req.json()}catch{return NextResponse.json({error:"Dados inválidos."},{status:400})}
 const userId=input.userId,role=input.role,active=input.active;
 if(typeof userId!=="string"||!/^[a-f0-9-]{36}$/i.test(userId)||!(role===undefined||role==="admin"||role==="operator")||!(active===undefined||typeof active==="boolean")||(role===undefined&&active===undefined))return NextResponse.json({error:"Alteração inválida."},{status:400});
 if(userId===ctx.user!.id&&(active===false||role==="operator"))return NextResponse.json({error:"Você não pode remover seu próprio acesso administrativo."},{status:400});
 const {data:existing}=await ctx.admin!.from("operator_profiles").select("role,active").eq("user_id",userId).maybeSingle();
 if(!existing)return NextResponse.json({error:"Usuário não encontrado."},{status:404});
 if(existing.role==="admin"&&(role==="operator"||active===false)){
  const {data:admins,error:countError}=await ctx.admin!.from("operator_profiles").select("user_id").eq("role","admin").eq("active",true);
  if(countError||!admins||admins.length<=1)return NextResponse.json({error:"É obrigatório manter pelo menos um administrador ativo."},{status:400});
 }
 const changes:{role?:string;active?:boolean}={};if(role!==undefined)changes.role=role as string;if(active!==undefined)changes.active=active as boolean;
 const {error}=await ctx.admin!.from("operator_profiles").update(changes).eq("user_id",userId);
 if(error)return NextResponse.json({error:"Não foi possível atualizar o usuário."},{status:500});
 return NextResponse.json({ok:true});
}
// Somente a conta fundadora pode excluir cadastros. O histórico de atendimentos permanece preservado.
const FOUNDER_USER_ID="bfdcf3a9-331f-4541-a5d5-94026aef5b6c";
export async function DELETE(req:NextRequest){
 const ctx=await authorized(req);if(ctx.error)return ctx.error;
 if(ctx.user!.id!==FOUNDER_USER_ID)return NextResponse.json({error:"Somente o administrador fundador pode excluir usuários."},{status:403});
 let input:unknown;try{input=await req.json()}catch{return NextResponse.json({error:"Dados inválidos."},{status:400})}
 const userId=input&&typeof input==="object"&&"userId" in input?(input as {userId?:unknown}).userId:null;
 if(typeof userId!=="string"||!/^[a-f0-9-]{36}$/i.test(userId))return NextResponse.json({error:"Usuário inválido."},{status:400});
 if(userId===FOUNDER_USER_ID)return NextResponse.json({error:"A conta do administrador fundador não pode ser excluída."},{status:403});
 const {data:target,error:targetError}=await ctx.admin!.from("operator_profiles").select("user_id,role,active").eq("user_id",userId).maybeSingle();
 if(targetError)return NextResponse.json({error:"Não foi possível validar o cadastro."},{status:500});
 if(!target)return NextResponse.json({error:"Cadastro não encontrado."},{status:404});
 if(target.role==="admin"&&target.active){const {data:admins,error:countError}=await ctx.admin!.from("operator_profiles").select("user_id").eq("role","admin").eq("active",true);if(countError||!admins||admins.length<=1)return NextResponse.json({error:"É obrigatório manter pelo menos um administrador ativo."},{status:400})}
 // Soft delete mantém as referências históricas de contato e auditoria.
 const {error:deleteError}=await ctx.admin!.auth.admin.deleteUser(userId,true);
 if(deleteError)return NextResponse.json({error:"Não foi possível excluir a conta de acesso."},{status:500});
 const {error:profileError}=await ctx.admin!.from("operator_profiles").delete().eq("user_id",userId);
 if(profileError)return NextResponse.json({error:"Conta desativada, mas houve falha ao remover o perfil. Contate o suporte."},{status:500});
 return NextResponse.json({ok:true,message:"Cadastro excluído. O histórico de atendimentos foi preservado."});
}
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
 const role=input.role==="admin"?"admin":"operator";
 if(input.role!==undefined&&input.role!=="admin"&&input.role!=="operator")return NextResponse.json({error:"Cargo inválido."},{status:400});
 const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
 const name=typeof input.name==="string"?input.name.trim():"";
 const password=typeof input.password==="string"?input.password:"";
 if(password.length<12||password.length>128)return NextResponse.json({error:"A senha provisória deve conter entre 12 e 128 caracteres."},{status:400});
 const {data:allUnits,error:allUnitsError}=await admin.from("clinic_units").select("id");
 if(allUnitsError||!allUnits?.length)return NextResponse.json({error:"Unidades não disponíveis."},{status:503});
 const unitIds=allUnits.map(u=>u.id);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||name.length>120||unitIds.length===0||unitIds.length>30||!unitIds.every(x=>typeof x==="string"&&/^[a-f0-9-]{36}$/i.test(x))||new Set(unitIds).size!==unitIds.length)
 return NextResponse.json({error:"Informe nome, e-mail e pelo menos uma unidade válida."},{status:400});
 const {data:units,error:unitsError}=await admin.from("clinic_units").select("id").in("id",unitIds);
 if(unitsError||units?.length!==unitIds.length)return NextResponse.json({error:"Unidades inválidas."},{status:400});
 const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:name},app_metadata:{must_change_password:true}});
 if(createError||!created.user)return NextResponse.json({error:"Não foi possível criar o usuário. Verifique se o e-mail já existe."},{status:409});
 const newId=created.user.id;
 const {error:profileError}=await admin.from("operator_profiles").upsert({user_id:newId,display_name:name,role,active:true});
 if(profileError){await admin.auth.admin.deleteUser(newId);return NextResponse.json({error:"Falha ao atribuir perfil."},{status:500})}
 const {error:assignmentError}=await admin.from("operator_units").insert(unitIds.map(unit_id=>({user_id:newId,unit_id})));
 if(assignmentError){await admin.auth.admin.deleteUser(newId);return NextResponse.json({error:"Falha ao atribuir unidades."},{status:500})}
 return NextResponse.json({ok:true,message:"Usuário criado. A senha provisória deverá ser trocada no primeiro acesso."},{status:201});
}
