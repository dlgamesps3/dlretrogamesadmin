import {clearCookie,json} from "../../_lib/security.js";
export async function onRequestPost(){return json({ok:true},{status:200,headers:{"Set-Cookie":clearCookie()}});}