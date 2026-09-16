import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('persistent music library, role boundaries, invites, publication, media access and ranges',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'saessak-music-test-'));const port=14317,base=`http://127.0.0.1:${port}`;let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,DATA_DIR:dir,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)))})}
 async function stop(){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
 async function call(p,{method='GET',body,cookie,origin=base}={}){const headers={Origin:origin};if(cookie)headers.Cookie=cookie;let payload=body;if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';payload=JSON.stringify(body)}const r=await fetch(base+p,{method,body:payload,headers});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 try{await start();assert.equal((await call('/api/library')).status,401);assert.equal((await call('/api/setup',{method:'POST',body:{},origin:'https://evil.example'})).status,403);
 const setup=await call('/api/setup',{method:'POST',body:{name:'Test Admin',email:'admin@example.test',password:'test-only-password-123'}});assert.equal(setup.status,201);const admin=setup.cookie;assert.ok(setup.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await call('/api/setup',{method:'POST',body:{}})).status,403);
 let lib=(await call('/api/library',{cookie:admin})).data;assert.equal(lib.classes.length,3);assert.equal(lib.songs.length,0);const first=lib.classes[0],second=lib.classes[1];
 const inv=await call('/api/invitations',{method:'POST',cookie:admin,body:{name:'Teacher',email:'teacher@example.test',classIds:[first.id]}});assert.equal(inv.status,201);const token=inv.data.url.split('#')[1];assert.equal((await call('/api/invite/'+token)).status,200);
 const joined=await call('/api/accept-invite',{method:'POST',body:{token,password:'teacher-test-password-123'}});assert.equal(joined.status,201);const teacher=joined.cookie;assert.equal((await call('/api/accept-invite',{method:'POST',body:{token,password:'teacher-test-password-123'}})).status,410);
 const tlib=(await call('/api/library',{cookie:teacher})).data;assert.equal(tlib.classes.length,1);assert.equal(tlib.teachers.length,0);assert.equal((await call('/api/invitations',{method:'POST',cookie:teacher,body:{}})).status,403);
 assert.equal((await call(`/api/classes/${second.id}/publish`,{method:'POST',cookie:teacher,body:{items:[],revision:0}})).status,403);
 const form=new FormData();form.set('title','Test song');form.set('tags',JSON.stringify(['봄','식물']));const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(100,1)]);form.set('audio',new Blob([mp3],{type:'audio/mpeg'}),'test.mp3');const added=await call('/api/songs',{method:'POST',cookie:teacher,body:form});assert.equal(added.status,201);const songId=added.data.id;
 assert.equal((await call(`/api/media/${songId}/audio`)).status,403);
 let r=await call(`/api/classes/${first.id}/draft`,{method:'POST',cookie:teacher,body:{items:[songId],revision:0}});assert.equal(r.status,200);
 assert.equal((await call(`/api/listen/${first.token}`)).data.songs.length,0);
 assert.equal((await call(`/api/classes/${first.id}/publish`,{method:'POST',cookie:teacher,body:{items:[songId],revision:0}})).status,409);
 assert.equal((await call(`/api/classes/${first.id}/publish`,{method:'POST',cookie:teacher,body:{items:[songId],revision:1}})).status,200);
 const listened=(await call(`/api/listen/${first.token}`)).data;assert.equal(listened.songs.length,1);assert.deepEqual(listened.songs[0].tags,['봄','식물']);
 const media=await fetch(base+listened.songs[0].audio,{headers:{Range:'bytes=0-9'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,10);assert.equal(media.headers.get('content-range'),'bytes 0-9/103');
 assert.equal((await call(`/api/media/${songId}/audio?class=${second.token}`)).status,403);
 await stop();await start();assert.equal((await call(`/api/listen/${first.token}`)).data.songs.length,1);
 assert.equal((await call(`/api/classes/${first.id}/publish`,{method:'POST',cookie:teacher,body:{items:[],revision:2}})).status,200);assert.equal((await call(`/api/media/${songId}/audio?class=${first.token}`)).status,403);
 lib=(await call('/api/library',{cookie:admin})).data;const teacherId=lib.teachers.find(t=>t.role==='teacher').id;
 const reset=await call('/api/teachers/'+teacherId+'/reset',{method:'POST',cookie:admin,body:{}});assert.equal(reset.status,201);const resetToken=reset.data.url.split('#')[1];assert.equal((await call('/api/reset/'+resetToken)).status,200);assert.equal((await call('/api/reset-password',{method:'POST',body:{token:resetToken,password:'changed-test-password-123'}})).status,200);assert.equal((await call('/api/library',{cookie:teacher})).status,401);assert.equal((await call('/api/reset-password',{method:'POST',body:{token:resetToken,password:'changed-test-password-123'}})).status,410);
 assert.equal((await call(`/api/teachers/${teacherId}`,{method:'PATCH',cookie:admin,body:{classIds:[first.id],active:false}})).status,200);assert.equal((await call('/api/library',{cookie:teacher})).status,401);
 assert.equal((await call('/api/login',{method:'POST',body:{email:'teacher@example.test',password:'teacher-test-password-123'}})).status,401);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
