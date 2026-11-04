import {verifyPassword,json} from "../../_lib/security.js";
export async function onRequestPost({request,env}) {
  try {
    const {username,password}=await request.json();
    const user=await env.DB.prepare("SELECT username,password_hash,plan,expires_at,blocked FROM users WHERE username=?").bind(String(username||"")).first();
    if(!user||user.blocked||!(await verifyPassword(String(password||""),user.password_hash)))return json({error:"Usuário ou senha inválidos."},401);
    if(user.expires_at&&new Date(user.expires_at).getTime()<Date.now())return json({error:"Seu acesso expirou."},403);
    return json({ok:true,plan:user.plan,expires_at:user.expires_at});
  }catch{return json({error:"Não foi possível validar o acesso."},400);}
}