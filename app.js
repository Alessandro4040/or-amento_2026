const API_URL = 'https://script.google.com/macros/s/AKfycbycxDj4mmekmrcelSJq0vO4um88FGlp1T3OlWzU6bA1lJowiQI1hfZj-hNTmT8GOjEy/exec';
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
                mode: 'no-cors',
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

            // Se já existe localmente, precisamos decidir qual versão é mais recente?
            // Como não temos timestamp, vamos dar prioridade ao servidor (API) para manter consistência.
            // Mas se o local tem sinc=0 (não enviado), significa que foi alterado offline e deve ser enviado depois.
            // Por enquanto, apenas sobrescrevemos com o da API se o local não for mais recente? 
            // Para simplificar, vamos sempre sobrescrever com o da API, pois a API é a fonte da verdade.
            // Porém, se o local foi alterado offline (sinc=0) e ainda não subiu, precisamos manter e depois enviar.
            // Então, só sobrescrevemos se o local estiver sincronizado (sinc=1) ou não existir.
            // Vamos implementar: se local existe e sinc === 0, NÃO sobrescrevemos (pois tem alteração local não enviada).
            // Se local não existe ou sinc === 1, podemos sobrescrever com o da API.
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
            const payload = {
                action: 'create', // ou update? Vamos usar create, mas se já existir na API, pode dar conflito. Melhor usar 'update' se soubermos que existe.
                // Como não sabemos, vamos tentar enviar e a API pode tratar.
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
                await fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors', // não podemos ler resposta, mas assumimos sucesso
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                // Marca como sincronizado
                item.sinc = 1;
                await store.put(item);
                console.log('Item enviado:', item.id);
            } catch (err) {
                console.warn('Erro ao enviar item', item.id, err);
            }
        }

        await tx.complete;
        console.log('Sincronização concluída');
        // Recarrega os dados do IndexedDB para refletir as mudanças
        carregarDados();
    } catch (err) {
        console.error('Erro na sincronização:', err);
    }
}

// Registra Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}
