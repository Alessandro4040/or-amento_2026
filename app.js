const API_URL = 'https://script.google.com/macros/s/AKfycbzznOENTtkoN5iKlt0tmk6D5jfI9d3_dL-5bCBz6dzQB_x9qCy45ABHEU6etjf8cioX/exec';
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

        lista.innerHTML += `
            <div class="item">
                <img class="mini-foto" src="${item.foto || ''}" onclick="verFoto('${item.foto}')">
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${formatarDataBR(item.data)}</small>
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

// Eventos
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); };
document.getElementById('campoBusca').oninput = e => { termoBusca = e.target.value.toLowerCase(); atualizarTela(); };
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

function abrirForm(item = null) {
    if (item) {
        document.getElementById('tipo').value = item.tipo;
        let dataIso = item.data;
        if (dataIso.includes('T')) dataIso = dataIso.split('T')[0];
        document.getElementById('data').value = dataIso;
        document.getElementById('categoria').value = item.categoria;
        document.getElementById('descricao').value = item.descricao;
        document.getElementById('valor').value = item.valor;
        fotoBase64 = item.foto || null;
    } else {
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

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
    editId = null;
}

document.getElementById('inputFoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        fotoBase64 = event.target.result;
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
    const store = tx.objectStore(STORE);
    store.put(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarDados();
        if (navigator.onLine) sincronizar();
    };
}

function editar(id) {
    const item = lancamentos.find(l => l.id === id);
    if (item) {
        editId = id;
        document.getElementById('formTitle').innerText = 'Editar Lançamento';
        abrirForm(item);
    }
}

async function excluir(id) {
    if (!confirm('Excluir lançamento?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        if (navigator.onLine) {
            // Tenta deletar na API também
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id: id })
            }).catch(console.warn);
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
    chartInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels: Object.keys(caps), datasets: [{ data: Object.values(caps) }] }
    });
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

// Função para verificar se um ID existe na API
async function verificarExistenciaNaAPI(id) {
    try {
        const response = await fetch(API_URL + `?action=get&id=${encodeURIComponent(id)}`);
        if (!response.ok) return false;
        const result = await response.json();
        return result.data !== null;
    } catch (err) {
        console.warn('Erro ao verificar existência:', err);
        return false;
    }
}

// Sincronização aprimorada
async function sincronizar() {
    console.log('Iniciando sincronização...');
    try {
        // 1. Busca todos os registros da API
        const response = await fetch(API_URL + '?action=list');
        if (!response.ok) {
            throw new Error('Erro ao buscar dados da API: ' + response.status);
        }
        const result = await response.json();
        if (!result.data || !Array.isArray(result.data)) {
            throw new Error('Resposta da API inválida');
        }

        const apiRecords = result.data;
        console.log('Registros da API:', apiRecords.length);

        // 2. Abre transação para ler e escrever no IndexedDB
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);

        // Mapa de IDs existentes localmente
        const localMap = new Map();
        lancamentos.forEach(l => localMap.set(l.id, l));

        // 3. Para cada registro da API, insere ou atualiza no banco local
        for (const apiItem of apiRecords) {
            const id = apiItem.id.toString();
            const apiData = {
                id: id,
                tipo: apiItem.tipo,
                data: apiItem.data,
                categoria: apiItem.categoria,
                descricao: apiItem.descricao,
                valor: parseFloat(apiItem.valor),
                foto: apiItem.fotoBase64 || '',
                sinc: 1
            };

            const localItem = localMap.get(id);
            if (!localItem || localItem.sinc === 1) {
                await store.put(apiData);
            } else {
                console.log(`Item ${id} possui alteração local não enviada. Mantendo local.`);
            }
        }

        // 4. Agora, envia todos os itens locais com sinc === 0 para a API
        const unsynced = lancamentos.filter(l => l.sinc === 0);
        console.log('Itens locais não sincronizados:', unsynced.length);

        for (const item of unsynced) {
            // Verifica se o ID já existe na API para decidir entre create ou update
            const existe = await verificarExistenciaNaAPI(item.id);
            const action = existe ? 'update' : 'create';

            const payload = {
                action: action,
                id: item.id,
                data: item.data,
                categoria: item.categoria,
                descricao: item.descricao,
                valor: item.valor,
                tipo: item.tipo,
                temFoto: item.foto ? 'Sim' : 'Não',
                fotoBase64: item.foto || ''
            };

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const result = await response.json();
                if (result.meta && result.meta.status >= 400) {
                    throw new Error(result.meta.error || 'Erro na API');
                }
                // Marca como sincronizado
                item.sinc = 1;
                await store.put(item);
                console.log(`Item ${item.id} ${action}do com sucesso.`);
            } catch (err) {
                console.warn('Erro ao enviar item', item.id, err);
                alert(`Falha ao sincronizar item ${item.descricao}. Verifique sua conexão e a planilha.`);
            }
        }

        await tx.complete;
        console.log('Sincronização concluída');
        // Recarrega os dados do IndexedDB para refletir as mudanças
        carregarDados();
    } catch (err) {
        console.error('Erro na sincronização:', err);
        alert('Erro na sincronização. Verifique se a planilha tem a coluna "fotoBase64".');
    }
}

// Registra Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}