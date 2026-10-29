import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, setDoc as fsSetDoc, updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc, onSnapshot, collection, writeBatch as fsWriteBatch, query, where, runTransaction as fsRunTransaction, arrayUnion, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, GIRIS_ALANI } from "./config.js?v=67";

/* ================= Sabitler ================= */
const AY=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const AYK=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const GUN=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
const GUNU=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
const GRUP={M:'Müdür',K:'Mutfak',S:'Kurye'}; const GRUP_SIRA=['M','K','S'];
const KOD={HT:{ad:'Haftalık izin',kisa:'İZİN'},R:{ad:'Rapor',kisa:'RAPOR'},UI:{ad:'Ücretsiz izin',kisa:'ÜCR.<br>İZİN'},YI:{ad:'Yıllık izin',kisa:'YILLIK'},B:{ad:'Bayram',kisa:'BAYR.'},D:{ad:'Diğer',kisa:'DİĞER'},CG:{ad:'Part boş',kisa:'PART<br>BOŞ'}};
// CG: sadece part-time personelde seçilir; ücrete, SGK gününe ve fazla mesaiye etkisi yok, sadece günün boş sayılmasını önler. Lejantta gösterilmez.
const KOD_SIRA=['HT','R','UI','YI','B'];// 'D' (Diğer) kaldırıldı: eski kayıtlarda görünür, yeni seçilemez
// Excel'deki koşullu biçim renkleri: [zemin, yazı]
const KOD_RENK={HT:['#1c1c1c','#ffffff'],R:['#c6e3ab','#24401a'],UI:['#1f3864','#ffffff'],YI:['#4f6a2a','#ffffff'],B:['#e9edf3','#33415a'],D:['#9aa3af','#ffffff'],CG:['#e01e1e','#ffffff']};
const BOS_RENK='#fde2e2';
const kodStil=k=>{const r=KOD_RENK[k];return r?`style="background:${r[0]};border-color:${r[0]};color:${r[1]}"`:'';};
const SEKILLER=['Tam','Part','Esnaf kurye'];
// Görev listesi: seçmeli, elle yazılmaz. Görev çizelgedeki bölümü ve esnaf durumunu belirler.
const GOREVLER=[{ad:'R. Müdür',grup:'M'},{ad:'V. Müdür',grup:'M'},{ad:'Mutfak',grup:'K'},{ad:'Kurye',grup:'S'},{ad:'Esnaf Kurye',grup:'S',sekil:'Esnaf kurye'}];
const SGK_YOK='-';
// Sistemin başladığı ay: bundan önceki aylar gösterilmez
const BASLANGIC_AY='2026-08';
// Varsayılan ay: başlangıçtan itibaren henüz bitmemiş ilk ay (ay sonu: kapatılmamış; puantaj: onaylanmamış)
function acikAy(tur){const bu=ayKey(today());let k=BASLANGIC_AY;while(k<bu){const d=(S.aylar[k]||{}).durum;const bitti=tur==='puantaj'?onayli(d):(d==='sube_onay'||onayli(d));if(!bitti)return k;k=ayKaydir(k,1);}return k<BASLANGIC_AY?BASLANGIC_AY:k;}
function aktifAy(tur){if(S.ayElle&&S.ay)return S.ay<BASLANGIC_AY?BASLANGIC_AY:S.ay;return acikAy(tur);}
function ayGit(ak,n){const y=ayKaydir(ak,n);if(y<BASLANGIC_AY){toast('Sistem Ağustos 2026 ile başladı, önceki aylar yok.');return;}S.ay=y;S.ayElle=true;render();}
// Puantaj veri girişi türleri. b: birim, y: hangi tarafa etki eder (sol=muhasebe, sag=ödeme)
const VERI_TUR=[{k:'R',ad:'Rapor',b:'gün',y:'sol'},{k:'UI',ad:'Ücretsiz izin',b:'gün',y:'sol'},{k:'YI',ad:'Yıllık izin',b:'gün',y:'sol'},{k:'B',ad:'Bayram',b:'gün',y:'sol'},{k:'PG',ad:'Part gün',b:'gün',y:'sol'},{k:'FM',ad:'Fazla mesai (saat)',b:'saat',y:'sol',gizli:true},
  {k:'BY',ad:'Bankaya yatan',b:'₺',y:'sag'},{k:'MF',ad:'Maaş farkı (+ / −)',b:'₺',y:'sag'},{k:'SA',ad:'Çalışılan saat',b:'saat',y:'sag'},{k:'FMT',ad:'Fazla mesai tutarı',b:'₺',y:'sag'},{k:'AV',ad:'Avans',b:'₺',y:'sag'},{k:'AO',ad:'Ara ödeme',b:'₺',y:'sag'},{k:'PS',ad:'Paket sayısı',b:'adet',y:'sag',gizli:true},{k:'PP',ad:'Paket primi',b:'₺',y:'sag'},{k:'CP',ad:'Ciro primi',b:'₺',y:'sag'},{k:'EK',ad:'Ek ödeme',b:'₺',y:'sag',gizli:true},{k:'KS',ad:'Kesinti',b:'₺',y:'sag',gizli:true}];
const veriTur=k=>VERI_TUR.find(t=>t.k===k);
// Veri girişi satırının kaydı: kayıt numarası boş ya da silinmiş/değişmiş kayda aitse isimle bulunur (yoksa tutar hiçbir satıra ulaşmaz).
function veriPid(v){let pid=v.pid;if(!pid||!S.personel.some(p=>p.id===pid)){const k=isimAnahtar(v.ad||'');const p=k?S.personel.find(p=>isimAnahtar(p.ad)===k):null;if(p)pid=p.id;else if(!pid)return null;}return pid;}
function veriOzet(veri,ak=S.ay){const o={};(veri||[]).forEach(v=>{const t=veriTur(v.tur);if(!t||v.miktar===''||v.miktar==null)return;if(v.gonder)return;/* maaş şubesine gönderilen "Bankaya yatan": bu şubenin hesabına girmez */if(v.tarih&&ak&&v.tarih.slice(0,7)!==ak)return;
  const pid=veriPid(v);if(!pid)return;const x=o[pid]=o[pid]||{};x[v.tur]=(x[v.tur]||0)+sayi(v.miktar);});return o;}
// Veri girişindeki gün türleri (rapor, ücretsiz izin, yıllık izin, bayram, part gün) şubeler arası ay özetine (ozetler → veriGun) yazılır:
// kişinin muhasebe (SGK) şubesi de maaş şubesi de, hangi şubede girilirse girilsin bu günleri sayar. {kayıt: {ad, g: {tarih: {tür: miktar}}}}
// Onaylı ayda onaydan sonra eklenen gün satırları (kırmızı, hesaba katılmaz) alınmaz.
const GUN_TURLERI=['R','UI','YI','B','PG'];
function veriGunHesap(veri,ak,D){const o={};const kil=D&&D.kilitli===true&&D.onayTarihi?String(D.onayTarihi):null;
  (veri||[]).forEach((v,i)=>{if(!v||!GUN_TURLERI.includes(v.tur)||v.miktar===''||v.miktar==null||!sayi(v.miktar))return;if(v.tarih&&v.tarih.slice(0,7)!==ak)return;
    if(kil&&v.zaman&&String(v.zaman)>kil)return;const pid=veriPid(v);if(!pid)return;const p=S.personel.find(x=>x.id===pid);
    const x=o[pid]=o[pid]||{ad:(p&&p.ad)||v.ad||'',g:{}};const t=v.tarih||('-'+(v.id||i));const z=x.g[t]=x.g[t]||{};z[v.tur]=Math.round(((z[v.tur]||0)+sayi(v.miktar))*100)/100;});return o;}
// Diğer şubelerin veri girişinden gelen gün türleri {kayıt: {tür: miktar}}. Aynı kişi, aynı gün, aynı tür birden fazla şubede yazılmışsa bir kez sayılır.
function kisiAnahtar(pid,ad){const p=S.personel.find(x=>x.id===pid);return p&&p.tc?'tc:'+p.tc:'ad:'+isimAnahtar((p&&p.ad)||ad||'');}
function veriDis(ak,sid,D){const V=S.pt.ozetVeri||{};const K={};
  const ekle=(src,dis)=>Object.entries(src||{}).forEach(([pid,x])=>{const k=kisiAnahtar(pid,x&&x.ad);const e=K[k]=K[k]||{pid,t:{}};
    Object.entries((x&&x.g)||{}).forEach(([tr,tt])=>Object.entries(tt||{}).forEach(([tur,m])=>{if(!GUN_TURLERI.includes(tur))return;const z=e.t[tur]=e.t[tur]||{};const q=z[tr]=z[tr]||{b:0,d:0};if(dis)q.d=Math.max(q.d,sayi(m));else q.b+=sayi(m);}));});
  ekle(veriGunHesap(D&&D.veri,ak,null),false);Object.entries(V).forEach(([s,x])=>{if(s!==sid)ekle(x,true);});
  const out={};Object.values(K).forEach(e=>Object.entries(e.t).forEach(([tur,z])=>{let n=0;Object.values(z).forEach(q=>{n+=Math.max(0,q.d-q.b);});if(n>0.0001)(out[e.pid]=out[e.pid]||{})[tur]=Math.round(n*100)/100;}));return out;}
// Aynı kişi birden fazla kayıtla (ör. iki şubede ayrı kayıt) olabilir; ödeme satırı tek kayıtta birleşir (aynı kişi: TC, TC yoksa ad soyad).
// Veri girişi satırları kayıt numarasıyla bağlıdır: satırın kaydı birleşen diğer kayıtsa, giriş aynı kişinin satırına eklenir (yoksa tutarlar boş kalırdı).
function ozBirlestir(oz,sol){const satirlar=Object.keys(sol||{}).map(pid=>({pid,p:S.personel.find(x=>x.id===pid)||{id:pid,ad:(sol[pid]&&sol[pid].ad)||''}}));
  const o={};Object.entries(oz||{}).forEach(([pid,e])=>{let hedef=pid;if(!(sol&&sol[pid])){const p=S.personel.find(x=>x.id===pid);const r=p?satirlar.find(s=>ayniKisi(s.p,p)):null;if(r)hedef=r.pid;}
    const x=o[hedef]=o[hedef]||{};Object.entries(e).forEach(([t,v])=>{x[t]=(x[t]||0)+v;});});return o;}
// Elle girilen gün/saat verilerini muhasebe tarafına ekle. Gün sayısı çizelgedeki kuralla (sgkGunSayisi) yeniden hesaplanır:
// 31 çeken ayda 1 gün rapor 30 kalır, Şubat (28) 27 olur; çizelgeye yazılmış gibi.
// Veri girişindeki ücretsiz izin sadece muhasebeyi (bordro günü) değiştirir, part gün gibi; hak edilen gün çizelgedeki çalışmaya göre kalır.
// Rapor gerçektir (elle değiştirilmez): veri girişindeki rapor hak edilen günü de düşürür.
function veriUygula(sol,oz){Object.entries(oz).forEach(([pid,e])=>{const r=sol[pid];if(!r)return;const n=k=>e[k]||0;
  if(r.maasBurada!==false||r.muhBurada){r.rapor=(r.rapor||0)+n('R');r.ucretsiz=(r.ucretsiz||0)+n('UI');r.yillik=(r.yillik||0)+n('YI');r.bayram=(r.bayram||0)+n('B');
    r.partGun=Math.round(((r.partGun||0)+n('PG'))*100)/100;const T=r.gunTaban;const vE=n('R')+n('UI');
    // Part gün girilmemiş part-time: gün sayısı tam zamanlı gibi (ay − rapor − ücretsiz izin)
    if(r.partGun>0)r.gun=r.partGun;else if(vE)r.gun=T?sgkGunSayisi(T.ist,T.takvim,T.e+vE):Math.max(0,(r.gun||0)-vE);
    if(r.hakGun!=null&&n('R'))r.hakGun=T?sgkGunSayisi(T.istF,T.takvim,T.eH+n('R')):Math.max(0,r.hakGun-n('R'));
    if(r.iscGun!=null&&vE&&T&&T.iS!=null)r.iscGun=sgkGunSayisi(T.iS,T.takvim,T.eS+vE);
    // Part gün girilmiş tam zamanlı (ör. SGK'da 1 gün gösterilen, fiilen tüm ay çalışan): işçilikte SGK maliyeti de part gün üzerinden; maaş hak günü değişmez.
    if(r.iscGun!=null&&r.partGun>0)r.iscGun=Math.min(r.iscGun,r.partGun);}
  r.fmSaat=Math.round(((r.fmSaat||0)+n('FM'))*100)/100;if(['R','UI','YI','B','PG','FM'].some(k=>e[k]))r.elle=true;});return sol;}
function gorevBul(ad){return GOREVLER.find(g=>g.ad===ad)||null;}
function gorevTahmin(p){const g=String(p.gorev||'').toLocaleUpperCase('tr-TR');if(gorevBul(p.gorev))return p.gorev;
  if(p.sekil==='Esnaf kurye')return'Esnaf Kurye';
  if(g.startsWith('R.')||g.includes('RESTORAN'))return'R. Müdür';if(g.startsWith('V.')||g.includes('VARD')||g.includes('MÜDÜR'))return'V. Müdür';
  if(g.includes('SÜRÜCÜ')||g.includes('KURYE')||g.includes('MOTOR')||p.grup==='S')return'Kurye';if(g.includes('MUTFAK')||p.grup==='K')return'Mutfak';return'';}
function subeAdi(id){if(id===SGK_YOK)return'';return(S.subeler[id]&&S.subeler[id].ad)||(S.subeAdlari[id])||id||'';}
const ROL={sube:'Şube müdürü',bolge:'Bölge müdürü',isveren:'İşveren'};
const DURUM={taslak:{ad:'Taslak',c:'mut'},sube_onay:{ad:'Şube onayladı',c:'warn'},geri:{ad:'Geri gönderildi',c:'bad'},bolge_onay:{ad:'Bölge onayladı',c:'ok'},kesin:{ad:'Kesin kapandı',c:'ok'}};
// Ay onaylı mı (bölge onayı ya da işverenin kesin kapanışı). Kesin kapanan ayda hiçbir şey değişmez: rakamlar kapanış anındaki halleriyle saklanır.
const onayli=d=>d==='bolge_onay'||d==='kesin';
const kesinAy=d=>((S.aylar[ayKey(d)]||{}).durum)==='kesin';
const VARSAYILAN={ad:'Şube',acilis:'11:00',kapanis:'00:30',gunluk:8.5,haftalik:51,fmYontem:'sabit',fmUcret:165,fmDonem:'hafta'};

/* ================= Firebase ================= */
const ayarliMi=!String(firebaseConfig.apiKey||'').startsWith('BURAYA');
let app,auth,db;
// Kalıcı önbellek: internet yokken yapılan kayıtlar telefonda saklanır, uygulama kapanıp açılsa da internet gelince gönderilir.
if(ayarliMi){app=initializeApp(firebaseConfig);auth=getAuth(app);try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}catch(e){console.error(e);db=getFirestore(app);}}
/* ---- Bekleyen kayıt takibi ----
   Her yazma sunucu onaylayana kadar sayılır. Bekleyen kayıt varken ekranın altında durum gösterilir, sayfa kapatılmak istenirse uyarılır. */
const KAYIT={n:0};
function eskiRet(){toast('Uygulama güncellendi; kayıt için sayfayı yenileyin.');const r=Promise.reject(Object.assign(new Error('Eski uygulama sürümü'),{code:'eski-surum'}));r.catch(()=>{});return r;}
function kayitIzle(p){KAYIT.n++;kayitCiz();const bit=()=>{KAYIT.n=Math.max(0,KAYIT.n-1);kayitCiz();};p.then(bit,bit);return p;}
// Eski sürüm (sistem/surum) ise yazma SDK'ya hiç gitmez.
const setDoc=(...a)=>S.eskiSurum?eskiRet():kayitIzle(fsSetDoc(...a));
const updateDoc=(...a)=>S.eskiSurum?eskiRet():kayitIzle(fsUpdateDoc(...a));
const deleteDoc=(...a)=>S.eskiSurum?eskiRet():kayitIzle(fsDeleteDoc(...a));
const runTransaction=(...a)=>S.eskiSurum?eskiRet():kayitIzle(fsRunTransaction(...a));
function writeBatch(d){const b=fsWriteBatch(d);const c=b.commit.bind(b);b.commit=()=>S.eskiSurum?eskiRet():kayitIzle(c());return b;}
// Sunucu onayını beklemeden gönder (kayıt telefonda sıraya girdi); ret gelirse kullanıcıya söylenir.
const arka=p=>{p.catch(e=>yazmaHatasi(e));};
let kayitT=null;
function kayitCiz(){let el=document.getElementById('kayitDurum');if(!el){el=document.createElement('div');el.id='kayitDurum';el.setAttribute('role','status');
    el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom));z-index:60;padding:8px 14px;border-radius:999px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.18);display:none;max-width:92vw;text-align:center';document.body.appendChild(el);}
  clearTimeout(kayitT);if(!KAYIT.n){el.style.display='none';return;}
  const goster=()=>{if(!KAYIT.n){el.style.display='none';return;}const off=navigator.onLine===false;el.style.background=off?'#b42318':'#1f3a6b';el.style.color='#fff';
    el.textContent=off?`İnternet yok · ${KAYIT.n} değişiklik bu cihazda bekliyor, internet gelince gönderilecek.`:`Kaydediliyor… (${KAYIT.n})`;el.style.display='block';};
  if(navigator.onLine===false)goster();else kayitT=setTimeout(goster,1500);}
window.addEventListener('online',kayitCiz);window.addEventListener('offline',kayitCiz);
window.addEventListener('beforeunload',e=>{if(KAYIT.n>0){e.preventDefault();e.returnValue='Kaydedilmeyi bekleyen değişiklikler var.';return e.returnValue;}});

/* ================= Sürüm kontrolü =================
   sistem/surum.min: kayıt yapabilecek en eski uygulama sürümü. İşveren yeni sürümü açınca min yükselir; eski sürümle açık kalan
   telefonlar yazamaz, "yenileyin" ekranı görür (eski kodun hatalı kayıt yapması engellenir). Her yayında APP_SURUM bir artırılır. */
const APP_SURUM=171;
/* ================= Durum ================= */
const S={subeAdlari:{},user:null,me:null,meYuklendi:false,kurulumVar:null,subeler:{},subeIds:[],subeId:null,personel:[],haftalar:{},aylar:{},
  loaded:{personel:false,haftalar:false},tab:'cizelge',hafta:null,ay:null,
  pt:{sube:null,gorunum:'sol',doc:null,maas:null,prev:null,listeAylar:{}},users:[],
  gunler:{},haftaDurum:{w:{}},tk:{},tkGorunum:'hafta',tkKay:0};
const subs={sube:[],detay:[],liste:[],me:null,users:null,subeDocs:[],gun:[],tk:[]};
const undo=[];
const tryLS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}};

/* ================= Yardımcılar ================= */
function today(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parse(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function mondayOf(d){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return ymd(x);}
function weekDays(wid){const m=parse(wid);return [0,1,2,3,4,5,6].map(i=>addDays(m,i));}
function ayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function ayAdi(k){const[y,m]=k.split('-').map(Number);return AY[m-1]+' '+y;}
function ayKaydir(k,n){const[y,m]=k.split('-').map(Number);return ayKey(new Date(y,m-1+n,1));}
function rangeLabel(wid){const ds=weekDays(wid);const a=ds[0],b=ds[6];
  return a.getMonth()===b.getMonth()?`${a.getDate()} – ${b.getDate()} ${AY[b.getMonth()]} ${b.getFullYear()}`:`${a.getDate()} ${AYK[a.getMonth()]} – ${b.getDate()} ${AYK[b.getMonth()]} ${b.getFullYear()}`;}
function gosterAy(wid){return ayKey(addDays(parse(wid),3));}
const tnum=s=>{const[h,m]=s.split(':').map(Number);return h+m/60;};
const isShift=v=>typeof v==='string'&&/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v);
function shiftHours(v){const[a,b]=v.split('-');let s=tnum(a),e=tnum(b);if(e<=s)e+=24;return e-s;}
function shiftKind(v,sb){const[a,b]=v.split('-');let s=tnum(a),e=tnum(b);if(e<=s)e+=24;const op=tnum(sb.acilis||'11:00');let cl=tnum(sb.kapanis||'00:30');if(cl<=op)cl+=24;return{o:s<=op+1e-6,k:e>=cl-1e-6};}
function normTime(raw){let s=String(raw||'').trim().replace(/[.,\s]/g,':');if(!s)return null;let h,m;
  if(s.includes(':')){const p=s.split(':');h=+p[0];m=+(p[1]||0);if(p[1]&&p[1].length===1)m*=10;}
  else{const d=s.replace(/\D/g,'');if(!d)return null;if(d.length<=2){h=+d;m=0;}else if(d.length<=4){h=+d.slice(0,-2);m=+d.slice(-2);}else return null;}
  if(!(h>=0&&h<=24&&m>=0&&m<=59))return null;if(h===24)h=0;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
/* ---- Saat seçimi: yarım saatlik, şubenin saatlerine göre ----
   Normal aralık: açılış – kapanış + 30 dk (örn. 11:00 – 02:30). Bugün ve geçmiş günlerde düzeltme için iki uçta birer saat pay (10:00 – 03:30). */
const SON_SAAT_AZAMI=20;// saat listesi son saati, açılıştan en fazla 20 saat sonra olabilir
function saatAraligi(sb){const op=Math.round(tnum(sb.acilis||'11:00')*2)/2;let cl=Math.round(tnum(sb.kapanis||'00:30')*2)/2;if(cl<=op)cl+=24;let n1=cl+0.5;
  // İsteğe bağlı "saat listesi son saati" (örn. destek için 02:30): kapanış değişmez, sadece seçilebilir saatler uzar.
  if(sb.sonSaat&&/^\d{1,2}:\d{2}$/.test(sb.sonSaat)){let t=Math.round(tnum(sb.sonSaat)*2)/2;while(t<=op)t+=24;if(t>n1&&t-op<=SON_SAAT_AZAMI)n1=t;}return{n0:op,n1};}
function saatYaz(t){const tt=((t%24)+24)%24;const h=Math.floor(tt+1e-9);return String(h).padStart(2,'0')+':'+(tt-h>0.25?'30':'00');}
function duzeltmeGunu(d){return ymd(d)<=ymd(today());}
function saatListesi(sb,pay){const{n0,n1}=saatAraligi(sb);const L=[];for(let t=n0-(pay?1:0);t<=n1+(pay?1:0)+1e-9;t+=0.5)L.push({s:saatYaz(t),t,pay:t<n0-1e-9?'erken':t>n1+1e-9?'gec':''});return L;}
// Saatin listedeki konumu: gece yarısından sonraki saatler kapanışa göre sıralanır (02:00 → 26).
function saatKonum(s,sb){const{n0}=saatAraligi(sb);let t=tnum(s);while(t<n0-1-1e-9)t+=24;return t;}
// Vardiya kurala uyuyor mu: yarım saat, şube aralığında (ileri tarihli günde pay yok). pay: erken çağrılma / geç çıkış.
function vardiyaKontrol(v,sb,d){if(!isShift(v))return{ok:true};const[a,b]=v.split('-');const yarim=x=>/:(00|30)$/.test(x);
  if(!yarim(a)||!yarim(b))return{ok:false,neden:'Saatler yarım saatlik olmalı (örn. 11:00, 11:30).'};
  const{n0,n1}=saatAraligi(sb);const pay=duzeltmeGunu(d)?1:0;const ta=saatKonum(a,sb);let tb=saatKonum(b,sb);if(tb<=ta)tb+=24;
  if(ta<n0-pay-1e-9||ta>n1+pay+1e-9||tb>n1+pay+1e-9)return{ok:false,neden:pay?`Saat ${saatYaz(n0-1)} – ${saatYaz(n1+1)} arasında olmalı.`:`İleri tarihli günlerde saat ${saatYaz(n0)} – ${saatYaz(n1)} arasında olmalı. Erken çağrılma ve geç çıkış, gün geldiğinde düzeltme olarak yazılır.`};
  return{ok:true,pay:ta<n0-1e-9||tb>n1+1e-9};}
const fmt=x=>(Math.round((x||0)*100)/100).toLocaleString('tr-TR',{maximumFractionDigits:2});
const sg=x=>{const r=Math.round((x||0)*100)/100;return (r>0?'+':r<0?'−':'')+Math.abs(r).toLocaleString('tr-TR',{maximumFractionDigits:2});};
const tl=x=>(Math.round((x||0)*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const tl0=x=>Math.round(x||0).toLocaleString('tr-TR')+' ₺';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kisaAd(ad){const p=String(ad||'').trim().split(/\s+/);return p.length>1?p[0]+' '+p[p.length-1][0]+'.':p[0]||'';}
function bas(ad){const p=String(ad||'').trim().split(/\s+/);return((p[0]||'')[0]||'')+((p.length>1?p[p.length-1][0]:'')||'');}
function ascii(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/i̇/g,'i');}
function slug(s){return ascii(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'x';}
function isimAnahtar(s){return ascii(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function kadiNorm(s){return ascii(s).replace(/[^a-z0-9._-]/g,'');}
const eposta=k=>`${kadiNorm(k)}@${GIRIS_ALANI}`;
const trTarih=s=>{if(!s)return'';const[y,m,d]=s.split('-');return `${+d}.${m}.${y}`;};
// "8,5", "8.5", "28.075,50", "50.000" hepsini doğru okur: virgül varsa ondalık virgüldür; sadece nokta varsa ve 3'lü gruplarsa binlik ayırıcıdır.
const sayi=v=>{if(v===''||v==null)return 0;if(typeof v==='number')return v;let t=String(v).trim().replace(/[\s₺]/g,'');
  if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');else if(/^-?\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,'');const n=+t;return isFinite(n)?n:0;};

/* ================= Rol ================= */
const rol=()=>S.me&&S.me.rol;
const isIsveren=()=>rol()==='isveren', isBolge=()=>rol()==='bolge', isSube=()=>rol()==='sube';
const puantajYetki=()=>isIsveren()||isBolge();

/* ================= Hesaplar ================= */
function sube(id){const o=Object.assign({},VARSAYILAN,S.subeler[id||S.subeId]||{});o.haftalik=Math.round(o.gunluk*6*100)/100;return o;}// haftalık mesai = günlük × 6 (ayrı ayar yok)
// Hesaba giren şube ayarları aya göre: ayarGecmis {"2026-11": {gunluk, fmUcret, …}} = "o aydan itibaren". Ayar değişince önceki aylar eski ayarla kalır.
const AYAR_ALANLARI=['gunluk','fmYontem','fmUcret','fmDonem'];
function subeAyari(id,ak){const sb=sube(id);const g=sb.ayarGecmis;if(!g||!ak)return sb;const k=Object.keys(g).filter(x=>x<=ak).sort().pop();if(!k)return sb;const r={...sb,...g[k]};r.haftalik=Math.round(r.gunluk*6*100)/100;return r;}
function ayarGecmisYama(id,yeni){const s0=sube(id);if(!S.subeler[id])return{};const ak0=ayKey(today());const ak=ak0<BASLANGIC_AY?BASLANGIC_AY:ak0;const g={...(s0.ayarGecmis||{})};
  const al=o=>Object.fromEntries(AYAR_ALANLARI.map(k=>[k,o[k]??VARSAYILAN[k]??null]));const simdi=subeAyari(id,ak);
  if(!AYAR_ALANLARI.some(k=>yeni[k]!==undefined&&yeni[k]!==simdi[k]))return{};
  if(!Object.keys(g).length)g[BASLANGIC_AY]=al(s0);// ilk değişiklik: o güne kadarki ayarlar başlangıçtan itibaren geçerli kalır
  g[ak]=al({...simdi,...yeni});return{ayarGecmis:g};}
function cellOf(pid,wid,i,H=S.haftalar){const w=H[wid];const c=w&&w.cells&&w.cells[pid];const v=c?c[String(i)]:null;return v==null?null:v;}
// Fiili çalışma: işe başlama (deneme dahil) varsa ondan, yoksa SGK girişinden itibaren.
function ilkGun(p){return p.baslama&&(!p.giris||p.baslama<p.giris)?p.baslama:p.giris;}
function sgkli(p,d){const s=ymd(d);if(p.giris&&s<p.giris)return false;if(p.cikis&&s>p.cikis)return false;return true;}
function employed(p,d){const s=ymd(d);const g=ilkGun(p);if(g&&s<g)return false;if(p.cikis&&s>p.cikis)return false;return true;}
// Çıkış yapan kişi, son çalıştığı ayın maaşı ödendikten sonra (ertesi ayın 10'undan sonra) Pasif'e geçer.
// Aynı kişinin başka bir (çıkmış) kaydı henüz pasife geçmediyse (ör. SGK'sız ikinci kayıt) ikisi birlikte geçer.
const PASIF_GUN=10;
function pasifTarihi(c){const[y,m]=c.split('-').map(Number);return ymd(new Date(y,m,PASIF_GUN));}
function pasifSure(p,td){return !!p.cikis&&td>pasifTarihi(p.cikis);}
function pasifMi(p,td,list){if(!pasifSure(p,td))return false;return !list.some(x=>x.id!==p.id&&x.cikis&&x.cikis<td&&ayniKisi(x,p)&&!pasifSure(x,td));}
function weekHasEntry(pid,wid,H=S.haftalar){const w=H[wid];const c=w&&w.cells&&w.cells[pid];return !!c&&Object.values(c).some(v=>v!=null&&v!=='');}
function isEsnaf(p){return p.sekil==='Esnaf kurye';}
function locked(d){const a=S.aylar[ayKey(d)];return !!a&&onayli(a.durum);} // aylık şube kapatması yok; haftalar kapatılır, ay sadece bölge onayında kilitlenir
function aktifHaftada(p,wid){return weekDays(wid).some(d=>employed(p,d));}
function aktifAyda(p,ak){const[y,m]=ak.split('-').map(Number);for(let d=new Date(y,m-1,1);d.getMonth()===m-1;d=addDays(d,1))if(employed(p,d))return true;return false;}
function sirala(list){return list.slice().sort((a,b)=>GRUP_SIRA.indexOf(a.grup||'K')-GRUP_SIRA.indexOf(b.grup||'K')||(a.sira??999)-(b.sira??999)||String(a.ad).localeCompare(String(b.ad),'tr'));}
// Excel kuralı: hafta FM = çalışılan − (gün × günlük); 7 gün çalışılmışsa çalışılan − haftalık. Kaydı olmayan hafta sayılmaz; boş gün beklenen gündür.
// Çok şubeli kişide başka şubede çalıştığı gün bu şubede "boş gün" sayılmaz; o günün normal saati çalıştığı şubede beklenir.
// İzin kullanmadan 7 gün çalışılan haftanın fazlası (7 × günlük − haftalık) haftaYedi'nin seçtiği şubeye yazılır.
function haftaHesap(p,wid,sb=sube(),H=S.haftalar){let h=0,wd=0,bos=0;const kayit=weekHasEntry(p.id,wid,H);const cs=cokSubeli(p);
  weekDays(wid).forEach((d,i)=>{if(!employed(p,d))return;const v=cellOf(p.id,wid,i,H);if(isShift(v)){h+=shiftHours(v);wd++;}else if((v==null||v==='')&&kayit&&bosSayilir(p,d))bos++;});
  const y=kayit?haftaYedi(p,wid,H):{yedi:false};const bonus=y.yedi&&y.sube===S.subeId?7*sb.gunluk-sb.haftalik:0;
  return{h,wd,bos,fm:!kayit?0:h-(wd+bos)*sb.gunluk+bonus,kayit};}
// Haftanın 7 günü de (bu şube + kişinin diğer şubeleri) vardiyalı mı? İzin günü mesaisini ödeyen şube: maaş şubesi dışında çalışılan son günün şubesi, yoksa maaş şubesi.
// Aynı kişinin birden fazla kaydı varsa (SGK şube devri, SGK'sız devam) hafta kişi bazında birleşik bakılır: her gün o gün çalışan kaydın hücresine bakılır.
// Sonuç yalnızca pazar günü çalışan kayıt için döner; böylece fazla mesai bonusu kayıtlar toplanırken bir kez sayılır.
function haftaYedi(p,wid,H=S.haftalar,sid=S.subeId){const ds=weekDays(wid);const ms=odemeSubesi(p,ayKey(ds[6]));let son=null,burada=0;
  if(!employed(p,ds[6]))return{yedi:false};
  const grup=S.personel.filter(x=>x.id===p.id||ayniKisi(x,p));
  for(let i=0;i<7;i++){const d=ds[i];const E=grup.filter(x=>employed(x,d));if(!E.length)return{yedi:false};const L=[];if(E.some(x=>isShift(cellOf(x.id,wid,i,H)))){L.push(sid);burada++;}
    E.forEach(x=>{if(!cokSubeli(x))return;const o=digerGunler(x,d,sid);if(o)Object.entries(o).forEach(([s,v])=>{if(isShift(v))L.push(s);});});
    if(!L.length)return{yedi:false};L.forEach(s=>{if(s!==ms)son=s;});}
  return{yedi:true,sube:burada===7?sid:(son||ms)};}
// Bir haftanın kişi bazında ay ay dökümü (takvim ayı hesabıyla aynı kural): kapatılan haftanın özeti için.
function haftaAyParca(p,wid,sb=sube(),H=S.haftalar){const o={};if(!weekHasEntry(p.id,wid,H))return o;const cs=cokSubeli(p);
  weekDays(wid).forEach((d,i)=>{if(!employed(p,d))return;const ak=ayKey(d);const x=o[ak]=o[ak]||{h:0,fm:0};const v=cellOf(p.id,wid,i,H);
    if(isShift(v)){const s=shiftHours(v);x.h+=s;x.fm+=s-sb.gunluk;}else if(!(v&&KOD[v])&&bosSayilir(p,d))x.fm-=sb.gunluk;
    if(i===6){const y=haftaYedi(p,wid,H);if(y.yedi&&y.sube===S.subeId)x.fm+=7*sb.gunluk-sb.haftalik;}});
  Object.values(o).forEach(x=>{x.h=Math.round(x.h*100)/100;x.fm=Math.round(x.fm*100)/100;});return o;}
// SGK / bordro gün sayısı. Tam ayda eksik gün yoksa her ay 30. Eksik gün varsa takvim günü − eksik gün, en çok 30:
// 31 çeken ayda 1 gün rapor 30 kalır; Şubat 28 çekerse 27, 29 çekerse 28 olur.
// Ay ortasında giriş/çıkışta: çalışılan takvim günü (en çok 30) − eksik gün. eksik = rapor + ücretsiz izin.
function sgkGunSayisi(calisilan,takvim,eksik){const tam=calisilan===takvim;const taban=tam?(eksik>0?takvim:30):Math.min(30,calisilan);return Math.max(0,Math.min(30,taban-eksik));}
function ayHesap(p,ak,sb=sube(),H=S.haftalar,bitis=null){p=gorevAyda(p,ak);const[y,m]=ak.split('-').map(Number);const last=new Date(y,m,0);
  let h=0,fm=0,bos=0,gun=0,istihdam=0;const kod={};const cs=cokSubeli(p);const fmBas=sb.fmDonem==='hafta'?null:fmDonemAraligi(ak,S.subeId,sb).bas;
  for(let d=new Date(y,m-1,1);d<=last&&(!bitis||ymd(d)<=bitis);d=addDays(d,1)){if(!employed(p,d))continue;istihdam++;const wid=mondayOf(d);const i=(d.getDay()+6)%7;
    const v=cellOf(p.id,wid,i,H);const kayit=weekHasEntry(p.id,wid,H);const fmGun=!fmBas||ymd(d)>=fmBas;// geçiş: önceki ayın haftalık döneminde ödenen günler sayılmaz
    if(isShift(v)){const x=shiftHours(v);h+=x;if(fmGun)fm+=x-sb.gunluk;gun++;}else if(v&&KOD[v])kod[v]=(kod[v]||0)+1;else if(kayit&&bosSayilir(p,d)){if(fmGun)fm-=sb.gunluk;bos++;}
    // İzinsiz haftanın fazlası haftanın bittiği güne (pazar) yazılır: hafta iki aya bölünse de pazarın ayına gider.
    if(i===6&&kayit&&fmGun){const yy=haftaYedi(p,wid,H);if(yy.yedi&&yy.sube===S.subeId)fm+=7*sb.gunluk-sb.haftalik;}}
  // Haftalık dönem: pazartesisi bu ayda olan haftalar (örn. Eylül 2026 = 7 Eylül – 4 Ekim); takvim ayından geçişte aradaki günler de
  if(sb.fmDonem==='hafta'){fm=0;fmHaftalari(ak).forEach(wid=>{fm+=haftaHesap(p,wid,sb,H).fm;});fm+=fmGecisGunleri(p,ak,sb,H).fm;}
  const part=p.sekil==='Part',esnaf=isEsnaf(p),fmYok=part||esnaf;
  const tamAy=istihdam===last.getDate();
  const bordroGun=sgkGunSayisi(istihdam,last.getDate(),(kod.R||0)+(kod.UI||0));
  return{h,fm:fmYok?0:fm,fmHam:esnaf?0:fm,bos:esnaf?0:bos,gun,kod,part,esnaf,bordroGun,tamAy};}
// Çizelgedeki ay sütunu: o haftaya kadar (o hafta dahil) birikmiş fazla mesai ve saat. Haftalık dönemde dönemin haftaları, takvim ayında haftanın son gününe kadar.
function ayKadar(p,wid,sb=sube(),H=S.haftalar){const ak=fmAyi(wid,sb);p=gorevAyda(p,ak);const fmYok=p.sekil==='Part'||isEsnaf(p);
  // Şube müdürü kapatılmış haftaları göremez: o haftaların toplamı kapatılırken kaydedilen özetten gelir.
  const oz=w=>!H[w]?(((S.haftaDurum.w||{})[w]||{}).oz||{})[p.id]:null;
  if(sb.fmDonem==='hafta'){let h=0,fm=fmGecisGunleri(p,ak,sb,H).fm;fmHaftalari(ak).filter(w=>w<=wid).forEach(w=>{const z=oz(w);if(z){h+=z.h||0;fm+=z.fm||0;return;}const x=haftaHesap(p,w,sb,H);h+=x.h;fm+=x.fm;});return{h,fm:fmYok?0:fm};}
  const r=ayHesap(p,ak,sb,H,ymd(addDays(parse(wid),6)));if(!isSube())return r;const o={...r};
  const[y,m]=ak.split('-').map(Number);const fmBas=fmDonemAraligi(ak,S.subeId,sb).bas;for(let w=parse(mondayOf(new Date(y,m-1,1)));ymd(w)<=wid;w=addDays(w,7)){const z=oz(ymd(w));const a=z&&z.a&&z.a[ak];if(a){o.h+=a.h||0;if(!fmYok&&ymd(addDays(w,6))>=fmBas)o.fm+=a.fm||0;}}// geçiş: önceki ayın haftalık döneminde ödenen hafta sayılmaz
  return o;}
// Fazla mesai dönemi geçişi: dönem, bir önceki ayın döneminin bittiği günün ertesinden başlar.
// Haftalıktan takvim ayına geçişte (Eylül 7 Eyl – 4 Eki haftalık, Ekim takvim) 1–4 Ekim Eylül'de ödendiği için Ekim 5 Ekim'den başlar;
// takvim ayından haftalığa geçişte aradaki günler (ör. 1 Kasım pazar) yeni aya eklenir. Böylece hiçbir gün iki kez ödenmez ya da boşta kalmaz.
function fmDonemTemel(ak,sb){if(sb.fmDonem==='hafta'){const L=fmHaftalari(ak);return{bas:L[0],son:ymd(addDays(parse(L[L.length-1]),6))};}
  const[y,m]=ak.split('-').map(Number);return{bas:ymd(new Date(y,m-1,1)),son:ymd(new Date(y,m,0))};}
function fmDonemAraligi(ak,sid=S.subeId,sb=subeAyari(sid,ak)){const t=fmDonemTemel(ak,sb);const once=ayKaydir(ak,-1);if(once<BASLANGIC_AY)return t;
  const po=fmDonemTemel(once,subeAyari(sid,once));return{bas:ymd(addDays(parse(po.son),1)),son:t.son};}
// Haftalık dönemde, dönemin ilk haftasından önceki geçiş günleri (takvim ayından haftalığa geçişte): günlük fazla mesai + o haftanın pazarı aralıktaysa 7 gün farkı.
function fmGecisGunleri(p,ak,sb,H=S.haftalar){const r=fmDonemAraligi(ak,S.subeId,sb);const ilk=fmHaftalari(ak)[0];let fm=0,h=0;
  for(let d=parse(r.bas);ymd(d)<ilk;d=addDays(d,1)){if(!employed(p,d))continue;const wid=mondayOf(d);const i=(d.getDay()+6)%7;const v=cellOf(p.id,wid,i,H);const kayit=weekHasEntry(p.id,wid,H);
    if(isShift(v)){const x=shiftHours(v);h+=x;fm+=x-sb.gunluk;}else if(!(v&&KOD[v])&&kayit&&bosSayilir(p,d))fm-=sb.gunluk;
    if(i===6&&kayit){const yy=haftaYedi(p,wid,H);if(yy.yedi&&yy.sube===S.subeId)fm+=7*sb.gunluk-sb.haftalik;}}
  return{fm,h};}
// Haftalık dönem: varsayılan = pazartesisi o ayda olan haftalar. Şube ayarında fmSon {"2026-08":"2026-08-30"} (dönemin son günü, pazar) ile
// ay 1 hafta kısa/uzun seçilebilir; sonraki ay bir önceki ayın bittiği günün ertesinden başlar (hiçbir hafta iki kez sayılmaz ya da boşta kalmaz).
function fmVarsayilanSon(ak){const[y,m]=ak.split('-').map(Number);let d=new Date(y,m,0);while(d.getDay()!==1)d=addDays(d,-1);return ymd(addDays(d,6));}
function fmSonGecerli(ak,e){if(!/^\d{4}-\d{2}-\d{2}$/.test(e||''))return false;const d=parse(e);return d.getDay()===0&&Math.abs((d-parse(fmVarsayilanSon(ak)))/864e5)<=21;}// pazar, varsayılan bitişten en çok 3 hafta
function fmBasGecerli(ak,b){if(!/^\d{4}-\d{2}-\d{2}$/.test(b||''))return false;const[y,m]=ak.split('-').map(Number);let f=new Date(y,m-1,1);while(f.getDay()!==1)f=addDays(f,1);const d=parse(b);return d.getDay()===1&&Math.abs((d-f)/864e5)<=21;}// pazartesi, ilk pazartesiden en çok 3 hafta
function fmSonu(ak,sid=S.subeId){const o=((S.subeler[sid]||{}).fmSon||{})[ak];return o&&fmSonGecerli(ak,o)?o:fmVarsayilanSon(ak);}
function fmHaftalari(ak,sid=S.subeId){const[y,m]=ak.split('-').map(Number);const L=[];let d=new Date(y,m-1,1);while(d.getDay()!==1)d=addDays(d,1);
  const once=ayKaydir(ak,-1);if(once>=BASLANGIC_AY&&subeAyari(sid,once).fmDonem==='hafta'&&((S.subeler[sid]||{}).fmSon||{})[once])d=addDays(parse(fmSonu(once,sid)),1);
  else if(once<BASLANGIC_AY){const b=((S.subeler[sid]||{}).fmBas||{})[ak];if(fmBasGecerli(ak,b))d=parse(b);}// sistemin ilk ayı: başlangıç seçilebilir
  const son=fmSonu(ak,sid);const d0=ymd(d);for(;ymd(d)<=son;d=addDays(d,7))L.push(ymd(d));if(!L.length)L.push(d0);return L;}
// İşveren: haftalık dönemde ayın kaç hafta ödeneceğini seçer (ör. Ağustos 4 hafta, Eylül 5 hafta). Ay ya da sonraki ay onaylıysa kilitli.
function fmSecici(ak,sb){if(!isIsveren()||sb.fmDonem!=='hafta'||ak<BASLANGIC_AY)return'';const sid=S.subeId;const L=fmHaftalari(ak,sid);const bas=L[0],cur=fmSonu(ak,sid);
  const kilitli=['sube_onay','bolge_onay','kesin'].includes((S.aylar[ak]||{}).durum)||['bolge_onay','kesin'].includes((S.aylar[ayKaydir(ak,1)]||{}).durum);
  const yaz=t=>{const d=parse(t);return `${d.getDate()} ${AYK[d.getMonth()]}`;};const ilkAy=ayKaydir(ak,-1)<BASLANGIC_AY;const dis=kilitli?'disabled':'';
  const basHtml=ilkAy?`<label class="field"><span>Fazla mesai dönemi başlangıcı (${esc(subeAdi(sid))})</span><input type="date" id="fmBasSec" value="${bas}" ${dis}></label>`:'';
  return basHtml+`<label class="field"><span>Fazla mesai dönemi bitişi (${esc(subeAdi(sid))})</span><input type="date" id="fmSonSec" value="${cur}" ${dis}></label>
  <p class="note">${L.length} hafta · ${yaz(bas)} – ${yaz(cur)}. ${kilitli?'Ay ya da sonraki ay onaylandığı için dönem değiştirilemez; önce kilidi açın.':`${ilkAy?'Sistemin ilk ayı: başlangıç ve bitiş tarihini siz seçersiniz. ':''}Seçtiğiniz tarih hafta sınırına oturtulur (başlangıç pazartesi, bitiş pazar). Sonraki ay, bu ayın bittiği günün ertesinden başlar.`}</p>`;}
function fmDonemKaydet(ak,alan,v){const sid=S.subeId;const eski=(S.subeler[sid]||{})[alan]||{};return setDoc(doc(db,'subeler',sid),{[alan]:{[ak]:v}},{merge:true}).then(()=>{S.subeler[sid]={...S.subeler[sid],[alan]:{...eski,[ak]:v}};toast('Fazla mesai dönemi güncellendi.');render();}).catch(yazmaHatasi);}
function fmSeciciBagla(ak){const bb=byId('fmBasSec'),e=byId('fmSonSec');
  if(bb)bb.onchange=()=>{if(!bb.value){render();return;}const v=mondayOf(parse(bb.value));if(!fmBasGecerli(ak,v)){toast('Başlangıç, ayın ilk pazartesisinden en çok 3 hafta uzakta olabilir.');render();return;}if(v>fmSonu(ak)){toast('Başlangıç bitişten sonra olamaz.');render();return;}fmDonemKaydet(ak,'fmBas',v);};
  if(e)e.onchange=()=>{if(!e.value){render();return;}const v=ymd(addDays(parse(mondayOf(parse(e.value))),6));if(!fmSonGecerli(ak,v)){toast('Bitiş, ay sonundan en çok 3 hafta uzakta olabilir.');render();return;}if(v<ymd(addDays(parse(fmHaftalari(ak)[0]),6))){toast('Dönem en az 1 hafta olmalı.');render();return;}fmDonemKaydet(ak,'fmSon',v);};}
function fmDonemYazi(ak,sb=sube()){const r=fmDonemAraligi(ak,S.subeId,sb);const t=fmDonemTemel(ak,sb);if(sb.fmDonem!=='hafta'&&r.bas===t.bas)return'';const a=parse(r.bas),b=parse(r.son);return `${a.getDate()} ${AYK[a.getMonth()]} – ${b.getDate()} ${AYK[b.getMonth()]}`;}
// Çizelgedeki "ay fazla mesai" sütununun ayı: haftalık dönemde haftanın pazartesisinin ayı
function fmAyi(wid,sb=sube()){if(sb.fmDonem!=='hafta')return gosterAy(wid);const a=ayKey(parse(wid));const sbd=S.subeler[S.subeId]||{};if(!Object.keys(sbd.fmSon||{}).length&&!Object.keys(sbd.fmBas||{}).length)return a;return[a,ayKaydir(a,1),ayKaydir(a,-1)].find(k=>k>=BASLANGIC_AY&&fmHaftalari(k).includes(wid))||a;}
// Haftanın listesi (kadro): o hafta çizelgede görünen kişiler. Kayıtlı değilse önceki haftanın listesi önerilir.
function maasSubesi(p){return p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:(p.anaSube||'');}
// Maaşın ödendiği şube: varsayılan SGK şubesi; "çalıştığı şubede" seçildiyse çalıştığı şube. Muhasebe (bordro) her zaman SGK şubesinde.
function odemeSubesiEski(p){const sgk=p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:'';if(sgk&&p.anaSube&&sgk!==p.anaSube&&p.maasYeri!=='sgk')return p.anaSube;return maasSubesi(p);}
// Maaş şubesi aya göre: maasSubeGecmis {"2026-10":"şubeId"} = "o aydan itibaren". Kayıt yoksa eski kural (çalıştığı şube / SGK).
function odemeSubesi(p,ak){const g=p&&p.maasSubeGecmis;if(g&&ak){const k=Object.keys(g).filter(x=>x<=ak&&g[x]).sort().pop();if(k)return g[k];}return odemeSubesiEski(p);}
// Maaş şubesini "ak ayından itibaren" değiştirir; önceki aylar o ana kadarki şubede donar. yeni: şube id'si ya da kişinin yeni alanları.
function maasGecmisYama(p,yeni,ak){if(!ak||ak<BASLANGIC_AY)ak=BASLANGIC_AY;const g0=p.maasSubeGecmis||{};const g={...g0};const ilk=!Object.keys(g0).length;
  if(ilk)g[BASLANGIC_AY]=odemeSubesiEski(p);const once=odemeSubesi({...p,maasSubeGecmis:g},ak);
  const y=typeof yeni==='string'?yeni:odemeSubesiEski({...p,...yeni});if(!y||y===once)return null;
  g[ak]=y;return{maasSubeGecmis:g,maasSubeleri:[...new Set(Object.values(g).filter(Boolean))]};}
// Görev geçmişi: gorevGecmis {"2026-09":{gorev,grup,sekil}} = "o aydan itibaren". Ay hesabında kişinin o ayki görevi, grubu ve çalışma şekli kullanılır.
// İlk kayıttan önceki aylar ilk kaydın değerini alır. Kişinin üstteki gorev/grup/sekil alanları her zaman en son kaydın değeridir.
function gorevAyda(p,ak){const g=p&&p.gorevGecmis;if(!g||!ak)return p;const ks=Object.keys(g).filter(x=>g[x]&&g[x].gorev).sort();if(!ks.length)return p;const v=g[ks.filter(x=>x<=ak).pop()||ks[0]];
  if(v.gorev===p.gorev&&(v.grup||p.grup)===p.grup&&(v.sekil||p.sekil)===p.sekil)return p;return{...p,gorev:v.gorev,grup:v.grup||p.grup,sekil:v.sekil||p.sekil};}
// Görevi "ak ayından itibaren" değiştirir; önceki aylar eski görevde kalır. yeni: {gorev,grup,sekil}.
function gorevGecmisYama(p,yeni,ak){if(!ak||ak<BASLANGIC_AY)ak=BASLANGIC_AY;const g0=p.gorevGecmis||{};const g={...g0};
  if(!Object.keys(g0).length)g[BASLANGIC_AY]={gorev:p.gorev||'',grup:p.grup||'K',sekil:p.sekil||'Tam'};
  const once=gorevAyda({...p,gorevGecmis:g},ak);if(g[ak]&&once.gorev===yeni.gorev&&once.grup===yeni.grup&&once.sekil===yeni.sekil)return null;
  g[ak]={gorev:yeni.gorev,grup:yeni.grup,sekil:yeni.sekil};const son=g[Object.keys(g).sort().pop()];return{gorevGecmis:g,gorev:son.gorev,grup:son.grup,sekil:son.sekil};}
function gorevGecmisYazi(p){const g=(p&&p.gorevGecmis)||{};return Object.keys(g).filter(k=>g[k]&&g[k].gorev).sort().map(k=>`${ayAdi(k)}: ${g[k].gorev}${g[k].sekil&&g[k].sekil!=='Tam'?' ('+g[k].sekil+')':''}`).join(' · ');}
// Personel tablosundan görev / şekil düzeltmesi: geçmişi olan kişide bu aydan itibaren geçerli olur, geçmişi olmayanda eskisi gibi tüm aylar.
function gorevSatirYama(p,body){if(!p.gorevGecmis||!Object.keys(p.gorevGecmis).length)return body;const y=gorevGecmisYama(p,{gorev:body.gorev??p.gorev,grup:body.grup??p.grup,sekil:body.sekil??p.sekil},ayKey(today()));return y||body;}
function maasSubeGecmisYazi(p){const g=(p&&p.maasSubeGecmis)||{};return Object.keys(g).sort().map(k=>`${ayAdi(k)}: ${subeAdi(g[k])}`).join(' · ');}
/* ---- Çok şubeli çalışma ----
   ekSubeler: kişinin çalıştığı şube ve SGK şubesi dışında şu an çalıştığı diğer şubeler (sadece işveren / bölge müdürü değiştirir).
   gorunurSubeler: kişinin şimdiye kadar çalıştığı tüm şubeler; şubeden çıkarılsa da geçmiş haftaları görünsün diye hiç küçülmez.
   gunler/{kişi}__{ay}.g: gün gün hangi şubede ne yazıldığı. Bir kişi aynı gün iki şubede vardiyalı olamaz. */
function ekSubeleri(p){return Array.isArray(p&&p.ekSubeler)?p.ekSubeler.filter(Boolean):[];}
function kisiSubeleri(p){const s=new Set();if(!p)return[];if(p.anaSube)s.add(p.anaSube);if(p.sgkSube&&p.sgkSube!==SGK_YOK)s.add(p.sgkSube);ekSubeleri(p).forEach(x=>s.add(x));(p.gorunurSubeler||[]).forEach(x=>x&&s.add(x));return[...s];}
function cokSubeli(p){return kisiSubeleri(p).length>1;}
// Boş gün (eksi mesai) sayılır mı: çok şubeli kişide boş gün sadece maaşının ödendiği şubede beklenir; başka şubede çalıştığı gün hiçbir yerde boş sayılmaz.
function bosSayilir(p,d,sid=S.subeId){if(!cokSubeli(p))return true;if(digerGunler(p,d,sid))return false;return odemeSubesi(p,ayKey(d))===sid;}
function subedeAktif(p,sid){return p.anaSube===sid||p.sgkSube===sid||ekSubeleri(p).includes(sid);}
// Şubeden çıkarılmış ama geçmiş haftaları için görünen kişi: yeni haftaya önerilmez, kopyalanmaz.
function subedenCikti(p,sid=S.subeId){return !!p&&!subedeAktif(p,sid)&&(p.gorunurSubeler||[]).includes(sid);}
function gunDoc(pid,ak){const k=pid+'__'+ak;if(!(k in S.gunler)){S.gunler[k]=null;
    // Okunamayan gün kaydı sessizce "boş gün" sayılmaz: hata işaretlenir, ekranda uyarı çıkar (gunHataVar).
    subs.gun.push(onSnapshot(doc(db,'gunler',k),s=>{S.gunler[k]=s.exists()?s.data():{};if(S.gunHata)delete S.gunHata[k];gunRender();},e=>{console.error(e);S.gunler[k]={};(S.gunHata=S.gunHata||{})[k]=1;gunRender();}));}return S.gunler[k];}
const gunHataVar=()=>!!S.gunHata&&Object.keys(S.gunHata).length>0;
const GUN_HATA_YAZI='Bazı kişilerin başka şubedeki çalışma günleri okunamadı; o günler boş görünüyor ve fazla mesai / eksik gün yanlış çıkabilir. Sayfayı yenileyin; düzelmezse işverene haber verin, düzelmeden onaylamayın.';
let gunT;function gunRender(){clearTimeout(gunT);gunT=setTimeout(render,60);}
// Kişinin o gün diğer şubelerdeki kaydı {şube: değer} (bu şube hariç); yoksa null.
function digerGunler(p,d,sid=S.subeId){if(!p||!cokSubeli(p))return null;const ds=typeof d==='string'?d:ymd(d);const D=gunDoc(p.id,ds.slice(0,7));
  const g=D&&D.g&&D.g[ds];if(!g)return null;const o={};Object.entries(g).forEach(([s,v])=>{if(s!==sid&&v)o[s]=v;});return Object.keys(o).length?o:null;}
// Aynı gün kuralı: vardiya varken başka şubede vardiya ya da rapor/ücretsiz/yıllık izin olamaz.
function gunCakisir(yeni,diger){if(!yeni||!diger)return null;const IZ=['R','UI','YI'];
  for(const[s,v]of Object.entries(diger)){if(isShift(yeni)&&(isShift(v)||IZ.includes(v)))return{s,v};if(IZ.includes(yeni)&&isShift(v))return{s,v};}return null;}
function cakismaMesaj(p,ds,c){const d=parse(ds);return `${kisaAd(p.ad)} ${d.getDate()} ${AY[d.getMonth()]} günü ${subeAdi(c.s)} şubesinde ${isShift(c.v)?c.v.replace('-',' – '):KOD[c.v]?KOD[c.v].ad.toLocaleLowerCase('tr-TR'):c.v} yazılı. Bir kişi aynı gün tek şubede çalışır; o gün nerede başladıysa oraya yazın.`;}
// Gün kaydını şubeler arası ortak belgeye yazar. Çakışma varsa yazmaz, çakışmayı döner.
async function gunYaz(p,ds,val,sid){gerekliSube(sid);const ak=ds.slice(0,7);const ref=doc(db,'gunler',p.id+'__'+ak);
  return runTransaction(db,async tr=>{const s=await tr.get(ref);const g=(s.exists()&&s.data().g&&s.data().g[ds])||{};const o={};Object.entries(g).forEach(([x,v])=>{if(x!==sid&&v)o[x]=v;});
    const c=gunCakisir(val,o);if(c)return c;
    // Şube listesi eskisinin üstüne eklenir, hiç küçülmez (eski ekranda yazılan kayıt başka şubenin yetkisini düşürmesin).
    const subeler=[...new Set([...((s.exists()&&Array.isArray(s.data().subeler))?s.data().subeler:[]),...kisiSubeleri(p),sid])];
    tr.set(ref,{pid:p.id,ay:ak,subeler,g:{[ds]:{[sid]:val?val:deleteField()}}},{merge:true});return null;});}
async function gunleriYukle(kisiler,aylar){const L=[];kisiler.filter(cokSubeli).forEach(p=>aylar.forEach(ak=>{const k=p.id+'__'+ak;if(!S.gunler[k])L.push(getDoc(doc(db,'gunler',k)).then(s=>{if(!S.gunler[k])S.gunler[k]=s.exists()?s.data():{};}).catch(e=>{console.error(e);(S.gunHata=S.gunHata||{})[k]=1;}));gunDoc(p.id,ak);}));await Promise.all(L);}
function kisaSubeAd(s){const a=subeAdi(s)||'';const p=a.split(/\s+/);return p.length>1&&/^(ankara|antalya|isparta|burdur)$/i.test(ascii(p[0]))?p.slice(1).join(' '):a;}
function kadroDoc(wid,H=S.haftalar){const w=H[wid];if(!w){const k=H===S.haftalar&&((S.haftaDurum.w||{})[wid]||{}).k;return Array.isArray(k)&&k.length?k:null;}if(Array.isArray(w.kadro))return w.kadro;const c=Object.keys(w.cells||{});return c.length?c:null;}
function kadroOf(wid){const k=S.haftalar[wid]&&kadroDoc(wid);if(k)return{ids:k,oneri:false};const ds=weekDays(wid);
  for(let i=1;i<=8;i++){const kk=kadroDoc(ymd(addDays(parse(wid),-7*i)));if(kk)return{ids:kk.filter(id=>{const p=S.personel.find(x=>x.id===id);return p&&!subedenCikti(p)&&ds.some(d=>employed(p,d));}),oneri:true};}
  return{ids:[],oneri:true};}
// Çizelgede aynı kişinin birden fazla kaydı (SGK şube değişikliği) tek satırda: her gün o gün çalışan kayda yazılır.
let CZ_ES={};
function rowPid(pid,i,wid=S.hafta){const L=CZ_ES[pid];if(!L)return pid;const d=weekDays(wid)[i];const q=L.find(x=>employed(x,d));return q?q.id:pid;}
function gunKaydiP(p,d){const L=CZ_ES[p.id]||[p];return L.find(x=>employed(x,d))||null;}
function haftaHesapS(p,wid,sb){const L=CZ_ES[p.id];if(!L)return haftaHesap(p,wid,sb);const o={h:0,fm:0};L.forEach(q=>{const x=haftaHesap(q,wid,sb);o.h+=x.h;o.fm+=x.fm;});return o;}
function ayKadarS(p,wid,sb){let L=CZ_ES[p.id];
  // O hafta kadroda sadece devam kaydı varsa (ör. SGK çıkıştan sonra SGK'sız devam), aynı kişinin o aydaki önceki kaydı da aya-kadar toplamına katılır.
  if(!L){const ak=fmAyi(wid,sb);const es=subePersoneli().filter(x=>x.id===p.id||(ayniKisi(x,p)&&aktifAyda(x,ak)));if(es.length>1)L=es;}
  if(!L)return ayKadar(p,wid,sb);const o={h:0,fm:0};L.forEach(q=>{const x=ayKadar(q,wid,sb);o.h+=x.h;o.fm+=x.fm;});return o;}
function cizelgeKisileri(wid){const ids=kadroOf(wid).ids;let L=ids.map(id=>S.personel.find(p=>p.id===id)).filter(Boolean);
  if(wid===S.hafta)CZ_ES={};const son=weekDays(wid)[6];const gor=new Set();const out=[];
  L.forEach(p=>{if(gor.has(p.id))return;const es=L.filter(x=>x.id===p.id||(!gor.has(x.id)&&ayniKisi(x,p)));es.forEach(x=>gor.add(x.id));
    if(es.length<2){out.push(p);return;}es.sort((a,b)=>String(a.giris||ilkGun(a)||'').localeCompare(String(b.giris||ilkGun(b)||'')));
    const rep=es.find(x=>employed(x,son))||es[es.length-1];if(wid===S.hafta)CZ_ES[rep.id]=es;out.push(rep);});
  L=out.map(p=>gorevAyda(p,gosterAy(wid)));const sira=id=>{const L2=CZ_ES[id]||[{id}];return Math.min(...L2.map(x=>{const k=ids.indexOf(x.id);return k<0?999:k;}));};
  return L.sort((a,b)=>GRUP_SIRA.indexOf(a.grup||'K')-GRUP_SIRA.indexOf(b.grup||'K')||sira(a.id)-sira(b.id));}
function ayKadroIds(ak,H=S.haftalar){const[y,m]=ak.split('-').map(Number);const set=new Set();const last=new Date(y,m,0);
  for(let w=parse(mondayOf(new Date(y,m-1,1)));w<=last;w=addDays(w,7)){const k=kadroDoc(ymd(w),H);if(k)k.forEach(id=>set.add(id));}return set;}
function ayKadrosu(ak){const ids=ayKadroIds(ak);return S.personel.filter(p=>ids.has(p.id)&&aktifAyda(p,ak));}
// Bu şubede çalışılan saat ve izinlerin aylık özeti (diğer şubelerin puantajı için kaydedilir).
function subeOzeti(ak,sid=S.subeId){const sb=subeAyari(sid,ak);const out={};ayKadrosu(ak).forEach(p=>{const a=ayHesap(p,ak,sb);
  out[p.id]={saat:Math.round(a.h*100)/100,fm:Math.round((a.part?a.fmHam:a.fm)*100)/100,gun:a.gun,bos:a.bos,R:a.kod.R||0,UI:a.kod.UI||0,YI:a.kod.YI||0,B:a.kod.B||0,D:a.kod.D||0,g:gunHaritasi(p,ak)};});return out;}
// Kişinin aydaki gün gün çizelgesi {"2026-10-05":"10:00-15:00" | "B" | "R" ...}: şubeler arası tekrar ve çakışma kontrolü için.
function gunHaritasi(p,ak,H=S.haftalar){const[y,m]=ak.split('-').map(Number);const g={};
  for(let d=new Date(y,m-1,1);d.getMonth()===m-1;d=addDays(d,1)){if(!employed(p,d))continue;const v=cellOf(p.id,mondayOf(d),(d.getDay()+6)%7,H);if(isShift(v)||(v&&KOD[v]))g[ymd(d)]=v;}return g;}
const IZIN_KODLARI=['R','UI','YI'];
// Aynı kişi mi: iki kayıtta da TC varsa TC, yoksa ad soyad.
function ayniKisi(a,b){if(a.tc&&b.tc)return a.tc===b.tc;return isimAnahtar(a.ad)===isimAnahtar(b.ad);}
const sgkVar=p=>!!(p.sgkSube&&p.sgkSube!==SGK_YOK);
// SGK girişi boş olan kayıt, aynı kişinin başka kaydında SGK girişi varsa gerçek SGK kaydı değildir (çift SGK günü sayılmaz).
const sgkYansiKayit=p=>sgkVar(p)&&!p.giris&&S.personel.some(x=>x.id!==p.id&&sgkVar(x)&&x.giris&&ayniKisi(x,p));
// SGK şube değişikliği: aynı kişinin bu ay farklı şubelerde (farklı tarihlerde) SGK kaydı. En son girişli kayıt başta.
function sgkGecisGrubu(p,ak){if(!sgkVar(p))return[];const L=S.personel.filter(x=>sgkVar(x)&&aktifAyda(x,ak)&&(x.id===p.id||(ayniKisi(x,p)&&x.sgkSube!==p.sgkSube)));
  if(L.length<2)return[];return L.sort((a,b)=>String(b.giris||'').localeCompare(String(a.giris||'')));}
function vardiyaAralik(v){const[a,b]=v.split('-');const s=tnum(a);let e=tnum(b);if(e<=s)e+=24;return[s,e];}
// Birden fazla şubenin gün haritasını birleştirir: aynı gün aynı kod bir kez sayılır; saat çakışması ve izinliyken çalışma bulunur.
// kaynaklar: [{sube, g, sayac}] — g yoksa (eski özet) sayac olduğu gibi eklenir.
function gunBirlestir(kaynaklar,filtre=null){const tarih={R:new Set(),UI:new Set(),YI:new Set(),B:new Set()};const ek={R:0,UI:0,YI:0,B:0};const gunler={};
  kaynaklar.forEach(k=>{if(!k.g){Object.keys(ek).forEach(c=>ek[c]+=(k.sayac&&k.sayac[c])||0);return;}
    Object.entries(k.g).forEach(([d,v])=>{if(filtre&&!filtre(d))return;if(tarih[v])tarih[v].add(d);(gunler[d]=gunler[d]||[]).push({sube:k.sube,v});});});
  const cakisma=[];Object.keys(gunler).sort().forEach(d=>{const L=gunler[d];if(L.length<2)return;const vard=L.filter(x=>isShift(x.v)),izin=L.filter(x=>IZIN_KODLARI.includes(x.v));let sorun=false;
    for(let i=0;i<vard.length&&!sorun;i++)for(let j=i+1;j<vard.length;j++){const[a1,b1]=vardiyaAralik(vard[i].v),[a2,b2]=vardiyaAralik(vard[j].v);if(a1<b2&&a2<b1){sorun=true;break;}}
    if(!sorun&&vard.length&&izin.length)sorun=true;
    if(sorun){const t=parse(d);cakisma.push(`${t.getDate()} ${AYK[t.getMonth()]}: `+L.map(x=>`${subeAdi(x.sube)} ${isShift(x.v)?x.v:KOD[x.v].ad.toLocaleLowerCase('tr-TR')}`).join(' · '));}});
  const say={};Object.keys(tarih).forEach(c=>say[c]=tarih[c].size+ek[c]);return{say,cakisma};}
// Puantaj sol tarafı. Maaş (bordro günü, izinler) kişinin SGK şubesinde; fazla mesai çalıştığı her şubede ayrı.
function solHesap(ak,sid=S.subeId,diger=S.pt.ozetler||{},ekIds=[]){const sb=subeAyari(sid,ak);const out={};const burada=subeOzeti(ak,sid);
  const ids=new Set(Object.keys(burada));ekIds.forEach(x=>{if(S.personel.some(p=>p.id===x))ids.add(x);});S.personel.forEach(p=>{if((maasSubesi(p)===sid||odemeSubesi(p,ak)===sid)&&aktifAyda(p,ak))ids.add(p.id);});
  // Aynı kişi birden fazla şubenin listesinde ayrı kayıtla olabilir (SGK'sı burada): tek satırda birleşir. Aynı kişi: iki kayıtta da TC varsa TC, yoksa ad soyad
  // (aynı isimli ama TC'si farklı iki kişi ayrı satırda kalır).
  const esler={};const grp=[];[...ids].forEach(pid=>{const p=S.personel.find(x=>x.id===pid);if(!p)return;const g=grp.find(L=>L.some(x=>ayniKisi(x,p)));if(g)g.push(p);else grp.push([p]);});
  // Satırın asıl kaydı: SGK'sı burada olan (birden fazlaysa bu ay SGK'lı olan), sonra çalıştığı şube burada olan.
  grp.forEach(L=>{if(L.length<2)return;const sg=x=>aktifAyda(x,ak)&&sgkVar(x)?1:0;
    L.sort((a,b)=>sg(b)-sg(a)||(maasSubesi(b)===sid)-(maasSubesi(a)===sid)||String(b.giris||'').localeCompare(String(a.giris||''))||(b.anaSube===sid)-(a.anaSube===sid));esler[L[0].id]=L.map(x=>x.id);L.slice(1).forEach(x=>ids.delete(x.id));});
  const[y,m]=ak.split('-').map(Number);const last=new Date(y,m,0);
  ids.forEach(pid=>{const p0=S.personel.find(x=>x.id===pid);if(!p0)return;const p=gorevAyda(p0,ak);const pids=esler[pid]||[pid];const o={saat:0,fm:0,gun:0,bos:0,R:0,UI:0,YI:0,B:0};
    pids.forEach(q=>{const b=burada[q];if(b)Object.keys(o).forEach(k=>o[k]+=b[k]||0);});const tg=sgkGecisGrubu(p,ak);const maasKaydi=tg.length?tg[0]:p;// şube değişikliği olan ayda maaş tek kayıtta (son SGK girişi)
    // Maaş, maaş kaydının ödendiği şubedeki satırda ödenir; o satırın kaydı aynı kişinin eski SGK kaydı olsa da (ör. SGK şubesi değişti, kişi aynı şubede çalışıyor).
    const odemeSid=odemeSubesi(maasKaydi,ak);const maasBurada=odemeSid===sid;const muhBurada=maasSubesi(p)===sid;const tumGun=maasBurada||muhBurada;
    const t={R:o.R,UI:o.UI,YI:o.YI,B:o.B,saat:o.saat,baska:[],cakisma:[]};
    // SGK'lı kaydın ardından aynı kişi SGK'sız devam ediyorsa (ör. 21'inde SGK çıkış, 29'una kadar fiili çalışma): bordro günü SGK'lı günlere göre, hak edilen gün fiili çalışılan tüm günlere göre.
    const fiiliP=pids.map(q=>S.personel.find(x=>x.id===q)).filter(Boolean);const sgkDisi=sgkVar(p)&&fiiliP.some(x=>x.id!==p.id&&!sgkVar(x)&&aktifAyda(x,ak));
    const fiiliGrup=tg.length||sgkDisi?[...new Map([...tg,...(sgkDisi?fiiliP:[])].map(x=>[x.id,x])).values()]:[];
    const tumPid=[...new Set([...pids,...tg.map(x=>x.id)])];
    const kaynak=[];tumPid.forEach(q=>{const b=burada[q];if(b)kaynak.push({sube:sid,g:b.g,sayac:b});});
    if(tumGun)Object.entries(diger).forEach(([s2,k])=>{if(s2===sid||!k)return;let var_=false;tumPid.forEach(q=>{const x=k[q];if(!x)return;var_=true;kaynak.push({sube:s2,g:x.g,sayac:x});t.saat+=x.saat||0;});if(var_)t.baska.push(subeAdi(s2));});
    // İzin, rapor ve bayram: aynı gün iki şubede yazılsa da 1 gün sayılır.
    // Muhasebe: sadece bu kaydın SGK'lı olduğu günler (şube değişikliğinde her gün o tarihteki SGK şubesine gider).
    let tH={R:0,UI:0};
    if(kaynak.length){const bl=gunBirlestir(kaynak,sgkVar(p)?(d=>sgkli(p,parse(d))):null);t.R=bl.say.R;t.UI=bl.say.UI;t.YI=bl.say.YI;t.B=bl.say.B;t.cakisma=gunBirlestir(kaynak).cakisma;
      tH=fiiliGrup.length?gunBirlestir(kaynak,d=>fiiliGrup.some(x=>employed(x,parse(d)))).say:t;}
    // SGK şubesi ay içinde değişen kişi: işçilikte iki kaydın SGK günleri maaş şubesinde birlikte sayılır, tek kayıt gibi en çok 30 (31 günlük maaş yok).
    const tgS=tg.filter(x=>!sgkYansiKayit(x));let ist=0,istF=0,istS=0;for(let d=new Date(y,m-1,1);d<=last;d=addDays(d,1)){if(sgkVar(p)&&!sgkYansiKayit(p)&&sgkli(p,d))ist++;/* SGK şubesi 'Boş' ise SGK günü yok */if(fiiliGrup.length?fiiliGrup.some(x=>employed(x,d)):employed(p,d))istF++;if(tgS.some(x=>sgkli(x,d)))istS++;}
    const eS=tg.length?(()=>{const b=kaynak.length?gunBirlestir(kaynak,d=>tgS.some(x=>sgkli(x,parse(d)))).say:t;return(b.R||0)+(b.UI||0);})():0;
    const gun=sgkGunSayisi(ist,last.getDate(),t.R+t.UI);const hakGun=sgkGunSayisi(istF,last.getDate(),tH.R+tH.UI);const part=p.sekil==='Part';const iscGun=tg.length&&maasBurada&&!part?sgkGunSayisi(istS,last.getDate(),eS):null;
    out[pid]={ad:p.ad,maasBurada,sgkSube:p.sgkSube===SGK_YOK?'':p.sgkSube?subeAdi(p.sgkSube):subeAdi(p.anaSube),sekil:p.sekil||'Tam',gorev:p.gorev||'',grup:p.grup||'K',giris:p.giris||'',cikis:p.cikis||'',
      rapor:tumGun?t.R:0,ucretsiz:tumGun?t.UI:0,yillik:tumGun?t.YI:0,bayram:tumGun?t.B:0,muhBurada,odemeSube:subeAdi(odemeSid),odemeSid,partGun:0,// part gün elle, veri girişinden
      gunTaban:{ist,istF,takvim:last.getDate(),e:t.R+t.UI,eH:tH.R+tH.UI,...(iscGun!=null?{iS:istS,eS}:{})},...(iscGun!=null?{iscGun}:{}),// veri girişindeki rapor / ücretsiz izin gün sayısını aynı kuralla düşürmek için
      muhSekil:p.sekil||'Tam',
      fmSaat:o.fm,calisilanSaat:o.saat,gun:tumGun?gun:0,hakGun:tumGun?hakGun:0,// part: bordro günü = part gün (veri girişinden); girilmemişse normal gün
      baslama:p.baslama&&p.baslama<(p.giris||'9')?p.baslama:'',sgkDisi:sgkDisi?1:0,bosGun:o.bos,baska:t.baska,cakisma:t.cakisma,sgkYok:p.sgkSube===SGK_YOK};});
  return out;}
// Muhasebeye giden tarafta sadece SGK'sı bu şubede olanlar; başka şubenin SGK'lısı ve SGK'sı olmayanlar sadece ödemelerde.
// Muhasebede görev adı: kuryeler muhasebenin kullandığı şekilde "Sürücü" yazılır
function muhGorev(sol){const g=sol.gorev||'';return /kurye/i.test(g)?'Sürücü':g;}
function muhasebedeMi(sol){if(sol.sekil==='Esnaf kurye')return false;/* esnaf kurye muhasebede (liste, kontrol, PDF) görünmez; sadece Ödemeler tarafında */const g=sol.gunTaban;if(g&&g.ist===0&&!g.iS)return false;/* ay içinde hiç SGK günü yok (SGK girişi sonraki ayda): muhasebede görünmez, ödemelerde kalır */return (sol.muhBurada!=null?sol.muhBurada:sol.maasBurada!==false)&&sol.sgkYok!==true;}
// Fazla mesai saat ücreti. "Maaşına göre": net ÷ 30 ÷ 9; Eylül 2026'dan itibaren küsurat atılır (37.000 → 137), eski aylar kuruşlu kalır.
const FM_KUSURAT_AYI='2026-09';
// Sabit ücretli şubede kişiye özel saat ücreti varsa o geçerli (aya göre, maaslar/{şube}.fmOzelGecmis).
function fmKisiUcreti(sb,n,us){return sb.fmYontem!=='maas'&&sayi(us&&us.fmOzel)>0?sayi(us.fmOzel):fmSaatUcreti(sb,n,us&&us.ak);}
function fmSaatUcreti(sb,n,ak){if(sb.fmYontem!=='maas')return sayi(sb.fmUcret);if(!n)return 0;const h=n/30/9;return(ak&&ak>=FM_KUSURAT_AYI)?Math.floor(h+1e-9):h;}
// Puantaj sağ tarafı (ödemeler).
// kapi: açık (onaylanmamış) ayda çizelgeden gelen fazla mesai ve saatlik çalışma saati, Veri girişinde onaylanmadan hesaba girmez.
// Onay sag[pid].otoOnay = {fm: saat, sa: saat}; çizelge değişip saat farklılaşınca onay kendiliğinden düşer. Onaylı / kesin ayda kapı yok.
// Kilitli (onaylı) ya da kesin ayda çizelgeden gelenler onaylı sayılır; açık ayda onay bekler.
const otoKapi=(ak,kilitli,kesin)=>!kilitli&&!kesin;
const otoAyni=(a,b)=>a!=null&&Math.abs(sayi(a)-(b||0))<0.005;
function sagHesap(pid,sol,sag,net,sb,devir,ek={},us={},kapi=false){const e=k=>ek[k]||0;if(typeof us==='boolean')us={tip:us?'paket':'maas'};const tip=us.tip||'maas';let pb=tip==='paket';const saat=tip==='saat'&&!(sol.sekil==='Esnaf kurye');const s0=sag||{};const devirAvans=devir<0?-devir:0;const araOdeme=e('AO');const s={...s0,avans:sayi(s0.avans)+e('AV')+devirAvans,paketPrimi:sayi(s0.paketPrimi)+e('PP'),ciroPrimi:sayi(s0.ciroPrimi)+e('CP'),paketSayisi:sayi(s0.paketSayisi)+e('PS')};const esnaf=sol.sekil==='Esnaf kurye';
  const bankaya=sayi(s.bankaya)+e('BY'),paketPrimi=sayi(s.paketPrimi),ciroPrimi=sayi(s.ciroPrimi),avans=sayi(s.avans);
  let hak=0,maasFarki=0,fmTl=0,paketHak=0;const on=s0.otoOnay||{},rd=s0.otoRed||{};let fmBekle=false,saBekle=false,fmRed=false,saRed=false;
  // Reddedilen (otoRed, aynı saat için) ödenmez ama beklemez; çizelge değişince yeniden karar bekler.
  // Açıkça reddedilen (aynı saat) ay kilitlense de ödenmez; karar verilmemiş olan kilitli ayda onaylı sayılır.
  const fmS=()=>{const h=sol.fmSaat||0;if(Math.abs(h)<=0.004||otoAyni(on.fm,h))return h;if(otoAyni(rd.fm,h)){fmRed=true;return 0;}if(kapi){fmBekle=true;return 0;}return h;};const saS=()=>{const h=sol.calisilanSaat||0;if(h<=0.004||otoAyni(on.sa,h))return h;if(otoAyni(rd.sa,h)){saRed=true;return 0;}if(kapi){saBekle=true;return 0;}return h;};
  if(esnaf){paketHak=sayi(s.paketSayisi)*sayi(s.paketUcret);hak=paketHak;maasFarki=paketHak-bankaya;}
  else if(saat){hak=(saS()+e('SA'))*sayi(us.saatUcret);maasFarki=hak-bankaya;fmTl=0;}
  else if(pb){hak=0;maasFarki=0;fmTl=0;/* paket başı: kazanç paket primi sütununda; fazla mesai yok */}
  else if(sol.maasBurada===false){const n=sayi(net);const fm=fmS()/* eksi mesai de işlenir */;fmTl=fm*(sb.fmYontem==='maas'&&s.fmMod==='elle'&&s.fmBirim!==undefined?sayi(s.fmBirim):fmKisiUcreti(sb,n,us));}
  else{const n=sayi(net);const hg=sol.hakGun!=null?sol.hakGun:sol.gun;const bg=sol.bayram||0;/* bayramda çalışılan her gün için +1 gün ücret */hak=n?n*(hg+bg)/30:0;maasFarki=n?hak-bankaya:0;
    const fm=fmS()/* eksi mesai de işlenir */;fmTl=fm*(sb.fmYontem==='maas'&&s.fmMod==='elle'&&s.fmBirim!==undefined?sayi(s.fmBirim):fmKisiUcreti(sb,n,us));}
  const maasYok=!esnaf&&!saat&&!pb&&sol.maasBurada===false;const bank2=maasYok?0:bankaya;
  fmTl+=e('FMT');maasFarki+=e('MF');const ekOd=e('EK')-e('KS');const pp=paketPrimi;const pbBanka=pb&&!esnaf?bankaya:0;const kalanHam=maasFarki+fmTl+pp+ciroPrimi-avans-araOdeme+ekOd-pbBanka;const kalan=Math.round(kalanHam/5)*5||0;// kuruş ödenmez: 5 TL'ye yuvarla
  return{esnaf,maasYok,pb:pb&&!esnaf,saat,saatSayi:(saBekle?0:(sol.calisilanSaat||0))+e('SA'),otoBekle:fmBekle||saBekle?{fm:fmBekle?(sol.fmSaat||0):null,sa:saBekle?(sol.calisilanSaat||0):null}:null,otoRed:fmRed||saRed?{fm:fmRed,sa:saRed}:null,cizelgeSaat:sol.calisilanSaat||0,saatUcret:sayi(us.saatUcret),bankaya:bank2,paketPrimi:pp,kalanHam,ciroPrimi,avans,araOdeme,devirAvans,hak,maasFarki,fmTl,paketHak,devir,kalan,ekOd,netYok:!esnaf&&!maasYok&&!pb&&!saat&&!sayi(net)};}

/* ================= Yazma ================= */
const kuyruk={};function sirayla(key,fn){kuyruk[key]=(kuyruk[key]||Promise.resolve()).then(fn).catch(yazmaHatasi);return kuyruk[key];}
function yazmaHatasi(e){console.error(e);const c=e&&e.code||'';
  if(c.includes('permission'))toast('Bu işlem için yetkiniz yok.');else if(c.includes('unavailable'))toast('Bağlantı yok. İnternet gelince tekrar deneyin.');else toast('Kaydedilemedi: '+(e.message||c));}
const gerekliSube=sid=>{if(!sid)throw new Error('Şube belirtilmeden yazma engellendi');return sid;};
const weekRef=(wid,sid)=>doc(db,'subeler',gerekliSube(sid),'haftalar',wid);
/* ================= Düzenleme kilidi ================= */
// Aynı anda tek kişi düzenler: çizelgede şube + hafta, puantajda şube + ay. Bakmak serbesttir.
// Kilit ilk değişiklikte alınır; son işlemden 2 dakika sonra (ya da sayfadan çıkınca, uygulama arka plana geçince) kendiliğinden düşer. İşveren her kilidi, bölge müdürü şube müdürününkini devralabilir.
const KILIT_SN=120,KILIT_TAZE=30000;
const KL={key:null,k:null,d:null,unsub:null,zT:null,benim:{}};
const czK=(wid,sid)=>({tur:'cz',sube:gerekliSube(sid),donem:wid});
const ptK=(sid=S.subeId,ak=S.ay)=>({tur:'pt',sube:sid,donem:ak});
const kilitId=k=>k.tur+'__'+k.sube+'__'+k.donem;
function kilitAnahtar(){if(!S.user||!S.me||!S.subeId)return null;
  if(S.tab==='cizelge'&&S.hafta)return czK(S.hafta,S.subeId);
  if(S.tab==='puantaj'&&S.pt.sube&&S.pt.sube===S.subeId&&S.ay)return ptK();
  return null;}
function kilitMs(d){const t=d&&d.t;return t&&t.toMillis?t.toMillis():0;}
// Bu sayfanın kilidi başkasındaysa kilit kaydı, değilse null.
function kilitBaskasi(){const d=KL.d;if(!d||!S.user||d.uid===S.user.uid)return null;return Date.now()-kilitMs(d)<KILIT_SN*1000?d:null;}
function kilitMesaj(d=KL.d){const ad=(d&&d.ad)||'Başka bir kullanıcı';return `${ad} şu an burada düzenleme yapıyor. Değişiklik kaydedilmedi; o bitirince ya da 2 dakika işlem yapmayınca düzenleyebilirsiniz.`;}
// Sayfadaki düzenleme başkasındaysa uyarır ve true döner.
function kilitEngel(){const d=kilitBaskasi();if(!d)return false;toast(kilitMesaj(d));return true;}
function kilitTakip(){const k=kilitAnahtar();const id=k?kilitId(k):null;if(id===KL.key)return;
  if(KL.unsub){KL.unsub();KL.unsub=null;}clearTimeout(KL.zT);kilitBirak();KL.key=id;KL.k=k;KL.d=null;if(!id)return;
  KL.unsub=onSnapshot(doc(db,'kilitler',id),s=>{const b0=kilitBaskasi(),once=b0?b0.uid:'';KL.d=s.exists()?s.data({serverTimestamps:'estimate'}):null;
    if(KL.d&&S.user&&KL.d.uid!==S.user.uid)delete KL.benim[id];
    clearTimeout(KL.zT);const b=kilitBaskasi();if(b)KL.zT=setTimeout(()=>render(),Math.max(1000,kilitMs(b)+KILIT_SN*1000-Date.now()+1500));
    if(once!==(b?b.uid:''))render();},()=>{KL.d=null;});}
// Kilidi alır ya da tazeler. Başkasındaysa false. Bağlantı hatasında düzenlemeyi engellemez (kayıt zaten birleştirerek yazılır).
async function kilitAl(k,zorla=false){if(!k||!S.user)return true;const id=kilitId(k);const ref=doc(db,'kilitler',id);
  if(!zorla&&KL.benim[id]&&Date.now()-KL.benim[id]<KILIT_TAZE)return true;
  if(!zorla&&id===KL.key&&kilitBaskasi())return false;
  if(navigator.onLine===false)return true;// internet yok: kilit alınamaz, kayıt telefonda sıraya girer
  try{const ok=await fsRunTransaction(db,async tr=>{const s=await tr.get(ref);const x=s.exists()?s.data():null;
      if(x&&x.uid!==S.user.uid&&!zorla&&isIsveren()&&Date.now()-kilitMs(x)<KILIT_SN*1000)return false;
      tr.set(ref,{tur:k.tur,sube:k.sube,donem:k.donem,uid:S.user.uid,ad:benAd()||S.user.email||'',rol:rol(),t:serverTimestamp()});return true;});
    if(ok)KL.benim[id]=Date.now();else delete KL.benim[id];return ok;}
  catch(e){const c=(e&&e.code)||'';console.error(e);if(!c.includes('permission'))return true;
    // Yetki hatası: kilit başkasındaysa engelle; kilit okunamıyorsa (kurallar henüz yayınlanmamış) düzenlemeyi durdurma.
    try{const s=await getDoc(ref);const x=s.exists()?s.data():null;if(x&&x.uid!==S.user.uid){delete KL.benim[id];if(id===KL.key)KL.d=x;return false;}}catch(_){}
    return true;}}
async function kilitliMi(k){if(await kilitAl(k))return false;toast(kilitMesaj());return true;}
// Bende olan kilitleri bırakır (başkası devraldıysa dokunmaz).
function kilitBirak(){const ids=Object.keys(KL.benim);KL.benim={};if(!S.user)return;const uid=S.user.uid;
  ids.forEach(id=>{const ref=doc(db,'kilitler',id);fsRunTransaction(db,async tr=>{const s=await tr.get(ref);if(s.exists()&&s.data().uid===uid)tr.delete(ref);}).catch(()=>{});});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')kilitBirak();});
window.addEventListener('pagehide',()=>kilitBirak());
async function kilitDevral(){if(!KL.k)return;if(await kilitAl(KL.k,true)){toast('Düzenleme size geçti.');render();}else toast('Devralınamadı, tekrar deneyin.');}
// İşveren her kilidi, bölge müdürü şube müdürünün kilidini devralabilir.
function kilitDevralabilir(d){return isIsveren()||(isBolge()&&d&&d.rol==='sube');}
function kilitBandi(){const d=kilitBaskasi();if(!d)return'';const ne=KL.k.tur==='pt'?'bu ayın puantajını':'bu haftanın çizelgesini';
  return `<div class="banner kilit"><b>🔒 ${esc(d.ad||'Başka bir kullanıcı')} şu an ${ne} düzenliyor.</b> Siz sadece bakabilirsiniz. O sayfadan çıkınca ya da 2 dakika işlem yapmayınca düzenleme açılır.${kilitDevralabilir(d)?`<div style="margin-top:8px"><button class="btn" id="kilitDevral">Kilidi devral</button></div>`:''}</div>`;}
function kilitUygula(){const d=kilitBaskasi();if(!d)return;const v=byId('view');if(!v)return;
  v.querySelectorAll(KL.k.tur==='pt'?'#vGrid input,#vGrid select,#vGrid textarea,[data-bk],#vSatir,#vSatir10,[data-sil]':'button.cell').forEach(x=>{x.disabled=true;});
  const b=byId('kilitDevral');if(b)b.onclick=kilitDevral;}
function undoKaydet(wid){const w0=S.haftalar[wid]||{};undo.push({wid,cells:JSON.parse(JSON.stringify(w0.cells||{})),kadro:Array.isArray(w0.kadro)?w0.kadro.slice():null});if(undo.length>40)undo.shift();}
// Haftanın durumu: acik (şube düzenler) · kapali (şube kapattı, bölge onayı bekliyor) · onay (bölge onayladı). Şube müdürü kapalı haftayı göremez.
function haftaDurumu(wid,H=S.haftalar){const w=H[wid];if(w&&w.hd)return w.hd;const d=(S.haftaDurum.w||{})[wid];return H===S.haftalar&&d&&d.d?d.d:'acik';}
// Hücre yazarken haftanın durumu (hd): şube müdürü her zaman 'acik' yazar (kapalı haftaya kurallar zaten izin vermez).
// Bölge müdürü / işveren var olan haftanın durumuna dokunmaz; sadece yeni açılan haftaya 'acik' yazar. Yazma anında (çağrıldığı an) hesaplanır.
const hdAlani=wid=>isSube()||!S.haftalar[wid]?{hd:'acik'}:{};
// Şube verisi sunucudan tam yüklendi mi (önbellekten değil): özet, onay ve kapatma hesapları buna göre yapılır.
// Haftanın hesabında kullanılan ay ayarı: puantajın haftayı saydığı ay (haftalık dönemde pazartesinin ayı).
const haftaAyari=wid=>subeAyari(S.subeId,fmAyi(wid,subeAyari(S.subeId,gosterAy(wid))));
const sunucuHazir=sid=>!!sid&&S.subeId===sid&&S.loaded.haftalar&&S.haftalarSunucu&&S.loaded.personel;
function hazirDegil(){return new Error('Şube verileri tam yüklenmeden ya da işlem sırasında şube değiştiği için işlem yapılmadı. Tekrar deneyin.');}
// Tek hücreye yazmadan önce kontrol: saat kuralı ve aynı gün başka şube.
function hucreKontrol(p,wid,i,val,sessiz){const d=weekDays(wid)[i];if(val==='CG'&&!(p&&p.sekil==='Part')){if(!sessiz)toast('"Part boş" sadece part-time personelde seçilebilir.');return false;}if(isShift(val)){const k=vardiyaKontrol(val,sube(),d);if(!k.ok){if(!sessiz)toast(k.neden);return false;}}
  if(val&&p&&cokSubeli(p)){const c=gunCakisir(val,digerGunler(p,d));if(c){if(!sessiz)toast(cakismaMesaj(p,ymd(d),c));return false;}}return true;}
function setCell(pid,wid,i,val){const sid=S.subeId;const hdA=hdAlani(wid);if(haftaDurumu(wid)!=='acik'){toast('Bu hafta kapalı. Düzenlemek için önce "Kilidi aç"a basın.');return Promise.resolve(false);}if(wid===S.hafta&&kilitEngel())return Promise.resolve(false);const p=S.personel.find(x=>x.id===pid);if(!hucreKontrol(p,wid,i,val))return Promise.resolve(false);
  const w0=S.haftalar[wid]||{};const kad=kadroOf(wid).ids.slice();const kadVardi=kad.includes(pid);if(!kadVardi)kad.push(pid);undoKaydet(wid);const eski=cellOf(pid,wid,i);
  // Liste: hafta kayıtlıysa kişi sadece eklenir (sunucudaki listeye dokunmadan); yeni haftada önerilen liste yazılır.
  const kadAlan=S.haftalar[wid]&&Array.isArray(S.haftalar[wid].kadro)?(kadVardi?{}:{kadro:arrayUnion(pid)}):{kadro:kad};
  const w=S.haftalar[wid]={...w0,kadro:kad,cells:{...(w0.cells||{})}};w.cells[pid]={...(w.cells[pid]||{}),[String(i)]:val};render();const ds=ymd(weekDays(wid)[i]);
  return sirayla(sid+'|'+wid,async()=>{if(!(await kilitAl(czK(wid,sid)))){if(S.subeId===sid){S.haftalar[wid]=w0;undo.pop();render();toast(kilitMesaj());}return false;}
    if(p&&cokSubeli(p)&&(val||eski)){let c=null;try{c=await gunYaz(p,ds,val,sid);}catch(e){console.error(e);toast('Bu hücre diğer şubeye işlenemedi, tekrar dene.');}
      if(c){if(S.subeId===sid){const w1=S.haftalar[wid];if(w1&&w1.cells&&w1.cells[pid])w1.cells[pid][String(i)]=eski;undo.pop();render();toast(cakismaMesaj(p,ds,c));}return false;}}
    arka(setDoc(weekRef(wid,sid),{hafta:wid,ay2:ayKey(addDays(parse(wid),6)),...hdA,...kadAlan,cells:{[pid]:{[String(i)]:val}}},{merge:true}));kapaliHaftaGuncelle(wid,sid);return true;});}
// Birden çok hücre: saat kuralına ya da aynı gün kuralına uymayan hücreler eski değerinde kalır, sayısı döner.
function setWeek(wid,cells,kadro,pushUndo=true){const DEL_ALAN=deleteField();const sid=S.subeId;const hdA=hdAlani(wid);if(haftaDurumu(wid)!=='acik'){setTimeout(()=>toast('Bu hafta kapalı. Düzenlemek için önce "Kilidi aç"a basın.'),60);return 0;}if(wid===S.hafta&&kilitBaskasi()){setTimeout(()=>toast(kilitMesaj()),60);return 0;}
  const w0=S.haftalar[wid]||{};const eskiC=w0.cells||{};const ds=weekDays(wid);let red=0;const degisen=[];
  Object.keys({...eskiC,...cells}).forEach(pid=>{const p=S.personel.find(x=>x.id===pid);for(let i=0;i<7;i++){const a=(eskiC[pid]||{})[String(i)]??null,b=(cells[pid]||{})[String(i)]??null;if(a===b)continue;
    if(b&&!hucreKontrol(p,wid,i,b,true)){red++;if(cells[pid])cells[pid][String(i)]=a;continue;}if(p&&cokSubeli(p))degisen.push([p,ymd(ds[i]),b]);}});
  if(pushUndo)undoKaydet(wid);const kad=kadro===undefined?kadroOf(wid).ids:kadro;
  // Sadece değişen hücreler yazılır: aynı anda başka birinin girdiği hücreler silinmez.
  const fark={};Object.keys({...eskiC,...cells}).forEach(pid=>{if(!(pid in cells)){if(pid in eskiC)fark[pid]=DEL_ALAN;return;}
    for(let i=0;i<7;i++){const a=(eskiC[pid]||{})[String(i)]??null,b=(cells[pid]||{})[String(i)]??null;if(a!==b)(fark[pid]=fark[pid]||{})[String(i)]=b;}});
  const kadDeg=!Array.isArray(w0.kadro)||JSON.stringify(w0.kadro)!==JSON.stringify(kad);
  S.haftalar[wid]={...w0,hafta:wid,kadro:kad,cells};render();
  sirayla(sid+'|'+wid,async()=>{if(!(await kilitAl(czK(wid,sid)))){if(S.subeId===sid){S.haftalar[wid]=w0;if(pushUndo)undo.pop();render();toast(kilitMesaj());}return;}
    // Çok şubeli kişide önce ortak gün kaydı yazılır; başka şubede o gün kaydı varsa (ekrandaki kontrol önbellekten geçmiş olsa da) hücre çizelgeye hiç yazılmaz, eski değerinde kalır.
    let geri=0,sonC=null;
    for(const[p,d,v]of degisen){let c=null;try{c=await gunYaz(p,d,v,sid);}catch(e){console.error(e);c={hata:1};}
      if(c){const i=ds.findIndex(x=>ymd(x)===d);const a=(eskiC[p.id]||{})[String(i)]??null;if(fark[p.id]&&fark[p.id]!==DEL_ALAN&&String(i) in fark[p.id]){delete fark[p.id][String(i)];if(!Object.keys(fark[p.id]).length)delete fark[p.id];}
        const w1=S.subeId===sid&&S.haftalar[wid];if(w1&&w1.cells){w1.cells[p.id]={...(w1.cells[p.id]||{}),[String(i)]:a};}geri++;if(!c.hata)sonC=[p,d,c];}}
    arka(setDoc(weekRef(wid,sid),{hafta:wid,ay2:ayKey(addDays(parse(wid),6)),...hdA,...(kadDeg?{kadro:kad}:{}),...(Object.keys(fark).length?{cells:fark}:{})},{merge:true}));
    if(geri&&S.subeId===sid){render();toast(sonC?`${geri} hücre yazılmadı: ${RED_NEDEN}. ${cakismaMesaj(...sonC)}`:'Bazı günler diğer şubeye işlenemedi, tekrar dene.');}kapaliHaftaGuncelle(wid,sid);});
  return red;}

const RED_NEDEN='şube saatleri dışında, yarım saat değil ya da kişi o gün başka şubede';

/* ================= Başlangıç ve oturum ================= */
function bootstrap(){if(tryLS('pm.yardim')==='1')document.body.classList.add('yardim-acik');
  if(!ayarliMi){view(`<div class="login"><div class="card"><h2>Kurulum gerekli</h2><p class="note" style="margin:6px 0 0">config.js dosyasına Firebase proje bilgilerini yapıştırın.</p></div></div>`);top('Puantaj Merkezi','Kurulum');return;}
  S.hafta=mondayOf(today());S.tab=tryLS('pm.tab')||'cizelge';
  try{const g=JSON.parse(tryLS('pm.gor')||'null');if(g){if(g.tk==='ay'||g.tk==='hafta')S.tkGorunum=g.tk;S.ptGeri=g.pt||null;}
  if(g&&g.d===ymd(today())){if(/^\d{4}-\d\d-\d\d$/.test(g.hafta||''))S.hafta=g.hafta;if(/^\d{4}-\d\d$/.test(g.ay||'')){S.ay=g.ay;S.ayElle=!!g.ayElle;}}}catch(e){} // aynı gün yenilenirse bakılan hafta/ay korunur
  onAuthStateChanged(auth,async u=>{S.user=u;temizle();
    if(!u){S.me=null;loginEkrani();return;}
    view(`<div class="empty-state"><b>Hesabınız yükleniyor</b></div>`);
    subs.me=onSnapshot(doc(db,'kullanicilar',u.uid),async s=>{S.meYuklendi=true;S.me=s.exists()?s.data():null;
      if(!S.me){try{const k=await getDoc(doc(db,'sistem','kurulum'));S.kurulumVar=k.exists();}catch(e){S.kurulumVar=true;}return hesapYok();}
      if(S.me.aktif!==true){return view(`<div class="login"><div class="card"><h2>Hesabınız kapalı</h2><p class="note">İşvereninizle görüşün.</p><button class="btn" id="outB">Çıkış yap</button></div></div>`,()=>byId('outB').onclick=()=>signOut(auth));}
      if(!subs.surum)subs.surum=onSnapshot(doc(db,'sistem','surum'),s=>{const min=(s.exists()&&+s.data().min)||0;S.eskiSurum=min>APP_SURUM;
          if(S.eskiSurum)return eskiSurumEkrani();if(isIsveren()&&min<APP_SURUM)fsSetDoc(doc(db,'sistem','surum'),{min:APP_SURUM,tarih:new Date().toISOString()},{merge:true}).catch(()=>{});},()=>{});
      subeleriDinle();},e=>{view(`<div class="banner bad">Hesap bilgisi okunamadı: ${esc(e.message)}</div>`);});});}
function eskiSurumEkrani(){byId('tabs').hidden=true;view(`<div class="login"><div class="card"><h2>Uygulama güncellendi</h2><p class="note">Bu ekrandaki sürüm eski; kayıtların doğru tutulması için yeni sürümü açın. Bekleyen değişiklikleriniz kaybolmaz.</p><div class="row2"><button class="btn primary grow" id="yenileB">Yenile</button></div></div></div>`,()=>byId('yenileB').onclick=()=>{location.replace(location.pathname+'?v='+Date.now());});}
function temizle(){if(KL.unsub){KL.unsub();KL.unsub=null;}clearTimeout(KL.zT);kilitBirak();KL.key=null;KL.k=null;KL.d=null;[...subs.sube,...subs.detay,...subs.liste,...subs.subeDocs,...subs.gun,...subs.tk].forEach(u=>u());subs.sube=[];subs.detay=[];subs.liste=[];subs.subeDocs=[];subs.gun=[];subs.tk=[];S.gunler={};S.tk={};S.tkKey=null;S.haftaDurum={w:{}};
  if(subs.me){subs.me();subs.me=null;}if(subs.users){subs.users();subs.users=null;}if(S.iscUnsub){S.iscUnsub();S.iscUnsub=null;S.iscKey=null;}if(S.iscSabitUnsub){S.iscSabitUnsub();S.iscSabitUnsub=null;S.iscSabit=null;}if(subs.surum){subs.surum();subs.surum=null;}S.subeler={};S.subeIds=[];S.subeId=null;S.personel=[];S.haftalar={};S.aylar={};S.loaded={personel:false,haftalar:false};S.gocBakildi=false;}
function loginEkrani(){top('Puantaj Merkezi','Giriş');byId('tabs').hidden=true;
  view(`<div class="login"><form class="card" id="lf"><h2>Giriş yap</h2><p class="note" style="margin:2px 0 6px">Kullanıcı adınız ve şifrenizle girin.</p>
   <label class="field"><span>Kullanıcı adı</span><input id="lk" autocomplete="username" autocapitalize="none" autocorrect="off" required></label>
   <label class="field"><span>Şifre</span><input id="lp" type="password" autocomplete="current-password" required></label>
   <div id="lerr"></div><div class="row2"><button class="btn primary grow" id="lb" type="submit">Giriş yap</button></div></form></div>`,()=>{
   byId('lf').onsubmit=async e=>{e.preventDefault();const k=byId('lk').value,p=byId('lp').value;const b=byId('lb');b.disabled=true;b.textContent='Giriş yapılıyor';
     try{await signInWithEmailAndPassword(auth,eposta(k),p);}catch(err){const c=err.code||'';
       byId('lerr').innerHTML=`<div class="confirm bad">${c.includes('too-many')?'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.':c.includes('network')?'İnternet bağlantısı yok.':'Kullanıcı adı ya da şifre hatalı.'}</div>`;
       b.disabled=false;b.textContent='Giriş yap';}};});}
function hesapYok(){top('Puantaj Merkezi','Hesap');byId('tabs').hidden=true;
  if(S.kurulumVar===false){view(`<div class="login"><div class="card"><h2>İlk kurulum</h2><p class="note">Sistemde henüz işveren yok. Bu hesap işveren olarak ayarlanacak ve tüm yetkilere sahip olacak.</p>
    <label class="field"><span>Ad soyad</span><input id="kAd" autocomplete="name"></label><div id="kErr"></div>
    <div class="row2"><button class="btn grow" id="kOut">Çıkış</button><button class="btn primary grow" id="kOk">İşveren olarak kur</button></div></div></div>`,()=>{
    byId('kOut').onclick=()=>signOut(auth);
    byId('kOk').onclick=async()=>{const ad=byId('kAd').value.trim();if(!ad){byId('kErr').innerHTML='<div class="confirm">Ad soyad gerekli.</div>';return;}
      const b=writeBatch(db);const uid=S.user.uid;const kadi=S.user.email.split('@')[0];
      b.set(doc(db,'kullanicilar',uid),{kullaniciAdi:kadi,adSoyad:ad,rol:'isveren',subeler:[],aktif:true,olusturma:new Date().toISOString()});
      b.set(doc(db,'sistem','kurulum'),{tarih:new Date().toISOString(),uid});
      try{await b.commit();toast('Kurulum tamamlandı.');}catch(e){byId('kErr').innerHTML=`<div class="confirm bad">Kurulum yapılamadı: ${esc(e.message)}</div>`;}};});return;}
  view(`<div class="login"><div class="card"><h2>Hesabınız tanımlı değil</h2><p class="note">Bu kullanıcı için yetki verilmemiş. İşvereninizden hesabınızı açmasını isteyin.</p><button class="btn" id="outB">Çıkış yap</button></div></div>`,()=>byId('outB').onclick=()=>signOut(auth));}

/* ================= Şubeler ================= */
function subeleriDinle(){subs.subeDocs.forEach(u=>u());subs.subeDocs=[];
  const bitti=()=>{S.subeIds=Object.keys(S.subeler).sort((a,b)=>String(S.subeler[a].ad).localeCompare(String(S.subeler[b].ad),'tr'));if(isIsveren())subeAdSenkron();
    gocKontrol();if(!S.subeId||!S.subeler[S.subeId]){const want=tryLS('pm.sube');const pick=S.subeIds.includes(want)?want:S.subeIds[0];if(pick)selectSube(pick);else render();}else render();};
  if(isIsveren()){subs.subeDocs.push(onSnapshot(collection(db,'subeler'),s=>{S.subeler={};s.docs.forEach(d=>S.subeler[d.id]=d.data());bitti();},e=>toast('Şubeler okunamadı.')));}
  else{const ids=(S.me.subeler||[]);if(!ids.length){S.subeler={};bitti();return;}let gelen=0;
    ids.forEach(id=>subs.subeDocs.push(onSnapshot(doc(db,'subeler',id),s=>{if(s.exists())S.subeler[id]=s.data();else delete S.subeler[id];gelen++;if(gelen>=ids.length)bitti();},()=>{gelen++;if(gelen>=ids.length)bitti();})));}
  personelDinle();
  subs.subeDocs.push(onSnapshot(doc(db,'sistem','subeAdlari'),s=>{S.subeAdlari=s.exists()?(s.data().adlar||{}):{};if(isIsveren())subeAdSenkron();},()=>{}));
  if(isSube())subs.subeDocs.push(onSnapshot(doc(db,'sistem','goc'),s=>{const v=!!(s.exists()&&s.data().v4);if(S.goc4!==v){S.goc4=v;render();}},()=>{}));
  // Bölge müdürü: sadece kendi yönettiği şube müdürleri ve onların şifre kayıtları (tek tek okunur).
  if(isBolge()&&!subs.users){const buid=S.user.uid;const dk={};S.sifreler={};S.sifreIstek={};
    const u1=onSnapshot(query(collection(db,'kullanicilar'),where('bolgeler','array-contains',buid)),s=>{S.users=s.docs.map(d=>({uid:d.id,...d.data()}));
      s.docs.forEach(d=>{if(dk[d.id])return;dk[d.id]=[onSnapshot(doc(db,'sifreler',d.id),x=>{if(x.exists())S.sifreler[d.id]=x.data();else delete S.sifreler[d.id];if(S.tab==='yonetim')render();},()=>{}),
        onSnapshot(doc(db,'sifreIstek',d.id),x=>{if(x.exists())S.sifreIstek[d.id]=x.data();else delete S.sifreIstek[d.id];if(S.tab==='yonetim')render();},()=>{})];});
      if(S.tab==='yonetim')render();},e=>{console.error(e);S.users=[];S.kulHata=true;if(S.tab==='yonetim')render();});
    subs.users=()=>{u1();Object.values(dk).forEach(a=>a.forEach(f=>f()));};}
  if(isIsveren()&&!subs.users){const u1=onSnapshot(collection(db,'kullanicilar'),s=>{S.users=s.docs.map(d=>({uid:d.id,...d.data()}));bolgeSenkron();if(S.tab==='yonetim')render();});
    const u2=onSnapshot(collection(db,'sifreler'),s=>{const m={};s.docs.forEach(d=>m[d.id]=d.data());S.sifreler=m;S.sifreHata=false;if(S.tab==='yonetim')render();},e=>{console.error(e);S.sifreler={};S.sifreHata=true;if(S.tab==='yonetim')render();});const u3=onSnapshot(collection(db,'sifreIstek'),s=>{const m={};s.docs.forEach(d=>m[d.id]=d.data());S.sifreIstek=m;if(S.tab==='yonetim')render();},()=>{S.sifreIstek={};});subs.users=()=>{u1();u2();u3();};}}
// Personel şube şube tutulur: herkes sadece kendi şubelerinin listesini okur. Bölge müdürü ayrıca SGK'sı kendi şubelerinde olanları görür (puantaj için).
function personelDinle(){const parca={};const yay=()=>{const m={};Object.values(parca).forEach(L=>L.forEach(p=>m[p.id]=p));S.personel=Object.values(m);S.loaded.personel=true;S.kuralHata=false;gocKontrol();render();};
  const hata=e=>{console.error(e);S.kuralHata=true;S.loaded.personel=true;render();};
  const dinle=(k,q)=>subs.subeDocs.push(onSnapshot(q,s=>{parca[k]=s.docs.map(d=>({id:d.id,...d.data()}));yay();},hata));
  if(isIsveren()){dinle('hepsi',collection(db,'personel'));return;}
  const ids=S.me.subeler||[];if(!ids.length){S.personel=[];S.loaded.personel=true;return;}
  ids.forEach(sid=>{dinle('a:'+sid,query(collection(db,'personel'),where('anaSube','==',sid)));dinle('s:'+sid,query(collection(db,'personel'),where('sgkSube','==',sid)));
    // Bu şubede de çalışan (çalıştığı şubesi / SGK'sı başka yerde) kişiler: şubenin ek personel listesinden tek tek okunur.
    const tekil={};subs.subeDocs.push(onSnapshot(doc(db,'ekPersonel',sid),s=>{const L=Object.keys((s.exists()&&s.data().ids)||{});
      L.forEach(pid=>{if(tekil[pid])return;tekil[pid]=1;subs.subeDocs.push(onSnapshot(doc(db,'personel',pid),d=>{parca['e:'+pid]=d.exists()?[{id:d.id,...d.data()}]:[];yay();},()=>{parca['e:'+pid]=[];}));});},()=>{}));});}
// Şube müdürlerinin "bolgeler" listesi (hangi bölge müdürleri yönetir): şube atamalarından hesaplanır; bölge müdürünün kuralları buna dayanır.
let bsT;function bolgeSenkron(){clearTimeout(bsT);bsT=setTimeout(async()=>{if(!isIsveren()||!S.users||S.bsBusy)return;const bm=S.users.filter(u=>u.rol==='bolge'&&u.aktif!==false);const b=writeBatch(db);let n=0;
  S.users.forEach(u=>{if(u.rol!=='sube')return;const hed=bm.filter(m=>(m.subeler||[]).some(x=>(u.subeler||[]).includes(x))).map(m=>m.uid).sort();const mev=(u.bolgeler||[]).slice().sort();
    if(JSON.stringify(hed)!==JSON.stringify(mev)){b.update(doc(db,'kullanicilar',u.uid),{bolgeler:hed});n++;}});
  if(!n)return;S.bsBusy=true;try{await b.commit();}catch(e){console.error(e);}finally{S.bsBusy=false;}},1200);}
let senkronT;function subeAdSenkron(){clearTimeout(senkronT);senkronT=setTimeout(()=>{const adlar={};Object.entries(S.subeler).forEach(([id,v])=>adlar[id]=v.ad);
  const a=JSON.stringify(Object.entries(adlar).sort()),b=JSON.stringify(Object.entries(S.subeAdlari||{}).sort());if(a!==b&&Object.keys(adlar).length)setDoc(doc(db,'sistem','subeAdlari'),{adlar}).catch(()=>{});},800);}
function tumSubeler(){const m={...S.subeAdlari};Object.entries(S.subeler).forEach(([id,v])=>m[id]=v.ad);return Object.entries(m).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'tr'));}
// Eski sürümde personel şube altında tutuluyordu; işveren ilk açılışta şirket geneli listeye taşır.
async function gocKontrol(){if(!isIsveren()||S.gocBakildi||!S.subeIds.length||!S.loaded.personel)return;S.gocBakildi=true;
  try{const g=await getDoc(doc(db,'sistem','goc'));const gd=g.exists()?g.data():{};
    // v3: isimler büyük harf
    if(!gd.v3){const L=S.personel.filter(p=>p.ad&&p.ad!==adBuyuk(p.ad));for(let i=0;i<L.length;i+=400){const b=writeBatch(db);L.slice(i,i+400).forEach(p=>{p.ad=adBuyuk(p.ad);b.set(doc(db,'personel',p.id),{ad:p.ad},{merge:true});});await b.commit();}
      await setDoc(doc(db,'sistem','goc'),{v3:true},{merge:true});if(L.length){toast(`${L.length} personelin adı büyük harfe çevrildi.`);render();}}
    // v4: haftalık kapatma. Haftalara durum yazılır: kapatılmış/onaylanmış aya ait haftalar "onay" (şube müdürüne gizlenir), diğerleri "acik".
    if(!gd.v4){let n=0;const t=new Date().toISOString();
      for(const sid of S.subeIds){const aq=await getDocs(collection(db,'subeler',sid,'aylar'));const ay={};aq.docs.forEach(d=>ay[d.id]=(d.data()||{}).durum);const kil=k=>['bolge_onay'].includes(ay[k]);
        const q=await getDocs(collection(db,'subeler',sid,'haftalar'));const b=writeBatch(db);const w={};let k=0;
        q.docs.forEach(d=>{const x=d.data()||{};if(x.hd)return;const wid=d.id;const hd=kil(wid.slice(0,7))&&kil(ayKey(addDays(parse(wid),6)))?'onay':'acik';
          b.set(doc(db,'subeler',sid,'haftalar',wid),{hd},{merge:true});k++;n++;if(hd==='onay')w[wid]={d:'onay',t,ad:'Sistem (eski kapatılmış ay)',k:Array.isArray(x.kadro)?x.kadro:Object.keys(x.cells||{})};});
        if(Object.keys(w).length)b.set(doc(db,'subeler',sid,'durum','haftalar'),{w},{merge:true});if(k)await b.commit();}
      await setDoc(doc(db,'sistem','goc'),{v4:true,v4Tarih:t},{merge:true});if(n)toast(`${n} haftaya kapatma durumu yazıldı.`);}
    if(gd.v2)return;const var_=new Set(S.personel.map(p=>p.id));let n=0;
    for(const sid of S.subeIds){const q=await getDocs(collection(db,'subeler',sid,'personel'));const b=writeBatch(db);let k=0;
      q.docs.forEach(d=>{if(var_.has(d.id))return;b.set(doc(db,'personel',d.id),{...d.data(),anaSube:sid});k++;n++;});if(k)await b.commit();}
    await setDoc(doc(db,'sistem','goc'),{v2:true,tarih:new Date().toISOString(),tasinan:n},{merge:true});if(n)toast(`${n} personel şirket geneli listeye taşındı.`);}catch(e){console.error(e);S.gocBakildi=false;}}
function selectSube(id){subs.sube.forEach(u=>u());subs.sube=[];S.tcler={};S.subeId=id;S.haftalar={};S.aylar={};S.haftaDurum={w:{}};S.loaded.haftalar=false;undo.length=0;SEL=null;MOD=null;tryLS('pm.sube',id);
  // Şube müdürü sadece açık haftaları okur (kapatılan hafta ona gizlidir); bölge müdürü ve işveren hepsini.
  const hq=isSube()?query(collection(db,'subeler',id,'haftalar'),where('hd','==','acik')):collection(db,'subeler',id,'haftalar');
  S.haftalarSunucu=false;subs.sube.push(onSnapshot(hq,{includeMetadataChanges:true},s=>{if(S.subeId!==id)return;const m={};s.docs.forEach(d=>m[d.id]=d.data());S.haftalar=m;S.loaded.haftalar=true;S.haftalarSunucu=!s.metadata.fromCache;render();},e=>yazmaHatasi(e)));
  subs.sube.push(onSnapshot(doc(db,'subeler',id,'durum','haftalar'),s=>{S.haftaDurum=s.exists()?{w:{},...s.data()}:{w:{}};render();},()=>{}));
  subs.sube.push(onSnapshot(collection(db,'subeler',id,'aylar'),s=>{const m={};s.docs.forEach(d=>m[d.id]=d.data());S.aylar=m;render();},()=>{}));
  render();}

/* ================= Çizim çerçevesi ================= */
const byId=id=>document.getElementById(id);
function subeBar(){if(S.subeIds.length<2||!['cizelge','personel','ay'].includes(S.tab))return'';
  return `<div class="ptsube sbar"><span class="ptcap">Şube</span><div class="ptsel"><select id="subeSecim" aria-label="Şube seç">${S.subeIds.map(id=>`<option value="${esc(id)}" ${id===S.subeId?'selected':''}>${esc(S.subeler[id].ad)}</option>`).join('')}</select></div></div>`;}
function view(html,after){const ap=document.querySelector('.app');if(ap)ap.classList.toggle('wide',(S.tab==='puantaj'&&!!S.pt.sube)||['cizelge','personel','ay'].includes(S.tab));kilitTakip();byId('view').innerHTML=subeBar()+kilitBandi()+html;after&&after();kilitUygula();}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='subeSecim'){selectSube(e.target.value);window.scrollTo(0,0);}});
function top(eyebrow,title,right=''){byId('top').innerHTML=`<div class="top-row"><div class="grow"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${right}</div>`;}
function sekmeler(){if(!S.me)return[];const t=[['cizelge','Çizelge'],['personel','Personel']];
  if(puantajYetki())t.push(['puantaj','Puantaj']);if(isIsveren()||isBolge())t.push(['yonetim','Yönetim']);return t;}
function renderTabs(){const t=sekmeler();if(!t.some(x=>x[0]===S.tab))S.tab='cizelge';const n=byId('tabs');n.hidden=false;
  byId('tabsIn').innerHTML=t.map(([k,a])=>`<button data-tab="${k}" class="${S.tab===k?'on':''}">${a}</button>`).join('');
  n.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(S.tab==='puantaj'&&S.pt.sube)veriBosTemizle();S.tab=b.dataset.tab;tryLS('pm.tab',S.tab);if(S.tab==='ay')S.ay=S.ay||gosterAy(S.hafta);if(S.tab==='puantaj'){S.pt.sube=null;if(S.subeId&&S.subeIds.includes(S.subeId)){S.ay=aktifAy('puantaj');puantajAc(S.subeId);}}render();window.scrollTo(0,0);});}
function renderTop(){const sb=S.subeId?sube():null;const ak=S.tab==='ay'?aktifAy('ay'):gosterAy(S.hafta);
  const baslik={cizelge:'Haftalık çizelge',personel:'Personel',ay:'Ay sonu',puantaj:'Puantaj',yonetim:'Yönetim'}[S.tab];
  const d=S.aylar[ak];const chip=sb&&S.tab!=='puantaj'&&S.tab!=='yonetim'?`<span class="chip on-navy">${AYK[+ak.slice(5)-1]} · ${(DURUM[d&&d.durum]||DURUM.taslak).ad}</span>`:'';
  const subeTxt=S.tab==='puantaj'||S.tab==='yonetim'?esc(ROL[rol()]+' · '+(S.me.adSoyad||S.me.kullaniciAdi)):sb?`${esc(sb.ad)} · ${esc(sb.acilis)}–${esc(sb.kapanis)}${S.subeIds.length>1?' ▾':''}`:'Şube yok';
  byId('top').innerHTML=`<div class="top-row"><div class="grow"><button class="sube-btn eyebrow" id="subeBtn">${subeTxt}</button><h1>${baslik}</h1></div>${chip}
   <button class="icon-btn yardim-btn ${document.body.classList.contains('yardim-acik')?'on':''}" id="yardimBtn" aria-label="Açıklamalar" title="Açıklamaları göster / gizle">?</button>
   <button class="icon-btn" id="hesapBtn" aria-label="Hesap"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></button></div>`;
  byId('subeBtn').onclick=()=>{if(S.tab!=='puantaj'&&S.tab!=='yonetim'&&S.subeIds.length>1)subeSec();};byId('hesapBtn').onclick=hesapPanel;byId('yardimBtn').onclick=()=>{const a=!document.body.classList.contains('yardim-acik');document.body.classList.toggle('yardim-acik',a);tryLS('pm.yardim',a?'1':'0');renderTop();};}
function render(){if(!S.me||S.me.aktif!==true)return;if(S.eskiSurum)return eskiSurumEkrani();tryLS('pm.gor',JSON.stringify({d:ymd(today()),hafta:S.hafta,ay:S.ay,ayElle:!!S.ayElle,tk:S.tkGorunum,pt:S.pt.sube||null}));renderTabs();renderTop();
  if(S.ptGeri&&S.tab==='puantaj'&&puantajYetki()&&S.subeIds.includes(S.ptGeri)){const id=S.ptGeri;S.ptGeri=null;S.ay=aktifAy('puantaj');return puantajAc(id);}
  if(S.kuralHata)return view(`<div class="banner bad">Personel listesi okunamadı. Firebase kuralları güncel değil. ${isIsveren()?'Firestore → Rules sekmesine son firestore.rules dosyasını yapıştırıp Publish\'e basın.':'İşverene haber verin.'}</div>`);
  if(S.tab==='yonetim')return renderYonetim();
  if(S.tab==='puantaj')return renderPuantaj();
  if(!S.subeIds.length)return view(`<div class="empty-state"><b>Size atanmış şube yok</b>${isIsveren()?'Yönetim sekmesinden şube ekleyin.':'İşvereninizden şube ataması yapmasını isteyin.'}</div>`);
  if(!S.subeId)return;
  if(S.tab==='personel')return renderPersonel();
  if(S.tab==='ay')return renderAy();
  renderCizelge();}

/* ================= Panel ve bildirim ================= */
function openSheet(html,onMount){const r=byId('sheetRoot');r.innerHTML=`<div class="dim" id="dim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  byId('dim').onclick=closeSheet;document.addEventListener('keydown',escKapat);onMount&&onMount(r.querySelector('.sheet'));}
function escKapat(e){if(e.key==='Escape')closeSheet();}
function closeSheet(){byId('sheetRoot').innerHTML='';document.removeEventListener('keydown',escKapat);}
let toastT;function toast(m){byId('toastRoot').innerHTML=`<div class="toast" role="status">${esc(m)}</div>`;clearTimeout(toastT);toastT=setTimeout(()=>byId('toastRoot').innerHTML='',3000);}
function subeSec(after){openSheet(`<h2>Şube seç</h2><div class="sub">${S.subeIds.length} şube</div><div class="card list">${S.subeIds.map(id=>`<button class="row" data-id="${esc(id)}"><div class="av">${esc(bas(S.subeler[id].ad))}</div><div class="m"><b>${esc(S.subeler[id].ad)}</b><span>${esc(S.subeler[id].acilis||'')}–${esc(S.subeler[id].kapanis||'')}</span></div>${id===S.subeId?'<span class="chip ok">Seçili</span>':''}</button>`).join('')}</div>`,sh=>{
  sh.querySelectorAll('.row').forEach(b=>b.onclick=()=>{closeSheet();selectSube(b.dataset.id);after&&after();});});}
function hesapPanel(){openSheet(`<h2>${esc(S.me.adSoyad||S.me.kullaniciAdi)}</h2><div class="sub">${esc(ROL[rol()])} · kullanıcı adı: ${esc(S.me.kullaniciAdi||'')}</div>
  <span class="lbl">Şifre değiştir</span><label class="field"><span>Mevcut şifre</span><input id="s1" type="password" autocomplete="current-password"></label>
  <label class="field"><span>Yeni şifre (en az 6 karakter)</span><input id="s2" type="password" autocomplete="new-password"></label><div id="sErr"></div>
  <div class="row2"><button class="btn grow" id="sOk">Şifreyi değiştir</button></div><div class="row2"><button class="btn danger grow" id="outB">Çıkış yap</button></div><p class="note" style="text-align:center;margin-top:10px">Sürüm ${APP_SURUM}</p>`,sh=>{
  byId('outB').onclick=()=>{closeSheet();signOut(auth);};
  byId('sOk').onclick=async()=>{const a=byId('s1').value,b=byId('s2').value;if(b.length<6){byId('sErr').innerHTML='<div class="confirm">Yeni şifre en az 6 karakter olmalı.</div>';return;}
    try{await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,a));await updatePassword(auth.currentUser,b);sifreKaydet(S.user.uid,S.me.kullaniciAdi||'',b).catch(e=>console.error(e));closeSheet();toast('Şifreniz değiştirildi.');}
    catch(e){byId('sErr').innerHTML=`<div class="confirm bad">${(e.code||'').includes('wrong-password')||(e.code||'').includes('invalid-credential')?'Mevcut şifre hatalı.':'Şifre değiştirilemedi.'}</div>`;}};});}

/* ================= Çizelge ================= */
let SEL=null,ROWS=[],MOD=null,ptrTip='mouse',suruk=false,lpT=null,lpOldu=false,lpX=0,lpY=0;
function cizelgeYazabilir(d){return !kesinAy(d)&&haftaDurumu(mondayOf(d))==='acik'&&(!locked(d)||puantajYetki());}// kapalı / onaylı haftada önce "Kilidi aç" gerekir
function renderCizelge(){const wid=S.hafta;const sb=haftaAyari(wid);const ds=weekDays(wid);const td=ymd(today());const ak=gosterAy(wid);
  const K=kadroOf(wid);const kisiler=cizelgeKisileri(wid);ROWS=kisiler.map(p=>p.id);if(SEL&&SEL.wid!==wid)SEL=null;
  let h=`<div class="weeknav"><button class="nav-arrow" id="prevW" aria-label="Önceki hafta">‹</button><button class="ttl" id="thisW">${rangeLabel(wid)}<small>${mondayOf(today())===wid?'Bu hafta':'Bu haftaya dön'}</small></button><button class="nav-arrow" id="nextW" aria-label="Sonraki hafta">›</button></div>`;
  if(!(sb.gunluk>0&&sb.gunluk<=16))h+=`<div class="banner bad">Şube ayarlarında günlük mesai ${fmt(sb.gunluk)} saat görünüyor, bu yüzden fazla mesai yanlış hesaplanıyor. ${isIsveren()?'Yönetim → Şubeler\'den 8,5 olarak düzeltin.':'İşverenden şube ayarını düzeltmesini isteyin.'}</div>`;
  if(isSube()&&S.goc4===false)h+=`<div class="banner">Sistem güncelleniyor. İşveren uygulamayı bir kez açınca önceki haftalar yeniden görünecek.</div>`;
  h+=haftaBandi(wid);
  if(gunHataVar())h+=`<div class="banner bad">${GUN_HATA_YAZI}</div>`;
  if(isSube()&&haftaDurumu(wid)!=='acik')return view(h+kapaliHaftaKart(wid),bindWeek);
  if(ds.some(kesinAy))h+=`<div class="banner">Bu haftanın ${ds.every(kesinAy)?'tamamı':'bir kısmı'} kesin kapanmış aya ait; o günler kimse tarafından değiştirilemez.</div>`;
  else if(ds.some(d=>locked(d)))h+=`<div class="banner">${isSube()?'Bu haftanın bir kısmı kapatılmış aya ait, o günler düzenlenemez.':'Bu haftanın bir kısmı kapatılmış aya ait. Yaptığınız değişiklik onaylanmış puantajı değiştirmez.'}</div>`;
  if(K.oneri&&K.ids.length)h+=`<div class="banner ok">Bu haftanın listesi geçen haftadan getirildi. Gelmeyeni ismine dokunup çıkarın, yeni geleni "+ ekle" ile ekleyin.</div>`;
  h+=`<div class="actions"><button class="btn grow" id="copyW">Geçen haftayı kopyala</button><button class="btn" id="undoB" ${undo.length?'':'disabled'}>Geri al</button><button class="btn" id="shareB">Paylaş</button></div>`+haftaIslemleri(wid);
  if(!S.loaded.personel||!S.loaded.haftalar)return view(h+`<div class="empty-state"><b>Vardiyalar yükleniyor</b></div>`,bindWeek);
  const akF=fmAyi(wid,sb);const ak3=AYK[+akF.slice(5)-1];
  const czMod='sutun';// isim her zaman solda
  h+=`<div class="grid cz-${czMod}" id="grid"><div></div>${ds.map((d,i)=>`<div class="dh ${ymd(d)===td?'today':''}">${GUN[i]}<span>${d.getDate()}</span></div>`).join('')}<div class="dh fmh">Hafta<span>fazla mesai</span></div><div class="dh fmh">${ak3}<span>bu haftaya kadar</span></div>`;
  GRUP_SIRA.forEach(g=>{h+=`<div class="gt">${GRUP[g]}<button class="gadd" data-g="${g}">+ ${GRUP[g]} ekle</button></div>`;
    kisiler.filter(p=>(p.grup||'K')===g).forEach(p=>{const r=ROWS.indexOf(p.id);const wk=haftaHesapS(p,wid,sb);const ay=ayKadarS(p,wid,sb);
      const alt=`${fmt(wk.h)} sa${isEsnaf(p)?' · esnaf':p.sekil==='Part'?' · part':''}`;
      const fmH=isEsnaf(p)?['—',`${fmt(ay.h)}<small>sa</small>`]:p.sekil==='Part'?['—',`${fmt(ay.h)}<small>sa</small>`]:[sg(wk.fm),sg(ay.fm)];
      h+=`<button class="nm ${MOD&&MOD.tip==='satir'&&MOD.pid===p.id?'kaynak':''}" data-pe="${esc(p.id)}"><b title="${esc(p.ad)}"><span class="adU">${esc(adBuyuk(p.ad))}</span><span class="adK">${esc(adBuyuk(kisaAd(p.ad)))}</span></b><span>${alt}</span><em class="nmfm">${isEsnaf(p)||p.sekil==='Part'?`${ak3} ${fmH[1]}`:`hafta <i>${fmH[0]}</i> · ${ak3} <i>${fmH[1]}</i>`}</em><em class="nmfmK">${isEsnaf(p)||p.sekil==='Part'?`<i class="fmp sa" title="Bu hafta çalışılan saat">${fmt(wk.h)} sa</i>`:`<i class="fmp ${wk.fm>0.004?'art':wk.fm<-0.004?'eks':'sif'}" title="Bu haftanın fazla mesaisi">${sg(wk.fm)}</i>`}</em></button>`;
      ds.forEach((d,i)=>{const q=gunKaydiP(p,d);if(!q){h+=`<div class="cell out" data-r="${r}" data-c="${i}">—</div>`;return;}
        const lk=!cizelgeYazabilir(d);const val=cellOf(q.id,wid,i);const tag=lk?'div':'button';const at=`data-p="${esc(q.id)}" data-i="${i}" data-r="${r}" data-c="${i}"`;
        if(isShift(val)){const k=shiftKind(val,sb);const vk=vardiyaKontrol(val,sb,d);const[a,b]=val.split('-');h+=`<${tag} class="cell ${!vk.ok?'yuvarla':vk.pay?'pay':''}" ${at} ${!vk.ok?`title="${esc(vk.neden)}"`:vk.pay?'title="Erken çağrılma / geç çıkış (düzeltme)"':''} aria-label="${esc(p.ad)} ${GUNU[i]} ${a}–${b}"><span class="t ${k.o?'o':''}">${a}</span><span class="t ${k.k?'k':''}">${b}</span></${tag}>`;}
        else if(val&&KOD[val])h+=`<${tag} class="cell code" ${kodStil(val)} ${at}>${KOD[val].kisa}</${tag}>`;
        else{const o=cokSubeli(q)?digerGunler(q,d):null;
          if(o){const[s2,v2]=Object.entries(o)[0];h+=`<div class="cell baska" data-r="${r}" data-c="${i}" title="${esc(subeAdi(s2))}: ${esc(degerYazi(v2))}"><b>${esc(kisaSubeAd(s2))}</b><small>${isShift(v2)?esc(v2.replace('-','–')):KOD[v2]?esc(KOD[v2].ad):''}</small></div>`;}
          else h+=`<${tag} class="cell empty ${bosSayilir(q,d)?'':'serbest'}" ${at} aria-label="${esc(p.ad)} ${GUNU[i]} boş">${lk?'':'+'}</${tag}>`;}});
      h+=`<div class="fmc">${fmH[0]}</div><div class="fmc ay">${fmH[1]}</div>`;});});
  h+=`</div>`;
  if(!kisiler.length)h+=`<div class="empty-state"><b>Bu haftanın listesi boş</b>Gruplardaki "+ ekle" ile personel listesinden kişi seçin ya da "Geçen haftayı kopyala"ya basın.</div>`;
  h+=`<div class="legend"><span><i style="background:var(--open)"></i>Açılış saati</span><span><i style="background:var(--close)"></i>Kapanış saati</span>${KOD_SIRA.filter(k=>k!=='B').map(k=>`<span><i style="background:${KOD_RENK[k][0]}"></i>${KOD[k].ad}</span>`).join('')}${kisiler.some(p=>p.sekil==='Part')?`<span><i style="background:${KOD_RENK.CG[0]}"></i>${KOD.CG.ad} (part)</span>`:''}<span><i style="background:${BOS_RENK}"></i>Boş gün</span><span><i class="lg-baska"></i>Başka şubede çalıştığı gün</span><span><i class="lg-pay"></i>Erken çağrılma / geç çıkış</span><span>— İşe giriş öncesi / çıkış sonrası</span></div>
   <p class="note yardim"><b>Kopyala-yapıştır:</b> Bilgisayarda hücreleri fareyle sürükleyerek seçin, Ctrl+C ile kopyalayıp hedef hücrede Ctrl+V yapın; Excel'den kopyaladığınız saatler de yapıştırılır. Delete ile silin, çift tıklayarak düzenleyin. Telefonda hücreye ya da isme basılı tutun.</p>
   <p class="note yardim">İsim altında haftanın toplam saati. En sağda: haftanın fazla mesaisi ve ayın toplam fazla mesaisi${sb.fmDonem==='hafta'?` (fazla mesai dönemi ${fmDonemYazi(akF,sb)})`:''}. Hesap: çalışılan − (çalışılan gün × ${fmt(sb.gunluk)} sa); izin günü kullanılmadan 7 gün çalışılan haftada − ${fmt(sb.haftalik)} sa. Başka şubede çalıştığı günler bu şubede hesaba girmez; o günün mesaisi çalıştığı şubede.</p>
   <p class="note yardim"><b>Saatler:</b> yarım saatlik seçilir. İleri tarihli günlerde ${saatYaz(saatAraligi(sb).n0)} – ${saatYaz(saatAraligi(sb).n1)} arası; bugün ve geçmiş günlerde düzeltme için iki uçta birer saat daha (erken çağrılma, geç çıkış).</p>`;
  if(MOD)h+=`<div class="modbar"><span>${MOD.tip==='hucre'?`<b>${esc(degerYazi(MOD.val))}</b> kopyalandı. Yapıştırmak için hücrelere dokunun.`:`<b>${esc(kisaAd((S.personel.find(p=>p.id===MOD.pid)||{}).ad))}</b> haftası kopyalandı. Hedef kişinin adına dokunun.`}</span><button class="btn small primary" id="modB">Bitti</button></div>`;
  view(h,()=>{bindWeek();gridBagla();selCiz();const mb=byId('modB');if(mb)mb.onclick=()=>{MOD=null;render();};});}
function degerYazi(v){return isShift(v)?v.replace('-',' – '):v&&KOD[v]?KOD[v].ad:'Boş';}
function bindWeek(){byId('prevW').onclick=()=>{S.hafta=ymd(addDays(parse(S.hafta),-7));SEL=null;render();};byId('nextW').onclick=()=>{S.hafta=ymd(addDays(parse(S.hafta),7));SEL=null;render();};
  byId('thisW').onclick=()=>{S.hafta=mondayOf(today());render();};const on=(id,f)=>{const e=byId(id);if(e)e.onclick=f;};on('copyW',kopyala);on('undoB',geriAl);on('shareB',paylas);haftaIslemBagla(S.hafta);}
function gridBagla(){const G=byId('grid');if(!G)return;
  G.oncontextmenu=e=>{if(e.target.closest('.cell,.nm'))e.preventDefault();};
  G.onpointerdown=e=>{ptrTip=e.pointerType||'mouse';const c=e.target.closest('.cell[data-r]');const n=e.target.closest('[data-pe]');
    if(ptrTip==='mouse'){if(c&&e.button===0){e.preventDefault();const r=+c.dataset.r,cc=+c.dataset.c;
        if(e.shiftKey&&SEL)Object.assign(SEL,{r1:r,c1:cc});else SEL={wid:S.hafta,r0:r,c0:cc,r1:r,c1:cc};suruk=true;selCiz();}return;}
    lpOldu=false;clearTimeout(lpT);lpX=e.clientX;lpY=e.clientY;
    lpT=setTimeout(()=>{lpOldu=true;if(navigator.vibrate)try{navigator.vibrate(15);}catch(_){}
      if(c&&c.dataset.p)hucreKopyaMod(c.dataset.p,+c.dataset.i);else if(n)satirKopyaMod(n.dataset.pe);},480);};
  G.onpointermove=e=>{if(lpT&&(Math.abs(e.clientX-lpX)>8||Math.abs(e.clientY-lpY)>8))clearTimeout(lpT);
    if(suruk&&ptrTip==='mouse'){const c=document.elementFromPoint(e.clientX,e.clientY);const cc=c&&c.closest&&c.closest('.cell[data-r]');if(cc&&SEL){const r=+cc.dataset.r,k=+cc.dataset.c;if(r!==SEL.r1||k!==SEL.c1){SEL.r1=r;SEL.c1=k;selCiz();}}}};
  G.onpointerup=G.onpointercancel=()=>clearTimeout(lpT);
  G.querySelectorAll('button.cell').forEach(b=>{b.onclick=()=>{if(lpOldu){lpOldu=false;return;}if(ptrTip==='mouse')return;
      if(MOD&&MOD.tip==='hucre'){setCell(b.dataset.p,S.hafta,+b.dataset.i,MOD.val);return;}hucre(b.dataset.p,+b.dataset.i);};
    b.ondblclick=()=>{if(ptrTip==='mouse')hucre(b.dataset.p,+b.dataset.i);};});
  G.querySelectorAll('button[data-pe]').forEach(b=>b.onclick=()=>{if(lpOldu){lpOldu=false;return;}if(MOD&&MOD.tip==='satir'){satirYapistir(b.dataset.pe);return;}isimMenu(b.dataset.pe);});
  G.querySelectorAll('.gadd').forEach(b=>b.onclick=()=>kisiSec(b.dataset.g));}
document.addEventListener('pointerup',()=>{suruk=false;});
function selAralik(){if(!SEL)return null;return{r0:Math.min(SEL.r0,SEL.r1),r1:Math.max(SEL.r0,SEL.r1),c0:Math.min(SEL.c0,SEL.c1),c1:Math.max(SEL.c0,SEL.c1)};}
function selCiz(){document.querySelectorAll('.cell.sel').forEach(x=>x.classList.remove('sel'));const A=selAralik();if(!A||SEL.wid!==S.hafta)return;
  document.querySelectorAll('.cell[data-r]').forEach(x=>{const r=+x.dataset.r,c=+x.dataset.c;if(r>=A.r0&&r<=A.r1&&c>=A.c0&&c<=A.c1)x.classList.add('sel');});}
function secimAktif(){if(S.tab!=='cizelge'||!SEL||SEL.wid!==S.hafta||byId('sheetRoot').innerHTML)return false;const a=document.activeElement;return !(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName));}
const KOD_EXCEL={HT:'HAF. İZİN',UI:'ÜCR. İZİN',YI:'YILLIK İZİN',R:'RAPOR',B:'BAYRAM',D:'DİĞER',CG:'ÇALIŞMA GÜNÜ DEĞİL'};
function secimTSV(){const A=selAralik();const out=[];for(let r=A.r0;r<=A.r1;r++){const row=[];for(let c=A.c0;c<=A.c1;c++){const v=cellOf(rowPid(ROWS[r],c),S.hafta,c);
  if(isShift(v))row.push(...v.split('-'));else if(v&&KOD[v])row.push(KOD_EXCEL[v],'');else row.push('','');}out.push(row.join('\t'));}return out.join('\r\n');}
function hucreCoz(a,b){a=String(a??'').trim();b=String(b??'').trim();if(!a&&!b)return null;const ust=a.toLocaleUpperCase('tr-TR').replace(/\s+/g,' ');
  if(XKOD[ust])return XKOD[ust];const kn=Object.keys(KOD).find(k=>KOD[k].ad.toLocaleUpperCase('tr-TR')===ust);if(kn)return kn;
  let m=a.match(/^(\d{1,2}[:.]?\d{0,2})\s*[-–]\s*(\d{1,2}[:.]?\d{0,2})$/);if(m&&!b){const x=normTime(m[1]),y=normTime(m[2]);return x&&y?x+'-'+y:undefined;}
  const x=normTime(a),y=normTime(b);return x&&y?x+'-'+y:undefined;}
function metinMatris(t){let L=String(t||'').replace(/\r/g,'').split('\n');while(L.length&&!L[L.length-1].trim())L.pop();
  return L.map(l=>{let c=l.split('\t');if(c.length===1)return[hucreCoz(c[0],'')];
    if(c.length%2===1){const ilk=hucreCoz(c[0],c[1]);if(ilk===undefined)c=c.slice(1);else c=c.concat(['']);}
    const o=[];for(let j=0;j<c.length;j+=2)o.push(hucreCoz(c[j],c[j+1]));return o;});}
function matrisUygula(M){const A=selAralik();if(!A||!M.length)return;const wid=S.hafta;const ds=weekDays(wid);
  const cells=JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{}));let n=0;
  const yaz=(r,c,v)=>{if(v===undefined||r<0||r>=ROWS.length||c<0||c>6)return;const pid=rowPid(ROWS[r],c);const p=S.personel.find(x=>x.id===pid);if(!p||!employed(p,ds[c])||!cizelgeYazabilir(ds[c]))return;
    cells[pid]=cells[pid]||{};cells[pid][String(c)]=v;n++;};
  if(M.length===1&&M[0].length===1&&(A.r1>A.r0||A.c1>A.c0)){for(let r=A.r0;r<=A.r1;r++)for(let c=A.c0;c<=A.c1;c++)yaz(r,c,M[0][0]);}
  else M.forEach((row,i)=>row.forEach((v,j)=>yaz(A.r0+i,A.c0+j,v)));
  if(!n){toast('Yapıştırılacak uygun hücre yok.');return;}const red=setWeek(wid,cells,kadroOf(wid).ids);toast(`${n-red} hücre yapıştırıldı.${red?` ${red} hücre yazılmadı: ${RED_NEDEN}.`:''}`);}
function secimTemizle(){matrisUygula([[null]]);}
document.addEventListener('copy',e=>{if(!secimAktif())return;e.clipboardData.setData('text/plain',secimTSV());e.preventDefault();const A=selAralik();toast(`${(A.r1-A.r0+1)*(A.c1-A.c0+1)} hücre kopyalandı.`);});
document.addEventListener('cut',e=>{if(!secimAktif())return;e.clipboardData.setData('text/plain',secimTSV());e.preventDefault();secimTemizle();});
document.addEventListener('paste',e=>{if(!secimAktif())return;e.preventDefault();matrisUygula(metinMatris(e.clipboardData.getData('text/plain')));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(MOD||SEL)&&!byId('sheetRoot').innerHTML){MOD=null;SEL=null;render();return;}if(!secimAktif())return;const A=selAralik();
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();secimTemizle();return;}
  if((e.key==='Enter'||e.key==='F2')&&ROWS[SEL.r0]!=null){e.preventDefault();hucre(rowPid(ROWS[SEL.r0],SEL.c0),SEL.c0);return;}
  if(/^[0-9]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&ROWS[SEL.r0]!=null){e.preventDefault();hucre(rowPid(ROWS[SEL.r0],SEL.c0),SEL.c0,{ilk:e.key});return;}
  const yon={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(yon){e.preventDefault();const r=Math.max(0,Math.min(ROWS.length-1,SEL.r1+yon[0])),c=Math.max(0,Math.min(6,SEL.c1+yon[1]));
    if(e.shiftKey)Object.assign(SEL,{r1:r,c1:c});else SEL={wid:S.hafta,r0:r,c0:c,r1:r,c1:c};selCiz();}});
function hucreKopyaMod(pid,i){const v=cellOf(pid,S.hafta,i);if(!v){toast('Boş hücre kopyalanamaz.');return;}MOD={tip:'hucre',val:v};render();}
function satirKopyaMod(pid){const c=(S.haftalar[S.hafta]&&S.haftalar[S.hafta].cells&&S.haftalar[S.hafta].cells[pid])||{};if(!Object.values(c).some(v=>v)){toast('Bu kişinin haftası boş.');return;}MOD={tip:'satir',pid,gun:{...c}};render();}
function satirYapistir(pid){if(pid===MOD.pid)return;const wid=S.hafta;const ds=weekDays(wid);const p=S.personel.find(x=>x.id===pid);const cells=JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{}));
  cells[pid]=cells[pid]||{};ds.forEach((d,i)=>{if(employed(p,d)&&cizelgeYazabilir(d))cells[pid][String(i)]=MOD.gun[String(i)]??null;});const red=setWeek(wid,cells,kadroOf(wid).ids);toast(`${kisaAd(p.ad)} için yapıştırıldı.${red?` ${red} gün yazılmadı: ${RED_NEDEN}.`:''}`);}
function hucre(pid,i,opt={}){if(kilitEngel())return;const p=S.personel.find(x=>x.id===pid);if(!p)return;const wid=S.hafta;const d=weekDays(wid)[i];const val=cellOf(pid,wid,i);const sb=sube();let[a,b]=isShift(val)?val.split('-'):['',''];
  const pay=duzeltmeGunu(d);const L=saatListesi(sb,pay);const o=cokSubeli(p)?digerGunler(p,d):null;
  // Listede olmayan eski bir saat (ör. 11:15) seçili kalsın ama düzeltilmesi istensin.
  const secenek=(sec,yok)=>{const grup=(t,f)=>{const x=L.filter(f);return x.length?`<optgroup label="${t}">${x.map(q=>`<option value="${q.s}" ${q.s===sec?'selected':''}>${q.s}${q.pay==='erken'?' · erken':q.pay==='gec'?' · geç':''}</option>`).join('')}</optgroup>`:'';};
    const disarda=sec&&!L.some(q=>q.s===sec)?`<option value="${esc(sec)}" selected>${esc(sec)} · listede yok, düzeltin</option>`:'';
    return `<option value="" ${sec?'':'selected'}>${yok}</option>${disarda}${pay?grup('Erken çağrılma',q=>q.pay==='erken'):''}${grup('Normal saatler',q=>!q.pay)}${pay?grup('Geç çıkış',q=>q.pay==='gec'):''}`;};
  openSheet(`<h2>${esc(p.ad)}</h2><div class="sub">${GUNU[i]}, ${d.getDate()} ${AY[d.getMonth()]}${pay?' · düzeltme yapılabilir':' · plan'}</div>
   ${o?`<div class="confirm">${esc(subeAdi(Object.keys(o)[0]))} şubesinde bu gün ${esc(degerYazi(Object.values(o)[0]))} yazılı. Bir kişi aynı gün tek şubede çalışır.</div>`:''}
   <span class="lbl">Vardiya saati</span>
   <div class="times tsec"><label><small>Giriş</small><select id="tA" aria-label="Giriş saati">${secenek(a,'Seçin')}</select></label><span>–</span><label><small>Çıkış</small><select id="tB" aria-label="Çıkış saati">${secenek(b,'Seçin')}</select></label></div>
   <div class="meta" id="tMeta"></div><div class="row2"><button class="btn primary grow" id="tSave">Kaydet</button><button class="btn grow" id="tNext">Kaydet, sonraki gün</button></div>
   <p class="note" style="margin:6px 0 0">${pay?`Bugün ve geçmiş günlerde ${saatYaz(saatAraligi(sb).n0-1)} – ${saatYaz(saatAraligi(sb).n1+1)} arası seçilebilir; turuncu işaretli saatler erken çağrılma / geç çıkıştır.`:`Plan: ${saatYaz(saatAraligi(sb).n0)} – ${saatYaz(saatAraligi(sb).n1)} arası. Erken çağrılma ve geç çıkış, gün geldiğinde düzeltme olarak yazılır.`}</p>
   <span class="lbl">Durum</span><div class="codes">${[...KOD_SIRA.filter(k=>(k!=='B'&&k!=='D')||val===k),...(p.sekil==='Part'||val==='CG'?['CG']:[])].map(k=>`<button data-k="${k}" class="${val===k?'sel':''}" ${kodStil(k)}>${KOD[k].ad}</button>`).join('')}</div>
   <div class="codes" style="margin-top:8px;grid-template-columns:1fr"><button class="clear" data-k="">Hücreyi temizle</button></div>`,sh=>{
   const A=byId('tA'),B=byId('tB'),M=byId('tMeta');
   const bitisSecenek=()=>{const x=A.value;if(!x)return;const ar=saatAraligi(sb);const azami=Math.max(16,ar.n1-ar.n0+(pay?2:0));const ta=saatKonum(x,sb);[...B.options].forEach(op=>{if(!op.value)return;let tb=saatKonum(op.value,sb);if(tb<=ta)tb+=24;op.disabled=tb<=ta||tb-ta>azami;});if(B.selectedOptions[0]&&B.selectedOptions[0].disabled)B.value='';};
   const upd=()=>{const x=A.value,y=B.value;if(x&&y){const v=x+'-'+y;const k=shiftKind(v,sb);const vk=vardiyaKontrol(v,sb,d);
       M.innerHTML=vk.ok?`<span>${fmt(shiftHours(v))} saat</span><span class="chip ${k.o||k.k?'warn':'mut'}">${k.o&&k.k?'Açılış + kapanış':k.o?'Açılış vardiyası':k.k?'Kapanış vardiyası':'Ara vardiya'}</span>${vk.pay?'<span class="chip warn">Erken / geç</span>':''}`:`<span class="chip bad">${esc(vk.neden)}</span>`;}
     else M.innerHTML='';};
   A.onchange=()=>{bitisSecenek();upd();if(!B.value)B.focus();};B.onchange=upd;bitisSecenek();
   const kaydet=async next=>{const x=A.value,y=B.value;if(!x||!y){toast('Giriş ve çıkış saatini seçin.');(x?B:A).focus();return;}const v=x+'-'+y;const vk=vardiyaKontrol(v,sb,d);if(!vk.ok){toast(vk.neden);return;}
     if(!hucreKontrol(p,wid,i,v))return;setCell(pid,wid,i,v);if(next)sonraki(pid,i);else closeSheet();};
   byId('tSave').onclick=()=>kaydet(false);byId('tNext').onclick=()=>kaydet(true);
   sh.querySelectorAll('.codes button').forEach(bt=>bt.onclick=()=>{const k=bt.dataset.k||null;if(k&&!hucreKontrol(p,wid,i,k))return;setCell(pid,wid,i,k);closeSheet();});upd();});}
function sonraki(pid,i){const p=S.personel.find(x=>x.id===pid);const ds=weekDays(S.hafta);let j=i+1;while(j<7&&(!employed(p,ds[j])||!cizelgeYazabilir(ds[j])))j++;if(j<7)hucre(pid,j);else{closeSheet();toast('Haftanın son günü kaydedildi.');}}
function geriAl(){const u=undo.pop();if(!u)return;setWeek(u.wid,u.cells,u.kadro,false);S.hafta=u.wid;toast('Son değişiklik geri alındı.');}
function kopyala(){const wid=S.hafta;const prev=ymd(addDays(parse(wid),-7));const pk=kadroDoc(prev);const src=(S.haftalar[prev]&&S.haftalar[prev].cells)||{};
  if(!pk||!pk.length){toast(`${rangeLabel(prev)} haftasında kopyalanacak liste yok.`);return;}
  const dolu=Object.values((S.haftalar[wid]&&S.haftalar[wid].cells)||{}).some(o=>o&&Object.values(o).some(v=>v));
  openSheet(`<h2>Geçen haftayı kopyala</h2><div class="sub">${rangeLabel(prev)} haftasının listesi ve saatleri ${rangeLabel(wid)} haftasına yazılacak.</div>${dolu?'<div class="confirm">Bu haftada girilmiş vardiyalar var, kopyalama üzerine yazar. "Geri al" ile dönebilirsiniz.</div>':''}
   <div class="row2"><button class="btn grow" id="cNo">Vazgeç</button><button class="btn primary grow" id="cYes">Kopyala</button></div>`,()=>{byId('cNo').onclick=closeSheet;
   byId('cYes').onclick=()=>{const ds=weekDays(wid);const out=JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{}));const kad=kadroOf(wid).ids.slice();
     pk.forEach(pid=>{const p=S.personel.find(x=>x.id===pid);if(!p||subedenCikti(p)||!ds.some(d=>employed(p,d)))return;if(!kad.includes(pid))kad.push(pid);const s=src[pid];if(!s)return;out[pid]=out[pid]||{};
       ds.forEach((d,i)=>{if(employed(p,d)&&cizelgeYazabilir(d)&&s[String(i)]!=null)out[pid][String(i)]=s[String(i)];});});
     const red=setWeek(wid,out,kad);closeSheet();toast(`Geçen haftanın listesi ve saatleri kopyalandı.${red?` ${red} hücre yazılmadı: ${RED_NEDEN}.`:''}`);};});}
function kadroEkle(pid){const wid=S.hafta;const kad=kadroOf(wid).ids.slice();if(kad.includes(pid))return;kad.push(pid);setWeek(wid,JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{})),kad);}
function kadroCikar(pid){const wid=S.hafta;const kad=kadroOf(wid).ids.filter(x=>x!==pid);const cells=JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{}));delete cells[pid];setWeek(wid,cells,kad);}
function kisiSec(g){const wid=S.hafta;const ds=weekDays(wid);const var_=new Set(kadroOf(wid).ids);
  const L=subePersoneli().filter(p=>(p.grup||'K')===g&&!var_.has(p.id)&&ds.some(d=>employed(p,d))).sort((a,b)=>String(a.ad).localeCompare(String(b.ad),'tr'));
  const satir=p=>`<button class="row" data-id="${esc(p.id)}" data-ara="${esc(isimAnahtar(p.ad))}"><div class="av">${esc(bas(p.ad))}</div><div class="m"><b>${esc(p.ad)}</b><span>${esc(gorevTahmin(p))}</span></div></button>`;
  openSheet(`<h2>${GRUP[g]} ekle · ${rangeLabel(wid)}</h2><div class="sub">${esc(sube().ad)} personel listesinden seçin. Başka şubeden gelen biri listede yoksa "Yeni personel oluştur" ile bu şubenin listesine ekleyin.</div>
   <label class="field"><span>Ara</span><input id="kAra" autocomplete="off" placeholder="İsim yazın"></label>
   <div class="card list" id="kList" style="margin-top:10px;max-height:46vh;overflow:auto">${L.map(satir).join('')||'<div class="note" style="padding:12px">Bu bölümde eklenebilecek kişi yok.</div>'}</div>
   <div class="row2"><button class="btn grow" id="kNo">Kapat</button><button class="btn grow" id="kYeni">+ Yeni personel oluştur</button></div>`,sh=>{
   byId('kNo').onclick=closeSheet;byId('kYeni').onclick=()=>personelPanel(null,g,{sonra:pid=>kadroEkle(pid)});
   byId('kAra').oninput=e=>{const q=isimAnahtar(e.target.value);sh.querySelectorAll('#kList .row').forEach(r=>r.hidden=!!q&&!r.dataset.ara.includes(q));};
   sh.querySelectorAll('#kList .row').forEach(r=>r.onclick=()=>{kadroEkle(r.dataset.id);r.remove();toast(`${kisaAd(S.personel.find(p=>p.id===r.dataset.id).ad)} bu haftaya eklendi.`);});});}
function kadroTasi(pid,yon){const wid=S.hafta;const ids=kadroOf(wid).ids.slice();const L=cizelgeKisileri(wid);const p=L.find(x=>x.id===pid);if(!p)return false;
  const grup=L.filter(x=>(x.grup||'K')===(p.grup||'K'));const k=grup.findIndex(x=>x.id===pid);const hedef=grup[k+yon];if(!hedef)return false;
  const a=ids.indexOf(pid),b=ids.indexOf(hedef.id);[ids[a],ids[b]]=[ids[b],ids[a]];
  setWeek(wid,JSON.parse(JSON.stringify((S.haftalar[wid]&&S.haftalar[wid].cells)||{})),ids);return true;}
function isimMenu(pid){const p=S.personel.find(x=>x.id===pid);if(!p)return;const dolu=Object.values(((S.haftalar[S.hafta]||{}).cells||{})[pid]||{}).some(v=>v);
  const L=cizelgeKisileri(S.hafta).filter(x=>(x.grup||'K')===(p.grup||'K'));const k=L.findIndex(x=>x.id===pid);
  openSheet(`<h2>${esc(p.ad)}</h2><div class="sub">${rangeLabel(S.hafta)} · ${GRUP[p.grup||'K']} bölümünde ${k+1}. sırada</div>
   <div class="row2" style="margin-top:4px"><button class="btn grow" id="iUp" ${k<=0?'disabled':''}>▲ Yukarı taşı</button><button class="btn grow" id="iDn" ${k>=L.length-1?'disabled':''}>▼ Aşağı taşı</button></div>
   <div class="card list" style="margin-top:12px">
   <button class="row" id="iKop"><div class="m"><b>Haftasını kopyala</b><span>Sonra hedef kişinin adına dokunarak yapıştırın</span></div></button>
   <button class="row" id="iCik"><div class="m"><b style="color:var(--bad)">Bu haftadan çıkar</b><span>${dolu?'Bu haftaki saatleri de silinir. ':''}Personel listesinde kalır.</span></div></button></div>
   <p class="note">Görev, SGK şubesi ve tarihler Personel sekmesinden değiştirilir.</p>`,()=>{
   byId('iUp').onclick=()=>{if(kadroTasi(pid,-1))isimMenu(pid);};byId('iDn').onclick=()=>{if(kadroTasi(pid,1))isimMenu(pid);};
   byId('iKop').onclick=()=>{closeSheet();satirKopyaMod(pid);};
   const c=byId('iCik');c.onclick=()=>{if(dolu&&!c.dataset.ok){c.dataset.ok='1';c.querySelector('b').textContent='Çıkarmayı onayla';return;}closeSheet();kadroCikar(pid);toast(`${kisaAd(p.ad)} bu haftadan çıkarıldı.`);};});}

/* ================= Haftalık kapatma =================
   Hafta bitince şube müdürü 2 gün içinde kontrol edip kapatır → bölge müdürünün onayına gider. Kapatılan haftayı şube müdürü göremez.
   Bölge müdürü (kendi şubeleri) ve işveren: kapatır, onaylar, notla geri gönderir, kilidi açar. Her işlem haftanın kaydına yazılır. */
const KAPATMA_GUN=2;
const durumRef=sid=>doc(db,'subeler',gerekliSube(sid),'durum','haftalar');
const benAd=()=>(S.me&&(S.me.adSoyad||S.me.kullaniciAdi))||'';
function haftaPazar(wid){return addDays(parse(wid),6);}
// Hafta pazar gününden itibaren kapatılabilir (pazar günü diğer haftanın eksikleri düzeltilir); son gün KAPATMA_GUN ile aynı kalır.
function haftaBitti(wid){return ymd(today())>=ymd(haftaPazar(wid));}
function haftaPazarBugun(wid){return ymd(today())===ymd(haftaPazar(wid));}
function haftaSonGun(wid){return addDays(haftaPazar(wid),KAPATMA_GUN);}
function haftaGecikti(wid){return ymd(today())>ymd(haftaSonGun(wid));}
function haftaAylari(wid){return[...new Set(weekDays(wid).map(ayKey))];}
const gunAdi=d=>`${d.getDate()} ${AY[d.getMonth()]} ${GUNU[(d.getDay()+6)%7]}`;
const tarihSaat=t=>{if(!t)return'';const d=new Date(t);return `${d.getDate()} ${AYK[d.getMonth()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
function haftaDolu(wid,H=S.haftalar){const k=(H[wid]&&kadroDoc(wid,H))||[];return k.length>0;}
// Şube müdürüne: kapatılmamış ve süresi dolmak üzere / dolmuş haftalar
function acikBitenHaftalar(){const L=[];let w=parse(mondayOf(today()));for(let i=1;i<=8;i++){const wid=ymd(addDays(w,-7*i));if(wid<BASLANGIC_AY+'-01')break;
    if(haftaDolu(wid)&&haftaDurumu(wid)==='acik'&&haftaBitti(wid))L.push(wid);}return L.reverse();}
function haftaBandi(wid){const hd=haftaDurumu(wid);const w=S.haftalar[wid]||{};const dw=(S.haftaDurum.w||{})[wid]||{};let h='';
  if(isSube()){const L=acikBitenHaftalar().filter(x=>x!==wid);if(L.length)h+=`<div class="banner ${L.some(haftaGecikti)?'bad':''}">Kapatılmamış ${L.length>1?L.length+' hafta':'hafta'}: ${L.map(x=>`<button class="hgit" data-gitw="${x}">${rangeLabel(x)}${haftaGecikti(x)?' · gecikti':''}</button>`).join(' ')}</div>`;}
  if(hd==='acik'){if(w.geriNot)h+=`<div class="banner bad">Bölge müdürü bu haftayı geri gönderdi: "${esc(w.geriNot)}". Düzeltip yeniden kapatın.</div>`;
    if(haftaBitti(wid)&&haftaDolu(wid)){const son=haftaSonGun(wid);h+=haftaGecikti(wid)?`<div class="banner bad">Bu hafta ${gunAdi(son)} gününe kadar kapatılmalıydı, gecikti.</div>`:haftaPazarBugun(wid)?`<div class="banner">Bugün haftanın son günü. Pazar vardiyasının çıkış saatleri henüz bitmemiş olabilir; kapatmadan önce pazar saatlerini kontrol edin. Kapattıktan sonra düzeltme için bölge müdürünün kilidi açması gerekir. En geç ${gunAdi(son)} günü kapatın.</div>`:`<div class="banner">Hafta bitti. Kontrol edip en geç ${gunAdi(son)} günü kapatın.</div>`;}}
  else if(!isSube()){const ad=w.kapatanAd||dw.ad||'';const t=w.kapatma||dw.t;
    h+=hd==='kapali'?`<div class="banner">Hafta kapatıldı${ad?' · '+esc(ad):''}${t?' · '+tarihSaat(t):''}. Onayınızı bekliyor. Düzenlemek için önce "Kilidi aç"a basın.</div>`:`<div class="banner ok">Hafta onaylandı${w.onaylayanAd?' · '+esc(w.onaylayanAd):''}${w.onayTarihi?' · '+tarihSaat(w.onayTarihi):''}. Düzenlemek için önce "Kilidi aç"a basın.</div>`;}
  return h;}
function kapaliHaftaKart(wid){const dw=(S.haftaDurum.w||{})[wid]||{};
  return `<div class="empty-state kapali-kart"><b>Bu hafta kapatıldı</b>${dw.ad?esc(dw.ad)+' · ':''}${dw.t?tarihSaat(dw.t):''}<br>${dw.d==='onay'?'Bölge müdürü onayladı.':'Bölge müdürünün onayında.'} Kapatılan haftalar görüntülenemez.<br>Düzeltme gerekiyorsa bölge müdürünüzden haftanın kilidini açmasını isteyin.</div>`;}
function haftaIslemleri(wid){const hd=haftaDurumu(wid);let b='';if(weekDays(wid).some(kesinAy))return'';
  if(hd==='acik'&&haftaBitti(wid)&&haftaDolu(wid)){b+=`<button class="btn primary grow" id="hKap">${isSube()?'Haftayı kapat → bölge müdürüne gönder':'Haftayı kapat'}</button>`;if(puantajYetki())b+=`<button class="btn grow" id="hKapOn">Kapat ve onayla</button>`;}
  if(puantajYetki()){if(hd==='kapali')b+=`<button class="btn primary grow" id="hOn">Onayla</button><button class="btn danger grow" id="hGeri">Geri gönder</button>`;
    if(hd!=='acik')b+=`<button class="btn grow" id="hKilit">Kilidi aç</button>`;const kay=(S.haftalar[wid]||{}).kayit;if(kay&&kay.length)b+=`<button class="btn" id="hKay">Kayıt</button>`;}
  if(isIsveren()&&hd==='acik')b+=`<button class="btn" id="hListe">Listeyi hücrelerden geri kur</button>`;
  return b?`<div class="actions hafta-is">${b}</div>`:'';}
function haftaIslemBagla(wid){const on=(id,f)=>{const e=byId(id);if(e)e.onclick=f;};
  document.querySelectorAll('[data-gitw]').forEach(x=>x.onclick=()=>{S.hafta=x.dataset.gitw;SEL=null;render();window.scrollTo(0,0);});
  on('hKap',()=>haftaKapatPanel(wid,false));on('hKapOn',()=>haftaKapatPanel(wid,true));on('hOn',()=>haftaOnayPanel(wid));on('hGeri',()=>haftaGeriPanel(wid));
  on('hKilit',()=>{const e=byId('hKilit');if(!e.dataset.ok){e.dataset.ok='1';e.textContent='Kilidi açmayı onayla';return;}haftaKilidiAc(wid);});on('hKay',()=>haftaKayitPanel(wid));
  on('hListe',async()=>{const e=byId('hListe');if(!e.dataset.ok){e.dataset.ok='1';e.textContent='Emin misin? Tekrar dokun';return;}const sid=S.subeId;e.disabled=true;
    try{const s0=await getDoc(weekRef(wid,sid));const c=(s0.exists()&&s0.data().cells)||{};const eski=Array.isArray(s0.exists()&&s0.data().kadro)?s0.data().kadro:[];
      const ids=Object.keys(c).filter(pid=>Object.values(c[pid]||{}).some(v=>v));const sirali=[...eski.filter(x=>ids.includes(x)),...ids.filter(x=>!eski.includes(x))];
      if(!sirali.length){toast('Hücre bulunamadı, liste değişmedi.');e.disabled=false;return;}
      await setDoc(weekRef(wid,sid),{kadro:sirali},{merge:true});toast(`Liste geri kuruldu: ${sirali.length} kişi.`);}catch(x){console.error(x);toast('Geri kurulamadı.');}render();});}
function haftaKayitPanel(wid,H=S.haftalar){const kay=((H[wid]||{}).kayit||[]).slice().sort((a,b)=>String(b.t).localeCompare(String(a.t)));
  openSheet(`<h2>Hafta kaydı</h2><div class="sub">${esc(sube().ad)} · ${rangeLabel(wid)}</div><div class="card list">${kay.map(k=>`<div class="row"><div class="m"><b>${esc(k.i)}</b><span>${esc(k.ad||'')} · ${tarihSaat(k.t)}${k.not?' · "'+esc(k.not)+'"':''}</span></div></div>`).join('')||'<div class="note" style="padding:12px">Kayıt yok.</div>'}</div><div class="row2"><button class="btn grow" id="kyK">Kapat</button></div>`,()=>byId('kyK').onclick=closeSheet);}
// Haftanın kontrolü: boş günler ve 7 gün teyidi kapatmayı engeller; eksi fazla mesai ve izinler bilgi için.
function haftaKontrol(wid){const sb=haftaAyari(wid);const ds=weekDays(wid);const t7=(S.haftalar[wid]||{}).teyit7||{};const K={bos:[],yedi:[],eksi:[],izin:[],izinG:[],gc:[],yok:[]};
  cizelgeKisileri(wid).forEach(p=>{const L=CZ_ES[p.id]||[p];
    ds.forEach((d,i)=>{const q=gunKaydiP(p,d);if(!q)return;const v=cellOf(q.id,wid,i);if((v==null||v==='')&&(weekHasEntry(q.id,wid)||!isEsnaf(q))&&bosSayilir(q,d)&&cizelgeYazabilir(d))K.bos.push({p,d});// satırı tamamen boş kişi de (esnaf hariç) boş gün sayılır
      if(v&&['R','UI','YI'].includes(v))K.izin.push({p,d,v});});
    L.forEach(q=>{const y=weekHasEntry(q.id,wid)?haftaYedi(q,wid):{yedi:false};if(y.yedi&&y.sube===S.subeId)K.yedi.push({p:q,ok:!!t7[q.id]});});
    if(!isEsnaf(p)&&p.sekil!=='Part'){const x=haftaHesapS(p,wid,sb);if(x.fm<-0.004)K.eksi.push({p,fm:x.fm});}
    // Giriş / çıkış: SGK tarihi bu haftaya düşenler ve çizelgede ilk / son çalıştığı gün
    const w0=ymd(ds[0]),w6=ymd(ds[6]);
    L.forEach(q=>{const calGun=i=>{const v=cellOf(q.id,wid,i);return v&&!KOD[v];};
      const gi=q.giris&&q.giris>=w0&&q.giris<=w6?q.giris:(ilkGun(q)&&ilkGun(q)>=w0&&ilkGun(q)<=w6?ilkGun(q):null);
      if(gi){const i=ds.findIndex((d,j)=>calGun(j));K.gc.push({p:q,key:'giris|'+q.id,tur:'Giriş',t:gi,sgk:q.giris&&q.giris!==gi?q.giris:'',cz:i>=0?ds[i]:null});}
      if(q.cikis&&q.cikis>=w0&&q.cikis<=w6){let i=-1;ds.forEach((d,j)=>{if(calGun(j))i=j;});K.gc.push({p:q,key:'cikis|'+q.id,tur:'Çıkış',t:q.cikis,sgk:'',cz:i>=0?ds[i]:null});}});});
  // Bu şubede çalışan, haftada aktif ama haftanın listesinde olmayan kişiler (unutulduysa maaşı kesintisiz çıkar): teyit edilir.
  {const ids=kadroOf(wid).ids;const L0=ids.map(id=>S.personel.find(x=>x.id===id)).filter(Boolean);
    subePersoneli().filter(p=>p.anaSube===S.subeId&&!isEsnaf(p)&&p.paketBasi!==true&&aktifHaftada(p,wid)&&!ids.includes(p.id)&&!L0.some(x=>ayniKisi(x,p))&&!(cokSubeli(p)&&weekDays(wid).some(d=>digerGunler(p,d)))).forEach(p=>K.yok.push({p,key:'yok|'+p.id}));}
  // Rapor / ücretsiz izin / yıllık izin: kişi ve izin türü başına tek madde
  const g={};K.izin.forEach(x=>{const k='izin|'+x.p.id+'|'+x.v;(g[k]=g[k]||{key:k,p:x.p,v:x.v,gun:[]}).gun.push(x.d);});K.izinG=Object.values(g);
  return K;}
async function haftaKapatPanel(wid,onayDa){await gunleriYukle(cizelgeKisileri(wid),haftaAylari(wid));const K=haftaKontrol(wid);const sb=haftaAyari(wid);
  const ad=p=>esc(kisaAd(p.ad));const tK=(S.haftalar[wid]||{}).teyitK||{};const tkEksik=(isSube()?[...K.izinG,...K.yok]:K.gc).filter(x=>!tK[x.key]).length;
  const engel=K.bos.length?`${K.bos.length} boş gün doldurulmadan`:K.yedi.some(x=>!x.ok)?'7 gün çalışılan kişiler teyit edilmeden':tkEksik?`Kontrol listesinde ${tkEksik} madde teyit edilmeden`:'';
  const kis=cizelgeKisileri(wid);const topFm=kis.reduce((t,p)=>t+(isEsnaf(p)||p.sekil==='Part'?0:haftaHesapS(p,wid,sb).fm),0);
  let h=`<h2>${onayDa?'Haftayı kapat ve onayla':'Haftayı kapat'}</h2><div class="sub">${esc(sb.ad)} · ${rangeLabel(wid)}</div>`;
  if(K.bos.length)h+=`<div class="kt kirmizi"><div class="kth"><b>Boş günler · ${K.bos.length}</b><span>Doldurulmadan hafta kapatılamaz.</span></div><div class="kti">${K.bos.map(x=>`<span class="kchip">${ad(x.p)} · ${x.d.getDate()} ${AYK[x.d.getMonth()]} ${GUN[(x.d.getDay()+6)%7]}</span>`).join('')}</div></div>`;
  if(K.yedi.length)h+=`<div class="kt ${K.yedi.every(x=>x.ok)?'yesil':'sari'}"><div class="kth"><b>İzin kullanmadan 7 gün çalışanlar · ${K.yedi.length}</b><span>Doğruysa işaretleyin; izin gününün mesaisi bu haftaya ${fmt(7*sb.gunluk-sb.haftalik)} saat fazla mesai olarak yazılır.</span></div><div class="kti">${K.yedi.map(x=>`<label class="kchip ${x.ok?'on':''}"><input type="checkbox" data-t7="${esc(x.p.id)}" ${x.ok?'checked':''}> ${ad(x.p)}</label>`).join('')}</div></div>`;
  if(K.eksi.length)h+=`<div class="kt sari"><div class="kth"><b>Eksi fazla mesai · ${K.eksi.length}</b><span>Eksik çalışma mı, yanlış saat mi bir bakın.</span></div><div class="kti">${K.eksi.map(x=>`<span class="kchip">${ad(x.p)} · ${sg(x.fm)} sa</span>`).join('')}</div></div>`;
  const zor=isSube();const gunY=d=>`${d.getDate()} ${AYK[d.getMonth()]}`;
  const tkChip=(x,t,z=zor)=>z?`<label class="kchip ${tK[x.key]?'on':''}"><input type="checkbox" data-tk="${esc(x.key)}" ${tK[x.key]?'checked':''}> ${t}</label>`:`<span class="kchip">${t}</span>`;
  if(K.izinG.length)h+=`<div class="kt ${zor?(K.izinG.every(x=>tK[x.key])?'yesil':'sari'):'sari'}"><div class="kth"><b>Rapor ve izinler · ${K.izinG.length}</b><span>${zor?'Evrakı ve günleri kontrol edip her birini işaretleyin; işaretlenmeden hafta kapatılamaz.':'Evrakı tamam mı kontrol edin.'}</span></div><div class="kti">${K.izinG.map(x=>tkChip(x,`${ad(x.p)} · ${x.gun.map(gunY).join(', ')} ${KOD[x.v].ad.toLocaleLowerCase('tr-TR')}`)).join('')}</div></div>`;
  if(K.gc.length&&!zor)h+=`<div class="kt ${K.gc.every(x=>tK[x.key])?'yesil':'sari'}"><div class="kth"><b>Giriş ve çıkışlar · ${K.gc.length}</b><span>SGK tarihini ve çizelgede ilk / son çalıştığı günü muhasebe grubuyla kontrol edip işaretleyin; işaretlenmeden hafta kapatılamaz.</span></div><div class="kti">${K.gc.map(x=>tkChip(x,`${ad(x.p)} · ${x.tur.toLowerCase()} ${trTarih(x.t)}${x.sgk?' (SGK '+trTarih(x.sgk)+')':''} · çizelgede ${x.tur==='Giriş'?'ilk':'son'} gün ${x.cz?gunY(x.cz):'yok'}`,true)).join('')}</div></div>`;
  if(K.yok.length)h+=`<div class="kt ${zor?(K.yok.every(x=>tK[x.key])?'yesil':'sari'):'sari'}"><div class="kth"><b>Haftanın listesinde olmayan çalışanlar · ${K.yok.length}</b><span>${zor?'Bu hafta çalışmadıysa işaretleyin: kapatınca bu haftaki günleri <b>ücretsiz izin</b> olarak yazılır. Çalıştıysa "+ ekle" ile listeye ekleyip günlerini girin; işten ayrıldıysa personelden çıkış tarihini girin. İşaretlenmeden hafta kapatılamaz.':'Personel listesinde aktif ama bu haftanın listesinde yoklar. Kapatınca bu haftaki günleri <b>ücretsiz izin</b> olarak yazılır; işten ayrıldıysa önce personelden çıkış tarihini girin.'}</span></div><div class="kti">${K.yok.map(x=>tkChip(x,`${ad(x.p)} · listede yok`)).join('')}</div></div>`;
  h+=`<p class="note">${kis.length} kişi · haftanın toplam fazla mesaisi ${sg(topFm)} sa.${isSube()?' Kapatınca bu hafta size kapanır ve bölge müdürünün onayına gider; düzeltme gerekirse bölge müdürü kilidi açar.':''}</p>
   ${engel?`<p class="note" style="color:var(--bad);font-weight:600">${engel} hafta kapatılamaz.</p>`:''}
   <div class="row2"><button class="btn grow" id="hkNo">Vazgeç</button><button class="btn primary grow" id="hkOk" ${engel?'disabled':''}>${onayDa?'Kapat ve onayla':'Evet, kapat'}</button></div>`;
  openSheet(h,sh=>{byId('hkNo').onclick=closeSheet;
    sh.querySelectorAll('[data-t7]').forEach(c=>c.onchange=()=>{const pid=c.dataset.t7;const w0=S.haftalar[wid]||{};S.haftalar[wid]={...w0,teyit7:{...(w0.teyit7||{}),[pid]:c.checked}};
      {const sid=S.subeId,hdA=hdAlani(wid);sirayla(sid+'|'+wid,()=>{arka(setDoc(weekRef(wid,sid),{hafta:wid,ay2:ayKey(haftaPazar(wid)),...hdA,teyit7:{[pid]:c.checked}},{merge:true}));});}haftaKapatPanel(wid,onayDa);});
    sh.querySelectorAll('[data-tk]').forEach(c=>c.onchange=()=>{const key=c.dataset.tk;const w0=S.haftalar[wid]||{};S.haftalar[wid]={...w0,teyitK:{...(w0.teyitK||{}),[key]:c.checked}};
      {const sid=S.subeId,hdA=hdAlani(wid);sirayla(sid+'|'+wid,()=>{arka(setDoc(weekRef(wid,sid),{hafta:wid,ay2:ayKey(haftaPazar(wid)),...hdA,teyitK:{[key]:c.checked}},{merge:true}));});}haftaKapatPanel(wid,onayDa);});
    const ok=byId('hkOk');if(ok)ok.onclick=async()=>{ok.disabled=true;try{await haftayiKapat(wid,onayDa);closeSheet();toast(onayDa?`${rangeLabel(wid)} kapatıldı ve onaylandı.`:`${rangeLabel(wid)} kapatıldı${isSube()?', bölge müdürüne gönderildi':''}.`);}catch(e){ok.disabled=false;yazmaHatasi(e);}};});}
// Kapatılan haftanın kişi bazında özeti: şube müdürü kapalı haftayı göremediği için "bu haftaya kadar" toplamı buradan gelir.
function haftaOzHesap(wid){const sb=haftaAyari(wid);const oz={};const k=kadroDoc(wid)||[];
  k.forEach(pid=>{const p=S.personel.find(x=>x.id===pid);if(!p||!weekHasEntry(pid,wid))return;const x=haftaHesap(p,wid,sb);oz[pid]={h:Math.round(x.h*100)/100,fm:Math.round(x.fm*100)/100,a:haftaAyParca(p,wid,sb)};});return oz;}
async function haftayiKapat(wid,onayDa=false){const sid=S.subeId;const t=new Date().toISOString();const ad=benAd();const d=onayDa?'onay':'kapali';
  if(!sunucuHazir(sid))throw hazirDegil();await gunleriYukle(cizelgeKisileri(wid),haftaAylari(wid));if(!sunucuHazir(sid))throw hazirDegil();
  // Haftanın listesinde olmayan çalışanlar (paket başı / esnaf hariç): çalıştığı günler ücretsiz izin olarak çizelgeye yazılır, listeye eklenir.
  const yokC={};{const ds=weekDays(wid);for(const x of haftaKontrol(wid).yok){const p=x.p;const c={};
      for(let i=0;i<7;i++){const d=ds[i];if(!employed(p,d)||!cizelgeYazabilir(d)||cellOf(p.id,wid,i))continue;
        if(cokSubeli(p)){let cak=null;try{cak=await gunYaz(p,ymd(d),'UI',sid);}catch(e){console.error(e);cak={hata:1};}if(cak)continue;}c[String(i)]='UI';}
      if(Object.keys(c).length)yokC[p.id]=c;}}
  const yokIds=Object.keys(yokC);
  if(yokIds.length){const w0=S.haftalar[wid]||{};const cells={...(w0.cells||{})};yokIds.forEach(pid=>cells[pid]={...(cells[pid]||{}),...yokC[pid]});
    S.haftalar[wid]={...w0,kadro:[...(kadroDoc(wid)||[]),...yokIds.filter(x=>!(kadroDoc(wid)||[]).includes(x))],cells};}
  const oz=haftaOzHesap(wid);const k=(kadroDoc(wid)||[]).slice();
  const b=writeBatch(db);
  b.set(weekRef(wid,sid),{hafta:wid,ay2:ayKey(haftaPazar(wid)),hd:d,...(yokIds.length?{kadro:k,cells:yokC}:{}),kapatma:t,kapatan:S.user.uid,kapatanAd:ad,geriNot:'',...(onayDa?{onayTarihi:t,onaylayanAd:ad}:{}),kayit:arrayUnion({t,ad,i:(onayDa?'kapattı ve onayladı':'kapattı')+(yokIds.length?` · listede olmayan ${yokIds.length} kişi ücretsiz izin yazıldı`:'')})},{merge:true});
  b.set(durumRef(sid),{w:{[wid]:{d,t,ad,oz,k}}},{mergeFields:['w.'+wid]});
  await b.commit();if(onayDa)await ozetGuncelle(haftaAylari(wid),sid);}
// Hafta onaylandıktan sonra şubeler arası ay özeti; yazılamazsa kullanıcı uyarılır (hafta onayı geçerli kalır).
async function ozetGuncelle(aklar,sid){try{await ozetYaz(aklar,sid);}catch(e){console.error(e);toast('Hafta onaylandı ama ay özeti güncellenemedi (bağlantı ya da şube değişti). Haftanın kilidini açıp yeniden onaylayın.');}}
async function haftaOnayla(wid){const sid=S.subeId;const t=new Date().toISOString();const ad=benAd();const w0=S.haftalar[wid]||{};
  if(!sunucuHazir(sid)){yazmaHatasi(hazirDegil());return false;}await gunleriYukle(cizelgeKisileri(wid),haftaAylari(wid));if(!sunucuHazir(sid)){yazmaHatasi(hazirDegil());return false;}const dw=(S.haftaDurum.w||{})[wid]||{};
  const b=writeBatch(db);b.set(weekRef(wid,sid),{hd:'onay',onayTarihi:t,onaylayanAd:ad,kayit:arrayUnion({t,ad,i:'onayladı'})},{merge:true});
  b.set(durumRef(sid),{w:{[wid]:{d:'onay',t:dw.t||w0.kapatma||t,ad:dw.ad||w0.kapatanAd||ad,oz:haftaOzHesap(wid),k:(kadroDoc(wid)||[]).slice()}}},{mergeFields:['w.'+wid]});
  try{await b.commit();}catch(e){yazmaHatasi(e);return false;}toast(`${rangeLabel(wid)} onaylandı.`);await ozetGuncelle(haftaAylari(wid),sid);return true;}
// Bölge müdürü / işveren onay verirken kontrol listesi: rapor ve izinler, giriş / çıkışlar, listede olmayanlar. Şube müdürünün işaretlediği maddeler ✓ ile görünür; madde yoksa doğrudan onaylanır.
async function haftaOnayPanel(wid){await gunleriYukle(cizelgeKisileri(wid),haftaAylari(wid));const K=haftaKontrol(wid);
  if(!K.izinG.length&&!K.gc.length&&!K.yok.length)return haftaOnayla(wid);
  const sb=haftaAyari(wid);const tK=(S.haftalar[wid]||{}).teyitK||{};const ad=p=>esc(kisaAd(p.ad));const gunY=d=>`${d.getDate()} ${AYK[d.getMonth()]}`;
  const chip=(x,t,tik)=>tik?`<label class="kchip ${tK[x.key]?'on':''}"><input type="checkbox" data-tko="${esc(x.key)}" ${tK[x.key]?'checked':''}> ${t}</label>`:`<span class="kchip ${tK[x.key]?'on':''}">${tK[x.key]?'✓ ':''}${t}</span>`;
  const bolum=(L,baslik,not,fn,tik)=>L.length?`<div class="kt ${L.every(x=>tK[x.key])?'yesil':'sari'}"><div class="kth"><b>${baslik} · ${L.length}</b><span>${not}</span></div><div class="kti">${L.map(x=>chip(x,fn(x),tik)).join('')}</div></div>`:'';
  const gcEksik=K.gc.filter(x=>!tK[x.key]).length;
  let h=`<h2>Haftayı onayla</h2><div class="sub">${esc(sb.ad)} · ${rangeLabel(wid)}</div><p class="note" style="margin-top:0">Şube müdürünün işaretlediği maddeler ✓ ile görünür. Evrakı ve tarihleri kontrol edip onaylayın; yanlış varsa haftayı geri gönderebilirsiniz.</p>`;
  h+=bolum(K.izinG,'Rapor ve izinler','Evrakı tamam mı kontrol edin.',x=>`${ad(x.p)} · ${x.gun.map(gunY).join(', ')} ${KOD[x.v].ad.toLocaleLowerCase('tr-TR')}`);
  h+=bolum(K.gc,'Giriş ve çıkışlar','SGK tarihini ve çizelgede ilk / son günü muhasebe grubuyla kontrol edip işaretleyin; işaretlenmeden onaylanamaz.',x=>`${ad(x.p)} · ${x.tur.toLowerCase()} ${trTarih(x.t)}${x.sgk?' (SGK '+trTarih(x.sgk)+')':''} · çizelgede ${x.tur==='Giriş'?'ilk':'son'} gün ${x.cz?gunY(x.cz):'yok'}`,true);
  h+=bolum(K.yok,'Haftanın listesinde olmayan çalışanlar','Personel listesinde aktif ama bu haftanın listesinde yoklar; kontrol edin.',x=>`${ad(x.p)} · listede yok`);
  if(gcEksik)h+=`<p class="note" style="color:var(--bad);font-weight:600">Giriş / çıkışta ${gcEksik} madde işaretlenmeden onaylanamaz.</p>`;
  h+=`<div class="row2"><button class="btn grow" id="hoNo">Vazgeç</button><button class="btn primary grow" id="hoOk" ${gcEksik?'disabled':''}>Onayla</button></div>`;
  openSheet(h,sh=>{byId('hoNo').onclick=closeSheet;byId('hoOk').onclick=async()=>{const b=byId('hoOk');b.disabled=true;closeSheet();await haftaOnayla(wid);};
    sh.querySelectorAll('[data-tko]').forEach(c=>c.onchange=()=>{const key=c.dataset.tko;const w0=S.haftalar[wid]||{};S.haftalar[wid]={...w0,teyitK:{...(w0.teyitK||{}),[key]:c.checked}};
      const sid=S.subeId;sirayla(sid+'|'+wid,()=>{arka(setDoc(weekRef(wid,sid),{teyitK:{[key]:c.checked}},{merge:true}));});haftaOnayPanel(wid);});});}
function haftaGeriPanel(wid){openSheet(`<h2>Haftayı geri gönder</h2><div class="sub">${esc(sube().ad)} · ${rangeLabel(wid)}. Hafta şube müdürüne yeniden açılır, notu görür, düzeltip tekrar kapatır.</div>
  <label class="field"><span>Not</span><textarea id="hgNot" rows="3" placeholder="Örn: Ali'nin 14 Ekim çıkış saati eksik"></textarea></label>
  <div class="row2"><button class="btn grow" id="hgNo">Vazgeç</button><button class="btn danger grow" id="hgOk">Geri gönder</button></div>`,()=>{byId('hgNo').onclick=closeSheet;
  byId('hgOk').onclick=async()=>{const not=byId('hgNot').value.trim();closeSheet();await haftaAc(wid,'geri gönderdi',not);toast('Hafta şubeye geri gönderildi.');};});}
async function haftaKilidiAc(wid){await haftaAc(wid,'kilidi açtı','');toast('Haftanın kilidi açıldı, şube düzenleyebilir.');}
async function haftaAc(wid,islem,not){const sid=S.subeId;const t=new Date().toISOString();const ad=benAd();const b=writeBatch(db);
  b.set(weekRef(wid,sid),{hd:'acik',geriNot:not||'',kayit:arrayUnion({t,ad,i:islem,...(not?{not}:{})})},{merge:true});
  b.set(durumRef(sid),{w:{[wid]:deleteField()}},{merge:true});try{await b.commit();}catch(e){yazmaHatasi(e);}}
// Bölge müdürü / işveren kapalı bir haftada değişiklik yaparsa özet ve (onaylıysa) şubeler arası ay özeti yenilenir.
const kgT={};function kapaliHaftaGuncelle(wid,sid0,deneme=0){const sid=sid0||S.subeId;if(sid!==S.subeId||!puantajYetki()||haftaDurumu(wid)==='acik')return;clearTimeout(kgT[wid]);
  kgT[wid]=setTimeout(async()=>{if(!sunucuHazir(sid)){if(S.subeId===sid&&deneme<40)kapaliHaftaGuncelle(wid,sid,deneme+1);return;}const dw=(S.haftaDurum.w||{})[wid]||{};const d=haftaDurumu(wid);
    try{await setDoc(durumRef(sid),{w:{[wid]:{...dw,d,oz:haftaOzHesap(wid),k:(kadroDoc(wid)||[]).slice()}}},{mergeFields:['w.'+wid]});if(d==='onay')await ozetYaz(haftaAylari(wid),sid);}catch(e){console.error(e);}},1500);}
// Şubeler arası ay özeti (maaşın ödendiği şube diğer şubelerdeki izin ve günleri buradan alır). Sadece her şeyi gören bölge müdürü / işveren yazar.
async function ozetYaz(aklar,sid=S.subeId){if(!puantajYetki())return;if(!sunucuHazir(sid))throw hazirDegil();const ay3=new Set();aklar.forEach(a=>{ay3.add(ayKaydir(a,-1));ay3.add(a);ay3.add(ayKaydir(a,1));});
  for(const ak of aklar){await gunleriYukle(ayKadrosu(ak),[...ay3]);if(!sunucuHazir(sid))throw hazirDegil();arka(setDoc(doc(db,'ozetler',ak+'__'+sid),{sube:sid,ay:ak,kisiler:subeOzeti(ak,sid),guncellendi:new Date().toISOString()},{mergeFields:['sube','ay','kisiler','guncellendi']}));}}
// Bir ayın haftaları (puantaj onayı için): haftalık dönemde dönemin haftaları, takvim ayında aya değen haftalar.
function ayinHaftalari(ak,sb=subeAyari(S.subeId,ak)){if(sb.fmDonem==='hafta'){const L=fmHaftalari(ak);const[y0,m0]=ak.split('-').map(Number);const ilk=mondayOf(new Date(y0,m0-1,1));const son=mondayOf(new Date(y0,m0,0));const R=ilk<L[0]?[ilk,...L]:[...L];if(!R.includes(son))R.push(son);return R.sort();}const[y,m]=ak.split('-').map(Number);const L=[];const last=new Date(y,m,0);
  for(let w=parse(mondayOf(new Date(y,m-1,1)));w<=last;w=addDays(w,7))L.push(ymd(w));return L;}
function ayHaftaDurumu(ak){const L=ayinHaftalari(ak).filter(w=>haftaDolu(w));const say={acik:0,kapali:0,onay:0};L.forEach(w=>say[haftaDurumu(w)]=(say[haftaDurumu(w)]||0)+1);return{L,say,tamam:L.length>0&&say.onay===L.length};}

/* ================= Personel (şirket geneli liste) ================= */
// Kişiyi bir şubenin haftalık listesine ekler (o haftanın listesi yoksa önceki haftanın listesini temel alır).
async function cizelgeyeKoy(sid,wid,pid){if(!erisimVar(sid))return;const ref=weekRef(wid,sid);
  // Ekrandaki (belki eski ya da yüklenmemiş) liste değil, sunucudaki liste esas alınır; haftanın durumuna dokunulmaz.
  try{let s0;try{s0=await getDoc(ref);}catch(e){if(String(e.code||'').includes('permission'))return;throw e;}// kapalı hafta: şube müdürü göremez, eklenmez
    let taban=[];if(!s0.exists())for(let i=1;i<=8;i++){let q;try{q=await getDoc(weekRef(ymd(addDays(parse(wid),-7*i)),sid));}catch(e){continue;}if(q.exists()){const d=q.data();taban=Array.isArray(d.kadro)?d.kadro.slice():Object.keys(d.cells||{});break;}}
    await runTransaction(db,async tr=>{const s=await tr.get(ref);const yeni=!s.exists();let kad;const hdYok=yeni||!('hd' in s.data());if(!yeni){const d=s.data();kad=Array.isArray(d.kadro)?d.kadro.slice():Object.keys(d.cells||{});}else kad=taban.slice();
      if(kad.includes(pid))return;kad.push(pid);tr.set(ref,{hafta:wid,ay2:ayKey(addDays(parse(wid),6)),kadro:kad,...(hdYok?{hd:'acik'}:{})},{merge:true});});}
  catch(e){console.error(e);toast(`${subeAdi(sid)} çizelgesine eklenemedi (${rangeLabel(wid)}). İnternet gelince kişiyi "+ ekle" ile ekleyin.`);}}
/* ---- Diğer çalıştığı şubeler (çok şubeli çalışma): sadece işveren ve bölge müdürü (kendi şubeleri) ---- */
function ekYetkiVar(){return isIsveren()||isBolge();}
function ekYetki(sid){return isIsveren()||(isBolge()&&(S.me.subeler||[]).includes(sid));}
function ekSubePanel(p){const ana=p.anaSube||'',sgk=p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:'';const ek=ekSubeleri(p);
  const L=[...new Set([...(isIsveren()?S.subeIds:(S.me.subeler||[])),...ek])].filter(x=>x&&x!==ana&&x!==sgk).sort((a,b)=>String(subeAdi(a)).localeCompare(String(subeAdi(b)),'tr'));
  openSheet(`<h2>${esc(adBuyuk(p.ad))}</h2><div class="sub">Çalıştığı şube: ${esc(subeAdi(ana))}${sgk&&sgk!==ana?' · SGK: '+esc(subeAdi(sgk)):''}. Diğer çalıştığı şubeleri işaretleyin.</div>
   <div class="checks" id="ekL">${L.map(x=>`<label class="check" style="margin:0"><input type="checkbox" value="${esc(x)}" ${ek.includes(x)?'checked':''} ${ekYetki(x)?'':'disabled'}> ${esc(subeAdi(x))}</label>`).join('')||'<span class="note">Eklenebilecek şube yok.</span>'}</div>
   <p class="note">Kişi işaretlenen şubelerin personel listesinde ve çizelgesinde de görünür; o şubede çalıştığı günün mesaisi o şubenin puantajına yazılır. Maaşı yine tek şubeden ödenir. Bir şubeden çıkarınca geçmiş haftaları ve saatleri silinmez, sadece yeni haftalara eklenmez. Bir kişi aynı gün tek şubede çalışır.</p>
   <div id="ekErr"></div><div class="row2"><button class="btn grow" id="ekNo">Vazgeç</button><button class="btn primary grow" id="ekOk">Kaydet</button></div>`,sh=>{
   byId('ekNo').onclick=closeSheet;byId('ekOk').onclick=async()=>{const yeni=[...sh.querySelectorAll('#ekL input:checked')].map(i=>i.value);const b=byId('ekOk');b.disabled=true;
     const r=await ekSubeKaydet(p,yeni);if(r===true)closeSheet();else{b.disabled=false;if(r)byId('ekErr').innerHTML=`<div class="confirm bad">${esc(r)}</div>`;}};});}
async function ekSubeKaydet(p,yeni){const eski=ekSubeleri(p);const ekl=yeni.filter(x=>!eski.includes(x)),cik=eski.filter(x=>!yeni.includes(x));if(!ekl.length&&!cik.length)return true;
  if([...ekl,...cik].some(x=>!ekYetki(x)))return'Sadece sorumlu olduğunuz şubeleri ekleyip çıkarabilirsiniz.';
  const ak=ayKey(today());const ms=odemeSubesi(p,ak);if(cik.includes(ms))return `${subeAdi(ms)} bu ay maaşının ödendiği şube. Önce maaş şubesini değiştirin.`;
  const gor=[...new Set([...(p.gorunurSubeler||[]),...kisiSubeleri(p),...yeni])];const body={ekSubeler:yeni,gorunurSubeler:gor};
  try{const b=writeBatch(db);b.set(doc(db,'personel',p.id),body,{merge:true});ekl.forEach(x=>b.set(doc(db,'ekPersonel',x),{ids:{[p.id]:true}},{merge:true}));await b.commit();}
  catch(e){yazmaHatasi(e);return'Kaydedilemedi.';}
  Object.assign(p,body);render();/* çizelgeye otomatik eklenmez: şube müdürü "+ ekle" ile ekler */
  toast([ekl.length?`${ekl.map(subeAdi).join(', ')} çizelgesine eklendi`:'',cik.length?`${cik.map(subeAdi).join(', ')} şubesinden çıkarıldı; geçmiş haftaları duruyor`:''].filter(Boolean).join('. ')+'.');return true;}

/* ================= Personel bilgileri (telefon, acil durum, e-posta, IBAN) ================= */
// Bu bilgiler personel kaydında durur; kayıt sadece kişinin şubesi (ve SGK şubesinin bölge müdürü / işveren) tarafından okunur.
const BILGI=[{k:'tel',ad:'Telefon',tip:'tel',im:'tel',ph:'05xx xxx xx xx'},{k:'acilAd',ad:'Acil durum kişisi',tip:'metin',im:'text',ph:'Örn: Annesi Ayşe'},{k:'acilTel',ad:'Acil durum no',tip:'tel',im:'tel',ph:'05xx xxx xx xx'},
  {k:'eposta',ad:'E-posta',tip:'eposta',im:'email',ph:'ornek@mail.com'},{k:'iban',ad:'IBAN',tip:'iban',im:'text',ph:'TR000000000000000000000000'}];
BILGI.push({k:'tc',ad:'TC kimlik no',tip:'tc',im:'numeric',ph:'11 hane'});
// Sıra: telefon, IBAN, e-posta, acil durum, TC en sonda
{const sira=['tel','iban','eposta','acilAd','acilTel','tc'];BILGI.sort((a,b)=>sira.indexOf(a.k)-sira.indexOf(b.k));}
function ibanGecerli(s){if(!/^TR\d{24}$/.test(s))return false;const r=s.slice(4)+s.slice(0,4);let m=0;for(const ch of r){const n=/\d/.test(ch)?ch:String(ch.charCodeAt(0)-55);for(const d of n)m=(m*10+(+d))%97;}return m===1;}
function tcGecerli(s){if(!/^[1-9]\d{10}$/.test(s))return false;const d=s.split('').map(Number);const t1=((d[0]+d[2]+d[4]+d[6]+d[8])*7-(d[1]+d[3]+d[5]+d[7]))%10;const t2=d.slice(0,10).reduce((a,b)=>a+b,0)%10;return((t1+10)%10)===d[9]&&t2===d[10];}
function bilgiCoz(f,raw){const s=String(raw??'').trim();if(!s)return{v:''};
  if(f.tip==='tel'){let d=s.replace(/\D/g,'');if(d.startsWith('90')&&d.length===12)d=d.slice(2);if(d.length===10&&d[0]==='5')d='0'+d;return /^0\d{10}$/.test(d)?{v:d}:{hata:'11 haneli telefon numarası yazın (05xx xxx xx xx).'};}
  if(f.tip==='iban'){const d=s.toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g,'');return ibanGecerli(d)?{v:d}:{hata:'IBAN hatalı. TR ile başlayan 26 karakterli IBAN\'ı kontrol edin.'};}
  if(f.tip==='eposta'){const d=s.toLocaleLowerCase('tr-TR').replace(/\s/g,'');return /^[^@]+@[^@]+\.[a-z]{2,}$/.test(d)?{v:d}:{hata:'E-posta adresi hatalı.'};}
  if(f.tip==='tc'){const d=s.replace(/\D/g,'');return tcGecerli(d)?{v:d}:{hata:'TC kimlik numarası hatalı.'};}
  return{v:s.replace(/\s+/g,' ').slice(0,80)};}
function bilgiGoster(f,v){v=v||'';if(f.tip==='tel'&&/^0\d{10}$/.test(v))return`${v.slice(0,4)} ${v.slice(4,7)} ${v.slice(7,9)} ${v.slice(9)}`;return v;}
function excelBilgi(o){const out={};BILGI.forEach(f=>{if(o[f.k]==null)return;const r=bilgiCoz(f,typeof o[f.k]==='number'?String(o[f.k]):o[f.k]);if(r.v)out[f.k]=r.v;});return out;}
// TC sadece bölge müdürü / işveren: maaslar/{SGK şubesi}.tc
async function tcYukle(list){if(!puantajYetki())return;S.tcler=S.tcler||{};const need=[...new Set(list.map(maasSubesi))].filter(s=>s&&!(s in S.tcler)&&(isIsveren()||(S.me.subeler||[]).includes(s)));
  if(!need.length)return;await Promise.all(need.map(async s=>{try{const d=await getDoc(doc(db,'maaslar',s));S.tcler[s]=(d.exists()&&d.data().tc)||{};}catch(e){S.tcler[s]=null;}}));render();}
// TC personel kaydında; eski kayıtlarda bordrodan gelen TC maaslar'da durabilir (bölge/işveren görür).
function tcOf(p){if(p.tc)return p.tc;const m=S.tcler&&S.tcler[maasSubesi(p)];return m?m[p.id]||'':'';}
// IBAN değişince eski değer, tarih ve sunucu saati (ibanZaman) tutulur; kural bunlar olmadan IBAN değiştirtmez (işveren listesinde görünür).
function bilgiKaydet(p,f,v){const ek={};const iz=f.k==='iban'&&p.iban&&p.iban!==v;if(iz){ek.ibanEski=p.iban;ek.ibanTarih=ymd(today());}
  p[f.k]=v;Object.assign(p,ek);return sirayla('p'+p.id,()=>{arka(setDoc(doc(db,'personel',p.id),{[f.k]:v,...ek,...(iz?{ibanZaman:serverTimestamp()}:{})},{merge:true}));});}
// IBAN'ın değiştiği gün: sunucu saati varsa o (cihaz tarihi değiştirilemez), yoksa eski kayıtlardaki tarih.
function ibanDegisim(p){const z=p.ibanZaman;return z&&typeof z.toDate==='function'?ymd(z.toDate()):(p.ibanTarih||'');}
/* İşverene IBAN listesi: seçilen ayda SGK girişi olanlar + IBAN'ı o ay değişenler. Tüm şubeler tek listede; IBAN bitişik yazılır. Sadece bölge müdürü ve işveren. */
function ibanAyi(){const bu=ayKey(today());return S.ibanAy||(today().getDate()<=15?ayKaydir(bu,-1):bu);}
// O ay ücretsiz izinle SGK günü 0'a düşen kişi (ör. 30 gün ücretsiz izin): bankaya maaş yatmaz, IBAN istenmez.
// Gün sayıları şubelerin ay özetlerinden (çizelge + veri girişi) okunur; özet yüklenene kadar kişi listede kalır.
function ibanOzetYukle(ak){S.ibanOzet=S.ibanOzet||{};if(S.ibanOzet[ak])return;S.ibanOzet[ak]={yuk:true};
  getDocs(query(collection(db,'ozetler'),where('ay','==',ak))).then(q=>{const ui={};const ekle=(pid,n)=>{ui[pid]=(ui[pid]||0)+n;};
    q.docs.forEach(d=>{const x=d.data()||{};Object.entries(x.kisiler||{}).forEach(([pid,k])=>{if(k&&k.UI)ekle(pid,sayi(k.UI));});
      Object.entries(x.veriGun||{}).forEach(([pid,k])=>{Object.values((k&&k.g)||{}).forEach(t=>{if(t&&t.UI)ekle(pid,sayi(t.UI));});});});
    S.ibanOzet[ak]={ui};if(S.tab==='personel')render();}).catch(e=>{console.error(e);S.ibanOzet[ak]={ui:{},hata:true};});}
function ibanSgkGunuYok(p,ak){const o=S.ibanOzet&&S.ibanOzet[ak];if(!o||!o.ui)return false;const n=o.ui[p.id]||0;if(!n)return false;
  const[y,m]=ak.split('-').map(Number);const last=new Date(y,m,0).getDate();let ist=0;for(let d=1;d<=last;d++)if(sgkli(p,new Date(y,m-1,d)))ist++;return ist>0&&sgkGunSayisi(ist,last,n)===0;}
function ibanListe(ak){ibanOzetYukle(ak);const g=[],u=[],n=[];S.personel.forEach(p=>{if(p.giris&&p.giris.slice(0,7)===ak&&p.sgkSube!==SGK_YOK){(ibanSgkGunuYok(p,ak)?n:g).push(p);}else if(p.iban&&ibanDegisim(p).slice(0,7)===ak)u.push(p);});
  const o=(a,b)=>String(subeAdi(maasSubesi(a))).localeCompare(String(subeAdi(maasSubesi(b))),'tr')||String(a.ad).localeCompare(String(b.ad),'tr');return{g:g.sort(o),u:u.sort(o),n:n.sort(o)};}
function ibanMetin(ak){const L=ibanListe(ak);const s=p=>`${adBuyuk(p.ad)} | ${tcOf(p)||'TC yok'} | ${p.iban||'IBAN yok'}`;
  let t=`${ayAdi(ak)} · yeni girenler (${L.g.length})\n`+L.g.map(s).join('\n');if(L.u.length)t+=`\n\nIBAN'ı güncellenenler (${L.u.length})\n`+L.u.map(s).join('\n');return t;}
async function panoyaYaz(t){try{await navigator.clipboard.writeText(t);return true;}catch(e){try{const a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();return ok;}catch(_){return false;}}}
async function ibanExcel(ak){const L=ibanListe(ak);let X;try{X=await xlsxLib();}catch(e){toast('Excel kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edin.');return;}
  const sat=(p,d)=>[adBuyuk(p.ad),tcOf(p)||'',p.iban||'',subeAdi(maasSubesi(p)),d,trTarih(p.giris)];
  const ws=X.utils.aoa_to_sheet([['Ad soyad','TC kimlik no','IBAN','Şube','Durum','SGK giriş'],...L.g.map(p=>sat(p,'Yeni giriş')),...L.u.map(p=>sat(p,'IBAN güncellendi'))]);
  ws['!cols']=[{wch:28},{wch:14},{wch:30},{wch:18},{wch:18},{wch:12}];const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'IBAN');X.writeFile(wb,`IBAN-${ak}.xlsx`);}
function ibanKutusu(){if(!puantajYetki())return'';const bu=ayKey(today());const ak=ibanAyi();const acik=true;const L=ibanListe(ak);const hepsi=[...L.g,...L.u];const eks=hepsi.filter(p=>!p.iban).length;
  let h=`<div class="ibk"><div class="ibk-h" id="ibanBas"><b>İşverene IBAN listesi</b><span class="n">${hepsi.length}</span>${eks?`<span class="chip bad">${eks} IBAN eksik</span>`:''}</div>`;
  if(acik){tcYukle(hepsi);const aylar=[...new Set([ak,...[0,1,2,3,4,5].map(i=>ayKaydir(bu,-i))])].sort().reverse();
    const satir=(p,gun,guncel)=>{const ib=p.iban||'';const tc=tcOf(p);return `<div class="ibr ${ib?'':'eks'}"><div class="n"><b>${esc(adBuyuk(p.ad))}</b><i>${esc(gorevTahmin(p)||'')} · ${esc(subeAdi(maasSubesi(p)))} · ${gun}</i></div><div class="v"><span class="mono">${ib?esc(ib):'IBAN girilmemiş'}</span><span>TC ${tc?esc(tc):'—'}${guncel&&p.ibanEski?' · eski: '+esc(p.ibanEski):''}</span></div></div>`;};
    h+=`<div class="ibk-t"><label>Ay <select id="ibanAy">${aylar.map(a=>`<option value="${a}" ${a===ak?'selected':''}>${ayAdi(a)}</option>`).join('')}</select></label><span>Tüm şubeler tek listede</span></div>
     <div class="ibk-s"><span>Yeni girenler · ${L.g.length}</span><span>SGK girişi bu ay</span></div>${L.g.length?L.g.map(p=>satir(p,'giriş '+trTarih(p.giris),false)).join(''):L.n.length?'':'<div class="ibr"><div class="n"><i>Bu ay SGK girişi olan yok.</i></div></div>'}
     ${L.n.map(p=>`<div class="ibr"><div class="n"><b>${esc(adBuyuk(p.ad))}</b><i>${esc(gorevTahmin(p)||'')} · ${esc(subeAdi(maasSubesi(p)))} · giriş ${trTarih(p.giris)}</i></div><div class="v"><span class="chip">SGK günü 0 · IBAN gerekmiyor</span></div></div>`).join('')}
     <div class="ibk-s"><span>IBAN'ı güncellenenler · ${L.u.length}</span><span>Bu ay değişen</span></div>${L.u.length?L.u.map(p=>satir(p,'değişiklik '+trTarih(ibanDegisim(p)),true)).join(''):'<div class="ibr"><div class="n"><i>Bu ay IBAN değişikliği yok.</i></div></div>'}
     <div class="ibk-f"><button class="btn primary grow" id="ibanKop">WhatsApp için kopyala</button><button class="btn grow" id="ibanXls">Excel indir</button></div>`;}
  return h+'</div>';}
// Personel listesi: tek tablo, her şey satır içinde düzenlenir, değişiklik anında kaydedilir.
// Aynı kişi farklı tarihlerde farklı şubelerde SGK'lı olabilir (şube değişikliği); aynı tarihlerde olamaz.
function tarihCakisir(g1,c1,g2,c2){return (!c2||!g1||g1<=c2)&&(!c1||!g2||g2<=c1);}
function sgkCakisma(p,sgkV,ad,gi=p.giris,ci=p.cikis){if(!sgkV||sgkV===SGK_YOK)return null;
  return S.personel.find(x=>x.id!==p.id&&x.sgkSube&&x.sgkSube!==SGK_YOK&&x.sgkSube!==sgkV&&ayniKisi(x,{...p,ad:ad||p.ad})&&tarihCakisir(gi,ci,x.giris,x.cikis))||null;}
function sgkCakismaMesaj(c){return `${adBuyuk(c.ad)} ${trTarih(c.giris)||'?'} – ${c.cikis?trTarih(c.cikis):'devam'} arası ${subeAdi(c.sgkSube)} şubesinde SGK'lı. Aynı tarihlerde iki şubede SGK olamaz; tarihleri ayırın (örneğin oradan çıkış 1 Eylül, buraya giriş 2 Eylül).`;}
// Telefonda personel listesi: kişi başına kısa satır, dokununca düzenleme penceresi.
function accBaslik(k,ad,n,acik){return `<button class="pkg pkgt" data-acc="${k}"><span>${ad} · ${n}</span><span class="ar">${acik?'▾':'▸'}</span></button>`;}
function mobilListe(A,C,P,Pf,td){const ch=(b,v,c='')=>`<span class="pch ${c}"><b>${b}</b>${esc(v)}</span>`;
  const satir=p=>{const sgk=p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:'';const ana=p.anaSube||S.subeId;const ms=odemeSubesi(p,ayKey(today()));const cik=p.cikis&&p.cikis<td;
    const tar=[p.giris?'Giriş '+trTarih(p.giris):'',p.baslama?'Deneme '+trTarih(p.baslama):'',p.cikis?'Çıkış '+trTarih(p.cikis):'',cik&&!pasifSure(p,td)?'Pasife geçer '+trTarih(pasifTarihi(p.cikis)):''].filter(Boolean).join(' · ');
    const g=gorevTahmin(p);let c=sgk?ch('SGK',subeAdi(sgk)):p.sgkSube===SGK_YOK?ch('SGK','yok'):ch('SGK','seçilmedi','bad');if(ana!==sgk)c+=ch('Çalıştığı',subeAdi(ana));const ek=ekSubeleri(p).filter(x=>x!==ana&&x!==sgk);if(ek.length&&!isSube())c+=ch('Diğer',ek.map(subeAdi).join(', '),'e');if(!isSube()&&ms!==sgk&&(ms!==ana||sgk))c+=ch('Maaş',subeAdi(ms),'f');
    return `<button class="pkr ${cik?'cik':''}" data-pk="${esc(p.id)}"><span class="n">${esc(adBuyuk(p.ad))}<i>${esc(g||'görev yok')} · ${esc(p.sekil||'Tam')}</i></span>${tar?`<span class="d">${tar}</span>`:''}<span class="c">${c}</span></button>`;};
  const acc=S.acc||{};
  let h='';GRUP_SIRA.forEach(g=>{const l=A.filter(p=>(p.grup||'K')===g);if(!l.length)return;h+=`<div class="pkg">${GRUP[g]} · ${l.length}</div>`+l.map(satir).join('');});
  if(C.length){h+=accBaslik('cik','Çıkış yapanlar',C.length,acc.cik);if(acc.cik)h+=C.map(satir).join('');}
  if(P.length){h+=accBaslik('pas','Pasifler',P.length,acc.pas);if(acc.pas)h+=`<div class="pasara"><input class="pasAra" placeholder="Ad ile ara" value="${esc(S.pasAra||'')}" autocomplete="off"></div>`+(Pf.length?Pf.map(satir).join(''):'<div class="pkg">Eşleşen kişi yok</div>');}
  return `<div class="pkl">${h||'<div class="pkg">Henüz personel yok</div>'}</div>`;}
function renderBilgiListesi(){const T=byId('blTbl');const gor=S.pgor||'calisma';const CAL=gor==='calisma';
  const list=sirala(subePersoneli());const td=ymd(today());
  const A=list.filter(p=>!p.cikis||p.cikis>=td);const Pall=list.filter(p=>p.cikis&&p.cikis<td&&pasifMi(p,td,list));const C=list.filter(p=>p.cikis&&p.cikis<td&&!pasifMi(p,td,list));
  const acc=S.acc||{};const qa=isimAnahtar(S.pasAra||'');const Pf=qa?Pall.filter(p=>isimAnahtar(p.ad).includes(qa)):Pall;
  const L=[...A,...(acc.cik?C:[]),...(acc.pas?Pf:[])];const Lsay=[...A,...C];
  const F=CAL?[]:BILGI;
  if(T&&T.contains(document.activeElement)&&T.dataset.n===String(L.length))return; // yazarken yeniden çizme
  tcYukle(L);
  const subeler=tumSubeler();const anaSec=(isIsveren()?S.subeIds:(S.me.subeler||[])).filter(x=>S.subeler[x]);
  const eksik=L.filter(p=>!p.cikis||p.cikis>=td).filter(p=>!p.sgkSube||!gorevBul(p.gorev)).length;
  const opt=(v,t,sel)=>`<option value="${esc(v)}" ${sel?'selected':''}>${esc(t)}</option>`;
  const satir=(p,r)=>{const yaz=personelYazabilir(p);const dis=yaz?'':'disabled';const disB=yaz&&!isSube()?'':'disabled';/* SGK / giriş / çıkış / şube / şekil: sadece bölge müdürü ve işveren */const g=gorevBul(gorevTahmin(p));const cik=p.cikis&&p.cikis<td;const ana=p.anaSube||S.subeId;
    return `<tr data-pid="${esc(p.id)}" class="${cik?'mutr':''}">
     <td class="l nmc"><input class="adI" data-x="ad" value="${esc(adBuyuk(p.ad))}" autocomplete="off" spellcheck="false" ${dis}><span>${CAL||isSube()?'':(ana!==S.subeId?'çalıştığı: '+esc(subeAdi(ana)):'')}${cik?'çıktı':''}</span></td>
     ${CAL?`     <td class="bi"><select data-x="gorev" ${dis}>${g?'':opt('','Seçin',true)}${GOREVLER.map(x=>opt(x.ad,x.ad,g&&g.ad===x.ad)).join('')}</select></td>
     <td class="bi">${`<select data-x="sekil" ${disB} ${g&&g.sekil?'disabled':''}>${g&&g.sekil?opt(g.sekil,'Esnaf',true):['Tam','Part'].map(x=>opt(x,x,(p.sekil==='Part'?'Part':'Tam')===x)).join('')}</select>`}</td>
     <td class="bi sbh"><div class="sbz">${(()=>{const sgk=p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:'';const ms=odemeSubesi(p,ayKey(today()));
       let h=`<label class="chs ${p.sgkSube?'':'bad'}"><b>SGK</b><select data-x="sgkSube" ${disB}>${p.sgkSube?'':opt('','Seçin',true)}${opt(SGK_YOK,'Yok',p.sgkSube===SGK_YOK)}${subeler.map(([sid,ad])=>opt(sid,ad,p.sgkSube===sid)).join('')}</select></label>`;
       h+=`<label class="chs ${ana===sgk?'ayni':''}" title="Çalıştığı şube (çizelgesinde göründüğü)"><b>Çalıştığı</b><select data-x="anaSube" ${disB}>${(anaSec.includes(ana)?anaSec:[ana,...anaSec]).map(x=>opt(x,subeAdi(x),ana===x)).join('')}</select></label>`;
       const ek=ekSubeleri(p).filter(x=>x!==ana&&x!==sgk);if(!isSube()&&(ek.length||ekYetkiVar()))h+=`<label class="chs e" title="Bu şubelerin çizelgesinde de görünür; çalıştığı günün mesaisi o şubeden ödenir. Sadece işveren ve bölge müdürü değiştirir."><b>Diğer</b><button class="chb" data-x="ekSube" ${ekYetkiVar()?'':'disabled'}>${ek.length?esc(ek.map(kisaSubeAd).join(', ')):'+ ekle'}</button></label>`;
       if(!isSube()&&p.paketBasi)h+=`<span class="chs ayni" title="Paket başı çalışan: maaş yok, hangi şubede paket attıysa o şubede ödenir. Muhasebe SGK şubesinde."><b>Paket başı</b></span>`;else if(!isSube()&&((sgk&&sgk!==ana)||ms!==ana||ek.length)){const sec=[[ana,subeAdi(ana)],...(sgk&&sgk!==ana?[[sgk,subeAdi(sgk)]]:[]),...ek.map(x=>[x,subeAdi(x)]),...(ms!==ana&&ms!==sgk&&!ek.includes(ms)?[[ms,subeAdi(ms)]]:[])];
         h+=`<label class="chs f" title="Bu aydan itibaren maaşın ödeneceği şube. Önceki aylar değişmez. Muhasebe SGK şubesinde kalır.${maasSubeGecmisYazi(p)?' Geçmiş: '+esc(maasSubeGecmisYazi(p)):''}"><b>Maaş</b><select data-x="maasYeri" ${dis}>${sec.map(([v,a])=>opt(v,a,ms===v)).join('')}</select></label>`;}
       return h;})()}</div></td>
     <td class="bi"><input type="date" data-x="baslama" title="Deneme başlangıcı (SGK'dan önce çalıştığı ilk gün)" class="${p.baslama?'':'bos'}" value="${esc(p.baslama||'')}" ${dis}></td>
     <td class="bi"><input type="date" data-x="giris" class="${p.giris?'':'bos'}" value="${esc(p.giris||'')}" ${disB}></td>
     <td class="bi"><input type="date" data-x="cikis" class="${p.cikis?'':'bos'}" value="${esc(p.cikis||'')}" ${disB}></td>
`:''}
     ${F.map((f,c)=>`<td class="bi"><input data-r="${r}" data-c="${c}" data-f="${f.k}" value="${esc(bilgiGoster(f,f.k==='tc'?tcOf(p):p[f.k]))}" placeholder="${esc(f.ph)}" inputmode="${f.im}" autocomplete="off" spellcheck="false" ${dis}></td>`).join('')}
     <td class="bi"><button class="mini" data-x="menu" title="Sil / çıkış ver" ${dis}>⋯</button></td></tr>`;};
  let body='';let r=0;const CS=CAL?8:F.length+2;GRUP_SIRA.forEach(g=>{const l=A.filter(p=>(p.grup||'K')===g);if(!l.length)return;body+=`<tr class="grp"><td class="l nmc">${GRUP[g]} · ${l.length}</td><td colspan="${CS}"></td></tr>`;l.forEach(p=>{body+=satir(p,L.indexOf(p));});});
  const accTr=(k,ad,n)=>`<tr class="grp"><td class="l nmc"><button class="accb" data-acc="${k}">${ad} · ${n} ${acc[k]?'▾':'▸'}</button></td><td colspan="${CS}"></td></tr>`;
  if(C.length){body+=accTr('cik','Çıkış yapanlar',C.length);if(acc.cik)C.forEach(p=>{body+=satir(p,L.indexOf(p));});}
  if(Pall.length){body+=accTr('pas','Pasifler',Pall.length);if(acc.pas){body+=`<tr><td class="l" colspan="${CS+1}"><input class="pasAra" placeholder="Ad ile ara" value="${esc(S.pasAra||'')}" autocomplete="off"></td></tr>`;Pf.forEach(p=>{body+=satir(p,L.indexOf(p));});}}
  const h=`<div class="actions"><button class="btn primary grow" id="addP">Personel ekle</button>${isSube()?'':`<button class="btn grow" id="addX">Excel'den yapıştır</button>`}</div>
   <p class="note" style="margin-top:0">${esc(sube().ad)} · ${(()=>{const dis=Lsay.filter(p=>p.anaSube!==S.subeId&&p.sgkSube!==S.subeId&&ekSubeleri(p).includes(S.subeId)).length;return dis&&!isSube()?`${Lsay.length-dis} kişi + ${dis} diğer şubeden`:`${Lsay.length} kişi`;})()}${eksik?` · <b style="color:var(--warn)">${eksik} kişide görev ya da SGK şubesi eksik</b>`:''} · ${CAL?'Hücreye tıklayıp değiştirin, anında kaydedilir.':'Excel\'den kopyalayıp yapıştırabilirsiniz; ilk sütun isimse satırlar isimle eşleşir.'}</p>
   <div class="seg" id="pGor" style="margin-bottom:10px"><button data-v="calisma" class="${CAL?'on':''}">Çalışma bilgileri</button><button data-v="iletisim" class="${CAL?'':'on'}">İletişim ve banka</button></div>
   ${CAL?mobilListe(A,C,Pall,Pf,td):''}
   <div class="tbl-wrap ${CAL?'bl-cal':''}" style="scroll-padding-left:165px"><table class="pt bl sade ${CAL?'cal':''}" id="blTbl" data-n="${L.length}"><thead><tr><th class="l">Ad soyad</th>${CAL?`<th>Görev</th><th>Şekil</th><th class="l">Şubeler</th><th>Deneme</th><th>SGK giriş</th><th>Çıkış</th>`:''}${F.map(f=>`<th>${f.ad}</th>`).join('')}<th></th></tr></thead>
   <tbody>${body||`<tr><td class="l" colspan="${CAL?8:F.length+2}">Henüz personel yok. "Personel ekle" ile başlayın.</td></tr>`}</tbody></table></div>`;
  view(h,()=>{byId('addP').onclick=()=>personelPanel(null);if(byId('addX'))byId('addX').onclick=personelYapistirPanel;document.querySelectorAll('[data-pk]').forEach(b=>b.onclick=()=>personelPanel(b.dataset.pk));const tb=byId('blTbl');document.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>{S.acc={...(S.acc||{}),[b.dataset.acc]:!(S.acc||{})[b.dataset.acc]};render();});document.querySelectorAll('.pasAra').forEach(i=>i.oninput=()=>{S.pasAra=i.value;const s0=i.selectionStart;render();const nI=[...document.querySelectorAll('.pasAra')].find(x=>x.offsetParent);if(nI){nI.focus();try{nI.setSelectionRange(s0,s0);}catch(_){}}});document.querySelectorAll('#pGor button').forEach(b=>b.onclick=()=>{S.pgor=b.dataset.v;render();});
    const pOf=el=>S.personel.find(x=>x.id===el.closest('tr').dataset.pid);
    const yaz1=(p,body,yenidenCiz)=>{const b2=personelYaz(p.id,{...p},body);Object.assign(p,b2);if(yenidenCiz){document.activeElement&&document.activeElement.blur();render();}};
    const geri=(el,msg,v)=>{toast(msg);el.value=v;el.classList.add('bad');setTimeout(()=>el.classList.remove('bad'),2500);};
    tb.querySelectorAll('[data-x]').forEach(el=>{const x=el.dataset.x;
      if(x==='menu'){el.onclick=()=>personelPanel(el.closest('tr').dataset.pid);return;}
      if(x==='ekSube'){el.onclick=()=>{const p=pOf(el);if(p)ekSubePanel(p);};return;}
      if(x==='ad')el.oninput=()=>{const a=el.selectionStart,b=el.selectionEnd;el.value=el.value.toLocaleUpperCase('tr-TR');try{el.setSelectionRange(a,b);}catch(_){}};
      const tarihMi=el.type==='date';
      // Tarih alanı yazılırken her rakamda değişiklik gelir; sadece alandan çıkınca ve yıl tamamsa kaydet.
      if(tarihMi){el.onchange=null;el.onkeydown=e=>{if(e.key==='Enter')el.blur();};}
      el[tarihMi?'onblur':'onchange']=()=>{const p=pOf(el);if(!p)return;const v=el.value;if(tarihMi){if(v===(p[x]||''))return;if(v&&(+v.slice(0,4)<1990||+v.slice(0,4)>2100))return geri(el,'Tarih hatalı, yılı 4 haneli yazın.',p[x]||'');}
        if(x==='ad'){const ad=adBuyuk(v);if(!ad)return geri(el,'Ad soyad boş olamaz.',adBuyuk(p.ad));const c=sgkCakisma(p,p.sgkSube,ad);if(c)return geri(el,sgkCakismaMesaj(c),adBuyuk(p.ad));el.value=ad;if(ad!==p.ad)yaz1(p,{ad});return;}
        if(x==='gorev'){const g=gorevBul(v);if(!g)return;const body={gorev:g.ad,grup:g.grup,sekil:g.sekil||(p.sekil==='Part'?'Part':'Tam')};yaz1(p,gorevSatirYama(p,body),true);return;}
        if(x==='sekil'){yaz1(p,gorevSatirYama(p,{sekil:v}));return;}
        if(x==='maasYeri'){const ak=ayKey(today());const sgk0=p.sgkSube&&p.sgkSube!==SGK_YOK?p.sgkSube:'';const my=v===sgk0&&v!==(p.anaSube||S.subeId)?'sgk':'calistigi';const ym=maasGecmisYama(p,v,ak);yaz1(p,{maasYeri:my,...(ym||{})},true);const hs=odemeSubesi(p,ak);toast(`${ayAdi(ak<BASLANGIC_AY?BASLANGIC_AY:ak)} ayından itibaren maaşı ${subeAdi(hs)} puantajında; önceki aylar değişmez.${hs!==p.sgkSube&&p.sgkSube&&p.sgkSube!==SGK_YOK?` Muhasebe ${subeAdi(p.sgkSube)}'de kalır.`:''}`);return;}
        if(x==='sgkSube'){if(!v)return;const c=sgkCakisma(p,v);if(c)return geri(el,sgkCakismaMesaj(c),p.sgkSube||'');
          const eski=p.sgkSube;const ymS=maasGecmisYama(p,{sgkSube:v},ayKey(today()));yaz1(p,{sgkSube:v,...(ymS||{})},true);if(v!==SGK_YOK&&v!==(p.anaSube||S.subeId)&&v!==eski){toast(`${subeAdi(v)} listesinde de görünür. Çizelgeye o şubenin müdürü "+ ekle" ile ekler.`);}return;}
        if(x==='anaSube'){if(!v||v===p.anaSube)return;const ak=ayKey(today());const ym=maasGecmisYama(p,{anaSube:v},ak);yaz1(p,{anaSube:v,...(ym||{})},true);toast(`${subeAdi(v)} listesine geçti. Çizelgeye "+ ekle" ile eklenir.${ym?` Maaşı ${ayAdi(ak<BASLANGIC_AY?BASLANGIC_AY:ak)} ayından itibaren ${subeAdi(odemeSubesi(p,ak))} puantajında; önceki aylar değişmez.`:''}`);return;}
        if(x==='baslama'){if(v&&p.giris&&v>p.giris)return geri(el,'İşe başlama SGK girişinden sonra olamaz. Boş bırakılırsa SGK girişi kullanılır.',p.baslama||'');yaz1(p,{baslama:v},true);return;}
        if(x==='giris'||x==='cikis'){const gi=x==='giris'?v:p.giris,ci=x==='cikis'?v:p.cikis;if(gi&&ci&&ci<gi)return geri(el,'Çıkış tarihi girişten önce olamaz.',p[x]||'');{const c=sgkCakisma(p,p.sgkSube,p.ad,gi,ci);if(c)return geri(el,sgkCakismaMesaj(c),p[x]||'');}yaz1(p,{[x]:v},x==='cikis');return;}};});
    const inp=(r,c)=>tb.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
    const kaydet=(el,sessiz)=>{const p=L[+el.dataset.r];const f=F[+el.dataset.c];if(!p||!f)return true;const r=bilgiCoz(f,el.value);
      if(r.hata){el.classList.add('bad');el.title=r.hata;if(!sessiz)toast(`${kisaAd(p.ad)} · ${r.hata}`);return false;}
      el.classList.remove('bad');el.title='';el.value=bilgiGoster(f,r.v);const eski=f.k==='tc'?tcOf(p):(p[f.k]||'');if(r.v!==eski)bilgiKaydet(p,f,r.v);return true;};
    const satirSira=[...tb.querySelectorAll('tr[data-pid]')].map(t=>t.querySelector('input[data-c="0"]')).map(i=>i&&+i.dataset.r);
    const asagi=(r,yon)=>{const i=satirSira.indexOf(r);const n=satirSira[i+yon];return n==null?null:n;};
    tb.querySelectorAll('input[data-c]').forEach(el=>{el.onchange=()=>kaydet(el);
      el.onkeydown=e=>{const r=+el.dataset.r,c=+el.dataset.c;let n=null;if(e.key==='Enter'||e.key==='ArrowDown'){const q=asagi(r,1);n=q==null?null:inp(q,c);}else if(e.key==='ArrowUp'){const q=asagi(r,-1);n=q==null?null:inp(q,c);}if(n||e.key==='Enter'){e.preventDefault();if(n){n.focus();n.select();}else el.blur();}};
      el.onpaste=e=>{const t=(e.clipboardData||window.clipboardData).getData('text');if(!/[\t\n]/.test(t.trim()))return;e.preventDefault();
        let M=t.replace(/\r/g,'').split('\n');while(M.length&&!M[M.length-1].trim())M.pop();M=M.map(x=>x.split('\t'));
        const r0=+el.dataset.r,c0=+el.dataset.c;const ad={};L.forEach((p,i)=>ad[isimAnahtar(p.ad)]=i);
        const isimli=M[0].length>1&&M.filter(x=>x[0].trim()).every(x=>ad[isimAnahtar(x[0])]!=null);let n=0,bad=0,yok=0;let rr=r0;
        M.forEach((row,i)=>{const r=isimli?ad[isimAnahtar(row[0])]:(i===0?r0:(rr=asagi(rr,1)));const cells=isimli?row.slice(1):row;if(r==null||r>=L.length){yok++;return;}
          cells.forEach((v,j)=>{const x=inp(r,c0+j);if(!x||x.disabled)return;x.value=v.trim();if(kaydet(x,true))n++;else bad++;});});
        toast(`${n} hücre yapıştırıldı${bad?`, ${bad} hücre hatalı (kırmızı)`:''}${yok?`, ${yok} satır eşleşmedi`:''}.`);};});});}

// Excel'den personel listesi yapıştırma: SGK ŞUBE · ÇALIŞMA ŞEKLİ · ADI SOYADI · GÖREV · GİRİŞ · ÇIKIŞ (başlık varsa sütunlar ona göre bulunur)
function gorevCoz(x){const a=ascii(x).replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();if(!a)return null;if(/esnaf/.test(a))return gorevBul('Esnaf Kurye');if(/surucu|kurye|motor/.test(a))return gorevBul('Kurye');
  if(/^r\b|restoran|^mudur$|^r mudur/.test(a))return gorevBul('R. Müdür');if(/^v\b|vardiya|^v mudur|yardimci/.test(a))return gorevBul('V. Müdür');if(/mutfak|ekip|personel|ekip uyesi/.test(a))return gorevBul('Mutfak');return null;}
function personelYapistirPanel(){const sid=S.subeId;
  openSheet(`<h2>Excel'den personel ekle</h2><div class="sub">${esc(sube().ad)} listesine eklenir. Sütunlar: SGK ŞUBE · ÇALIŞMA ŞEKLİ · ADI SOYADI · GÖREV · GİRİŞ TARİHİ · ÇIKIŞ TARİHİ. Başlık satırını da kopyalarsanız sütun sırası önemli değil.</div>
   <label class="field"><span>Excel'den kopyaladığınız satırlar</span><textarea id="piT" rows="5" placeholder="Excel'de satırları seçip Ctrl+C, buraya Ctrl+V"></textarea></label><div id="piOut"></div>`,()=>{
   const T=byId('piT');let sonuc=[];
   const coz=()=>{let L=T.value.replace(/\r/g,'').split('\n').filter(x=>x.trim()).map(x=>x.split('\t').map(y=>y.trim()));if(!L.length){byId('piOut').innerHTML='';return;}
     let sira={sgk:0,sekil:1,ad:2,gorev:3,giris:4,cikis:5};const bas=L[0].map(x=>ascii(x));
     if(bas.some(x=>/adi|soyad/.test(x))){sira={};bas.forEach((x,j)=>{if(/sgk/.test(x))sira.sgk=j;else if(/calisma|sekil/.test(x))sira.sekil=j;else if(/adi|soyad|isim/.test(x))sira.ad=j;else if(/gorev/.test(x))sira.gorev=j;else if(/giris/.test(x))sira.giris=j;else if(/cikis/.test(x))sira.cikis=j;});L=L.slice(1);}
     const subeAd={};tumSubeler().forEach(([id,a])=>subeAd[isimAnahtar(a)]=id);const mevcut=subePersoneli(sid);const gorulen={};
     sonuc=L.map(r=>{const al=k=>sira[k]!=null?(r[sira[k]]||''):'';const ad=adBuyuk(al('ad'));const o={ad,hata:'',uyari:''};if(!ad){o.hata='İsim yok';return o;}
       const sg=al('sgk');o.sgk=sg?subeAd[isimAnahtar(sg)]:SGK_YOK;if(sg&&!o.sgk)o.hata=`SGK şubesi bulunamadı: ${sg}`;
       const g=gorevCoz(al('gorev'));o.gorev=g;if(!g)o.hata=o.hata||`Görev tanınmadı: ${al('gorev')||'boş'}`;
       const sk=ascii(al('sekil'));o.sekil=g&&g.sekil?g.sekil:(/part/.test(sk)?'Part':'Tam');
       o.giris=al('giris')?trTarihCoz(al('giris')):'';o.cikis=al('cikis')?trTarihCoz(al('cikis')):'';if(al('giris')&&!o.giris)o.hata=o.hata||'Giriş tarihi okunamadı';if(al('cikis')&&!o.cikis)o.hata=o.hata||'Çıkış tarihi okunamadı';
       if(o.giris&&o.cikis&&o.cikis<o.giris)o.hata=o.hata||'Çıkış girişten önce';
       const k=isimAnahtar(ad);const var_=mevcut.find(p=>isimAnahtar(p.ad)===k);if(var_){o.hata=o.hata||'Listede zaten var';}
       if(gorulen[k]){o.uyari='Aynı isim bu yapıştırmada iki kez var';}gorulen[k]=1;
       if(!o.hata&&o.sgk&&o.sgk!==SGK_YOK){const c=S.personel.find(x=>isimAnahtar(x.ad)===k&&x.sgkSube&&x.sgkSube!==SGK_YOK&&x.sgkSube!==o.sgk&&(!x.cikis||x.cikis>=ymd(today())));if(c)o.hata=`Zaten ${subeAdi(c.sgkSube)} şubesinde SGK'lı`;}
       o.sec=!o.hata&&!o.uyari;return o;});
     const iyi=sonuc.filter(x=>!x.hata).length;
     byId('piOut').innerHTML=`<div class="tbl-wrap" style="max-height:46vh;overflow:auto"><table class="pt"><thead><tr><th></th><th class="l">Ad soyad</th><th>Görev</th><th>Şekil</th><th>SGK</th><th>Giriş</th><th>Çıkış</th><th class="l">Durum</th></tr></thead><tbody>${sonuc.map((o,j)=>`<tr class="${o.hata?'oto':''}"><td>${o.hata?'':`<input type="checkbox" data-j="${j}" ${o.sec?'checked':''}>`}</td><td class="l"><b>${esc(o.ad)}</b></td><td>${o.gorev?esc(o.gorev.ad):''}</td><td>${esc(o.sekil||'')}</td><td>${o.sgk===SGK_YOK?'Boş':o.sgk?esc(subeAdi(o.sgk)):''}</td><td>${trTarih(o.giris)}</td><td>${trTarih(o.cikis)}</td><td class="l">${o.hata?`<span class="chip warn">${esc(o.hata)}</span>`:o.uyari?`<span class="chip warn">${esc(o.uyari)}</span>`:'<span class="chip ok">Eklenecek</span>'}</td></tr>`).join('')}</tbody></table></div>
       <div class="row2"><button class="btn grow" id="piNo">Vazgeç</button><button class="btn primary grow" id="piOk" ${iyi?'':'disabled'}>Seçilenleri ekle</button></div>`;
     byId('piNo').onclick=closeSheet;byId('piOut').querySelectorAll('input[data-j]').forEach(c=>c.onchange=()=>{sonuc[+c.dataset.j].sec=c.checked;});
     byId('piOk').onclick=async()=>{const L2=sonuc.filter(o=>!o.hata&&o.sec);if(!L2.length){toast('Seçili kişi yok.');return;}const b=writeBatch(db);const yeni=[];const td=ymd(today());
       L2.forEach(o=>{const pid=slug(o.ad)+'-'+Math.random().toString(36).slice(2,6);const body={ad:o.ad,gorev:o.gorev.ad,grup:o.gorev.grup,sekil:o.sekil,giris:o.giris||'',cikis:o.cikis||'',sgkSube:o.sgk,anaSube:sid};b.set(doc(db,'personel',pid),body);yeni.push({id:pid,...body});});
       try{await b.commit();yeni.forEach(p=>{if(!S.personel.some(x=>x.id===p.id))S.personel.push(p);});
         const hafta=mondayOf(today());const aktif=yeni.filter(p=>(!p.cikis||p.cikis>=td)&&(!p.giris||p.giris<=ymd(addDays(parse(hafta),6))));/* çizelgeye otomatik eklenmez */void aktif;void hafta;
         closeSheet();toast(`${yeni.length} personel eklendi${aktif.length?`, ${aktif.length} kişi bu haftanın çizelgesine kondu`:''}.`);render();}catch(e){yazmaHatasi(e);}};};
   T.oninput=coz;T.focus();});}
// Kişinin çalıştığı şube ya da SGK şubesi değişince eski şube "görünür şubeler"e ve o şubenin ek personel listesine eklenir:
// eski şubenin geçmiş haftaları, özetleri ve puantajı kişiyi kaybetmez (kişi yeni haftalara önerilmez).
function eskiSubeYama(p0,body){const once=[p0.anaSube,p0.sgkSube].filter(x=>x&&x!==SGK_YOK);const sonra=new Set([body.anaSube??p0.anaSube,body.sgkSube??p0.sgkSube,...ekSubeleri({...p0,...body})].filter(x=>x&&x!==SGK_YOK));
  const dusen=once.filter(x=>!sonra.has(x));if(!dusen.length)return{body,dusen};return{body:{...body,gorunurSubeler:[...new Set([...(p0.gorunurSubeler||[]),...dusen])]},dusen};}
function personelYaz(pid,p0,body){const r=eskiSubeYama(p0||{},body);
  sirayla('p'+pid,()=>{const b=writeBatch(db);b.set(doc(db,'personel',pid),r.body,{merge:true});r.dusen.forEach(x=>b.set(doc(db,'ekPersonel',x),{ids:{[pid]:true}},{merge:true}));arka(b.commit());});return r.body;}
// Silmeden önce: kişinin herhangi bir şubede çizelge kaydı var mı (varsa silinmez, çıkış tarihi girilir).
async function personelKaydiVar(p){for(const sid of kisiSubeleri(p)){const q=await getDocs(collection(db,'subeler',sid,'haftalar'));
    if(q.docs.some(d=>{const x=d.data()||{};return (Array.isArray(x.kadro)&&x.kadro.includes(p.id))||Object.values((x.cells||{})[p.id]||{}).some(v=>v);}))return subeAdi(sid)||sid;}
  return null;}
function personelYazabilir(p){const m=S.me.subeler||[];return isIsveren()||!p.anaSube||m.includes(p.anaSube)||m.includes(p.sgkSube);}
function erisimVar(sid){return isIsveren()||(S.me.subeler||[]).includes(sid);}
// Şubenin listesi: o şubede çalışanlar + SGK'sı o şubede olanlar (başka şubede çalışsa da).
function subePersoneli(sid=S.subeId){return S.personel.filter(p=>subedeAktif(p,sid));}
function personelMod(){return `<div class="seg" id="pMod" style="margin-bottom:10px"><button data-v="kart" class="${S.plist?'':'on'}">Kartlar</button><button data-v="liste" class="${S.plist?'on':''}">Bilgi listesi</button></div>`;}
function personelModBagla(){document.querySelectorAll('#pMod button').forEach(b=>b.onclick=()=>{S.plist=b.dataset.v==='liste';tryLS('pm.plist',S.plist?'1':'0');render();});}
function renderPersonel(){return renderBilgiListesi();}
function eskiKartListesi(){const list=sirala(subePersoneli());const td=ymd(today());
  let h=personelMod()+`<div class="actions"><button class="btn primary grow" id="addP">Personel ekle</button></div><p class="note" style="margin-top:0">${esc(sube().ad)} personel listesi. SGK'sı bu şubede olup başka şubede çalışanlar da burada görünür.</p>`;
  if(!list.length)return view(h+`<div class="empty-state"><b>Henüz personel yok</b>"Personel ekle" ile şubenin çalışanlarını girin.</div>`,()=>{personelModBagla();byId('addP').onclick=()=>personelPanel(null);});
  const aktif=list.filter(p=>!p.cikis||p.cikis>=td),cikan=list.filter(p=>p.cikis&&p.cikis<td);
  const row=p=>`<button class="row" data-id="${esc(p.id)}"><div class="av">${esc(bas(p.ad))}</div><div class="m"><b>${esc(p.ad)}</b><span>${esc(gorevTahmin(p)||'Görev seçilmemiş')}${p.sekil==='Part'?' · Part':''} · SGK: ${p.sgkSube===SGK_YOK?'yok':p.sgkSube?esc(subeAdi(p.sgkSube)):'<b style="color:var(--warn)">seçilmemiş</b>'}${p.anaSube&&p.anaSube!==S.subeId?' · çalıştığı: '+esc(subeAdi(p.anaSube)):''}${p.giris?' · giriş '+trTarih(p.giris):''}</span></div>
    <div class="r">${p.cikis?`<span class="chip ${p.cikis<td?'mut':'warn'}">Çıkış ${trTarih(p.cikis)}</span>`:''}</div></button>`;
  GRUP_SIRA.forEach(g=>{const l=aktif.filter(p=>(p.grup||'K')===g);if(l.length)h+=`<div class="sec">${GRUP[g]} · ${l.length}</div><div class="card list">${l.map(row).join('')}</div>`;});
  if(cikan.length)h+=`<div class="sec">Çıkış yapanlar · ${cikan.length}</div><div class="card list">${cikan.map(row).join('')}</div>`;
  view(h,()=>{personelModBagla();byId('addP').onclick=()=>personelPanel(null);document.querySelectorAll('.row[data-id]').forEach(b=>b.onclick=()=>personelPanel(b.dataset.id));});}
// Kişi kartındaki geçmiş: aynı kişinin tüm kayıtları (çalışma dönemleri), görev geçmişi ve (yetkisi olana) maaş geçmişi.
function personelGecmisHtml(p){const td=ymd(today());const K=S.personel.filter(x=>x.id===p.id||ayniKisi(x,p)).sort((a,b)=>String(ilkGun(a)||'').localeCompare(String(ilkGun(b)||'')));
  const don=K.map(x=>{const sgk=x.sgkSube&&x.sgkSube!==SGK_YOK?x.sgkSube:'';const ana=x.anaSube||'';const yer=esc(subeAdi(ana)||subeAdi(sgk)||'—')+(sgk&&sgk!==ana?` <small>(SGK ${esc(subeAdi(sgk))})</small>`:'');
    return `<div class="gcr"><span>${esc(trTarih(ilkGun(x))||'?')} – ${x.cikis?esc(trTarih(x.cikis)):'devam'}</span><span>${yer} · ${esc(gorevTahmin(x)||'—')}</span>${x.id===p.id?'<i>bu kayıt</i>':`<button class="mini" data-gk="${esc(x.id)}">Aç</button>`}</div>`;}).join('');
  const gg=gorevGecmisYazi(p);
  return `<div class="field gcm"><span>Geçmiş</span><div class="gcb"><b>Çalışma dönemleri</b>${don}</div>
    <div class="gcb"><b>Görev</b><div class="gcr"><span>${gg?esc(gg):esc(gorevTahmin(p)||'—')+(p.sekil&&p.sekil!=='Tam'?' ('+esc(p.sekil)+')':'')+' · değişiklik yok'}</span></div></div>
    ${isSube()?'':'<div class="gcb"><b>Maaş</b><div class="gcr" id="pMaasG"><span class="note" style="margin:0">Yükleniyor…</span></div></div>'}</div>`;}
async function personelMaasGecmisi(p){document.querySelectorAll('[data-gk]').forEach(b=>b.onclick=()=>{closeSheet();personelPanel(b.dataset.gk);});
  const el=byId('pMaasG');if(!el)return;const K=S.personel.filter(x=>x.id===p.id||ayniKisi(x,p));const ay={};let once=null;
  for(const x of K){const subs=[...new Set([...Object.values(x.maasSubeGecmis||{}),odemeSubesiEski(x)].filter(Boolean))];
    for(const sid of subs){try{const d=await getDoc(doc(db,'maaslar',sid));const m=d.exists()?d.data():{};const g=(m.netGecmis||{})[x.id]||{};Object.entries(g).forEach(([k,v])=>{if(sayi(v))ay[k]=sayi(v);});const n=sayi((m.net||{})[x.id]);if(n&&once==null)once=n;}catch(e){}}}
  if(!byId('pMaasG'))return;const ks=Object.keys(ay).sort();const L=ks.filter((k,i)=>i===0||ay[k]!==ay[ks[i-1]]).map(k=>`${ayAdi(k)}: ${tl0(ay[k])}`);
  if(once!=null&&(!ks.length||(ks[0]>BASLANGIC_AY&&once!==ay[ks[0]])))L.unshift(`${ks.length?'Önce':'Kayıtlı'}: ${tl0(once)}`);// ilk kayıt başlangıç ayındaysa eski değer hiçbir aya uygulanmaz
  byId('pMaasG').innerHTML=`<span>${L.length?esc(L.join(' · ')):'Maaş girilmemiş'}</span>`;}
function personelPanel(id,gr,opt={}){const eskiK=!id&&opt.eski?S.personel.find(x=>x.id===opt.eski):null;// yeniden işe giriş: eski kaydın bilgileriyle yeni kayıt
  const p=id?S.personel.find(x=>x.id===id):eskiK?{ad:eskiK.ad,grup:eskiK.grup||'K',gorev:eskiK.gorev||'',sekil:eskiK.sekil||'Tam',giris:isSube()?'':ymd(today()),cikis:'',anaSube:isSube()?S.subeId:(eskiK.anaSube||S.subeId),sgkSube:isSube()?'':(eskiK.sgkSube||'')}:{ad:'',grup:gr||'K',gorev:'',sekil:'Tam',giris:isSube()?'':ymd(today()),cikis:'',anaSube:S.subeId};if(!p)return;
  const yaz=personelYazabilir(p);const yazB=yaz&&!isSube();/* SGK şubesi, çalıştığı şube, şekil, SGK giriş, çıkış: sadece bölge müdürü ve işveren (şube müdürü görür) */const gv=id||eskiK?gorevTahmin(p):'';const sgk=p.sgkSube||'';const subeler=tumSubeler();
  const anaSec=(isIsveren()?S.subeIds:(S.me.subeler||[])).filter(x=>S.subeler[x]);
  const gorevOpt=GOREVLER.filter(g=>id||!gr||g.grup===gr).map(g=>`<option value="${esc(g.ad)}" ${gv===g.ad?'selected':''}>${esc(g.ad)}</option>`).join('');
  const buAy=ayKey(today());const gayOpt=(()=>{const L=[];for(let k=BASLANGIC_AY;k<=buAy;k=ayKaydir(k,1))L.push(k);return L.reverse().map(k=>`<option value="${k}" ${k===buAy?'selected':''}>${esc(ayAdi(k))}</option>`).join('');})();
  openSheet(`<h2>${id?'Personeli düzenle':eskiK?'Yeniden işe giriş':'Yeni personel · '+GRUP[gr||'K']}</h2><div class="sub">${yaz?'İsim puantaj ve bordro eşleşmesinde kullanılır, bordrodaki gibi yazın.':'Bu kişi başka bir şubeye kayıtlı; bilgilerini o şube düzenler.'}</div>
   <label class="field"><span>Ad soyad (büyük harf)</span><input id="pAd" value="${esc(adBuyuk(p.ad))}" autocomplete="off" autocapitalize="characters" ${yaz?'':'disabled'}></label>${id?'':'<div id="pEski"></div>'}
   <label class="field"><span>Görev</span><select id="pGorev" ${yaz?'':'disabled'}><option value="">Seçin</option>${gorevOpt}</select></label>
   <div id="pSekilW"><span class="lbl">Çalışma şekli</span><div class="seg" id="pSekil">${['Tam','Part'].map(x=>`<button data-v="${x}" class="${(p.sekil==='Part'?'Part':'Tam')===x?'on':''}" ${yazB?'':'disabled'}>${x}</button>`).join('')}</div></div>
   ${id&&yaz?`<label class="field" id="pGayW" hidden><span>Yeni görev / şekil hangi aydan geçerli</span><select id="pGay">${gayOpt}</select><small class="note" style="margin:4px 0 0;display:block">Önceki aylar eski görevle kalır. Yanlış girilmiş görevi düzeltiyorsanız ${esc(ayAdi(BASLANGIC_AY))} seçin.</small></label>`:''}
   <label class="field"><span>SGK şubesi (maaşı bu şubenin puantajında)</span><select id="pSgk" ${yazB?'':'disabled'}><option value="" ${!sgk?'selected':''}>Seçin</option><option value="${SGK_YOK}" ${sgk===SGK_YOK?'selected':''}>Boş (SGK şubesi yok)</option>${subeler.map(([sid,ad])=>`<option value="${esc(sid)}" ${sgk===sid?'selected':''}>${esc(ad)}</option>`).join('')}</select></label>
   <label class="field"><span>Çalıştığı şube (çizelgesinde göründüğü)</span><select id="pAna" ${yazB?'':'disabled'}>${(anaSec.includes(p.anaSube||S.subeId)?anaSec:[p.anaSube||S.subeId,...anaSec]).map(x=>`<option value="${esc(x)}" ${(p.anaSube||S.subeId)===x?'selected':''}>${esc(subeAdi(x))}</option>`).join('')}</select></label>
   <div class="fgrid"><label class="field"><span>SGK giriş</span><input id="pGiris" type="date" value="${esc(p.giris||'')}" ${yazB?'':'disabled'}></label><label class="field"><span>Çıkış (boşsa çalışıyor)</span><input id="pCikis" type="date" value="${esc(p.cikis||'')}" ${yazB?'':'disabled'}></label></div>
   <label class="field"><span>${isSube()?'İlk çalıştığı gün (deneme başlangıcı)':"Deneme başlangıcı (SGK'dan önce çalıştığı ilk gün, boşsa SGK girişi)"}</span><input id="pBas" type="date" value="${esc(p.baslama||'')}" ${yaz?'':'disabled'}></label>
   ${id&&!isSube()?(()=>{const ek=ekSubeleri(p);return `<div class="field"><span>Diğer çalıştığı şubeler</span><div class="ekbox">${ek.length?ek.map(x=>`<span class="pch e"><b>${esc(subeAdi(x))}</b></span>`).join(''):'<span class="note" style="margin:0">Yok</span>'}${ekYetkiVar()?'<button class="btn small" id="pEk">Değiştir</button>':''}</div></div>`;})():''}
   ${id&&!isSube()?(()=>{const ak=ayKey(today());const ms=odemeSubesi(p,ak);const ids=[...new Set([p.anaSube||S.subeId,sgk!==SGK_YOK?sgk:'',...ekSubeleri(p),ms].filter(Boolean))];const gy=maasSubeGecmisYazi(p);
     return `<label class="field"><span>Maaşın ödendiği şube · ${ayAdi(ak<BASLANGIC_AY?BASLANGIC_AY:ak)} ayından itibaren</span><select id="pMs" ${yaz?'':'disabled'}>${ids.map(i=>`<option value="${esc(i)}" ${i===ms?'selected':''}>${esc(subeAdi(i))}</option>`).join('')}</select></label><p class="note" style="margin-top:-4px">Önceki aylar değişmez. Muhasebe SGK şubesinde kalır.${gy?' Geçmiş: '+esc(gy):''}</p>`;})():''}
   ${isSube()?`<p class="note" style="margin-top:-2px">SGK şubesi, SGK giriş, çıkış ve çalışma şeklini bölge müdürü ve işveren girer.</p>`:''}
   ${id&&!p.cikis&&yazB?'<button class="btn" id="pOut" style="margin-top:8px;width:100%">Bugün itibarıyla çıkış ver</button>':''}
   ${id&&p.cikis&&p.cikis<ymd(today())&&!S.personel.some(x=>x.id!==p.id&&ayniKisi(x,p)&&!(x.cikis&&x.cikis<ymd(today())))?'<button class="btn" id="pYeni" style="margin-top:8px;width:100%">Yeniden işe al</button>':''}
   ${id?personelGecmisHtml(p):''}
   <div id="pWarn"></div><div class="row2">${id&&(isIsveren()||(isBolge()&&(S.me.subeler||[]).includes(p.anaSube)))?'<button class="btn danger" id="pDel">Personeli sil</button>':''}<button class="btn grow" id="pNo">${yaz?'Vazgeç':'Kapat'}</button>${yaz?'<button class="btn primary grow" id="pOk">Kaydet</button>':''}</div>`,sh=>{
   sh.querySelectorAll('#pSekil button').forEach(bt=>bt.onclick=()=>{sh.querySelectorAll('#pSekil button').forEach(x=>x.classList.remove('on'));bt.classList.add('on');});
   const G=byId('pGorev');const gayW=byId('pGayW');const sekilSec=()=>{const g=gorevBul(G.value);return g&&g.sekil?g.sekil:sh.querySelector('#pSekil .on').dataset.v;};
   const gorevDeg=()=>{const g=gorevBul(G.value);return !!g&&(g.ad!==gv||sekilSec()!==(p.sekil||'Tam'));};
   const tog=()=>{const g=gorevBul(G.value);byId('pSekilW').hidden=!!(g&&g.sekil);if(gayW)gayW.hidden=!gorevDeg();};G.onchange=tog;tog();sh.querySelectorAll('#pSekil button').forEach(bt=>bt.addEventListener('click',tog));
   const py=byId('pYeni');if(py)py.onclick=()=>{closeSheet();personelPanel(null,null,{eski:p.id});};if(id)personelMaasGecmisi(p);
   const po=byId('pOut');if(po)po.onclick=()=>{byId('pCikis').value=ymd(today());po.hidden=true;};byId('pNo').onclick=closeSheet;const pe=byId('pEk');if(pe)pe.onclick=()=>ekSubePanel(p);const W=byId('pWarn');if(!yaz)return;
   byId('pAd').oninput=e=>{const el=e.target,a=el.selectionStart,b=el.selectionEnd;el.value=el.value.toLocaleUpperCase('tr-TR');try{el.setSelectionRange(a,b);}catch(_){}};
   let eskiB=null;if(eskiK){const o={},liste=[];BILGI.forEach(f=>{const v=f.k==='tc'?tcOf(eskiK):eskiK[f.k];if(v){o[f.k]=v;liste.push(f.ad);}});eskiB={o,liste:liste.length?liste:['kayıtlı bilgi yok']};}
   if(!id){const E=byId('pEski');const td0=ymd(today());
     const adaylar=()=>{const q=isimAnahtar(byId('pAd').value);if(q.length<3)return[];const k=[];S.personel.filter(x=>x.cikis&&x.cikis<td0&&isimAnahtar(x.ad).includes(q)).sort((a,b)=>b.cikis.localeCompare(a.cikis)).forEach(x=>{if(!k.some(y=>ayniKisi(y,x)))k.push(x);});return k.slice(0,3);};
     const ciz=()=>{if(eskiB){E.innerHTML=`<div class="note" style="margin:0 0 8px">Kayıtlı bilgiler yeni kayda eklenecek: ${eskiB.liste.map(esc).join(', ')}.</div>`;return;}
       const a=adaylar();E.innerHTML=a.map(x=>`<button class="btn small" data-e="${esc(x.id)}" style="margin:0 6px 8px 0">${esc(adBuyuk(x.ad))} · çıkış ${trTarih(x.cikis)} — bilgilerini getir</button>`).join('');
       E.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const m=S.personel.find(x=>x.id===b.dataset.e);if(!m)return;const o={},liste=[];BILGI.forEach(f=>{const v=f.k==='tc'?tcOf(m):m[f.k];if(v){o[f.k]=v;liste.push(f.ad);}});byId('pAd').value=adBuyuk(m.ad);eskiB={o,liste:liste.length?liste:['kayıtlı bilgi yok']};ciz();});};
     byId('pAd').addEventListener('input',()=>{eskiB=null;ciz();});ciz();}
   byId('pOk').onclick=()=>{const ad=adBuyuk(byId('pAd').value);if(!ad){W.innerHTML='<div class="confirm">Ad soyad gerekli.</div>';return;}
     const g=gorevBul(G.value);if(!g){W.innerHTML='<div class="confirm">Görev seçin.</div>';return;}
     const subeK=isSube();// şube müdürü: SGK / giriş / çıkış / şube / şekil değişmez (yeni kişide boş kalır, bölge müdürü girer)
     const sgkV=subeK?(id?(p.sgkSube||''):''):byId('pSgk').value;if(!subeK&&!sgkV){W.innerHTML='<div class="confirm">SGK şubesini seçin. SGK şubesi yoksa "Boş" seçeneğini seçin.</div>';return;}
     if(subeK&&!id&&!byId('pBas').value){W.innerHTML='<div class="confirm">İlk çalıştığı günü girin.</div>';return;}
     // Bir kişi sadece bir şubede SGK'lı olabilir: aynı isim ya da TC'li başka kayıt başka şubede SGK'lıysa kaydetme.
     if(!subeK&&sgkV!==SGK_YOK){const tcK=p.tc||'';const cak=sgkCakisma({...p,id,tc:tcK},sgkV,ad,byId('pGiris').value,byId('pCikis').value);
       if(cak){W.innerHTML=`<div class="confirm bad">${esc(sgkCakismaMesaj(cak))} Aynı dönemde başka şubede de çalışıyorsa SGK şubesini ${esc(subeAdi(cak.sgkSube))} bırakın, "Çalıştığı şube"yi değiştirin.</div>`;return;}}
     const anaS=subeK?(id?(p.anaSube||S.subeId):S.subeId):(byId('pAna').value||S.subeId);const ayni=subePersoneli(anaS).find(x=>x.id!==id&&isimAnahtar(x.ad)===isimAnahtar(ad)&&!(x.cikis&&x.cikis<ymd(today())));if(ayni&&!W.dataset.ok){W.dataset.ok='1';W.innerHTML=`<div class="confirm">${esc(subeAdi(anaS))} listesinde bu isimde biri zaten var. Aynı kişiyse yeni kayıt açmayın. Farklı kişiyse tekrar Kaydet'e basın.</div>`;return;}
     const bilgi={...((!id&&eskiB&&eskiB.o)||{})};
     const giris=subeK?(id?(p.giris||''):''):byId('pGiris').value,cikis=subeK?(id?(p.cikis||''):''):byId('pCikis').value;if(giris&&cikis&&cikis<giris){W.innerHTML='<div class="confirm">Çıkış tarihi girişten önce olamaz.</div>';return;}
     const sekil=g.sekil||(subeK?(id&&p.sekil&&p.sekil!=='Esnaf kurye'?p.sekil:'Tam'):sh.querySelector('#pSekil .on').dataset.v);const ana=anaS;
     const bas=byId('pBas').value;if(bas&&giris&&bas>giris){W.innerHTML='<div class="confirm">Deneme başlangıcı SGK girişinden sonra olamaz.</div>';return;}
     const body={ad,gorev:g.ad,grup:g.grup,sekil,giris,cikis,baslama:bas,sgkSube:sgkV,anaSube:ana,...bilgi};
     if(subeK&&id)['giris','cikis','sgkSube','anaSube'].forEach(k=>delete body[k]);// şube müdürü bu alanlara dokunmaz (kural da reddeder)
     if(id){if(gorevDeg()){const y=gorevGecmisYama(p,{gorev:g.ad,grup:g.grup,sekil},byId('pGay')?byId('pGay').value:buAy);if(y)Object.assign(body,y);else Object.assign(body,{gorev:p.gorev,grup:p.grup,sekil:p.sekil});}else if(p.gorevGecmis){Object.assign(body,{gorev:p.gorev,grup:p.grup,sekil:p.sekil});}}
     if(id&&!subeK){const akM=ayKey(today());const msEl=byId('pMs');const ms0=odemeSubesi(p,akM);const ym=msEl&&msEl.value!==ms0?maasGecmisYama(p,msEl.value,akM):maasGecmisYama(p,{anaSube:ana,sgkSube:sgkV},akM);if(ym)Object.assign(body,ym);}if(p.sira!=null)body.sira=p.sira;const pid=id||(slug(ad)+'-'+Math.random().toString(36).slice(2,6));
     const p0={...p};const body2=personelYaz(pid,id?p0:{},body);if(!id)S.personel.push({id:pid,...body2});else Object.assign(p,body2);closeSheet();
     const ilkHafta=mondayOf(giris&&parse(giris)>today()?parse(giris):today());
     if(opt.sonra)opt.sonra(pid);
     const eskiAna=id?p0.anaSube:null,eskiSgk=id?p0.sgkSube:null;
     void ilkHafta;/* çizelgeye otomatik eklenmez: şube müdürü "+ ekle" ile ekler (opt.sonra: çizelgeden eklenen kişi zaten eklenir) */
     let sgkNot='';if(sgkV&&sgkV!==SGK_YOK&&sgkV!==ana&&(!id||eskiSgk!==sgkV))sgkNot=`. ${subeAdi(sgkV)} listesinde de görünür`;
     toast((id?'Personel güncellendi':`Personel eklendi${opt.sonra?'':'. Çizelgeye "+ ekle" ile eklenir'}`)+sgkNot+'.');};
   const del=byId('pDel');if(del)del.onclick=()=>{if(!del.dataset.ok){del.dataset.ok='1';del.textContent='Evet, sil';W.innerHTML='<div class="confirm">Kişi şirketin personel listesinden silinir. Ayrılan biri için silmek yerine çıkış tarihi girin.</div>';return;}
     del.disabled=true;del.textContent='Kontrol ediliyor…';personelKaydiVar(p).then(var_=>{if(var_){del.disabled=false;del.textContent='Personeli sil';del.dataset.ok='';W.innerHTML=`<div class="confirm bad">${esc(var_)} çizelgesinde bu kişinin kaydı var, silinemez: silinirse geçmiş haftaları ve puantajı hesaplardan düşer. Ayrıldıysa çıkış tarihi girin.</div>`;return;}
       sirayla('p'+id,()=>{arka(deleteDoc(doc(db,'personel',id)));});closeSheet();toast(`${p.ad} silindi.`);}).catch(e=>{del.disabled=false;del.textContent='Personeli sil';yazmaHatasi(e);});};});}

/* ================= Ay sonu (şube müdürü) ================= */
// Ay sonu kontrol listesi
const YUKSEK_FM=60;
// Hiç açılmamış hafta (ör. sistem 3 Ağustos'ta başlarken 27 Tem – 2 Ağu): o haftaya düşen ay günleri de boş gün sayılır, doldurulmadan ay kapatılamaz.
// Şube müdürü kapalı haftaları yüklemez; onlar haftaDurum'da kayıtlı olduğu için "hiç yok" sayılmaz.
const haftaHicYok=wid=>!S.haftalar[wid]&&!((S.haftaDurum&&S.haftaDurum.w)||{})[wid];
function ayKontrolleri(ak,R,sb,d){const[y,m]=ak.split('-').map(Number);const ilk=new Date(y,m-1,1),son=new Date(y,m,0);const teyit=d.teyit||{};
  const K={bos:[],yedi:[],eksi:[],yuksek:[],izin:[],gc:[],yok:[]};
  R.forEach(({p,a})=>{for(let dd=new Date(ilk);dd<=son;dd=addDays(dd,1)){if(!employed(p,dd))continue;const wid=mondayOf(dd),i=(dd.getDay()+6)%7;const v=cellOf(p.id,wid,i);if((v==null||v==='')&&(weekHasEntry(p.id,wid)||(!isEsnaf(p)&&haftaHicYok(wid)))&&bosSayilir(p,dd))K.bos.push({p,wid,d:new Date(dd)});}
    for(let w=parse(mondayOf(ilk));w<=son;w=addDays(w,7)){const wid=ymd(w);const ds=weekDays(wid);if(ds.every((dd,i)=>employed(p,dd)&&isShift(cellOf(p.id,wid,i)))){const key=p.id+'_'+wid;const t7=(S.haftalar[wid]||{}).teyit7||{};K.yedi.push({p,wid,key,ok:!!t7[p.id]});}}
    if(!a.part&&!a.esnaf){if(a.fm<0)K.eksi.push({p,a});if(a.fm>YUKSEK_FM)K.yuksek.push({p,a});}
    const iz=['R','UI','YI','B'].filter(k=>a.kod[k]);if(iz.length)K.izin.push({p,a,iz});
    const ic=t=>t&&t.slice(0,7)===ak;if(ic(p.giris)||ic(p.cikis)||ic(p.baslama))K.gc.push({p});});
  const ids=ayKadroIds(ak);subePersoneli().filter(p=>p.anaSube===S.subeId&&aktifAyda(p,ak)&&!ids.has(p.id)&&!isEsnaf(p)).forEach(p=>K.yok.push({p}));
  return K;}
function ayKontrolHtml(K,ak,kilit,kon={}){const tik=(key,t)=>`<label class="kchip ${kon[key]?'on':''}"><input type="checkbox" data-kon="${esc(key)}" ${kon[key]?'checked':''} ${kilit?'disabled':''}> ${t}</label>`;const gunY=dd=>`${dd.getDate()} ${AYK[dd.getMonth()]} ${GUN[(dd.getDay()+6)%7]}`;const ad=p=>esc(kisaAd(p.ad));
  const bolum=(cls,baslik,aciklama,ic)=>`<div class="kt ${cls}"><div class="kth"><b>${baslik}</b><span>${aciklama}</span></div><div class="kti">${ic}</div></div>`;
  const git=(wid,t)=>`<button class="kchip" data-git="${wid}">${t}</button>`;let h='';
  if(K.bos.length)h+=bolum('kirmizi',`Boş günler · ${K.bos.length}`,'Bu günler doldurulmadan ay kapatılamaz. Tıklayınca o haftanın çizelgesi açılır.',K.bos.map(x=>git(x.wid,`${ad(x.p)} · ${gunY(x.d)}`)).join(''));
  if(K.yedi.length)h+=bolum(K.yedi.every(x=>x.ok)?'yesil':'sari',`Haftalık izin kullanmadan 7 gün çalışanlar · ${K.yedi.length}`,'Doğruysa teyit edin. Teyit edilmeden ay kapatılamaz.',K.yedi.map(x=>`<label class="kchip ${x.ok?'on':''}"><input type="checkbox" data-teyit="${esc(x.key)}" ${x.ok?'checked':''} ${kilit?'disabled':''}> ${ad(x.p)} · ${rangeLabel(x.wid)}</label>`).join(''));
  const tamam=(L,f)=>L.every(x=>kon[f(x)]);
  if(K.eksi.length)h+=bolum(tamam(K.eksi,x=>'eksi_'+x.p.id)?'yesil':'sari',`Eksi fazla mesai · ${K.eksi.length}`,'Eksik çalışma mı, yanlış saat mi kontrol edip işaretleyin.',K.eksi.map(x=>tik('eksi_'+x.p.id,`${ad(x.p)} · ${sg(x.a.fm)} sa`)).join(''));
  if(K.yuksek.length)h+=bolum(tamam(K.yuksek,x=>'yuksek_'+x.p.id)?'yesil':'sari',`Çok yüksek fazla mesai (${YUKSEK_FM} saatin üstü) · ${K.yuksek.length}`,'Saatlerin doğru girildiğini kontrol edip işaretleyin.',K.yuksek.map(x=>tik('yuksek_'+x.p.id,`${ad(x.p)} · ${sg(x.a.fm)} sa`)).join(''));
  if(K.izin.length)h+=bolum(tamam(K.izin,x=>'izin_'+x.p.id)?'yesil':'sari',`Rapor ve izinler · ${K.izin.length}`,'Rapor evrakı ve izin dilekçeleri tamamsa işaretleyin.',K.izin.map(x=>tik('izin_'+x.p.id,`${ad(x.p)} · ${x.iz.map(k=>`${x.a.kod[k]} ${KOD[k].ad.toLocaleLowerCase('tr-TR')}`).join(', ')}`)).join(''));
  if(K.gc.length)h+=bolum(tamam(K.gc,x=>'gc_'+x.p.id)?'yesil':'sari',`Ay içinde giren / çıkan · ${K.gc.length}`,'Tarihler doğruysa işaretleyin.',K.gc.map(({p})=>tik('gc_'+p.id,`${ad(p)} · ${[p.baslama&&p.baslama.slice(0,7)===ak?'deneme '+trTarih(p.baslama):'',p.giris&&p.giris.slice(0,7)===ak?'giriş '+trTarih(p.giris):'',p.cikis&&p.cikis.slice(0,7)===ak?'çıkış '+trTarih(p.cikis):''].filter(Boolean).join(' · ')}`)).join(''));
  if(K.yok.length)h+=bolum(tamam(K.yok,x=>'yok_'+x.p.id)?'yesil':'sari',`Bu ay çizelgede hiç görünmeyenler · ${K.yok.length}`,'Personel listesinde aktif ama çizelgeye eklenmemiş. Unutulmadıysa işaretleyin.',K.yok.map(({p})=>tik('yok_'+p.id,ad(p))).join(''));
  return h?`<div class="sec">Kontrol edilecekler · hepsi işaretlenmeden ay kapatılamaz</div><div class="card kcard">${h}</div>`:`<div class="banner ok">Kontrol edilecek bir şey yok.</div>`;}
function renderAy(){const ak=aktifAy('ay');S.ay=ak;const sb=sube();const kisiler=sirala(ayKadrosu(ak));const R=kisiler.map(p=>({p,a:ayHesap(p,ak,sb)}));
  const d=S.aylar[ak]||{durum:'taslak'};const kilit=d.durum==='sube_onay'||d.durum==='bolge_onay';
  const topFm=R.reduce((s,x)=>s+x.a.fm,0),rap=R.reduce((s,x)=>s+(x.a.kod.R||0),0),ui=R.reduce((s,x)=>s+(x.a.kod.UI||0),0),bos=R.reduce((s,x)=>s+x.a.bos,0);
  let h=`<div class="weeknav"><button class="nav-arrow" id="prevM">‹</button><div class="ttl">${ayAdi(ak)}<small>${DURUM[d.durum].ad}</small></div><button class="nav-arrow" id="nextM">›</button></div>`;
  if(sb.fmDonem==='hafta'){const L=fmHaftalari(ak);const bitis=ymd(addDays(parse(L[L.length-1]),6));h+=`<div class="banner ${ymd(today())<=bitis&&!kilit?'':'ok'}">Fazla mesai dönemi: ${fmDonemYazi(ak,sb)}.${ymd(today())<=bitis&&!kilit?` Ayı ${trTarih(bitis)} çizelgesi bittikten sonra kapatın.`:''}</div>${fmSecici(ak,sb)}`;}
  if(d.durum==='geri')h+=`<div class="banner bad">Bölge müdürü geri gönderdi${d.not?': "'+esc(d.not)+'"':''}. Düzeltip ayı yeniden kapatın.</div>`;
  if(d.durum==='sube_onay')h+=`<div class="banner">Ay kapatıldı, bölge müdürünün onayı bekleniyor. Bu ayın günleri kilitli.</div>`;
  if(d.durum==='bolge_onay')h+=`<div class="banner ok">Bölge müdürü onayladı. Puantaj işverene gönderildi.</div>`;
  h+=`<div class="kpis"><div class="kpi"><span>Toplam fazla mesai</span><b>${fmt(topFm)} sa</b></div><div class="kpi"><span>Çalışan</span><b>${R.length}</b></div><div class="kpi"><span>Rapor / Ücr. izin</span><b>${rap} / ${ui} gün</b></div><div class="kpi"><span>Boş gün</span><b style="color:${bos?'var(--warn)':'var(--ok)'}">${bos?bos+' gün':'Yok'}</b></div></div>`;
  const K=ayKontrolleri(ak,R,sb,d);const kon=d.kontrol||{};
  const isaretsiz=[...K.eksi.map(x=>'eksi_'+x.p.id),...K.yuksek.map(x=>'yuksek_'+x.p.id),...K.izin.map(x=>'izin_'+x.p.id),...K.gc.map(x=>'gc_'+x.p.id),...K.yok.map(x=>'yok_'+x.p.id)].filter(k=>!kon[k]).length;
  const onceki=ayKaydir(ak,-1);const oncekiAcik=onceki>=BASLANGIC_AY&&!['sube_onay','bolge_onay'].includes((S.aylar[onceki]||{}).durum);
  const engel=oncekiAcik?`${ayAdi(onceki)} kapatılmadan`:K.bos.length?`${K.bos.length} boş gün doldurulmadan`:K.yedi.some(x=>!x.ok)?`7 gün çalışılan haftalar teyit edilmeden`:isaretsiz?`Kontrol edilecekler listesinde ${isaretsiz} madde işaretlenmeden`:'';
  if(R.length)h+=ayKontrolHtml(K,ak,kilit,kon);
  let son=null;R.forEach(({p,a})=>{const g=p.grup||'K';if(g!==son){if(son)h+='</div>';son=g;h+=`<div class="sec">${GRUP[g]}</div><div class="card list">`;}
    const tags=['R','UI','YI','B'].filter(k=>a.kod[k]).map(k=>`<span class="tag">${a.kod[k]} ${KOD[k].ad.toLocaleLowerCase('tr-TR')}</span>`).join('')+(a.bos?`<span class="tag warn">${a.bos} boş gün</span>`:'');
    const sag=a.esnaf?`<b>${fmt(a.h)} sa</b><span>esnaf</span>`:a.part?`<b>${fmt(a.h)} sa</b><span>part</span>`:`<b>${sg(a.fm)} sa</b><span>${fmt(a.h)} sa çalıştı</span>`;
    h+=`<div class="row"><div class="av">${esc(bas(p.ad))}</div><div class="m"><b>${esc(p.ad)}</b><span>${esc(p.gorev||GRUP[g])} · ${p.sekil==='Part'?`${a.gun} gün çalıştı`:`${a.bordroGun} gün${a.gun!==a.bordroGun?` <em style="font-style:normal;color:var(--mut)">(${a.gun} gün çalıştı)</em>`:''}`}</span>${tags?`<div class="tags">${tags}</div>`:''}</div><div class="r">${sag}</div></div>`;});
  if(son)h+='</div>';if(!R.length)h+=`<div class="empty-state"><b>Bu ay için çizelge yok</b></div>`;
  h+=`<div style="margin-top:16px">${d.durum==='sube_onay'?'<button class="btn" style="width:100%" id="cekB">Kapatmayı geri çek</button>':d.durum==='bolge_onay'?'':(engel?`<button class="btn primary" style="width:100%" disabled>Ayı kapat → bölge müdürüne gönder</button><p class="note" style="color:var(--bad);font-weight:600">${engel} ay kapatılamaz.</p>`:`<button class="btn primary" style="width:100%" id="kapB">Ayı kapat → bölge müdürüne gönder</button>`)}</div>
   <p class="note">Ayı kapatınca bu ayın çalışma günleri, fazla mesaisi, rapor ve izinleri bölge müdürünün puantaj ekranına düşer. Bölge müdürü onaylayınca puantaj işverene hazır olur.</p>`;
  view(h,()=>{byId('prevM').onclick=()=>ayGit(ak,-1);byId('nextM').onclick=()=>ayGit(ak,1);fmSeciciBagla(ak);
    document.querySelectorAll('[data-git]').forEach(b=>b.onclick=()=>{S.hafta=b.dataset.git;S.tab='cizelge';tryLS('pm.tab','cizelge');render();window.scrollTo(0,0);});
    // Teyit, haftanın kaydına yazılır (ay kapanmadan değiştirilebilir)
    document.querySelectorAll('[data-teyit]').forEach(c=>c.onchange=()=>{const k=c.dataset.teyit;const i=k.lastIndexOf('_');const pid=k.slice(0,i),wid=k.slice(i+1);
      const w0=S.haftalar[wid]||{};S.haftalar[wid]={...w0,teyit7:{...(w0.teyit7||{}),[pid]:c.checked}};
      {const sid=S.subeId;sirayla(sid+'|'+wid,()=>{arka(setDoc(weekRef(wid,sid),{hafta:wid,ay2:ayKey(addDays(parse(wid),6)),teyit7:{[pid]:c.checked}},{merge:true}));});}render();});
    document.querySelectorAll('[data-kon]').forEach(c=>c.onchange=()=>{const k=c.dataset.kon;S.aylar[ak]={...d,kontrol:{...(d.kontrol||{}),[k]:c.checked}};
      {const sid=S.subeId;sirayla('ay'+ak,()=>{arka(setDoc(doc(db,'subeler',sid,'aylar',ak),{durum:d.durum||'taslak',kontrol:{[k]:c.checked}},{merge:true}));});}render();});
    const kb=byId('kapB');if(kb)kb.onclick=()=>openSheet(`<h2>Ayı kapat</h2><div class="sub">${esc(trBuyukBas(sb.ad))} şubesi · ${ayAdi(ak)}</div>
      <div class="confirm">Ay kapatılınca bu ayın çizelgesi şube tarafından değiştirilemez. Çalışma günleri, fazla mesai, rapor ve izinler bölge müdürünün onayına gönderilir.</div>
      <p class="note">${R.length} çalışan · toplam fazla mesai ${fmt(topFm)} sa · rapor ${rap} gün · ücretsiz izin ${ui} gün</p>
      <div class="row2"><button class="btn grow" id="kNo">Vazgeç</button><button class="btn primary grow" id="kOk">Evet, kapat ve gönder</button></div>`,()=>{byId('kNo').onclick=closeSheet;byId('kOk').onclick=()=>{closeSheet();
      const sid=S.subeId;sirayla('ay'+ak,async()=>{const b=writeBatch(db);b.set(doc(db,'subeler',sid,'aylar',ak),{durum:'sube_onay',kapatan:S.user.uid,kapatanAd:S.me.adSoyad||'',kapatma:new Date().toISOString(),not:''},{merge:true});
        b.set(doc(db,'ozetler',ak+'__'+sid),{sube:sid,ay:ak,kisiler:subeOzeti(ak,sid),guncellendi:new Date().toISOString()},{mergeFields:['sube','ay','kisiler','guncellendi']});await b.commit();});toast(`${ayAdi(ak)} kapatıldı, bölge müdürüne gönderildi.`);};});
    const cb=byId('cekB');if(cb)cb.onclick=()=>{{const sid=S.subeId;sirayla('ay'+ak,()=>{arka(setDoc(doc(db,'subeler',sid,'aylar',ak),{durum:'taslak'},{merge:true}));});}toast('Kapatma geri çekildi.');};});}

/* ================= Haftalar: şubelerin haftalık kapatma takibi (bölge müdürü + işveren) ================= */
const TK_HAFTA=4;
function takipHaftalari(){const bu=parse(mondayOf(today()));const L=[];for(let j=TK_HAFTA;j>=1;j--)L.push(ymd(addDays(bu,-7*(j+(S.tkKay||0)))));return L;}
function takipDinle(){const L=takipHaftalari();const key=L[0]+'|'+S.subeIds.join();if(S.tkKey===key)return;S.tkKey=key;subs.tk.forEach(u=>u());subs.tk=[];S.tk={};
  S.subeIds.forEach(sid=>subs.tk.push(onSnapshot(query(collection(db,'subeler',sid,'haftalar'),where('hafta','>=',L[0])),s=>{const m={};s.docs.forEach(d=>m[d.id]=d.data());S.tk[sid]=m;if(S.tab==='puantaj'&&!S.pt.sube&&S.tkGorunum==='hafta')render();},()=>{S.tk[sid]={};})));}
function tkDurum(sid,wid){const w=(S.tk[sid]||{})[wid];if(!w)return S.tk[sid]?'yok':'yukleniyor';const k=Array.isArray(w.kadro)?w.kadro:Object.keys(w.cells||{});if(!k.length&&!w.hd)return'yok';
  const hd=w.hd||'acik';if(hd==='acik')return haftaBitti(wid)?(haftaGecikti(wid)?'gecikti':(w.geriNot?'geri':'acik')):'devam';return hd;}
const TK={yok:['—','mut',''],yukleniyor:['…','mut',''],devam:['Sürüyor','mut','Hafta bitmedi'],acik:['Açık','warn','Şube kapatmadı, süresi dolmadı'],geri:['Geri gönd.','bad','Geri gönderildi, şube düzeltiyor'],gecikti:['Gecikti','bad','Süresinde kapatılmadı'],kapali:['Onay bekl.','bekle','Şube kapattı, onayınızı bekliyor'],onay:['Onaylı','ok','Onaylandı']};
function renderTakip(){takipDinle();const L=takipHaftalari();
  let h=`<div class="weeknav"><button class="nav-arrow" id="tkPrev" aria-label="Önceki haftalar">‹</button><div class="ttl">${(()=>{const a=parse(L[0]),b=haftaPazar(L[L.length-1]);return `${a.getDate()} ${AYK[a.getMonth()]} – ${b.getDate()} ${AYK[b.getMonth()]} ${b.getFullYear()}`;})()}<small>${S.tkKay?'Önceki haftalar':`Biten son ${TK_HAFTA} hafta`}</small></div><button class="nav-arrow" id="tkNext" aria-label="Sonraki haftalar" ${S.tkKay?'':'disabled'}>›</button></div>`;
  const say={};const bekleyen=[];
  h+=`<div class="tk-wrap"><table class="tk"><thead><tr><th class="l">Şube</th>${L.map(w=>{const a=parse(w),b=haftaPazar(w);return `<th>${a.getDate()}–${b.getDate()}<small>${AYK[b.getMonth()]}</small></th>`;}).join('')}</tr></thead><tbody>`;
  S.subeIds.forEach(sid=>{h+=`<tr><td class="l"><b>${esc(kisaSubeAd(sid))}</b></td>`;L.forEach(w=>{const d=tkDurum(sid,w);say[d]=(say[d]||0)+1;if(d==='kapali')bekleyen.push([sid,w]);const t=TK[d];
      h+=`<td><button class="tkc ${t[1]}" data-tks="${esc(sid)}" data-tkw="${w}" title="${esc(t[2])}" ${d==='yok'||d==='yukleniyor'?'disabled':''}>${t[0]}</button></td>`;});h+='</tr>';});
  h+=`</tbody></table></div>`;
  h+=`<div class="legend">${['kapali','gecikti','acik','geri','onay'].map(k=>`<span><i class="tkl ${TK[k][1]}"></i>${TK[k][2]}${say[k]?` · ${say[k]}`:''}</span>`).join('')}</div>`;
  if(bekleyen.length)h+=`<div class="actions" style="margin-top:12px"><button class="btn primary grow" id="tkHepsi">Onay bekleyen ${bekleyen.length} haftayı onayla</button></div>`;
  h+=`<p class="note yardim">Hafta bitince şube müdürünün ${KAPATMA_GUN} günü var. Kapatılan hafta şube müdürüne kapanır ve burada onayınızı bekler. Hücreye dokunup çizelgeyi açın, onaylayın, geri gönderin ya da kilidini açın; şube adına da kapatabilirsiniz.</p>`;
  return h;}
function takipBagla(){const p=byId('tkPrev'),n=byId('tkNext');if(p)p.onclick=()=>{S.tkKay=(S.tkKay||0)+TK_HAFTA;render();};if(n)n.onclick=()=>{S.tkKay=Math.max(0,(S.tkKay||0)-TK_HAFTA);render();};
  document.querySelectorAll('[data-tks]').forEach(b=>b.onclick=()=>takipPanel(b.dataset.tks,b.dataset.tkw));
  const hb=byId('tkHepsi');if(hb)hb.onclick=async()=>{const L=takipHaftalari();const B=[];S.subeIds.forEach(sid=>L.forEach(w=>{if(tkDurum(sid,w)==='kapali')B.push([sid,w]);}));hb.disabled=true;
    let n=0,atla=0,dur=false;for(const[sid,w]of B){hb.textContent=`Onaylanıyor ${n+atla+1} / ${B.length}`;const r=await subedeYap(sid,w,async()=>{await gunleriYukle(cizelgeKisileri(w),haftaAylari(w));const K=haftaKontrol(w);if(K.izinG.length||K.gc.length||K.yok.length)return'atla';return haftaOnayla(w);});if(r===false){dur=true;break;}if(r==='atla')atla++;else n++;}
    toast(dur?`${n} hafta onaylandı; ${B.length-n-atla} hafta onaylanamadı, tekrar deneyin.`:atla?`${n} hafta onaylandı. ${atla} haftada kontrol maddesi (izin, giriş / çıkış) var, tek tek açıp onaylayın.`:`${n} hafta onaylandı.`);render();};}
// Başka şubenin haftasında işlem: önce o şube yüklenir (hesaplar o şubenin çizelgesiyle yapılır).
async function subedeYap(sid,wid,fn){if(S.subeId!==sid)selectSube(sid);S.hafta=wid;for(let i=0;i<300&&!sunucuHazir(sid);i++)await new Promise(r=>setTimeout(r,100));
  if(!sunucuHazir(sid)){toast(`${subeAdi(sid)} şubesinin verileri yüklenemedi, işlem yapılmadı. İnterneti kontrol edip tekrar deneyin.`);return false;}return fn();}
function takipPanel(sid,wid){const w=(S.tk[sid]||{})[wid]||{};const d=tkDurum(sid,wid);const hd=w.hd||'acik';const kay=(w.kayit||[]).slice().sort((a,b)=>String(b.t).localeCompare(String(a.t)));
  const btn=(id,t,c='')=>`<button class="btn grow ${c}" id="${id}">${t}</button>`;
  openSheet(`<h2>${esc(subeAdi(sid))}</h2><div class="sub">${rangeLabel(wid)} · <span class="chip ${TK[d][1]}">${TK[d][0]}</span></div>
   ${w.kapatanAd&&hd!=='acik'?`<p class="note" style="margin-top:0">Kapatan: ${esc(w.kapatanAd)} · ${tarihSaat(w.kapatma)}${w.onaylayanAd?` · Onaylayan: ${esc(w.onaylayanAd)} · ${tarihSaat(w.onayTarihi)}`:''}</p>`:''}
   ${w.geriNot&&hd==='acik'?`<div class="confirm">Geri gönderme notu: "${esc(w.geriNot)}"</div>`:''}
   <div class="row2">${btn('tpAc','Çizelgeyi aç','primary')}</div>
   <div class="row2">${hd==='kapali'?btn('tpOn','Onayla')+btn('tpGeri','Geri gönder','danger'):''}${hd==='acik'&&haftaBitti(wid)?btn('tpKap','Şube adına kapat')+btn('tpKapOn','Kapat ve onayla'):''}</div>
   ${hd!=='acik'?`<div class="row2">${btn('tpKilit','Kilidi aç')}</div>`:''}
   <span class="lbl">Kayıt</span><div class="card list">${kay.map(k=>`<div class="row"><div class="m"><b>${esc(k.i)}</b><span>${esc(k.ad||'')} · ${tarihSaat(k.t)}${k.not?' · "'+esc(k.not)+'"':''}</span></div></div>`).join('')||'<div class="note" style="padding:10px 12px">Henüz işlem yok.</div>'}</div>`,()=>{
   const on=(id,f)=>{const e=byId(id);if(e)e.onclick=f;};
   on('tpAc',()=>{closeSheet();S.tab='cizelge';tryLS('pm.tab','cizelge');S.hafta=wid;if(S.subeId!==sid)selectSube(sid);else render();window.scrollTo(0,0);});
   on('tpOn',async()=>{closeSheet();await subedeYap(sid,wid,()=>haftaOnayPanel(wid));});
   on('tpGeri',async()=>{closeSheet();await subedeYap(sid,wid,()=>haftaGeriPanel(wid));});
   on('tpKap',async()=>{closeSheet();await subedeYap(sid,wid,()=>haftaKapatPanel(wid,false));});
   on('tpKapOn',async()=>{closeSheet();await subedeYap(sid,wid,()=>haftaKapatPanel(wid,true));});
   on('tpKilit',()=>{const e=byId('tpKilit');if(!e.dataset.ok){e.dataset.ok='1';e.textContent='Kilidi açmayı onayla';return;}closeSheet();subedeYap(sid,wid,()=>haftaKilidiAc(wid));});});}

/* ================= Puantaj (bölge müdürü + işveren) ================= */
function renderPuantaj(){if(!puantajYetki())return;S.ay=aktifAy('puantaj');
  if(S.pt.sube&&S.subeId===S.pt.sube)return renderPuantajDetay();
  const seg=`<div class="seg" id="tkSeg" style="margin:4px 0 12px"><button data-v="hafta" class="${S.tkGorunum==='hafta'?'on':''}">Haftalar</button><button data-v="ay" class="${S.tkGorunum!=='hafta'?'on':''}">Aylık puantaj</button></div>`;
  const segBagla=()=>document.querySelectorAll('#tkSeg button').forEach(b=>b.onclick=()=>{S.tkGorunum=b.dataset.v;render();});
  if(S.tkGorunum==='hafta')return view(seg+renderTakip(),()=>{segBagla();takipBagla();});
  const ak=S.ay;listeDinle(ak);
  let h=seg+`<div class="weeknav"><button class="nav-arrow" id="prevM">‹</button><div class="ttl">${ayAdi(ak)}<small>${S.subeIds.length} şube</small></div><button class="nav-arrow" id="nextM">›</button></div>`;
  if(!S.subeIds.length)h+=`<div class="empty-state"><b>Sorumlu olduğunuz şube yok</b></div>`;
  const say={};h+=`<div class="card list">${S.subeIds.map(id=>{const d=S.pt.listeAylar[id+'|'+ak]||{durum:'taslak'};say[d.durum]=(say[d.durum]||0)+1;const D=DURUM[d.durum]||DURUM.taslak;
    return `<button class="row" data-id="${esc(id)}"><div class="av">${esc(bas(S.subeler[id].ad))}</div><div class="m"><b>${esc(S.subeler[id].ad)}</b><span>${d.durum==='kesin'?'Kesin kapandı':d.durum==='bolge_onay'?'Puantaj onaylandı':d.kapatma?'Kapatıldı '+new Date(d.kapatma).toLocaleDateString('tr-TR'):'Haftalar onaylandıkça hazır olur'}</span></div><span class="chip ${D.c}">${D.ad}</span></button>`;}).join('')}</div>`;
  h+=`<p class="note">${say.sube_onay?`<b>${say.sube_onay} şube onayınızı bekliyor.</b> `:''}Şubeye dokunup puantajı açın. Muhasebe tarafı çizelgeden hesaplanır; ödemeleri orada işleyin.</p>`;
  view(h,()=>{segBagla();byId('prevM').onclick=()=>ayGit(ak,-1);byId('nextM').onclick=()=>ayGit(ak,1);
    document.querySelectorAll('.row[data-id]').forEach(b=>b.onclick=()=>puantajAc(b.dataset.id));});}
let listeAy=null;function listeDinle(ak){if(listeAy===ak+S.subeIds.join())return;listeAy=ak+S.subeIds.join();subs.liste.forEach(u=>u());subs.liste=[];
  S.subeIds.forEach(id=>subs.liste.push(onSnapshot(doc(db,'subeler',id,'aylar',ak),s=>{S.pt.listeAylar[id+'|'+ak]=s.exists()?s.data():{durum:'taslak'};if(S.tab==='puantaj'&&!S.pt.sube)render();},()=>{})));}
function puantajAc(id){if(S.subeId!==id)selectSube(id);S.pt.sube=id;S.pt.doc=null;S.pt.ham=null;S.pt.maas=null;S.pt.prev=null;S.pt.ozetler=null;S.pt.ozetVeri=null;S.pt.ozetHata=false;subs.detay.forEach(u=>u());subs.detay=[];const ak=S.ay;
  S.pt.temiz=false;subs.detay.push(onSnapshot(doc(db,'puantaj',id,'aylar',ak),s=>{if(S.pt.sube!==id||S.ay!==ak)return;S.pt.ham=s.exists()?s.data():{};S.pt.doc={...S.pt.ham,veri:bekleyenUygula(id,ak,veriListesi(S.pt.ham))};if(!S.pt.temiz){S.pt.temiz=true;veriBosTemizle();}render();},e=>{S.pt.doc={};yazmaHatasi(e);}));
  subs.detay.push(onSnapshot(doc(db,'maaslar',id),s=>{S.pt.maas=s.exists()?s.data():{};render();},()=>{S.pt.maas={};}));
  // Diğer şubelerin ay özetleri (izin, saat): yüklenmeden puantaj gösterilmez ve onaylanmaz.
  getDocs(query(collection(db,'ozetler'),where('ay','==',ak))).then(q=>{if(S.pt.sube!==id||S.ay!==ak)return;const m={},vg={};q.docs.forEach(d=>{const x=d.data();if(x.sube){m[x.sube]=x.kisiler||{};vg[x.sube]=x.veriGun||{};}});S.pt.ozetVeri=vg;S.pt.ozetler=m;render();}).catch(e=>{console.error(e);if(S.pt.sube===id&&S.ay===ak){S.pt.ozetVeri={};S.pt.ozetler={};S.pt.ozetHata=true;render();}});
  getDoc(doc(db,'puantaj',id,'aylar',ayKaydir(ak,-1))).then(s=>{S.pt.prev=s.exists()?s.data():{};render();}).catch(()=>{S.pt.prev={};});render();}
function ucretSekli(pid){const kp=S.personel.find(x=>x.id===pid);if(kp&&kp.paketBasi===true)return'paket';/* kişi paket başı: her şubede */const m=S.pt.maas||{};const u=m.ucretSekli&&m.ucretSekli[pid];if(u)return u;return m.paketBasi&&m.paketBasi[pid]?'paket':'maas';}
function paketBasiMi(pid){return ucretSekli(pid)==='paket';}
// Paket başı kuryede bordro tutarı (bankaya yatan) en çok çalıştığı şubeye yazılır (çizelgedeki vardiyalı gün sayısı; eşitse maaş/SGK şubesi). Diğerlerinde maaşın ödendiği şube.
function enCokCalisilanSube(pid,ak,varsayilan){const p=S.personel.find(x=>x.id===pid);if(!p)return varsayilan;const kayit=S.personel.filter(x=>x.id===pid||ayniKisi(x,p));const sayac={};const say=g=>Object.values(g||{}).filter(v=>isShift(v)).length;
  kayit.forEach(q=>{const n=say(gunHaritasi(q,ak));if(n)sayac[S.subeId]=(sayac[S.subeId]||0)+n;});
  Object.entries(S.pt.ozetler||{}).forEach(([sb,k])=>{if(sb===S.subeId||!k)return;kayit.forEach(q=>{const x=k[q.id];const n=x?say(x.g):0;if(n)sayac[sb]=(sayac[sb]||0)+n;});});
  const L=Object.entries(sayac).sort((a,b)=>b[1]-a[1]||(a[0]===varsayilan?-1:b[0]===varsayilan?1:0));return L.length?L[0][0]:varsayilan;}
function bordroHedef(pid,ak,V){const r=V&&V.sol&&V.sol[pid];const p=S.personel.find(q=>q.id===pid);const h=r&&r.odemeSid?r.odemeSid:(p?odemeSubesi(p,ak):S.subeId);return paketBasiMi(pid)?enCokCalisilanSube(pid,ak,h):h;}
// Ücretler aya göre: "x ayından itibaren" kaydı tutulur, geçmiş aylar değişmez.
function ayDegeri(eski,gecmis,ak){const o={...(eski||{})};Object.entries(gecmis||{}).forEach(([pid,g])=>{const k=Object.keys(g||{}).filter(x=>x<=ak).sort().pop();if(k)o[pid]=g[k];});return o;}
function netMap(ak=S.ay){const m=S.pt.maas||{};return ayDegeri(m.net,m.netGecmis,ak);}
function saatMap(ak=S.ay){const m=S.pt.maas||{};return ayDegeri(m.saatUcret,m.saatGecmis,ak);}
function ucretGecmisi(alan,pid){const m=S.pt.maas||{};const g=(m[alan]||{})[pid]||{};return Object.keys(g).sort().map(k=>`${ayAdi(k)}: ${tl0(g[k]||0)}`).join(' · ');}
function fmOzelMap(ak=S.ay){const m=S.pt.maas||{};return ayDegeri(null,m.fmOzelGecmis,ak);}
function usOf(pid){return{tip:ucretSekli(pid),saatUcret:sayi(saatMap()[pid]),fmOzel:sayi(fmOzelMap()[pid]),ak:S.ay};}
function ptSol(ak,D){const oz=veriOzet(D.veri,ak);const sol=solHesap(ak,S.subeId,S.pt.ozetler||{},Object.keys(oz));
  // Başka şubenin veri girişindeki rapor / izin / part gün: kişinin muhasebe ya da maaş satırı buradaysa burada da sayılır (aynı gün aynı tür bir kez).
  const own=ozBirlestir(oz,sol),dis=ozBirlestir(veriDis(ak,S.subeId,D),sol);const top={};
  [own,dis].forEach(M=>Object.entries(M).forEach(([pid,e])=>{const x=top[pid]=top[pid]||{};Object.entries(e).forEach(([t,v])=>{x[t]=(x[t]||0)+v;});}));
  veriUygula(sol,top);Object.entries(dis).forEach(([pid,e])=>{const r=sol[pid];if(r&&(r.maasBurada!==false||r.muhBurada))r.disVeri=e;});return sol;}
// Bu şubenin veri girişindeki gün türlerini şubeler arası ay özetine yazar (değişmediyse yazmaz).
function jsSirali(o){return JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(x=>[x,v[x]])):v);}
const VG_YAZILAN={};let vgT=null;
function veriGunYaz(sid,ak,vg){const key=ak+'__'+sid;VG_YAZILAN[key]=jsSirali(vg);return setDoc(doc(db,'ozetler',key),{sube:sid,ay:ak,veriGun:vg},{mergeFields:['sube','ay','veriGun']}).catch(e=>{delete VG_YAZILAN[key];throw e;});}
function veriGunSenkron(){clearTimeout(vgT);vgT=setTimeout(()=>{const sid=S.pt.sube,ak=S.ay,D=S.pt.doc;
  if(!puantajYetki()||!sid||sid!==S.subeId||!D||!S.pt.ozetVeri||S.pt.ozetler===null||S.pt.ozetHata||!S.loaded.personel)return;
  const vg=veriGunHesap(D.veri,ak,D);const key=ak+'__'+sid;const once=VG_YAZILAN[key]!=null?VG_YAZILAN[key]:jsSirali(S.pt.ozetVeri[sid]||{});if(jsSirali(vg)===once)return;
  S.pt.ozetVeri={...S.pt.ozetVeri,[sid]:vg};veriGunYaz(sid,ak,vg).catch(yazmaHatasi);},1200);}
function kesinEngel(){if(S.pt.doc&&S.pt.doc.kesin===true){toast('Bu ay kesin kapandı, değişiklik yapılamaz.');return true;}return false;}
function ptVerisi(){const ak=S.ay;const D=S.pt.doc||{};
  if(D.kesin===true&&D.kesinSonuc){const K=D.kesinSonuc;const sb={...subeAyari(S.subeId,ak),...(K.sb||{})};const satir=(K.satir||[]).map(x=>({...x,sag:x.sag||{},hes:x.hes||{}}));const sol={};satir.forEach(x=>sol[x.pid]=x.sol);
    return{ak,kilitli:true,kesin:true,sol,satir,sb,D,oz:K.oz||{}};}const kilitli=D.kilitli===true;const sol=kilitli&&D.sol?D.sol:ptSol(ak,D);const oz=ozBirlestir(veriOzet(D.veri),sol);const sb=subeAyari(S.subeId,ak);const net=netMap(ak);
  const prevSag=(S.pt.prev&&S.pt.prev.sag)||{};const sag=D.sag||{};
  const ids=Object.keys(sol).sort((a,b)=>String(sol[a].ad).localeCompare(String(sol[b].ad),'tr'));
  const satir=ids.map(pid=>{const dv=prevSag[pid]&&prevSag[pid].kalan<0?prevSag[pid].kalan:0;return{pid,sol:sol[pid],sag:sag[pid]||{},net:net[pid],hes:sagHesap(pid,sol[pid],sag[pid],net[pid],sb,dv,oz[pid],usOf(pid),otoKapi(ak,kilitli,false))};});
  return{ak,kilitli,sol,satir,sb,D,oz};}
// Onaylı / kesin ayda saklanan muhasebe rakamları ile bugünkü hesap farklı mı (onaydan sonra çizelge, personel bilgisi ya da program değişti).
// Sadece gösterir; saklanan rakamlara dokunmaz. Düzeltmek için kilit açılıp yeniden onaylanır.
const FARK_ALAN=[['gun','gün'],['hakGun','çalışılan gün'],['rapor','rapor'],['ucretsiz','ücr. izin'],['yillik','yıllık izin'],['bayram','bayram'],['partGun','part gün'],['fmSaat','FM saat']];
function saklananFark(V){if(!(V.kilitli||V.kesin))return[];const yeni=ptSol(V.ak,V.D||{}),eski=V.sol||{};const L=[];const kisi=(pid,r)=>S.personel.find(x=>x.id===pid)||{id:pid,ad:(r&&r.ad)||''};
  const es={};Object.keys(eski).forEach(pid=>{if(yeni[pid]){es[pid]=pid;return;}const p=kisi(pid,eski[pid]);const q=Object.keys(yeni).find(y=>!eski[y]&&!Object.values(es).includes(y)&&ayniKisi(kisi(y,yeni[y]),p));if(q)es[pid]=q;});
  Object.keys(eski).forEach(pid=>{const a=eski[pid]||{},b=yeni[es[pid]];if(!b){if(sayi(a.gun)||sayi(a.hakGun)||Math.abs(sayi(a.fmSaat))>0.004)L.push({ad:a.ad||pid,t:'güncel hesapta yok'});return;}
    const d=FARK_ALAN.filter(([k])=>Math.abs(sayi(a[k])-sayi(b[k]))>0.004).map(([k,n])=>`${n} ${fmt(sayi(a[k]))} → ${fmt(sayi(b[k]))}`);
    if((a.maasBurada!==false)!==(b.maasBurada!==false))d.push(b.maasBurada!==false?'maaşı artık bu şubede':'maaşı artık başka şubede');if(d.length)L.push({ad:a.ad||pid,t:d.join(', ')});});
  const kul=new Set(Object.values(es));Object.keys(yeni).forEach(pid=>{if(kul.has(pid))return;const b=yeni[pid];if(sayi(b.gun)||sayi(b.hakGun)||Math.abs(sayi(b.fmSaat))>0.004)L.push({ad:b.ad||pid,t:'onayda yoktu'});});
  return L;}
function renderPuantajDetay(){const vg=byId('vGrid');const ae=document.activeElement;if(S.pt.gorunum==='veri'&&vg&&vg.contains(ae)&&/INPUT|SELECT/.test(ae.tagName)&&!S.pt.zorla)return;S.pt.zorla=false;const ak=S.ay;const sb=subeAyari(S.subeId,ak);const durum=(S.aylar[ak]||{durum:'taslak'}).durum;const D=DURUM[durum]||DURUM.taslak;
  const subeSec=S.subeIds.length>1?`<div class="ptsube"><span class="ptcap">Şube</span><div class="ptsel"><select id="ptSube" aria-label="Şube seç">${S.subeIds.map(i=>`<option value="${esc(i)}" ${i===S.pt.sube?'selected':''}>${esc((S.subeler[i]||{}).ad||i)}</option>`).join('')}</select></div></div>`:`<div class="ptsube"><span class="ptcap">Şube</span><div class="ptsube1">${esc(sb.ad)}</div></div>`;
  let h=`<div class="ptbar"><button class="ptback" id="geriL" aria-label="Şube listesine dön"><span aria-hidden="true">‹</span> Şubeler</button><span class="chip mut ptdurum">${D.ad}</span></div><div class="ptnav">${subeSec}<div class="ptay"><button class="nav-arrow" id="ptPrev" aria-label="Önceki ay" ${ayKaydir(ak,-1)<BASLANGIC_AY?'disabled':''}>‹</button><div class="ttl">${ayAdi(ak)}</div><button class="nav-arrow" id="ptNext" aria-label="Sonraki ay">›</button></div></div>`;
  const ayDeg=n=>{const y=ayKaydir(ak,n);if(y<BASLANGIC_AY)return;veriBosTemizle();S.ay=y;S.ayElle=true;S.pt.vsel=null;puantajAc(S.pt.sube);};
  const navBagla=()=>{byId('geriL').onclick=listeyeDon;fmSeciciBagla(ak);const ps=byId('ptSube');if(ps)ps.onchange=e=>{const y=e.target.value;if(!y||y===S.pt.sube)return;veriBosTemizle();S.pt.vsel=null;puantajAc(y);window.scrollTo(0,0);};byId('ptPrev').onclick=()=>ayDeg(-1);byId('ptNext').onclick=()=>ayDeg(1);};
  if(S.pt.doc===null||S.pt.maas===null||S.pt.ozetler===null||S.pt.prev===null||!S.loaded.personel||!S.loaded.haftalar)return view(h+`<div class="empty-state"><b>Puantaj yükleniyor</b></div>`,navBagla);
  const V=ptVerisi();const ad=S.aylar[ak]||{};kalanTazele(V);veriGunSenkron();
  if(sb.fmDonem==='hafta')h+=`<div class="banner ok">Fazla mesai dönemi: ${fmDonemYazi(ak,sb)} (haftalık). Rapor, izin ve bordro günü takvim ayına göre.</div>${fmSecici(ak,sb)}`;
  else if(fmDonemYazi(ak,sb))h+=`<div class="banner ok">Fazla mesai dönemi: ${fmDonemYazi(ak,sb)}. Önceki günler ${ayAdi(ayKaydir(ak,-1))} haftalık döneminde ödendi. Rapor, izin ve bordro günü takvim ayına göre.</div>`;
  if(S.pt.ozetHata)h+=`<div class="banner bad">Diğer şubelerin bu ayki özetleri okunamadı; başka şubelerdeki izin ve saatler eksik görünebilir. Sayfayı yenileyin, düzelmeden onaylamayın.</div>`;
  if(gunHataVar())h+=`<div class="banner bad">${GUN_HATA_YAZI}</div>`;
  const HD=ayHaftaDurumu(ak);if(!onayli(durum)){const yz=[HD.say.onay?`${HD.say.onay} onaylı`:'',HD.say.kapali?`${HD.say.kapali} onay bekliyor`:'',HD.say.acik?`${HD.say.acik} açık`:''].filter(Boolean).join(', ');
    h+=HD.tamam?`<div class="banner ok">Bu ayın ${HD.L.length} haftası da onaylandı. Puantajı kontrol edip onaylayabilirsiniz.</div>`:`<div class="banner">Bu ayın haftaları: ${yz||'çizelge yok'}. Rakamlar çizelge değiştikçe güncellenir; bütün haftalar onaylanınca ay onaylanabilir. <button class="hgit" id="ptHaftalar">Haftalar ›</button></div>`;}
  if(durum==='geri')h+=`<div class="banner bad">Şubeye geri gönderildi${ad.not?': "'+esc(ad.not)+'"':''}.</div>`;
  if(durum==='sube_onay')h+=`<div class="banner">Şube müdürü ayı kapattı${ad.kapatanAd?' ('+esc(ad.kapatanAd)+')':''}. Kontrol edip onaylayın ya da geri gönderin.</div>`;
  {const ck=V.satir.filter(x=>x.sol.cakisma&&x.sol.cakisma.length);if(ck.length)h+=`<div class="banner bad">Şubeler arası çakışma: aynı kişi aynı saatlerde iki şubede ya da bir şubede izinliyken diğerinde çalışıyor görünüyor. Çizelgeleri düzeltin.${ck.map(x=>`<div style="font-weight:400;margin-top:4px"><b>${esc(x.sol.ad)}</b> — ${x.sol.cakisma.map(esc).join('; ')}</div>`).join('')}</div>`;}
  if(V.kesin)h+=`<div class="banner ok"><b>Kesin kapandı</b>${V.D.kesinAd?' · '+esc(V.D.kesinAd):''}${V.D.kesinTarihi?' · '+tarihSaat(V.D.kesinTarihi):''}. Bu ayın rakamları kapanış anındaki halleriyle saklanır; çizelge, ödemeler, veri girişi, maaş ve ayar değişiklikleri bu ayı etkilemez.</div>`;
  else if(durum==='bolge_onay'&&V.kilitli)h+=`<div class="banner ok">Onaylandı${V.D.onaylayanAd?' · '+esc(V.D.onaylayanAd):''}. Muhasebe tarafı kilitli, ödemeler işlenebilir.</div>`;
  if(isIsveren()&&(V.kilitli||V.kesin)&&!S.pt.ozetHata&&!gunHataVar()&&Object.values(S.gunler).every(x=>x!==null)){const F=saklananFark(V);
    if(F.length)h+=`<div class="banner bad"><b>Saklanan rakamlar güncel hesaptan farklı · ${F.length} kişi.</b> Onaydan sonra çizelge, personel bilgisi ya da program değişmiş; bu ayın saklanan rakamları değişmedi. Güncel hali için ${V.kesin?'kesin kapanışı ve ':''}kilidi açıp yeniden onaylayın.${F.slice(0,12).map(x=>`<div style="font-weight:400;margin-top:4px"><b>${esc(x.ad)}</b> — ${esc(x.t)}</div>`).join('')}${F.length>12?`<div style="font-weight:400;margin-top:4px">ve ${F.length-12} kişi daha</div>`:''}</div>`;}
  h+=`<div class="seg" style="margin:4px 0 12px" id="ptSeg"><button data-v="sol" class="${S.pt.gorunum==='sol'?'on':''}">Muhasebe</button><button data-v="sag" class="${S.pt.gorunum==='sag'?'on':''}">Ödemeler</button><button data-v="veri" class="${S.pt.gorunum==='veri'?'on':''}">Veri girişi</button></div>`;
  const cikisMi=s=>s.cikis&&s.cikis<=ayKaydir(ak,1)+'-00';
  const etiketler=x=>{const L=[];if(x.hes.esnaf)L.push('Esnaf kurye');else if(x.hes.pb)L.push('Paket başı');else if(x.hes.saat)L.push('Saatlik');else L.push(x.sol.sekil==='Part'?'Part':'Tam');if(x.hes.netYok)L.push('Net maaş yok');if(cikisMi(x.sol))L.push('Çıkış yapan');if(x.sol.maasBurada===false)L.push('Sadece FM');if(x.hes.kalan<-0.004)L.push('Kalan eksi');if(x.hes.otoBekle)L.push('Mesai onay bekliyor');if(x.sol.hakGun!=null&&x.sol.hakGun!==x.sol.gun)L.push(x.sol.sgkDisi?'SGK dışı gün':'Deneme');return L;};
  const durumK={k:'durum',ad:'Durum',vals:etiketler};const n0=v=>v||0;const tlv=v=>Math.abs(v||0)>0.004?tl(v):'';
  if(S.pt.gorunum==='sol'){
    const KS=[{k:'sgk',ad:'SGK şube',v:x=>x.sol.sgkSube,l:1},{k:'ad',ad:'Ad soyad',v:x=>x.sol.ad,ek:durumK,l:1},{k:'gorev',ad:'Görev',v:x=>muhGorev(x.sol)},{k:'sekil',ad:'Şekil',v:x=>x.sol.muhSekil||x.sol.sekil},{k:'giris',ad:'Giriş',v:x=>trTarih(x.sol.giris),n:x=>x.sol.giris||''},{k:'cikis',ad:'Çıkış',v:x=>trTarih(x.sol.cikis),n:x=>x.sol.cikis||''},
      {k:'rapor',ad:'Rapor',v:x=>x.sol.rapor||'',n:x=>n0(x.sol.rapor)},{k:'ui',ad:'Ücr. izin',v:x=>x.sol.ucretsiz||'',n:x=>n0(x.sol.ucretsiz)},{k:'pg',ad:'Part gün',v:x=>x.sol.partGun?fmt(x.sol.partGun):'',n:x=>n0(x.sol.partGun)},{k:'yi',ad:'Yıllık izin',v:x=>x.sol.yillik||'',n:x=>n0(x.sol.yillik)},{k:'b',ad:'Bayram',v:x=>x.sol.bayram||'',n:x=>n0(x.sol.bayram)},{k:'gun',ad:'Gün sayısı',v:x=>x.sol.maasBurada===false&&!x.sol.muhBurada?'—':(x.sol.bayram>0?`${x.sol.gun}+${fmt(x.sol.bayram)} bayram`:x.sol.gun),n:x=>n0(x.sol.gun)}];
    const tabanS=V.satir.filter(x=>muhasebedeMi(x.sol));const LS=kfUygula('sol',KS,tabanS);S.pt._kf={t:'sol',cols:KS,rows:tabanS};
    if(kfAktifMi('sol'))h+=`<div class="kfbar">Filtre açık · ${LS.length} / ${tabanS.length} kişi gösteriliyor <button class="mini" id="kfHepsi">Filtreleri kaldır</button></div>`;
    h+=`<div class="tbl-wrap"><table class="pt"><thead><tr>${KS.map(c=>kfBaslik('sol',c,c.l?'l':'')).join('')}</tr></thead><tbody>`;
    const gizli=V.satir.filter(({sol})=>!muhasebedeMi(sol)&&sol.sekil!=='Esnaf kurye');
    LS.forEach(({pid,sol})=>{const fo=sol.maasBurada===false&&!sol.muhBurada;h+=`<tr class="click ${cikisMi(sol)?'cikis':''}" data-mpid="${esc(pid)}"><td class="l">${esc(sol.sgkSube)}</td><td class="l"><b>${esc(sol.ad)}</b>${fo?' <span class="tag">sadece fazla mesai</span>':''}${sol.muhBurada&&sol.maasBurada===false?` <span class="tag">ödemesi ${esc(sol.odemeSube)}</span>`:''}${sol.baska&&sol.baska.length?` <span class="tag">+ ${esc(sol.baska.join(', '))}</span>`:''}${sol.bosGun?` <span class="tag warn">${sol.bosGun} boş</span>`:''}${sol.cakisma&&sol.cakisma.length?` <span class="tag warn">${sol.cakisma.length} gün çakışma</span>`:''}${sol.elle?' <span class="tag">+ veri girişi</span>':''}${sol.sekil==='Part'&&!sol.partGun?' <span class="tag warn">part gün girilmedi</span>':''}</td><td>${esc(muhGorev(sol))}</td><td>${esc(sol.muhSekil||sol.sekil)}</td><td>${trTarih(sol.giris)}</td><td>${trTarih(sol.cikis)}</td><td>${sol.rapor||''}</td><td>${sol.ucretsiz||''}</td><td>${sol.partGun?fmt(sol.partGun):''}</td><td>${sol.yillik||''}</td><td>${sol.bayram||''}</td><td>${fo?'—':(sol.bayram>0?`${sol.gun}+${fmt(sol.bayram)} bayram`:sol.gun)}</td></tr>`;});
    h+=`</tbody></table></div><div class="legend"><span><i style="background:var(--yel)"></i>Çıkış yapan</span><span>Gün sayısı = tam ay 30; rapor/ücretsiz izin varsa ayın takvim günü − rapor − ücretsiz izin, en çok 30 (ay ortasında giriş/çıkışta çalışılan takvim günü); part çalışanlarda gün sayısı = part gün</span></div>
    ${gizli.length?`<p class="note"><b>Muhasebede gösterilmeyen ${gizli.length} kişi</b> (SGK'sı başka şubede, SGK'sı yok ya da bu ay SGK girişi yok): ${gizli.map(x=>esc(x.sol.ad)).join(', ')}. Bu kişiler sadece Ödemeler tarafında.</p>`:''}
    <p class="note yardim">Maaş, rapor ve izinler kişinin SGK şubesinde. Fazla mesai muhasebeye gitmez; Ödemeler tarafında, çalıştığı her şubede ayrı hesaplanır. Diğer şubelerdeki izin günleri o şubeler ayı kapattıkça eklenir. "+ şube adı" etiketi o şubeden gelen günlerin eklendiğini gösterir.</p>`;
    h+=`<div class="actions" style="margin-top:12px"><button class="btn grow" id="pdfB">Muhasebe çıktısı · PDF / fotoğraf / WhatsApp</button></div>`;}
  else if(S.pt.gorunum==='veri')h+=veriGirisiHtml(V);
  else{
    const T=V.satir.reduce((t,x)=>{t.hak+=x.hes.hak+x.hes.fmTl+x.hes.paketPrimi+x.hes.ciroPrimi;t.bankaya+=x.hes.bankaya;t.avans+=x.hes.avans+x.hes.araOdeme;t.nakit+=Math.max(x.hes.kalan,0);return t;},{hak:0,bankaya:0,avans:0,nakit:0});
    h+=`<div class="kpis"><div class="kpi"><span>Toplam hak ediş</span><b>${tl0(T.hak)}</b></div><div class="kpi"><span>Bankaya yatan</span><b>${tl0(T.bankaya)}</b></div><div class="kpi"><span>Avans + ara ödeme</span><b>${tl0(T.avans)}</b></div><div class="kpi"><span>İhtiyaç duyulan nakit</span><b>${tl0(T.nakit)}</b></div></div>`;
    const netOf=x=>x.hes.esnaf||x.hes.maasYok||x.hes.pb?0:sayi(x.net);
    const KO=[{k:'ad',ad:'Ad soyad',v:x=>x.sol.ad,ek:durumK,l:1},{k:'gorev',ad:'Görev',v:x=>muhGorev(x.sol)},{k:'gun',ad:'Gün',v:x=>x.hes.saat?fmt(x.hes.saatSayi)+' sa':x.hes.esnaf||x.hes.maasYok?'—':(x.sol.hakGun!=null?x.sol.hakGun:x.sol.gun),n:x=>n0(x.sol.hakGun!=null?x.sol.hakGun:x.sol.gun)},
{k:'hak',ad:'Hak edilen',v:x=>x.hes.pb?'':tlv(x.hes.hak),n:x=>n0(x.hes.hak)},{k:'bankaya',ad:'Bankaya yatan',v:x=>tlv(x.hes.bankaya),n:x=>n0(x.hes.bankaya)},{k:'ara',ad:'Ara ödeme',v:x=>tlv(x.hes.araOdeme),n:x=>n0(x.hes.araOdeme)},
      {k:'mf',ad:'Maaş farkı',v:x=>tlv((x.hes.pb?-x.hes.bankaya:x.hes.maasFarki)+n0(x.hes.ekOd)),n:x=>n0((x.hes.pb?-x.hes.bankaya:x.hes.maasFarki)+n0(x.hes.ekOd))},{k:'fm',ad:'Fazla mesai',v:x=>tlv(x.hes.fmTl),n:x=>n0(x.hes.fmTl)},{k:'pp',ad:'Paket primi',v:x=>tlv(x.hes.paketPrimi),n:x=>n0(x.hes.paketPrimi)},{k:'cp',ad:'Ciro primi',v:x=>tlv(x.hes.ciroPrimi),n:x=>n0(x.hes.ciroPrimi)},
      {k:'avans',ad:'Avans',v:x=>tlv(x.hes.avans),n:x=>n0(x.hes.avans)},{k:'kalan',ad:'Kalan ödeme',v:x=>tl(x.hes.kalan),n:x=>n0(x.hes.kalan)}];
    S.pt._kf={t:'sag',cols:KO,rows:V.satir};
    if(kfAktifMi('sag'))h+=`<div class="kfbar">Filtre açık · toplamlar sadece görünen kişiler için <button class="mini" id="kfHepsi">Filtreleri kaldır</button></div>`;
    h+=`<div class="tbl-wrap"><table class="pt"><thead><tr>${KO.map(c=>kfBaslik('sag',c,c.l?'l':'')).join('')}</tr></thead><tbody>`;
    const tbBas=h.length;
    const VS=kfUygula('sag',KO,V.satir);VS.forEach(({pid,sol,net,hes})=>{const cls=hes.kalan<-0.004?'eksi':cikisMi(sol)?'cikis':'';
      h+=`<tr class="click ${cls}" data-pid="${esc(pid)}"><td class="l"><b>${esc(sol.ad)}</b><br><span class="tag">${esc(sol.sekil)}</span>${hes.netYok?' <span class="tag warn">net maaş yok</span>':''}${!hes.esnaf&&V.sb.fmYontem!=='maas'&&sayi(fmOzelMap(V.ak)[pid])>0?' <span class="tag">özel FM ücreti</span>':''}${sol.cakisma&&sol.cakisma.length?` <span class="tag warn">${sol.cakisma.length} gün çakışma</span>`:''}${hes.pb?' <span class="tag">paket başı</span>':''}${hes.saat?` <span class="tag">saatlik ${tl(hes.saatUcret)}</span>`:''}${hes.otoBekle?' <span class="tag warn">mesai onay bekliyor</span>':''}${hes.otoRed?' <span class="tag">mesai reddedildi</span>':''}${hes.maasYok?` <span class="tag">${sol.muhBurada&&sol.odemeSube?'maaşı '+esc(sol.odemeSube)+' şubesinde':'sadece fazla mesai'}</span>`:''}</td><td>${esc(muhGorev(sol))}</td><td>${hes.saat?`${fmt(hes.saatSayi)} sa`:hes.esnaf||hes.maasYok?'—':(sol.hakGun!=null&&sol.hakGun!==sol.gun?(sol.sekil==='Part'||sol.partGun>0?`${sol.hakGun}<br><span class="tag" title="Muhasebeye part gün gider; maaş normal gün üzerinden">part ${fmt(sol.gun)}</span>`:(sol.sgkYok?`${sol.hakGun}<br><span class="tag" title="SGK şubesi Boş: SGK'sız çalışıyor">SGK yok</span>`:`${sol.hakGun}<br><span class="tag warn" title="Deneme günleri: SGK ${sol.gun} gün">SGK ${sol.gun}</span>`)):sol.gun)}${!hes.saat&&!hes.esnaf&&!hes.maasYok&&!hes.pb&&sol.bayram>0?`<br><span class="tag" title="Bayramda çalışılan gün: hak edilen tutara +1 gün ücret eklendi">+${fmt(sol.bayram)} bayram</span>`:''}</td><td>${hes.pb?'—':tlv(hes.hak)}</td><td>${tlv(hes.bankaya)}</td><td>${hes.araOdeme?tl(hes.araOdeme):''}</td><td>${tlv((hes.pb?-hes.bankaya:hes.maasFarki)+(hes.ekOd||0))}</td><td>${hes.fmTl?tl(hes.fmTl):''}</td><td>${hes.paketPrimi?tl(hes.paketPrimi):''}</td><td>${hes.ciroPrimi?tl(hes.ciroPrimi):''}</td><td>${hes.avans?tl(hes.avans):''}${hes.devirAvans?`<br><span class="tag" title="Geçen aydan eksi kalan">devir ${tl(hes.devirAvans)}</span>`:''}</td><td class="${hes.kalan<0?'neg':'pos'}">${tl(hes.kalan)}</td></tr>`;});
    const top=k=>VS.reduce((t,x)=>t+(x.hes[k]||0),0);const tt=v=>Math.abs(v)>0.004?tl(v):'';const kalT=top('kalan');const netT=VS.reduce((t,x)=>t+(x.hes.esnaf||x.hes.maasYok||x.hes.pb?0:sayi(x.net)),0);
    const totRow=`<tr class="tot"><td class="l">${kfAktifMi('sag')?`Filtreli toplam · ${VS.length} / ${V.satir.length} kişi`:`Toplam · ${VS.length} kişi`}</td><td></td><td></td><td>${tt(top('hak'))}</td><td>${tt(top('bankaya'))}</td><td>${tt(top('araOdeme'))}</td><td>${tt(top('maasFarki'))}</td><td>${tt(top('fmTl'))}</td><td>${tt(top('paketPrimi'))}</td><td>${tt(top('ciroPrimi'))}</td><td>${tt(top('avans'))}</td><td class="${kalT<0?'neg':'pos'}">${tl(kalT)}</td></tr>`;
    h=h.slice(0,tbBas)+totRow.replace('class="tot"','class="tot ust"')+h.slice(tbBas);
    h+=`</tbody></table></div>
     <div class="legend"><span><i style="background:var(--yel)"></i>Çıkış yapan</span><span><i style="background:var(--red)"></i>Kalan eksi: sonraki aya devreder</span><span>Satıra dokunup ödemeleri girin</span></div>
     <div class="actions" style="margin-top:12px"><button class="btn grow" id="odPayB">Ödeme listesi · fotoğraf / PDF / WhatsApp</button></div>`;}
  const bolgeIs=!onayli(durum)&&(durum==='sube_onay'||HD.tamam||isIsveren());
  // Bölge müdürü onay öncesi kontrol: rapor, yıllık izin, SGK giriş/çıkış muhasebe grubundan teyit edilir
  const bk=(V.D&&V.D.bkontrol)||{};const BK=[];V.satir.filter(x=>muhasebedeMi(x.sol)).forEach(({pid,sol})=>{const ic=t=>t&&t.slice(0,7)===ak;
    // Her satır: tam ad, ne olduğu (etiket) ve değer; aynı kişinin birden çok SGK kaydı varsa hangi kayıt olduğu (SGK şubesi) görünsün.
    const e=(k,tur,deg)=>BK.push({k:k+pid,ad:adBuyuk(sol.ad),tur,deg,sgk:sol.sgkSube||'',gorev:muhGorev(sol)});
    if(sol.rapor)e('r_','Rapor',`${sol.rapor} gün`);if(sol.yillik)e('y_','Yıllık izin',`${sol.yillik} gün`);if(sol.ucretsiz)e('u_','Ücretsiz izin',`${sol.ucretsiz} gün`);if(sol.bayram)e('b_','Bayram',`${fmt(sol.bayram)} gün`);
    if(ic(sol.giris))e('g_','SGK giriş',trTarih(sol.giris));if(ic(sol.cikis))e('c_','SGK çıkış',trTarih(sol.cikis));});
  BK.sort((a,b)=>a.ad.localeCompare(b.ad,'tr')||a.tur.localeCompare(b.tur,'tr'));
  const bkEksik=BK.filter(x=>!bk[x.k]).length;
  if(bolgeIs&&BK.length)h+=`<div class="sec">Onay öncesi kontrol · muhasebe grubundan teyit edin</div><div class="card kcard"><div class="kt ${bkEksik?'sari':'yesil'}"><div class="kth"><b>Rapor, izinler, bayram, SGK giriş ve çıkışlar · ${BK.length}</b><span>Her birini muhasebe WhatsApp grubundaki bilgiyle karşılaştırıp işaretleyin. Hepsi işaretlenmeden onaylanamaz.</span></div>
    <div class="bkl">${BK.map(x=>`<label class="${bk[x.k]?'on':''}"><input type="checkbox" data-bk="${esc(x.k)}" ${bk[x.k]?'checked':''}><span><b class="ad">${esc(x.ad)}</b><span class="nt"><em>${esc(x.tur)}</em> · ${esc(x.deg)}</span><span class="alt">${x.gorev?esc(x.gorev)+' · ':''}SGK: ${esc(x.sgk||'—')}</span></span></label>`).join('')}</div></div></div>`;
  const pOnc=ayKaydir(ak,-1);const pOnceki=(pOnc>=BASLANGIC_AY&&!onayli((S.aylar[pOnc]||{}).durum))||bkEksik>0;if(bolgeIs&&pOnceki)h+=`<p class="note" style="color:var(--bad);font-weight:600">${pOnc>=BASLANGIC_AY&&!onayli((S.aylar[pOnc]||{}).durum)?`${ayAdi(pOnc)} puantajı onaylanmadan bu ay onaylanamaz.`:`Onay öncesi kontrolde ${bkEksik} madde işaretlenmedi.`}</p>`;
  if(!bolgeIs&&!onayli(durum))h+=`<p class="note">Bütün haftalar onaylanınca "Onayla ve kilitle" açılır. Bir haftada düzeltme gerekiyorsa Haftalar ekranından o haftayı şubeye geri gönderin.</p>`;
  h+=`<div class="row2">${bolgeIs?`${pOnceki?`<button class="btn primary grow" disabled title="Önce önceki ay onaylanmalı">Onayla ve kilitle</button>`:'<button class="btn primary grow" id="onayB">Onayla ve kilitle</button>'}`:''}${isIsveren()&&durum==='bolge_onay'?'<button class="btn grow" id="acB">Kilidi aç</button>':''}</div>`;
  // İşveren: ödemeler bitince ayı kesin kapatır. Önceki ay kesin kapanmadan olmaz (devir ondan gelir).
  if(isIsveren()&&durum==='bolge_onay'&&V.kilitli){const pk=pOnc<BASLANGIC_AY||(S.aylar[pOnc]||{}).durum==='kesin';
    h+=`<div class="card" style="padding:12px;margin-top:10px"><b>Kesin kapanış</b><p class="note" style="margin:4px 0 8px">Ödemeler ve veri girişi bitince ayı kesin kapatın. Kesin kapanan ayın rakamları o anki halleriyle saklanır; sonradan çizelge, ayar, maaş ya da program değişse de bu ay değişmez ve kimse düzenleyemez.</p>${!HD.tamam?'<p class="note" style="color:var(--bad);font-weight:600;margin:0">Ayın bütün haftaları (sonraki aya taşan hafta dahil) onaylanmadan kesin kapatılamaz.</p>':pk?'<button class="btn primary" id="kesinB" style="width:100%">Ayı kesin kapat</button>':`<p class="note" style="color:var(--bad);font-weight:600;margin:0">${ayAdi(pOnc)} kesin kapanmadan bu ay kesin kapatılamaz.</p>`}</div>`;}
  if(isIsveren()&&durum==='kesin'){const sonraki=(S.aylar[ayKaydir(ak,1)]||{}).durum==='kesin';
    h+=`<div class="row2" style="margin-top:10px">${sonraki?`<p class="note">${ayAdi(ayKaydir(ak,1))} kesin kapalı olduğu için bu ay açılamaz.</p>`:'<button class="btn grow" id="kesinAcB">Kesin kapanışı aç</button>'}</div>`;}
  view(h,()=>{navBagla();document.querySelectorAll('#ptSeg button').forEach(b=>b.onclick=()=>{if(S.pt.gorunum==='veri'&&b.dataset.v!=='veri')veriBosTemizle();S.pt.gorunum=b.dataset.v;S.pt.vsel=null;render();});
    const pb=byId('pdfB');if(pb)pb.onclick=()=>muhasebeCiktisi(V);const opb=byId('odPayB');if(opb)opb.onclick=()=>odemeCiktisi(V);const bb=byId('bordroB');if(bb)bb.onclick=()=>bordroPanel(V);
    if(S.pt._kf&&S.pt.gorunum!=='veri'){kfBagla(S.pt._kf.t,S.pt._kf.cols,S.pt._kf.rows);const kh=byId('kfHepsi');if(kh)kh.onclick=()=>{kfDurum(S.pt._kf.t).f={};render();};}
    if(S.pt.gorunum==='veri'){if(!V.kesin)veriGirisiBagla(V);}else if(!V.kesin){document.querySelectorAll('tr[data-pid]').forEach(r=>r.onclick=()=>odemePanel(r.dataset.pid));document.querySelectorAll('tr[data-mpid]').forEach(r=>r.onclick=()=>gunPanel(r.dataset.mpid));}
    document.querySelectorAll('[data-bk]').forEach(c=>c.onchange=()=>{if(kilitEngel()||kesinEngel()){c.checked=!c.checked;return;}const k=c.dataset.bk;const sid=S.subeId;S.pt.doc={...(S.pt.doc||{}),bkontrol:{...((S.pt.doc||{}).bkontrol||{}),[k]:c.checked}};
      sirayla('pt'+sid+ak,()=>{arka(setDoc(doc(db,'puantaj',sid,'aylar',ak),{sube:sid,ay:ak,bkontrol:{[k]:c.checked}},{merge:true}));});render();});
    const ob=byId('onayB');if(ob)ob.onclick=()=>{const T2=V.satir.reduce((t,x)=>t+Math.max(x.hes.kalan,0),0);openSheet(`<h2>Puantajı onayla</h2><div class="sub">${esc(trBuyukBas(sb.ad))} şubesi · ${ayAdi(ak)}</div>
      <div class="confirm">Onaylayınca muhasebe tarafı kilitlenir ve puantajın son hali işverene iletilir. Raporlar, yıllık izinler ve SGK giriş-çıkışları muhasebe grubundan kontrol ettiğinizden emin olun.</div>
      <p class="note">${V.satir.length} kişi · ihtiyaç duyulan nakit ${tl0(T2)}</p><div class="row2"><button class="btn grow" id="oVz">Vazgeç</button><button class="btn primary grow" id="oEv">Evet, onayla ve gönder</button></div>`,()=>{byId('oVz').onclick=closeSheet;byId('oEv').onclick=()=>{closeSheet();onayla();};});};
    const gb=byId('geriB');if(gb)gb.onclick=geriGonderPanel;const phb=byId('ptHaftalar');if(phb)phb.onclick=()=>{S.tkGorunum='hafta';listeyeDon();};const ab=byId('acB');if(ab)ab.onclick=()=>{if(!ab.dataset.ok){ab.dataset.ok='1';ab.textContent='Kilidi açmayı onayla';return;}kilidiAc();};
    const kb=byId('kesinB');if(kb)kb.onclick=()=>openSheet(`<h2>Ayı kesin kapat</h2><div class="sub">${esc(trBuyukBas(sb.ad))} şubesi · ${ayAdi(ak)}</div><div class="confirm">Muhasebe ve ödemelerin bütün rakamları şu anki halleriyle saklanır. Bu aydan sonra çizelge, veri girişi, ödeme, maaş, şube ayarı ya da program değişse de bu ayın rakamları değişmez. Bu ayın haftaları da kimse tarafından düzenlenemez.</div><div class="row2"><button class="btn grow" id="kVz">Vazgeç</button><button class="btn primary grow" id="kEv">Evet, kesin kapat</button></div>`,()=>{byId('kVz').onclick=closeSheet;byId('kEv').onclick=()=>{closeSheet();kesinKapat();};});
    const ka=byId('kesinAcB');if(ka)ka.onclick=()=>{if(!ka.dataset.ok){ka.dataset.ok='1';ka.textContent='Emin misiniz? Saklanan rakamlar yeniden hesaplanabilir hale gelir';return;}kesinAc();};});}
/* ================= Excel tarzı sütun filtresi ================= */
const BOS_V='(Boş)';
function kfDurum(t){const K=t==='isc'?(S.iscKf=S.iscKf||{}):(S.pt.kf=S.pt.kf||{});return K[t]=K[t]||{f:{},sort:null};}
function kfDegerler(c,x){const v=c.vals?c.vals(x):[c.v(x)];return v.map(y=>y==null||y===''?BOS_V:String(y));}
function kfUygula(t,cols,rows){const st=kfDurum(t);const hepsi=[];cols.forEach(c=>{hepsi.push(c);if(c.ek)hepsi.push(c.ek);});
  let R=rows.filter(x=>hepsi.every(c=>{const sel=st.f[c.k];if(!sel)return true;return kfDegerler(c,x).some(v=>sel.includes(v));}));
  if(st.sort){const c=hepsi.find(c=>c.k===st.sort.k);if(c){const key=c.n||(x=>kfDegerler(c,x)[0]);R=R.slice().sort((a,b)=>{const A=key(a),B=key(b);const r=typeof A==='number'&&typeof B==='number'?A-B:String(A).localeCompare(String(B),'tr');return st.sort.d*r;});}}
  return R;}
function kfAktifMi(t){const st=kfDurum(t);return Object.keys(st.f).length>0;}
function kfBaslik(t,c,cls){const st=kfDurum(t);const akt=!!st.f[c.k]||!!(c.ek&&st.f[c.ek.k]);const so=st.sort&&(st.sort.k===c.k);
  return `<th class="${cls||''}"><button class="kfb ${akt?'on':''}" data-kft="${t}" data-kfc="${c.k}" title="Filtrele / sırala">${c.ad}<i>${so?(st.sort.d>0?'▲':'▼'):akt?'⧩':'▾'}</i></button></th>`;}
function kfBagla(t,cols,rows){document.querySelectorAll(`.kfb[data-kft="${t}"]`).forEach(b=>b.onclick=e=>{e.stopPropagation();const c=cols.find(c=>c.k===b.dataset.kfc);if(c)kfAc(t,c,rows,b);});}
function kfAc(t,c,rows,btn){kfKapat();const st=kfDurum(t);const pop=document.createElement('div');pop.className='kfpop';pop.id='kfPop';
  const bolum=(cc,ara)=>{const say={};const ord={};rows.forEach(x=>kfDegerler(cc,x).forEach((v,i)=>{say[v]=(say[v]||0)+1;if(ord[v]==null)ord[v]=cc.n?cc.n(x):v;}));
    const vals=Object.keys(say).sort((a,b)=>a===BOS_V?1:b===BOS_V?-1:typeof ord[a]==='number'&&typeof ord[b]==='number'?ord[a]-ord[b]:String(a).localeCompare(String(b),'tr'));const sel=st.f[cc.k];
    return `<div class="kfsec" data-k="${cc.k}">${cc.baslik?`<div class="kft">${esc(cc.baslik)}</div>`:''}${ara?`<input class="kfara" placeholder="Ara">`:''}
      <label class="kfrow kfall"><input type="checkbox" ${!sel?'checked':''}> (Tümünü seç)</label><div class="kflist">${vals.map(v=>`<label class="kfrow" data-ara="${esc(isimAnahtar(v))}"><input type="checkbox" value="${esc(v)}" ${!sel||sel.includes(v)?'checked':''}> <span>${esc(v)}</span><em>${say[v]}</em></label>`).join('')}</div></div>`;};
  pop.innerHTML=`<button class="kfs" data-d="1">${c.n?'Küçükten büyüğe':'A → Z'} sırala</button><button class="kfs" data-d="-1">${c.n?'Büyükten küçüğe':'Z → A'} sırala</button>
    ${c.ek?bolum({...c.ek,baslik:c.ek.ad},false):''}${bolum({...c,baslik:c.ek?c.ad:''},true)}
    <div class="kfbtns"><button class="btn small" id="kfTem">Filtreyi temizle</button><button class="btn small primary" id="kfOk">Tamam</button></div>`;
  document.body.appendChild(pop);const r=btn.getBoundingClientRect();const w=Math.min(280,window.innerWidth-16);pop.style.width=w+'px';
  pop.style.left=Math.max(8,Math.min(r.left+window.scrollX,window.scrollX+window.innerWidth-w-8))+'px';pop.style.top=(r.bottom+window.scrollY+4)+'px';
  pop.onclick=e=>e.stopPropagation();
  pop.querySelectorAll('.kfsec').forEach(sec=>{const all=sec.querySelector('.kfall input');const boxes=()=>[...sec.querySelectorAll('.kflist input')];
    all.onchange=()=>boxes().forEach(b=>{if(!b.closest('.kfrow').hidden)b.checked=all.checked;});
    sec.querySelectorAll('.kflist input').forEach(b=>b.onchange=()=>{all.checked=boxes().every(x=>x.checked);});
    const ara=sec.querySelector('.kfara');if(ara){ara.oninput=()=>{const q=isimAnahtar(ara.value);sec.querySelectorAll('.kflist .kfrow').forEach(l=>l.hidden=!!q&&!l.dataset.ara.includes(q));};setTimeout(()=>ara.focus(),0);}});
  pop.querySelectorAll('.kfs').forEach(b=>b.onclick=()=>{st.sort={k:c.k,d:+b.dataset.d};S.pt.vDon=null;kfKapat();render();});
  byId('kfTem').onclick=()=>{delete st.f[c.k];if(c.ek)delete st.f[c.ek.k];if(st.sort&&st.sort.k===c.k)st.sort=null;S.pt.vDon=null;kfKapat();render();};
  byId('kfOk').onclick=()=>{pop.querySelectorAll('.kfsec').forEach(sec=>{const k=sec.dataset.k;const boxes=[...sec.querySelectorAll('.kflist input')];const ara=sec.querySelector('.kfara');
      // Excel gibi: aramada sadece görünenler seçilir
      const secili=boxes.filter(b=>b.checked&&!(ara&&ara.value&&b.closest('.kfrow').hidden)).map(b=>b.value);
      if(secili.length===boxes.length)delete st.f[k];else st.f[k]=secili;});S.pt.vsel=null;S.pt.vDon=null;kfKapat();render();};
  setTimeout(()=>document.addEventListener('click',kfKapat,{once:true}),0);}
function kfKapat(){const p=byId('kfPop');if(p)p.remove();}

/* ================= Puantaj veri girişi ================= */
let veriYapistirBagli=false;
function veriKisileri(V){const kisiler=new Map();V.satir.forEach(x=>kisiler.set(x.pid,x.sol.ad));
  subePersoneli().filter(p=>aktifAyda(p,V.ak)).forEach(p=>{if(!kisiler.has(p.id))kisiler.set(p.id,p.ad);});
  return [...kisiler.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'tr'));}
// Excel'den gelen veri türü yazısını koda çevir
function turCoz(s){const a=ascii(s).replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();if(!a)return null;
  const L=[['maas fark','MF'],['calisilan saat','SA'],['saat','SA'],['banka','BY'],['net odenen','BY'],['fazla mesai tutar','FMT'],['fazla mesai','FMT'],['ucretsiz','UI'],['yillik','YI'],['rapor','R'],['bayram','B'],['part','PG'],['avans','AV'],['ara odeme','AO'],['paket sayi','PS'],['paket prim','PP'],['ciro','CP'],['prim','CP'],['ek odeme','EK'],['kesinti','KS']];
  const x=L.find(([k])=>a.includes(k));return x?x[1]:null;}
// Veri girişi: Excel gibi tablo. Satır ekle ya da Excel'den yapıştır; isim/tür tutmazsa satır kırmızı.
function trTarihCoz(x){x=String(x||'').trim();let m=x.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(/^\d{4}-\d{2}-\d{2}$/.test(x))return x;
  if(/^\d{5}$/.test(x)){const d=xSerialTarih(+x);if(d)return d;}return null;}
// Aynı gün aynı rapor / izin başka yerde de yazılı mı (çizelgede ya da başka şubenin veri girişinde).
function veriCiftYazim(pid,tur,tarih){if(!['R','UI','YI','B'].includes(tur)||!/^\d{4}-\d{2}-\d{2}$/.test(tarih||''))return'';const p=S.personel.find(x=>x.id===pid);if(!p)return'';
  const kayit=S.personel.filter(x=>x.id===pid||ayniKisi(x,p));const d=parse(tarih);const wid=mondayOf(d),i=(d.getDay()+6)%7;
  if(S.pt.sube===S.subeId&&kayit.some(q=>cellOf(q.id,wid,i)===tur))return'Çizelgede de yazılı, iki kez sayılır';
  for(const[s,k]of Object.entries(S.pt.ozetler||{})){if(s===S.subeId||!k)continue;if(kayit.some(q=>k[q.id]&&k[q.id].g&&k[q.id].g[tarih]===tur))return`${subeAdi(s)} çizelgesinde de yazılı, iki kez sayılır`;}
  for(const[s,k]of Object.entries(S.pt.ozetVeri||{})){if(s===S.subeId||!k)continue;if(kayit.some(q=>k[q.id]&&k[q.id].g&&k[q.id].g[tarih]&&k[q.id].g[tarih][tur]))return`${subeAdi(s)} veri girişinde de yazılı, bir kez sayılır`;}
  return'';}
// Kişinin puantajdaki satırı (aynı kişinin başka kaydının satırı da olabilir: TC, TC yoksa ad soyad).
function satirKaydi(sol,pid){if(!sol||!pid)return null;if(sol[pid])return pid;const p=S.personel.find(x=>x.id===pid);if(!p)return null;return Object.keys(sol).find(r=>{const q=S.personel.find(x=>x.id===r);return q&&ayniKisi(q,p);})||null;}
// V (isteğe bağlı): ekrandaki puantaj. Onaylı ayda onaydan sonra eklenen kişiye ve maaşı başka şubede olan kişiye "bankaya yatan" girilemez.
function veriKontrol(v,kL,ak,kilitli,V=null){const r={pid:'',tur:'',hata:''};const bos=!String(v.ad||'').trim()&&!v.pid&&!v.tur&&!String(v.miktar??'').toString().trim()&&!String(v.aciklama||'').trim();if(bos)return{...r,bos:true};
  const adT=v.ad!=null&&v.ad!==''?v.ad:(v.pid?((kL.find(([id])=>id===v.pid)||[])[1]||''):'');const k=isimAnahtar(adT);const x=adT?kL.find(([id,a])=>isimAnahtar(a)===k):null;if(x)r.pid=x[0];const t=veriTur(v.tur);if(t)r.tur=t.k;
  if(!adT.trim())r.hata='İsim yok';else if(!x)r.hata='Böyle bir personel yok';else if(!t)r.hata='Veri türü seçin';else if(v.miktar===''||v.miktar==null||String(v.miktar).trim()==='')r.hata='Miktar yok';
  else if(v.tarih&&v.tarih.slice(0,7)!==ak)r.hata='Başka ay';else if(kilitli&&t.y==='sol')r.hata='Muhasebe kilitli';
  else if(V&&V.sol&&kilitli&&!satirKaydi(V.sol,x[0]))r.hata='Onaydan sonra eklenen kişi';
  else if(V&&V.sol&&t.k==='BY'&&(()=>{const sr=V.sol[satirKaydi(V.sol,x[0])];return sr&&sr.maasBurada===false&&sr.sekil!=='Esnaf kurye'&&!['saat','paket'].includes(ucretSekli(satirKaydi(V.sol,x[0])));})()){
    // Maaşı başka şubede: yetkin varsa tutar o şubenin veri girişine de yazılır (bordro PDF'indeki gibi); yetkin yoksa eskisi gibi engellenir.
    const sr=V.sol[satirKaydi(V.sol,x[0])];const h=sr.odemeSid;
    if(h&&h!==S.subeId&&(isIsveren()||(S.me.subeler||[]).includes(h))){r.gonder=h;r.gonderAd=sr.odemeSube||subeAdi(h);}
    else r.hata=`Maaşı ${sr.odemeSube||'başka'} şubesinde`;}
  if(!r.hata&&V&&x){const u=veriCiftYazim(x[0],t.k,v.tarih);if(u)r.uyari=u;}
  // Mantık kontrolü: rapor + ücretsiz izin + yıllık izin, kişinin o ay fiilen çalıştığı takvim gününden fazla olamaz (ör. 28 Eylül'de başlayana 30 gün ücretsiz izin).
  if(!r.hata&&!r.uyari&&V&&V.sol&&x&&['R','UI','YI'].includes(t.k)){const sr=V.sol[satirKaydi(V.sol,x[0])];const ist=sr&&sr.gunTaban&&sr.gunTaban.istF;const top=sr?(sr.rapor||0)+(sr.ucretsiz||0)+(sr.yillik||0):0;if(ist!=null&&top>ist)r.uyari=`Bu ay ${ist} gün çalışılabilir, rapor/izin toplamı ${top} gün: mantıksız`;}
  if(r.hata){r.pid=r.hata==='Başka ay'||r.hata==='Muhasebe kilitli'||r.hata==='Miktar yok'?'':r.pid;if(r.hata!=='Veri türü seçin')r.tur=r.tur;r.gecersiz=true;}return r;}
function veriGirisiHtml(V){const veri=(V.D&&V.D.veri)||[];const ak=V.ak;const kL=veriKisileri(V);const kisiler=new Map(kL);const adOf=pid=>kisiler.get(pid)||((S.personel.find(p=>p.id===pid)||{}).ad)||'?';
  const turlar=VERI_TUR.filter(t=>!t.gizli);
  // Çizelgeden ve devirden gelenler (salt okunur)
  const oto=[];const sol0=V.kilitli&&V.D.sol?null:solHesap(ak);const kaynak=sol0||V.sol;
  const netM=netMap(ak);const ozM=fmOzelMap(ak);const fmOran=pid=>{const n=sayi(netM[pid]);if(V.sb.fmYontem==='maas'&&!n)return null;return fmKisiUcreti(V.sb,n,{fmOzel:ozM[pid],ak});};
  Object.entries(kaynak).forEach(([pid,r])=>{[['R','rapor'],['UI','ucretsiz'],['YI','yillik'],['B','bayram'],['PG','partGun'],['FM','fmSaat']].forEach(([k,f])=>{let v=r[f]||0;if(V.kilitli){const e=((V.oz[pid]||{})[k]||0)+((r.disVeri||{})[k]||0);v-=e;}if(Math.abs(v)<=0.001)return;
    if(k==='FM'){if(ucretSekli(pid)!=='maas')return;const sg0=((V.D&&V.D.sag)||{})[pid]||{};if(V.sb.fmYontem==='maas'&&sg0.fmMod==='elle'&&sg0.fmBirim!==undefined){oto.push({pid,on:'fm',tur:'FMT',miktar:Math.round(v*sayi(sg0.fmBirim)*100)/100,aciklama:`${sg(v)} saat × ${tl0(sayi(sg0.fmBirim))} (saat ücreti elle girildi)`});return;}const o=fmOran(pid);oto.push({pid,on:'fm',tur:'FMT',miktar:o==null?null:Math.round(v*o*100)/100,aciklama:`${sg(v)} saat ${v<0?'eksi mesai':'fazla mesai'}${o==null?' · net maaş girilmedi':V.sb.fmYontem!=='maas'&&sayi(ozM[pid])>0?' · özel ücret '+tl0(o)+'/sa':''}`});return;}oto.push({pid,tur:k,miktar:v});});});
  const ayAralik=(()=>{const L=ymd(new Date(+ak.slice(0,4),+ak.slice(5),0));return `1–${+L.slice(8)} ${AYK[+ak.slice(5)-1]}`;})();
  V.satir.forEach(x=>{if(x.hes.saat&&x.hes.cizelgeSaat)oto.push({pid:x.pid,on:'sa',tur:'SA',miktar:x.hes.cizelgeSaat,aciklama:`çizelgedeki saatler (${ayAralik})`});});
  V.satir.forEach(x=>{Object.entries(x.sol.disVeri||{}).forEach(([k,v])=>{if(Math.abs(v)>0.001)oto.push({pid:x.pid,tur:k,miktar:v,aciklama:'başka şubenin veri girişinden',kaynak:'başka şube'});});});
  V.satir.forEach(x=>{if(x.hes.devirAvans)oto.push({pid:x.pid,tur:'AV',miktar:x.hes.devirAvans,aciklama:`devir avans (${ayAdi(ayKaydir(ak,-1))})`});});
  oto.sort((a,b)=>String(adOf(a.pid)).localeCompare(String(adOf(b.pid)),'tr'));
  const opt=(v,t,sel)=>`<option value="${esc(v)}" ${sel?'selected':''}>${esc(t)}</option>`;
  const hataSay=veri.filter(v=>veriKontrol(v,kL,ak,V.kilitli,V).gecersiz).length;const uyariSay=veri.filter(v=>veriKontrol(v,kL,ak,V.kilitli,V).uyari).length;
  const adYazi=v=>v.ad!=null&&v.ad!==''?v.ad:(v.pid?adBuyuk(adOf(v.pid)):'');
  const VC=[{k:'tarih',ad:'Tarih',v:x=>x.v.tarih?trTarih(x.v.tarih):'',n:x=>x.v.tarih||''},{k:'ad',ad:'Ad soyad',v:x=>adYazi(x.v),l:1},{k:'tur',ad:'Veri türü',v:x=>veriTur(x.v.tur)?veriTur(x.v.tur).ad:'',l:1},
    {k:'miktar',ad:'Miktar',v:x=>x.v.miktar===''||x.v.miktar==null?'':fmt(sayi(x.v.miktar)),n:x=>sayi(x.v.miktar)},{k:'ack',ad:'Açıklama',v:x=>x.v.aciklama||'',l:1},{k:'durum',ad:'Durum',v:x=>x.k.bos?'Boş satır':x.k.gecersiz?x.k.hata:x.k.uyari||(x.k.gonder?'→ '+x.k.gonderAd+' şubesine işlenir':'Tamam'),l:1}];
  const tumR=veri.map((v,i)=>({v,i,k:veriKontrol(v,kL,ak,V.kilitli,V)}));
  // Excel gibi: sıralama / filtre seçildiği anda sıra sabitlenir; yazdıkça satırlar yerinden oynamaz, sonradan eklenen satırlar en altta.
  // Yeniden sıralamak için sıralama / filtre tekrar seçilir.
  let VIS;{const kfS=kfDurum('veri');const sig=JSON.stringify(kfS)+'|'+S.subeId+'|'+ak;
    if(!kfS.sort&&!Object.keys(kfS.f).length){S.pt.vDon=null;VIS=tumR.filter(x=>!x.k.bos);tumR.forEach(x=>{if(x.k.bos)VIS.push(x);});}
    else{let D=S.pt.vDon;if(!D||D.sig!==sig){const sr=kfUygula('veri',VC,tumR).filter(x=>!x.k.bos);D=S.pt.vDon={sig,sira:[...sr,...tumR.filter(x=>x.k.bos)].map(x=>x.v.id),tum:new Set(tumR.map(x=>x.v.id))};}
      const byId=new Map(tumR.map(x=>[x.v.id,x]));VIS=D.sira.map(id=>byId.get(id)).filter(Boolean);tumR.forEach(x=>{if(!D.tum.has(x.v.id))VIS.push(x);});}}
  S.pt._vvis=VIS.map(x=>x.i);S.pt._vkf={cols:VC,rows:tumR};
  let h=`${V.kesin?'':'<div class="actions" style="margin-top:0"><button class="btn grow" id="bordroB">Bordro PDF yükle</button></div>'}${hataSay?`<div class="banner bad">${hataSay} satırda veri uyuşmazlığı var (kırmızı). Bu satırlar hesaba katılmaz; ismi ya da türü düzeltin.</div>`:''}${uyariSay?`<div class="banner">${uyariSay} satırda uyarı var (sarı). Satırdaki yazıyı okuyun: rapor / izin aynı gün çizelgede ya da başka şubede de yazılmış (iki kez sayılır) veya kişinin o ay çalıştığı günden fazla rapor / izin girilmiş olabilir.</div>`:''}
   ${kfAktifMi('veri')?`<div class="kfbar">Filtre açık · ${VIS.length} / ${veri.length} satır gösteriliyor <button class="mini" id="kfHepsiV">Filtreleri kaldır</button></div>`:''}
   <div class="tbl-wrap"><table class="pt vt vg2" id="vGrid" tabindex="0"><thead><tr>${VC.map(c=>kfBaslik('veri',c,c.l?'l':'')).join('')}<th></th></tr></thead><tbody>`;
  VIS.forEach((x,r)=>{const v=x.v;const k=x.k;const kil=V.kesin||(V.kilitli&&veriTur(v.tur)&&veriTur(v.tur).y==='sol'&&!k.gecersiz);
    h+=`<tr data-vid="${esc(v.id)}" data-r="${r}" class="${k.gecersiz?'hata':''}">
     <td class="bi"><input data-c="0" readonly value="${esc(v.tarih?trTarih(v.tarih):'')}" placeholder="gg.aa.yyyy" ${kil?'disabled':''}></td>
     <td class="bi l"><input data-c="1" readonly list="vKisiL" value="${esc(v.ad!=null?v.ad:adBuyuk(adOf(v.pid)))}" autocomplete="off" ${kil?'disabled':''}></td>
     <td class="bi l"><select data-c="2" ${kil?'disabled':''}>${opt('',v.turYazi&&!veriTur(v.tur)?v.turYazi+' ?':'Seçin',!veriTur(v.tur))}${turlar.map(t=>opt(t.k,t.ad,v.tur===t.k)).join('')}${veriTur(v.tur)&&veriTur(v.tur).gizli?opt(v.tur,veriTur(v.tur).ad,true):''}</select></td>
     <td class="bi"><input data-c="3" readonly value="${esc(v.miktar==null||v.miktar===''?'':fmt(sayi(v.miktar)))}" inputmode="decimal" style="text-align:right" ${kil?'disabled':''}></td>
     <td class="bi l"><input data-c="4" readonly value="${esc(v.aciklama||'')}" ${kil?'disabled':''}></td>
     <td class="l dur">${k.gecersiz?`<span class="chip bad">${esc(k.hata)}</span>`:k.uyari?`<span class="chip warn">${esc(k.uyari)}</span>`:k.gonder?`<span class="chip ok">→ ${esc(k.gonderAd)} şubesine işlenir</span>`:''}</td><td>${kil?'':`<button class="mini" data-sil="${esc(v.id)}" title="Satırı sil">✕</button>`}</td></tr>`;});
  if(!V.kesin)h+=`<tr class="ekle"><td colspan="7"><button class="mini ekleB" id="vSatir">+ Satır ekle</button><button class="mini ekleB" id="vSatir10">+ 10 satır</button></td></tr></tbody></table></div>
   <datalist id="vKisiL">${kL.map(([id,ad])=>`<option value="${esc(adBuyuk(ad))}">`).join('')}</datalist>
   <p class="note yardim">Çizelgedeki gibi: hücreye tıklayıp seçin, sürükleyerek ya da Shift ile aralık seçin; çift tıklayarak ya da yazmaya başlayarak düzenleyin. Ctrl+C / Ctrl+V / Delete seçili hücrelerde çalışır. Excel'deki satırları (TARİH · ŞUBE · AD SOYAD · VERİ TÜRÜ · MİKTAR · AÇIKLAMA) kopyalayıp seçili hücreye yapıştırın (seçim yoksa ilk boş satıra); satırlar kendiliğinden eklenir, şube sütunu atlanır. Yazdıklarınız anında kaydedilir. İsmi ya da türü tutmayan satırlar kırmızı görünür ve hesaba katılmaz.${V.kilitli?' Ay onaylandığı için gün türleri (rapor, izin, part gün) eklenemez; onaydan sonra eklenen kişiye de giriş yapılamaz. Düzeltme için kilidi açıp yeniden onaylayın.':''} Rapor, izin ve part gün hangi şubede girilirse girilsin kişinin SGK şubesinde ve maaş şubesinde sayılır.</p>`;
  // Çizelgeden gelen fazla mesai / saat: açık ayda onaylanmadan hesaba girmez (sagHesap kapısı). Onay kutusu ve "Hepsini onayla".
  const onayAcik=otoKapi(V.ak,V.kilitli,V.kesin);const satirM=new Map(V.satir.map(x=>[x.pid,x]));
  const bekliyor=v=>{const x=satirM.get(v.pid);const b=x&&x.hes.otoBekle;return !!(b&&b[v.on]!=null);};const reddi=v=>{const x=satirM.get(v.pid);const r=x&&x.hes.otoRed;return !!(r&&r[v.on]);};
  const bekSay=onayAcik?oto.filter(v=>v.on&&bekliyor(v)).length:0;S.pt._otoBek=bekSay;
  if(oto.length){const ac=S.pt.otoAcik??(bekSay>0);h+=`<button class="btn" id="vOto" style="width:100%;margin-top:6px">${ac?'Otomatik gelenleri gizle':'Çizelgeden ve devirden otomatik gelenler'} · ${oto.length}${bekSay?` · <b style="color:var(--warn)">${bekSay} onay bekliyor</b>`:''}</button>`;
    if(ac&&bekSay)h+=`<div class="actions" style="margin-top:6px"><button class="btn primary grow" id="vOtoHepsi">Çizelgeden gelenlerin hepsini onayla · ${bekSay}</button></div><p class="note yardim" style="margin:4px 0 0">Onay bekleyen ve reddedilen fazla mesai / saat ödemelere girmez; onay bekleyen varken ay onaylanamaz. Ödemeyeceğiniz küçük mesaileri "Reddedildi" yapın. Çizelge değişirse o satır yeniden karar bekler.</p>`;
    if(ac)h+=`<div class="tbl-wrap" style="margin-top:8px"><table class="pt"><thead><tr><th>Kaynak</th><th class="l">Ad soyad</th><th class="l">Veri türü</th><th>Miktar</th><th class="l">Açıklama</th></tr></thead><tbody>${oto.map(v=>{const t=veriTur(v.tur);const mk=v.miktar==null?'—':t&&t.b==='₺'?tl(sayi(v.miktar)):fmt(sayi(v.miktar))+' '+(t?t.b:'');
      const dr=bekliyor(v)?'bek':reddi(v)?'red':'on';const kutu=onayAcik&&v.on&&satirM.has(v.pid)?`<select class="otoSec" data-oto="${esc(v.pid)}|${v.on}" title="Onaylanan ödemelere girer, reddedilen girmez">${[['bek','Onay bekliyor'],['on','Onaylandı'],['red','Reddedildi']].map(([k,t])=>`<option value="${k}" ${dr===k?'selected':''}>${t}</option>`).join('')}</select> `:'';
      return`<tr class="oto ${onayAcik&&v.on?(dr==='bek'?'bekle':dr==='red'?'red':''):''}"><td>${kutu}<span class="tag">${v.kaynak||(v.tur==='AV'?'devir':'çizelge')}</span></td><td class="l"><b>${esc(adBuyuk(adOf(v.pid)))}</b></td><td class="l">${esc(t?t.ad:v.tur)}</td><td>${mk}</td><td class="l">${esc(v.aciklama||'Mesai çizelgesinden')}</td></tr>`;}).join('')}</tbody></table></div>`;}
  return h;}
/* ---- Veri girişi kayıtları ----
   Satırlar puantaj belgesinde satır satır tutulur: veriM.{id} = satır, silinen satır veriSil.{id} = true. Eski belgelerdeki "veri" dizisi okunurken birleştirilir.
   Her kayıt sadece değişen satırları gönderir ve şube + ay yazma anında sabittir: başka ay / şube açılsa ya da aynı anda başka biri yazsa da diğer satırlara dokunulmaz.
   Gönderilmeyi bekleyen değişiklikler, sunucudan gelen her güncellemede ekrandaki listeye yeniden uygulanır (yazılan değer kaybolmaz). */
function veriListesi(D){if(!D)return[];const M=D.veriM||{},Sil=D.veriSil||{};const out=[];
  (Array.isArray(D.veri)?D.veri:[]).forEach((v,i)=>{if(!v)return;const id=v.id||('_e'+i);if(Sil[id]||M[id])return;out.push({sira:i,...v,id});});
  Object.entries(M).forEach(([id,v])=>{if(!v||Sil[id])return;out.push({...v,id});});return out.sort((a,b)=>(a.sira??0)-(b.sira??0));}
let siraSay=0;const yeniSira=()=>Date.now()*100+(siraSay++%100);
function veriFark(eski,yeni){const E=new Map((eski||[]).map(v=>[v.id,v]));const Y=new Set((yeni||[]).map(v=>v.id));const deg={},sil=[];
  (yeni||[]).forEach(v=>{const e=E.get(v.id);if(!e||JSON.stringify(e)!==JSON.stringify(v))deg[v.id]=v;});E.forEach((v,id)=>{if(!Y.has(id))sil.push(id);});return{deg,sil};}
function veriFarkUygula(list,f){const sil=new Set(f.sil);const out=list.filter(v=>!sil.has(v.id)).map(v=>f.deg[v.id]||v);const var_=new Set(out.map(v=>v.id));
  Object.values(f.deg).forEach(v=>{if(!var_.has(v.id)&&!sil.has(v.id))out.push(v);});return out;}
const VBEK={};// şube|ay → henüz gönderilmemiş farklar
function bekleyenUygula(sid,ak,list){(VBEK[sid+'|'+ak]||[]).forEach(f=>{list=veriFarkUygula(list,f);});return list;}
const satirTemiz=v=>JSON.parse(JSON.stringify(v));
// Farkı yazar. ek: aynı kayda eklenecek alanlar (sag, sube, ay…). Kilit başkasındaysa yazmaz, false döner.
function veriYaz(sid,ak,fark,ek={},sec={}){gerekliSube(sid);const deg=fark.deg||{},sil=fark.sil||[];const n=Object.keys(deg).length+sil.length;if(!n&&!Object.keys(ek).length)return Promise.resolve(true);
  const key=sid+'|'+ak;const f={deg,sil};(VBEK[key]=VBEK[key]||[]).push(f);const birak=()=>{const L=VBEK[key]||[];const i=L.indexOf(f);if(i>=0)L.splice(i,1);};
  const vm={},vs={};Object.entries(deg).forEach(([id,v])=>{vm[id]=satirTemiz({...v,id});});sil.forEach(id=>{vm[id]=deleteField();vs[id]=true;});
  const body={...(n?{veriM:vm}:{}),...(sil.length?{veriSil:vs}:{}),guncellendi:new Date().toISOString(),...ek};
  return sirayla('pt'+key,async()=>{try{if(!sec.kilitsiz&&!(await kilitAl(ptK(sid,ak)))){birak();toast(kilitMesaj());if(sid===S.pt.sube&&ak===S.ay&&S.pt.ham){S.pt.doc={...S.pt.ham,veri:bekleyenUygula(sid,ak,veriListesi(S.pt.ham))};S.pt.zorla=true;render();}return false;}
      const p=setDoc(doc(db,'puantaj',sid,'aylar',ak),body,{merge:true});birak();p.catch(e=>{yazmaHatasi(e);});return true;}
    catch(e){birak();throw e;}});}
// Maaşı başka şubede olan kişiye elle girilen "Bankaya yatan": satır bu şubede kalır (gonder = hedef şube, bu şubenin hesabına girmez),
// aynı satır maaşın ödendiği şubenin veri girişine de yazılır. Satır değişince / silinince / hedef değişince oradaki kopya da güncellenir.
async function bankaGonder(sid,ak,fark,eski){const E=new Map((eski||[]).map(v=>[v.id,v]));const Y={};const ekle=h=>Y[h]=Y[h]||{deg:{},sil:[]};
  Object.values(fark.deg||{}).forEach(v=>{const o=E.get(v.id);if(o&&o.gonder&&o.gonder!==v.gonder)ekle(o.gonder).sil.push(v.id);
    if(v.gonder){const{gonder,...r}=v;ekle(gonder).deg[v.id]={...r,gonderenSid:sid,aciklama:`${subeAdi(sid)} veri`+(r.aciklama?' · '+r.aciklama:'')};}});
  (fark.sil||[]).forEach(id=>{const o=E.get(id);if(o&&o.gonder)ekle(o.gonder).sil.push(id);});
  const giden=[];const yeniGidis=h=>Object.keys(Y[h].deg).some(id=>{const o=E.get(id);return !o||o.gonder!==h;});// bildirim sadece satır ilk kez o şubeye giderken
  for(const[h,f] of Object.entries(Y)){try{const s0=await getDoc(doc(db,'puantaj',h,'aylar',ak));const d0=s0.exists()?s0.data():{};
      if(d0.kesin===true){toast(`${subeAdi(h)} şubesinin ${ayAdi(ak)} ayı kesin kapandı, "Bankaya yatan" oraya işlenemedi.`);continue;}
      await veriYaz(h,ak,f,d0.kilitli?{}:{sube:h,ay:ak},{kilitsiz:true});if(yeniGidis(h))giden.push(subeAdi(h));}
    catch(e){yazmaHatasi(e);toast(`${subeAdi(h)} şubesine işlenemedi, satırı yeniden kaydedin.`);}}
  if(giden.length)toast(`Bankaya yatan → ${giden.join(', ')} şubesine de işlendi.`);}
// Ekrandaki ay için, yeni veri listesiyle hesaplanan "kalan"lar: sonraki ayın devri bu kayıtlı kalandan gelir, her veri değişikliğinde güncellenir.
function kalanYama(sid,ak,veri){if(sid!==S.pt.sube||sid!==S.subeId||ak!==S.ay||!S.pt.doc)return{};try{const V=ptVerisi();return{sag:sagYama(sagSonuclu({...V,D:{...V.D,veri}}),[])};}catch(e){console.error(e);return{};}}
// Sağ taraf (ödemeler): sadece değişen kişilerin alanları; diğerlerinin yalnız hesaplanan kalanı yazılır.
function sagYama(sag,kisiler){const o={};Object.entries(sag||{}).forEach(([pid,v])=>{o[pid]=kisiler.includes(pid)?v:{kalan:(v||{}).kalan??0};});return o;}
// Onaylı (kilitli) ayda kayıtlı "kalan" hesaplanandan farklıysa düzeltilir: sonraki ayın devri doğru olsun. Ekran her açılışta bir kez bakar.
function kalanTazele(V){if(V.kesin)return;const sid=S.subeId,ak=V.ak;const key=sid+'|'+ak;S.pt.kalanBak=S.pt.kalanBak||{};if(!V.kilitli||!puantajYetki()||S.pt.kalanBak[key]||kilitBaskasi()||!S.pt.prev||S.pt.sube!==sid)return;S.pt.kalanBak[key]=1;
  const sag=sagSonuclu(V);const fark=Object.keys(sag).filter(pid=>Math.abs(((((V.D.sag||{})[pid])||{}).kalan??0)-(sag[pid].kalan??0))>0.004);if(!fark.length)return;
  veriYaz(sid,ak,{deg:{},sil:[]},{sag:sagYama(sag,[])},{kilitsiz:true});}
function veriGirisiBagla(V){const ak=V.ak,sid=S.subeId;const kL=veriKisileri(V);
  const veri0=()=>((S.pt.doc&&S.pt.doc.veri)||[]);
  // Her değişiklik anında, sadece değişen satırlar yazılır.
  const ayarla=(yeni,ciz)=>{if(kesinEngel()){S.pt.zorla=true;render();return;}if(kilitBaskasi()){toast(kilitMesaj());S.pt.zorla=true;render();return;}if(sid!==S.pt.sube||ak!==S.ay){S.pt.zorla=true;render();return;}
    const eski=veri0();const fark=veriFark(eski,yeni);S.pt.doc={...(S.pt.doc||{}),veri:yeni};if(!Object.keys(fark.deg).length&&!fark.sil.length){if(ciz){S.pt.zorla=true;render();}return;}Promise.resolve(veriYaz(sid,ak,fark,kalanYama(sid,ak,yeni))).then(ok=>{if(ok!==false)bankaGonder(sid,ak,fark,eski);});if(ciz){S.pt.zorla=true;render();}};
  const coz=v=>{const k=veriKontrol(v,kL,ak,V.kilitli,V);return{...v,pid:k.gecersiz&&k.hata!=='Veri türü seçin'&&k.hata!=='Muhasebe kilitli'&&k.hata!=='Başka ay'&&k.hata!=='Miktar yok'?'':k.pid,_k:k};};
  const temiz=v=>{const k=veriKontrol(v,kL,ak,V.kilitli,V);const o={...v,pid:k.gecersiz?'':k.pid,tur:v.tur||''};if(k.gonder&&!k.gecersiz)o.gonder=k.gonder;else delete o.gonder;return o;};
  // Güncellemeden önce girilmiş "Bankaya yatan" satırları (maaşı başka şubede): ekran açılınca bir kez işaretlenir ve maaş şubesine gönderilir.
  {const gk=sid+'|'+ak;S.pt.gonderGecis=S.pt.gonderGecis||{};
   if(!S.pt.gonderGecis[gk]&&S.pt.doc&&S.pt.doc.kesin!==true&&!kilitBaskasi()){const ids=new Set(veri0().filter(v=>{if(v.gonder||v.tur!=='BY')return false;const k=veriKontrol(v,kL,ak,V.kilitli,V);return k.gonder&&!k.gecersiz;}).map(v=>v.id));
     if(ids.size){S.pt.gonderGecis[gk]=1;setTimeout(()=>{if(sid!==S.pt.sube||ak!==S.ay)return;ayarla(veri0().map(v=>ids.has(v.id)?temiz(v):v),false);},400);}}}
  const yeniSatir=(o={})=>{const son=veri0()[veri0().length-1]||{};const bugun=ymd(today()).slice(0,7)===ak?ymd(today()):ymd(new Date(+ak.slice(0,4),+ak.slice(5),0));
    return{id:Math.random().toString(36).slice(2,10),sira:yeniSira(),tarih:son.tarih||bugun,ad:'',pid:'',tur:'',miktar:'',aciklama:'',kim:S.me.adSoyad||S.me.kullaniciAdi||'',zaman:new Date().toISOString(),...o};};
  const grid=byId('vGrid');
  const durumGuncelle=(tr,v)=>{const k=veriKontrol(v,kL,ak,V.kilitli,V);tr.classList.toggle('hata',!!k.gecersiz);tr.querySelector('.dur').innerHTML=k.gecersiz?`<span class="chip bad">${esc(k.hata)}</span>`:k.uyari?`<span class="chip warn">${esc(k.uyari)}</span>`:k.gonder?`<span class="chip ok">→ ${esc(k.gonderAd)} şubesine işlenir</span>`:'';};
  const hucreYaz=(v,c,val)=>{if(c===0){const d=trTarihCoz(val);v.tarih=d||'';v._tarihYazi=d?'':val;}else if(c===1){v.ad=adBuyuk(val);v.pid='';}else if(c===2){const t=veriTur(val)?val:turCoz(val);v.tur=t||'';v.turYazi=t?'':val;}else if(c===3)v.miktar=String(val).trim()===''?'':sayi(val);else if(c===4)v.aciklama=String(val).trim();return temiz(v);};
  // Hücreler çizelgedeki gibi: tıkla seç, sürükle / Shift ile aralık, çift tıkla (ya da Enter / F2 / yazmaya başla) düzenle.
  // Ctrl+C / Ctrl+V / Delete seçili hücrelerde çalışır; yapıştırma seçili hücreden başlar, seçim yoksa ilk boş satıra.
  const hucreEl=(r,c)=>grid.querySelector(`tr[data-r="${r}"] [data-c="${c}"]`);
  const aralik=()=>{const A=S.pt.vsel;if(!A)return null;return{r0:Math.min(A.r0,A.r1),r1:Math.max(A.r0,A.r1),c0:Math.min(A.c0,A.c1),c1:Math.max(A.c0,A.c1)};};
  const satirSay=()=>grid.querySelectorAll('tr[data-vid]').length;
  const selCiz=()=>{grid.querySelectorAll('td.vsel,td.vakt').forEach(t=>t.classList.remove('vsel','vakt'));const A=aralik();if(!A)return;
    for(let r=A.r0;r<=A.r1;r++)for(let c=A.c0;c<=A.c1;c++){const e=hucreEl(r,c);const t=e&&e.closest('td');if(t)t.classList.add('vsel');}
    const a=hucreEl(S.pt.vsel.r1,S.pt.vsel.c1);if(a&&a.closest('td'))a.closest('td').classList.add('vakt');};
  const sec=(r,c,uzat)=>{const n=satirSay();if(!n)return;r=Math.max(0,Math.min(n-1,r));c=Math.max(0,Math.min(4,c));
    S.pt.vsel=uzat&&S.pt.vsel?{...S.pt.vsel,r1:r,c1:c}:{r0:r,c0:c,r1:r,c1:c};selCiz();const e=hucreEl(r,c);if(e&&e.scrollIntoView)e.scrollIntoView({block:'nearest',inline:'nearest'});};
  const duzenleniyor=()=>{const a=document.activeElement;return !!(a&&grid.contains(a)&&a.matches('[data-c]')&&(a.tagName==='SELECT'||!a.readOnly));};
  const duzenle=(r,c,ilk)=>{const el=hucreEl(r,c);if(!el||el.disabled)return;sec(r,c);
    if(el.tagName==='SELECT'){el.focus();try{el.showPicker&&el.showPicker();}catch(_){}return;}
    el.readOnly=false;el.focus();if(ilk!=null){el.value=c===1?ilk.toLocaleUpperCase('tr-TR'):ilk;try{el.setSelectionRange(el.value.length,el.value.length);}catch(_){}}else{try{el.select();}catch(_){}}};
  const bitir=el=>{if(el.tagName!=='SELECT')el.readOnly=true;grid.focus({preventScroll:true});};
  grid.querySelectorAll('tr[data-vid]').forEach(tr=>{const id=tr.dataset.vid;
    tr.querySelectorAll('[data-c]').forEach(el=>{const c=+el.dataset.c;
      if(c===1)el.oninput=()=>{const a=el.selectionStart,b=el.selectionEnd;el.value=el.value.toLocaleUpperCase('tr-TR');try{el.setSelectionRange(a,b);}catch(_){}};
      el.onchange=()=>{const L=veri0().map(v=>v.id===id?hucreYaz({...v},c,el.value):v);const v=L.find(x=>x.id===id);if(c===0&&v.tarih)el.value=trTarih(v.tarih);if(c===3&&v.miktar!=='')el.value=fmt(v.miktar);durumGuncelle(tr,v);ayarla(L,false);if(el.tagName==='SELECT')bitir(el);};
      el.onblur=()=>{if(el.tagName!=='SELECT')el.readOnly=true;};
      el.onkeydown=e=>{if(el.tagName!=='SELECT'&&el.readOnly)return;const r=+tr.dataset.r;
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const v=veri0().find(x=>x.id===id);if(v&&el.tagName!=='SELECT'){el.value=c===0?(v.tarih?trTarih(v.tarih):''):c===1?(v.ad!=null?v.ad:adBuyuk(adOf(v.pid))):c===3?(v.miktar==null||v.miktar===''?'':fmt(sayi(v.miktar))):c===4?(v.aciklama||''):el.value;}bitir(el);return;}
        if(e.key==='Tab'){e.preventDefault();el.dispatchEvent(new Event('change'));bitir(el);sec(r,c+(e.shiftKey?-1:1));return;}
        if(e.key==='Enter'||((e.key==='ArrowDown'||e.key==='ArrowUp')&&el.tagName!=='SELECT')){e.preventDefault();el.dispatchEvent(new Event('change'));bitir(el);
          const r2=r+(e.key==='ArrowUp'?-1:1);if(r2>=satirSay()&&e.key==='Enter'){S.pt.odak={c,yeni:true};ayarla([...veri0(),yeniSatir()],true);}else sec(r2,c);}};
      el.onpaste=e=>{if(el.tagName!=='SELECT'&&el.readOnly)return;const t=(e.clipboardData||window.clipboardData).getData('text');if(!/[\t\n]/.test(t.trim()))return;e.preventDefault();e.stopPropagation();bitir(el);yapistir(t,+tr.dataset.r,c);};});});
  const sutunlar=M=>{// şube sütununu ve başlık satırını at
    if(M.length&&M[0].some(x=>/TAR[İI]H|ADI|VER[İI] T[ÜU]R|M[İI]KTAR/i.test(x)))M=M.slice(1);
    const sb=tumSubeler().map(([i,a])=>isimAnahtar(a));const w=Math.max(...M.map(r=>r.length));const at=[];
    for(let j=0;j<w;j++){const col=M.map(r=>r[j]||'').filter(x=>x.trim());if(col.length&&col.every(x=>sb.includes(isimAnahtar(x))))at.push(j);}
    return M.map(r=>r.filter((x,j)=>!at.includes(j)));};
  const vis=()=>S.pt._vvis||veri0().map((v,i)=>i);
  const yapistir=(t,r0,c0)=>{let M=t.replace(/\r/g,'').split('\n');while(M.length&&!M[M.length-1].trim())M.pop();M=sutunlar(M.map(x=>x.split('\t')));if(!M.length)return;
    const L=veri0().slice();const VI=vis();const dok=[];M.forEach((row,i)=>{const pos=r0+i;let r=pos<VI.length?VI[pos]:null;if(r==null){L.push(yeniSatir());r=L.length-1;}let v={...L[r]};row.forEach((val,j)=>{const c=c0+j;if(c<=4)v=hucreYaz(v,c,val);});L[r]=v;dok.push(r);});
    const hata=dok.filter(r=>veriKontrol(L[r],kL,ak,V.kilitli,V).gecersiz).length;ayarla(L,true);toast(`${M.length} satır yapıştırıldı${hata?`, ${hata} satırda uyuşmazlık var (kırmızı)`:''}.`);};
  byId('vSatir').onclick=()=>{S.pt.odak={c:1};ayarla([...veri0(),yeniSatir()],true);};
  byId('vSatir10').onclick=()=>{const L=veri0().slice();for(let i=0;i<10;i++)L.push(yeniSatir());S.pt.odak={c:1,ilkBos:true};ayarla(L,true);};
  const ob=byId('vOto');if(ob)ob.onclick=()=>{S.pt.otoAcik=!(S.pt.otoAcik??(S.pt._otoBek>0));render();};
  // Çizelgeden gelenlerin onayı: sag[pid].otoOnay.{fm|sa} = onaylanan saat (çizelge değişince eşleşmez, onay düşer)
  const otoYaz=L=>{if(!otoKapi(V.ak,V.kilitli,V.kesin))return;const deg={};L.forEach(([pid,k,dr])=>{const x=V.satir.find(y=>y.pid===pid);if(!x)return;const h=Math.round((k==='fm'?(x.sol.fmSaat||0):(x.sol.calisilanSaat||0))*100)/100;
      const cur=((V.D&&V.D.sag)||{})[pid]||{};const d0=deg[pid]||{};deg[pid]={otoOnay:{...(cur.otoOnay||{}),...(d0.otoOnay||{}),[k]:dr==='on'?h:null},otoRed:{...(cur.otoRed||{}),...(d0.otoRed||{}),[k]:dr==='red'?h:null}};});if(!Object.keys(deg).length)return;
    const sag2=sagSonuclu(V,deg);S.pt.doc={...(S.pt.doc||{}),sag:{...((S.pt.doc&&S.pt.doc.sag)||{}),...Object.fromEntries(Object.keys(deg).map(p=>[p,sag2[p]]))}};
    veriYaz(sid,ak,{deg:{},sil:[]},{sube:sid,ay:ak,sag:sagYama(sag2,Object.keys(deg))});S.pt.zorla=true;render();};
  document.querySelectorAll('[data-oto]').forEach(c=>c.onchange=()=>{const[pid,k]=c.dataset.oto.split('|');otoYaz([[pid,k,c.value]]);});
  const oh=byId('vOtoHepsi');if(oh)oh.onclick=()=>{const L=[];V.satir.forEach(x=>{const b=x.hes.otoBekle;if(!b)return;if(b.fm!=null)L.push([x.pid,'fm','on']);if(b.sa!=null)L.push([x.pid,'sa','on']);});otoYaz(L);toast(`${L.length} kalem onaylandı.`);};
  if(S.pt._vkf)kfBagla('veri',S.pt._vkf.cols,S.pt._vkf.rows);const kv=byId('kfHepsiV');if(kv)kv.onclick=()=>{kfDurum('veri').f={};kfDurum('veri').sort=null;S.pt.vsel=null;render();};
  document.querySelectorAll('[data-sil]').forEach(b=>b.onclick=()=>{const v=veri0().find(x=>x.id===b.dataset.sil);const bos=v&&veriKontrol(v,kL,ak,V.kilitli,V).bos;if(!bos&&!b.dataset.ok){b.dataset.ok='1';b.textContent='Sil?';return;}ayarla(veri0().filter(x=>x.id!==b.dataset.sil),true);});
  // Fare: tıkla seç, sürükle / Shift+tıkla aralık, çift tıkla düzenle. Dokunmatik ekranda dokununca düzenler.
  let surukle=false,ptr='mouse';
  const konum=t=>{const td=t.closest&&t.closest('td.bi');const el=td&&td.querySelector('[data-c]');const tr=td&&td.closest('tr[data-r]');return el&&tr?{r:+tr.dataset.r,c:+el.dataset.c,el}:null;};
  grid.onpointerdown=e=>{ptr=e.pointerType||'mouse';const k=konum(e.target);if(!k||k.el.disabled)return;if(ptr!=='mouse')return;if(e.button!==0)return;
    if(document.activeElement===k.el&&duzenleniyor())return;// düzenlenen hücrenin içinde imleç / metin seçimi serbest
    e.preventDefault();const a=document.activeElement;if(a&&grid.contains(a)&&a!==grid)a.blur();grid.focus({preventScroll:true});sec(k.r,k.c,e.shiftKey);surukle=true;};
  grid.onpointermove=e=>{if(!surukle||ptr!=='mouse'||!(e.buttons&1))return;const t=document.elementFromPoint(e.clientX,e.clientY);const k=t&&konum(t);if(k&&S.pt.vsel&&(k.r!==S.pt.vsel.r1||k.c!==S.pt.vsel.c1))sec(k.r,k.c,true);};
  grid.onpointerup=grid.onpointercancel=()=>{surukle=false;};
  grid.ondblclick=e=>{const k=konum(e.target);if(k&&ptr==='mouse')duzenle(k.r,k.c);};
  grid.onclick=e=>{if(ptr==='mouse')return;const k=konum(e.target);if(k)duzenle(k.r,k.c);};
  grid.querySelectorAll('select[data-c]').forEach(el=>el.addEventListener('mousedown',e=>{if(ptr==='mouse'&&document.activeElement!==el)e.preventDefault();}));
  window.__vg={
    aktif:()=>S.tab==='puantaj'&&S.pt.gorunum==='veri'&&!byId('sheetRoot').innerHTML&&byId('vGrid')===grid&&grid.isConnected,
    duzenleniyor,aralik,sec,duzenle,
    tsv:()=>{const A=aralik();if(!A)return null;const R=[];for(let r=A.r0;r<=A.r1;r++){const row=[];for(let c=A.c0;c<=A.c1;c++){const x=hucreEl(r,c);row.push(x?(x.tagName==='SELECT'?(x.value?x.selectedOptions[0].text:''):x.value):'');}R.push(row.join('\t'));}return{t:R.join('\n'),n:(A.r1-A.r0+1)*(A.c1-A.c0+1)};},
    yapistir:t=>{const A=aralik();const tek=!/[\t\n]/.test(t.replace(/[\r\n]+$/,''));
      if(A){if(tek&&(A.r1>A.r0||A.c1>A.c0)){window.__vDoldur(t.replace(/[\r\n]+$/,''),A);return;}yapistir(t,A.r0,A.c0);return;}
      if(tek)return;const L=veri0();const VI=vis();const bosP=VI.findIndex(i=>L[i]&&veriKontrol(L[i],kL,ak,V.kilitli,V).bos);yapistir(t,bosP>=0?bosP:VI.length,0);}};
  window.__vDoldur=(val,A)=>{const L=veri0().slice();const VI=vis();let n=0;for(let p=A.r0;p<=A.r1;p++){const r=VI[p];if(r==null||!L[r])continue;let v={...L[r]};for(let c=A.c0;c<=A.c1;c++){if(c>4)continue;v=hucreYaz(v,c,val);n++;}L[r]=v;}
    ayarla(L,true);toast(val===''?`${n} hücre temizlendi.`:`${n} hücreye yapıştırıldı.`);};
  if(!veriYapistirBagli){veriYapistirBagli=true;
    document.addEventListener('copy',e=>{const G=window.__vg;if(!G||!G.aktif()||G.duzenleniyor())return;const x=G.tsv();if(!x)return;e.clipboardData.setData('text/plain',x.t);e.preventDefault();toast(`${x.n} hücre kopyalandı.`);});
    document.addEventListener('paste',e=>{const G=window.__vg;if(!G||!G.aktif()||G.duzenleniyor())return;const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&!(byId('vGrid')&&byId('vGrid').contains(a)))return;
      const t=(e.clipboardData||window.clipboardData).getData('text');if(!t)return;e.preventDefault();G.yapistir(t);});
    document.addEventListener('keydown',e=>{const G=window.__vg;if(!G||!G.aktif()||G.duzenleniyor())return;const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&!(byId('vGrid')&&byId('vGrid').contains(a)))return;
      const A=G.aralik();if(!A)return;const P=S.pt.vsel;
      if(e.key==='Escape'){S.pt.vsel=null;G.sec&&byId('vGrid').querySelectorAll('td.vsel,td.vakt').forEach(t=>t.classList.remove('vsel','vakt'));return;}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();window.__vDoldur('',A);return;}
      if(e.key==='Enter'||e.key==='F2'){e.preventDefault();G.duzenle(P.r1,P.c1);return;}
      if(e.key==='Tab'){e.preventDefault();G.sec(P.r1,P.c1+(e.shiftKey?-1:1));return;}
      const yon={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(yon){e.preventDefault();G.sec(P.r1+yon[0],P.c1+yon[1],e.shiftKey);return;}
      if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(P.c1===2)G.duzenle(P.r1,P.c1);else G.duzenle(P.r1,P.c1,e.key);}});}
  selCiz();
  // odak: yeni eklenen satırın hücresi seçilip düzenlemeye açılır
  if(S.pt.odak){const o=S.pt.odak;S.pt.odak=null;const rows=[...grid.querySelectorAll('tr[data-vid]')];let tr=o.ilkBos?rows.find(t=>{const v=veri0().find(x=>x.id===t.dataset.vid);return v&&veriKontrol(v,kL,ak,V.kilitli,V).bos;}):rows[rows.length-1];
    if(tr)duzenle(+tr.dataset.r,o.c);}}

// Boş satırlar: sekme değişince, şubeden çıkınca ve sayfa açılınca silinir.
function bosSatirMi(v){return !String(v.ad||'').trim()&&!v.pid&&!v.tur&&(v.miktar===''||v.miktar==null)&&!String(v.aciklama||'').trim();}
// Sadece kendi açtığım ya da 1 saatten eski boş satırlar silinir (başkasının o an doldurduğu yeni satıra dokunulmaz).
function veriBosTemizle(){const D=S.pt.doc;if(!D||D.kesin===true||!Array.isArray(D.veri)||!S.pt.sube||S.pt.sube!==S.subeId)return;const ben=(S.me&&(S.me.adSoyad||S.me.kullaniciAdi))||'';
  const silinir=v=>bosSatirMi(v)&&(v.kim===ben||!v.zaman||Date.now()-Date.parse(v.zaman)>3600000);const sil=D.veri.filter(silinir).map(v=>v.id);if(!sil.length)return;
  const sid=S.pt.sube,ak=S.ay;if(kilitBaskasi())return;S.pt.doc={...D,veri:D.veri.filter(v=>!silinir(v))};veriYaz(sid,ak,{deg:{},sil});}
function listeyeDon(){veriBosTemizle();S.pt.sube=null;subs.detay.forEach(u=>u());subs.detay=[];render();}
function sagSonuclu(V,degisen){const sag=JSON.parse(JSON.stringify((V.D&&V.D.sag)||{}));if(degisen)Object.entries(degisen).forEach(([pid,v])=>sag[pid]={...(sag[pid]||{}),...v});
  const prevSag=(S.pt.prev&&S.pt.prev.sag)||{};const net=netMap(V.ak);
  const ozB=ozBirlestir(veriOzet(V.D&&V.D.veri),V.sol);
  Object.keys(V.sol).forEach(pid=>{const dv=prevSag[pid]&&prevSag[pid].kalan<0?prevSag[pid].kalan:0;const r=sagHesap(pid,V.sol[pid],sag[pid],net[pid],V.sb,dv,ozB[pid],usOf(pid),otoKapi(V.ak,V.kilitli,V.kesin));sag[pid]={...(sag[pid]||{}),kalan:Math.round(r.kalan*100)/100};});return sag;}
async function onayla(){const ak=S.ay,sid=S.subeId;const ayni=()=>S.subeId===sid&&S.ay===ak&&S.pt.sube===sid&&!!S.pt.doc&&S.pt.ozetler!==null&&S.pt.prev!==null&&!S.pt.ozetHata&&sunucuHazir(sid);
  if(!ayni()){toast('Puantaj tam yüklenmeden onaylanamaz. Biraz bekleyip tekrar deneyin.');return;}if(await kilitliMi(ptK(sid,ak)))return;await gunleriYukle(ayKadrosu(ak),[ayKaydir(ak,-1),ak,ayKaydir(ak,1)]);
  if(!ayni()){toast('Onay sırasında ekran (şube ya da ay) değişti, onay yapılmadı. Tekrar deneyin.');return;}const V=ptVerisi();{const bek=V.satir.filter(x=>x.hes.otoBekle);if(bek.length){toast(`${bek.length} kişinin çizelgeden gelen mesaisi onay bekliyor (${bek.slice(0,3).map(x=>kisaAd(x.sol.ad)).join(', ')}${bek.length>3?'…':''}). Veri girişi → "Çizelgeden gelenler" listesinden onaylayın.`);return;}}const sol=ptSol(ak,V.D||{});const b=writeBatch(db);const V2={...V,sol};
  b.set(doc(db,'puantaj',sid,'aylar',ak),{sube:sid,ay:ak,sol,sag:sagYama(sagSonuclu(V2),[]),kilitli:true,onaylayan:S.user.uid,onaylayanAd:S.me.adSoyad||'',onayTarihi:new Date().toISOString(),guncellendi:new Date().toISOString()},{merge:true});
  b.set(doc(db,'subeler',sid,'aylar',ak),{durum:'bolge_onay',onaylayan:S.user.uid,onayTarihi:new Date().toISOString()},{merge:true});
  b.set(doc(db,'ozetler',ak+'__'+sid),{sube:sid,ay:ak,kisiler:subeOzeti(ak,sid),guncellendi:new Date().toISOString()},{mergeFields:['sube','ay','kisiler','guncellendi']});
  b.commit().then(()=>toast(`${sube().ad} · ${ayAdi(ak)} onaylandı.`)).catch(yazmaHatasi);}
// İşverenin kesin kapanışı: ekranda görünen bütün sonuçlar (muhasebe + ödemeler) saklanır; ay ve haftaları kurallarla kilitlenir.
async function kesinKapat(){const ak=S.ay,sid=S.subeId;const ayni=()=>isIsveren()&&S.subeId===sid&&S.ay===ak&&S.pt.sube===sid&&!!S.pt.doc&&S.pt.doc.kilitli===true&&S.pt.doc.kesin!==true&&S.pt.prev!==null&&sunucuHazir(sid);
  if(!ayni()){toast('Puantaj tam yüklenmeden kesin kapatılamaz.');return;}
  // Kesin kapanan aya değen haftalar bir daha düzenlenemez: açık / onaysız hafta kalırsa sonraki ayın günleri de donar.
  if(!ayHaftaDurumu(ak).tamam){toast('Ayın bütün haftaları onaylanmadan kesin kapatılamaz.');return;}
  if(KAYIT.n||navigator.onLine===false||(VBEK[sid+'|'+ak]||[]).length){toast('Gönderilmeyi bekleyen kayıt var. İnternet bağlantısını kontrol edip birkaç saniye sonra tekrar deneyin.');return;}
  if(await kilitliMi(ptK(sid,ak)))return;if(!ayni()){toast('Ekran değişti, işlem yapılmadı.');return;}
  const V=ptVerisi();const sag=sagSonuclu(V);const t=new Date().toISOString();const ad=benAd();
  const satir=V.satir.map(x=>({pid:x.pid,sol:x.sol,sag:x.sag,net:x.net??null,hes:x.hes}));const ayar=Object.fromEntries(AYAR_ALANLARI.map(k=>[k,V.sb[k]??null]));
  const b=writeBatch(db);b.set(doc(db,'puantaj',sid,'aylar',ak),{kesin:true,kesinSonuc:satirTemiz({satir,oz:V.oz,sb:ayar}),sag:sagYama(sag,[]),kesinTarihi:t,kesinAd:ad,kesinKayit:arrayUnion({t,ad,i:'kesin kapattı'}),guncellendi:t},{merge:true});
  b.set(doc(db,'subeler',sid,'aylar',ak),{durum:'kesin',kesinTarihi:t,kesinAd:ad},{merge:true});
  b.commit().then(()=>toast(`${ayAdi(ak)} kesin kapandı.`)).catch(yazmaHatasi);}
async function kesinAc(){const ak=S.ay,sid=S.subeId;if(!isIsveren())return;if((S.aylar[ayKaydir(ak,1)]||{}).durum==='kesin'){toast('Sonraki ay kesin kapalı, bu ay açılamaz.');return;}
  const t=new Date().toISOString();const ad=benAd();const b=writeBatch(db);
  b.set(doc(db,'puantaj',sid,'aylar',ak),{kesin:false,kesinKayit:arrayUnion({t,ad,i:'kesin kapanışı açtı'}),guncellendi:t},{merge:true});
  b.set(doc(db,'subeler',sid,'aylar',ak),{durum:'bolge_onay'},{merge:true});
  b.commit().then(()=>toast('Kesin kapanış açıldı; ay bölge onaylı duruma döndü.')).catch(yazmaHatasi);}
async function kilidiAc(){const ak=S.ay,sid=S.subeId;if(await kilitliMi(ptK(sid,ak)))return;const b=writeBatch(db);b.set(doc(db,'puantaj',sid,'aylar',ak),{kilitli:false,guncellendi:new Date().toISOString()},{merge:true});
  b.set(doc(db,'subeler',sid,'aylar',ak),{durum:'taslak'},{merge:true});b.commit().then(()=>toast('Kilit açıldı, ay yeniden düzenlenebilir.')).catch(yazmaHatasi);}
function geriGonderPanel(){if(kilitEngel())return;openSheet(`<h2>Şubeye geri gönder</h2><div class="sub">Şube müdürü notu görür, düzeltip ayı yeniden kapatır.</div><label class="field"><span>Not</span><textarea id="gNot" rows="3" placeholder="Örn: Ali'nin 14 Ekim raporu eksik"></textarea></label>
  <div class="row2"><button class="btn grow" id="gNo">Vazgeç</button><button class="btn danger grow" id="gOk">Geri gönder</button></div>`,()=>{byId('gNo').onclick=closeSheet;
  byId('gOk').onclick=()=>{const not=byId('gNot').value.trim();{const sid=S.subeId,ay=S.ay;sirayla('ay'+ay,()=>{arka(setDoc(doc(db,'subeler',sid,'aylar',ay),{durum:'geri',not,geriGonderen:S.user.uid,geriTarih:new Date().toISOString()},{merge:true}));});}closeSheet();toast('Şubeye geri gönderildi.');};});}
// Muhasebe satırından gün ekleme: rapor, ücretsiz izin, yıllık izin, bayram, part gün. Yazılan sayı mevcut toplama EKLENİR;
// her biri Veri girişine ayrı satır olarak yazılır (tek kaynak veri girişi, kontroller orada).
function gunPanel(pid){if(kilitEngel()||kesinEngel())return;const V=ptVerisi();const x=V.satir.find(s=>s.pid===pid);if(!x)return;const ak=V.ak,sid=S.subeId;
  if(V.kilitli){toast('Ay onaylı: rapor, izin ve part gün eklenemez. Düzeltme için kilidi açın.');return;}
  const T=[['R','Rapor','rapor'],['UI','Ücretsiz izin','ucretsiz'],['YI','Yıllık izin','yillik'],['B','Bayram','bayram'],['PG','Part gün','partGun']];
  const kL=veriKisileri(V);const adP=adBuyuk(((kL.find(([id])=>id===pid)||[])[1])||x.sol.ad);
  const mevcut=((V.D&&V.D.veri)||[]).filter(v=>['R','UI','YI','B','PG'].includes(v.tur)&&(v.pid===pid||isimAnahtar(v.ad||'')===isimAnahtar(adP))).sort((a,b)=>String(a.tarih||'').localeCompare(String(b.tarih||'')));
  const sonGun=ymd(new Date(+ak.slice(0,4),+ak.slice(5),0));const bugun=ymd(today());const tar0=bugun.slice(0,7)===ak?bugun:sonGun;
  openSheet(`<h2>${esc(x.sol.ad)}</h2><div class="sub">${ayAdi(ak)} · ${esc(x.sol.sekil)} · ${x.sol.gun} gün sayısı${x.sol.hakGun!=null&&x.sol.hakGun!==x.sol.gun?` · ${x.sol.hakGun} çalışılan gün`:''}</div>
   <p class="note" style="margin-top:0">Yazdığınız gün <b>mevcut toplama eklenir</b> (ör. 2 gün rapor varken 5 yazarsanız 7 olur). Her biri Veri girişine "Muhasebe penceresinden" açıklamasıyla satır olarak yazılır.</p>
   <div class="fgrid">${T.map(([k,ad,f])=>`<label class="field"><span>${ad} <small style="color:var(--mut)">· şu an ${fmt(x.sol[f]||0)}</small></span><input id="gp${k}" inputmode="decimal" placeholder="+ gün"></label>`).join('')}
   <label class="field"><span>Tarih</span><input id="gpT" type="date" value="${tar0}" min="${ak}-01" max="${sonGun}"></label>
   <label class="field" style="grid-column:1/-1"><span>Açıklama (isteğe bağlı)</span><input id="gpA" placeholder="ör. hastane raporu"></label></div>
   ${mevcut.length?`<span class="lbl">Bu ay girilmiş gün kayıtları</span><div class="tbl-wrap"><table class="pt"><tbody>${mevcut.map(v=>`<tr><td>${v.tarih?trTarih(v.tarih):''}</td><td class="l">${esc((veriTur(v.tur)||{}).ad||v.tur)}</td><td>${fmt(sayi(v.miktar))}</td><td class="l">${esc(v.aciklama||'')}</td></tr>`).join('')}</tbody></table></div>`:''}
   <p class="note">Rapor / izin / part gün, girildiği şubeden bağımsız olarak kişinin SGK ve maaş şubesinde sayılır. Yanlış girilen satırı Veri girişinden silin.</p>
   <div class="row2"><button class="btn grow" id="gpNo">Vazgeç</button><button class="btn primary grow" id="gpOk">Ekle</button></div>`,()=>{
   byId('gpNo').onclick=closeSheet;
   byId('gpOk').onclick=()=>{if(kilitEngel()||kesinEngel())return;const tar=byId('gpT').value;if(!tar||tar.slice(0,7)!==ak){toast(`Tarih ${ayAdi(ak)} içinde olmalı.`);return;}
     const a=byId('gpA').value.trim();const kim=S.me.adSoyad||S.me.kullaniciAdi||'';const z=new Date().toISOString();const ek=[];
     for(const[k,ad]of T){const m=sayi(byId('gp'+k).value);if(!m)continue;if(m<0){toast(`${ad}: eksi gün eklenemez, yanlış satırı Veri girişinden silin.`);return;}
       ek.push({id:Math.random().toString(36).slice(2,10),sira:yeniSira(),tarih:tar,ad:adP,pid,tur:k,miktar:m,aciklama:(a?a+' · ':'')+'Muhasebe penceresinden',kim,zaman:z});}
     if(!ek.length){toast('Eklenecek gün girilmedi.');return;}
     if(sid!==S.pt.sube||ak!==S.ay){toast('Ekran değişti, eklenmedi. Tekrar deneyin.');return;}
     const veriY=[...((S.pt.doc&&S.pt.doc.veri)||[]),...ek];S.pt.doc={...S.pt.doc,veri:veriY};
     veriYaz(sid,ak,{deg:Object.fromEntries(ek.map(r=>[r.id,r])),sil:[]},kalanYama(sid,ak,veriY));closeSheet();S.pt.zorla=true;render();
     toast(ek.map(r=>`${fmt(r.miktar)} gün ${veriTur(r.tur).ad.toLocaleLowerCase('tr-TR')}`).join(', ')+' eklendi.');};});}
function odemePanel(pid){if(kilitEngel()||kesinEngel())return;const V=ptVerisi();const x=V.satir.find(s=>s.pid===pid);if(!x)return;const s=x.sag;const esnaf=x.hes.esnaf;const ekToplam=k=>{const v=(V.oz[pid]||{})[k]||0;return v?tl(v):'';};const us0=usOf(pid);let tip=us0.tip;const maasDisi=x.sol.maasBurada===false;const kuryeMi=(x.sol.grup||'')==='S';const partMi=x.sol.sekil==='Part';if(!kuryeMi&&tip==='paket')tip='maas';if(!partMi&&tip==='saat'&&!maasDisi)tip=us0.tip==='saat'?'saat':tip;const tc=(S.pt.maas&&S.pt.maas.tc&&S.pt.maas.tc[pid])||((S.personel.find(q=>q.id===pid)||{}).tc)||'';
  const inp=(id,label,val,ph='')=>`<label class="field"><span>${label}</span><input id="${id}" inputmode="decimal" value="${val??''}" placeholder="${ph}"></label>`;
  const pK=S.personel.find(q=>q.id===pid);const ms0=pK?odemeSubesi(pK,V.ak):'';let msSecHtml='';
  if(pK&&!esnaf){const sgk=pK.sgkSube&&pK.sgkSube!==SGK_YOK?pK.sgkSube:'';const ana=pK.anaSube||'';
    // İşveren her şubeyi seçebilir; diğerleri kişinin görüldüğü şubeleri (çalıştığı, SGK).
    const ids=isIsveren()?tumSubeler().map(([i])=>i):[...new Set([ana,sgk,ms0].filter(Boolean))];if(ms0&&!ids.includes(ms0))ids.unshift(ms0);
    const gy=maasSubeGecmisYazi(pK);
    msSecHtml=`<label class="field" style="grid-column:1/-1"><span>Maaşın ödendiği şube · ${ayAdi(V.ak)} ayından itibaren</span><select id="oMs" ${V.kilitli?'disabled':''}>${ids.map(i=>`<option value="${esc(i)}" ${i===ms0?'selected':''}>${esc(subeAdi(i))}${i===sgk?' (SGK)':i===ana?' (çalıştığı)':''}</option>`).join('')}</select></label>
     <p class="note" style="grid-column:1/-1;margin-top:0">${V.kilitli?'Bu ay onaylı, bu ay için değiştirilemez. ':''}Değiştirirseniz bu ay ve sonrası için geçerli olur; önceki aylar değişmez. Muhasebe ${esc(subeAdi(sgk||ana))}'de kalır.${gy?' Geçmiş: '+esc(gy):''}</p>`;}
  let fmModD=s.fmMod==='elle'&&s.fmBirim!==undefined?'elle':'maas';
  openSheet(`<h2>${esc(x.sol.ad)}</h2><div class="sub">${ayAdi(V.ak)} · ${esc(x.sol.sekil)} · ${esnaf?'paket başı':x.sol.gun+' bordro günü'+(x.sol.hakGun!=null&&x.sol.hakGun!==x.sol.gun?` · ${x.sol.hakGun} çalışılan gün`:'')}${x.sol.fmSaat&&!esnaf?' · fazla mesai '+sg(x.sol.fmSaat)+' sa':''}${x.sol.sekil==='Part'?` · çizelgede ${fmt(x.sol.calisilanSaat||0)} sa`:''}</div>
   <div class="fgrid">${esnaf?inp('oPs','Paket sayısı',s.paketSayisi)+inp('oPu','Paket başı ücret (₺)',s.paketUcret,''):`<div style="grid-column:1/-1"><span class="lbl">Ücret şekli</span><div class="seg" id="oSekil">${(maasDisi?[['maas','Maaşı başka şubede'],...(kuryeMi?[['paket','Paket başı']]:[]),['saat','Saatlik']]:[['maas','Maaşlı'],...(kuryeMi?[['paket','Paket başı']]:[]),['saat','Saatlik']]).map(([k,a])=>`<button data-v="${k}" class="${tip===k?'on':''}">${a}</button>`).join('')}</div></div>
     <div id="oNetW" style="grid-column:1/-1" ${tip==='maas'&&!maasDisi?'':'hidden'}>${inp('oNet',`Anlaşılan aylık net (₺) · ${ayAdi(V.ak)} ayından itibaren`,x.net,'örn. 50000')}<p class="note" style="margin-top:0">Değiştirirseniz bu ay ve sonrası için geçerli olur; önceki aylar değişmez.${ucretGecmisi('netGecmis',pid)?' Geçmiş: '+esc(ucretGecmisi('netGecmis',pid)):''}</p></div>
     <p class="note" id="oMdNot" style="grid-column:1/-1" ${tip==='maas'&&maasDisi?'':'hidden'}>Maaşı ${esc(x.sol.odemeSube||'SGK şubesinin')} puantajında. Burada sadece bu şubede yaptığı fazla mesai ve buraya ait primler hesaplanır.</p>
     <p class="note" id="oPbNot" style="grid-column:1/-1" ${tip==='paket'?'':'hidden'}>Paket başı: kazanç paket primleridir. Paket primlerini Veri girişinden "Paket primi" olarak girin; bankaya yatan, ara ödeme ve avans düşülür, kalan elden ödenir. Fazla mesai hesaplanmaz.</p>
     <div id="oSaatW" style="grid-column:1/-1" ${tip==='saat'?'':'hidden'}>${inp('oSaat',`Saat ücreti (₺) · ${ayAdi(V.ak)} ayından itibaren`,us0.saatUcret||'','örn. 120')}<p class="note" style="margin-top:0">Saatler mesai çizelgesinden ayın 1'i ile son günü arasında otomatik alınır (bu ay ${fmt(x.sol.calisilanSaat||0)} sa, sadece bu şubedeki saatler). Eksik ya da fazla varsa Veri girişine "Çalışılan saat" türüyle + ya da − saat girin. Hak ediş = saat × ücret; bankaya yatan, ara ödeme ve avans düşülür. Fazla mesai hesaplanmaz.</p></div>`}
   ${!esnaf&&V.sb.fmYontem==='maas'?`<div id="oFmW" style="grid-column:1/-1" ${tip==='maas'?'':'hidden'}><span class="lbl">Fazla mesai</span><div class="seg" id="oFmS"><button data-v="maas" class="${fmModD==='elle'?'':'on'}">Maaşına göre</button><button data-v="elle" class="${fmModD==='elle'?'on':''}">Elle yaz</button></div><div id="oFmTW" ${fmModD==='elle'?'':'hidden'}>${inp('oFmT','Fazla mesai saat ücreti (₺)',s.fmBirim||'','örn. 220')}</div><p class="note" id="oFmH" style="margin-top:4px"></p></div>`:''}
   ${!esnaf&&V.sb.fmYontem!=='maas'?`<div id="oFoW" style="grid-column:1/-1" ${tip==='maas'?'':'hidden'}>${inp('oFo',`Özel fazla mesai saat ücreti (₺) · ${ayAdi(V.ak)} ayından itibaren`,us0.fmOzel||'','boşsa şube ücreti: '+(sayi(V.sb.fmUcret)||'-'))}<p class="note" style="margin-top:0">Sadece bu kişi için. Boş bırakırsanız şubenin sabit ücreti uygulanır; bu ay ve sonrası için geçerli olur, önceki aylar değişmez.${ucretGecmisi('fmOzelGecmis',pid)?' Geçmiş: '+esc(ucretGecmisi('fmOzelGecmis',pid)):''}</p></div>`:''}
   ${inp('oCiro','Ciro primi ekle (₺)','')}
   <p class="note yardim" style="grid-column:1/-1;margin-top:0">Buraya yazdığınız ciro primi veri girişine ayın son günü tarihli satır olarak eklenir. Paket primi, avans ve ara ödemeyi veri girişinden girin.${ekToplam('PP')||ekToplam('CP')?` Bu ay girilmiş: ${ekToplam('PP')?'paket primi '+ekToplam('PP'):''}${ekToplam('PP')&&ekToplam('CP')?', ':''}${ekToplam('CP')?'ciro primi '+ekToplam('CP'):''}.`:''}</p>
   ${msSecHtml}
   <label class="field"><span>TC kimlik no (bordro eşleşmesi için)</span><input id="oTc" inputmode="numeric" maxlength="11" value="${esc(tc)}"></label></div>
   <div class="calc" id="oCalc"></div><div id="oErr"></div><div class="row2"><button class="btn grow" id="oNo">Vazgeç</button><button class="btn primary grow" id="oOk">Kaydet</button></div>`,sh=>{
   const oku=()=>{const v=id=>{const e=byId(id);return e?e.value.trim():undefined;};const o={};if(esnaf){o.paketSayisi=v('oPs');o.paketUcret=v('oPu');}if(byId('oFmW')){const el=fmModD==='elle'&&tip==='maas';o.fmMod=el?'elle':'';o.fmBirim=el?(v('oFmT')||''):'';}return o;};
   const ekV=V.oz[pid]||{};
   sh.querySelectorAll('#oSekil button').forEach(b=>b.onclick=()=>{tip=b.dataset.v;sh.querySelectorAll('#oSekil button').forEach(q=>q.classList.toggle('on',q===b));byId('oNetW').hidden=!(tip==='maas'&&!maasDisi);byId('oMdNot').hidden=!(tip==='maas'&&maasDisi);byId('oPbNot').hidden=tip!=='paket';byId('oSaatW').hidden=tip!=='saat';const fw=byId('oFmW');if(fw)fw.hidden=tip!=='maas';const fo=byId('oFoW');if(fo)fo.hidden=tip!=='maas';calc();});
   sh.querySelectorAll('#oFmS button').forEach(b=>b.onclick=()=>{fmModD=b.dataset.v;sh.querySelectorAll('#oFmS button').forEach(q=>q.classList.toggle('on',q===b));byId('oFmTW').hidden=fmModD!=='elle';if(fmModD==='elle'){const ti=byId('oFmT');if(ti&&!ti.value){const nn=byId('oNet')?sayi(byId('oNet').value):sayi(x.net);const r0=fmSaatUcreti(V.sb,nn,V.ak);if(r0)ti.value=String(r0);}}calc();});
   const usSimdi=()=>({tip,saatUcret:byId('oSaat')?sayi(byId('oSaat').value):0,fmOzel:byId('oFo')&&tip==='maas'?sayi(byId('oFo').value):0,ak:V.ak});
   const calc=()=>{const o=oku();const fh=byId('oFmH');if(fh){const nn=byId('oNet')?sayi(byId('oNet').value):sayi(x.net);const fs=x.sol.fmSaat||0;fh.textContent=fmModD==='elle'?`Çizelgede ${sg(fs)} sa fazla mesai var. Saat ücretini kendiniz yazın.`:nn?`${tl0(nn)} ÷ 30 ÷ 9 = ${fmt(nn/30/9)} → ${tl0(fmSaatUcreti(V.sb,nn,V.ak))}/sa${V.ak>=FM_KUSURAT_AYI?' (küsurat atılır)':''} × ${sg(fs)} sa`:'Net maaş girilmedi, saat ücretini "Elle yaz" ile girin.';}const n=esnaf?0:byId('oNet')?sayi(byId('oNet').value):sayi(x.net);const ek2={...ekV,CP:(ekV.CP||0)+sayi(byId('oCiro').value)};const r=sagHesap(pid,x.sol,{...s,...o},n,V.sb,x.hes.devir,ek2,esnaf?{}:usSimdi(),otoKapi(V.ak,V.kilitli,V.kesin));const pb=r.pb;
     byId('oCalc').innerHTML=`${esnaf?`<div><span>Paket hak edişi</span><b>${tl(r.paketHak)}</b></div>`:pb?'':r.saat?`<div><span>Hak edilen (${fmt(r.saatSayi)} saat${r.saatSayi!==r.cizelgeSaat?` = çizelge ${fmt(r.cizelgeSaat)} ${r.saatSayi>r.cizelgeSaat?'+':'−'} ${fmt(Math.abs(r.saatSayi-r.cizelgeSaat))}`:''} × ${tl(r.saatUcret)})</span><b>${tl(r.hak)}</b></div>`:`<div><span>Hak edilen (net × ${x.sol.hakGun!=null?x.sol.hakGun:x.sol.gun}${x.sol.bayram>0?`+${fmt(x.sol.bayram)} bayram`:''}/30${x.sol.hakGun!=null&&x.sol.hakGun!==x.sol.gun?(x.sol.sekil==='Part'||x.sol.partGun>0?` · muhasebede part ${fmt(x.sol.gun)} gün`:x.sol.sgkYok?' · SGK yok':` · ${x.sol.hakGun-x.sol.gun} gün deneme`):''})</span><b>${tl(r.hak)}</b></div>`}<div><span>− Bankaya yatan</span><b>${tl(r.bankaya)}</b></div>${pb?'':`<div><span>= Maaş farkı</span><b>${tl(r.maasFarki)}</b></div>`}
       ${r.fmTl?`<div><span>+ Fazla mesai</span><b>${tl(r.fmTl)}</b></div>`:''}${r.paketPrimi?`<div><span>+ Paket primi</span><b>${tl(r.paketPrimi)}</b></div>`:''}${r.ciroPrimi?`<div><span>+ Ciro primi</span><b>${tl(r.ciroPrimi)}</b></div>`:''}${r.araOdeme?`<div><span>− Ara ödeme</span><b>${tl(r.araOdeme)}</b></div>`:''}${r.avans?`<div><span>− Avans${r.devirAvans?` (${tl(r.devirAvans)} geçen ay devri dahil)`:''}</span><b>${tl(r.avans)}</b></div>`:''}
       ${Math.abs(r.kalan-r.kalanHam)>0.004?`<div><span>Yuvarlama (5 ₺)</span><b>${tl(r.kalan-r.kalanHam)}</b></div>`:''}<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Kalan ödeme</span><b class="${r.kalan<0?'neg':'pos'}">${tl(r.kalan)}</b></div>${r.kalan<0?'<div><span class="note" style="margin:0">Eksi tutar sonraki ayın ödemesinden düşülür.</span></div>':''}`;};
   sh.querySelectorAll('input').forEach(i=>i.oninput=calc);calc();byId('oNo').onclick=closeSheet;
   byId('oOk').onclick=async()=>{const o=oku();const tcv=byId('oTc').value.replace(/\D/g,'');if(tcv&&tcv.length!==11){byId('oErr').innerHTML='<div class="confirm">TC kimlik no 11 haneli olmalı.</div>';return;}
     const sid=S.subeId,ak=V.ak;const sag=sagSonuclu(V,{[pid]:o});
     if(await kilitliMi(ptK(sid,ak)))return;
     try{const netEl=byId('oNet');if(!esnaf){const u=usSimdi();if(u.tip!==us0.tip||(u.tip==='saat'&&u.saatUcret!==us0.saatUcret)){const m0=S.pt.maas||{};
         const sg0=(m0.saatGecmis||{})[pid]||{};S.pt.maas={...m0,ucretSekli:{...(m0.ucretSekli||{}),[pid]:u.tip},paketBasi:{...(m0.paketBasi||{}),[pid]:u.tip==='paket'},...(u.tip==='saat'?{saatGecmis:{...(m0.saatGecmis||{}),[pid]:{...sg0,[ak]:u.saatUcret}}}:{})};
         setDoc(doc(db,'maaslar',sid),{ucretSekli:{[pid]:u.tip},paketBasi:{[pid]:u.tip==='paket'},...(u.tip==='saat'?{saatGecmis:{[pid]:{[ak]:u.saatUcret}}}:{})},{merge:true}).catch(yazmaHatasi);}
         const kp=S.personel.find(q=>q.id===pid),yPb=u.tip==='paket';if(kp&&!!kp.paketBasi!==yPb){kp.paketBasi=yPb;setDoc(doc(db,'personel',pid),{paketBasi:yPb},{merge:true}).catch(yazmaHatasi);}/* paket başı kişinin kendisinde: her şubede geçerli */}
       if(!esnaf&&byId('oFo')){const yeni=tip==='maas'?(sayi(byId('oFo').value)||0):0;const eski=sayi(us0.fmOzel)||0;if(yeni!==eski){const m0=S.pt.maas||{};const g0=(m0.fmOzelGecmis||{})[pid]||{};
         S.pt.maas={...m0,fmOzelGecmis:{...(m0.fmOzelGecmis||{}),[pid]:{...g0,[ak]:yeni}}};setDoc(doc(db,'maaslar',sid),{fmOzelGecmis:{[pid]:{[ak]:yeni}}},{merge:true}).catch(yazmaHatasi);}}
       const netYeni=!esnaf&&netEl&&!byId('oNetW').hidden?(sayi(netEl.value)||null):undefined;const netDeg=netYeni!==undefined&&netYeni!==(sayi(x.net)||null);
       if(netDeg||tcv!==tc){const m={};if(netDeg)m.netGecmis={[pid]:{[ak]:netYeni}};if(tcv!==tc)m.tc={[pid]:tcv||null};
         if(netDeg){const m0=S.pt.maas||{};S.pt.maas={...m0,netGecmis:{...(m0.netGecmis||{}),[pid]:{...((m0.netGecmis||{})[pid]||{}),[ak]:netYeni}}};}setDoc(doc(db,'maaslar',sid),m,{merge:true}).catch(yazmaHatasi);}
       // Primler ve eski kayıtlı avans/prim tutarları veri girişine taşınır: veri tek yerde.
       const sonGun=ymd(new Date(+ak.slice(0,4),+ak.slice(5),0));const kim=S.me.adSoyad||S.me.kullaniciAdi||'';const z=new Date().toISOString();const adP=adBuyuk(x.sol.ad);
       const satir=(tur,m,a)=>({id:Math.random().toString(36).slice(2,10),sira:yeniSira(),tarih:sonGun,ad:adP,pid,tur,miktar:m,aciklama:a,kim,zaman:z});const ek=[];
       if(sayi(byId('oCiro').value))ek.push(satir('CP',sayi(byId('oCiro').value),'Ödeme penceresinden'));
       const eskiS=sag[pid]||{};[['paketPrimi','PP'],['ciroPrimi','CP'],['avans','AV']].forEach(([f,t])=>{if(sayi(eskiS[f])){ek.push(satir(t,sayi(eskiS[f]),'Önceki kayıttan taşındı'));sag[pid]={...sag[pid],[f]:''};}});
       const burada=sid===S.pt.sube&&ak===S.ay&&S.pt.doc;const veriY=[...((burada?S.pt.doc.veri:V.D.veri)||[]),...ek];if(burada)S.pt.doc={...S.pt.doc,veri:veriY};
       const sag2=sagSonuclu({...V,D:{...V.D,sag,veri:veriY}});
       veriYaz(sid,ak,{deg:Object.fromEntries(ek.map(r=>[r.id,r])),sil:[]},{...(V.kilitli?{}:{sube:sid,ay:ak}),sag:sagYama(sag2,[pid])},{kilitsiz:true});
       const msEl=byId('oMs');let msMesaj='';if(pK&&msEl&&!msEl.disabled&&msEl.value&&msEl.value!==ms0){const ym=maasGecmisYama(pK,msEl.value,ak);if(ym){Object.assign(pK,ym);setDoc(doc(db,'personel',pK.id),ym,{merge:true}).catch(yazmaHatasi);msMesaj=` Maaşı ${ayAdi(ak)} ayından itibaren ${subeAdi(msEl.value)} puantajında.`;}}
       closeSheet();toast((ek.length?'Kaydedildi, primler veri girişine eklendi.':'Ödeme bilgileri kaydedildi.')+msMesaj);if(msMesaj)render();}
     catch(e){yazmaHatasi(e);}};});}

/* ================= Muhasebe çıktısı ================= */
/* ================= Muhasebe çıktısı: görsel / PDF, paylaş ================= */
function trBuyukBas(t){return String(t||'').toLocaleLowerCase('tr-TR').split(/(\s+)/).map(w=>w.trim()?w[0].toLocaleUpperCase('tr-TR')+w.slice(1):w).join('');}
/* ---- Ödeme listesi paylaşımı: kişi seçerek (hepsi seçili gelir), üstte seçilenlerin toplamı ----
   Sade: ad + gün + kalan ödeme (çalışanlara). Ayrıntılı: ödemeler tablosunun sütunları (müdüre). */
function odBaslik(V){return `${trBuyukBas(V.sb.ad)} Şube ${AY[+V.ak.slice(5)-1]} Ayı Ödeme Listesi`;}
function odToplam(L){return L.reduce((t,x)=>{const h=x.hes;t.hak+=(h.pb?0:h.hak)+h.fmTl+h.paketPrimi+h.ciroPrimi+(h.ekOd||0);t.bankaya+=h.bankaya;t.avans+=h.avans+h.araOdeme;t.nakit+=Math.max(h.kalan,0);t.kalan+=h.kalan;return t;},{hak:0,bankaya:0,avans:0,nakit:0,kalan:0});}
async function odemeGorseli(V,L,sade){try{await document.fonts.ready;}catch(e){}const T=MUH_TEMA.klasik;
  const tmp=document.createElement('canvas').getContext('2d');const F=(w,s)=>`${w} ${s}px Figtree,system-ui,sans-serif`;const olc=(t,f)=>{tmp.font=f;return tmp.measureText(String(t)).width;};
  const gunY=x=>x.hes.saat?fmt(x.hes.saatSayi)+' sa':x.hes.esnaf||x.hes.maasYok?'—':String(x.sol.hakGun!=null?x.sol.hakGun:x.sol.gun);const t2=v=>Math.abs(v||0)>0.004?tl(v):'';
  const bas=sade?['#','ADI SOYADI','GÜN','ÖDENECEK']:['#','ADI SOYADI','GÜN','HAK EDİLEN','BANKAYA YATAN','FAZLA MESAİ','PRİM','AVANS + ARA ÖD.','ÖDENECEK'];
  const veri=L.map((x,i)=>{const h=x.hes;const ad=String(x.sol.ad).toLocaleUpperCase('tr-TR');return sade?[i+1,ad,gunY(x),tl(h.kalan)]:[i+1,ad,gunY(x),h.pb?'':t2(h.hak+(h.ekOd||0)),t2(h.bankaya),t2(h.fmTl),t2(h.paketPrimi+h.ciroPrimi),t2(h.avans+h.araOdeme),tl(h.kalan)];});
  const son=bas.length-1;const fH=F(800,10.5),fA=F(700,12),fD=F(600,11.5),fK=F(800,12.5);
  const cw=bas.map((b,j)=>Math.ceil(Math.max(olc(b,fH),...veri.map(r=>olc(r[j],j===1?fA:j===son?fK:fD)),j===1?150:24)+(j===1?22:18)));
  const Tp=odToplam(L);const kutu=sade?[['Ödenecek toplam',tl0(Tp.nakit)],['Kişi',String(L.length)]]:[['Hak ediş',tl0(Tp.hak)],['Bankaya yatan',tl0(Tp.bankaya)],['Avans + ara ödeme',tl0(Tp.avans)],['Ödenecek toplam',tl0(Tp.nakit)]];
  const pad=28,tw=cw.reduce((a,b)=>a+b,0),W=Math.max(tw+pad*2,sade?460:720),ox=(W-tw)/2,rowH=26,thH=30,kH=58,top=96+kH+16;const H=top+thH+L.length*rowH+thH+48;
  const cv=document.createElement('canvas');cv.width=W*2;cv.height=H*2;const x=cv.getContext('2d');x.scale(2,2);x.textBaseline='middle';
  x.fillStyle='#fff';x.fillRect(0,0,W,H);
  x.fillStyle=T.bant;x.fillRect(0,0,W,58);x.fillStyle=T.bantYazi;x.font=F(800,18);x.textAlign='left';x.fillText(`${String(V.sb.ad).toLocaleUpperCase('tr-TR')} ŞUBE`,ox,24);
  x.font=F(500,11.5);x.globalAlpha=.85;x.fillText('Ödeme listesi',ox,43);x.globalAlpha=1;
  const ayT=`${AY[+V.ak.slice(5)-1].toLocaleUpperCase('tr-TR')} ${V.ak.slice(0,4)}`;x.font=F(800,13);const aw=olc(ayT,F(800,13))+28;
  x.fillStyle=T.ayKutu;x.beginPath();x.roundRect?x.roundRect(ox+tw-aw,15,aw,28,6):x.rect(ox+tw-aw,15,aw,28);x.fill();x.fillStyle=T.ayYazi;x.textAlign='center';x.fillText(ayT,ox+tw-aw/2,29.5);
  x.textAlign='left';x.fillStyle=T.not;x.font=F(600,11);x.fillText(`${L.length} kişi`,ox,78);x.textAlign='right';x.fillText(`Hazırlayan: ${S.me.adSoyad||S.me.kullaniciAdi||''} · ${trTarih(ymd(today()))}`,ox+tw,78);
  // üstte toplam kutuları (son kutu: ödenecek nakit, vurgulu)
  const kg=8,kw=(tw-kg*(kutu.length-1))/kutu.length;kutu.forEach(([a,v],k)=>{const kx=ox+k*(kw+kg),ky=96;const vur=a==='Ödenecek toplam';
    x.fillStyle=vur?T.bant:T.zebra;x.beginPath();x.roundRect?x.roundRect(kx,ky,kw,kH,8):x.rect(kx,ky,kw,kH);x.fill();
    x.textAlign='left';x.fillStyle=vur?'#fff':T.not;x.font=F(600,11);x.fillText(a,kx+12,ky+18);x.fillStyle=vur?'#fff':'#14202f';x.font=F(800,18);x.fillText(v,kx+12,ky+40);});
  let y=top;x.fillStyle=T.th;x.beginPath();x.roundRect?x.roundRect(ox,y,tw,thH,[6,6,0,0]):x.rect(ox,y,tw,thH);x.fill();let cx=ox;x.font=fH;x.fillStyle=T.thYazi;
  const hiz=j=>j===1?'left':j<=2?'center':'right';const tx=(j,cx)=>j===1?cx+10:j<=2?cx+cw[j]/2:cx+cw[j]-10;
  bas.forEach((b,j)=>{x.textAlign=hiz(j);x.fillText(b,tx(j,cx),y+thH/2+.5);cx+=cw[j];});y+=thH;
  L.forEach((r,i)=>{x.fillStyle=i%2?T.zebra:'#fff';x.fillRect(ox,y,tw,rowH);cx=ox;veri[i].forEach((v,j)=>{x.textAlign=hiz(j);const neg=j===son&&r.hes.kalan<-0.004;x.fillStyle=j===0?T.not:neg?'#c0392b':'#14202f';x.font=j===1?fA:j===son?fK:fD;x.fillText(String(v),tx(j,cx),y+rowH/2+.5);cx+=cw[j];});
    x.fillStyle=T.cizgi;x.fillRect(ox,y+rowH-1,tw,1);y+=rowH;});
  // toplam satırı
  x.fillStyle=T.th;x.fillRect(ox,y,tw,thH);x.fillStyle=T.thYazi;x.font=fK;const tr=sade?['','TOPLAM','',tl(Tp.kalan)]:['','TOPLAM','',tl(L.reduce((a,q)=>a+(q.hes.pb?0:q.hes.hak)+(q.hes.ekOd||0),0)),tl(Tp.bankaya),t2(L.reduce((a,q)=>a+q.hes.fmTl,0)),t2(L.reduce((a,q)=>a+q.hes.paketPrimi+q.hes.ciroPrimi,0)),tl(Tp.avans),tl(Tp.kalan)];
  cx=ox;tr.forEach((v,j)=>{x.textAlign=hiz(j);x.fillText(v,tx(j,cx),y+thH/2+.5);cx+=cw[j];});
  cx=ox;x.fillStyle=T.cizgi;cw.slice(0,-1).forEach(w=>{cx+=w;x.fillRect(cx,top+thH,1,L.length*rowH);});x.strokeStyle=T.cizgi;x.strokeRect(ox+.5,top+.5,tw-1,thH*2+L.length*rowH-1);
  y+=thH+22;x.textAlign='left';x.fillStyle=T.not;x.font=F(500,10.5);if(Tp.kalan<Tp.nakit-0.004)x.fillText('Ödenecek toplam: kalanı artı olanların toplamı (eksi kalanlar ödenmez, sonraki aya devreder).',ox,y);
  return cv;}
async function odemeDosya(V,L,sade,tur){const cv=await odemeGorseli(V,L,sade);const ad=odBaslik(V);
  if(tur==='png'){const b=await new Promise(r=>cv.toBlob(r,'image/png'));return new File([b],ad+'.png',{type:'image/png'});}
  const J=await jspdfLib();const w=cv.width/2*0.75,h=cv.height/2*0.75;const pdf=new J({orientation:w>h?'l':'p',unit:'pt',format:[w,h]});pdf.addImage(cv.toDataURL('image/png'),'PNG',0,0,w,h);
  pdf.setProperties({title:ad});return new File([pdf.output('blob')],ad+'.pdf',{type:'application/pdf'});}
function odemeCiktisi(V){let tur=tryLS('pm.odTur')||'png';let sade=tryLS('pm.odSade')==='1';const baslik=odBaslik(V);
  const tum=V.satir.slice().sort((a,b)=>String(a.sol.ad).localeCompare(String(b.sol.ad),'tr'));const sec=new Set(tum.map(x=>x.pid));
  openSheet(`<h2>Ödeme listesi paylaş</h2><div class="sub">${esc(baslik)}</div>
   <div class="seg" id="odSade" style="margin-bottom:8px"><button data-v="0" class="${!sade?'on':''}">Ayrıntılı</button><button data-v="1" class="${sade?'on':''}">Sade (ad + ödenecek)</button></div>
   <div class="seg" id="odTur" style="margin-bottom:10px"><button data-v="png" class="${tur==='png'?'on':''}">Fotoğraf</button><button data-v="pdf" class="${tur==='pdf'?'on':''}">PDF</button></div>
   <div class="kpis" id="odTop"></div>
   <div class="actions" style="margin:8px 0 4px"><button class="mini" id="odHepsi">Tümünü seç</button><button class="mini" id="odHicbiri">Tümünü kaldır</button></div>
   <div class="card list" id="odKisi" style="max-height:34vh;overflow:auto">${tum.map(x=>`<label class="kfrow" style="padding:6px 10px"><input type="checkbox" data-od="${esc(x.pid)}" checked> <span style="flex:1"><b>${esc(x.sol.ad)}</b></span><em style="font-style:normal">${tl(x.hes.kalan)}</em></label>`).join('')}</div>
   <img class="share-prev" id="odImg" alt="Ödeme listesi önizleme" style="margin-top:10px">
   <div class="row2"><button class="btn grow" id="odIndir">İndir</button><button class="btn primary grow" id="odPay">WhatsApp / Paylaş</button></div>
   <p class="note">Görmemesi gereken kişilerin işaretini kaldırın; üstteki toplamlar ve görsel sadece seçilenlerden hazırlanır.</p>`,()=>{
   const secili=()=>tum.filter(x=>sec.has(x.pid));let zT;
   const ciz=()=>{const L=secili();const Tp=odToplam(L);byId('odTop').innerHTML=`<div class="kpi"><span>Seçili kişi</span><b>${L.length} / ${tum.length}</b></div><div class="kpi"><span>Hak ediş</span><b>${tl0(Tp.hak)}</b></div><div class="kpi"><span>Bankaya yatan</span><b>${tl0(Tp.bankaya)}</b></div><div class="kpi"><span>Ödenecek toplam</span><b>${tl0(Tp.nakit)}</b></div>`;
     clearTimeout(zT);zT=setTimeout(async()=>{const im=byId('odImg');if(!im)return;if(!L.length){im.removeAttribute('src');return;}const cv=await odemeGorseli(V,L,sade);if(byId('odImg'))byId('odImg').src=cv.toDataURL('image/png');},150);};
   document.querySelectorAll('[data-od]').forEach(c=>c.onchange=()=>{c.checked?sec.add(c.dataset.od):sec.delete(c.dataset.od);ciz();});
   byId('odHepsi').onclick=()=>{tum.forEach(x=>sec.add(x.pid));document.querySelectorAll('[data-od]').forEach(c=>c.checked=true);ciz();};
   byId('odHicbiri').onclick=()=>{sec.clear();document.querySelectorAll('[data-od]').forEach(c=>c.checked=false);ciz();};
   byId('odSade').querySelectorAll('button').forEach(b=>b.onclick=()=>{sade=b.dataset.v==='1';tryLS('pm.odSade',sade?'1':'0');byId('odSade').querySelectorAll('button').forEach(q=>q.classList.toggle('on',q===b));ciz();});
   byId('odTur').querySelectorAll('button').forEach(b=>b.onclick=()=>{tur=b.dataset.v;tryLS('pm.odTur',tur);byId('odTur').querySelectorAll('button').forEach(q=>q.classList.toggle('on',q===b));});
   const indir=f=>{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);};
   const hazir=async()=>{const L=secili();if(!L.length){toast('Kimse seçilmedi.');return null;}try{return await odemeDosya(V,L,sade,tur);}catch(e){console.error(e);toast('Dosya hazırlanamadı.');return null;}};
   byId('odIndir').onclick=async()=>{const f=await hazir();if(f)indir(f);};
   byId('odPay').onclick=async()=>{const f=await hazir();if(!f)return;try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:baslik,text:baslik});return;}}catch(e){if(e&&e.name==='AbortError')return;}
     indir(f);window.open('https://wa.me/?text='+encodeURIComponent(baslik),'_blank');};
   ciz();});}
function muhBaslik(V){return `${trBuyukBas(V.sb.ad)} Şube ${AY[+V.ak.slice(5)-1]} Ayı Puantaj Verisi`;}
const MUH_TEMA={
  klasik:{ad:'Klasik mavi',bant:'#0f6fc6',bantYazi:'#fff',baslik:'#0b3d6e',ayKutu:'#ffd23f',ayYazi:'#3a2a00',th:'#1593e8',thYazi:'#fff',zebra:'#e9f3fd',cizgi:'#cfe0f1',cik:['#fff1a8','#ffd54a'],cikKen:'#e0b21c',not:'#5a6b80'},
  lacivert:{ad:'Lacivert & altın',bant:'#14284b',bantYazi:'#fff',baslik:'#14284b',ayKutu:'#f2b632',ayYazi:'#2a1d00',th:'#1f3a6b',thYazi:'#fff',zebra:'#eef2f8',cizgi:'#d6deea',cik:['#ffe9a3','#ffcd3c'],cikKen:'#d9a514',not:'#5e6b80'},
  dominos:{ad:'Mavi & kırmızı',bant:'#006491',bantYazi:'#fff',baslik:'#00527a',ayKutu:'#e31837',ayYazi:'#fff',th:'#006491',thYazi:'#fff',zebra:'#e8f3f8',cizgi:'#cde3ec',cik:['#fff2a6','#ffd84d'],cikKen:'#e2b51d',not:'#56697a'}};
async function muhasebeGorseli(V,temaK){try{await document.fonts.ready;}catch(e){}const T=MUH_TEMA[temaK||'klasik']||MUH_TEMA.klasik;
  const rows=V.satir.filter(x=>muhasebedeMi(x.sol)).map(x=>x.sol).sort((a,b)=>String(a.ad).localeCompare(String(b.ad),'tr'));
  const tmp=document.createElement('canvas').getContext('2d');const F=(w,s)=>`${w} ${s}px Figtree,system-ui,sans-serif`;const olc=(t,f)=>{tmp.font=f;return tmp.measureText(String(t)).width;};
  const veri=rows.map((r,i)=>[i+1,r.ad.toLocaleUpperCase('tr-TR'),muhGorev(r).toLocaleUpperCase('tr-TR'),(r.muhSekil||r.sekil||'').toLocaleUpperCase('tr-TR'),trTarih(r.giris),trTarih(r.cikis),r.rapor||'',r.ucretsiz||'',r.partGun?fmt(r.partGun):'',r.yillik||'',r.bayram||'',r.gun??'']);
  const bas=['#','ADI SOYADI','GÖREV','ŞEKİL','GİRİŞ','ÇIKIŞ','RAPOR','ÜCR. İZİN','PART GÜN','YILLIK İZİN','BAYRAM','GÜN SAYISI'];
  const fH=F(800,10.5),fA=F(700,12),fD=F(600,11.5);
  const cw=bas.map((b,j)=>Math.ceil(Math.max(olc(b,fH),...veri.map(r=>olc(r[j],j===1?fA:fD)),j===1?150:24)+(j===1?22:16)));
  const pad=28,tw=cw.reduce((a,b)=>a+b,0),W=Math.max(tw+pad*2,560),ox=(W-tw)/2,rowH=26,thH=30,top=104;const H=top+thH+rows.length*rowH+70;
  const cv=document.createElement('canvas');cv.width=W*2;cv.height=H*2;const x=cv.getContext('2d');x.scale(2,2);x.textBaseline='middle';
  x.fillStyle='#fff';x.fillRect(0,0,W,H);
  // üst bant
  x.fillStyle=T.bant;x.fillRect(0,0,W,58);x.fillStyle=T.bantYazi;x.font=F(800,18);x.textAlign='left';x.fillText(`${String(V.sb.ad).toLocaleUpperCase('tr-TR')} ŞUBE`,ox,24);
  x.font=F(500,11.5);x.globalAlpha=.85;x.fillText('Aylık puantaj verisi',ox,43);x.globalAlpha=1;
  const ayT=`${AY[+V.ak.slice(5)-1].toLocaleUpperCase('tr-TR')} ${V.ak.slice(0,4)}`;x.font=F(800,13);const aw=olc(ayT,F(800,13))+28;
  x.fillStyle=T.ayKutu;x.beginPath();x.roundRect?x.roundRect(ox+tw-aw,15,aw,28,6):x.rect(ox+tw-aw,15,aw,28);x.fill();x.fillStyle=T.ayYazi;x.textAlign='center';x.fillText(ayT,ox+tw-aw/2,29.5);
  x.textAlign='left';x.fillStyle=T.not;x.font=F(600,11);x.fillText(`${rows.length} personel`,ox,80);x.textAlign='right';x.fillText(`Hazırlayan: ${S.me.adSoyad||S.me.kullaniciAdi||''} · ${trTarih(ymd(today()))}`,ox+tw,80);
  // başlık satırı
  let y=top;x.fillStyle=T.th;x.beginPath();x.roundRect?x.roundRect(ox,y,tw,thH,[6,6,0,0]):x.rect(ox,y,tw,thH);x.fill();let cx=ox;x.font=fH;x.fillStyle=T.thYazi;
  bas.forEach((b,j)=>{x.textAlign=j===1?'left':'center';x.fillText(b,j===1?cx+10:cx+cw[j]/2,y+thH/2+.5);cx+=cw[j];});y+=thH;
  rows.forEach((r,i)=>{const cik=r.cikis&&r.cikis<=ayKaydir(V.ak,1)+'-00';
    if(cik){const g=x.createLinearGradient(0,y,0,y+rowH);g.addColorStop(0,T.cik[0]);g.addColorStop(1,T.cik[1]);x.fillStyle=g;}else x.fillStyle=i%2?T.zebra:'#fff';x.fillRect(ox,y,tw,rowH);
    cx=ox;veri[i].forEach((v,j)=>{x.textAlign=j===1?'left':'center';x.fillStyle=j===0?T.not:'#14202f';x.font=j===1?fA:j===11?F(800,12.5):fD;x.fillText(String(v),j===1?cx+10:cx+cw[j]/2,y+rowH/2+.5);cx+=cw[j];});
    x.fillStyle=cik?T.cikKen:T.cizgi;x.fillRect(ox,y+rowH-1,tw,1);y+=rowH;});
  // dikey ince çizgiler
  cx=ox;x.fillStyle=T.cizgi;cw.slice(0,-1).forEach(w=>{cx+=w;x.fillRect(cx,top+thH,1,rows.length*rowH);});
  x.strokeStyle=T.cizgi;x.strokeRect(ox+.5,top+.5,tw-1,thH+rows.length*rowH-1);
  y+=22;const g2=x.createLinearGradient(0,y-6,0,y+6);g2.addColorStop(0,T.cik[0]);g2.addColorStop(1,T.cik[1]);x.fillStyle=g2;x.fillRect(ox,y-6,14,12);x.strokeStyle=T.cikKen;x.strokeRect(ox+.5,y-5.5,13,11);
  x.textAlign='left';x.fillStyle=T.not;x.font=F(600,11);x.fillText('Ay içinde çıkış yapan',ox+20,y);
  const tp=k=>rows.reduce((s,r)=>s+(r[k]||0),0);x.textAlign='right';x.fillText(`Rapor ${tp('rapor')} · Ücretsiz izin ${tp('ucretsiz')} · Yıllık izin ${tp('yillik')} · Bayram ${tp('bayram')} gün`,ox+tw,y);
  x.textAlign='center';x.font=F(500,10);x.fillText(muhBaslik(V),W/2,y+26);
  return cv;}
let jspdfY=null;function jspdfLib(){if(jspdfY)return jspdfY;jspdfY=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=()=>ok(window.jspdf.jsPDF);s.onerror=no;document.head.appendChild(s);});return jspdfY;}
async function muhasebeDosya(V,tur){const cv=await muhasebeGorseli(V);const ad=muhBaslik(V);
  if(tur==='png'){const b=await new Promise(r=>cv.toBlob(r,'image/png'));return new File([b],ad+'.png',{type:'image/png'});}
  const J=await jspdfLib();const w=cv.width/2*0.75,h=cv.height/2*0.75;const pdf=new J({orientation:w>h?'l':'p',unit:'pt',format:[w,h]});pdf.addImage(cv.toDataURL('image/png'),'PNG',0,0,w,h);
  pdf.setProperties({title:muhBaslik(V)});return new File([pdf.output('blob')],ad+'.pdf',{type:'application/pdf'});}
function muhasebeCiktisi(V){let tur=tryLS('pm.muhTur')||'pdf';const baslik=muhBaslik(V);
  openSheet(`<h2>Muhasebe çıktısı</h2><div class="sub">${esc(baslik)}</div>
   <div class="seg" id="mTur" style="margin-bottom:10px"><button data-v="pdf" class="${tur==='pdf'?'on':''}">PDF</button><button data-v="png" class="${tur==='png'?'on':''}">Fotoğraf</button></div>
   <img class="share-prev" id="mImg" alt="Puantaj önizleme">
   <div class="row2"><button class="btn grow" id="mIndir">İndir</button><button class="btn primary grow" id="mPay">WhatsApp / Paylaş</button></div>
   <p class="note yardim">Paylaş'a basınca telefonun paylaşım menüsü açılır, WhatsApp'ı seçin; açıklama "${esc(baslik)}" olarak eklenir. Bilgisayarda dosya indirilir ve WhatsApp açılır, dosyayı sohbete sürükleyin.</p>`,async()=>{
   const cv=await muhasebeGorseli(V);byId('mImg').src=cv.toDataURL('image/png');
   byId('mTur').querySelectorAll('button').forEach(b=>b.onclick=()=>{tur=b.dataset.v;tryLS('pm.muhTur',tur);byId('mTur').querySelectorAll('button').forEach(q=>q.classList.toggle('on',q===b));});
   const indir=f=>{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);};
   byId('mIndir').onclick=async()=>{try{indir(await muhasebeDosya(V,tur));}catch(e){toast('Dosya hazırlanamadı.');}};
   byId('mPay').onclick=async()=>{let f;try{f=await muhasebeDosya(V,tur);}catch(e){toast('Dosya hazırlanamadı.');return;}
     try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:baslik,text:baslik});return;}}catch(e){if(e&&e.name==='AbortError')return;}
     indir(f);window.open('https://wa.me/?text='+encodeURIComponent(baslik),'_blank');};});}

/* ================= Bordro PDF okuma ================= */
let pdfjsYuklendi=null;function pdfjs(){if(pdfjsYuklendi)return pdfjsYuklendi;pdfjsYuklendi=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';ok(window.pdfjsLib);};s.onerror=no;document.head.appendChild(s);});return pdfjsYuklendi;}
async function pdfSatirlari(file){const lib=await pdfjs();const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;const lines=[];
  for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const tc=await page.getTextContent();const rows=[];
    tc.items.forEach(it=>{if(!it.str.trim())return;const y=it.transform[5],x=it.transform[4];let r=rows.find(r=>Math.abs(r.y-y)<2.5);if(!r){r={y,items:[]};rows.push(r);}r.items.push({x,s:it.str});});
    rows.sort((a,b)=>b.y-a.y).forEach(r=>lines.push(r.items.sort((a,b)=>a.x-b.x).map(i=>i.s).join('  ')));}
  return lines;}
// ---- Tekli "Ücret Hesap Pusulası" (tek kişilik bordro) ----
const PARA_RE=/-?\d{1,3}(?:\.\d{3})*,\d{2}/;
// Alanlardan bordro satırı üretir. Net tutar, "Kazanç toplam − Kesintiler toplamı" ile çapraz kontrol edilir; tutmazsa net boş bırakılır (yanlış tutar işlenmesin).
function pusulaKayit(a){const uyari=[];let net=a.net,tc=a.tc||'';
  if(a.ocr){if(tc&&!tcGecerli(tc)){uyari.push('TC okunamadı');tc='';}
    if(a.kazanc!=null&&a.kesinti!=null&&net!=null){if(Math.abs(a.kazanc-a.kesinti-net)>0.02){uyari.push('Net tutar doğrulanamadı, elle girin');net=null;}}
    else if(net!=null)uyari.push('Tutar doğrulanamadı, kontrol edin');}
  if(net==null&&!uyari.length)uyari.push('Net tutar okunamadı');
  const dm=String(a.donem||'').match(/(\d{2})\s*\/\s*(\d{4})/);
  return{ad:String(a.ad||'').replace(/\s+/g,' ').trim(),tc,giris:'',sgkGun:a.ssk==null?null:a.ssk,eksikGun:a.eksik||0,neden:'',net,isyeri:String(a.isyeri||'').replace(/\s+/g,' ').trim(),donemKey:dm?dm[2]+'-'+dm[1]:null,ocr:!!a.ocr,uyari};}
// Yazı katmanı olan pusula PDF'i: sayfa başına bir pusula ("ÜCRET HESAP PUSULASI" başlığıyla ayrılır).
function pusulaCoz(lines){const out={isyeri:null,donem:null,kisiler:[],toplam:null};const metin=lines.join('\n');
  metin.split(/ÜCRET\s+HESAP\s+PUSULASI/i).slice(1).forEach(b=>{const g=(re,i=1)=>{const m=b.match(re);return m?m[i]:null;};
    const para=re=>{const m=b.match(re);return m?sayi(m[1]):null;};
    const ad=g(/Ad\s*Soyad\s*:?\s*([^\n]+?)\s+(?:Bordro|$)/m),net=para(/Net\s*Ödenen\s*:?\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i);if(!ad||net==null)return;
    const ssk=g(/Gün\s*Sayısı\s+(\d+)/),ek=g(/Eksik\s*Gün\s*:?\s*(YOK|\d+)/i);
    const k=pusulaKayit({ad,isyeri:g(/İşyeri\s*:?\s*([^\n]+?)\s+İşyeri\s*No/m),donem:g(/Dönem\s*:?\s*(\d{2}\s*\/\s*\d{4})/),tc:g(/Vatandaş\s*No\s*:?\s*(\d{11})/),ssk:ssk==null?null:+ssk,eksik:ek&&/^\d+$/.test(ek)?+ek:0,net});out.kisiler.push(k);});
  if(out.kisiler.length){out.isyeri=out.kisiler[0].isyeri;const dk=out.kisiler[0].donemKey;out.donem=dk?dk.slice(5)+'/'+dk.slice(0,4):null;}return out;}
// Yazı katmanı olmayan pusula (ör. "Microsoft Print to PDF" ile alınmış, yazılar çizgi olarak çizilmiş): sayfa görüntüye çevrilir, sabit şablondaki kutular tek tek OCR ile okunur.
// Kutular A4 dikey sayfada 909×1286 piksellik (110 dpi) referansa göre [sol, üst, sağ, alt].
const PUSULA_KUTU={ad:[190,66,470,86],isyeri:[190,89,470,107],donem:[190,130,470,150],tc:[610,173,880,193],ssk:[192,308,305,332],eksik:[30,364,200,382],kazanc:[322,683,443,703],kesinti:[322,727,443,746],net:[322,832,443,853]};
let tesseractYuklendi=null;function tesseractLib(){if(tesseractYuklendi)return tesseractYuklendi;tesseractYuklendi=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=()=>ok(window.Tesseract);s.onerror=()=>{tesseractYuklendi=null;no(new Error('OCR kütüphanesi yüklenemedi'));};document.head.appendChild(s);});return tesseractYuklendi;}
let ocrIsci=null;async function ocrWorker(){if(!ocrIsci){const T=await tesseractLib();ocrIsci=await T.createWorker('eng');}return ocrIsci;}
async function pusulaOcr(file,durum){const lib=await pdfjs();const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;const w=await ocrWorker();const out={isyeri:null,donem:null,kisiler:[],toplam:null};
  const oku=async(cv,k,rakam)=>{const[x0,y0,x1,y1]=PUSULA_KUTU[k];const f=cv.width/909;const c=document.createElement('canvas');c.width=Math.round((x1-x0)*f);c.height=Math.round((y1-y0)*f);c.getContext('2d').drawImage(cv,x0*f,y0*f,c.width,c.height,0,0,c.width,c.height);
    await w.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:rakam||''});return((await w.recognize(c)).data.text||'').trim();};
  for(let p=1;p<=pdf.numPages;p++){if(durum)durum(`Görselden okunuyor… sayfa ${p}/${pdf.numPages}`);const page=await pdf.getPage(p);const v0=page.getViewport({scale:1});
    if(Math.abs(v0.width/v0.height-909/1286)>0.03)continue;// beklenen A4 dikey şablon değil
    const vp=page.getViewport({scale:2480/v0.width});const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);await page.render({canvasContext:cx,viewport:vp}).promise;
    const para=async k=>{const m=(await oku(cv,k,'0123456789.,-')).match(PARA_RE);return m?sayi(m[0]):null;};
    const ad=(await oku(cv,'ad')).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ]/g,' ').replace(/\s+/g,' ').trim();if(!ad)continue;
    const net=await para('net'),kazanc=await para('kazanc'),kesinti=await para('kesinti');const ssk=(await oku(cv,'ssk','0123456789')).match(/\d+/);const ek=(await oku(cv,'eksik')).match(/Eksik\s*G\S*\s*:?\s*(\d+)/i);
    out.kisiler.push(pusulaKayit({ad,isyeri:await oku(cv,'isyeri'),donem:await oku(cv,'donem','0123456789/'),tc:((await oku(cv,'tc','0123456789')).match(/\d{11}/)||[''])[0],ssk:ssk?+ssk[0]:null,eksik:ek?+ek[1]:0,net,kazanc,kesinti,ocr:true}));}
  if(out.kisiler.length){out.isyeri=out.kisiler[0].isyeri;const dk=out.kisiler[0].donemKey;out.donem=dk?dk.slice(5)+'/'+dk.slice(0,4):null;}return out;}
// Önce toplu bordro listesi, olmazsa tekli pusula (yazı katmanı varsa metinden, yoksa görselden OCR ile).
async function bordroOku(file,durum){const lines=await pdfSatirlari(file);const r=bordroCoz(lines);if(r.kisiler.length)return r;
  const p=pusulaCoz(lines);if(p.kisiler.length)return p;
  if(lines.join('').replace(/\s/g,'').length<20)return await pusulaOcr(file,durum);
  return r;}
function bordroCoz(lines){const para=/-?\d{1,3}(?:\.\d{3})*,\d{2}/g;const out={isyeri:null,donem:null,kisiler:[],toplam:null};
  lines.forEach((l,i)=>{let m;if(!out.isyeri&&(m=l.match(/İşyeri\s+Adı\s+(.+)/)))out.isyeri=m[1].replace(/\s+/g,' ').trim();if(!out.donem&&(m=l.match(/Ay\s*\/\s*Yıl\s+([A-ZÇĞİÖŞÜ]+)\s*\/\s*(\d{4})/)))out.donem=m[1]+' '+m[2];
    if((m=l.match(/^\s*(\d+)\s+(.+?)\s+(\d{11})\s+(\d{2}\.\d{2}\.\d{4})(.*)$/))){const rest=m[5];const nums=rest.match(para)||[];const g=rest.match(/(\d[\d.]*,\d{2})\s*([GS])\s+(\d+)/);
      const eksik=rest.match(/(\d+)\s+Gün/);const nxt=(lines[i+1]||'').trim();const neden=eksik&&/İzin|Rapor|Devamsız|Diğer/i.test(nxt)?nxt.replace(/\s+/g,' '):'';
      out.kisiler.push({ad:m[2].replace(/\s+/g,' ').trim(),tc:m[3],giris:m[4],sgkGun:g?+g[3]:null,eksikGun:eksik?+eksik[1]:0,neden,net:nums.length?sayi(nums[nums.length-1]):null});}
    if((m=l.match(/Toplamlar:/))){const nums=l.match(para)||[];if(nums.length)out.toplam=sayi(nums[nums.length-1]);}});
  {const m=String(out.donem||'').match(/^(\S+)\s+(\d{4})$/);if(m){const ai=AY.findIndex(a=>a.toLocaleUpperCase('tr-TR')===m[1].toLocaleUpperCase('tr-TR'));if(ai>=0){const dk=m[2]+'-'+String(ai+1).padStart(2,'0');out.kisiler.forEach(k=>{k.donemKey=dk;});}}}
  if(out.kisiler.length&&!out.kisiler[0].donemKey)out.kisiler.forEach(k=>{k.uyari=[...(k.uyari||[]),'Bordronun ayı okunamadı, doğru ay olduğunu kontrol edin'];});
  return out;}
function bordroPanel(V){if(kilitEngel()||kesinEngel())return;const ids=Object.keys(V.sol);let satirlar=[];const okunan=[];
  openSheet(`<h2>Bordro PDF yükle</h2><div class="sub">${esc(V.sb.ad)} · ${ayAdi(V.ak)}. Birden çok şubenin bordrosunu birlikte bırakabilirsiniz; sadece bu puantajdaki kişiler eşleşir, diğerleri atlanır. Net ödenen tutarlar veri girişine "Bankaya yatan" olarak eklenir.</div>
   <label class="drop" id="bDrop"><input id="bF" type="file" accept="application/pdf" multiple hidden><b>PDF'leri buraya sürükleyip bırakın</b><span>ya da tıklayıp seçin (birden fazla seçebilirsiniz)</span></label><div id="bDosya"></div><div id="bOut"></div>`,sh=>{
   const tcMap={...((S.pt.maas&&S.pt.maas.tc)||{})};S.personel.forEach(q=>{if(q.tc&&!tcMap[q.id])tcMap[q.id]=q.tc;});
   const D=byId('bDrop');['dragenter','dragover'].forEach(ev=>D.addEventListener(ev,e=>{e.preventDefault();D.classList.add('on');}));['dragleave','drop'].forEach(ev=>D.addEventListener(ev,e=>{e.preventDefault();D.classList.remove('on');}));
   D.addEventListener('drop',e=>oku([...e.dataTransfer.files]));byId('bF').onchange=e=>oku([...e.target.files]);
   const oku=async files=>{files=files.filter(f=>/pdf$/i.test(f.name)||f.type==='application/pdf');if(!files.length){toast('PDF dosyası seçin.');return;}
     byId('bOut').innerHTML='<p class="note">PDF okunuyor…</p>';
     for(const f of files){let r;try{r=await bordroOku(f,m=>{byId('bOut').innerHTML=`<p class="note">${esc(m)} (ilk seferde birkaç saniye sürebilir)</p>`;});}catch(err){okunan.push({ad:f.name,hata:'okunamadı (taranmış PDF olabilir)'});continue;}
       if(!r.kisiler.length){okunan.push({ad:f.name,hata:'bordro satırı bulunamadı'});continue;}
       const top=r.kisiler.reduce((s,k)=>s+(k.net||0),0);okunan.push({ad:f.name,isyeri:r.isyeri,donem:r.donem,n:r.kisiler.length,toplamOk:r.toplam==null||Math.abs(top-r.toplam)<0.05,toplam:r.toplam,top});
       r.kisiler.forEach(k=>{const uyari=[...(k.uyari||[])];let pid=null,yol=null;
         // Önce TC (kayıtlıysa), sonra isim. Aynı isimde birden fazla kişi varsa ya da isim tutup TC farklıysa elle seçilir.
         if(k.tc){pid=ids.find(id=>tcMap[id]&&tcMap[id]===k.tc)||null;if(pid)yol=isimAnahtar(V.sol[pid].ad)===isimAnahtar(k.ad)?'isim':'tc';}
         if(!pid){const ad=ids.filter(id=>isimAnahtar(V.sol[id].ad)===isimAnahtar(k.ad));
           if(ad.length===1){if(k.tc&&tcMap[ad[0]]&&tcMap[ad[0]]!==k.tc)uyari.push('İsim tuttu ama TC farklı: kişiyi elle seçin');else{pid=ad[0];yol='isim';}}
           else if(ad.length>1)uyari.push('Bu isimde birden fazla kişi var: elle seçin');}if(k.donemKey&&k.donemKey!==V.ak){uyari.push(`Dönem ${k.donemKey.slice(5)}/${k.donemKey.slice(0,4)}, bu ay değil: atlanır`);pid=null;yol=null;}
         satirlar.push({...k,uyari,isyeri:k.isyeri||r.isyeri||f.name,pid,yol,netYazi:k.net});});}
     ciz();};
   const ciz=()=>{// aynı kişi iki kez eşleşirse (aynı PDF iki kez bırakıldıysa vb.) ilki geçerli
     const gor={};satirlar.forEach(k=>{k.tekrar=false;if(!k.pid)return;if(gor[k.pid])k.tekrar=true;else gor[k.pid]=1;});
     byId('bDosya').innerHTML=okunan.map(o=>`<div class="tags" style="margin:6px 0 0"><span class="tag">${esc(o.ad)}</span>${o.hata?`<span class="tag warn">${esc(o.hata)}</span>`:`<span class="tag">${esc(o.isyeri||'')}</span><span class="tag">${esc(o.donem||'')}</span><span class="tag ${o.toplamOk?'':'warn'}">${o.n} kişi · ${tl(o.top)} ₺ ${o.toplamOk?'✓':'⚠ PDF toplamı '+tl(o.toplam)}</span>`}</div>`).join('');
     const baskaAy=k=>!!(k.donemKey&&k.donemKey!==V.ak);const es=satirlar.filter(k=>k.pid&&!k.tekrar&&!baskaAy(k)),yok=satirlar.filter(k=>!k.pid||baskaAy(k));
     const satir=(k)=>{const j=satirlar.indexOf(k);const sol=k.pid&&V.sol[k.pid];const fark=sol&&k.sgkGun!=null&&sol.gun!==k.sgkGun;const p=k.pid&&S.personel.find(q=>q.id===k.pid);const h=p&&bordroHedef(k.pid,V.ak,V);
       return `<tr class="${!k.pid?'oto':k.tekrar?'hata':''}"><td class="l">${esc(k.ad)}<br><span class="tag">${esc(k.isyeri)}</span>${k.neden?` <span class="tag">${k.eksikGun} gün ${esc(k.neden)}</span>`:''}${k.ocr?' <span class="tag">görselden okundu</span>':''}${(k.uyari||[]).map(u=>` <span class="tag warn">${esc(u)}</span>`).join('')}</td>
         <td class="l"><select data-j="${j}" style="max-width:170px"><option value="">— bu şubede yok —</option>${ids.map(id=>`<option value="${esc(id)}" ${id===k.pid?'selected':''}>${esc(V.sol[id].ad)}</option>`).join('')}</select>
         ${k.yol==='tc'?'<br><span class="tag warn">İsim tutmadı, TC ile eşleşti</span>':''}${k.tekrar?'<br><span class="tag warn">Bu kişi başka satırda zaten var, atlanır</span>':''}${h&&h!==S.subeId?`<br><span class="tag">${paketBasiMi(k.pid)?'en çok çalıştığı şube':'maaşı'} ${esc(subeAdi(h))} → oraya işlenir</span>`:''}</td>
         <td>${k.sgkGun??''}</td><td>${sol?sol.gun:''}${fark?' <span class="tag warn">gün farkı</span>':''}</td>
         <td class="bi"><input data-n="${j}" value="${esc(k.netYazi==null?'':fmt(k.netYazi))}" inputmode="decimal" style="width:110px;text-align:right;font-weight:700" title="Okunan tutar yanlışsa düzeltin"></td></tr>`;};
     byId('bOut').innerHTML=satirlar.length?`<p class="note" style="margin:8px 0 4px"><b>${es.length} kişi eşleşti</b>${yok.length?` · ${yok.length} kişi bu şubede yok (atlanır)`:''}. Tutar yanlış okunduysa kutudan düzeltin.</p>
       <div class="tbl-wrap" style="max-height:48vh;overflow:auto"><table class="pt vt"><thead><tr><th class="l">Bordrodaki isim</th><th class="l">Personel</th><th>SGK gün</th><th>Puantaj gün</th><th>Net ödenen</th></tr></thead><tbody>${[...es,...satirlar.filter(k=>k.pid&&k.tekrar),...yok].map(satir).join('')}</tbody></table></div>
       <div class="row2"><button class="btn grow" id="bEk">+ PDF ekle</button><button class="btn primary grow" id="bOk" ${es.length?'':'disabled'}>${es.length} kişinin bankaya yatanını işle</button></div>`:'';
     const be=byId('bEk');if(be)be.onclick=()=>byId('bF').click();
     byId('bOut').querySelectorAll('select[data-j]').forEach(s=>s.onchange=()=>{const k=satirlar[+s.dataset.j];k.pid=s.value||null;k.yol=s.value?'elle':null;ciz();});
     byId('bOut').querySelectorAll('input[data-n]').forEach(i=>i.onchange=()=>{const bos=i.value.trim()==='';satirlar[+i.dataset.n].netYazi=bos?null:sayi(i.value);i.value=bos?'':fmt(sayi(i.value));});
     const ok=byId('bOk');if(ok)ok.onclick=()=>{const tutarli=es.filter(k=>k.netYazi!=null);if(tutarli.length<es.length)toast(`${es.length-tutarli.length} kişinin net tutarı boş, atlandı.`);isle(tutarli);};};
   const isle=async es=>{const sid0=S.subeId,ak=V.ak;if(sid0!==S.pt.sube||ak!==S.ay){toast('Ekran değişti, bordroyu yeniden yükleyin.');return;}if(await kilitliMi(ptK(sid0,ak)))return;const deg={},tcYeni={};es.forEach(k=>{deg[k.pid]={bankaya:sayi(k.netYazi),kaynak:k.isyeri};if(!tcMap[k.pid]&&k.tc)tcYeni[k.pid]=k.tc;});
      const n=Object.keys(deg).length;if(!n){toast('Eşleşen personel yok.');return;}
      try{if(Object.keys(tcYeni).length)setDoc(doc(db,'maaslar',sid0),{tc:tcYeni},{merge:true}).catch(yazmaHatasi);
        const sonGun=ymd(new Date(+ak.slice(0,4),+ak.slice(5),0));const kim=S.me.adSoyad||S.me.kullaniciAdi||'';const z=new Date().toISOString();
        const hedefOf=pid=>bordroHedef(pid,ak,V)||sid0;const satirOf=pid=>({id:Math.random().toString(36).slice(2,10),sira:yeniSira(),tarih:sonGun,ad:adBuyuk(V.sol[pid].ad),pid,tur:'BY',miktar:deg[pid].bankaya,aciklama:`Bordro PDF (${deg[pid].kaynak||V.sb.ad})`,kaynak:'bordro',kim,zaman:z});
        const burada=Object.keys(deg).filter(pid=>hedefOf(pid)===sid0),disari={};Object.keys(deg).forEach(pid=>{const h=hedefOf(pid);if(h!==sid0)(disari[h]=disari[h]||[]).push(pid);});
        // Aynı kişinin önceki bordro satırı yenisiyle değişir; diğer satırlara dokunulmaz.
        const mevcut=((sid0===S.pt.sube&&ak===S.ay&&S.pt.doc)?S.pt.doc.veri:V.D.veri)||[];const silB=mevcut.filter(v=>v.kaynak==='bordro'&&burada.includes(v.pid)).map(v=>v.id);const yeniS=burada.map(satirOf);
        const yeni=[...mevcut.filter(v=>!silB.includes(v.id)),...yeniS];
        const degS={};Object.keys(deg).forEach(pid=>degS[pid]={bankaya:''});
        if(sid0===S.pt.sube&&ak===S.ay)S.pt.doc={...(S.pt.doc||{}),veri:yeni};const V2={...V,D:{...V.D,veri:yeni}};const sag=sagSonuclu(V2,degS);
        veriYaz(sid0,ak,{deg:Object.fromEntries(yeniS.map(r=>[r.id,r])),sil:silB},{...(V.kilitli?{}:{sube:sid0,ay:ak}),sag:sagYama(sag,Object.keys(deg))},{kilitsiz:true});
        const giden=[],yetkiYok=[];for(const[h,L] of Object.entries(disari)){if(!(isIsveren()||(S.me.subeler||[]).includes(h))){yetkiYok.push(subeAdi(h)+': '+L.map(pid=>adBuyuk(V.sol[pid].ad)).join(', '));continue;}
          const s0=await getDoc(doc(db,'puantaj',h,'aylar',ak));const d0=s0.exists()?s0.data():{};const silH=veriListesi(d0).filter(v=>v.kaynak==='bordro'&&L.includes(v.pid)).map(v=>v.id);const yeniH=L.map(satirOf);
          veriYaz(h,ak,{deg:Object.fromEntries(yeniH.map(r=>[r.id,r])),sil:silH},d0.kilitli?{}:{sube:h,ay:ak},{kilitsiz:true});giden.push(`${L.length} kişi → ${subeAdi(h)}`);}
        closeSheet();toast(`${burada.length} kişi bu şubeye işlendi${giden.length?', '+giden.join(', '):''}.`);render();
        if(yetkiYok.length)openSheet(`<h2>Bazı tutarlar işlenemedi</h2><div class="sub">Bu kişilerin maaşı yetkiniz olmayan şubede ödeniyor. Tutarları o şubenin bölge müdürü veri girişine "Bankaya yatan" olarak girmeli.</div><div class="card" style="padding:12px">${yetkiYok.map(esc).join('<br>')}</div><div class="row2"><button class="btn primary grow" onclick="document.getElementById('sheetRoot').innerHTML=''">Tamam</button></div>`);}
      catch(e){yazmaHatasi(e);}};});}

/* ================= Paylaş (görsel) ================= */
async function cizelgeGorseli(withFm,gruplar){const wid=S.hafta;const sb=haftaAyari(wid);const ds=weekDays(wid);const ak=gosterAy(wid);const kisiler=cizelgeKisileri(wid).filter(p=>!gruplar||gruplar.includes(p.grup||'K'));
  try{await document.fonts.ready;}catch(e){}
  const C={navy:'#1f3a6b',ink:'#152033',mut:'#667287',line:'#d9dee8',open:'#fbe58a',openI:'#4a3a00',close:'#f0b24d',closeI:'#3c2500',code:'#e9edf3',codeI:'#33415a',bg:'#ffffff',soft:'#f3f5f9'};
  const pad=28,nameW=240,dayW=150,fmW=withFm?96:0,rowH=42,groupH=34,headH=100,dayH=62;const groups=new Set(kisiler.map(p=>p.grup||'K'));
  const W=pad*2+nameW+dayW*7+fmW*2,H=headH+dayH+kisiler.length*rowH+groups.size*groupH+70;const cv=document.createElement('canvas');cv.width=W*2;cv.height=H*2;const x=cv.getContext('2d');x.scale(2,2);
  const F=(w,s,n)=>`${w} ${s}px ${n?'"Barlow Semi Condensed","Arial Narrow",sans-serif':'Figtree,system-ui,sans-serif'}`;
  const rr=(X,Y,w,h,r,fill)=>{x.beginPath();x.roundRect?x.roundRect(X,Y,w,h,r):x.rect(X,Y,w,h);x.fillStyle=fill;x.fill();};
  x.fillStyle=C.bg;x.fillRect(0,0,W,H);x.fillStyle=C.navy;x.fillRect(0,0,W,78);x.fillStyle='#fff';x.textBaseline='middle';x.font=F(800,28);x.fillText(`${sb.ad} · Haftalık çizelge${gruplar&&gruplar.length<3?' · '+gruplar.map(g=>GRUP[g]).join(' + '):''}`,pad,30);
  x.font=F(600,16);x.globalAlpha=.8;x.fillText(`${rangeLabel(wid)}  ·  Açılış ${sb.acilis}  ·  Kapanış ${sb.kapanis}`,pad,58);x.globalAlpha=1;let y=headH;x.textAlign='center';
  ds.forEach((d,i)=>{const X=pad+nameW+i*dayW;rr(X+3,y,dayW-6,dayH-6,9,C.soft);x.fillStyle=C.ink;x.font=F(800,18);x.fillText(GUNU[i].toLocaleUpperCase('tr-TR'),X+dayW/2,y+19);x.fillStyle=C.navy;x.font=F(700,15.5);x.fillText(`${d.getDate()} ${AY[d.getMonth()]}`,X+dayW/2,y+41);});
  const FMR=[{bg:'#dbeafe',yazi:'#1e3a8a',alt:'#3b5b9a',hb:'#c7dcfb'},{bg:'#1f3a6b',yazi:'#ffffff',alt:'#c9d6ee',hb:'#16305c'}];
  if(withFm)[['Bu hafta','fazla mesai'],[`${AY[+fmAyi(wid,sb).slice(5)-1]}`,'bu haftaya kadar']].forEach(([t,a2],j)=>{const X=pad+nameW+7*dayW+j*fmW;const R=FMR[j];rr(X+3,y,fmW-6,dayH-6,9,R.hb);x.fillStyle=R.yazi;x.font=F(800,14.5);x.fillText(t,X+fmW/2,y+20);x.fillStyle=R.alt;x.font=F(600,12);x.fillText(a2,X+fmW/2,y+40);});
  y+=dayH;let son=null;
  kisiler.forEach(p=>{const g=p.grup||'K';if(g!==son){son=g;x.textAlign='left';x.fillStyle=C.navy;x.font=F(800,14);x.fillText(GRUP[g].toLocaleUpperCase('tr-TR'),pad+2,y+groupH/2+2);x.fillStyle=C.line;x.fillRect(pad+90,y+groupH/2+2,W-pad*2-90,1);y+=groupH;}
    x.textAlign='left';x.fillStyle=C.ink;x.font=F(700,16);x.fillText(p.ad.toLocaleUpperCase('tr-TR'),pad+2,y+rowH/2,nameW-10);x.textAlign='center';
    ds.forEach((d,i)=>{const X=pad+nameW+i*dayW+3,Y=y+3,w=dayW-6,hh=rowH-6;const q=gunKaydiP(p,d);if(!q){x.fillStyle=C.mut;x.font=F(600,15);x.fillText('—',X+w/2,Y+hh/2);return;}const v=cellOf(q.id,wid,i);
      if(isShift(v)){const k=shiftKind(v,sb);const[a,b]=v.split('-');const hw=(w-4)/2;rr(X,Y,hw,hh,7,k.o?C.open:C.soft);rr(X+hw+4,Y,hw,hh,7,k.k?C.close:C.soft);x.font=F(700,18,1);x.fillStyle=k.o?C.openI:C.ink;x.fillText(a,X+hw/2,Y+hh/2+1);x.fillStyle=k.k?C.closeI:C.ink;x.fillText(b,X+hw+4+hw/2,Y+hh/2+1);}
      else if(v&&KOD[v]){const kr=KOD_RENK[v]||[C.code,C.codeI];rr(X,Y,w,hh,7,kr[0]);x.fillStyle=kr[1];x.font=F(800,13);x.fillText(KOD[v].ad.toLocaleUpperCase('tr-TR'),X+w/2,Y+hh/2+1);}
      else if(cokSubeli(q)&&digerGunler(q,d)){const s2=Object.keys(digerGunler(q,d))[0];rr(X,Y,w,hh,7,C.soft);x.fillStyle=C.mut;x.font=F(700,13);x.fillText(kisaSubeAd(s2).toLocaleUpperCase('tr-TR'),X+w/2,Y+hh/2+1,w-8);}
      else if(!bosSayilir(q,d))rr(X,Y,w,hh,7,C.soft);
      else{rr(X,Y,w,hh,7,BOS_RENK);x.strokeStyle='#f0b4b4';x.setLineDash([4,4]);x.beginPath();x.roundRect?x.roundRect(X+.5,Y+.5,w-1,hh-1,7):x.rect(X,Y,w,hh);x.stroke();x.setLineDash([]);}});
    if(withFm){const wk=haftaHesapS(p,wid,sb),ay=ayKadarS(p,wid,sb);const vals=isEsnaf(p)||p.sekil==='Part'?[fmt(wk.h)+' sa',fmt(ay.h)+' sa']:[sg(wk.fm),sg(ay.fm)];vals.forEach((t,j)=>{const X=pad+nameW+7*dayW+j*fmW;const R=FMR[j];rr(X+3,y+3,fmW-6,rowH-6,7,R.bg);x.fillStyle=R.yazi;x.font=F(j?800:700,17,1);x.fillText(t,X+fmW/2,y+rowH/2+1);});}
    y+=rowH;});
  x.textAlign='left';x.font=F(600,12.5);let lx=pad;y+=22;[[C.open,'Açılış saati'],[C.close,'Kapanış saati'],...KOD_SIRA.filter(k=>k!=='B').map(k=>[KOD_RENK[k][0],KOD[k].ad])].forEach(([c,t])=>{rr(lx,y-7,14,14,3,c);x.fillStyle=C.mut;x.fillText(t,lx+20,y);lx+=x.measureText(t).width+44;});
  return cv;}
function paylas(){let fm=tryLS('pm.shareFm')!=='0';let tur=tryLS('pm.czTur')||'png';let gr=GRUP_SIRA.slice();const baslikF=()=>`${trBuyukBas(sube().ad)} Şube ${rangeLabel(S.hafta)} Haftalık Çizelge${gr.length<3?' - '+gr.map(g=>GRUP[g]).join(' + '):''}`;let baslik=baslikF();
  openSheet(`<h2>Çizelgeyi paylaş</h2><div class="sub" id="shBaslik">${esc(baslik)}</div>
   <div class="seg" id="shTur" style="margin-bottom:8px"><button data-v="png" class="${tur==='png'?'on':''}">Fotoğraf</button><button data-v="pdf" class="${tur==='pdf'?'on':''}">PDF</button></div>
   <div class="seg" id="shGr" style="margin-bottom:8px">${GRUP_SIRA.map(g=>`<button data-g="${g}" class="on">${GRUP[g]}</button>`).join('')}</div><label class="check"><input type="checkbox" id="shFm" ${fm?'checked':''}> Fazla mesai sütunlarını ekle (hafta ve ay toplamı)</label><img class="share-prev" id="shImg" alt="Çizelge görseli">
   <div class="row2"><button class="btn grow" id="shSave">İndir</button><button class="btn primary grow" id="shShare">WhatsApp / Paylaş</button></div>`,async()=>{let cv=null;
   const yap=async()=>{cv=await cizelgeGorseli(byId('shFm').checked,gr);byId('shImg').src=cv.toDataURL('image/png');};
   byId('shFm').onchange=e=>{tryLS('pm.shareFm',e.target.checked?'1':'0');yap();};
   byId('shGr').querySelectorAll('button').forEach(b=>b.onclick=()=>{const g=b.dataset.g;const n=gr.includes(g)?gr.filter(q=>q!==g):GRUP_SIRA.filter(q=>q===g||gr.includes(q));if(!n.length)return;gr=n;baslik=baslikF();byId('shGr').querySelectorAll('button').forEach(q=>q.classList.toggle('on',gr.includes(q.dataset.g)));byId('shBaslik').textContent=baslik;yap();});
   byId('shTur').querySelectorAll('button').forEach(b=>b.onclick=()=>{tur=b.dataset.v;tryLS('pm.czTur',tur);byId('shTur').querySelectorAll('button').forEach(q=>q.classList.toggle('on',q===b));});
   const dosya=async()=>{if(!cv)await yap();if(tur==='png'){const b=await new Promise(r=>cv.toBlob(r,'image/png'));return new File([b],baslik+'.png',{type:'image/png'});}
     const J=await jspdfLib();const w=cv.width/2*0.75,h=cv.height/2*0.75;const pdf=new J({orientation:w>h?'l':'p',unit:'pt',format:[w,h]});pdf.addImage(cv.toDataURL('image/png'),'PNG',0,0,w,h);pdf.setProperties({title:baslik});return new File([pdf.output('blob')],baslik+'.pdf',{type:'application/pdf'});};
   const indir=f=>{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);};
   byId('shSave').onclick=async()=>{try{indir(await dosya());}catch(e){toast('Dosya hazırlanamadı.');}};
   byId('shShare').onclick=async()=>{let f;try{f=await dosya();}catch(e){toast('Dosya hazırlanamadı.');return;}
     try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:baslik,text:baslik});return;}}catch(e){if(e&&e.name==='AbortError')return;}
     indir(f);window.open('https://wa.me/?text='+encodeURIComponent(baslik),'_blank');};
   await yap();});}

/* ================= Yönetim (işveren) ================= */
function renderYonetim(){if(!isIsveren()&&!isBolge())return;const iv=isIsveren();let bolum=S.ynt||'subeler';if(!iv&&bolum==='yedek')bolum='subeler';
  let h=`<div class="seg" style="margin:4px 0 12px" id="ySeg"><button data-v="subeler" class="${bolum==='subeler'?'on':''}">Şubeler</button><button data-v="kullanicilar" class="${bolum==='kullanicilar'?'on':''}">Kullanıcılar</button><button data-v="iscilik" class="${bolum==='iscilik'?'on':''}">İşçilik</button><button data-v="iban" class="${bolum==='iban'?'on':''}">IBAN</button>${iv?`<button data-v="yedek" class="${bolum==='yedek'?'on':''}">Yedek</button>`:''}</div>`;
  if(bolum==='yedek')return renderYedek(h);
  if(bolum==='iscilik')return renderIscilik(h); if(bolum==='iban')return renderIbanBolum(h);
  if(bolum==='subeler'){const hf=S.subeIds.filter(id=>sube(id).fmDonem==='hafta').length;
    h+=`${iv?'<div class="actions"><button class="btn primary grow" id="ySubeEkle">Şube ekle</button></div>':'<p class="note" style="margin:0 0 8px">Şube ayarlarını işveren değiştirir.</p>'}
     ${iv?`<div class="card" style="padding:12px;margin-bottom:10px"><span class="lbl" style="margin-top:0">Tüm şubelerde fazla mesai dönemi</span><div class="seg" id="yDon"><button data-v="hafta" class="${hf===S.subeIds.length?'on':''}">Haftalık (örn. Eylül: 7 Eyl – 4 Eki)</button><button data-v="ay" class="${hf===0?'on':''}">Takvim ayı</button></div>
     <p class="note" style="margin-bottom:0">Şu an ${hf} / ${S.subeIds.length} şube haftalık. Seçince tüm şubelere uygulanır; tek tek şube ayarından da değiştirilebilir.</p></div>`:''}`;
    h+=S.subeIds.length?`<div class="card list">${S.subeIds.map(id=>{const s=sube(id);return `<button class="row" ${iv?`data-sid="${esc(id)}"`:''}><div class="av">${esc(bas(s.ad))}</div><div class="m"><b>${esc(s.ad)}</b><span>${esc(s.acilis)}–${esc(s.kapanis)} · günlük ${fmt(s.gunluk)} sa · FM ${s.fmYontem==='maas'?'maaş ÷ 30 ÷ 9':tl0(s.fmUcret)+'/sa'}</span></div></button>`;}).join('')}</div>`:`<div class="empty-state"><b>Henüz şube yok</b>İlk şubeyi ekleyin.</div>`;}
  else{h+=`<div class="actions"><button class="btn primary grow" id="yKulEkle">${iv?'Kullanıcı ekle':'Şube müdürü ekle'}</button></div>`;
    // Şifre listesi durumu: kurallar yayınlanmadıysa okunamaz; eski kullanıcıların şifresi kayıtlı değildir.
    if(S.sifreHata)h+=`<div class="banner bad"><b>Şifreler okunamıyor.</b> Firebase kuralları güncel değil: Firestore → Kurallar sekmesine GitHub'daki firestore.rules dosyasını yapıştırıp Yayınla'ya basın, sonra uygulamayı kapatıp açın.</div>`;
    else{const yok=(S.users||[]).filter(u=>!sifreOf(u.uid)&&!(S.sifreIstek||{})[u.uid]).length;if(yok)h+=`<div class="banner">${yok} kullanıcının şifresi kayıtlı değil (şifre kaydı eklenmeden önce açılmışlar). Kullanıcıya dokunup yeni şifre verin; eski şifreyi bilmeniz gerekmez.</div>`;
      const eski=Object.values(S.sifreIstek||{}).filter(x=>!x.hata&&x.t&&Date.now()-new Date(x.t).getTime()>20*60000).length;if(eski)h+=`<div class="banner bad">${eski} şifre isteği 20 dakikadır uygulanmadı. GitHub'daki "Kullanıcı işlemleri" otomasyonu kurulmamış olabilir (FIREBASE_SERVICE_ACCOUNT anahtarı).</div>`;}
    if(!iv&&S.kulHata)h+=`<div class="banner bad">Kullanıcı listesi okunamadı. İşveren Firebase kurallarını güncellemeli (firestore.rules).</div>`;
    if(!iv&&!S.users.length&&!S.kulHata)h+=`<p class="note">Henüz şube müdürü yok ya da işveren listeyi henüz eşlemedi (işveren uygulamayı bir kez açınca kendiliğinden eşlenir).</p>`;
    const us=S.users.slice().sort((a,b)=>['isveren','bolge','sube'].indexOf(a.rol)-['isveren','bolge','sube'].indexOf(b.rol)||String(a.adSoyad).localeCompare(String(b.adSoyad),'tr'));
    h+=`<div class="card list">${us.map(u=>`<button class="row" data-uid="${esc(u.uid)}"><div class="av">${esc(bas(u.adSoyad||u.kullaniciAdi))}</div><div class="m"><b>${esc(u.adSoyad||u.kullaniciAdi)}</b><span>${esc(u.kullaniciAdi)} · ${u.rol==='isveren'?'Tüm şubeler':(u.subeler||[]).map(s=>S.subeler[s]?S.subeler[s].ad:s).join(', ')||'Şube atanmamış'}</span></div>
      <span class="chip ${u.aktif===false?'mut':u.rol==='isveren'?'warn':u.rol==='bolge'?'ok':'mut'}">${u.aktif===false?'Pasif':ROL[u.rol]||u.rol}</span>${S.sifreHata||sifreOf(u.uid)?'':(S.sifreIstek||{})[u.uid]?'<span class="chip warn" title="Yeni şifre bekliyor">şifre bekliyor</span>':'<span class="chip mut" title="Şifre kayıtlı değil">şifre ?</span>'}</button>`).join('')}</div>`;}
  view(h,()=>{document.querySelectorAll('#ySeg button').forEach(b=>b.onclick=()=>{S.ynt=b.dataset.v;render();});
    document.querySelectorAll('#yDon button').forEach(b=>b.onclick=async()=>{const v=b.dataset.v;const bt=writeBatch(db);S.subeIds.forEach(id=>bt.set(doc(db,'subeler',id),{fmDonem:v,...ayarGecmisYama(id,{fmDonem:v})},{merge:true}));try{await bt.commit();toast(`Tüm şubelerde fazla mesai dönemi: ${v==='hafta'?'haftalık':'takvim ayı'}.`);}catch(e){yazmaHatasi(e);}});
    const se=byId('ySubeEkle');if(se)se.onclick=()=>subePanel(null);document.querySelectorAll('[data-sid]').forEach(b=>b.onclick=()=>subePanel(b.dataset.sid));
    const ke=byId('yKulEkle');if(ke)ke.onclick=()=>kullaniciPanel(null);document.querySelectorAll('[data-uid]').forEach(b=>b.onclick=()=>kullaniciPanel(b.dataset.uid));});}
// Şube silme (işveren): sadece hiç verisi olmayan şube silinir. Personeli, haftası ya da puantajı olan şube silinirse geçmiş kayıtlar sahipsiz kalır; bu yüzden engellenir.
// Şubeyi bütün verisiyle siler (sadece işveren): çizelge haftaları, ay durumları, puantaj (ödemeler, veri girişi), maaşlar, çalıştığı şube bu şube olan personel,
// şubeler arası ay özetleri (kurallar silmeye izin vermediği için boşaltılır), işçilik kayıtları. Diğer şubelerdeki personelden bu şubeye bağlar kaldırılır. Geri alınamaz.
async function subeSil(id,btn,W){
  if(!isIsveren())return;const ad=subeAdi(id);
  const pSil=S.personel.filter(p=>p.anaSube===id);const pBag=S.personel.filter(p=>p.anaSube!==id&&(p.sgkSube===id||(p.ekSubeler||[]).includes(id)||(p.gorunurSubeler||[]).includes(id)||Object.values(p.maasSubeGecmis||{}).includes(id)));
  if(!btn.dataset.ok){btn.dataset.ok='1';btn.textContent='Evet, her şeyiyle sil';
    W.innerHTML=`<div class="confirm bad"><b>${esc(ad)} şubesi bütün verisiyle silinecek. Geri alınamaz.</b><br>Silinecekler: çizelgeler ve mesailer, hafta kapatmaları, ay onayları, puantaj (ödemeler, veri girişi), net maaşlar, şubenin işçilik rakamları ve ${pSil.length} personel (çalıştığı şube ${esc(ad)} olanlar)${pBag.length?`. Diğer şubelerdeki ${pBag.length} kişiden bu şubeye bağ (SGK şubesi, diğer çalıştığı şube, maaş şubesi) kaldırılır`:''}. Önce Yönetim → Yedek'ten yedek almanız önerilir.</div>
      <label class="field"><span>Onaylamak için şube adını yazın: ${esc(ad)}</span><input id="sSilAd" autocomplete="off"></label>`;return;}
  const yazilan=(byId('sSilAd')||{}).value||'';if(isimAnahtar(yazilan)!==isimAnahtar(ad)){const e=byId('sSilAd');if(e)e.focus();toast('Şube adını aynen yazın.');return;}
  btn.disabled=true;const geri=m=>{btn.disabled=false;btn.dataset.ok='';btn.textContent='Şubeyi sil';W.innerHTML=`<div class="confirm bad">${m}</div>`;};
  const paket=async ops=>{for(let i=0;i<ops.length;i+=400){const bb=writeBatch(db);ops.slice(i,i+400).forEach(f=>f(bb));await bb.commit();}};
  try{btn.textContent='Siliniyor…';
    // 1) Ay durumları önce (kesin kapanmış aya değen hafta, ay silinmeden silinemez), sonra haftalar, durum, puantaj.
    const ay=await getDocs(collection(db,'subeler',id,'aylar'));await paket(ay.docs.map(d=>bb=>bb.delete(d.ref)));
    const [hf,du,pt]=await Promise.all([getDocs(collection(db,'subeler',id,'haftalar')),getDocs(collection(db,'subeler',id,'durum')),getDocs(collection(db,'puantaj',id,'aylar'))]);
    await paket([...hf.docs,...du.docs,...pt.docs].map(d=>bb=>bb.delete(d.ref)));
    // 2) Şubeler arası ay özetleri silinemez, boşaltılır. İşçilik kayıtlarından şube çıkarılır.
    const oz=await getDocs(query(collection(db,'ozetler'),where('sube','==',id)));await paket(oz.docs.map(d=>bb=>bb.set(d.ref,{sube:id,ay:(d.data()||{}).ay||'',kisiler:{},veriGun:{},guncellendi:new Date().toISOString()})));
    const isc=await getDocs(collection(db,'iscilik'));await paket(isc.docs.map(d=>bb=>bb.update(d.ref,d.id==='sabit'?{['lojman.'+id]:deleteField()}:{['hesap.'+id]:deleteField(),['subeler.'+id]:deleteField()})));
    // 3) Personel: çalıştığı şube bu şube olanlar silinir; diğerlerinden bu şubeye bağ kaldırılır.
    await paket([...pSil.map(p=>bb=>bb.delete(doc(db,'personel',p.id))),...pBag.map(p=>bb=>{const g={...(p.maasSubeGecmis||{})};Object.keys(g).forEach(k=>{if(g[k]===id)delete g[k];});
      bb.update(doc(db,'personel',p.id),{...(p.sgkSube===id?{sgkSube:''}:{}),ekSubeler:(p.ekSubeler||[]).filter(x=>x!==id),gorunurSubeler:(p.gorunurSubeler||[]).filter(x=>x!==id),maasSubeGecmis:g,maasSubeleri:[...new Set(Object.values(g).filter(Boolean))]});})]);
    // 4) Şube, listesi, maaşlar; kullanıcıların şube ataması.
    const b=writeBatch(db);b.delete(doc(db,'subeler',id));b.delete(doc(db,'ekPersonel',id));b.delete(doc(db,'maaslar',id));
    (S.users||[]).filter(u=>(u.subeler||[]).includes(id)).forEach(u=>b.update(doc(db,'kullanicilar',u.uid),{subeler:u.subeler.filter(x=>x!==id)}));
    await b.commit();S.personel=S.personel.filter(p=>p.anaSube!==id);closeSheet();toast(`${ad} şubesi bütün verisiyle silindi.`);
  }catch(e){console.error(e);geri('Şube silinemedi, bir kısmı silinmiş olabilir. Tekrar Şubeyi sil\'e basarak kalanları silebilirsiniz. ('+esc(e.message||e.code||'')+')');}}
function subePanel(id){const s=id?sube(id):{...VARSAYILAN,ad:''};
  openSheet(`<h2>${id?'Şube ayarları':'Yeni şube'}</h2><div class="sub">Vardiya renkleri ve fazla mesai bu ayarlara göre hesaplanır.${id?` Mesai ve ücret ayarlarındaki değişiklik ${ayAdi(ayKey(today())<BASLANGIC_AY?BASLANGIC_AY:ayKey(today()))} ayından itibaren geçerli olur; önceki aylar eski ayarla kalır.`:''}</div>
   <label class="field"><span>Şube adı</span><input id="sAd" value="${esc(s.ad)}" placeholder="Altınkale"></label>
   <div class="fgrid"><label class="field"><span>Açılış</span><input id="sAc" inputmode="numeric" value="${esc(s.acilis)}"></label><label class="field"><span>Kapanış</span><input id="sKa" inputmode="numeric" value="${esc(s.kapanis)}"></label>${/legends/i.test(s.ad||'')||s.sonSaat?`<label class="field"><span>Saat listesi son saati</span><input id="sSon" inputmode="numeric" placeholder="örn. 02:30" value="${esc(s.sonSaat||'')}"></label>`:''}
   <label class="field"><span>Günlük mesai (sa)</span><input id="sGu" inputmode="decimal" value="${s.gunluk}"></label><div class="note" style="align-self:end;margin:0 0 14px">Haftalık mesai otomatik: günlük × 6</div></div>
   <span class="lbl">Fazla mesai ücreti</span><div class="seg" id="sYon"><button data-v="sabit" class="${s.fmYontem!=='maas'?'on':''}">Sabit saat ücreti</button><button data-v="maas" class="${s.fmYontem==='maas'?'on':''}">Maaşına göre</button></div>
   <p class="note" style="margin:4px 0 0">Sabit: şubedeki herkes aynı saat ücretiyle (örn. 125, 165). Maaşına göre: maaş ÷ 30 ÷ 9, küsurat atılır; kişi ödeme penceresinden tek tek "Elle yaz" ile saat ücretini kendin yazabilirsin.</p>
   <label class="field" id="sUcW"><span>Saat ücreti (₺)</span><input id="sUc" inputmode="decimal" value="${s.fmUcret}"></label>
   <span class="lbl">Fazla mesai dönemi</span><div class="seg" id="sDon"><button data-v="ay" class="${s.fmDonem!=='hafta'?'on':''}">Takvim ayı</button><button data-v="hafta" class="${s.fmDonem==='hafta'?'on':''}">Haftalık</button></div>
   <p class="note" style="margin-top:4px">Haftalık: pazartesisi o ayda olan haftalar sayılır. Örnek Eylül 2026: 7 Eylül – 4 Ekim. Rapor, izin ve bordro günü her iki durumda da takvim ayına göredir.</p><div id="sErr"></div>
   <div class="row2"><button class="btn grow" id="sNo">Vazgeç</button><button class="btn primary grow" id="sOk">Kaydet</button></div>
   ${id?`<div class="row2"><button class="btn grow" id="sX">Excel'den çizelge aktar</button></div>`:''}${id&&isIsveren()?`<div class="row2"><button class="btn danger grow" id="sSil">Şubeyi sil</button></div>`:''}`,sh=>{
   const ss=byId('sSil');if(ss)ss.onclick=()=>subeSil(id,ss,byId('sErr'));
   const sx=byId('sX');if(sx)sx.onclick=()=>{closeSheet();if(S.subeId!==id)selectSube(id);let n=0;const bekle=()=>{if(sunucuHazir(id))excelAktarPanel(id);else if(++n<200)setTimeout(bekle,150);else toast('Şube verileri yüklenemedi, Excel aktarımı açılmadı.');};bekle();};
   const yb=sh.querySelectorAll('#sYon button');const tog=()=>byId('sUcW').hidden=sh.querySelector('#sYon .on').dataset.v==='maas';yb.forEach(b=>b.onclick=()=>{yb.forEach(x=>x.classList.remove('on'));b.classList.add('on');tog();});tog();
   const db_=sh.querySelectorAll('#sDon button');db_.forEach(b=>b.onclick=()=>{db_.forEach(x=>x.classList.remove('on'));b.classList.add('on');});
   byId('sNo').onclick=closeSheet;byId('sOk').onclick=()=>{const ad=byId('sAd').value.trim(),ac=normTime(byId('sAc').value),ka=normTime(byId('sKa').value);
     if(!ad||!ac||!ka){byId('sErr').innerHTML='<div class="confirm">Şube adı, açılış ve kapanış saati gerekli (örn. 11:00 ve 00:30).</div>';return;}
     const gu=sayi(byId('sGu').value);if(!(gu>0&&gu<=16)){byId('sErr').innerHTML='<div class="confirm">Günlük mesai 1–16 saat arasında olmalı (örn. 8,5).</div>';return;}
     const sid=id||slug(ad);if(!id&&S.subeler[sid]){byId('sErr').innerHTML='<div class="confirm">Bu isimde bir şube var.</div>';return;}
     const sonEl=byId('sSon');const sonRaw=sonEl?sonEl.value.trim():(s.sonSaat||'');const son=sonRaw?normTime(sonRaw):'';if(sonRaw&&!son){byId('sErr').innerHTML='<div class="confirm">Saat listesi son saati geçersiz (örn. 02:30) ya da boş bırakın.</div>';return;}
     if(son){let t=tnum(son);const op=tnum(ac);while(t<=op)t+=24;if(t-op>SON_SAAT_AZAMI){byId('sErr').innerHTML=`<div class="confirm">Saat listesi son saati açılıştan en fazla ${SON_SAAT_AZAMI} saat sonra olabilir (örn. 02:30).</div>`;return;}}
     const body={ad,acilis:ac,kapanis:ka,sonSaat:son,gunluk:sayi(byId('sGu').value)||8.5,fmYontem:sh.querySelector('#sYon .on').dataset.v,fmUcret:sayi(byId('sUc').value),fmDonem:sh.querySelector('#sDon .on').dataset.v};
     if(id)Object.assign(body,ayarGecmisYama(id,body));
     sirayla('s'+sid,()=>{arka(setDoc(doc(db,'subeler',sid),body,{merge:true}));});closeSheet();toast(id?'Şube ayarları kaydedildi.':`${ad} şubesi eklendi.`);};});}
/* ================= Excel'den çizelge aktarma (işveren) ================= */
let xlsxYuklendi=null;function xlsxLib(){if(xlsxYuklendi)return xlsxYuklendi;xlsxYuklendi=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>ok(window.XLSX);s.onerror=no;document.head.appendChild(s);});return xlsxYuklendi;}
const XKOD={'HAF. İZİN':'HT','HAF.İZİN':'HT','HAFTALIK İZİN':'HT','HAFTA TATİLİ':'HT','İZİN':'HT','ÜCR. İZİN':'UI','ÜCR.İZİN':'UI','ÜCRETSİZ İZİN':'UI','YILLIK İZİN':'YI','YILLIK':'YI','RAPOR':'R','RAPORLU':'R','BAYRAM':'B','DİĞER':'D'};
function xSerialTarih(v){if(typeof v!=='number'||v<20000)return null;const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function xSaat(v){if(typeof v==='number'){if(v>=1)v=v%1;const m=Math.round(v*1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}if(typeof v==='string')return normTime(v);return null;}
function xTarihMetin(v){if(typeof v==='number')return xSerialTarih(v);if(typeof v!=='string')return'';const m=v.trim().match(/^(\d{1,2})[.,/](\d{1,2})[.,/](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';}
function adBuyuk(s){return String(s||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('tr-TR');}
function xAd(s){return adBuyuk(s);}
function xSekil(s){s=String(s||'').toLocaleUpperCase('tr-TR');return s.includes('PART')?'Part':s.includes('ESNAF')?'Esnaf kurye':'Tam';}
function excelCoz(X,wb){const val=(ws,r,c)=>{const x=ws[X.utils.encode_cell({r,c})];return x?x.v:null;};const sayfalar=[];let liste=null;
  wb.SheetNames.forEach(name=>{const ws=wb.Sheets[name];if(!ws['!ref'])return;const R=X.utils.decode_range(ws['!ref']);const maxR=Math.min(R.e.r,400);
    // Personel listesi sayfası
    for(let r=0;r<=Math.min(maxR,12);r++)for(let c=0;c<=Math.min(R.e.c,20);c++){if(String(val(ws,r,c)||'').trim().toLocaleUpperCase('tr-TR')==='ADI SOYADI'){
      const hdr={};for(let cc=c;cc<=Math.min(R.e.c,c+12);cc++)hdr[String(val(ws,r,cc)||'').trim().toLocaleUpperCase('tr-TR')]=cc;
      if(hdr['GİRİŞ TARİHİ']!=null&&!liste){liste={};for(let rr=r+1;rr<=maxR;rr++){const ad=val(ws,rr,c);if(!ad||typeof ad!=='string')continue;
        const hv=k=>hdr[k]!=null?val(ws,rr,hdr[k]):null;
        liste[isimAnahtar(ad)]={sekil:hdr['ÇALIŞMA ŞEKLİ']!=null?xSekil(val(ws,rr,hdr['ÇALIŞMA ŞEKLİ'])):null,giris:xTarihMetin(val(ws,rr,hdr['GİRİŞ TARİHİ'])),cikis:hdr['ÇIKIŞ TARİHİ']!=null?xTarihMetin(val(ws,rr,hdr['ÇIKIŞ TARİHİ'])):'',
          bilgi:excelBilgi({tel:hv('TELEFON'),eposta:hv('MAİL')??hv('E-POSTA')??hv('MAIL'),iban:hv('IBAN')})};}}}}
    // Çizelge sayfası: A sütununda "N. HAFTA", bir alt satırda C,E,G… tarihler, altında isimler
    const hafta=[];for(let r=0;r<=maxR;r++){const a=String(val(ws,r,0)||'').toLocaleUpperCase('tr-TR');if(!/HAFTA/.test(a))continue;const mon=xSerialTarih(val(ws,r+1,2));if(!mon)continue;
      const kisiler={};for(let rr=r+2;rr<=Math.min(maxR,r+26);rr++){const a2=String(val(ws,rr,0)||'').toLocaleUpperCase('tr-TR');if(/HAFTA/.test(a2))break;const ad=val(ws,rr,1);if(!ad||typeof ad!=='string'||!ad.trim())continue;
        const key=isimAnahtar(ad);const row=kisiler[key]||(kisiler[key]={ad:xAd(ad),gun:{}});
        for(let k=0;k<7;k++){const s=val(ws,rr,2+2*k),e=val(ws,rr,3+2*k);let v=null;
          if(typeof s==='string'&&!normTime(s)){v=XKOD[s.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g,' ')]||null;}
          else{const a1=xSaat(s),b1=xSaat(e);if(a1&&b1)v=a1+'-'+b1;}
          if(v==null)continue;if(row.gun[k]&&row.gun[k]!=='D'&&v==='D')continue;row.gun[k]=v;}}
      if(Object.keys(kisiler).length)hafta.push({mon,kisiler});}
    if(hafta.length)sayfalar.push({name,hafta,ilk:hafta[0].mon,son:hafta[hafta.length-1].mon});});
  return{sayfalar,liste};}
function excelAktarPanel(sid){const sb=sube(sid);
  openSheet(`<h2>Excel'den çizelge aktar</h2><div class="sub">${esc(sb.ad)} · Mevcut MESAİ ÇİZELGESİ dosyanızı seçin. Personel listesi sayfası varsa giriş/çıkış tarihleri, telefon, e-posta ve IBAN da alınır.</div>
   <label class="field"><span>Excel dosyası (.xlsx)</span><input id="xF" type="file" accept=".xlsx,.xlsm,.xls"></label><div id="xOut"></div>`,()=>{
   byId('xF').onchange=async e=>{const f=e.target.files[0];if(!f)return;const O=byId('xOut');O.innerHTML='<p class="note">Dosya okunuyor…</p>';let X,P;
     try{X=await xlsxLib();P=excelCoz(X,X.read(await f.arrayBuffer(),{type:'array'}));}catch(err){O.innerHTML='<div class="confirm bad">Dosya okunamadı.</div>';return;}
     if(!P.sayfalar.length){O.innerHTML='<div class="confirm bad">Bu dosyada çizelge sayfası bulunamadı.</div>';return;}
     const sirali=P.sayfalar.slice().sort((a,b)=>a.ilk.localeCompare(b.ilk));const son2=sirali.slice(-2).map(s=>s.name);
     O.innerHTML=`<span class="lbl">Aktarılacak aylar (sayfalar)</span><div class="card list">${sirali.map(s=>`<label class="row"><input type="checkbox" value="${esc(s.name)}" ${son2.includes(s.name)?'checked':''} style="width:20px;height:20px"><div class="m"><b>${esc(s.name)}</b><span>${trTarih(s.ilk)} – ${trTarih(ymd(addDays(parse(s.son),6)))} · ${s.hafta.length} hafta</span></div></label>`).join('')}</div>
      <div class="row2"><button class="btn primary grow" id="xOn">Devam</button></div><div id="xOn2"></div>`;
     byId('xOn').onclick=()=>{const sec=[...O.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);if(!sec.length){toast('En az bir sayfa seçin.');return;}
       const haftalar={};sirali.filter(s=>sec.includes(s.name)).forEach(s=>s.hafta.forEach(h=>{const w=haftalar[h.mon]||(haftalar[h.mon]={});Object.entries(h.kisiler).forEach(([k,v])=>{w[k]={ad:v.ad,gun:{...((w[k]||{}).gun||{}),...v.gun}};});}));
       const kisi={};Object.values(haftalar).forEach(w=>Object.entries(w).forEach(([k,v])=>{if(!kisi[k])kisi[k]={ad:v.ad,vardiya:0};kisi[k].vardiya+=Object.keys(v.gun).length;}));
       const mevcut={};subePersoneli(sid).forEach(p=>mevcut[isimAnahtar(p.ad)]=p);
       const keys=Object.keys(kisi).sort((a,b)=>kisi[a].ad.localeCompare(kisi[b].ad,'tr'));
       byId('xOn2').innerHTML=`<span class="lbl">Personel · ${keys.length} kişi</span><p class="note" style="margin:0 0 8px">Yeni kişilerin görevini ve SGK şubesini seçin. Mevcut personel aynen kalır.</p>
        <div class="tbl-wrap"><table class="pt"><thead><tr><th class="l">İsim</th><th>Durum</th><th>Görev</th><th>SGK şubesi</th><th>Giriş</th><th>Çıkış</th></tr></thead><tbody>${keys.map(k=>{const m=mevcut[k],l=(P.liste||{})[k]||{};
          return `<tr><td class="l"><b>${esc(kisi[k].ad)}</b><br><span class="tag">${kisi[k].vardiya} gün</span>${l.sekil&&!m?` <span class="tag">${esc(l.sekil)}</span>`:''}</td><td>${m?'<span class="chip ok">Mevcut</span>':'<span class="chip warn">Yeni</span>'}</td>
          <td>${m?esc(gorevTahmin(m)):`<select data-k="${esc(k)}" data-t="g"><option value="">Seçin</option>${GOREVLER.map(g=>`<option value="${esc(g.ad)}" ${(l.sekil==='Esnaf kurye'&&g.ad==='Esnaf Kurye')?'selected':''}>${esc(g.ad)}</option>`).join('')}</select>`}</td>
          <td>${m?esc(m.sgkSube===SGK_YOK?'Boş':m.sgkSube?subeAdi(m.sgkSube):'—'):`<select data-k="${esc(k)}" data-t="s"><option value="${SGK_YOK}">Boş</option>${tumSubeler().map(([id2,ad2])=>`<option value="${esc(id2)}" ${id2===sid?'selected':''}>${esc(ad2)}</option>`).join('')}</select>`}</td><td>${trTarih(m?m.giris:l.giris)}</td><td>${trTarih(m?m.cikis:l.cikis)}</td></tr>`;}).join('')}</tbody></table></div>
        <p class="note">${Object.keys(haftalar).length} hafta aktarılacak. Aynı haftada çizelgede daha önce girilmiş günler Excel'deki değerle değiştirilir.</p>
        <div class="row2"><button class="btn grow" id="xNo">Vazgeç</button><button class="btn primary grow" id="xOk">Aktar</button></div>`;
       byId('xNo').onclick=closeSheet;
       byId('xOk').onclick=async()=>{const eksik=keys.filter(k=>!mevcut[k]&&!gorevBul((byId('xOn2').querySelector(`select[data-t="g"][data-k="${CSS.escape(k)}"]`)||{}).value));
         if(eksik.length){toast(`${eksik.length} kişinin görevi seçilmedi.`);return;}
         const btn=byId('xOk');btn.disabled=true;btn.textContent='Aktarılıyor…';const pidOf={};const ops=[];
         keys.forEach(k=>{const m=mevcut[k];if(m){pidOf[k]=m.id;const lb=((P.liste||{})[k]||{}).bilgi||{};const ek={};Object.entries(lb).forEach(([f,v])=>{if(v&&!m[f])ek[f]=v;});if(Object.keys(ek).length)ops.push([doc(db,'personel',m.id),ek,true]);return;}const l=(P.liste||{})[k]||{};const pid=slug(kisi[k].ad)+'-'+Math.random().toString(36).slice(2,6);pidOf[k]=pid;
           const g=gorevBul(byId('xOn2').querySelector(`select[data-t="g"][data-k="${CSS.escape(k)}"]`).value);const sgkV=byId('xOn2').querySelector(`select[data-t="s"][data-k="${CSS.escape(k)}"]`).value;
           ops.push([doc(db,'personel',pid),{ad:kisi[k].ad,grup:g.grup,gorev:g.ad,sekil:g.sekil||(l.sekil==='Part'?'Part':'Tam'),giris:l.giris||'',cikis:l.cikis||'',sgkSube:sgkV,anaSube:sid,...(l.bilgi||{})},false]);});
         let atla=0;Object.entries(haftalar).forEach(([mon,w])=>{const cells={};Object.entries(w).forEach(([k,v])=>{cells[pidOf[k]]=Object.fromEntries(Object.entries(v.gun).map(([i,x])=>[String(i),x]));});
           // Var olan haftanın listesi korunur (yeni kişiler eklenir), durumu değişmez; kapatılmış / onaylı haftaya yazılmaz.
           const e=S.subeId===sid?S.haftalar[mon]:null;if(e&&e.hd&&e.hd!=='acik'){atla++;return;}const k0=e?(Array.isArray(e.kadro)?e.kadro:Object.keys(e.cells||{})):[];
           ops.push([doc(db,'subeler',sid,'haftalar',mon),{hafta:mon,ay2:ayKey(addDays(parse(mon),6)),kadro:[...k0,...Object.keys(cells).filter(x=>!k0.includes(x))],...(e?{}:{hd:'acik'}),cells},true]);});
         try{for(let i=0;i<ops.length;i+=400){const b=writeBatch(db);ops.slice(i,i+400).forEach(([r,d,m])=>m?b.set(r,d,{merge:true}):b.set(r,d));await b.commit();}
           closeSheet();toast(`${Object.keys(haftalar).length-atla} hafta ve ${keys.length} kişi aktarıldı.${atla?` ${atla} kapatılmış / onaylı hafta atlandı.`:''}`);if(S.subeId!==sid)selectSube(sid);}
         catch(e){btn.disabled=false;btn.textContent='Aktar';yazmaHatasi(e);}};};};});}

/* ================= Yedek (işveren) =================
   Tüm veritabanını tek bir JSON dosyası olarak indirir. Ücretsiz planda otomatik yedek olmadığı için düzenli alınmalı.
   Dosyada maaş, TC ve IBAN bilgileri vardır; güvenli yerde saklanmalı. Eksik yedek yanıltıcı olacağı için bir bölüm okunamazsa yedek iptal edilir. */
function yedekJson(v){if(v&&typeof v.toDate==='function'&&typeof v.toMillis==='function')return{__zaman:v.toDate().toISOString()};
  if(Array.isArray(v))return v.map(yedekJson);if(v&&typeof v==='object'){const o={};Object.entries(v).forEach(([k,x])=>o[k]=yedekJson(x));return o;}return v;}
async function yedekAl(durum){const B={};let n=0;const ekle=(yol,data)=>{B[yol]=yedekJson(data);n++;};
  const kol=async yol=>{const q=await getDocs(collection(db,...yol));q.docs.forEach(d=>ekle([...yol,d.id].join('/'),d.data()));durum(`${n} kayıt okundu…`);return q.docs.map(d=>d.id);};
  const tek=async yol=>{const s=await getDoc(doc(db,...yol));if(s.exists())ekle(yol.join('/'),s.data());};
  for(const k of ['kullanicilar','personel','ekPersonel','gunler','ozetler','iscilik'])await kol([k]);
  for(const d of ['kurulum','subeAdlari','goc','surum'])await tek(['sistem',d]);
  const subeIds=await kol(['subeler']);const tum=[...new Set([...subeIds,...Object.keys(S.subeAdlari||{})])].filter(x=>x&&x!==SGK_YOK);
  for(const s of tum){for(const alt of ['haftalar','durum','aylar','personel'])await kol(['subeler',s,alt]);await kol(['puantaj',s,'aylar']);await tek(['maaslar',s]);}
  return{uygulama:'puantaj-merkezi',yedekSurum:1,tarih:new Date().toISOString(),alan:benAd(),subeSayisi:tum.length,belgeSayisi:n,belgeler:B};}
// Her şubenin haftalarında: kişi silinmişse ya da kişinin o şubeyle bağı yoksa (çalıştığı / SGK / diğer / görünür şubeleri arasında değilse) listelenir.
async function veriKontrolu(){const P=new Map(S.personel.map(p=>[p.id,p]));const out=[];const vg={};const tum=[...new Set([...S.subeIds,...Object.keys(S.subeAdlari||{})])].filter(x=>x&&x!==SGK_YOK);
  for(const sid of tum){const q=await getDocs(collection(db,'subeler',sid,'haftalar'));q.docs.forEach(d=>{const x=d.data()||{};const ids=new Set([...(Array.isArray(x.kadro)?x.kadro:[]),...Object.keys(x.cells||{})]);
    ids.forEach(pid=>{const dolu=Object.values((x.cells||{})[pid]||{}).filter(v=>v).length;const p=P.get(pid);
      if(!p){if(dolu)out.push({sid,wid:d.id,ad:pid,neden:'silinmiş kişi',dolu});return;}if(!kisiSubeleri(p).includes(sid))out.push({sid,wid:d.id,ad:adBuyuk(p.ad),neden:'bu şubeyle bağı yok',dolu});
      // Aynı gün iki şubede vardiya (eski yapıştırma hatasından kalmış olabilir)
      Object.entries((x.cells||{})[pid]||{}).forEach(([i,v])=>{if(!isShift(v))return;const ds=ymd(addDays(parse(d.id),+i));const k=pid+'|'+ds;(vg[k]=vg[k]||[]).push({sid,wid:d.id});});});});}
  const cg={};Object.entries(vg).forEach(([k,L])=>{if(new Set(L.map(x=>x.sid)).size<2)return;const[pid,ds]=k.split('|');const t=parse(ds);const sAd=[...new Set(L.map(x=>subeAdi(x.sid)))].join(', ');
    L.forEach(x=>{const g=x.sid+'|'+x.wid+'|'+pid;(cg[g]=cg[g]||{sid:x.sid,wid:x.wid,pid,gun:[],sAd}).gun.push(`${t.getDate()} ${AYK[t.getMonth()]}`);});});
  Object.values(cg).forEach(c=>{const p=P.get(c.pid);out.push({sid:c.sid,wid:c.wid,ad:p?adBuyuk(p.ad):c.pid,neden:`aynı gün iki şubede vardiya (${c.sAd}): ${c.gun.join(', ')}`});});
  return out.sort((a,b)=>String(a.sid).localeCompare(String(b.sid))||a.wid.localeCompare(b.wid));}
/* ================= İşçilik (sadece işveren): şube başına aylık işçilik maliyeti ve ciroya oranı =================
   Kişi maliyeti = resmi maliyet + elden ödenen + paket primi.
   Resmi maliyet: SGK'lı gün × (asgari brüt × (1 + işveren SGK payı + işsizlik)) ÷ 30. Bankaya yatan net maaş bunun içindedir (1 ya da 5 günlük SGK'lı kurye dahil).
   Elden ödenen: maaş farkı + fazla mesai + ciro primi + ek ödeme − kesinti (avans ve ara ödemeler bunun ödenmiş kısmıdır, ayrıca eklenmez;
   geçen aydan gelen eksi devir bu ayın maliyeti değildir). SGK'sı olmayan / esnaf kuryede bankaya yatan da Resmi sütununa eklenir.
   Paket primi: ödemeler listesindeki tutar, ayrı kalem; bankaya yatan primden düşülmez.
   Maaş, SGK ve fazla mesai kişinin maaşının ödendiği şubeye yazılır. Lojman şube başına elle girilir. Ciro KDV dahil girilir.
   Hesap her şubenin puantajından (onaylı ayda kilitli rakamlar, kesin ayda saklanan rakamlar, açık ayda tahmini) yapılır ve iscilik/{ay} belgesine saklanır. */
const ISC_VARS={aylik:40874.63};// 30 günlük SGK'lı çalışanın aylık işveren maliyeti (bankaya yatan net maaş dahil)
// Eski kayıtlar asgari/SGK/işsizlik ile saklanmış olabilir; onlar eski formülle okunur.
const iscAyar=D=>{const a={...((D&&D.ayar)||{})};if(a.aylik==null&&a.asgari==null)a.aylik=ISC_VARS.aylik;return a;};
const iscGunluk=a=>(a.aylik!=null&&sayi(a.aylik)>0?sayi(a.aylik):sayi(a.asgari)*(1+sayi(a.sgk)/100+sayi(a.issizlik)/100))/30;
const r2=x=>Math.round((x||0)*100)/100;
function iscAyi(){if(S.iscAy)return S.iscAy;const bu=ayKey(today());return today().getDate()<=15?ayKaydir(bu,-1):bu;}
function iscKisi(x,ayar){const sol=x.sol||{},h=x.hes||{};const esnaf=sol.sekil==='Esnaf kurye'||h.esnaf;const maasB=sol.maasBurada!==false;const burada=esnaf||h.pb?true:maasB;// paket başı kurye de esnaf gibi: maliyet paket attığı şubede kalır (SGK günü yine maaş/SGK şubesinde). Esnaf kuryenin maliyeti çalıştığı (verisinin girildiği) şubede kalır, maaş şubesine taşınmaz
  const gun=maasB&&!esnaf&&!sol.sgkYok?sayi(sol.iscGun!=null?sol.iscGun:sol.gun):0;/* SGK şubesi değişen kişide iki kaydın günleri (en çok 30) */const resmi=r2(gun*iscGunluk(ayar));
  // Paket primi ayrı kalemdir (ödemeler listesindeki tutar olduğu gibi); bankaya yatan primden düşülmez, kuryenin sigortası da diğerleri gibi Resmi'ye girer.
  let elden=r2(sayi(h.maasFarki)+sayi(h.fmTl)+sayi(h.ciroPrimi)+sayi(h.ekOd));
  let paket=r2(sayi(h.paketPrimi));
  let banka=burada&&resmi<=0&&!h.pb?r2(sayi(h.bankaya)):0;/* paket başında bankaya yatan paket primini ödemektir, ayrı maliyet değil */
  // Esnaf kurye ayrı bir şirkettir: SGK / maaş yok, her şubede o şubede attığı paketin bedeli (paket sayısı × ücret + girilen paket primi) o şubenin paket primidir.
  if(esnaf){paket=r2(sayi(h.paketHak)+sayi(h.paketPrimi));elden=r2(sayi(h.maasFarki)+sayi(h.bankaya)-sayi(h.paketHak)+sayi(h.fmTl)+sayi(h.ciroPrimi)+sayi(h.ekOd));banka=0;}
  return{pid:x.pid,ad:sol.ad||'',grup:sol.grup||'K',gun,resmi,banka,elden,paket,toplam:r2(resmi+banka+elden+paket),burada};}
const iscBekle=ms=>new Promise(r=>setTimeout(r,ms));
async function iscilikHesapla(ak){if(!isIsveren()||S.iscCalisiyor)return;S.iscCalisiyor=true;const D0=S.iscDoc||{};const ayar=iscAyar(D0);
  const eskiSube=S.subeId,eskiAy=S.ay,eskiAyElle=S.ayElle;const sonuc={},hata=[],tasi=[];const L=S.subeIds.slice();
  try{// Önce her şubenin veri girişindeki rapor / izin / part gün ay özetine yazılır: bir şubede girilen gün diğer şubenin hesabına da girer.
    try{S.iscDurum='Veri girişleri okunuyor';render();const q=await getDocs(query(collection(db,'ozetler'),where('ay','==',ak)));const kay={};q.docs.forEach(d=>{const x=d.data();if(x.sube)kay[x.sube]=x.veriGun||{};});
      for(const sid of L){const s=await getDoc(doc(db,'puantaj',sid,'aylar',ak));const d=s.exists()?s.data():null;const vg=d?veriGunHesap(veriListesi(d),ak,d):{};if(jsSirali(vg)!==jsSirali(kay[sid]||{}))await veriGunYaz(sid,ak,vg);}}
    catch(e){console.error(e);hata.push('veri girişi özetleri');}
    for(let i=0;i<L.length;i++){const sid=L[i];S.iscDurum=`Hesaplanıyor ${i+1} / ${L.length}: ${subeAdi(sid)}`;render();
      S.ay=ak;puantajAc(sid);const t0=Date.now();let hazir=false;
      while(Date.now()-t0<30000){if(S.pt.sube===sid&&S.ay===ak&&S.pt.doc&&S.pt.maas!==null&&S.pt.prev!==null&&S.pt.ozetler!==null&&sunucuHazir(sid)){hazir=true;break;}await iscBekle(150);}
      if(!hazir){hata.push(subeAdi(sid));continue;}
      try{await gunleriYukle(ayKadrosu(ak),[ayKaydir(ak,-1),ak,ayKaydir(ak,1)]);}catch(e){}
      if(S.pt.sube!==sid||S.ay!==ak){hata.push(subeAdi(sid));continue;}
      const V=ptVerisi();const durum=V.kesin?'kesin':V.kilitli?'onayli':'tahmini';const kisi=[];
      V.satir.forEach(x=>{const k=iscKisi(x,ayar);if(!k.toplam&&!k.gun)return;
        if(!k.burada){const p=S.personel.find(q=>q.id===x.pid);const hedef=(x.sol&&x.sol.odemeSid)||(p?odemeSubesi(p,ak):'');if(hedef&&hedef!==sid&&L.includes(hedef)){
          // Paket primi girildiği şubede kalır; fazla mesai ve diğer kalemler maaşın ödendiği şubeye taşınır.
          const paket=k.paket||0;if(paket)kisi.push({...k,resmi:0,banka:0,elden:0,gun:0,paket,toplam:paket,burada:true,ad:k.ad+' · paket'});
          const tk={...k,paket:0,toplam:r2(k.toplam-paket),hedef,kaynak:sid};if(Math.abs(tk.toplam)>0.004||tk.gun)tasi.push(tk);return;}}
        kisi.push(k);});
      sonuc[sid]={durum,kisi,ozetHata:!!S.pt.ozetHata||gunHataVar()};}
    // Başka şubede yapılan fazla mesai: kişinin maaş şubesine
    tasi.forEach(k=>{const h=sonuc[k.hedef];if(!h)return;h.kisi.push({...k,ad:k.ad+' · '+subeAdi(k.kaynak)+' FM',burada:true});});
    const t=new Date().toISOString();const hesap={};
    Object.entries(sonuc).forEach(([sid,x])=>{const top=k=>r2(x.kisi.reduce((a,y)=>a+(y[k]||0),0));const gr={};x.kisi.forEach(y=>{gr[y.grup]=r2((gr[y.grup]||0)+y.toplam);});
      hesap[sid]={fv:2,durum:x.durum,ozetHata:x.ozetHata,resmi:top('resmi'),gunTop:top('gun'),banka:top('banka'),elden:top('elden'),paket:top('paket'),toplam:top('toplam'),kisiSay:x.kisi.filter(y=>!/ (FM|paket)$/.test(y.ad)).length,gruplar:gr,kisi:x.kisi.map(y=>({ad:y.ad,grup:y.grup,gun:y.gun,resmi:y.resmi,banka:y.banka,elden:y.elden,paket:y.paket||0,toplam:y.toplam})),tarih:t};});
    await setDoc(doc(db,'iscilik',ak),{ay:ak,ayar,hesap,hesapTarihi:t,hesaplayan:benAd()},{merge:true});
    toast(hata.length?`Hesaplandı; ${hata.length} şube yüklenemedi: ${hata.join(', ')}. Tekrar deneyin.`:'İşçilik hesaplandı.');}
  catch(e){console.error(e);yazmaHatasi(e);}
  finally{subs.detay.forEach(u=>u());subs.detay=[];S.pt.sube=null;S.pt.doc=null;S.ay=eskiAy;S.ayElle=eskiAyElle;if(eskiSube&&S.subeId!==eskiSube)selectSube(eskiSube);
    S.iscCalisiyor=false;S.iscDurum='';render();}}
function iscDinle(ak){
  // Bölge müdürü: işverenin yazdığı, sadece kendi şubelerini içeren özet belgeyi (iscilikBolge/{ay}__{uid}) okur.
  if(isBolge()){const buid=S.user.uid;if(S.iscKey===ak)return;if(S.iscUnsub)S.iscUnsub();S.iscKey=ak;S.iscDoc=null;S.iscOnce=null;
    S.iscUnsub=onSnapshot(doc(db,'iscilikBolge',ak+'__'+buid),s=>{const d=s.exists()?s.data():{};S.iscDoc=d;S.iscSabit={lojman:d.lojSabit||{}};S.iscHata=false;if(S.tab==='yonetim'&&S.ynt==='iscilik')render();},e=>{console.error(e);S.iscDoc={};S.iscHata=true;render();});
    getDoc(doc(db,'iscilikBolge',ayKaydir(ak,-1)+'__'+buid)).then(s=>{if(S.iscKey!==ak)return;S.iscOnce=s.exists()?s.data():{};render();}).catch(()=>{S.iscOnce={};});return;}
  // Her ay aynı lojman tutarları (şube → {ay: tutar}); ayrı belgede tutulur, aya bağlı değildir.
  if(!S.iscSabitUnsub)S.iscSabitUnsub=onSnapshot(doc(db,'iscilik','sabit'),s=>{S.iscSabit=s.exists()?s.data():{};iscBolgeSenkron();if(S.tab==='yonetim'&&S.ynt==='iscilik')render();},e=>{console.error(e);S.iscSabit={};});
  if(S.iscKey===ak)return;if(S.iscUnsub)S.iscUnsub();S.iscKey=ak;S.iscDoc=null;S.iscOnce=null;
  S.iscUnsub=onSnapshot(doc(db,'iscilik',ak),s=>{S.iscDoc=s.exists()?s.data():{};S.iscHata=false;iscBolgeSenkron();if(S.tab==='yonetim'&&S.ynt==='iscilik')render();},e=>{console.error(e);S.iscDoc={};S.iscHata=true;render();});
  getDoc(doc(db,'iscilik',ayKaydir(ak,-1))).then(s=>{if(S.iscKey!==ak)return;S.iscOnce=s.exists()?s.data():{};iscBolgeSenkron();render();}).catch(()=>{S.iscOnce={};});}
// İşveren: her bölge müdürü için, sadece kendi şubelerinin işçilik özetini ayrı belgeye yazar (değişmediyse yazmaz).
let ibT;function iscBolgeSenkron(){clearTimeout(ibT);ibT=setTimeout(()=>{if(!isIsveren()||!S.iscKey||S.iscDoc==null||S.iscSabit==null)return;const ak=S.iscKey;
  const bm=(S.users||[]).filter(u=>u.rol==='bolge'&&u.aktif!==false);S.iscPub=S.iscPub||{};
  [[ak,S.iscDoc],[ayKaydir(ak,-1),S.iscOnce]].forEach(([ay,D])=>{if(D==null)return;bm.forEach(u=>{const L=(u.subeler||[]).filter(x=>S.subeIds.includes(x));const pick=o=>{const r={};L.forEach(x=>{if(o&&o[x]!=null)r[x]=o[x];});return r;};
    const veri={ay,bm:u.uid,ayar:D.ayar||null,hesapTarihi:D.hesapTarihi||null,hesaplayan:D.hesaplayan||'',subeler:pick(D.subeler),hesap:pick(D.hesap),lojSabit:pick((S.iscSabit||{}).lojman)};
    const id=ay+'__'+u.uid,js=JSON.stringify(veri);if(S.iscPub[id]===js)return;S.iscPub[id]=js;setDoc(doc(db,'iscilikBolge',id),veri).catch(e=>{console.error(e);delete S.iscPub[id];});});});},1500);}
const iscOran=(t,c)=>c>0?t/c*100:null;
const iscYuzde=x=>x==null?'—':'%'+(Math.round(x*10)/10).toLocaleString('tr-TR');
// Lojman: o ay için elle yazılmış tutar varsa o; yoksa "her ay aynı" olarak kaydedilen, o aya kadar geçerli son tutar.
function iscSabitLoj(sid,ak){const m=(((S.iscSabit||{}).lojman)||{})[sid];if(!m||typeof m!=='object')return null;const k=Object.keys(m).filter(x=>x<=ak).sort().pop();return k?sayi(m[k]):null;}
function iscLoj(D,ak,sid){const g=((D&&D.subeler)||{})[sid]||{};if(g.lojman!=null)return sayi(g.lojman);return iscSabitLoj(sid,ak)||0;}
function iscLojSabitMi(D,ak,sid){const g=((D&&D.subeler)||{})[sid]||{};return g.lojman==null&&(iscSabitLoj(sid,ak)||0)>0;}
// SGK bilgisi eksik ya da çelişkili personel (işçilik maliyetini yanlış etkileyebilir).
function sgkSorunlari(ak){const o=[];S.personel.forEach(p=>{if(!aktifAyda(p,ak)||p.sekil==='Esnaf kurye')return;/* esnaf kurye ayrı şirket: SGK uyarısı yok */const n=[];
  if(!p.sgkSube)n.push('SGK şubesi seçilmemiş');
  else if(p.sgkSube===SGK_YOK){if(p.giris||p.cikis&&false)n.push('SGK şubesi "Boş" ama SGK giriş tarihi yazılı');}
  else{if(!p.giris){const d=S.personel.filter(x=>x.id!==p.id&&ayniKisi(x,p)&&x.giris&&sgkVar(x));n.push(d.length?'SGK şubesi var ama giriş boş; aynı kişinin '+d.map(x=>subeAdi(x.sgkSube)+' kaydında SGK girişi '+trTarih(x.giris)+(x.cikis?' – çıkış '+trTarih(x.cikis):'')).join(', ')+' var → bu kayıtta SGK günü sayılmıyor':'SGK şubesi var ama SGK giriş tarihi boş (ay boyu sigortalı sayılır)');}}
  if(p.giris&&p.cikis&&p.cikis<p.giris)n.push('SGK çıkış tarihi girişten önce');
  if(n.length)o.push({ad:p.ad,sorun:n.join(' · '),sube:subeAdi(p.anaSube)});});return o;}
function iscSgkSheet(ak){const L=sgkSorunlari(ak);openSheet(`<h2>SGK bilgisi kontrolü</h2><div class="sub">${ayAdi(ak)} · ${L.length} kişi</div>${L.length?`<div class="tk-wrap"><table class="tk"><thead><tr><th class="l">Kişi</th><th class="l">Şube</th><th class="l">Sorun</th></tr></thead><tbody>${L.map(x=>`<tr><td class="l">${esc(adBuyuk(x.ad))}</td><td class="l">${esc(x.sube)}</td><td class="l">${esc(x.sorun)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note">Sorun bulunmadı.</p>'}<div class="row2"><button class="btn grow" id="sgkK">Kapat</button></div>`,()=>{byId('sgkK').onclick=closeSheet;});}
function renderIscilik(h){const ak=iscAyi();iscDinle(ak);const ae=document.activeElement;
  const D=S.iscDoc;const ayar=iscAyar(D&&D.ayar?D:(S.iscOnce&&S.iscOnce.ayar?S.iscOnce:{}));const gir=(D&&D.subeler)||{};const hes=(D&&D.hesap)||{};const once=S.iscOnce||{};
  h+=`<div class="ptnav" style="justify-content:center"><div class="ptay"><button class="nav-arrow" id="iPrev" aria-label="Önceki ay">‹</button><div class="ttl">${ayAdi(ak)}</div><button class="nav-arrow" id="iNext" aria-label="Sonraki ay">›</button></div></div>`;
  if(S.iscHata)h+=`<div class="banner bad">İşçilik verisi okunamıyor. Firebase kurallarını güncelleyin (firestore.rules).</div>`;
  if(D===null){return view(h+`<div class="empty-state"><b>Yükleniyor</b></div>`,()=>iscBagla(ak));}
  const iv=isIsveren();
  if(iv)h+=`<p class="note" style="margin:0 0 6px">Günlük SGK maliyeti ${tl(iscGunluk(ayar))} ₺ (${tl(iscGunluk(ayar)*30)} ÷ 30) <button class="mini" id="iAyar">⚙ Ayarlar</button></p>`;
  if(iv){const sn=sgkSorunlari(ak).length;if(sn)h+=`<div class="banner bad">${sn} kişinin SGK bilgisi eksik ya da çelişkili. <button class="mini" id="iSgk">Listeyi gör</button></div>`;}
  if(iv)h+=`<div class="actions"><button class="btn primary grow" id="iHes" ${S.iscCalisiyor?'disabled':''}>${S.iscCalisiyor?esc(S.iscDurum||'Hesaplanıyor…'):(D&&D.hesapTarihi?'Yeniden hesapla':'Hesapla')}</button></div>`;
  if(D&&D.hesapTarihi)h+=`<p class="note" style="margin-top:0">Son hesap: ${tarihSaat(D.hesapTarihi)}${D.hesaplayan?' · '+esc(D.hesaplayan):''}. ${iv?'Puantajda değişiklik olduysa yeniden hesaplayın.':'Hesabı işveren yapar.'}</p>`;
  if(Object.values(hes).some(x=>x&&x.fv!==2))h+=`<div class="banner bad">Bu ay eski yöntemle hesaplanmış (paket primi Elden'in içinde, bankaya yatan primden düşülmüş). <b>Yeniden hesapla</b>'ya basın.</div>`;
  const IR=S.subeIds.map(sid=>{const g=gir[sid]||{};const x=hes[sid];const c=sayi(g.ciro),lj=iscLoj(D,ak,sid);const top=x?r2(x.toplam+lj):null;
    const o=top!=null?iscOran(top,c):null;const og=((once.hesap||{})[sid]);const oc=sayi(((once.subeler||{})[sid]||{}).ciro);const oo=og?iscOran(og.toplam+iscLoj(once,ayKaydir(ak,-1),sid),oc):null;return{sid,x,c,lj,top,o,oo};});
  const nv=(f,k)=>r=>r.x?tl0(f(r)):'—';
  const IK=[{k:'sube',ad:'Şube',v:r=>subeAdi(r.sid),l:1},{k:'resmi',ad:'Resmi (SGK + maaş)',v:r=>r.x?tl0(r.x.resmi+r.x.banka):'—',n:r=>r.x?r.x.resmi+r.x.banka:-1},{k:'elden',ad:'Elden',v:r=>r.x?tl0(r.x.elden):'—',n:r=>r.x?r.x.elden:-1},
    {k:'paket',ad:'Paket primi',v:r=>r.x?tl0(sayi(r.x.paket)):'—',n:r=>r.x?sayi(r.x.paket):-1},{k:'top',ad:'Toplam işçilik',v:r=>r.top!=null?tl0(r.top):'—',n:r=>r.top!=null?r.top:-1},{k:'oran',ad:'Oran',v:r=>iscYuzde(r.o),n:r=>r.o==null?-1:r.o}];
  S.iscKfSatir={cols:IK,rows:IR};
  const IV=kfUygula('isc',IK,IR);const fa=kfAktifMi('isc');let tc=0,tl_=0,tt=0,tr_=0,te=0,tp=0;
  IV.forEach(r=>{if(r.top!=null){tc+=r.c;tl_+=r.lj;tt+=r.top;tr_+=r.x.resmi+r.x.banka;te+=r.x.elden;tp+=sayi(r.x.paket);}});
  const satir=IV.map(({sid,x,c,lj,top,o,oo})=>{
    const dz=x?{kesin:'<span class="chip ok">Kesin</span>',onayli:'<span class="chip ok">Onaylı</span>',tahmini:'<span class="chip warn">Tahmini</span>'}[x.durum]||'':'';
    return `<tr><td class="l"><button class="mini" data-isd="${esc(sid)}">${esc(subeAdi(sid))}</button> ${dz}<br><small class="mut">Ciro ${c?tl0(c):'girilmedi'}${lj?' · Lojman '+tl0(lj):''}</small></td>
      <td>${x?tl0(x.resmi+x.banka)+(x.gunTop?` <small>(${x.gunTop} gün)</small>`:''):'—'}</td><td>${x?tl0(x.elden):'—'}</td><td>${x?tl0(sayi(x.paket)):'—'}</td><td><b>${top!=null?tl0(top):'—'}</b></td>
      <td><b>${iscYuzde(o)}</b>${oo!=null?`<br><small class="mut">geçen ay ${iscYuzde(oo)}</small>`:''}</td></tr>`;}).join('');
  if(fa)h+=`<div class="kfbar">Filtre açık · ${IV.length} / ${IR.length} şube gösteriliyor, toplamlar sadece görünenler için <button class="mini" id="kfHepsiI">Filtreleri kaldır</button></div>`;
  h+=`<div class="tk-wrap" style="overflow-x:auto"><table class="tk" id="iscT"><thead><tr>${IK.map(c=>kfBaslik('isc',c,c.l?'l':'')).join('')}</tr></thead><tbody>${satir}</tbody>
    <tfoot><tr><td class="l"><b>${fa?`Filtreli toplam · ${IV.length} / ${IR.length} şube`:'Toplam'}</b><br><small class="mut">Ciro ${tl0(tc)}${tl_?' · Lojman '+tl0(tl_):''}</small></td><td>${tl0(tr_)}</td><td>${tl0(te)}</td><td>${tl0(tp)}</td><td><b>${tl0(tt)}</b></td><td><b>${iscYuzde(iscOran(tt,tc))}</b></td></tr></tfoot></table></div>
    <p class="note yardim">Şube adına dokunun: ciro, lojman ve kişi kişi döküm. Toplam işçilik lojman dahildir. Resmi: SGK günü × günlük resmi maliyet (bankaya yatan dahil). Elden: maaş farkı, fazla mesai, ciro primi, ek ödeme − kesinti. Paket primi ödemeler listesinden gelir. Maaş, SGK ve fazla mesai kişinin maaşının ödendiği şubeye yazılır. "Tahmini": ay henüz onaylanmadı, rakamlar değişebilir.</p>`;
  return view(h,()=>iscBagla(ak));}
function iscBagla(ak){document.querySelectorAll('#ySeg button').forEach(b=>b.onclick=()=>{S.ynt=b.dataset.v;render();});const p=byId('iPrev'),n=byId('iNext');if(p)p.onclick=()=>{S.iscAy=ayKaydir(ak,-1);render();};if(n)n.onclick=()=>{S.iscAy=ayKaydir(ak,1);render();};
  const sg=byId('iSgk');if(sg)sg.onclick=()=>iscSgkSheet(ak);
  const hb=byId('iHes');if(hb)hb.onclick=()=>iscilikHesapla(ak);
  if(S.iscKfSatir)kfBagla('isc',S.iscKfSatir.cols,S.iscKfSatir.rows);const kh=byId('kfHepsiI');if(kh)kh.onclick=()=>{const d=kfDurum('isc');d.f={};d.sort=null;render();};
  const ay=byId('iAyar');if(ay)ay.onclick=()=>{const D=S.iscDoc||{};const a=iscAyar(D&&D.ayar?D:(S.iscOnce&&S.iscOnce.ayar?S.iscOnce:{}));
    openSheet(`<h2>İşçilik ayarı</h2><div class="sub">${ayAdi(ak)}</div><label class="field"><span>30 günlük SGK'lı çalışanın aylık maliyeti (₺)</span><input id="iaM" inputmode="decimal" value="${esc(tl(iscGunluk(a)*30))}"></label>
     <p class="note">Bankaya yatan net maaş dahil toplam işveren maliyeti. Günlük maliyet bunun 30'a bölünmesiyle bulunur.</p><div class="row2"><button class="btn grow" id="iaN">Vazgeç</button><button class="btn primary grow" id="iaK">Kaydet</button></div>`,()=>{
      byId('iaN').onclick=closeSheet;byId('iaK').onclick=async()=>{const m=sayi(byId('iaM').value);if(!(m>0)){toast('Tutarı kontrol edin.');return;}
        try{await setDoc(doc(db,'iscilik',ak),{ay:ak,ayar:{aylik:m}},{merge:true});closeSheet();toast('Kaydedildi. Rakamlara yansıması için yeniden hesaplayın.');}catch(e){yazmaHatasi(e);}};});};
  document.querySelectorAll('[data-isd]').forEach(b=>b.onclick=()=>iscSube(ak,b.dataset.isd));}
// Şube penceresi: ciro ve lojman girişi + kişi kişi döküm.
function iscSube(ak,sid){const D=S.iscDoc||{};const x=(D.hesap||{})[sid];const g=(D.subeler||{})[sid]||{};const c=sayi(g.ciro),lj=iscLoj(D,ak,sid),sab=iscLojSabitMi(D,ak,sid);const top=x?r2(x.toplam+lj):null;
  const L=S.subeIds,sn=L[L.indexOf(sid)+1]||null;let dok='';
  if(x){const grup=k=>x.kisi.filter(y=>y.grup===k);const satir=y=>`<tr><td class="l">${esc(adBuyuk(y.ad))}</td><td>${y.gun||'—'}</td><td>${tl0(y.resmi+y.banka)}${y.gun?` <small>(${y.gun} gün)</small>`:''}</td><td>${tl0(y.elden)}</td><td>${tl0(sayi(y.paket))}</td><td><b>${tl0(y.toplam)}</b></td></tr>`;
    const bolum=GRUP_SIRA.filter(k=>grup(k).length).map(k=>`<tr><td class="l" colspan="5"><b>${GRUP[k]}</b> · ${grup(k).length} kişi</td><td><b>${tl0(x.gruplar[k]||0)}</b></td></tr>`+grup(k).map(satir).join('')).join('');
    dok=`${x.fv!==2?'<div class="banner bad">Bu ay eski yöntemle hesaplanmış. İşçilik ekranında Yeniden hesapla\'ya basın.</div>':''}${x.ozetHata?'<div class="banner bad">Diğer şubelerin özetleri okunamadı; rakamlar eksik olabilir. Yeniden hesaplayın.</div>':''}
   <div class="tk-wrap" style="overflow-x:auto"><table class="tk"><thead><tr><th class="l">Kişi</th><th>SGK gün</th><th>Resmi</th><th>Elden</th><th>Paket primi</th><th>Toplam</th></tr></thead><tbody>${bolum}</tbody>
   <tfoot><tr><td class="l">Lojman</td><td></td><td></td><td></td><td></td><td>${tl0(lj)}</td></tr><tr><td class="l"><b>Toplam işçilik</b></td><td></td><td>${tl0(x.resmi+x.banka)}${x.gunTop?` <small>(${x.gunTop} gün)</small>`:''}</td><td>${tl0(x.elden)}</td><td>${tl0(sayi(x.paket))}</td><td><b>${tl0(top)}</b></td></tr></tfoot></table></div>
   <p class="note">Oran <b>${iscYuzde(iscOran(top,c))}</b>. Resmi: SGK günü × günlük resmi maliyet (bankaya yatan dahil); SGK'sız ve esnaf kuryede bankaya yatan. Elden: maaş farkı, fazla mesai, ciro primi, ek ödeme − kesinti. Paket primi ödemeler listesinden gelir.</p>`;}
  else dok=`<p class="note">Bu ay henüz hesaplanmadı. İşçilik ekranında Hesapla'ya basın.</p>`;
  openSheet(`<h2>${esc(subeAdi(sid))} · İşçilik</h2><div class="sub">${ayAdi(ak)}${x?' · '+(x.durum==='kesin'?'kesin':x.durum==='onayli'?'onaylı':'tahmini')+' · '+x.kisiSay+' kişi':''}</div>
   ${isIsveren()?`   <div class="fgrid"><label class="field"><span>Ciro (KDV dahil, ₺)</span><input id="icC" inputmode="decimal" value="${c?esc(tl(c)):''}" placeholder="0"></label><label class="field"><span>Lojman (₺)</span><input id="icL" inputmode="decimal" value="${lj?esc(tl(lj)):''}" placeholder="Yok"></label></div>
   <label class="check" style="margin:2px 0 8px"><input type="checkbox" id="icS" ${sab?'checked':''}> Lojman her ay aynı (bu aydan itibaren)</label>
   <p class="note" style="margin-top:0">Her ay aynı işaretliyse tutar sonraki aylara da geçer; değişirse yeni tutarı o ay işaretli kaydedin. Lojmanı kaldırmak için işaretli bırakıp boş kaydedin.</p>
   <div class="row2"><button class="btn grow" id="icK">Kaydet</button>${sn?`<button class="btn primary grow" id="icN">Kaydet, sonraki şube ›</button>`:''}</div>`:`<p class="note">Ciro ${c?tl0(c):'girilmedi'} · Lojman ${lj?tl0(lj):'yok'} (işveren girer)</p>`}
   ${dok}<div class="row2"><button class="btn grow" id="iDK">Kapat</button></div>`,()=>{
    byId('iDK').onclick=closeSheet;
    const kaydet=async()=>{const cv=byId('icC').value.trim()?sayi(byId('icC').value):0;const lv=byId('icL').value.trim()?sayi(byId('icL').value):0;const sb=byId('icS').checked;
      if(!(cv>=0)||!(lv>=0)){toast('Geçersiz tutar.');return false;}
      try{const yaz={ciro:cv};
        if(sb){yaz.lojman=deleteField();if(iscLojSabitMi(D,ak,sid)?iscSabitLoj(sid,ak)!==lv:true)await setDoc(doc(db,'iscilik','sabit'),{lojman:{[sid]:{[ak]:lv}}},{merge:true});}
        else yaz.lojman=lv;
        await setDoc(doc(db,'iscilik',ak),{ay:ak,subeler:{[sid]:yaz}},{merge:true});return true;}
      catch(e){yazmaHatasi(e);return false;}};
    const kb=byId('icK');if(kb)kb.onclick=async()=>{if(await kaydet()){toast('Kaydedildi.');closeSheet();}};
    const nb=byId('icN');if(nb)nb.onclick=async()=>{if(await kaydet()){toast('Kaydedildi.');iscSube(ak,sn);}};});}
function ibanBagla(){const ibA=byId('ibanAy');if(ibA)ibA.onchange=()=>{S.ibanAy=ibA.value;render();};const ibK=byId('ibanKop');if(ibK)ibK.onclick=async()=>{toast(await panoyaYaz(ibanMetin(ibanAyi()))?'Liste kopyalandı. WhatsApp\'a yapıştırabilirsiniz.':'Kopyalanamadı.');};const ibX=byId('ibanXls');if(ibX)ibX.onclick=()=>ibanExcel(ibanAyi());}
// Yönetim → IBAN: işverene IBAN listesi (eskiden Personel ekranının üstündeydi).
function renderIbanBolum(h){h+=ibanKutusu();view(h,()=>{document.querySelectorAll('#ySeg button').forEach(b=>b.onclick=()=>{S.ynt=b.dataset.v;render();});ibanBagla();});}
function renderYedek(h){const son=tryLS('pm.sonYedek');const gun=son?Math.floor((Date.now()-Date.parse(son))/86400000):null;
  h+=`<div class="card" style="padding:14px">
    <h3 style="margin:0 0 6px">Veritabanı yedeği</h3>
    <p class="note" style="margin-top:0">Bütün şubelerin çizelgeleri, personel listesi, puantajlar, ödemeler, maaşlar ve kullanıcılar tek dosya olarak bilgisayarınıza iner. Ücretsiz Firebase planında otomatik yedek yok; <b>haftada en az bir kez</b> ve her ay sonu onayından sonra alın.</p>
    ${son?`<div class="banner ${gun>=7?'bad':'ok'}">Bu cihazda son yedek: ${tarihSaat(son)}${gun>=1?` (${gun} gün önce)`:''}${gun>=7?' · Yeni yedek alın.':''}</div>`:`<div class="banner bad">Bu cihazda henüz yedek alınmadı.</div>`}
    <div class="actions"><button class="btn primary grow" id="yedekB">Yedek indir</button></div><div id="yedekD" class="note"></div>
    <p class="note">Dosyada maaş, TC ve IBAN bilgileri var; kimseyle paylaşmayın, bilgisayarda ya da kendi bulut klasörünüzde saklayın. Silinen bir veriyi geri getirmek gerekirse bu dosya kullanılır. Yedek alırken tüm kayıtlar okunduğu için günlük okuma kotasından birkaç bin okuma harcanır.</p></div>`;
  h+=`<div class="card" style="padding:14px;margin-top:12px"><h3 style="margin:0 0 6px">Veri kontrolü</h3><p class="note" style="margin-top:0">Bütün şubelerin haftalarını tarar: o şubeyle ilgisi olmayan kişilere ait hücreleri (ör. eski şube karışması hatasından kalan) ve silinmiş kişilere ait kayıtları listeler. Hiçbir şeyi değiştirmez.</p>
    <div class="actions"><button class="btn grow" id="kontrolB">Kontrol et</button></div><div id="kontrolD"></div></div>`;
  view(h,()=>{document.querySelectorAll('#ySeg button').forEach(b=>b.onclick=()=>{S.ynt=b.dataset.v;render();});
    const kb=byId('kontrolB');kb.onclick=async()=>{kb.disabled=true;kb.textContent='Taranıyor…';const D2=byId('kontrolD');
      try{const L=await veriKontrolu();D2.innerHTML=L.length?`<div class="banner bad">${L.length} sorunlu kayıt bulundu.</div><div class="card list">${L.map(x=>`<button class="row" data-ks="${esc(x.sid)}" data-kw="${esc(x.wid)}"><div class="m"><b>${esc(x.ad)}</b><span>${esc(subeAdi(x.sid))} · ${rangeLabel(x.wid)} · ${esc(x.neden)}${x.dolu?` · ${x.dolu} dolu gün`:''}</span></div><span class="ch">›</span></button>`).join('')}</div><p class="note">Satıra dokununca o haftanın çizelgesi açılır. Yanlış şubeye yazılmış kişiyi isminden "Bu haftadan çıkar" ile çıkarın; saatleri doğru şubede yoksa oraya girin.</p>`:'<div class="banner ok">Sorunlu kayıt bulunmadı.</div>';
        D2.querySelectorAll('[data-ks]').forEach(r=>r.onclick=()=>{S.tab='cizelge';tryLS('pm.tab','cizelge');S.hafta=r.dataset.kw;if(S.subeId!==r.dataset.ks)selectSube(r.dataset.ks);else render();window.scrollTo(0,0);});}
      catch(e){console.error(e);D2.innerHTML=`<div class="banner bad">Kontrol yapılamadı: ${esc(e.code||e.message||'')}</div>`;}kb.disabled=false;kb.textContent='Kontrol et';};
    const b=byId('yedekB'),D=byId('yedekD');b.onclick=async()=>{b.disabled=true;b.textContent='Yedek alınıyor…';
      try{const Y=await yedekAl(m=>{D.textContent=m;});const t=new Date();const ad=`Puantaj-yedek-${ymd(t)}-${String(t.getHours()).padStart(2,'0')}.${String(t.getMinutes()).padStart(2,'0')}.json`;
        const f=new File([JSON.stringify(Y)],ad,{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=ad;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
        tryLS('pm.sonYedek',t.toISOString());toast(`Yedek indirildi: ${Y.belgeSayisi} kayıt, ${Y.subeSayisi} şube.`);render();}
      catch(e){console.error(e);const msj='Yedek alınamadı, hiçbir dosya inmedi: '+((e&&(e.code||e.message))||'bilinmeyen hata')+'. İnternet bağlantısını kontrol edip tekrar deneyin.';D.textContent=msj;b.disabled=false;b.textContent='Yedek indir';toast(msj);}};});}

let ikincil=null;function ikincilAuth(){if(!ikincil)ikincil=getAuth(initializeApp(firebaseConfig,'ikincil'));return ikincil;}
/* ---- Giriş bilgileri (işveren) ----
   Firebase şifreyi geri okunamaz biçimde saklar; işverenin görebilmesi için şifre ayrıca sifreler/{uid} belgesinde tutulur.
   Bu belgeyi sadece işveren okur (kural); yedek dosyasına girmez. Kullanıcı kendi şifresini değiştirince kaydı güncellenir.
   Başka kullanıcının şifresi / kullanıcı adı, kayıtlı şifreyle ikinci (arka plan) oturumda giriş yapılarak değiştirilir; işverenin oturumu kapanmaz. */
const sifreOf=uid=>((S.sifreler||{})[uid]||{}).sifre||'';
function sifreKaydet(uid,k,p){return setDoc(doc(db,'sifreler',uid),{kullaniciAdi:k,sifre:p,guncellendi:new Date().toISOString(),guncelleyen:benAd()});}
async function ikincilCikis(){try{await signOut(ikincilAuth());}catch(e){}}
async function ikincilGiris(k,p){await ikincilCikis();return(await signInWithEmailAndPassword(ikincilAuth(),eposta(k),p)).user;}
function girisHata(e){const c=(e&&e.code)||'';
  if(c==='sifre-yok')return 'Bu kullanıcının şifresi kayıtlı değil. Önce bildiğiniz şifreyi kaydedin ya da yeni şifre yazın.';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Şifre tutmuyor. Kullanıcı şifresini değiştirmiş olabilir; doğru şifreyi yazıp "Şifreyi kaydet" deyin.';
  if(c.includes('email-already-in-use'))return 'Bu kullanıcı adı alınmış.';if(c.includes('weak-password'))return 'Şifre çok zayıf.';
  if(c.includes('too-many-requests'))return 'Çok fazla deneme yapıldı, birkaç dakika sonra tekrar deneyin.';if(c.includes('network'))return 'İnternet bağlantısı yok.';
  if(c.includes('permission'))return 'Yetki hatası. Firebase kurallarının güncel olduğundan emin olun.';return 'İşlem yapılamadı: '+((e&&(e.message||c))||'');}
async function kSifreDegistir(u,yeni){const eski=sifreOf(u.uid);if(!eski)throw{code:'sifre-yok'};const user=await ikincilGiris(u.kullaniciAdi,eski);
  try{await updatePassword(user,yeni);}finally{await ikincilCikis();}await sifreKaydet(u.uid,u.kullaniciAdi,yeni);}
// Şifresi bilinmeyen kullanıcıya yeni şifre: istek yazılır, GitHub'daki "Kullanıcı işlemleri" otomasyonu birkaç dakika içinde uygular.
function kSifreIstek(u,p){return setDoc(doc(db,'sifreIstek',u.uid),{sifre:p,isteyen:S.user.uid,isteyenAd:benAd(),t:new Date().toISOString()});}
// Tek düğme: kayıtlı şifre varsa hemen değiştirir; yoksa yazılan şifre mevcut şifreyse hemen kaydeder; ikisi de olmazsa yeni şifre isteği bırakır.
async function kSifreAyarla(u,p){try{if(sifreOf(u.uid))await kSifreDegistir(u,p);else await kSifreDogrula(u,p);return 'hemen';}
  catch(e){const c=(e&&e.code)||'';if(c==='sifre-yok'||c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found')){await kSifreIstek(u,p);return 'bekliyor';}throw e;}}
// Bilinen şifreyi kaydeder; önce o şifreyle giriş denenir (yanlış şifre kaydedilmez).
async function kSifreDogrula(u,p){await ikincilGiris(u.kullaniciAdi,p);await ikincilCikis();await sifreKaydet(u.uid,u.kullaniciAdi,p);}
// Kullanıcı adı Firebase'de giriş adresidir, olduğu yerde değişmez: yeni adla giriş hesabı açılır, rol / şube / durum taşınır, eski giriş hesabı silinir.
async function kAdDegistir(u,yeniK,yeniP){const eskiP=sifreOf(u.uid);const p=yeniP||eskiP;if(!p)throw{code:'sifre-yok'};const t=new Date().toISOString();
  await ikincilCikis();const cred=await createUserWithEmailAndPassword(ikincilAuth(),eposta(yeniK),p);const nu=cred.user;const nuid=nu.uid;
  try{const{uid:_x,...veri}=u;const b=writeBatch(db);
    b.set(doc(db,'kullanicilar',nuid),{...veri,kullaniciAdi:yeniK,oncekiKullaniciAdi:u.kullaniciAdi,oncekiUid:u.uid,adDegisim:t});b.delete(doc(db,'kullanicilar',u.uid));
    b.set(doc(db,'sifreler',nuid),{kullaniciAdi:yeniK,sifre:p,guncellendi:t,guncelleyen:benAd()});b.delete(doc(db,'sifreler',u.uid));await b.commit();}
  catch(e){try{await deleteUser(nu);}catch(e2){}await ikincilCikis();throw e;}// taşıma olmadıysa yeni giriş hesabı geri silinir
  await ikincilCikis();let eskiSilindi=false;
  if(eskiP){try{await deleteUser(await ikincilGiris(u.kullaniciAdi,eskiP));eskiSilindi=true;}catch(e){}finally{await ikincilCikis();}}return eskiSilindi;}
async function kSil(u){const p=sifreOf(u.uid);const b=writeBatch(db);b.delete(doc(db,'kullanicilar',u.uid));b.delete(doc(db,'sifreler',u.uid));await b.commit();
  let girisSilindi=false;if(p){try{await deleteUser(await ikincilGiris(u.kullaniciAdi,p));girisSilindi=true;}catch(e){}finally{await ikincilCikis();}}return girisSilindi;}
function girisKarti(u,ben){const sf=sifreOf(u.uid);const ist=(S.sifreIstek||{})[u.uid];
  const istH=ist?`<div class="banner${ist.hata?' bad':''}" style="margin:6px 0">${ist.hata?`Yeni şifre uygulanamadı: ${esc(ist.hata)}`:`Yeni şifre verildi (${esc(tarihSaat(ist.t))}). Birkaç dakika içinde geçerli olur ve burada görünür.`} <button class="mini" id="uIstIptal">İptal et</button></div>`:'';
  return `<div class="card" style="padding:12px;margin:10px 0"><span class="lbl" style="margin-top:0">Giriş bilgileri</span>
   <p style="margin:4px 0">Kullanıcı adı: <b class="mono">${esc(u.kullaniciAdi)}</b></p>
   <p style="margin:4px 0">Şifre: ${sf?`<b class="mono" id="uSfG" data-s="${esc(sf)}">••••••</b> <button class="mini" id="uSfGos">Göster</button>`:'<i>kayıtlı değil</i>'}</p>${istH}
   ${ben?'<p class="note" style="margin-bottom:0">Kendi şifrenizi sağ üstteki hesap menüsünden değiştirin; değiştirince burada görünür.</p>':`
   <label class="field"><span>Yeni şifre (en az 6)</span><input id="uYP" type="text" autocomplete="off" autocapitalize="none" autocorrect="off"></label>
   <div class="row2"><button class="btn grow" id="uSfB">${sf?'Şifreyi değiştir':'Şifreyi ayarla'}</button></div>
   ${sf?'':'<p class="note">Eski şifreyi bilmeniz gerekmez. Yeni şifreyi yazıp "Şifreyi ayarla" deyin; birkaç dakika içinde geçerli olur ve burada görünür. Bundan sonra şifreyi her zaman burada görür ve anında değiştirirsiniz.</p>'}
   ${isIsveren()?`<label class="field"><span>Yeni kullanıcı adı</span><input id="uYK" autocapitalize="none" autocorrect="off" placeholder="${esc(u.kullaniciAdi)}"></label>
   <div class="row2"><button class="btn grow" id="uKB">Kullanıcı adını değiştir</button></div>
   <p class="note" style="margin-bottom:0">Değişiklikten sonra kullanıcı yeni bilgilerle giriş yapar; açık oturumu kapanır.</p>`:''}`}<div id="uGErr"></div></div>`;}
function kullaniciPanel(uid){const u=uid?S.users.find(x=>x.uid===uid):{kullaniciAdi:'',adSoyad:'',rol:'sube',subeler:[],aktif:true};if(!u)return;const ben=uid===S.user.uid;
  openSheet(`<h2>${uid?'Kullanıcıyı düzenle':'Yeni kullanıcı'}</h2><div class="sub">${uid?(u.aktif===false?'Pasif · giriş yapamaz':'Aktif'):'Kullanıcı bu ad ve şifreyle giriş yapar.'}</div>
   <label class="field"><span>Ad soyad</span><input id="uAd" value="${esc(u.adSoyad||'')}"></label>
   ${uid?'':`<div class="fgrid"><label class="field"><span>Kullanıcı adı</span><input id="uK" autocapitalize="none" autocorrect="off" placeholder="ornek: ayse.bucak"></label><label class="field"><span>Şifre (en az 6)</span><input id="uP" type="text" autocomplete="new-password"></label></div>`}
   <span class="lbl">Rol</span><div class="seg" id="uRol">${(isIsveren()?['sube','bolge','isveren']:['sube']).map(r=>`<button data-v="${r}" class="${u.rol===r?'on':''}" ${ben?'disabled':''}>${ROL[r]}</button>`).join('')}</div>
   <div id="uSubW"><span class="lbl">Şubeler</span><div class="checks">${S.subeIds.map(id=>`<label class="check" style="margin:0"><input type="checkbox" value="${esc(id)}" ${(u.subeler||[]).includes(id)?'checked':''}> ${esc(S.subeler[id].ad)}</label>`).join('')||'<span class="note">Önce şube ekleyin.</span>'}</div></div>
   <div id="uErr"></div><div class="row2"><button class="btn grow" id="uNo">Vazgeç</button><button class="btn primary grow" id="uOk">${uid?'Kaydet':'Kullanıcıyı oluştur'}</button></div>
   ${uid?girisKarti(u,ben):''}
   ${uid&&!ben?`<div class="row2"><button class="btn grow" id="uPasif">${u.aktif===false?'Aktif et':'Pasife al'}</button><button class="btn danger grow" id="uSil">Kullanıcıyı sil</button></div>
   <p class="note">Pasif kullanıcı giriş yapamaz; istediğiniz zaman yeniden aktif edebilirsiniz. Silinen kullanıcı geri gelmez (geçmiş kayıtlarda adı kalır). Bir süre çalışmayacaksa silmek yerine pasife alın.</p>`:''}`,sh=>{
   const rb=sh.querySelectorAll('#uRol button');const tog=()=>byId('uSubW').hidden=sh.querySelector('#uRol .on').dataset.v==='isveren';rb.forEach(b=>b.onclick=()=>{rb.forEach(x=>x.classList.remove('on'));b.classList.add('on');tog();});tog();
   byId('uNo').onclick=closeSheet;const E=byId('uErr');
   const gos=byId('uSfGos');if(gos)gos.onclick=()=>{const g=byId('uSfG');const ac=gos.textContent==='Göster';g.textContent=ac?g.dataset.s:'••••••';gos.textContent=ac?'Gizle':'Göster';};
   const GE=byId('uGErr');const mesgul=(b,y)=>{sh.querySelectorAll('#uSfB,#uKB,#uPasif,#uSil,#uOk').forEach(x=>x.disabled=!!y);if(b&&y)b.textContent='Bekleyin…';};
   const sfB=byId('uSfB');if(sfB)sfB.onclick=async()=>{const p=byId('uYP').value;if(p.length<6){GE.innerHTML='<div class="confirm">Şifre en az 6 karakter olmalı.</div>';return;}const ad0=sfB.textContent;mesgul(sfB,true);
     try{const r=await kSifreAyarla(u,p);closeSheet();toast(r==='hemen'?`${u.adSoyad||u.kullaniciAdi} için şifre kaydedildi.`:`Yeni şifre verildi; birkaç dakika içinde geçerli olur.`);}
     catch(e){console.error(e);mesgul(null,false);sfB.textContent=ad0;GE.innerHTML=`<div class="confirm bad">${esc(girisHata(e))}</div>`;}};
   const ipt=byId('uIstIptal');if(ipt)ipt.onclick=async()=>{try{await deleteDoc(doc(db,'sifreIstek',u.uid));closeSheet();toast('Şifre isteği iptal edildi.');}catch(e){yazmaHatasi(e);}};
   const kB=byId('uKB');if(kB)kB.onclick=async()=>{const k=kadiNorm(byId('uYK').value);const p=byId('uYP').value;
     if(k.length<3){GE.innerHTML='<div class="confirm">Yeni kullanıcı adı en az 3 karakter olmalı (harf, rakam, nokta).</div>';return;}if(k===u.kullaniciAdi){GE.innerHTML='<div class="confirm">Kullanıcı adı aynı.</div>';return;}
     if(p&&p.length<6){GE.innerHTML='<div class="confirm">Şifre en az 6 karakter olmalı.</div>';return;}if(!p&&!sifreOf(u.uid)){GE.innerHTML=`<div class="confirm">${esc(girisHata({code:'sifre-yok'}))}</div>`;return;}
     if(!kB.dataset.ok){kB.dataset.ok='1';kB.textContent=`Evet, ${k} olarak değiştir`;return;}mesgul(kB,true);
     try{const sil=await kAdDegistir(u,k,p);closeSheet();toast(`Kullanıcı adı ${k} oldu${p?', şifre de değişti':''}.${sil?'':' Eski kullanıcı adı artık giriş yapamaz.'}`);}
     catch(e){console.error(e);mesgul(null,false);kB.dataset.ok='';kB.textContent='Kullanıcı adını değiştir';GE.innerHTML=`<div class="confirm bad">${esc(girisHata(e))}</div>`;}};
   const pB=byId('uPasif');if(pB)pB.onclick=async()=>{const yeni=u.aktif===false;mesgul(pB,true);try{await updateDoc(doc(db,'kullanicilar',u.uid),{aktif:yeni});closeSheet();toast(`${u.adSoyad||u.kullaniciAdi} ${yeni?'aktif edildi':'pasife alındı; giriş yapamaz'}.`);}catch(e){mesgul(null,false);pB.textContent=yeni?'Aktif et':'Pasife al';yazmaHatasi(e);}};
   const sB=byId('uSil');if(sB)sB.onclick=async()=>{if(!sB.dataset.ok){sB.dataset.ok='1';sB.textContent='Evet, kalıcı olarak sil';GE.innerHTML='<div class="confirm bad">Kullanıcı silinir ve giriş yapamaz. Bu geri alınamaz. Sadece geçici olarak durduracaksanız "Pasife al" deyin.</div>';return;}
     mesgul(sB,true);try{await kSil(u);closeSheet();toast(`${u.adSoyad||u.kullaniciAdi} silindi.`);}catch(e){console.error(e);mesgul(null,false);sB.dataset.ok='';sB.textContent='Kullanıcıyı sil';GE.innerHTML=`<div class="confirm bad">${esc(girisHata(e))}</div>`;}};
   byId('uOk').onclick=async()=>{const adSoyad=byId('uAd').value.trim();const r=sh.querySelector('#uRol .on').dataset.v;const subeler=[...sh.querySelectorAll('.checks input:checked')].map(i=>i.value);
     if(!adSoyad){E.innerHTML='<div class="confirm">Ad soyad gerekli.</div>';return;}if(r!=='isveren'&&!subeler.length){E.innerHTML='<div class="confirm">En az bir şube seçin.</div>';return;}
     if(r==='sube'&&subeler.length>1&&!E.dataset.ok){E.dataset.ok='1';E.innerHTML='<div class="confirm">Şube müdürüne birden fazla şube seçtiniz. Doğruysa tekrar basın.</div>';return;}
     const btn=byId('uOk');btn.disabled=true;
     try{if(uid){const body=isIsveren()?{adSoyad,rol:r,subeler:r==='isveren'?[]:subeler}:{adSoyad,subeler};await updateDoc(doc(db,'kullanicilar',uid),body);closeSheet();toast('Kullanıcı güncellendi.');}
       else{const k=kadiNorm(byId('uK').value),p=byId('uP').value;if(k.length<3){E.innerHTML='<div class="confirm">Kullanıcı adı en az 3 karakter olmalı (harf, rakam, nokta).</div>';btn.disabled=false;return;}
         if(p.length<6){E.innerHTML='<div class="confirm">Şifre en az 6 karakter olmalı.</div>';btn.disabled=false;return;}
         const a2=ikincilAuth();await ikincilCikis();const cred=await createUserWithEmailAndPassword(a2,eposta(k),p);const nuid=cred.user.uid;await signOut(a2);
         await setDoc(doc(db,'kullanicilar',nuid),{kullaniciAdi:k,adSoyad,rol:isIsveren()?r:'sube',subeler:r==='isveren'&&isIsveren()?[]:subeler,aktif:true,olusturma:new Date().toISOString(),olusturan:S.user.uid,...(isIsveren()?{}:{bolgeler:[S.user.uid]})});
         let sfOk=true;try{await sifreKaydet(nuid,k,p);}catch(e){sfOk=false;console.error(e);}
         closeSheet();toast(`${adSoyad} oluşturuldu. Kullanıcı adı: ${k}${sfOk?'':' (şifre listeye kaydedilemedi: Firebase kurallarını güncelleyin)'}`);}}
     catch(e){btn.disabled=false;const c=e.code||'';E.innerHTML=`<div class="confirm bad">${c.includes('email-already-in-use')?'Bu kullanıcı adı alınmış.':c.includes('weak-password')?'Şifre çok zayıf.':'Kaydedilemedi: '+esc(e.message)}</div>`;}};});}

bootstrap();
