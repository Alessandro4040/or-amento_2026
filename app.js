const API_URL = 'https://script.google.com/macros/s/AKfycbzDQKaKjDgQh0UKCwWeE1AZC9vm3ZnEduFSYkt7VQsqlfaL9z02cno29IZRDOCZOxU6/exec';
// Atualizado para limpar os erros antigos que estão travando seu Chrome
const DB_NAME = 'financas_v100'; 
const STORE = 'dados';

let db, chartInstance = null, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);

const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
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
    const filtrados = lancamentos.filter(i => i.data.substring(0, 7) === mesAtual);
    
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
    if (!navigator.onLine) return;
    document.getElementById('statusLabel').innerText = "🔄 Sincronizando...";
    
    // 1. Enviar Pendentes (Isolado para que o erro de um não trave o aplicativo)
    const pendentes = lancamentos.filter(l => l.sinc === 0);
    for (let p of pendentes) {
        try {
            await fetch(API_URL, { 
                method: 'POST', 
                mode: 'no-cors', // Evita bloqueios do Safari
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(p) 
            });
            p.sinc = 1;
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(p);
        } catch (err) {
            console.log("Falha ao subir um item, tentando o próximo...");
        }
    }

    // 2. Baixar Atualizados da Planilha
    try {
        const res = await fetch(API_URL);
        const json = await res.json();
        if (json && json.data) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            store.clear();
            json.data.forEach(item => {
                store.put({ ...item, id: item.id.toString(), valor: parseFloat(item.valor), sinc: 1 });
            });
            tx.oncomplete = () => {
                document.getElementById('statusLabel').innerText = "✅ Sincronizado";
                
                // Atualiza a tela sem loop infinito
                const txRead = db.transaction(STORE, 'readonly');
                txRead.objectStore(STORE).getAll().onsuccess = e => {
                    lancamentos = e.target.result;
                    atualizarTela();
                };
            };
        }
    } catch (e) {
        document.getElementById('statusLabel').innerText = "⚠️ Offline";
    }
}

// COMPRESSÃO AGRESSIVA DA CÂMERA DO IPHONE
document.getElementById('inputFoto').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Reduz bruscamente para 250 pixels para não dar erro na planilha do Google
            const MAX = 250;
            const scale = MAX / Math.max(img.width, img.height);
            canvas.width = img.width * scale; 
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Qualidade em 0.4 (40%) reduz o tamanho absurdamente
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
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        // Exclui no servidor sem travar a tela
        fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'delete', id: id }) 
        });
        carregarLocal();
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
        sinc: 0
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
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; carregarLocal(); };

// Exportar CSV
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
            datasets: [{ data: Object.values(caps), backgroundColor: ['#007bff','#28a745','#ffc107','#dc3545','#6610f2'] }]
        }
    });
}

// Sincroniza também quando volta para o App
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
});
