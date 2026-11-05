import {clearCookie,json} from "../../_lib/security.js";

export async function onRequestPost() {
  return json(
    {ok:true},
    200,
    {"Set-Cookie":clearCookie()}
  );
}
