const API_URL = 'https://script.google.com/macros/s/AKfycbycxDj4mmekmrcelSJq0vO4um88FGlp1T3OlWzU6bA1lJowiQI1hfZj-hNTmT8GOjEy/exec'; 
const DB_NAME = 'financas_db';
const STORE = 'lancamentos';

let db, chartInstance;
let lancamentos = [];
let mesAtual = new Date().toISOString().substring(0, 7);
let termoBusca = '';
let fotoBase64 = null;

// Inicializar Banco e Status
const request = indexedDB.open(DB_NAME, 5);
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};

request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    inicializarStatus();
    carregarLocal();
    if (navigator.onLine) buscarDadosDaPlanilha(); // Busca dados novos do Google ao abrir
};

function inicializarStatus() {
    const label = document.getElementById('statusLabel');
    const atualizar = () => {
        const isOnline = navigator.onLine;
        label.innerText = isOnline ? 'Online' : 'Offline';
        label.className = `status ${isOnline ? 'online' : 'offline'}`;
        if (isOnline) sincronizar();
    };
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    atualizar();
}

async function carregarLocal() {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    store.getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
    };
}

// BUSCAR DADOS DA PLANILHA (Puxar o que já existe lá)
async function buscarDadosDaPlanilha() {
    try {
        const response = await fetch(`${API_URL}?action=list`);
        const result = await response.json();
        if (result.data) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            result.data.forEach(item => {
                // Mapeia fotoBase64 para o formato que o app usa
                if(item.fotoBase64) item.foto = item.fotoBase64;
                item.sinc = 1; // Já está na planilha
                store.put(item);
            });
            tx.oncomplete = () => carregarLocal();
        }
    } catch (e) { console.error("Erro ao puxar dados:", e); }
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => 
        i.data.startsWith(mesAtual) && 
        (i.descricao.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca))
    );

    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;

        lista.innerHTML += `
            <div class="item">
                <img class="mini-foto" src="${item.foto || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23ccc\'%3E%3Cpath d=\'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\'/%3E%3C/svg%3E'}" onclick="verFoto('${item.foto}')">
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${item.data.split('-').reverse().join('/')}</small>
                </div>
                <div class="acoes">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}" style="font-weight:bold">
                        ${item.tipo === 'Receita' ? '+' : '-'} R$ ${v.toFixed(2)}
                    </div>
                    <div>
                        <button onclick="editar('${item.id}')" class="btn-edit">✏️</button>
                        <button onclick="excluir('${item.id}')" style="background:none; border:none; color:red; font-size:16px;">🗑️</button>
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); };
document.getElementById('campoBusca').oninput = e => { termoBusca = e.target.value.toLowerCase(); atualizarTela(); };

function abrirForm() {
    document.getElementById('editId').value = '';
    document.getElementById('formTitulo').innerText = 'Novo Lançamento';
    document.getElementById('data').value = new Date().toISOString().substring(0, 10);
    document.getElementById('imgPrev').style.display = 'none';
    fotoBase64 = null;
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function tratarFoto(input) {
    const reader = new FileReader();
    reader.onload = e => {
        fotoBase64 = e.target.result;
        document.getElementById('imgPrev').src = fotoBase64;
        document.getElementById('imgPrev').style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
}

async function salvar() {
    const id = document.getElementById('editId').value || 'ID' + Date.now();
    const item = {
        id: id,
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'Sem descrição',
        valor: document.getElementById('valor').value,
        foto: fotoBase64,
        fotoBase64: fotoBase64, // Campo compatível com a planilha
        sinc: 0
    };
    if(!item.valor || !item.data) return alert('Data e Valor são obrigatórios!');
    
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => { fecharTudo(); carregarLocal(); };
}

function editar(id) {
    const item = lancamentos.find(i => i.id == id);
    if (!item) return;
    abrirForm();
    document.getElementById('editId').value = item.id;
    document.getElementById('formTitulo').innerText = 'Editar Lançamento';
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('data').value = item.data;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    if(item.foto) {
        fotoBase64 = item.foto;
        document.getElementById('imgPrev').src = item.foto;
        document.getElementById('imgPrev').style.display = 'block';
    }
}

function verFoto(src) {
    if(!src || src.length < 50) return;
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
}

async function excluir(id) {
    if(confirm('Excluir este item permanentemente?')) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = carregarLocal;
        // Opcional: Adicionar chamada fetch para deletar na planilha também
    }
}

function navegar(view, btn) {
    document.getElementById('view-resumo').style.display = view === 'resumo' ? 'block' : 'none';
    document.getElementById('view-grafico').style.display = view === 'grafico' ? 'block' : 'none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    if(view === 'grafico') renderGrafico();
}

function renderGrafico() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const caps = {};
    filtrados.forEach(i => caps[i.categoria] = (caps[i.categoria] || 0) + parseFloat(i.valor));
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(caps), datasets: [{ data: Object.values(caps), backgroundColor: ['#007bff','#22c55e','#ef4444','#f59e0b','#6366f1'] }] }
    });
}

function exportarCSV() {
    let csv = 'Data;Tipo;Categoria;Descricao;Valor\n';
    lancamentos.filter(i => i.data.startsWith(mesAtual)).forEach(i => {
        csv += `${i.data};${i.tipo};${i.categoria};${i.descricao};${i.valor}\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Relatorio_${mesAtual}.csv`;
    a.click();
}

async function sincronizar() {
    const tx = db.transaction(STORE, 'readonly');
    const pendentes = await new Promise(res => {
        tx.objectStore(STORE).getAll().onsuccess = e => res(e.target.result.filter(i => i.sinc === 0));
    });
    for(let item of pendentes) {
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(item), mode: 'no-cors' });
            const txW = db.transaction(STORE, 'readwrite');
            item.sinc = 1;
            txW.objectStore(STORE).put(item);
        } catch(e) { break; }
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}