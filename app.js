const API_URL = 'https://script.google.com/macros/s/AKfycbzoX0E20LBtp7RUdqaD1EC16593tK7R7ppm24rewRF_sBQThKOGaTDAuVXdhYKV35hJ/exec';
const DB_NAME = 'financas_v101';
const STORE = 'dados';

let db, chartInstance = null, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

function atualizarStatusRede() {
    const statusLabel = document.getElementById('statusLabel');
    if (navigator.onLine) {
        statusLabel.innerText = "🌐 Online";
        statusLabel.className = "status online";
        sincronizar();
    } else {
        statusLabel.innerText = "⚠️ Offline";
        statusLabel.className = "status offline";
    }
}
window.addEventListener('online', atualizarStatusRede);
window.addEventListener('offline', atualizarStatusRede);

const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
req.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    atualizarStatusRede();
    carregarLocal();
};

function carregarLocal() {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    t.onsuccess = () => {
        lancamentos = t.result;
        renderizar();
    };
}

async function sincronizar() {
    if (!navigator.onLine) return;
    try {
        const res = await fetch(API_URL);
        const json = await res.json();
        if (json.data) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            // Mapeia os dados vindo do Google para o formato local
            json.data.forEach(item => {
                store.put({
                    id: item.id,
                    data: item.data,
                    categoria: item.categoria,
                    descricao: item.descricao,
                    valor: parseFloat(item.valor),
                    tipo: item.tipo,
                    foto: item.fotoBase64 || item.foto // Prioriza a string Base64
                });
            });
            tx.oncomplete = carregarLocal;
        }
    } catch (e) { console.error("Erro na sincronização:", e); }
}

function renderizar() {
    const lista = document.getElementById('lista');
    lista.innerHTML = '';
    let totalR = 0, totalD = 0;

    const filtrados = lancamentos
        .filter(i => i.data.startsWith(mesAtual))
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    filtrados.forEach(i => {
        if (i.tipo === 'Receita') totalR += i.valor; else totalD += i.valor;

        const div = document.createElement('div');
        div.className = 'item';
        // Verifica se existe string de imagem válida
        const temFoto = i.foto && i.foto.startsWith('data:image');
        
        div.innerHTML = `
            <div style="flex:1">
                <small>${i.data.split('-').reverse().join('/')}</small><br>
                <strong>${i.categoria}</strong><br>
                <small>${i.descricao}</small>
            </div>
            <div style="text-align:right; margin-right:10px">
                <strong style="color:var(--${i.tipo === 'Receita' ? 's' : 'd'})">
                    ${i.tipo === 'Receita' ? '+' : '-'} R$ ${i.valor.toFixed(2)}
                </strong><br>
                ${temFoto ? `<img src="${i.foto}" class="thumb" onclick="zoom('${i.foto}')">` : ''}
            </div>
            <div class="actions">
                <button onclick="editar('${i.id}')">✏️</button>
                <button onclick="deletar('${i.id}')">🗑️</button>
            </div>
        `;
        lista.appendChild(div);
    });

    document.getElementById('resumo').innerHTML = `
        <div class="card">Total Receitas<br><strong style="color:var(--s)">R$ ${totalR.toFixed(2)}</strong></div>
        <div class="card">Total Despesas<br><strong style="color:var(--d)">R$ ${totalD.toFixed(2)}</strong></div>
        <div class="card">Saldo<br><strong>R$ ${(totalR - totalD).toFixed(2)}</strong></div>
    `;
    renderGrafico();
}

function salvar() {
    const btn = document.getElementById('btnSalvar');
    btn.disabled = true;
    btn.innerText = "Salvando...";

    const dado = {
        id: editId || 'ID' + Date.now(),
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value,
        descricao: document.getElementById('descricao').value,
        valor: parseFloat(document.getElementById('valor').value),
        tipo: document.getElementById('tipo').value,
        foto: fotoBase64
    };

    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(dado);
    tx.oncomplete = () => {
        if (navigator.onLine) {
            fetch(API_URL, { method: 'POST', body: JSON.stringify(dado) })
                .then(() => { sincronizar(); fecharTudo(); });
        } else {
            carregarLocal();
            fecharTudo();
        }
    };
}

// --- Funções de UI ---
document.getElementById('inputFoto').onchange = e => {
    const reader = new FileReader();
    reader.onload = () => {
        fotoBase64 = reader.result;
        const img = document.getElementById('imgPreview');
        img.src = fotoBase64;
        img.style.display = 'block';
    };
    reader.readAsDataURL(e.target.files[0]);
};

function deletar(id) {
    if (!confirm("Excluir?")) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        if (navigator.onLine) fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', id }) }).then(sincronizar);
        else carregarLocal();
    };
}

function editar(id) {
    const item = lancamentos.find(i => i.id === id);
    editId = item.id;
    document.getElementById('data').value = item.data;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    document.getElementById('tipo').value = item.tipo;
    fotoBase64 = item.foto;
    if (fotoBase64) {
        const img = document.getElementById('imgPreview');
        img.src = fotoBase64;
        img.style.display = 'block';
    }
    abrirModal();
}

function abrirModal() {
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.getElementById('modalForm').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    editId = null;
    fotoBase64 = null;
    document.getElementById('imgPreview').style.display = 'none';
    document.getElementById('btnSalvar').disabled = false;
    document.getElementById('btnSalvar').innerText = "Salvar";
    // Limpa campos
    ['categoria', 'descricao', 'valor'].forEach(id => document.getElementById(id).value = '');
}

function zoom(src) {
    document.getElementById('zoomedImg').src = src;
    document.getElementById('zoomOverlay').classList.add('active');
}

function fecharZoom() {
    document.getElementById('zoomOverlay').classList.remove('active');
}

document.getElementById('tabLancamentos').onclick = () => {
    document.getElementById('viewLancamentos').style.display = 'block';
    document.getElementById('viewGrafico').style.display = 'none';
};

document.getElementById('tabGrafico').onclick = () => {
    document.getElementById('viewLancamentos').style.display = 'none';
    document.getElementById('viewGrafico').style.display = 'block';
    renderGrafico(); 
};

document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; carregarLocal(); };

document.getElementById('btnExportar').onclick = () => {
    let csv = "Data;Tipo;Categoria;Descricao;Valor\n";
    lancamentos.filter(i => i.data.startsWith(mesAtual)).forEach(i => {
        csv += `${i.data};${i.tipo};${i.categoria};${i.descricao};${i.valor}\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${mesAtual}.csv`;
    link.click();
};

function renderGrafico() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual) && i.tipo === 'Despesa');
    const caps = {};
    filtrados.forEach(i => caps[i.categoria] = (caps[i.categoria] || 0) + i.valor);
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(caps),
            datasets: [{ data: Object.values(caps), backgroundColor: ['#007bff', '#22c55e', '#ef4444', '#f59e0b', '#6366f1', '#ec4899'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}
