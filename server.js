require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('WARNING: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.');
}

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();
function clean(v, max=120){ return String(v ?? '').trim().slice(0,max); }
function auth(req,res,next){
  const sid = req.cookies.admin_session;
  if(!sid || !sessions.has(sid)) return res.status(401).json({error:'Unauthorized'});
  next();
}

async function db(pathname, options={}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Database is not configured.');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = data?.message || data?.hint || data?.details || data?.error || text || 'Database request failed';
    throw new Error(msg);
  }
  return data;
}

app.get('/api/health',(req,res)=>res.json({ok:true, databaseConfigured:Boolean(SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY)}));

app.post('/api/register', async (req,res)=>{
  try {
    const full_name = clean(req.body.full_name,120);
    const zone = clean(req.body.zone,80);
    const category = clean(req.body.category,50);
    const contact_number = clean(req.body.contact_number,40);
    if(!full_name) return res.status(400).json({error:'Full name is required.'});
    const rows = await db('registrations', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify({full_name,zone,category,contact_number})});
    res.json({ok:true,id:rows?.[0]?.id});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/login',(req,res)=>{
  const username = clean(req.body.username,80);
  const password = String(req.body.password ?? '');
  if(username !== (process.env.ADMIN_USERNAME || 'admin') || password !== (process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!'))
    return res.status(401).json({error:'Invalid username or password.'});
  const sid = crypto.randomBytes(32).toString('hex');
  sessions.set(sid,{created:Date.now()});
  res.cookie('admin_session',sid,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000});
  res.json({ok:true});
});
app.post('/api/logout',(req,res)=>{ const sid=req.cookies.admin_session; if(sid) sessions.delete(sid); res.clearCookie('admin_session'); res.json({ok:true}); });
app.get('/api/me',auth,(req,res)=>res.json({ok:true}));

app.get('/api/registrations',auth,async (req,res)=>{
  try {
    const q=clean(req.query.q,120), zone=clean(req.query.zone,80), category=clean(req.query.category,50);
    const params=[];
    if(q) params.push(`or=(full_name.ilike.*${encodeURIComponent(q)}*,contact_number.ilike.*${encodeURIComponent(q)}*)`);
    if(zone) params.push(`zone=eq.${encodeURIComponent(zone)}`);
    if(category) params.push(`category=eq.${encodeURIComponent(category)}`);
    const query=params.length?`?${params.join('&')}&order=id.desc`:'?order=id.desc';
    const rows=await db(`registrations${query}`,{headers:{Prefer:'count=exact'}});
    const all=await db('registrations?select=id',{headers:{Prefer:'count=exact'}});
    res.json({rows,total:Array.isArray(all)?all.length:0});
  } catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/registrations/:id',auth,async(req,res)=>{
  try{
    const id=Number(req.params.id), full_name=clean(req.body.full_name,120);
    if(!full_name) return res.status(400).json({error:'Full name is required.'});
    const rows=await db(`registrations?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({full_name,zone:clean(req.body.zone,80),category:clean(req.body.category,50),contact_number:clean(req.body.contact_number,40)})});
    if(!rows?.length) return res.status(404).json({error:'Record not found.'});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/registrations/:id',auth,async(req,res)=>{
  try{await db(`registrations?id=eq.${Number(req.params.id)}`,{method:'DELETE'});res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/export.csv',auth,async(req,res)=>{
  try{
    const rows=await db('registrations?order=id.asc');
    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const csv=[['ID','Full Name','Zone','Category','Contact Number','Date Registered'],...rows.map(r=>[r.id,r.full_name,r.zone,r.category,r.contact_number,r.created_at])].map(r=>r.map(esc).join(',')).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="chorale-registrations.csv"');res.send('\ufeff'+csv);
  }catch(e){res.status(500).send(e.message);}
});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Portal running on port ${PORT}`));
