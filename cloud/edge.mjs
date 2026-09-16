import postgres from 'npm:postgres@3.4.7';
import {Buffer} from 'node:buffer';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {TOPICS} from '../public/shared.js';
import {schema} from './schema.mjs';

const HOME='https://edupoplab.github.io/music-library/';
const ORIGIN='https://edupoplab.github.io';
const PROJECT=Deno.env.get('SUPABASE_URL');
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db=postgres(Deno.env.get('SUPABASE_DB_URL'),{prepare:false,max:2,idle_timeout:20,connect_timeout:15});
let ready;
async function initialize(){if(!ready)ready=db.begin(async sql=>{await sql`SELECT pg_advisory_xact_lock(913174317)`;await sql.unsafe(schema).simple()}).catch(e=>{ready=null;throw e});await ready}
const token=()=>randomBytes(32).toString('base64url');
const id=()=>randomBytes(16).toString('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
function text(v,max=100){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'입력 내용을 확인해 주세요.');return v.trim()}
function email(v){const e=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail(400,'이메일을 확인해 주세요.');return e}
function password(v){if(typeof v!=='string'||v.length<12||v.length>128)fail(400,'비밀번호는 12~128자로 입력해 주세요.');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(v,salt,64).toString('hex')}
function matches(v,p){if(typeof v!=='string'||v.length>128)return false;const [salt,h]=p.split(':');return timingSafeEqual(scryptSync(v,salt,64),Buffer.from(h,'hex'))}
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-music-session,x-music-device,x-music-pairing','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function storage(file,method='GET',bytes,type){const r=await fetch(PROJECT+'/storage/v1/object/authenticated/music-media/'+encodeURIComponent(file),{method,headers:{Authorization:'Bearer '+SERVICE,apikey:SERVICE,...(type?{'Content-Type':type}:{})},body:bytes});if(!r.ok)throw Object.assign(new Error('음원 저장소에 연결하지 못했습니다.'),{status:r.status===404?404:502});return r}
async function upload(file,bytes,type){const r=await fetch(PROJECT+'/storage/v1/object/music-media/'+encodeURIComponent(file),{method:'POST',headers:{Authorization:'Bearer '+SERVICE,apikey:SERVICE,'Content-Type':type},body:bytes});if(!r.ok)fail(502,'음원을 저장하지 못했습니다.')}
async function removeFiles(files){await fetch(PROJECT+'/storage/v1/object/music-media',{method:'DELETE',headers:{Authorization:'Bearer '+SERVICE,apikey:SERVICE,'Content-Type':'application/json'},body:JSON.stringify({prefixes:files.filter(Boolean)})})}
async function signed(file){if(!file)return null;const r=await fetch(PROJECT+'/storage/v1/object/sign/music-media/'+encodeURIComponent(file),{method:'POST',headers:{Authorization:'Bearer '+SERVICE,apikey:SERVICE,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})});if(!r.ok)fail(502,'음원 주소를 준비하지 못했습니다.');const j=await r.json();return PROJECT+'/storage/v1'+j.signedURL}
function query(sql){return async(statement,...args)=>{let i=0;return await sql.unsafe(statement.replace(/\?/g,()=>'$'+(++i)),args)}}
async function rateLimit(key){const q=query(db),now=Date.now();const rows=await q('INSERT INTO music.attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN music.attempts.expires<? THEN 1 ELSE music.attempts.count+1 END,expires=CASE WHEN music.attempts.expires<? THEN EXCLUDED.expires ELSE music.attempts.expires END RETURNING count',key,now+900000,now,now);if(rows[0].count>10)fail(429,'시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.')}

export async function handler(req){
 if(req.method==='OPTIONS')return new Response(null,{headers});
 const changed={},uploaded=[];let committed=false;
 try{
  if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const requestOrigin=req.headers.get('Origin');if(requestOrigin&&requestOrigin!==ORIGIN)fail(403,'허용되지 않은 사이트입니다.');
  await initialize();
  const limit=30*1024*1024;let length=0,chunks=[];if(req.body)for await(const chunk of req.body){length+=chunk.length;if(length>limit)fail(413,'업로드 용량을 초과했습니다.');chunks.push(chunk)}
  const raw=Buffer.concat(chunks);let p,method,b={},form;
  if((req.headers.get('content-type')||'').startsWith('multipart/form-data')){form=await new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')},body:raw}).formData();p='/api/songs';method='POST'}
  else{if(length>100000)fail(413,'요청이 너무 큽니다.');const input=JSON.parse(raw.toString());p=text(input.path,300);method=input.method;b=input.body||{}}
  if(!['GET','POST','PATCH'].includes(method))fail(405,'지원하지 않는 요청입니다.');
  const keys={session:req.headers.get('x-music-session')||'',device:req.headers.get('x-music-device')||'',pairing:req.headers.get('x-music-pairing')||''};
  if(Object.values(keys).some(v=>v.length>200))fail(400,'인증 정보를 확인해 주세요.');
  if(['/api/login','/api/device/auth','/api/accept-invite','/api/reset-password','/api/setup'].includes(p))await rateLimit(hash((req.headers.get('x-forwarded-for')||'unknown').split(',')[0]+':'+p));
  const result=await db.begin(async sql=>{
   const q=query(sql),one=async(s,...a)=>(await q(s,...a))[0],run=q,now=Date.now();
   // Serialize mutations across edge instances; invite redemption and revision checks stay atomic.
   if(method!=='GET')await q('SELECT pg_advisory_xact_lock(913174317)');
   const session=async()=>keys.session?await one('SELECT u.id,u.email,u.name,u.role FROM music.sessions s JOIN music.users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',hash(keys.session),now):null;
   const requireUser=async()=>{const u=await session();if(!u)fail(401,'로그인이 필요합니다.');return u};
   const admin=async()=>{const u=await requireUser();if(u.role!=='admin')fail(403,'관리자만 이용할 수 있습니다.');return u};
   const canClass=async(u,cid)=>{if(!await one('SELECT id FROM music.classes WHERE id=?',cid))fail(404,'반을 찾을 수 없습니다.');if(u.role!=='admin'&&!await one('SELECT user_id FROM music.assignments WHERE user_id=? AND class_id=?',u.id,cid))fail(403,'담당 반만 관리할 수 있습니다.')};
   const getDevice=async()=>keys.device?await one('SELECT c.* FROM music.devices d JOIN music.classes c ON c.id=d.class_id WHERE d.token=? AND d.expires>?',hash(keys.device),now):null;
   const endSession=async()=>{if(keys.session)await run('DELETE FROM music.sessions WHERE token=?',hash(keys.session));changed.session=''};
   const clearPairing=async()=>{if(keys.pairing)await run('DELETE FROM music.pairings WHERE token=?',hash(keys.pairing));changed.pairing=''};
   const makeSession=async uid=>{const t=token();await run('INSERT INTO music.sessions VALUES(?,?,?)',hash(t),uid,now+43200000);changed.session=t};
   const pairing=async()=>{const u=keys.pairing?await one('SELECT u.id,u.name,u.role FROM music.pairings p JOIN music.users u ON u.id=p.user_id WHERE p.token=? AND p.expires>? AND u.active=1',hash(keys.pairing),now):null;if(!u)fail(401,'교사 인증 시간이 지났습니다. 다시 인증해 주세요.');return u};
   const tags=async input=>{if(!Array.isArray(input)||!input.length||input.length>8)fail(400,'주제를 1~8개 선택해 주세요.');const ts=[...new Set(input.map(t=>text(t,30)))];for(const t of ts)if(!await one('SELECT name FROM music.topics WHERE name=?',t))fail(400,'등록되지 않은 주제입니다.');return ts};
   const songIds=async ids=>{if(!Array.isArray(ids)||ids.length>500||ids.some(x=>typeof x!=='string'))fail(400,'곡 목록을 확인해 주세요.');const items=[...new Set(ids)];for(const x of items)if(!await one('SELECT id FROM music.songs WHERE id=? AND archived=0',x))fail(400,'보관된 곡이 있습니다. 새로고침해 주세요.');return items};
   const song=async s=>({id:s.id,title:s.title,tags:JSON.parse(s.tags),emoji:s.emoji,color:s.color,archived:!!s.archived,sample:false,audio:await signed(s.audio_file),cover:await signed(s.cover_file)});
   const listen=async c=>{const rows=await q('SELECT * FROM music.songs WHERE archived=0');return {classId:c.id,className:c.name,revision:c.revision,songs:await Promise.all(JSON.parse(c.published).map(id=>rows.find(s=>s.id===id)).filter(Boolean).map(song))}};
   if(p==='/api/status'&&method==='GET')return {user:await session(),setup:!await one('SELECT id FROM music.users LIMIT 1')&&!!await one('SELECT token FROM music.bootstrap WHERE expires>?',now)};
   if(p==='/api/setup'&&method==='POST'){
    if(await one('SELECT id FROM music.users LIMIT 1')||!await one('SELECT token FROM music.bootstrap WHERE token=? AND expires>?',hash(text(b.token,200)),now))fail(403,'관리자 전용 초기 설정 링크를 이용해 주세요.');
    const uid=id();await run('INSERT INTO music.users(id,email,name,password,role) VALUES(?,?,?,?,?)',uid,email(b.email),text(b.name,50),password(b.password),'admin');
    for(const name of ['햇살반','꽃잎반','열매반'])await run('INSERT INTO music.classes(id,name,token) VALUES(?,?,?)',id(),name,token());
    for(const name of TOPICS)await run('INSERT INTO music.topics(name) VALUES(?) ON CONFLICT DO NOTHING',name);
    await run('DELETE FROM music.bootstrap');await makeSession(uid);return {ok:true};
   }
   if(p==='/api/login'&&method==='POST'){const u=await one('SELECT * FROM music.users WHERE email=? AND active=1',email(b.email));if(!u||!matches(b.password,u.password))fail(401,'이메일 또는 비밀번호를 확인해 주세요.');await makeSession(u.id);return {ok:true}}
   if(p==='/api/logout'&&method==='POST'){await endSession();return {ok:true}}
   if(p==='/api/device/enter'&&method==='POST'){await endSession();await clearPairing();const c=await getDevice();return {configured:!!c,className:c?.name||null}}
   if(p==='/api/device/auth'&&method==='POST'){const u=await one('SELECT * FROM music.users WHERE email=? AND active=1',email(b.email));if(!u||!matches(b.password,u.password))fail(401,'이메일 또는 비밀번호를 확인해 주세요.');const classes=u.role==='admin'?await q('SELECT id,name FROM music.classes'):await q('SELECT c.id,c.name FROM music.classes c JOIN music.assignments a ON a.class_id=c.id WHERE a.user_id=?',u.id);await endSession();await clearPairing();const t=token();await run('INSERT INTO music.pairings VALUES(?,?,?)',hash(t),u.id,now+600000);changed.pairing=t;return {name:u.name,classes}}
   if(p==='/api/device/enroll'&&method==='POST'){const u=await pairing();await canClass(u,b.classId);if(keys.device)await run('DELETE FROM music.devices WHERE token=?',hash(keys.device));const t=token();await run('INSERT INTO music.devices VALUES(?,?,?,?)',hash(t),b.classId,u.id,now+400*86400000);changed.device=t;await clearPairing();await endSession();return {ok:true}}
   if(p==='/api/device/cancel'&&method==='POST'){await clearPairing();await endSession();return {configured:!!await getDevice()}}
   if(p==='/api/device/listen'&&method==='GET'){const c=await getDevice();if(!c)fail(401,'이 태블릿의 반을 설정해 주세요.');await run('UPDATE music.devices SET expires=? WHERE token=?',now+400*86400000,hash(keys.device));return await listen(c)}
   if(p.startsWith('/api/invite/')&&method==='GET'){const v=await one('SELECT email,name FROM music.invitations WHERE token=? AND used=0 AND expires>?',hash(p.split('/').pop()),now);if(!v)fail(410,'초대가 만료되었거나 이미 사용되었습니다.');return v}
   if(p==='/api/accept-invite'&&method==='POST'){const inv=await one('SELECT * FROM music.invitations WHERE token=? AND used=0 AND expires>? FOR UPDATE',hash(text(b.token,200)),now);if(!inv)fail(410,'초대가 만료되었거나 이미 사용되었습니다.');const uid=id();await run('INSERT INTO music.users(id,email,name,password,role) VALUES(?,?,?,?,?)',uid,inv.email,inv.name,password(b.password),'teacher');for(const cid of JSON.parse(inv.class_ids))await run('INSERT INTO music.assignments VALUES(?,?)',uid,cid);await run('UPDATE music.invitations SET used=1 WHERE id=?',inv.id);await makeSession(uid);return {ok:true}}
   if(p.startsWith('/api/reset/')&&method==='GET'){const r=await one('SELECT u.email,u.name FROM music.resets r JOIN music.users u ON u.id=r.user_id WHERE r.token=? AND r.expires>? AND r.used=0 AND u.active=1',hash(p.split('/').pop()),now);if(!r)fail(410,'재설정 링크가 만료되었습니다.');return r}
   if(p==='/api/reset-password'&&method==='POST'){const r=await one('SELECT r.* FROM music.resets r JOIN music.users u ON u.id=r.user_id WHERE r.token=? AND r.expires>? AND r.used=0 AND u.active=1',hash(text(b.token,200)),now);if(!r)fail(410,'재설정 링크가 만료되었습니다.');await run('UPDATE music.users SET password=? WHERE id=?',password(b.password),r.user_id);await run('DELETE FROM music.sessions WHERE user_id=?',r.user_id);await run('UPDATE music.resets SET used=1 WHERE user_id=?',r.user_id);changed.session='';return {ok:true}}
   const u=await requireUser();
   if(p==='/api/library'&&method==='GET'){
    const classes=(u.role==='admin'?await q('SELECT * FROM music.classes'):await q('SELECT c.* FROM music.classes c JOIN music.assignments a ON a.class_id=c.id WHERE a.user_id=?',u.id)).map(c=>({...c,draft:JSON.parse(c.draft),published:JSON.parse(c.published)}));
    const teachers=[];if(u.role==='admin')for(const t of await q('SELECT id,email,name,role,active FROM music.users'))teachers.push({...t,active:!!t.active,classIds:(await q('SELECT class_id FROM music.assignments WHERE user_id=?',t.id)).map(a=>a.class_id)});
    return {user:u,classes,teachers,topics:(await q('SELECT name FROM music.topics ORDER BY position')).map(t=>t.name),songs:await Promise.all((await q('SELECT * FROM music.songs WHERE archived=0 ORDER BY created_at DESC')).map(song)),collections:(await q('SELECT * FROM music.collections')).filter(c=>classes.some(x=>x.id===c.class_id)).map(c=>({id:c.id,classId:c.class_id,name:c.name,items:JSON.parse(c.items)})),invites:u.role==='admin'?(await q('SELECT id,email,name,expires,used,class_ids FROM music.invitations WHERE used=0 AND expires>?',now)).map(i=>({...i,classIds:JSON.parse(i.class_ids)})):[]};
   }
   if(p==='/api/topics'&&method==='POST'){const name=text(b.name,30);await run('INSERT INTO music.topics(name) VALUES(?) ON CONFLICT DO NOTHING',name);return {name}}
   if(p==='/api/songs'&&method==='POST'){
    if(!form)fail(400,'파일을 선택해 주세요.');const title=text(form.get('title'),70),ts=await tags(JSON.parse(form.get('tags'))),a=form.get('audio'),image=form.get('cover');
    if(!a||typeof a==='string'||!a.size||a.size>25*1024*1024)fail(400,'25MB 이하의 MP3를 선택해 주세요.');const bytes=Buffer.from(await a.arrayBuffer());if(!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))fail(400,'MP3 파일을 선택해 주세요.');
    const sid=id(),af=sid+'.mp3';let cf=null,ctype=null,cb=null;
    if(image&&typeof image!=='string'&&image.size){if(image.size>4*1024*1024)fail(400,'그림은 4MB 이하로 선택해 주세요.');cb=Buffer.from(await image.arrayBuffer());if(cb.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ctype='image/png';else if(cb[0]===255&&cb[1]===216&&cb[2]===255)ctype='image/jpeg';else if(cb.subarray(0,4).toString()==='RIFF'&&cb.subarray(8,12).toString()==='WEBP')ctype='image/webp';else fail(400,'PNG, JPG, WebP 그림을 선택해 주세요.');cf=sid+'.image'}
    await upload(af,bytes,'audio/mpeg');uploaded.push(af);if(cf){await upload(cf,cb,ctype);uploaded.push(cf)}
    await run('INSERT INTO music.songs(id,title,tags,audio_file,cover_file,cover_type,emoji,color,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',sid,title,JSON.stringify(ts),af,cf,ctype,'♫','#dce8ff',u.id,now);return {id:sid};
   }
   if(/^\/api\/songs\/[^/]+$/.test(p)&&method==='PATCH'){const sid=p.split('/').pop(),s=await one('SELECT * FROM music.songs WHERE id=? AND archived=0',sid);if(!s)fail(404,'곡이 없습니다.');if(u.role!=='admin'&&s.created_by!==u.id)fail(403,'등록한 교사 또는 관리자만 수정할 수 있습니다.');await run('UPDATE music.songs SET title=?,tags=? WHERE id=?',text(b.title,70),JSON.stringify(await tags(b.tags)),sid);return {ok:true}}
   if(/^\/api\/classes\/[^/]+\/(draft|publish)$/.test(p)&&method==='POST'){const cid=p.split('/')[3];await canClass(u,cid);const c=await one('SELECT * FROM music.classes WHERE id=? FOR UPDATE',cid);if(b.revision!==c.revision)fail(409,'다른 선생님이 수정했습니다. 새로고침해 주세요.');const items=JSON.stringify(await songIds(b.items));if(p.endsWith('/publish'))await run('UPDATE music.classes SET draft=?,published=?,revision=revision+1 WHERE id=?',items,items,cid);else await run('UPDATE music.classes SET draft=?,revision=revision+1 WHERE id=?',items,cid);return {ok:true}}
   if(p==='/api/collections'&&method==='POST'){await canClass(u,b.classId);await run('INSERT INTO music.collections VALUES(?,?,?,?)',id(),b.classId,text(b.name,50),JSON.stringify(await songIds(b.items)));return {ok:true}}
   await admin();
   if(p==='/api/classes'&&method==='POST'){await run('INSERT INTO music.classes(id,name,token) VALUES(?,?,?)',id(),text(b.name,30),token());return {ok:true}}
   if(/^\/api\/classes\/[^/]+$/.test(p)&&method==='PATCH'){const cid=p.split('/').pop();await canClass(u,cid);await run('UPDATE music.classes SET name=?,revision=revision+1 WHERE id=?',text(b.name,30),cid);return {ok:true}}
   if(p==='/api/invitations'&&method==='POST'){const em=email(b.email),name=text(b.name,50);if(await one('SELECT id FROM music.users WHERE email=?',em))fail(409,'이미 등록된 이메일입니다.');if(!Array.isArray(b.classIds)||!b.classIds.length)fail(400,'담당 반을 선택해 주세요.');for(const cid of b.classIds)await canClass(u,cid);const t=token();await run('UPDATE music.invitations SET used=1 WHERE email=?',em);await run('INSERT INTO music.invitations VALUES(?,?,?,?,?,?,0)',id(),em,name,hash(t),JSON.stringify([...new Set(b.classIds)]),now+7*86400000);return {url:HOME+'?page=invite#'+t,delivery:'copy-link'}}
   if(/^\/api\/teachers\/[^/]+\/reset$/.test(p)&&method==='POST'){const uid=p.split('/')[3];if(!await one('SELECT id FROM music.users WHERE id=? AND active=1',uid))fail(404,'교사를 찾을 수 없습니다.');const t=token();await run('UPDATE music.resets SET used=1 WHERE user_id=?',uid);await run('INSERT INTO music.resets VALUES(?,?,?,0)',hash(t),uid,now+3600000);return {url:HOME+'?page=reset#'+t}}
   if(/^\/api\/teachers\/[^/]+$/.test(p)&&method==='PATCH'){const uid=p.split('/').pop(),t=await one('SELECT * FROM music.users WHERE id=?',uid);if(!t)fail(404,'교사를 찾을 수 없습니다.');if(t.role==='admin')fail(400,'관리자 계정은 변경할 수 없습니다.');if(!Array.isArray(b.classIds))fail(400,'담당 반을 선택해 주세요.');for(const cid of b.classIds)await canClass(u,cid);await run('UPDATE music.users SET active=? WHERE id=?',b.active?1:0,uid);await run('DELETE FROM music.assignments WHERE user_id=?',uid);for(const cid of new Set(b.classIds))await run('INSERT INTO music.assignments VALUES(?,?)',uid,cid);if(!b.active){await run('DELETE FROM music.sessions WHERE user_id=?',uid);await run('DELETE FROM music.pairings WHERE user_id=?',uid)}return {ok:true}}
   fail(404,'요청을 찾을 수 없습니다.');
  });
  committed=true;return Response.json({...result,_credentials:changed},{headers});
 }catch(e){if(uploaded.length&&!committed)await removeFiles(uploaded).catch(()=>{});const status=e.status||(e.code==='23505'?409:500);if(status===500)console.error('music request failed',e.code||e.name);return Response.json({error:e.status?e.message:status===409?'이미 등록된 항목입니다.':'서버 연결을 확인해 주세요.'},{status,headers})}
}
