import {createHandler} from '../cloudflare/worker.mjs';
const handle=createHandler();
export default {
  fetch(request){
    return handle(request,{
      DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,
      ACCESS_TOKEN:process.env.ACCESS_TOKEN,
      ALLOWED_ORIGIN:new URL(request.url).origin
    });
  }
};
