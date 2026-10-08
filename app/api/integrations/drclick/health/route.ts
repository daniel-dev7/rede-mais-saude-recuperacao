import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function GET(request:Request){
 const header=request.headers.get("authorization")||"";
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Configuração incompleta"},{status:503});
 if(!header.startsWith("Bearer "))return NextResponse.json({error:"Não autorizado"},{status:401});
 const client=createClient(url,key);
 const {data:{user},error}=await client.auth.getUser(header.slice(7));
 if(error||!user)return NextResponse.json({error:"Não autorizado"},{status:401});
 const {data:profile,error:profileError}=await client.from("operator_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profileError||!profile?.active||profile.role!=="admin")return NextResponse.json({error:"Acesso negado"},{status:403});
 return NextResponse.json({configured:Boolean(process.env.DRCLICK_API_TOKEN||process.env.DRCLICK_API_KEY),mode:"read-only",importEnabled:false,source:"DrClick",message:"Conector preparado. Autenticação e formato de dados ainda precisam ser validados."},{headers:{"Cache-Control":"no-store"}});
}
