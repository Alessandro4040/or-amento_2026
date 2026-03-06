const API_URL = 'https://script.google.com/macros/s/AKfycbycxDj4mmekmrcelSJq0vO4um88FGlp1T3OlWzU6bA1lJowiQI1hfZj-hNTmT8GOjEy/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, chartInstance;
let lancamentos = [];
let mesAtual = new Date().toISOString().substring(0, 7);
let termoBusca = '';
let fotoBase64 = null;
let editId = null;

// Utilitário para garantir data no formato YYYY-MM-DD
function formatarData(dataStr) {
    if (!dataStr) return '';
    // Se vier com horário (ex: "2026-03-06T03:00:00.000Z"), extrai só a data
    if (dataStr.includes('T')) {
        return dataStr.split('T')[0];
    }
    return dataStr; // já deve estar OK
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

// Carrega dados do IndexedDB
async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    store.getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        if (navigator.onLine) sincronizar();
    };
}

// Atualiza a lista na tela
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

        lista.innerHTML += `
            <div class="item">
                <img class="mini-foto" src="${item.foto || ''}" onclick="verFoto('${item.foto}')">
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${formatarData(item.data)}</small>
                </div>
                <div style="text-align:right">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}">R$ ${v.toFixed(2)}</div>
                    <div>
                        <small class="edit-link" onclick="editar('${item.id}')">✏️ Editar</small>
                        <small class="delete-link" onclick="excluir('${item.id}')">🗑️ Excluir</small>
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

// Filtros
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); };
document.getElementById('campoBusca').oninput = e => { termoBusca = e.target.value.toLowerCase(); atualizarTela(); };

// Navegação entre abas
document.getElementById('tabResumo').onclick = () => navegar('resumo');
document.getElementById('tabGrafico').onclick = () => navegar('grafico');
document.getElementById('tabAdd').onclick = () => {
    editId = null;
    document.getElementById('formTitle').innerText = 'Novo Lançamento';
    abrirForm();
};
document.getElementById('btnSalvar').onclick = salvar;

function navegar(view) {
    document.getElementById('view-resumo').style.display = view === 'resumo' ? 'block' : 'none';
    document.getElementById('view-grafico').style.display = view === 'grafico' ? 'block' : 'none';
    if (view === 'grafico') renderGrafico();
}

// Abre o modal de formulário (novo ou edição)
function abrirForm(item = null) {
    if (item) {
        // Edição: preenche os campos
        document.getElementById('tipo').value = item.tipo;
        document.getElementById('data').value = formatarData(item.data);
        document.getElementById('categoria').value = item.categoria;
        document.getElementById('descricao').value = item.descricao;
        document.getElementById('valor').value = item.valor;
        fotoBase64 = item.foto || null;
    } else {
        // Novo: campos em branco, data atual
        document.getElementById('tipo').value = 'Receita';
        document.getElementById('data').value = new Date().toISOString().split('T')[0];
        document.getElementById('categoria').value = '';
        document.getElementById('descricao').value = '';
        document.getElementById('valor').value = '';
        fotoBase64 = null;
    }
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

// Fecha todos os modais
function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
    editId = null;
}

// Converte foto para Base64
document.getElementById('inputFoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        fotoBase64 = event.target.result;
    };
    reader.readAsDataURL(file);
});

// Salvar (criar ou atualizar)
async function salvar() {
    if (!document.getElementById('data').value || !document.getElementById('valor').value) {
        alert('Preencha data e valor!');
        return;
    }

    const item = {
        id: editId || 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value, // já YYYY-MM-DD
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'Sem título',
        valor: parseFloat(document.getElementById('valor').value),
        foto: fotoBase64,
        sinc: 0 // pendente de sincronização
    };

    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarDados();
        if (navigator.onLine) sincronizar();
    };
}

// Editar um lançamento existente
function editar(id) {
    const item = lancamentos.find(l => l.id === id);
    if (item) {
        editId = id;
        document.getElementById('formTitle').innerText = 'Editar Lançamento';
        abrirForm(item);
    }
}

// Excluir lançamento
async function excluir(id) {
    if (!confirm('Excluir lançamento?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        if (navigator.onLine) {
            fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id: id })
            }).catch(console.warn);
        }
    };
}

// Zoom na foto
function verFoto(src) {
    if (!src) return;
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

// Gráfico de despesas por categoria
function renderGrafico() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const caps = {};
    filtrados.forEach(i => caps[i.categoria] = (caps[i.categoria] || 0) + parseFloat(i.valor));
    
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels: Object.keys(caps), datasets: [{ data: Object.values(caps) }] }
    });
}

// Exportar CSV do mês atual
function exportarCSV() {
    let csv = 'Data;Tipo;Descricao;Valor\n';
    lancamentos.filter(i => i.data.startsWith(mesAtual)).forEach(i => {
        csv += `${formatarData(i.data)};${i.tipo};${i.descricao};${i.valor}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio.csv';
    a.click();
}

// Status Online/Offline
function atualizarStatus() {
    const label = document.getElementById('statusLabel');
    if (navigator.onLine) {
        label.innerText = 'Online';
        label.className = 'status online';
    } else {
        label.innerText = 'Offline';
        label.className = 'status offline';
    }
}
window.addEventListener('online', atualizarStatus);
window.addEventListener('offline', atualizarStatus);
atualizarStatus();

// Sincronização com a API do Google Sheets
async function sincronizar() {
    console.log('Sincronizando...');
    try {
        // Envia pendentes (sinc = 0)
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
            await fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            // Marca como sincronizado
            item.sinc = 1;
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(item);
            await tx.complete;
        }

        // Baixa todos os registros da API
        const response = await fetch(API_URL + '?action=list');
        const result = await response.json();
        if (result.data && Array.isArray(result.data)) {
            const apiRecords = result.data;
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            for (const apiItem of apiRecords) {
                const localItem = {
                    id: apiItem.id.toString(),
                    tipo: apiItem.tipo,
                    data: apiItem.data,
                    categoria: apiItem.categoria,
                    descricao: apiItem.descricao,
                    valor: parseFloat(apiItem.valor),
                    foto: apiItem.fotoBase64 || '',
                    sinc: 1
                };
                await store.put(localItem);
            }
            await tx.complete;
            console.log('Sincronização concluída');
            carregarDados();
        }
    } catch (err) {
        console.warn('Erro na sincronização:', err);
    }
}

// Registra o Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}