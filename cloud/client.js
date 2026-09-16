export const route='/'+(new URLSearchParams(location.search).get('page')||'listen');
export const pageLink=p=>'?page='+encodeURIComponent(p.replace(/^\//,''));
const endpoint='https://dvuucdqggynoiujkprve.supabase.co/functions/v1/music-api';
const prefix='saessak-music-dvuucdqggynoiujkprve:';
const stores={session:sessionStorage,pairing:sessionStorage,device:localStorage};
export async function cloudRequest(path,method='GET',body){
 const headers={};for(const [key,store] of Object.entries(stores)){const value=store.getItem(prefix+key);if(value)headers['x-music-'+key]=value}
 let payload;if(body instanceof FormData)payload=body;else{headers['Content-Type']='application/json';payload=JSON.stringify({path,method,body})}
 const res=await fetch(endpoint,{method:'POST',headers,body:payload,credentials:'omit'});
 let value;try{value=await res.json()}catch{throw new Error('서버 응답을 확인할 수 없습니다.')}
 if(!res.ok){const e=new Error(value.error||value.message||'서버에 연결하지 못했습니다.');e.status=res.status;throw e}
 for(const [key,v] of Object.entries(value._credentials||{})){if(!stores[key])continue;if(v)stores[key].setItem(prefix+key,v);else stores[key].removeItem(prefix+key)}
 delete value._credentials;return value;
}
