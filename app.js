// ============================================
// CONFIGURAÇÃO - ALTERE AQUI!
// ============================================
const API_URL = 'https://script.google.com/macros/s/AKfycbycxDj4mmekmrcelSJq0vO4um88FGlp1T3OlWzU6bA1lJowiQI1hfZj-hNTmT8GOjEy/exec'; // Sua URL (já está correta)

// ============================================
// BANCO DE DADOS LOCAL (IndexedDB)
// ============================================
const DB_NAME = 'orcamento_db';
const DB_VERSION = 2;
const STORE_NAME = 'lancamentos';

let db;
let lancamentos = [];
let tipoSelecionado = 'Receita';
let fotoBase64Temp = null;
let itemEditandoId = null;
let termoPesquisa = '';

// Inicializar IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('sincronizado', 'sincronizado');
                store.createIndex('data', 'data');
            }
        };
    });
}

// Adicionar lançamento local
async function addLancamentoLocal(lancamento) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        if (!lancamento.id) {
            lancamento.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        lancamento.sincronizado = 0;
        
        const request = store.put(lancamento);
        request.onsuccess = () => resolve(lancamento);
        request.onerror = () => reject(request.error);
    });
}

// Atualizar lançamento local
async function atualizarLancamentoLocal(lancamento) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(lancamento);
        request.onsuccess = () => resolve(lancamento);
        request.onerror = () => reject(request.error);
    });
}

// Listar lançamentos locais
async function listarLancamentosLocal() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const dados = request.result.sort((a, b) => 
                new Date(b.data) - new Date(a.data)
            );
            resolve(dados);
        };
        request.onerror = () => reject(request.error);
    });
}

// Buscar não sincronizados
async function getNaoSincronizados() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('sincronizado');
        const request = index.getAll(0);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Marcar como sincronizado
async function marcarSincronizado(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            if (item) {
                item.sincronizado = 1;
                store.put(item).onsuccess = () => resolve();
            } else {
                resolve();
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// Remover lançamento local
async function removerLancamentoLocal(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============================================
// FUNÇÕES DA API
// ============================================

async function fetchDaAPI() {
    if (!navigator.onLine) return [];
    try {
        const response = await fetch(`${API_URL}?action=list`);
        const result = await response.json();
        if (result.meta.status === 200) {
            return result.data || [];
        }
        return [];
    } catch (error) {
        console.error('Erro ao buscar da API:', error);
        return [];
    }
}

async function sincronizarComAPI() {
    if (!navigator.onLine) return;
    try {
        const naoSincronizados = await getNaoSincronizados();
        for (const item of naoSincronizados) {
            if (item.id.toString().startsWith('local_')) {
                // Novo registro
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'create',
                        data: item.data,
                        categoria: item.categoria,
                        descricao: item.descricao,
                        valor: item.valor,
                        tipo: item.tipo,
                        temFoto: item.temFoto || 'Não',
                        fotoBase64: item.fotoBase64 || ''
                    })
                });
                const result = await response.json();
                if (result.meta.status === 201) {
                    await marcarSincronizado(item.id);
                }
            } else {
                // Atualização
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'update',
                        id: item.id,
                        data: item.data,
                        categoria: item.categoria,
                        descricao: item.descricao,
                        valor: item.valor,
                        tipo: item.tipo,
                        temFoto: item.temFoto || 'Não',
                        fotoBase64: item.fotoBase64 || ''
                    })
                });
                const result = await response.json();
                if (result.meta.status === 200) {
                    await marcarSincronizado(item.id);
                }
            }
        }
        await carregarDados();
    } catch (error) {
        console.error('Erro na sincronização:', error);
    }
}

async function carregarDados() {
    lancamentos = await listarLancamentosLocal();
    if (navigator.onLine) {
        const dadosAPI = await fetchDaAPI();
        for (const itemAPI of dadosAPI) {
            const existe = lancamentos.some(l => l.id == itemAPI.id);
            if (!existe) {
                await addLancamentoLocal({
                    ...itemAPI,
                    sincronizado: 1
                });
            }
        }
        lancamentos = await listarLancamentosLocal();
    }
    atualizarInterface();
}

// ============================================
// CÁLCULOS
// ============================================
function calcularTotais() {
    let receitas = 0, despesas = 0;
    lancamentos.forEach(item => {
        const valor = parseFloat(item.valor) || 0;
        if (item.tipo === 'Receita') receitas += valor;
        else despesas += valor;
    });
    return { receitas, despesas, saldo: receitas - despesas };
}

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataStr) {
    if (!dataStr) return '';
    const data = new Date(dataStr);
    return data.toLocaleDateString('pt-BR');
}

// ============================================
// INTERFACE
// ============================================
let currentTab = 'resumo';

function atualizarInterface() {
    const content = document.getElementById('content');
    const totais = calcularTotais();
    
    const statusEl = document.getElementById('status');
    statusEl.textContent = navigator.onLine ? 'Online' : 'Offline';
    statusEl.className = `status ${navigator.onLine ? 'online' : 'offline'}`;
    
    if (currentTab === 'resumo') {
        renderResumo(content, totais);
    } else if (currentTab === 'lista') {
        renderLista(content, totais);
    }
}

function lancamentosFiltrados() {
    if (!termoPesquisa) return lancamentos;
    return lancamentos.filter(item =>
        (item.descricao && item.descricao.toLowerCase().includes(termoPesquisa.toLowerCase())) ||
        (item.categoria && item.categoria.toLowerCase().includes(termoPesquisa.toLowerCase()))
    );
}

function renderResumo(content, totais) {
    const filtrados = lancamentosFiltrados();
    const recentes = filtrados.slice(0, 5);
    
    content.innerHTML = `
        <div class="saldo-card">
            <div class="saldo-label">Saldo Atual</div>
            <div class="saldo-valor ${totais.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo'}">
                ${formatarMoeda(totais.saldo)}
            </div>
            <div class="resumo-row">
                <div class="resumo-item">
                    <div class="resumo-label">Receitas</div>
                    <div class="resumo-valor receita">${formatarMoeda(totais.receitas)}</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-label">Despesas</div>
                    <div class="resumo-valor despesa">${formatarMoeda(totais.despesas)}</div>
                </div>
            </div>
        </div>
        
        <div class="btn-group">
            <button class="btn btn-primary" onclick="mostrarForm('Receita')">➕ Receita</button>
            <button class="btn btn-primary" onclick="mostrarForm('Despesa')">➖ Despesa</button>
        </div>
        
        <div class="lista-title">
            <span>📋 Últimos lançamentos</span>
            <input type="text" class="search-input" placeholder="Pesquisar..." value="${termoPesquisa}" oninput="termoPesquisa = this.value; atualizarInterface()">
        </div>
        ${recentes.length === 0 ? 
            '<div style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum lançamento</div>' : 
            recentes.map(item => `
                <div class="lancamento-item" data-id="${item.id}">
                    <div class="lancamento-foto">
                        ${item.fotoBase64 ? `<img src="${item.fotoBase64}" alt="foto">` : '📄'}
                    </div>
                    <div class="lancamento-info">
                        <div class="lancamento-descricao">${item.descricao}</div>
                        <div class="lancamento-data">${formatarData(item.data)} • ${item.categoria}</div>
                    </div>
                    <div class="lancamento-valor ${item.tipo === 'Receita' ? 'receita' : 'despesa'}">
                        ${formatarMoeda(item.valor)}
                    </div>
                    <div class="acoes">
                        <button onclick="editarLancamento('${item.id}')">✏️</button>
                        <button onclick="excluirLancamento('${item.id}')">🗑️</button>
                    </div>
                </div>
            `).join('')
        }
    `;
}

function renderLista(content, totais) {
    const filtrados = lancamentosFiltrados();
    
    content.innerHTML = `
        <div style="background: white; border-radius: 16px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-around;">
                <div><span class="receita">📈 ${formatarMoeda(totais.receitas)}</span></div>
                <div><span class="despesa">📉 ${formatarMoeda(totais.despesas)}</span></div>
                <div><strong>💰 ${formatarMoeda(totais.saldo)}</strong></div>
            </div>
        </div>
        <div class="lista-title">
            <span>📋 Todos lançamentos</span>
            <input type="text" class="search-input" placeholder="Pesquisar..." value="${termoPesquisa}" oninput="termoPesquisa = this.value; atualizarInterface()">
        </div>
        ${filtrados.length === 0 ?
            '<div style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum lançamento</div>' :
            filtrados.map(item => `
                <div class="lancamento-item" data-id="${item.id}">
                    <div class="lancamento-foto">
                        ${item.fotoBase64 ? `<img src="${item.fotoBase64}" alt="foto">` : '📄'}
                    </div>
                    <div class="lancamento-info">
                        <div class="lancamento-descricao">${item.descricao}</div>
                        <div class="lancamento-data">${formatarData(item.data)} • ${item.categoria}</div>
                    </div>
                    <div class="lancamento-valor ${item.tipo === 'Receita' ? 'receita' : 'despesa'}">
                        ${formatarMoeda(item.valor)}
                    </div>
                    <div class="acoes">
                        <button onclick="editarLancamento('${item.id}')">✏️</button>
                        <button onclick="excluirLancamento('${item.id}')">🗑️</button>
                    </div>
                </div>
            `).join('')
        }
    `;
}

// ============================================
// FORMULÁRIO
// ============================================

function mostrarForm(tipo = 'Receita', itemParaEditar = null) {
    tipoSelecionado = tipo;
    document.getElementById('btnReceita').classList.toggle('active', tipo === 'Receita');
    document.getElementById('btnDespesa').classList.toggle('active', tipo === 'Despesa');
    
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('data').value = hoje;
    document.getElementById('categoria').value = 'Outros';
    document.getElementById('descricao').value = '';
    document.getElementById('valor').value = '';
    document.getElementById('fotoPreview').innerHTML = '<span>📸 Toque para adicionar foto</span>';
    fotoBase64Temp = null;
    itemEditandoId = null;
    
    if (itemParaEditar) {
        document.getElementById('data').value = itemParaEditar.data;
        document.getElementById('categoria').value = itemParaEditar.categoria;
        document.getElementById('descricao').value = itemParaEditar.descricao;
        document.getElementById('valor').value = itemParaEditar.valor;
        tipoSelecionado = itemParaEditar.tipo;
        document.getElementById('btnReceita').classList.toggle('active', itemParaEditar.tipo === 'Receita');
        document.getElementById('btnDespesa').classList.toggle('active', itemParaEditar.tipo === 'Despesa');
        if (itemParaEditar.fotoBase64) {
            document.getElementById('fotoPreview').innerHTML = `<img src="${itemParaEditar.fotoBase64}" alt="Foto">`;
            fotoBase64Temp = itemParaEditar.fotoBase64;
        }
        itemEditandoId = itemParaEditar.id;
    }
    
    document.getElementById('formModal').classList.add('visible');
}

function fecharForm() {
    document.getElementById('formModal').classList.remove('visible');
}

// Evento de foto
document.getElementById('fotoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('fotoPreview').innerHTML = `<img src="${event.target.result}" alt="Foto">`;
            fotoBase64Temp = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

async function salvarLancamento() {
    const data = document.getElementById('data').value;
    const categoria = document.getElementById('categoria').value || 'Outros';
    const descricao = document.getElementById('descricao').value;
    const valor = parseFloat(document.getElementById('valor').value);
    
    if (!data || !descricao || isNaN(valor) || valor <= 0) {
        alert('Preencha todos os campos obrigatórios');
        return;
    }
    
    const lancamento = {
        data,
        categoria,
        descricao,
        valor,
        tipo: tipoSelecionado,
        temFoto: fotoBase64Temp ? 'Sim' : 'Não',
        fotoBase64: fotoBase64Temp || null
    };
    
    if (itemEditandoId) {
        lancamento.id = itemEditandoId;
        lancamento.sincronizado = 0;
        await atualizarLancamentoLocal(lancamento);
    } else {
        await addLancamentoLocal(lancamento);
    }
    
    fecharForm();
    
    if (navigator.onLine) {
        await sincronizarComAPI();
    } else {
        await carregarDados();
    }
}

function editarLancamento(id) {
    const item = lancamentos.find(l => l.id == id);
    if (item) {
        mostrarForm(item.tipo, item);
    }
}

async function excluirLancamento(id) {
    if (confirm('Tem certeza que deseja excluir?')) {
        await removerLancamentoLocal(id);
        await carregarDados();
    }
}

// ============================================
// EVENTOS E INICIALIZAÇÃO
// ============================================

document.getElementById('btnReceita')?.addEventListener('click', () => {
    tipoSelecionado = 'Receita';
    document.getElementById('btnReceita').classList.add('active');
    document.getElementById('btnDespesa').classList.remove('active');
});

document.getElementById('btnDespesa')?.addEventListener('click', () => {
    tipoSelecionado = 'Despesa';
    document.getElementById('btnDespesa').classList.add('active');
    document.getElementById('btnReceita').classList.remove('active');
});

document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        if (currentTab === 'adicionar') {
            mostrarForm();
            currentTab = 'resumo';
            document.querySelector('[data-tab="resumo"]').classList.add('active');
        } else {
            atualizarInterface();
        }
    });
});

window.addEventListener('online', async () => {
    await sincronizarComAPI();
});

window.addEventListener('offline', () => {
    atualizarInterface();
});

initDB().then(async () => {
    await carregarDados();
});
