const API_URL = 'https://script.google.com/macros/s/AKfycbx5u1Qb4rFh4HVaqoGcV6Uy10lTavD7sdXRkJuyhLO0HEsa2FSl-8edS4wq6uLpLHCQ/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, lancamentos = [], fotoBase64 = null;
let mesAtual = new Date().toISOString().substring(0, 7);

// Inicia o Banco de Dados Local
const request = indexedDB.open(DB_NAME, 7); // Versão atualizada para limpar bugs
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};
request.onsuccess = e => {
    db = e.target.result;
    carregarDados();
};

async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        if (navigator.onLine) sincronizar();
    };
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual));
    lista.innerHTML = '';
    let rec = 0, desp = 0;

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;
        const foto = item.foto ? `<img src="${item.foto}" class="mini-foto">` : '';
        lista.innerHTML += `
            <div class="item">
                ${foto}
                <div class="info"><strong>${item.descricao}</strong><br><small>${item.categoria}</small></div>
                <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}">R$ ${v.toFixed(2)}</div>
            </div>`;
    });
    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
}

// Processa a foto com compressão
document.getElementById('inputFoto').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const max = 400;
            const scale = max / img.width;
            canvas.width = max;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
            alert("Foto pronta!");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
});

async function salvar() {
    const valorInput = document.getElementById('valor').value;
    if (!valorInput) return alert("Digite um valor!");

    const item = {
        id: 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value || new Date().toISOString().split('T')[0],
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'S/D',
        valor: parseFloat(valorInput),
        foto: fotoBase64,
        sinc: 0
    };

    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => {
        fotoBase64 = null;
        document.getElementById('modalForm').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        carregarDados();
    };
}

async function sincronizar() {
    console.log("Iniciando sincronização...");
    try {
        const unsynced = lancamentos.filter(l => l.sinc === 0);
        
        for (const item of unsynced) {
            const payload = { 
                ...item, 
                action: 'create', 
                temFoto: item.foto ? 'Sim' : 'Não', 
                fotoBase64: item.foto || '' 
            };

            await fetch(API_URL, { 
                method: 'POST', 
                mode: 'no-cors', 
                body: JSON.stringify(payload) 
            });

            // Marca como sincronizado localmente
            const tx = db.transaction(STORE, 'readwrite');
            item.sinc = 1;
            tx.objectStore(STORE).put(item);
        }

        // Busca dados da planilha para atualizar o celular
        const res = await fetch(API_URL + '?action=list');
        const json = await res.json();
        if (json.data) {
            const tx = db.transaction(STORE, 'readwrite');
            json.data.forEach(i => {
                i.sinc = 1;
                i.valor = parseFloat(i.valor);
                i.foto = i.fotoBase64;
                tx.objectStore(STORE).put(i);
            });
        }
    } catch (e) {
        console.error("Erro na sincronia:", e);
    }
}

document.getElementById('btnSalvar').onclick = salvar;
document.getElementById('tabAdd').onclick = () => {
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
};
