const fs = require('fs');
const file = 'src/pages/Clientes.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add Lucide icons Download, Upload
content = content.replace("Search, Filter, MoreHorizontal, UserCheck, Phone, X, Plus, Trash2, Users", "Search, Filter, MoreHorizontal, UserCheck, Phone, X, Plus, Trash2, Users, Download, Upload");

// Add state for importing
const stateAdd = `
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);`;
content = content.replace("const [searchTerm, setSearchTerm] = useState('');", "const [searchTerm, setSearchTerm] = useState('');" + stateAdd);

// Needs useRef import
content = content.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect, useRef } from 'react';");

// Add export/import functions
const methodsAdd = `
  const handleExportMissing = () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    window.location.href = \`/api/contatos/export-missing/\${user.matricula}\`;
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/contatos/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      alert(data.message);
      // Opcional: Recarregar dados se precisar
    } catch (err) {
      console.error(err);
      alert('Erro ao importar arquivo');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredClientes = clientes.filter(c => {`;
content = content.replace("const filteredClientes = clientes.filter(c => {", methodsAdd);

// Add buttons to UI
const oldUI = `        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Carteira de Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie seus clientes e visualize o mix de compras.</p>
        </div>
        
        <div className="flex items-center gap-3">`;

const newUI = `        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Carteira de Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie seus clientes e visualize o mix de compras.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleExportMissing}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={16} /> Exportar Pendentes
          </button>
          
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportFile} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Upload size={16} /> {importing ? 'Importando...' : 'Importar CSV'}
          </button>`;

content = content.replace(oldUI, newUI);

fs.writeFileSync(file, content);
console.log("Clientes.tsx modificado.");
