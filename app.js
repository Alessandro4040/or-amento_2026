const API_URL = 'https://script.google.com/macros/s/AKfycbzDQKaKjDgQh0UKCwWeE1AZC9vm3ZnEduFSYkt7VQsqlfaL9z02cno29IZRDOCZOxU6/exec'; 
const DB_NAME = 'financas_v21'; // Subi para 21 para garantir limpeza total
const STORE = 'lançamentos';

let db, lancamentos = [], chartInstance = null, fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

const request = indexedDB.open(DB_NAME, 21);
request.onupgradeneeded = e => {
    e.target.result.createObjectStore(STORE, { keyPath: 'id' });
};

request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregarDados();
    // Forçar sincronia ao abrir
    if (navigator.onLine) sincronizar();
};

// --- O SEGREDO DA SINCRONIA ENTRE ABAS ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("App focado, sincronizando...");
        sincronizar();
    }
});

async function sincronizar() {
    if (!navigator.onLine) return;
    document.getElementById('statusLabel').innerText = "Sincronizando...";
    document.getElementById('statusLabel').className = "status syncing";

    try {
        // 1. Enviar o que foi feito offline
        const localData = await getAllLocal();
        const pendentes = localData.filter(l => l.sinc === 0);
        
        for (const item of pendentes) {
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(item) });
            item.sinc = 1;
            await salvarLocal(item);
        }

        // 2. Puxar TUDO da planilha para garantir que todas as abas fiquem iguais
        const res = await fetch(API_URL);
        const result = await res.json();
        
        if (result.data) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            // Limpa o banco local e coloca o da planilha (o "verdadeiro")
            store.clear(); 
            result.data.forEach(item => {
                store.put({
                    ...item,
                    id: item.id.toString(),
                    valor: parseFloat(item.valor),
                    sinc: 1,
                    foto: item.foto || ''
                });
            });
            tx.oncomplete = () => {
                document.getElementById('statusLabel').innerText = "Sincronizado";
                document.getElementById('statusLabel').className = "status online";
                carregarDados();
            };
        }
    } catch (e) {
        console.error("Erro sync:", e);
        document.getElementById('statusLabel').innerText = "Offline";
    }
}

async function carregarDados() {
    lancamentos = await getAllLocal();
    atualizarTela();
}

function getAllLocal() {
    return new Promise(resolve => {
        const tx = db.transaction(STORE, 'readonly');
        tx.objectStore(STORE).getAll().onsuccess = e => resolve(e.target.result);
    });
}

function salvarLocal(item) {
    return new Promise(resolve => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(item);
        tx.oncomplete = () => resolve();
    });
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const busca = document.getElementById('campoBusca').value.toLowerCase();
    
    const filtrados = lancamentos.filter(i => 
        i.data.startsWith(mesAtual) && 
        (i.descricao.toLowerCase().includes(busca) || i.categoria.toLowerCase().includes(busca))
    );
    
    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;
        
        lista.innerHTML += `
            <div class="item">
                ${item.foto ? `<img class="mini-foto" src="${item.foto}" onclick="verFoto('${item.foto}')">` : '<div class="mini-foto" style="display:flex;align-items:center;justify-content:center;font-size:20px">💰</div>'}
                <div class="info" onclick="prepararEdicao('${item.id}')">
                    <strong>${item.descricao}</strong><br>
                    <small>${item.categoria} • ${item.data.split('-').reverse().join('/')}</small>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:bold; color:${item.tipo === 'Receita' ? 'var(--success)' : 'var(--danger)'}">
                        ${item.tipo === 'Receita' ? '+' : '-'} R$ ${v.toFixed(2)}
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

// Funções de UI
function abrirForm() {
    editId = null;
    fotoBase64 = null;
    document.getElementById('imgPreview').style.display = 'none';
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    document.getElementById('data').value = new Date().toISOString().split('T')[0];
}

function fecharTudo() {
    document.getElementById('modalForm').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

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

    await salvarLocal(item);
    fecharTudo();
    carregarDados();
    sincronizar();
}

// Eventos
document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('tabAdd').onclick = abrirForm;
document.getElementById('filtroMes').onchange = (e) => { mesAtual = e.target.value; carregarDados(); };
document.getElementById('campoBusca').oninput = atualizarTela;
document.getElementById('tabResumo').onclick = () => {
    document.getElementById('view-resumo').style.display='block';
    document.getElementById('view-grafico').style.display='none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tabResumo').classList.add('active');
};