export const TOPICS=['우리 반·친구','나와 가족','감정과 마음','생활 습관','봄','여름','가을','겨울','동물','식물','날씨와 환경','신체 놀이','말놀이','숫자 놀이','상상 이야기','인사·등원','정리','휴식','생일·행사','전통·명절'];
export const EXAMPLES=[
{id:'sample-bird',title:'작은 새의 노래',tags:['봄','동물'],emoji:'🐦',color:'#d1e9ff',cover:'./bird.png'},
{id:'sample-friend',title:'우리는 모두 친구',tags:['우리 반·친구','감정과 마음'],emoji:'🧡',color:'#ffdbb1'},
{id:'sample-rain',title:'빗방울이 톡톡톡',tags:['여름','날씨와 환경'],emoji:'☔',color:'#ddd5ff'},
{id:'sample-dino',title:'신나는 공룡 발자국',tags:['동물','신체 놀이'],emoji:'🦕',color:'#c8eedb'},
{id:'sample-hello',title:'안녕, 반가워!',tags:['우리 반·친구','인사·등원'],emoji:'👋',color:'#fff0ae'},
{id:'sample-rainbow',title:'무지개를 찾아서',tags:['날씨와 환경','상상 이야기'],emoji:'🌈',color:'#cbedfa'},
{id:'sample-drum',title:'통통통 몸을 움직여',tags:['신체 놀이','숫자 놀이'],emoji:'🥁',color:'#ffd4d5'},
{id:'sample-moon',title:'달님에게 인사해',tags:['휴식','상상 이야기'],emoji:'🌙',color:'#dbdfff'},
{id:'sample-flower',title:'꽃씨야, 일어나',tags:['봄','식물'],emoji:'🌻',color:'#ffedbd'},
{id:'sample-leaf',title:'낙엽이 춤을 춰요',tags:['가을','식물'],emoji:'🍁',color:'#ffdac6'},
{id:'sample-clean',title:'장난감도 집으로',tags:['정리','생활 습관'],emoji:'🧸',color:'#eadcfa'},
{id:'sample-birthday',title:'너의 생일을 축하해',tags:['생일·행사','우리 반·친구'],emoji:'🎂',color:'#fcdce7'}
].map(s=>({...s,sample:true,audio:null,archived:false}));
export function demoData(){return {user:{id:'demo-admin',name:'김새싹 선생님',email:'',role:'admin'},topics:[...TOPICS],songs:EXAMPLES.map(s=>({...s,tags:[...s.tags]})),classes:[{id:'sun',name:'햇살반',token:'demo-sun',draft:EXAMPLES.slice(0,6).map(s=>s.id),published:EXAMPLES.slice(0,6).map(s=>s.id)},{id:'flower',name:'꽃잎반',token:'demo-flower',draft:['sample-flower','sample-hello'],published:['sample-flower','sample-hello']},{id:'fruit',name:'열매반',token:'demo-fruit',draft:[],published:[]}],teachers:[{id:'demo-admin',name:'김새싹 선생님',email:'관리자 예시',role:'admin',active:true,classIds:['sun','flower','fruit']},{id:'demo-teacher',name:'이꽃잎 선생님',email:'교사 예시',role:'teacher',active:true,classIds:['flower']}],collections:[],invites:[]};}
