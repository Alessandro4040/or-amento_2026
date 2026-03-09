const API_URL = 'https://script.google.com/macros/s/AKfycbzDQKaKjDgQh0UKCwWeE1AZC9vm3ZnEduFSYkt7VQsqlfaL9z02cno29IZRDOCZOxU6/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, chartInstance, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

// Inicializar Banco de Dados (Versão 12 para limpar erros anteriores)
const request = indexedDB.open(DB_NAME, 12);
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};
request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregarDados();
};

async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        if (navigator.onLine) sincronizar();
    };
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual));
    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;
        const imgHtml = item.foto ? `<img class="mini-foto" src="${item.foto}" onclick="verFoto('${item.foto}')">` : `<div class="mini-foto" style="background:#eee"></div>`;
        
        lista.innerHTML += `
            <div class="item">
                ${imgHtml}
                <div class="info" onclick="prepararEdicao('${item.id}')">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${item.data.split('-').reverse().join('/')}</small>
                </div>
                <div style="text-align:right">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}">R$ ${v.toFixed(2)}</div>
                    <small onclick="excluir('${item.id}')" style="color:red;cursor:pointer;padding:5px">Excluir</small>
                </div>
            </div>`;
    });
    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

// ZOOM DA FOTO
function verFoto(src) {
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

// EDIÇÃO
function prepararEdicao(id) {
    const item = lancamentos.find(i => i.id === id);
    if (!item) return;
    editId = id;
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('data').value = item.data;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    fotoBase64 = item.foto;
    abrirForm();
}

function abrirForm() {
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
    editId = null;
    fotoBase64 = null;
}

// SALVAR
async function salvar() {
    const item = {
        id: editId || 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'S/D',
        valor: parseFloat(document.getElementById('valor').value) || 0,
        foto: fotoBase64,
        sinc: 0
    };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item); // O put salva novo ou atualiza existente
    tx.oncomplete = () => { fecharTudo(); carregarDados(); };
}

async function excluir(id) {
    if (!confirm('Deseja excluir?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: id }) });
    };
}

// SINCRONIZAÇÃO CORRIGIDA
async function sincronizar() {
    try {
        const unsynced = lancamentos.filter(l => l.sinc === 0);
        for (const item of unsynced) {
            const payload = { ...item, action: 'create', temFoto: item.foto ? 'Sim' : 'Não', fotoBase64: item.foto || '' };
            // Usamos no-cors para evitar bloqueios, o Google recebe o dado normalmente
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
            
            item.sinc = 1;
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(item);
        }
    } catch (e) { console.log("Erro sincronia", e); }
}

// Eventos de Botão
document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('tabAdd').onclick = abrirForm;
document.getElementById('tabResumo').onclick = () => { document.getElementById('view-resumo').style.display='block'; document.getElementById('view-grafico').style.display='none'; };
document.getElementById('tabGrafico').onclick = () => { document.getElementById('view-resumo').style.display='none'; document.getElementById('view-grafico').style.display='block'; renderGrafico(); };

// Processar Foto
document.getElementById('inputFoto').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX = 400;
            const scale = MAX / img.width;
            canvas.width = MAX; canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
            alert("Foto pronta!");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
});
