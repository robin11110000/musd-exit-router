const form=document.querySelector('#quote-form');
const amount=document.querySelector('#amount');
const button=document.querySelector('#compare');
const status=document.querySelector('#status');
const results=document.querySelector('#results');
const routes=document.querySelector('#routes');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
let scrollPending=false;
function updateScroll(){const range=document.documentElement.scrollHeight-innerHeight;document.documentElement.style.setProperty('--scroll',range>0?scrollY/range:0);scrollPending=false;}
addEventListener('scroll',()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(updateScroll);}},{passive:true});
addEventListener('resize',updateScroll);updateScroll();
if(!reduceMotion.matches&&'IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.12});
 document.querySelectorAll('.principles>div').forEach(el=>{el.classList.add('reveal');observer.observe(el);});
}
let generation=0;
let quoteTimer;
const units=value=>{
 const n=BigInt(value);const whole=n/10n**18n;const fraction=(n%10n**18n).toString().padStart(18,'0').slice(0,8).replace(/0+$/,'');
 return `${whole.toLocaleString()}${fraction?'.'+fraction:''}`;
};
const add=(parent,tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;parent.append(el);return el;};
function invalidate(){generation++;clearTimeout(quoteTimer);results.hidden=true;status.textContent='Amount changed. Compare again for a fresh quote.';}
amount.addEventListener('input',invalidate);
document.querySelectorAll('[data-amount]').forEach(b=>b.addEventListener('click',()=>{amount.value=b.dataset.amount;invalidate();form.requestSubmit();}));
form.addEventListener('submit',async e=>{
 e.preventDefault();const current=++generation;clearTimeout(quoteTimer);button.disabled=true;status.textContent='Reading prices and simulating pool quotes on Mezo…';results.hidden=true;
 try{
  const response=await fetch(`/api/quotes?amount=${encodeURIComponent(amount.value.trim())}`);
  const data=await response.json();if(!response.ok)throw new Error(data.error??'Could not fetch quotes.');if(current!==generation)return;
  routes.replaceChildren();
  for(const route of data.routes){
   const card=add(routes,'article','',`route${route.id===data.highestGrossRoute?' best':''}`);
   const top=add(card,'div','','route-top');add(top,'h3',route.name);
   if(route.id===data.highestGrossRoute)add(top,'span','HIGHEST GROSS OUTPUT','tag');
   if(route.status!=='quoted'){add(card,'p',route.reason,'route-detail');continue;}
   const output=add(card,'div',units(route.out),'output');add(output,'small','BTC');
   add(card,'div',route.kind,'route-detail');
   if(route.warning)add(card,'div',route.warning,'route-detail partial');
   if(!route.fullFill)add(card,'div',`Partial fill · ${units(route.spent)} MUSD spent · ${units(route.refund)} MUSD unspent`,'route-detail partial');
   else add(card,'div',`Full input quoted${route.feeBps?` · ${(route.feeBps/100).toFixed(2)}% redemption fee included`:''}`,'route-detail');
  }
  const meta=document.querySelector('#quote-meta');meta.replaceChildren();
  const link=add(meta,'a',`Testnet block ${Number(data.blockNumber).toLocaleString()} ↗`);link.href=`https://explorer.test.mezo.org/block/${data.blockNumber}`;link.target='_blank';link.rel='noopener noreferrer';
  add(meta,'div','Single-block comparison · gas excluded · supported direct routes only');
  status.textContent='Quote loaded. Highest gross output is not a guaranteed net return.';results.hidden=false;
  quoteTimer=setTimeout(()=>{status.textContent='This quote is older than 30 seconds. Compare again to refresh.';document.querySelectorAll('.tag').forEach(el=>el.remove());},30000);
 }catch(error){if(current===generation)status.textContent=error.message;}
 finally{button.disabled=false;}
});
