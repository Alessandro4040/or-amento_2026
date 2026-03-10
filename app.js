const API_URL = 'https://script.google.com/macros/s/AKfycbzDQKaKjDgQh0UKCwWeE1AZC9vm3ZnEduFSYkt7VQsqlfaL9z02cno29IZRDOCZOxU6/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, chartInstance, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

// Inicializar Banco de Dados
const request = indexedDB.open(DB_NAME, 15);
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};
request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    verificarStatus();
    carregarDados();
};

// Monitorar conexão
window.addEventListener('online', verificarStatus);
window.addEventListener('offline', verificarStatus);

function verificarStatus() {
    const label = document.getElementById('statusLabel');
    if (navigator.onLine) {
        label.innerText = 'Online';
        label.className = 'status online';
        sincronizar();
    } else {
        label.innerText = 'Offline';
        label.className = 'status offline';
    }
}

async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
    };
}

// Busca funciona automaticamente ao digitar
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

function verFoto(src) {
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

// Limpa o formulário para novos itens
function abrirForm() {
    if (!editId) {
        document.getElementById('formTitle').innerText = "Novo Lançamento";
        document.getElementById('tipo').value = "Despesa";
        document.getElementById('data').value = new Date().toISOString().split('T')[0];
        document.getElementById('categoria').value = "";
        document.getElementById('descricao').value = "";
        document.getElementById('valor').value = "";
        fotoBase64 = null;
        document.getElementById('imgPreview').style.display = 'none';
    }
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function prepararEdicao(id) {
    const item = lancamentos.find(i => i.id === id);
    if (!item) return;
    editId = id;
    document.getElementById('formTitle').innerText = "Editar Lançamento";
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('data').value = item.data;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    fotoBase64 = item.foto;
    
    const prev = document.getElementById('imgPreview');
    if (fotoBase64) {
        prev.src = fotoBase64;
        prev.style.display = 'block';
    } else {
        prev.style.display = 'none';
    }
    abrirForm();
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
    editId = null;
    fotoBase64 = null;
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
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarDados();
        if (navigator.onLine) sincronizar();
    };
}

async function excluir(id) {
    if (!confirm('Deseja excluir?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        if (navigator.onLine) {
            fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: id }) });
        }
    };
}

async function sincronizar() {
    if (!navigator.onLine) return;
    const unsynced = lancamentos.filter(l => l.sinc === 0);
    for (const item of unsynced) {
        const payload = { ...item, action: 'update', temFoto: item.foto ? 'Sim' : 'Não', fotoBase64: item.foto || '' };
        await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        
        const tx = db.transaction(STORE, 'readwrite');
        item.sinc = 1;
        tx.objectStore(STORE).put(item);
    }
}

function renderGrafico() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const totais = {};
    filtrados.forEach(i => totais[i.categoria] = (totais[i.categoria] || 0) + i.valor);
    
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(totais),
            datasets: [{
                data: Object.values(totais),
                backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#e83e8c']
            }]
        }
    });
}

function exportarCSV() {
    let csv = 'Data,Tipo,Categoria,Descricao,Valor\n';
    lancamentos.forEach(i => {
        csv += `${i.data},${i.tipo},${i.categoria},"${i.descricao}",${i.valor}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `financas_${mesAtual}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Eventos
document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('tabAdd').onclick = abrirForm;
document.getElementById('tabResumo').onclick = () => {
    document.getElementById('view-resumo').style.display = 'block';
    document.getElementById('view-grafico').style.display = 'none';
};
document.getElementById('tabGrafico').onclick = () => {
    document.getElementById('view-resumo').style.display = 'none';
    document.getElementById('view-grafico').style.display = 'block';
    renderGrafico();
};
document.getElementById('btnExportar').onclick = exportarCSV;
document.getElementById('campoBusca').oninput = atualizarTela;
document.getElementById('filtroMes').onchange = (e) => {
    mesAtual = e.target.value;
    carregarDados();
};

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
            const prev = document.getElementById('imgPreview');
            prev.src = fotoBase64;
            prev.style.display = 'block';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
});
