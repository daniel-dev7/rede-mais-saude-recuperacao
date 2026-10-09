"use client";
import {useEffect,useState} from "react";
import {createClient} from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase=url&&key?createClient(url,key):null;
export default function ResetPasswordPage(){
 const [resetEmail,setResetEmail]=useState(""),[requestBusy,setRequestBusy]=useState(false),[ready,setReady]=useState(false),[valid,setValid]=useState(false),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{if(!supabase){setReady(true);return}const client=supabase;let active=true;
 const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{if(!active)return;if(event==="PASSWORD_RECOVERY"&&session){setValid(true);setReady(true)}});
 (async()=>{try{
  const query=new URLSearchParams(window.location.search);
  const fragment=new URLSearchParams(window.location.hash.replace(/^#/,""));
  const errorCode=query.get("error_code")||fragment.get("error_code");
  if(errorCode){if(active)setMessage(errorCode==="otp_expired"?"Este link de recuperação expirou ou já foi utilizado. Solicite um novo abaixo.":"O link de recuperação é inválido. Solicite um novo abaixo.");if(active){setValid(false);setReady(true)}return}
  const tokenHash=query.get("token_hash");
  const code=query.get("code");
  if(tokenHash){const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type:"recovery"});if(error)throw error}
  else if(code){const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error}
  const {data:{session}}=await client.auth.getSession();
  if(active){setValid(Boolean(session));setReady(true)}
 }catch{if(active){setMessage("O link de recuperação é inválido ou expirou. Solicite um novo abaixo.");setValid(false);setReady(true)}}})();
 return()=>{active=false;subscription.unsubscribe()}
 },[]);
 async function requestNewLink(e:React.FormEvent){e.preventDefault();if(!supabase||requestBusy)return;setRequestBusy(true);setMessage("");try{const {error}=await supabase.auth.resetPasswordForEmail(resetEmail.trim(),{redirectTo:window.location.origin+"/redefinir-senha"});if(error)throw error;setMessage("Se o e-mail estiver cadastrado, enviaremos um novo link. Verifique também o spam e use apenas o e-mail mais recente.")}catch(e){const err=e as {status?:number};setMessage(err.status===429?"Limite de envio atingido. Aguarde antes de tentar novamente.":"Não foi possível enviar agora. Verifique os limites de e-mail no Supabase.")}finally{setRequestBusy(false)}}
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;if(password.length<12||password!==confirm){setMessage("A senha precisa ter ao menos 12 caracteres e ser igual à confirmação.");return}
 setBusy(true);setMessage("");
 try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error("Link inválido ou expirado. Solicite outro link.");
 if(session.user.app_metadata?.must_change_password===true){const res=await fetch("/api/auth/first-password",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({password})});if(!res.ok)throw Error("Não foi possível salvar a nova senha.")}
 else{const {error}=await supabase.auth.updateUser({password});if(error)throw error}
 await supabase.auth.signOut();setValid(false);setMessage("Senha atualizada com sucesso! Volte ao login para entrar com sua nova senha.");
 }catch(e){setMessage(e instanceof Error?e.message:"Falha ao redefinir senha.")}finally{setBusy(false)}}
 return <main className="login-page"><section className="login-card"><div className="login-symbol"><img src="/logo-rede-mais-saude.svg" width="48" height="48" alt="Rede Mais Saúde"/></div><div className="eyebrow">SEGURANÇA DA CONTA</div><h1>Redefinir senha</h1>{!ready?<p>Validando link de recuperação...</p>:valid?<><p className="muted">Escolha uma nova senha para sua conta.</p><form className="login-form" onSubmit={save}><label>Nova senha<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmar nova senha<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="primary-btn" disabled={busy}>{busy?"Salvando...":"Salvar nova senha"}</button></form></>:<><p className="muted">O link pode ter expirado ou já ter sido utilizado. Solicite outro para continuar.</p><form className="login-form" onSubmit={requestNewLink}><label>E-mail cadastrado<input type="email" required autoComplete="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="seuemail@empresa.com"/></label><button className="primary-btn" disabled={requestBusy}>{requestBusy?"Solicitando...":"Solicitar novo link"}</button></form></>}{message&&<p className="notice" role="alert">{message}</p>}<a href="/" style={{display:"inline-block",marginTop:16}}>Voltar ao login</a></section></main>
}
