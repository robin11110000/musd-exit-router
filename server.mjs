import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {getQuotes,validateAmount} from './src/mezo.mjs';
const files={'/':['web/index.html','text/html'],'/app.js':['web/app.js','text/javascript'],'/style.css':['web/style.css','text/css']};
let busy=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(url.pathname==='/api/quotes'){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  let amount=url.searchParams.get('amount');
  try{validateAmount(amount);}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));return;}
  if(busy>=2){res.writeHead(429);res.end(JSON.stringify({error:'Quotes are busy. Please try again shortly.'}));return;}
  busy++;
  try{res.end(JSON.stringify(await getQuotes(amount),(_,v)=>typeof v==='bigint'?v.toString():v));}
  catch{res.writeHead(502);res.end(JSON.stringify({error:'Unable to reach Mezo. Please try again.'}));}
  finally{busy--;}
  return;
 }
 const file=files[url.pathname];
 if(!file){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',file[1]);res.end(await readFile(file[0]));
});
server.listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log('MUSD Exit Router: http://127.0.0.1:3000'));
