import React, { useState, useRef, useMemo } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon, AlertCircle, Tag, DollarSign, Calendar, FileText, PieChart, Edit3, Camera, X, Plus, Filter, Settings, ArrowUp, ArrowDown, Download } from 'lucide-react';

const apiKey = ""; // API Key จะถูกจัดการโดยระบบอัตโนมัติ

// ธีมสีพาสเทลสไตล์ผู้ชาย (ฟ้าน้ำทะเล, เทา, คราม, มิ้นต์หม่น ฯลฯ)
const PASTEL_THEMES = [
  { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', ring: 'ring-slate-300' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-300' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', ring: 'ring-cyan-300' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', ring: 'ring-indigo-300' },
  { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200', ring: 'ring-stone-300' },
  { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', ring: 'ring-sky-300' },
  { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', ring: 'ring-gray-300' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', ring: 'ring-teal-300' },
];

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  
  // State จัดการหมวดหมู่
  const [categories, setCategories] = useState(['อาหาร', 'ช้อปปิ้ง', 'โอนเงิน', 'ค่าน้ำมัน', 'อื่นๆ']);
  const [newCategory, setNewCategory] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [previewImage, setPreviewImage] = useState(null);
  
  // State สำหรับเปิด-ปิด Modal จัดการหมวดหมู่
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  // สรุปยอดค่าใช้จ่ายตามหมวดหมู่
  const summary = useMemo(() => {
    const sum = {};
    categories.forEach(cat => sum[cat] = 0);
    let total = 0;

    transactions.forEach(t => {
      if (t.status === 'success' && t.amount > 0) {
        sum[t.category] = (sum[t.category] || 0) + t.amount;
        total += t.amount;
      }
    });
    return { sum, total };
  }, [transactions, categories]);

  // ดึงธีมสีตาม Index ของหมวดหมู่
  const getTheme = (index) => PASTEL_THEMES[index % PASTEL_THEMES.length];

  // ฟังก์ชันแปลงไฟล์รูปเป็น Base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // ฟังก์ชันเรียกใช้ Gemini API พร้อมระบบ Retry
  const processImageWithGemini = async (base64Data, mimeType) => {
    const prompt = `วิเคราะห์สลิปโอนเงินนี้ ดึงข้อมูลชื่อผู้รับเงิน (payee), จำนวนเงิน (amount), วันที่ (date). 
และพยายามจัดหมวดหมู่ (category) จากชื่อผู้รับเงิน ให้ตรงกับหนึ่งในหมวดหมู่ต่อไปนี้เท่านั้น: ${categories.join(', ')}
ถ้าไม่แน่ใจให้เลือก 'อื่นๆ'

ส่งกลับมาเป็นรูปแบบ JSON เท่านั้น`;

    const base64Content = base64Data.split(',')[1];
    
    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mimeType, data: base64Content } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            payee: { type: "STRING", description: "ชื่อผู้รับเงิน หรือ ร้านค้า" },
            amount: { type: "NUMBER", description: "จำนวนเงิน" },
            date: { type: "STRING", description: "วันที่และเวลา (ถ้ามี)" },
            category: { type: "STRING", description: "หมวดหมู่ตามที่กำหนด" }
          },
          required: ["payee", "amount", "date", "category"]
        }
      }
    };

    const maxRetries = 5;
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (textResponse) {
          const parsedData = JSON.parse(textResponse);
          if (!categories.includes(parsedData.category)) {
            parsedData.category = 'อื่นๆ';
          }
          return parsedData;
        } else {
          throw new Error("No text found in response");
        }
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  };

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;

    const newTransactions = Array.from(files).map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      imageSrc: URL.createObjectURL(file),
      status: 'loading',
      payee: '',
      amount: 0,
      date: '',
      category: 'อื่นๆ'
    }));

    setTransactions(prev => [...newTransactions, ...prev]);

    for (const transaction of newTransactions) {
      try {
        const base64 = await fileToBase64(transaction.file);
        const data = await processImageWithGemini(base64, transaction.file.type);
        
        setTransactions(prev => prev.map(t => 
          t.id === transaction.id 
            ? { ...t, status: 'success', payee: data.payee || 'ไม่ระบุ', amount: data.amount || 0, date: data.date || '-', category: data.category }
            : t
        ));
      } catch (error) {
        setTransactions(prev => prev.map(t => 
          t.id === transaction.id 
            ? { ...t, status: 'error', payee: 'อ่านข้อมูลไม่สำเร็จ', category: 'อื่นๆ' }
            : t
        ));
      }
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const updateTransaction = (id, field, value) => {
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
  };

  const deleteTransaction = (id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // --- ฟังก์ชันจัดการหมวดหมู่ ---
  const handleAddCategory = () => {
    const cat = newCategory.trim();
    if (cat && !categories.includes(cat)) {
      setCategories([...categories, cat]);
      setNewCategory('');
    }
  };

  const moveCategory = (index, direction) => {
    const newCategories = [...categories];
    if (direction === -1 && index > 0) {
      // เลื่อนขึ้น
      [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
      setCategories(newCategories);
    } else if (direction === 1 && index < categories.length - 1) {
      // เลื่อนลง
      [newCategories[index + 1], newCategories[index]] = [newCategories[index], newCategories[index + 1]];
      setCategories(newCategories);
    }
  };

  const deleteCategory = (catToDelete) => {
    if (catToDelete === 'อื่นๆ') return; // ป้องกันการลบหมวดหมู่อื่นๆ
    
    // ลบออกจากรายการ
    setCategories(prev => prev.filter(c => c !== catToDelete));
    
    // ย้ายสลิปที่อยู่ในหมวดที่ถูกลบ ไปยังหมวด 'อื่นๆ'
    setTransactions(prev => prev.map(t => 
      t.category === catToDelete ? { ...t, category: 'อื่นๆ' } : t
    ));

    if (activeFilter === catToDelete) {
      setActiveFilter('All');
    }
  };

  // ฟังก์ชัน Export เป็นไฟล์ CSV (เปิดใน Excel ได้)
  const exportToExcel = () => {
    const successfulTransactions = transactions.filter(t => t.status === 'success');
    if (successfulTransactions.length === 0) return;

    // ใช้ BOM (\uFEFF) เพื่อให้ Excel อ่านภาษาไทย (UTF-8) ได้สมบูรณ์
    let csvContent = '\uFEFF'; 
    csvContent += "วันที่,ชื่อผู้รับเงิน,หมวดหมู่,จำนวนเงิน\n";

    successfulTransactions.forEach(t => {
      const date = `"${t.date || ''}"`;
      const payee = `"${(t.payee || '').replace(/"/g, '""')}"`;
      const category = `"${t.category || ''}"`;
      const amount = t.amount || 0;
      csvContent += `${date},${payee},${category},${amount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "slip_transactions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    // เปลี่ยนโครงสร้างเป็น h-screen, flex-col, overflow-hidden ให้เหมือน Application แบบ Fixed
    <div className="h-screen w-full flex flex-col text-slate-800 font-sans overflow-hidden" style={{ backgroundColor: '#eaf8f4' }}>
      
      {/* Header (Fixed) */}
      <header className="shrink-0 bg-white/90 backdrop-blur-md shadow-sm z-20 relative">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-teal-700">
            <PieChart className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">สแกนสลิปอัจฉริยะ</h1>
          </div>
          
          {/* ปุ่ม Export บน Header (แสดงเฉพาะจอมอนิเตอร์/แท็บเล็ต) */}
          <button 
            onClick={exportToExcel}
            disabled={transactions.filter(t => t.status === 'success').length === 0}
            className="hidden sm:flex items-center gap-1.5 bg-teal-50 text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </header>

      {/* Main Content (Scrollable Area) */}
      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-24">
        
        {/* สรุปยอด (Dashboard) */}
        {transactions.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-5 border border-teal-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h2 className="text-sm font-medium text-slate-500">
                สรุปค่าใช้จ่าย {activeFilter !== 'All' && <span className="text-teal-600">(กรอง: {activeFilter})</span>}
              </h2>
              
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="เพิ่มหมวดหมู่ใหม่..."
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                />
                <button 
                  onClick={handleAddCategory}
                  className="bg-teal-50 text-teal-600 p-1.5 rounded-lg hover:bg-teal-100 transition-colors"
                  title="เพิ่มหมวดหมู่"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                {/* ปุ่มจัดการหมวดหมู่ */}
                <button 
                  onClick={() => setIsManageModalOpen(true)}
                  className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                >
                  <Settings className="w-4 h-4" /> <span className="hidden sm:inline">จัดการ</span>
                </button>
                {/* ปุ่ม Export สำหรับจอมือถือ */}
                <button 
                  onClick={exportToExcel}
                  disabled={transactions.filter(t => t.status === 'success').length === 0}
                  className="sm:hidden flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export Excel"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="mb-6 flex items-center gap-3">
              <span className="text-3xl font-bold text-slate-800">
                ฿{summary.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
              {activeFilter !== 'All' && (
                <button 
                  onClick={() => setActiveFilter('All')}
                  className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-slate-200 transition-colors"
                >
                  <Filter className="w-3 h-3" /> เลิกกรอง
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categories.map((cat, idx) => {
                const theme = getTheme(idx);
                return (
                  <div 
                    key={cat} 
                    onClick={() => setActiveFilter(cat === activeFilter ? 'All' : cat)}
                    className={`rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 border 
                      ${activeFilter === cat ? `${theme.bg} ${theme.border} ring-2 ${theme.ring}` : `bg-white border-slate-100 hover:${theme.bg} hover:border-transparent`}
                    `}
                  >
                    <span className={`text-xs mb-1 ${activeFilter === cat ? theme.text : 'text-slate-500 font-medium'}`}>{cat}</span>
                    <span className={`text-sm font-bold ${activeFilter === cat ? theme.text : 'text-slate-800'}`}>
                      ฿{(summary.sum[cat] || 0).toLocaleString('th-TH')}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ส่วนอัปโหลด */}
        <section 
          className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[180px]
            ${isDragging ? 'border-teal-500 bg-teal-50/50' : 'border-teal-200 bg-white/60 hover:border-teal-400 hover:bg-white'}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="bg-teal-100 p-4 rounded-full mb-4 text-teal-600 shadow-sm">
            <Camera className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold mb-2 text-slate-700">แตะเพื่ออัปโหลด หรือถ่ายรูปสลิป</h3>
          <p className="text-sm text-slate-500">รองรับไฟล์รูปภาพสลิปโอนเงิน (เลือกได้หลายไฟล์)</p>
        </section>

        {/* รายการสลิปที่สแกน */}
        <section className="space-y-4">
          {transactions.filter(t => activeFilter === 'All' || t.category === activeFilter).map((item) => {
            const catIndex = categories.indexOf(item.category);
            const theme = catIndex !== -1 ? getTheme(catIndex) : getTheme(0);

            return (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col sm:flex-row gap-4 hover:shadow-md transition-shadow">
                
                {/* ภาพ Thumbnail */}
                <div 
                  className="w-full sm:w-32 h-40 sm:h-32 bg-slate-100 rounded-xl overflow-hidden shrink-0 relative group cursor-pointer"
                  onClick={() => setPreviewImage(item.imageSrc)}
                >
                  <img src={item.imageSrc} alt="slip" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {item.status === 'loading' && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-sm">
                      <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                    </div>
                  )}
                </div>

                {/* ข้อมูล */}
                <div className="flex-1 flex flex-col justify-between gap-3">
                  {item.status === 'loading' ? (
                    <div className="h-full flex flex-col justify-center gap-2">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div>
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
                      <p className="text-sm text-teal-600 mt-2 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> AI กำลังวิเคราะห์สลิป...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start">
                        <div className="space-y-1 w-full">
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span>{item.date}</span>
                          </div>
                          <input 
                            type="text"
                            value={item.payee}
                            onChange={(e) => updateTransaction(item.id, 'payee', e.target.value)}
                            className="font-semibold text-lg w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 focus:outline-none transition-colors text-slate-700"
                            placeholder="ชื่อผู้รับเงิน"
                          />
                        </div>
                        
                        <button 
                          onClick={() => deleteTransaction(item.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <DollarSign className="w-5 h-5 text-slate-400" />
                        <input 
                          type="number"
                          value={item.amount === 0 ? '' : item.amount}
                          onChange={(e) => updateTransaction(item.id, 'amount', Number(e.target.value))}
                          className="text-2xl font-bold w-32 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 focus:outline-none text-slate-800"
                          placeholder="0.00"
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-50">
                        <Tag className="w-4 h-4 text-slate-400" />
                        <div className="relative inline-block w-full sm:w-auto">
                          <select 
                            value={item.category}
                            onChange={(e) => updateTransaction(item.id, 'category', e.target.value)}
                            className={`appearance-none border ${theme.bg} ${theme.text} ${theme.border} py-1.5 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:${theme.ring} font-medium transition-colors`}
                          >
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 ${theme.text}`}>
                            <Edit3 className="w-3 h-3" />
                          </div>
                        </div>
                        
                        {item.status === 'error' && (
                          <span className="text-xs text-red-500 flex items-center gap-1 ml-auto">
                            <AlertCircle className="w-3 h-3" /> อ่านล้มเหลว
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {transactions.filter(t => activeFilter === 'All' || t.category === activeFilter).length === 0 && (
            <div className="text-center text-slate-400 py-12 bg-white/50 rounded-2xl border border-dashed border-slate-200">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{transactions.length === 0 ? 'ยังไม่มีรายการสลิป' : 'ไม่มีรายการสลิปในหมวดหมู่นี้'}</p>
            </div>
          )}
        </section>
        
        </div>
      </main>

      {/* Lightbox สำหรับขยายดูรูปสลิป */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4" 
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl w-full flex justify-center items-center">
            <button 
              className="absolute -top-12 right-0 md:-right-12 text-white/70 hover:text-white p-2 transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <img 
              src={previewImage} 
              alt="slip preview" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" 
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}

      {/* Modal จัดการหมวดหมู่ */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setIsManageModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" /> จัดการหมวดหมู่
              </h3>
              <button onClick={() => setIsManageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {categories.map((cat, index) => {
                  const theme = getTheme(index);
                  return (
                    <div key={cat} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-all group">
                      <div className="flex items-center gap-3">
                        {/* ป้ายสี */}
                        <div className={`w-3 h-3 rounded-full ${theme.bg} border ${theme.border}`}></div>
                        <span className="font-medium text-slate-700">{cat}</span>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => moveCategory(index, -1)}
                          disabled={index === 0}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg disabled:opacity-30"
                          title="เลื่อนขึ้น"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => moveCategory(index, 1)}
                          disabled={index === categories.length - 1}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg disabled:opacity-30"
                          title="เลื่อนลง"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <button 
                          onClick={() => deleteCategory(cat)}
                          disabled={cat === 'อื่นๆ'}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30"
                          title={cat === 'อื่นๆ' ? "หมวดหมู่นี้ลบไม่ได้" : "ลบหมวดหมู่"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
