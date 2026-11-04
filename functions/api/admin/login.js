import {verifyPassword,createSession,sessionCookie,json} from "../../_lib/security.js";

export async function onRequestPost({request,env}) {
  try {
    const body = await request.json();

    if(!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
      return json({error:"Configure os Secrets do administrador no Cloudflare."},500);
    }

    const user = String(body.username || "");
    const pass = String(body.password || "");

    if(user !== env.ADMIN_USERNAME || !(await verifyPassword(pass,env.ADMIN_PASSWORD_HASH))) {
      return json({error:"Usuário ou senha incorretos."},401);
    }

    const token = await createSession(env,user);

    return json({ok:true},200,{"Set-Cookie":sessionCookie(token)});

  } catch (err) {
    console.error("ERRO ADMIN LOGIN:",err);
    return json({error:"Falha ao processar login. Consulte os logs."},500);
  }
}
