// INSIRA AQUI A SUA URL GERADA PELO GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbxsD2Jh6CSSrQqGBsZlEn_tF9a2HonhcoO3gvhQ7FKu63e2PmGaOv8og9xKJh_zCjjs/exec';

const DB_NAME = 'financas_v101';
const STORE = 'dados';

let db, chartInstance = null, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

function atualizarStatusRede() {
    const statusLabel = document.getElementById('statusLabel');
    if (navigator.onLine) {
        statusLabel.innerText = "🌐 Online";
        statusLabel.className = "status online";
        sincronizar();
    } else {
        statusLabel.innerText = "⚠️ Offline";
        statusLabel.className = "status offline";
    }
}

window.addEventListener('online', atualizarStatusRede);
window.addEventListener('offline', atualizarStatusRede);

const req = indexedDB.open(DB_NAME, 1);

req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });

req.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    atualizarStatusRede();
    carregarLocal();
};

function carregarLocal() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result.filter(item => !item.excluido);
        atualizarTela();
    };
}

function atualizarTela() {

    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => i.data.substring(0,7) === mesAtual);

    let rec=0, desp=0;
    lista.innerHTML='';

    filtrados.sort((a,b)=>b.data.localeCompare(a.data)).forEach(item=>{

        const v=parseFloat(item.valor)||0;
        item.tipo==='Receita'?rec+=v:desp+=v;

        let imagemSrc='https://via.placeholder.com/50?text=Sem+Foto';

        if(item.foto && item.foto.length>10){
            imagemSrc=item.foto;
        }

        const dataFormatada=item.data.split('T')[0].split('-').reverse().join('/');

        const statusSync=item.sinc===0?'<span style="color:orange;font-size:10px;">⏳</span>':'';

        lista.innerHTML+=`
        <div class="item">

        <img class="mini-foto"
        src="${imagemSrc}"
        onclick="abrirZoom(this.src)"
        onerror="this.src='https://via.placeholder.com/50?text=Erro'">

        <div class="info">
        <strong>${item.descricao} ${statusSync}</strong>
        <span>${item.categoria}</span>
        <small>${dataFormatada}</small>
        </div>

        <div class="acoes">
        <b style="color:${item.tipo==='Receita'?'var(--s)':'var(--d)'}">
        R$ ${v.toFixed(2)}
        </b>

        <div>
        <button class="btn-acao" onclick="editar('${item.id}')">Editar</button>
        <button class="btn-acao btn-excluir" onclick="excluir('${item.id}')">Excluir</button>
        </div>

        </div>
        </div>`;
    });

    document.getElementById('saldoTotal').innerText=`R$ ${(rec-desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText=`R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText=`R$ ${desp.toFixed(2)}`;
}

async function sincronizar(){

if(!navigator.onLine)return;

document.getElementById('statusLabel').innerText="🔄 Sincronizando...";

const txRead=db.transaction(STORE,'readonly');

txRead.objectStore(STORE).getAll().onsuccess=async e=>{

const todosItens=e.target.result;
const pendentes=todosItens.filter(l=>l.sinc===0);

for(let p of pendentes){

try{

const payload=p.excluido?{action:'delete',id:p.id}:p;

await fetch(API_URL,{
method:'POST',
headers:{'Content-Type':'text/plain;charset=utf-8'},
body:JSON.stringify(payload)
});

const txWrite=db.transaction(STORE,'readwrite');

if(p.excluido){
txWrite.objectStore(STORE).delete(p.id);
}else{
p.sinc=1;
txWrite.objectStore(STORE).put(p);
}

}catch(err){
console.log("Falha ao subir item");
}

}

};

}

// ============================
// ZOOM MELHORADO
// ============================

let zoomLevel = 1;

function abrirZoom(src){

if(src && !src.includes('placeholder')){

const overlay=document.getElementById('zoomOverlay');
const img=document.getElementById('zoomedImg');

img.src=src;

zoomLevel=1;
img.style.transform="scale(1)";

overlay.classList.add('active');

}

}

function fecharZoom(){

document.getElementById('zoomOverlay').classList.remove('active');

}

document.addEventListener('wheel',function(e){

const overlay=document.getElementById('zoomOverlay');

if(!overlay.classList.contains('active'))return;

const img=document.getElementById('zoomedImg');

if(e.deltaY<0){
zoomLevel+=0.2;
}else{
zoomLevel-=0.2;
}

zoomLevel=Math.min(Math.max(1,zoomLevel),5);

img.style.transform=`scale(${zoomLevel})`;

});