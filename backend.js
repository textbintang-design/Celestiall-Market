/* Klien backend Netlify (/api/*). Dimuat setelah script utama di index.html. */
(function(){
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches,EASE='cubic-bezier(.16,1,.3,1)',SPR='cubic-bezier(.34,1.56,.64,1)';
let online=false,loaded=false,T=[],ba,fLoaded=false,pend=0,snap={};const timers={};
const tok=()=>{try{return sessionStorage.getItem('cm_token')||''}catch(_){return ''}};
const setAdmin=(on,t)=>{try{if(on){sessionStorage.setItem('cm_admin','1');if(t)sessionStorage.setItem('cm_token',t)}else{sessionStorage.removeItem('cm_admin');sessionStorage.removeItem('cm_token')}}catch(_){}document.body.classList.toggle('admin',on)};

async function api(path,opt){opt=opt||{};const h={};
 if(opt.body!==undefined)h['content-type']='application/json';
 if(tok())h.authorization='Bearer '+tok();
 const r=await fetch('/api'+path,{method:opt.method||(opt.body!==undefined?'POST':'GET'),headers:h,body:opt.body!==undefined?JSON.stringify(opt.body):undefined});
 let d=null;try{d=await r.json()}catch(_){}
 if(r.status===401&&tok()){setAdmin(false);render();toast('Sesi admin habis, login ulang')}
 if(!r.ok)throw Object.assign(new Error((d&&d.error)||('HTTP '+r.status)),{status:r.status});
 return d}

/* hero + banner motion */
$('#heroFigs').innerHTML=CH.map(c=>`<span>${fig(c.o)}</span>`).join('');
window.slideMotion=(n,dir)=>{if(rm)return;const s=$('#trk').children[n];if(!s)return;
 s.querySelectorAll('.qt>*').forEach((el,i)=>el.animate([{opacity:0,transform:`translateX(${dir*40}px)`,filter:'blur(6px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:800,delay:200+i*90,easing:EASE,fill:'backwards'}));
 const c=s.querySelector('.slc');c&&c.animate([{opacity:0,transform:`translateX(${dir*80}px) scale(.6) rotate(${dir*8}deg)`},{opacity:1,transform:'none'}],{duration:900,delay:250,easing:SPR,fill:'backwards'});
 ba&&ba.cancel();ba=$('#bbar').animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:6000,easing:'linear'});
 clearInterval(st);st=setInterval(()=>goSlide(si+1),6000)};
slideMotion(0,1);

/* testimoni */
const stars=n=>'★'.repeat(n)+'☆'.repeat(5-n);
const tItem=(t,adm)=>`<div class="tsi"><b>${esc(t.name)}</b> <span class="s">${stars(t.rating)}</span>${adm&&t.id?`${t.approved?'':' <span class="bdg2 w">Menunggu</span> <button class="mini" data-act="tok" data-v="${esc(t.id)}">Setujui</button>'}<button class="mini" data-act="tdel" data-v="${esc(t.id)}">Hapus</button>`:''}<p>${esc(t.message)}</p></div>`;
const drawT=()=>$('#sideT').innerHTML=T.filter(t=>t.approved!==false).slice(0,3).map(t=>tItem(t,false)).join('')||'<div class="tsi"><p>Belum ada testimoni. Jadilah yang pertama!</p></div>';
async function loadT(){try{T=await api('/testimonials'+(isAdmin()?'?all=1':''))}catch(_){}drawT()}
function tSheet(){const adm=isAdmin();sheet('Testimoni',`<div class="tl">${T.map(t=>tItem(t,adm)).join('')||'<div class="note">Belum ada testimoni.</div>'}</div><div class="f" style="margin-top:12px"><div><label>Nama</label><input id="tN" maxlength="24" value="${esc(ld('cm_name',''))}"></div><div><label>Rating</label><select id="tR"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></div><div class="full"><label>Pesan</label><textarea id="tM" rows="3" maxlength="240"></textarea></div><div class="full"><button class="btn y" data-act="tsend">Kirim testimoni</button></div></div><div class="note">Tampil setelah disetujui admin. Dilarang tautan &amp; nomor telepon.</div>`)}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-act],[data-bn]');if(!b)return;const a=b.dataset.act;
 if(b.dataset.bn){window.slideDir=b.dataset.bn==='n'?1:-1;goSlide(si+window.slideDir);return}
 if(a==='tsw'){openSide(false);tSheet()}
 if(a==='gokat'){if(!$('#p-katalog').classList.contains('on'))tab('katalog');setTimeout(()=>$('#tabs').scrollIntoView({behavior:'smooth'}),60)}
 if(a==='lock'){try{sessionStorage.removeItem('cm_token')}catch(_){}if(online)loadT()}
 if((a==='tok'||a==='tdel')&&isAdmin()){
  try{if(a==='tok')await api('/testimonials/'+b.dataset.v+'/approve',{body:{}});else await api('/testimonials/'+b.dataset.v,{method:'DELETE'});
   await loadT();tSheet();toast(a==='tok'?'Testimoni disetujui':'Testimoni dihapus')}catch(err){toast(err.message||'Gagal')}}
 if(a==='tsend'){const name=$('#tN').value.trim(),message=$('#tM').value.trim(),rating=+$('#tR').value;
  if(name.length<2||message.length<3)return toast('Isi nama & pesan dulu');
  if(/https?:\/\/|www\.|\d[\d\s.-]{8,}\d/i.test(message+' '+name))return toast('Tautan / nomor tidak diizinkan');
  if(Date.now()-ld('cm_tlast',0)<60000)return toast('Tunggu sebentar sebelum kirim lagi');
  if(!online)return toast('Server belum aktif');
  try{await api('/testimonials',{body:{name,rating,message}})}catch(err){return toast(err.message||'Gagal kirim')}
  sv('cm_tlast',Date.now());sv('cm_name',name);closeOv();toast('Terkirim! Menunggu persetujuan admin')}});

/* login admin: password dicek di server (Netlify Function) */
askPin=function(cb){if(isAdmin()){cb();return}
 sheet('Login Admin',`<form id="lgF" style="max-width:340px;margin:0 auto"><label>Password admin</label><input id="lgP" type="password" autocomplete="current-password" required><div class="err" id="lgX"></div><button class="btn y" type="submit">Masuk</button></form>`);
 askPin.cb=cb;setTimeout(()=>$('#lgP')&&$('#lgP').focus(),400)};
document.addEventListener('submit',async e=>{if(e.target.id!=='lgF')return;e.preventDefault();
 const x=$('#lgX');x.textContent='';
 try{const d=await api('/login',{body:{password:$('#lgP').value}});
  setAdmin(true,d.token);closeOv();toast('Admin aktif');render();loadT();
  await maybeMigrate();const c=askPin.cb;askPin.cb=null;if(c)setTimeout(c,450)}
 catch(err){x.textContent=err.status===401?'Password salah':err.status===429?'Terlalu banyak percobaan, tunggu beberapa menit':err.status===500?(err.message||'Server error'):'Server tidak terjangkau'}});

/* akun & pengaturan -> server (dipanggil dari sv()) */
async function pushAcc(v){try{const d=await api('/accounts',{method:'PUT',body:{accounts:v}});
 const m=new Map(d.accounts.map(a=>[a.id,a]));users.forEach(u=>{const s=m.get(u.id);if(s)u.imgs=s.imgs});
 try{localStorage.removeItem(KEY)}catch(_){}return true}
 catch(e){toast('Gagal simpan ke server: '+(e.message||'coba lagi'));return false}}
async function maybeMigrate(){if(!online||!isAdmin()||users.length)return;let loc=[];
 try{loc=JSON.parse(localStorage.getItem(KEY))||[]}catch(_){}
 if(!Array.isArray(loc)||!loc.length)return;
 users=loc.filter(a=>a&&a.user!==false);
 if(await pushAcc(users)){chips();render();toast('Akun lama di browser ini dipindah ke server')}}

window.cloudSave=(k,v)=>{if(!online)return;
 if(k==='cm_forum'){if(!fLoaded)return;pend++;clearTimeout(timers[k]);timers[k]=setTimeout(pushForum,400);return}
 if(!loaded||!isAdmin())return;if(k!==KEY&&k!=='cm_cfg')return;clearTimeout(timers[k]);
 timers[k]=setTimeout(()=>k===KEY?pushAcc(v):api('/config',{method:'PUT',body:v}).catch(()=>toast('Gagal simpan nomor')),500)};

/* ===== forum komunitas <-> server (diff antara state lokal & snapshot server) ===== */
const fkey=()=>{let k=ld('cm_key','');if(!k){k=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2))+'';sv('cm_key',k)}return k};
const mkSnap=()=>{snap={};forum.forEach(p=>{snap[p.id]={likes:p.likes||0,rp:p.rp||0,hid:!!p.hid,name:p.name,reps:Object.fromEntries((p.reps||[]).map(r=>[r.id,{likes:r.likes||0,rp:r.rp||0,name:r.name}]))}})};
async function loadForum(){try{const d=await api('/forum');forum=d.posts.map(p=>({...p,reps:p.reps||[]}));mkSnap();fLoaded=true;return true}catch(e){console.warn('forum',e);return false}}
async function pushForum(){
 if(!online||!fLoaded)return;const key=fkey(),adm=isAdmin(),uid=(ld('cm_me',{})||{}).uid,ops=[];let rename='';
 const P=(path,body)=>()=>api(path,{body}).then(()=>null,e=>e);
 const have=new Set(forum.map(p=>String(p.id)));
 for(const id in snap)if(!have.has(id))ops.push(P('/forum/delete',{kind:'post',id,key}));
 for(const p of forum){const s=snap[p.id];
  if(!s){ops.push(P('/forum/posts',{id:p.id,uid:p.uid||'anon',key,name:p.name,text:p.text}));
   for(const r of p.reps||[])ops.push(P('/forum/comments',{id:r.id,post_id:p.id,uid:r.uid||'anon',key,name:r.name,text:r.text}));continue}
  const d=(p.likes||0)-s.likes;if(d)ops.push(P('/forum/like',{kind:'post',id:String(p.id),delta:Math.sign(d)}));
  if(adm&&(!!p.hid!==s.hid||(p.rp||0)<s.rp))ops.push(P('/forum/mod',{id:p.id,hid:!!p.hid,rp:p.rp||0}));
  else if((p.rp||0)>s.rp)ops.push(P('/forum/report',{kind:'post',id:String(p.id)}));
  if(p.uid&&p.uid===uid&&p.name!==s.name)rename=p.name;
  const cur=new Set();
  for(const r of p.reps||[]){cur.add(r.id);const sr=s.reps[r.id];
   if(!sr){ops.push(P('/forum/comments',{id:r.id,post_id:p.id,uid:r.uid||'anon',key,name:r.name,text:r.text}));continue}
   const cd=(r.likes||0)-sr.likes;if(cd)ops.push(P('/forum/like',{kind:'comment',id:r.id,delta:Math.sign(cd)}));
   if((r.rp||0)>sr.rp)ops.push(P('/forum/report',{kind:'comment',id:r.id}));
   if(r.uid&&r.uid===uid&&r.name!==sr.name)rename=r.name}
  for(const id in s.reps)if(!cur.has(id))ops.push(P('/forum/delete',{kind:'comment',id,key}))}
 if(rename)ops.push(P('/forum/rename',{key,name:rename}));
 mkSnap();pend=0;
 let fail=null;for(const op of ops){const r=await op();if(r&&!fail)fail=r}   // berurutan agar tidak saling bentrok
 if(fail){toast(fail.message&&fail.status<500?fail.message:'Sebagian perubahan forum gagal disimpan');await refreshForum(true)}}
async function refreshForum(force){
 if(!online||(!fLoaded&&!force)||(pend&&!force))return;
 if(!await loadForum())return;
 if($('#p-forum').classList.contains('on'))renderForum()}
const _tab=tab;tab=function(v){_tab.apply(this,arguments);if(v==='forum')refreshForum()};
setInterval(()=>{const a=document.activeElement,t=$('#cmText');
 if(document.hidden||!$('#p-forum').classList.contains('on'))return;
 if(a&&a.closest&&a.closest('#fgList'))return;if(t&&t.value)return;refreshForum()},45000);

async function cloudInit(){
 let acc;
 try{acc=await api('/accounts');if(!Array.isArray(acc))throw new Error('bukan API')}
 catch(e){console.warn(e);toast('Server belum aktif, memakai data browser ini');loadT();return}
 online=true;window.CM_ONLINE=true;
 if(tok()){try{const m=await api('/me');if(!m.admin)setAdmin(false)}catch(_){setAdmin(false)}}else setAdmin(false);
 users=acc;loaded=true;
 try{const c=await api('/config');if(c&&c.waNumber){Object.assign(CONFIG,c);$('#fWa').href='https://wa.me/'+CONFIG.waNumber}}catch(_){}
 await maybeMigrate();
 chips();render();loadT();
 if(await loadForum()){if($('#p-forum').classList.contains('on'))renderForum()}}
cloudInit();
})();
