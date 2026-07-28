import crypto from "node:crypto";

const graph = "https://graph.facebook.com/v24.0";
const sessionName = "meta_ads_session";
const stateName = "meta_ads_state";
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const requireEnv = name => { const value = process.env[name]; if (!value) throw new Error(`A variável ${name} não está configurada na Netlify.`); return value; };
const appId = () => requireEnv("META_APP_ID");
const appSecret = () => requireEnv("META_APP_SECRET");
const redirectUri = () => process.env.META_REDIRECT_URI || `${process.env.URL}/.netlify/functions/meta-callback`;
const key = () => crypto.createHash("sha256").update(requireEnv("TOKEN_ENCRYPTION_KEY")).digest();
const cookie = (name, value, age) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const parseCookies = request => Object.fromEntries((request.headers.get("cookie") || "").split(/;\s*/).filter(Boolean).map(item => { const p = item.indexOf("="); return [item.slice(0,p), decodeURIComponent(item.slice(p+1))]; }));
function encrypt(value) { const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv("aes-256-gcm",key(),iv); const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]); return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join("."); }
function decrypt(value) { try { const [iv,tag,data]=value.split(".").map(v=>Buffer.from(v,"base64url")); const decipher=crypto.createDecipheriv("aes-256-gcm",key(),iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString()); } catch { return null; } }
const getSession = request => { const raw=parseCookies(request)[sessionName]; return raw ? decrypt(raw) : null; };
const sessionCookie = session => cookie(sessionName,encrypt(session),60*60*24*50);
const rootUrl = request => new URL("/",request.url);

function actionValue(row, accepted) { return Number((row.actions || []).find(a => accepted.includes(a.action_type))?.value || 0); }
function actionCost(row, accepted) { return Number((row.cost_per_action_type || []).find(a => accepted.includes(a.action_type))?.value || 0); }
const leadActions=["lead","onsite_conversion.lead_grouped","offsite_conversion.fb_pixel_lead","omni_lead","onsite_web_lead"];
const purchaseActions=["purchase","omni_purchase","offsite_conversion.fb_pixel_purchase"];
function number(v) { return Number(v || 0); }
function statusFor(campaign, baselineCpl) {
  if (!campaign.leads && campaign.spend > 35) return { label:"Sem resultado", tone:"bad", reason:"Gastou sem gerar lead" };
  if (campaign.frequency >= 4) return { label:"Frequência alta", tone:"warn", reason:"Público pode estar saturado" };
  if (campaign.cpl && baselineCpl && campaign.cpl >= baselineCpl * 1.25) return { label:"CPL alto", tone:"bad", reason:"Acima da média da conta" };
  if (campaign.cpl && baselineCpl && campaign.cpl <= baselineCpl * .85) return { label:"Bom", tone:"good", reason:"CPL abaixo da média" };
  if (campaign.leads) return { label:"Estável", tone:"good", reason:"Gerando resultados" };
  return { label:"Monitorar", tone:"warn", reason:"Poucos dados" };
}
async function graphGet(path, accessToken) { const response=await fetch(`${graph}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`); const data=await response.json(); if(!response.ok) throw new Error(data.error?.message || "A Meta não retornou os dados."); return data; }
async function connect(request) {
  const state=crypto.randomBytes(24).toString("hex");
  const params=new URLSearchParams({client_id:appId(),redirect_uri:redirectUri(),state,response_type:"code",scope:"ads_read"});
  return new Response(null,{status:302,headers:{Location:`https://www.facebook.com/v24.0/dialog/oauth?${params}`,"Set-Cookie":cookie(stateName,state,600)}});
}
async function callback(request) {
  const url=new URL(request.url), home=rootUrl(request), error=url.searchParams.get("error"), code=url.searchParams.get("code"), state=url.searchParams.get("state"), saved=parseCookies(request)[stateName];
  if(error || !code || !state || !saved || saved.length!==state.length || !crypto.timingSafeEqual(Buffer.from(saved),Buffer.from(state))) { home.searchParams.set("meta",error?"cancelado":"erro"); return Response.redirect(home,302); }
  try {
    const base=new URLSearchParams({client_id:appId(),client_secret:appSecret(),redirect_uri:redirectUri(),code});
    const first=await fetch(`${graph}/oauth/access_token?${base}`); const firstData=await first.json(); if(!first.ok || !firstData.access_token) throw new Error(firstData.error?.message||"Autorização recusada");
    const extended=new URLSearchParams({grant_type:"fb_exchange_token",client_id:appId(),client_secret:appSecret(),fb_exchange_token:firstData.access_token});
    const second=await fetch(`${graph}/oauth/access_token?${extended}`); const secondData=await second.json(); const token=second.ok && secondData.access_token ? secondData.access_token : firstData.access_token;
    home.searchParams.set("meta","conectado");
    return new Response(null,{status:302,headers:{Location:home.toString(),"Set-Cookie":sessionCookie({accessToken:token,connectedAt:Date.now()})}});
  } catch { home.searchParams.set("meta","erro"); return Response.redirect(home,302); }
}
async function dashboard(request) {
  const session=getSession(request); if(!session?.accessToken) return json({connected:false,accounts:[],campaigns:[]},401);
  const url=new URL(request.url), since=url.searchParams.get("since"), until=url.searchParams.get("until");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(since||"") || !/^\d{4}-\d{2}-\d{2}$/.test(until||"")) return json({error:"Período inválido."},400);
  try {
    const accountData=await graphGet("/me/adaccounts?fields=id,name,account_status,currency&limit=100",session.accessToken);
    const accounts=accountData.data||[];
    const range=encodeURIComponent(JSON.stringify({since,until}));
    const fields=encodeURIComponent("campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpm,frequency,actions,cost_per_action_type,purchase_roas");
    const rows=(await Promise.all(accounts.map(async account=>{ const result=await graphGet(`/${account.id}/insights?level=campaign&time_range=${range}&fields=${fields}&limit=500`,session.accessToken); return (result.data||[]).map(row=>({accountId:account.id,accountName:account.name,currency:account.currency||"BRL",id:row.campaign_id,name:row.campaign_name,spend:number(row.spend),impressions:number(row.impressions),reach:number(row.reach),clicks:number(row.clicks),ctr:number(row.ctr),cpm:number(row.cpm),frequency:number(row.frequency),leads:actionValue(row,leadActions),cpl:actionCost(row,leadActions),purchases:actionValue(row,purchaseActions),roas:number((row.purchase_roas||[])[0]?.value)})); }))).flat();
    const spend=rows.reduce((a,c)=>a+c.spend,0), leads=rows.reduce((a,c)=>a+c.leads,0), impressions=rows.reduce((a,c)=>a+c.impressions,0), clicks=rows.reduce((a,c)=>a+c.clicks,0);
    const validCpls=rows.filter(c=>c.cpl>0).map(c=>c.cpl).sort((a,b)=>a-b); const baseline=validCpls.length ? validCpls[Math.floor(validCpls.length/2)] : 0;
    const campaigns=rows.map(c=>({...c,cpl:c.cpl|| (c.leads?c.spend/c.leads:0),status:statusFor(c,baseline)})).sort((a,b)=>b.spend-a.spend);
    const accountSummary=accounts.map(account=>{const mine=campaigns.filter(c=>c.accountId===account.id);const aSpend=mine.reduce((s,c)=>s+c.spend,0),aLeads=mine.reduce((s,c)=>s+c.leads,0); return {id:account.id,name:account.name,status:account.account_status===1?"Ativa":"Inativa",currency:account.currency||"BRL",spend:aSpend,leads:aLeads,cpl:aLeads?aSpend/aLeads:0,campaigns:mine.length,alerts:mine.filter(c=>c.status.tone!=="good").length}; });
    const alerts=campaigns.filter(c=>c.status.tone!=="good").slice(0,8).map(c=>({campaign:c.name,account:c.accountName,...c.status}));
    return json({connected:true,period:{since,until},accounts:accountSummary,campaigns,alerts,summary:{spend,leads,cpl:leads?spend/leads:0,ctr:impressions?clicks/impressions*100:0,cpm:impressions?spend/impressions*1000:0,roas:campaigns.length?campaigns.reduce((s,c)=>s+c.roas,0)/campaigns.filter(c=>c.roas>0).length||0:0,activeAccounts:accountSummary.filter(a=>a.status==="Ativa").length}});
  } catch(error) { return json({connected:false,error:error.message,accounts:[],campaigns:[]},500); }
}
export default async request => {
  try { const mode=new URL(request.url).searchParams.get("mode"); if(mode==="connect") return connect(request); if(mode==="callback") return callback(request); if(mode==="dashboard") return dashboard(request); if(mode==="disconnect") return new Response(null,{status:302,headers:{Location:"/","Set-Cookie":`${sessionName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}}); return json({error:"Rota inválida"},404); } catch(error) { return json({error:error.message},500); }
};
