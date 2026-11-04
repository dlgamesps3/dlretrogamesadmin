import {requireAdmin,json} from "../../../_lib/security.js";
export async function onRequestPatch({request,env,params}) {
  try {
    if(!(await requireAdmin(request,env)))return json({error:"Não autenticado."},401);
    const id=Number(params.id), body=await request.json();
    if(!Number.isInteger(id))return json({error:"ID inválido."},400);
    if(body.action==="toggle") {
      await env.DB.prepare("UPDATE users SET blocked=CASE WHEN blocked=1 THEN 0 ELSE 1 END WHERE id=?").bind(id).run();
    } else if(body.action==="renew") {
      const days=Math.max(1,Math.min(3650,Number(body.days)||30));
      await env.DB.prepare("UPDATE users SET expires_at=? WHERE id=?").bind(new Date(Date.now()+days*86400000).toISOString(),id).run();
    } else return json({error:"Ação inválida."},400);
    return json({ok:true});
  }catch(e){return json({error:e.message},500);}
}
export async function onRequestDelete({request,env,params}) {
  try {
    if(!(await requireAdmin(request,env)))return json({error:"Não autenticado."},401);
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(Number(params.id)).run();
    return json({ok:true});
  }catch(e){return json({error:e.message},500);}
}