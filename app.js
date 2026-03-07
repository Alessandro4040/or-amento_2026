const API_URL = 'https://script.google.com/macros/s/AKfycbx5u1Qb4rFh4HVaqoGcV6Uy10lTavD7sdXRkJuyhLO0HEsa2FSl-8edS4wq6uLpLHCQ/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, chartInstance;
let lancamentos = [];
let mesAtual = new Date().toISOString().substring(0, 7);
let termoBusca = '';
let fotoBase64 = null;
let editId = null;

// Utilitário para formatar data
function formatarDataBR(dataStr) {
    if (!dataStr) return '';
    let dataLimpa = dataStr.includes('T') ? dataStr.split('T')[0] : dataStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataLimpa)) {
        const [ano, mes, dia] = dataLimpa.split('-');
        return `${dia}-${mes}-${ano}`;
    }
    return dataLimpa;
}

// Inicializar IndexedDB
const request = indexedDB.open(DB_NAME, 4);
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
    }
};
request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregarDados();
};

async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    store.getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        if (navigator.onLine) sincronizar();
    };
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => 
        i.data.startsWith(mesAtual) && 
        (i.descricao.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca))
    );

    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a, b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;

        const fotoSrc = item.foto && item.foto.startsWith('data:image') ? item.foto : '';
        const imgTag = fotoSrc ? `<img class="mini-foto" src="${fotoSrc}" onclick="verFoto('${fotoSrc}')">` : `<div class="mini-foto" style="background:#eee; display:flex; align-items:center; justify-content:center; font-size:10px; color:#aaa">Sem foto</div>`;

        lista.innerHTML += `
            <div class="item">
                ${imgTag}
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${formatarDataBR(item.data)}</small>
                </div>
                <div style="text-align:right">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}">R$ ${v.toFixed(2)}</div>
                    <div>
                        <small class="edit-link" onclick="editar('${item.id}')">✏️</small>
                        <small class="delete-link" onclick="excluir('${item.id}')">🗑️</small>
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

// Eventos de Filtro e Navegação
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); };
document.getElementById('campoBusca').oninput = e => { termoBusca = e.target.value.toLowerCase(); atualizarTela(); };
document.getElementById('tabResumo').onclick = () => navegar('resumo');
document.getElementById('tabGrafico').onclick = () => navegar('grafico');
document.getElementById('tabAdd').onclick = () => {
    editId = null;
    document.getElementById('formTitle').innerText = 'Novo Lançamento';
    limparForm();
    abrirForm();
};
document.getElementById('btnSalvar').onclick = salvar;

function navegar(view) {
    document.getElementById('view-resumo').style.display = view === 'resumo' ? 'block' : 'none';
    document.getElementById('view-grafico').style.display = view === 'grafico' ? 'block' : 'none';
    if (view === 'grafico') renderGrafico();
}

function limparForm() {
    document.getElementById('tipo').value = 'Receita';
    document.getElementById('data').value = new Date().toISOString().split('T')[0];
    document.getElementById('categoria').value = '';
    document.getElementById('descricao').value = '';
    document.getElementById('valor').value = '';
    fotoBase64 = null;
}

function abrirForm(item = null) {
    if (item) {
        document.getElementById('tipo').value = item.tipo;
        document.getElementById('data').value = item.data.split('T')[0];
        document.getElementById('categoria').value = item.categoria;
        document.getElementById('descricao').value = item.descricao;
        document.getElementById('valor').value = item.valor;
        fotoBase64 = item.foto || null;
    }
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
    editId = null;
}

// COMPRESSÃO DE IMAGEM: Redimensiona para não estourar o limite do Google Sheets
document.getElementById('inputFoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const max = 400; // Tamanho máximo da miniatura
            if (width > height) { if (width > max) { height *= max / width; width = max; } }
            else { if (height > max) { width *= max / height; height = max; } }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            fotoBase64 = canvas.toDataURL('image/jpeg', 0.7); // 70% de qualidade
            alert('Foto carregada com sucesso!');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

async function salvar() {
    if (!document.getElementById('data').value || !document.getElementById('valor').value) {
        alert('Preencha data e valor!');
        return;
    }

    const item = {
        id: editId || 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'Sem título',
        valor: parseFloat(document.getElementById('valor').value),
        foto: fotoBase64,
        sinc: 0
    };

    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarDados();
    };
}

function editar(id) {
    const item = lancamentos.find(l => l.id === id);
    if (item) { editId = id; document.getElementById('formTitle').innerText = 'Editar'; abrirForm(item); }
}

async function excluir(id) {
    if (!confirm('Excluir?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        if (navigator.onLine) {
            fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: id }) });
        }
    };
}

function verFoto(src) {
    if (!src) return;
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function renderGrafico() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const caps = {};
    filtrados.forEach(i => caps[i.categoria] = (caps[i.categoria] || 0) + parseFloat(i.valor));
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, { type: 'pie', data: { labels: Object.keys(caps), datasets: [{ data: Object.values(caps) }] } });
}

function exportarCSV() {
    let csv = 'Data;Tipo;Descricao;Valor\n';
    lancamentos.filter(i => i.data.startsWith(mesAtual)).forEach(i => {
        csv += `${formatarDataBR(i.data)};${i.tipo};${i.descricao};${i.valor}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio.csv';
    a.click();
}

async function sincronizar() {
    try {
        const unsynced = lancamentos.filter(l => l.sinc === 0);
        for (const item of unsynced) {
            const payload = {
                action: 'create',
                id: item.id,
                data: item.data,
                categoria: item.categoria,
                descricao: item.descricao,
                valor: item.valor,
                tipo: item.tipo,
                temFoto: item.foto ? 'Sim' : 'Não',
                fotoBase64: item.foto || ''
            };
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
            item.sinc = 1;
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(item);
        }

        const response = await fetch(API_URL + '?action=list');
        const result = await response.json();
        if (result.data) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            result.data.forEach(apiItem => {
                store.put({
                    id: apiItem.id.toString(),
                    tipo: apiItem.tipo,
                    data: apiItem.data,
                    categoria: apiItem.categoria,
                    descricao: apiItem.descricao,
                    valor: parseFloat(apiItem.valor),
                    foto: apiItem.fotoBase64 || '',
                    sinc: 1
                });
            });
        }
    } catch (err) { console.warn('Erro sincronia:', err); }
}

function atualizarStatus() {
    const label = document.getElementById('statusLabel');
    label.innerText = navigator.onLine ? 'Online' : 'Offline';
    label.className = 'status ' + (navigator.onLine ? 'online' : 'offline');
}
window.addEventListener('online', atualizarStatus);
window.addEventListener('offline', atualizarStatus);
atualizarStatus();

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('service-worker.js'); }
