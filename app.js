const API_URL = 'https://script.google.com/macros/s/AKfycbzDQKaKjDgQh0UKCwWeE1AZC9vm3ZnEduFSYkt7VQsqlfaL9z02cno29IZRDOCZOxU6/exec';
const DB_NAME = 'financas_v101'; 
const STORE = 'dados';

let db, chartInstance = null, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

const req = indexedDB.open(DB_NAME, 2); // versão 2 para novo esquema
req.onupgradeneeded = e => {
    const store = e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    // Criar índice para filtrar deletados rapidamente (opcional)
    store.createIndex('deleted', '_deleted');
};
req.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregarLocal();
};

function carregarLocal() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        sincronizar();
    };
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    // Ignorar itens marcados como deletados
    const ativos = lancamentos.filter(i => !i._deleted);
    const filtrados = ativos.filter(i => i.data.substring(0, 7) === mesAtual);
    
    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;
        const dataFormatada = item.data.split('T')[0].split('-').reverse().join('/');
        
        lista.innerHTML += `
            <div class="item">
                <img class="mini-foto" src="${item.foto || 'https://via.placeholder.com/50'}" 
                     onclick="window.open(this.src)" onerror="this.src='https://via.placeholder.com/50'">
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <span>${item.categoria}</span>
                    <small>${dataFormatada}</small>
                </div>
                <div class="acoes">
                    <b style="color:${item.tipo === 'Receita' ? 'var(--s)' : 'var(--d)'}">R$ ${v.toFixed(2)}</b>
                    <div>
                        <button class="btn-acao" onclick="editar('${item.id}')">Editar</button>
                        <button class="btn-acao btn-excluir" onclick="excluir('${item.id}')">Excluir</button>
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

async function sincronizar() {
    if (!navigator.onLine) {
        document.getElementById('statusLabel').innerText = "⚠️ Offline";
        return;
    }
    document.getElementById('statusLabel').innerText = "🔄 Sincronizando...";

    // 1. Processar pendentes (sinc = 0) e deletados
    const txPendentes = db.transaction(STORE, 'readwrite');
    const storePendentes = txPendentes.objectStore(STORE);
    const todos = await new Promise((resolve, reject) => {
        const req = storePendentes.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });

    for (let item of todos) {
        // Se for deletado, enviar ação de delete
        if (item._deleted) {
            try {
                await fetch(API_URL, { 
                    method: 'POST', 
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'delete', id: item.id }) 
                });
                // Remover definitivamente do banco local
                storePendentes.delete(item.id);
            } catch (err) {
                console.log("Falha ao deletar item", item.id);
            }
        }
        // Se for novo ou editado (sinc = 0 e não deletado)
        else if (item.sinc === 0) {
            try {
                await fetch(API_URL, { 
                    method: 'POST', 
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(item) 
                });
                item.sinc = 1;
                storePendentes.put(item);
            } catch (err) {
                console.log("Falha ao enviar item", item.id);
            }
        }
    }

    // 2. Buscar dados da planilha e fazer merge
    try {
        const res = await fetch(API_URL);
        const json = await res.json();
        if (json && json.data) {
            const txMerge = db.transaction(STORE, 'readwrite');
            const storeMerge = txMerge.objectStore(STORE);
            
            // Mapa dos itens do servidor
            const serverMap = new Map();
            json.data.forEach(item => {
                serverMap.set(item.id.toString(), {
                    ...item,
                    valor: parseFloat(item.valor),
                    sinc: 1,
                    _deleted: false // garantia
                });
            });

            // Obter todos os locais novamente (pode ter mudado durante o loop anterior)
            const locais = await new Promise((resolve, reject) => {
                const req = storeMerge.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });

            // Para cada item local, decidir o que fazer
            for (let local of locais) {
                const serverItem = serverMap.get(local.id);
                
                // Se local está marcado como deletado, mantemos (já foi processado ou falhou)
                if (local._deleted) {
                    continue;
                }
                
                if (serverItem) {
                    // Item existe nos dois lugares
                    if (local.sinc === 1) {
                        // Já sincronizado: servidor é mais recente (sobrescreve)
                        storeMerge.put(serverItem);
                    } else {
                        // local.sinc === 0: alteração local ainda não enviada, preservar local
                        // (não faz nada, mantém local)
                    }
                    // Remove do map para depois inserir os que não existem localmente
                    serverMap.delete(local.id);
                } else {
                    // Item só existe localmente, não está no servidor
                    // Se sinc === 1, algo errado (item que sumiu do servidor), mantemos local
                    // Se sinc === 0, é novo, mantemos
                    // Não faz nada
                }
            }

            // Inserir itens do servidor que não existem localmente
            for (let serverItem of serverMap.values()) {
                storeMerge.put(serverItem);
            }

            // Atualizar lancamentos e tela
            txMerge.oncomplete = () => {
                const txRead = db.transaction(STORE, 'readonly');
                txRead.objectStore(STORE).getAll().onsuccess = e => {
                    lancamentos = e.target.result;
                    atualizarTela();
                    document.getElementById('statusLabel').innerText = "✅ Sincronizado";
                };
            };
        }
    } catch (e) {
        document.getElementById('statusLabel').innerText = "⚠️ Offline";
    }
}

// COMPRESSÃO DA CÂMERA
document.getElementById('inputFoto').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 250;
            const scale = MAX / Math.max(img.width, img.height);
            canvas.width = img.width * scale; 
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            fotoBase64 = canvas.toDataURL('image/jpeg', 0.4);
            
            document.getElementById('imgPreview').src = fotoBase64;
            document.getElementById('imgPreview').style.display = 'block';
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
};

function editar(id) {
    const item = lancamentos.find(i => i.id === id);
    if (!item) return;
    editId = id;
    document.getElementById('formTitle').innerText = "Editar Item";
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('data').value = item.data.split('T')[0];
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    fotoBase64 = item.foto;
    if (fotoBase64) {
        document.getElementById('imgPreview').src = fotoBase64;
        document.getElementById('imgPreview').style.display = 'block';
    } else {
        document.getElementById('imgPreview').style.display = 'none';
    }
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function excluir(id) {
    if (!confirm("Excluir este item?")) return;
    
    // Marcar como deletado no banco (não remove ainda)
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const item = lancamentos.find(i => i.id === id);
    if (item) {
        item._deleted = true;
        item.sinc = 0; // pendente
        store.put(item);
    }
    tx.oncomplete = () => {
        carregarLocal(); // recarrega e filtra os deletados
        sincronizar(); // tenta enviar a exclusão imediatamente se online
    };
}

function salvar() {
    const item = {
        id: editId || "ID" + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'S/D',
        valor: parseFloat(document.getElementById('valor').value) || 0,
        foto: fotoBase64 || '',
        sinc: 0,
        _deleted: false
    };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarLocal();
    };
}

function fecharTudo() { 
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active')); 
}

// Botões
document.getElementById('tabAdd').onclick = () => { 
    editId = null; 
    fotoBase64 = null;
    document.getElementById('formTitle').innerText = "Novo Item"; 
    document.getElementById('imgPreview').style.display = 'none';
    document.getElementById('modalForm').classList.add('active'); 
    document.getElementById('overlay').classList.add('active'); 
};
document.getElementById('tabResumo').onclick = () => { 
    document.getElementById('view-resumo').style.display='block'; 
    document.getElementById('view-grafico').style.display='none'; 
};
document.getElementById('tabGrafico').onclick = () => { 
    document.getElementById('view-resumo').style.display='none'; 
    document.getElementById('view-grafico').style.display='block'; 
    renderGrafico(); 
};
document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); }; // só atualiza tela, não recarrega tudo

// Exportar CSV
document.getElementById('btnExportar').onclick = () => {
    const ativos = lancamentos.filter(i => !i._deleted && i.data.startsWith(mesAtual));
    let csv = "Data;Tipo;Categoria;Descricao;Valor\n";
    ativos.forEach(i => {
        csv += `${i.data};${i.tipo};${i.categoria};${i.descricao};${i.valor}\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${mesAtual}.csv`;
    link.click();
};

function renderGrafico() {
    const ativos = lancamentos.filter(i => !i._deleted);
    const filtrados = ativos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const caps = {};
    filtrados.forEach(i => caps[i.categoria] = (caps[i.categoria] || 0) + i.valor);
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(caps),
            datasets: [{ data: Object.values(caps), backgroundColor: ['#007bff','#28a745','#ffc107','#dc3545','#6610f2'] }]
        }
    });
}

// Sincroniza também quando volta para o App
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
});

window.addEventListener('online', sincronizar);
