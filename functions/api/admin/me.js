import {requireAdmin,json} from "../../_lib/security.js";
export async function onRequestGet({request,env}) {
  try {const session=await requireAdmin(request,env);return session?json({ok:true,username:session.u}):json({error:"Não autenticado."},401);}
  catch(e){return json({error:e.message},500);}
}