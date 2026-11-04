import {requireAdmin,json,hashPassword,randomCredential} from "../../_lib/security.js";
export async function onRequestGet({request,env}) {
  try {
    if(!(await requireAdmin(request,env)))return json({error:"Não autenticado."},401);
    const {results=[]}=await env.DB.prepare("SELECT id, username, plan, note, expires_at, blocked, created_at FROM users ORDER BY created_at DESC").all();
    return json({users:results});
  } catch(e){return json({error:e.message},500);}
}
export async function onRequestPost({request,env}) {
  try {
    if(!(await requireAdmin(request,env)))return json({error:"Não autenticado."},401);
    const body=await request.json(), plan=body.plan==="VIP"?"VIP":"GRATIS";
    const days=Math.max(0,Math.min(3650,Number(body.days)||0));
    const username=`dlrg_${randomCredential(7).toLowerCase()}`;
    const password=randomCredential(12);
    const password_hash=await hashPassword(password);
    const expires_at=days?new Date(Date.now()+days*86400000).toISOString():null;
    await env.DB.prepare("INSERT INTO users (username,password_hash,plan,note,expires_at,blocked,created_at) VALUES (?,?,?,?,?,0,?)")
      .bind(username,password_hash,plan,String(body.note||"").slice(0,100),expires_at,new Date().toISOString()).run();
    return json({ok:true,username,password,expires_at});
  }catch(e){return json({error:e.message||"Falha ao criar usuário."},500);}
}