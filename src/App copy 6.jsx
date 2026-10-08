import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { QRCodeSVG } from 'qrcode.react';

// --- CONFIGURATION DATABASES ---
const RESTAURANT_LAYOUT = [
  {
    name: 'Main Dining Floor',
    tables: [
      { id: 'T-1', seats: 6 }, { id: 'T-2', seats: 6 },
      { id: 'T-3', seats: 6 }, { id: 'T-4', seats: 6 },
      { id: 'T-5', seats: 6 }, { id: 'T-6', seats: 4 },
      { id: 'T-7', seats: 4 }, { id: 'T-8', seats: 4 },
      { id: 'T-9', seats: 4 }, { id: 'T-10', seats: 4 }
    ]
  },
  {
    name: 'Rooms',
    tables: [
      { id: 'Room 1', seats: 2 }, { id: 'Room 2', seats: 2 },
      { id: 'Room 3', seats: 2 }, { id: 'Room 4', seats: 2 }
    ]
  }
];

const MODIFIER_MAP = {
  'Beverages': ['Strong', 'Light', 'Less Sugar', 'No Sugar', 'Extra Sugar', 'Without Milk'],
  'Dosa': ['Extra Crispy (Roast)', 'Soft Cooked', 'Separate Sambar/Dip', 'Less Oil', 'Jain (No Onion/Garlic)'],
  'Idli/Puttu': ['Separate Sambar/Dip', 'Extra Chutney'],
  'Curry': ['Less Spicy', 'Extra Spicy', 'Jain (No Onion/Garlic)', 'Vegan (Oil Only)'],
  'Breads': ['Cut into Pieces', 'Less Oil / Dry'],
  'Rice & Biriyani': ['Extra Spicy', 'Less Spicy', 'No Garnish', 'Extra Raita'],
  'Default': ['Less Spicy', 'Extra Spicy', 'Jain', 'No Garnish', 'Less Sugar', 'No Sugar']
};

const TIME_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Drinks', 'All'];

// Helper to auto-select menu based on the current hour
const getInitialTimeSlot = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return 'Breakfast'; 
  if (hour >= 11 && hour < 16) return 'Lunch';    
  if (hour >= 16 && hour <= 23) return 'Dinner';  
  return 'All'; 
};

export default function OnamDashboard() {
  // --- STATE MANAGEMENT ---
  const [activeView, setActiveView] = useState('FOH'); 
  const [kdsViewMode, setKdsViewMode] = useState('tickets'); 
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Floor Plan & Modifiers State
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [selectedTableForSeats, setSelectedTableForSeats] = useState(null);
  const [selectedItemForMod, setSelectedItemForMod] = useState(null);
  
  // Menu & Filtering State
  const [menuItems, setMenuItems] = useState([]);
  const [activeTimeSlot, setActiveTimeSlot] = useState(getInitialTimeSlot());
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [loadError, setLoadError] = useState(null);
  
  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState('en-IN'); 
  
  // Historical Summary States
  const [dailyHistory, setDailyHistory] = useState([]);
  const [isShowingHistory, setIsShowingHistory] = useState(false);

  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7iToziMLVb9Mrx7kWD3HkhTISA7ouA0f1M0f3UQu0z6L70oKB9dLOhoHP7iR9CY249qyiDU19KSgr/pub?output=csv';

  const dynamicCategories = ['All', ...new Set(menuItems.map(item => item.category))];

  // 1. System Clock
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(clock);
  }, []);

  // 2. Fetch Live Menu
  const fetchMenu = () => {
    setIsLoadingMenu(true);
    setLoadError(null);

    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        try {
          const liveMenu = results.data
            .filter((row) => {
              if (!row.active) return false;
              const val = String(row.active).trim().toUpperCase();
              return val === 'TRUE' || val === '1' || val === 'YES';
            })
            .map((row, index) => {
              const rawSlots = row.time_slots ? String(row.time_slots).toLowerCase() : '';
              const slotsArray = rawSlots ? rawSlots.split(',').map(s => s.trim()) : ['breakfast', 'lunch', 'dinner', 'drinks'];

              return {
                id: index + 1,
                sku: row.category_id ? `${row.category_id}_${index + 1}` : `SKU_${index + 1}`,
                name: row.item_name ? row.item_name.trim() : 'Unnamed Dish',
                category: row.category_name ? row.category_name.trim() : 'General',
                price: parseFloat(String(row.price).replace(/[^0-9.]/g, '')) || 0,
                spicy: String(row.spicy).trim().toUpperCase() === 'TRUE',
                timeSlots: slotsArray,
                prepTime: 5,
                inStock: true,
                availableAt: null
              };
            });

          setMenuItems(liveMenu);
          setIsLoadingMenu(false);
        } catch (err) {
          console.error('Data parsing error:', err);
          setLoadError('Failed to parse menu data.');
          setIsLoadingMenu(false);
        }
      },
      error: (error) => {
        console.error('Network error loading CSV:', error);
        setLoadError('Could not fetch data.');
        setIsLoadingMenu(false);
      }
    });
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // --- VOICE SEARCH INTEGRATION ---
  const startVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported by this browser. Please use Google Chrome on the tablet.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLang; 
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsListening(false);
    };
    
    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  // --- API INTEGRATIONS (Node.js Backend) ---
  const printReceipt = async (orderData, printType) => {
    try {
      await fetch('http://localhost:3000/api/print/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderData, type: printType })
      });
      alert('Sent to printer!');
    } catch (error) {
      console.error('Printing failed:', error);
      alert('Could not reach the local print server.');
    }
  };

  const fetchDayWiseSummary = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/reports/day-wise');
      const data = await response.json();
      
      if (response.ok && data.success) {
        setDailyHistory(data.history);
        setIsShowingHistory(true);
      }
    } catch (error) {
      console.error('Failed to load historical data:', error);
      alert('Could not reach the PostgreSQL database server.');
    }
  };

  // --- WAIT TIMES & AVAILABILITY ---
  const calculateEstimatedWait = () => {
    if (currentTicket.length === 0) return 0;
    const basePrepTime = Math.max(...currentTicket.map((item) => item.prepTime || 5));
    let pendingItemsCount = 0;

    orders.forEach((order) => {
      if (order.status === 'new' || order.status === 'prep') {
        pendingItemsCount += order.items.filter((item) => !item.isReady).length;
      }
    });

    return Math.ceil(basePrepTime + pendingItemsCount * 0.5);
  };

  const getAvailabilityText = (item) => {
    if (item.inStock) return `₹${item.price}`;
    if (!item.availableAt) return '86 (Out of Stock)';
    const minutesLeft = Math.ceil((item.availableAt - currentTime) / 60000);
    return minutesLeft > 0 ? `Back in ${minutesLeft}m` : 'Restocked';
  };

  const toggleStock = (itemId) => setMenuItems((prev) => prev.map((item) => item.id === itemId ? { ...item, inStock: !item.inStock, availableAt: null } : item));
  const setAvailabilityTimer = (itemId, minutes) => setMenuItems((prev) => prev.map((item) => item.id === itemId ? { ...item, inStock: false, availableAt: Date.now() + minutes * 60000 } : item));

  // --- FOH TICKETING & MODIFIERS ---
  const openModifierModal = (item) => {
    if (item.inStock) setSelectedItemForMod({ ...item, modifiers: [] });
  };

  const toggleModifier = (modName) => {
    setSelectedItemForMod((prev) => ({
      ...prev,
      modifiers: prev.modifiers.includes(modName) ? prev.modifiers.filter((m) => m !== modName) : [...prev.modifiers, modName]
    }));
  };

  const confirmAndAddToTicket = () => {
    if (!selectedItemForMod) return;
    const parsedSeat = tableNumber.includes('Seat') ? parseInt(tableNumber.match(/\d+/g).pop()) : 'Shared';

    setCurrentTicket((prev) => [
      ...prev,
      { ...selectedItemForMod, uniqueId: `${Date.now()}-${Math.random()}`, isReady: false, seat: parsedSeat }
    ]);
    setSelectedItemForMod(null);
  };

  const removeFromBody = (uniqueId) => setCurrentTicket((prev) => prev.filter((item) => item.uniqueId !== uniqueId));

  const sendToKitchen = async () => {
    if (currentTicket.length === 0) return alert('Ticket is empty!');
    if (!tableNumber.trim()) return alert('Please select a Table or Room!');

    const parsedTable = tableNumber.split(' (')[0]; 
    const totalAmount = currentTicket.reduce((sum, item) => sum + item.price, 0);

    const newOrder = {
      id: Math.floor(1000 + Math.random() * 9000),
      table: parsedTable,
      items: currentTicket,
      totalAmount,
      status: 'new',
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setOrders((prev) => [...prev, newOrder]);
    
    try {
      await fetch('http://localhost:3000/api/orders/foh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: parsedTable, items: currentTicket, totalAmount })
      });
    } catch (e) {
      console.warn("Backend disconnected. Order saved locally only.", e);
    }

    setCurrentTicket([]);
    setTableNumber('');
  };

  const updateOrderStatus = (orderId, newStatus) => setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)));
  
  const toggleItemReady = (orderId, itemUniqueId) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id === orderId) {
          return {
            ...order,
            items: order.items.map((item) => item.uniqueId === itemUniqueId ? { ...item, isReady: !item.isReady } : item)
          };
        }
        return order;
      })
    );
  };

  const clearOrder = (orderId) => setOrders((prev) => prev.filter((order) => order.id !== orderId));

  const getBulkTotals = () => {
    const totals = {};
    orders.forEach((order) => {
      if (order.status !== 'ready') {
        order.items.forEach((item) => {
          if (!item.isReady) totals[item.name] = (totals[item.name] || 0) + 1;
        });
      }
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  };

  const getOrderWaitStatus = (timestamp) => {
    const elapsedMinutes = (currentTime - timestamp) / 60000;
    if (elapsedMinutes >= 15) return { class: 'bg-red-50 border-red-500', text: 'text-red-700', label: 'DELAYED' };
    if (elapsedMinutes >= 10) return { class: 'bg-orange-50 border-orange-500', text: 'text-orange-700', label: 'WARNING' };
    return { class: 'bg-white border-gray-300', text: 'text-gray-500', label: 'ON TIME' };
  };

  // --- MULTI-FILTER LOGIC ---
  const filteredMenu = menuItems.filter(item => {
    const matchTime = activeTimeSlot === 'All' || item.timeSlots.includes(activeTimeSlot.toLowerCase());
    const matchCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTime && matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col relative">
      
      {/* --- VISUAL FLOOR PLAN & SEAT PICKER MODAL --- */}
      {showTablePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">{selectedTableForSeats ? `Managing ${selectedTableForSeats.id}` : 'Floor Plan Overview'}</h2>
                <p className="text-slate-300 text-sm">{selectedTableForSeats ? 'Assign items to table or specific seat' : 'Live table occupancy status'}</p>
              </div>
              <div className="flex gap-3">
                {selectedTableForSeats && (
                  <button onClick={() => setSelectedTableForSeats(null)} className="bg-slate-700 hover:bg-slate-600 px-4 py-1.5 rounded-lg font-bold text-sm">⬅ Back to Floor</button>
                )}
                <button onClick={() => { setShowTablePicker(false); setSelectedTableForSeats(null); }} className="text-slate-400 hover:text-white font-bold text-2xl px-2">✕</button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow bg-gray-100">
              {!selectedTableForSeats ? (
                <div className="space-y-8">
                  {RESTAURANT_LAYOUT.map((zone) => (
                    <div key={zone.name}>
                      <h3 className="text-lg font-bold text-gray-800 border-b-2 border-gray-300 pb-2 mb-4">{zone.name}</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        {zone.tables.map((table) => {
                          const activeOrders = orders.filter(o => o.table === table.id);
                          const hasPendingItems = activeOrders.some(o => o.status === 'new' || o.status === 'prep');
                          const hasReadyItems = activeOrders.some(o => o.status === 'ready');
                          let tableColor = 'bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:shadow-md';
                          if (hasPendingItems) tableColor = 'bg-red-50 border-red-400 text-red-800 shadow-sm';
                          else if (hasReadyItems) tableColor = 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm';

                          return (
                            <button key={table.id} onClick={() => setSelectedTableForSeats(table)} className={`aspect-square rounded-xl font-black text-lg transition-all border-2 flex flex-col items-center justify-center ${tableColor}`}>
                              <span>{table.id}</span>
                              <span className="text-[10px] font-semibold text-gray-500 mt-1">{table.seats} Seats</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="max-w-2xl mx-auto">
                  <button 
                    onClick={() => { setTableNumber(`${selectedTableForSeats.id}`); setShowTablePicker(false); setSelectedTableForSeats(null); }}
                    className="w-full mb-8 bg-blue-600 text-white font-black text-xl py-5 rounded-xl shadow-md hover:bg-blue-700 transition-colors"
                  >
                    Assign to {selectedTableForSeats.id} (Shared Table) ➔
                  </button>
                  <div className="text-center mb-4 text-gray-500 font-bold uppercase tracking-wider text-sm">— OR Assign to Specific Seat —</div>
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 relative">
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                      {Array.from({ length: selectedTableForSeats.seats }).map((_, idx) => {
                        const seatNumber = idx + 1;
                        const seatOrders = orders.flatMap(o => o.table === selectedTableForSeats.id ? o.items : []);
                        const itemsForThisSeat = seatOrders.filter(item => item.seat === seatNumber);
                        const isPending = itemsForThisSeat.some(item => !item.isReady);
                        const isServed = itemsForThisSeat.length > 0 && itemsForThisSeat.every(item => item.isReady);

                        let seatColor = 'bg-gray-100 border-gray-300 text-gray-500 hover:bg-blue-50 hover:border-blue-400';
                        if (isPending) seatColor = 'bg-red-500 border-red-700 text-white shadow-md animate-pulse';
                        else if (isServed) seatColor = 'bg-emerald-500 border-emerald-700 text-white shadow-md';

                        return (
                          <button
                            key={seatNumber}
                            onClick={() => { setTableNumber(`${selectedTableForSeats.id} (Seat ${seatNumber})`); setShowTablePicker(false); setSelectedTableForSeats(null); }}
                            className={`p-6 rounded-full font-black text-xl transition-all border-4 flex flex-col items-center justify-center aspect-square max-w-[120px] mx-auto ${seatColor}`}
                          >
                            S-{seatNumber}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL OVERLAY FOR QUICK MODIFIERS --- */}
      {selectedItemForMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">{selectedItemForMod.name}</h2>
                <p className="text-slate-300 text-sm">Select Quick Modifiers & Instructions</p>
              </div>
              <button onClick={() => setSelectedItemForMod(null)} className="text-slate-400 hover:text-white font-bold text-2xl px-2">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(MODIFIER_MAP[selectedItemForMod.category] || MODIFIER_MAP['Default']).map(mod => {
                  const isSelected = selectedItemForMod.modifiers.includes(mod);
                  return (
                    <button
                      key={mod}
                      onClick={() => toggleModifier(mod)}
                      className={`p-3 rounded-xl font-bold text-sm text-left transition-all border-2 ${isSelected ? 'bg-blue-100 border-blue-500 text-blue-900 shadow-inner' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-100'}`}
                    >
                      {isSelected && <span className="mr-2">✓</span>} {mod}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-gray-50 p-5 border-t flex justify-between items-center">
              <div className="text-gray-600 font-semibold">{selectedItemForMod.modifiers.length} modifiers applied</div>
              <button onClick={confirmAndAddToTicket} className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black px-8 py-3 rounded-xl shadow-md text-lg transition-colors">Confirm & Add ➔</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Application Bar */}
      <nav className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-wider text-amber-400">ONAM VEG</h1>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded font-semibold hidden sm:block">POS Engine</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveView('FOH')} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeView === 'FOH' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>FOH</button>
          <button onClick={() => setActiveView('KDS')} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeView === 'KDS' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>KDS</button>
          <button onClick={() => setActiveView('SUMMARY')} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeView === 'SUMMARY' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>SUMMARY</button>
          <button onClick={() => setActiveView('QR_PRINT')} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeView === 'QR_PRINT' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>TABLE QR</button>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="p-4 flex-grow flex flex-col">
        
        {/* --- FOH VIEW --- */}
        {activeView === 'FOH' && (
          <div className="flex flex-col flex-grow">
            <div className="bg-emerald-100 border border-emerald-300 text-emerald-900 px-4 py-2 rounded-lg mb-4 flex justify-between items-center shadow-sm font-semibold">
              <span>🌟 Customer First: Resolve confusion immediately in the customer's favor. Keep calm and serve with a smile during the rush!</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
              <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                
                {/* ADVANCED MENU FILTERS */}
                <div className="flex flex-col gap-3 mb-4 border-b pb-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Menu Selection</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={fetchMenu} className="text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300">Sync Sheet</button>
                      {isLoadingMenu && <span className="text-xs text-blue-600 font-semibold animate-pulse">Syncing...</span>}
                    </div>
                  </div>

                  {/* Search Row & Voice Command */}
                  <div className="flex gap-2 w-full">
                    <input 
                      type="text" 
                      placeholder="Search items by name..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-grow border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold text-gray-800"
                    />
                    <select 
                      value={voiceLang} 
                      onChange={(e) => setVoiceLang(e.target.value)}
                      className="bg-gray-100 border border-gray-300 rounded-lg px-2 text-xs font-bold text-gray-700 outline-none"
                    >
                      <option value="en-IN">EN</option>
                      <option value="ml-IN">മലയാളം</option>
                      <option value="hi-IN">हिंदी</option>
                      <option value="bn-IN">বাংলা</option>
                    </select>
                    <button 
                      onClick={startVoiceSearch}
                      className={`px-4 rounded-lg flex items-center justify-center transition-colors ${
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      {isListening ? '🎙 Listening...' : '🎙️'}
                    </button>
                  </div>

                  {/* Filter Rows (Time & Categories) */}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {TIME_SLOTS.map(slot => (
                        <button 
                          key={slot} onClick={() => setActiveTimeSlot(slot)}
                          className={`px-3 py-1 rounded-md font-bold text-xs whitespace-nowrap transition-all ${activeTimeSlot === slot ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          🕒 {slot}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {dynamicCategories.map(cat => (
                        <button 
                          key={cat} onClick={() => setActiveCategory(cat)}
                          className={`px-3 py-1 rounded-md font-bold text-xs whitespace-nowrap transition-all border ${activeCategory === cat ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {loadError && <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{loadError}</div>}

                {filteredMenu.length === 0 && !isLoadingMenu && !loadError ? (
                  <div className="flex-grow flex items-center justify-center text-gray-400 font-semibold text-center">
                    No items found matching the current Search, Time Slot, and Category filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto max-h-[55vh] pb-4">
                    {filteredMenu.map((item) => (
                      <button
                        key={item.id} onClick={() => openModifierModal(item)} disabled={!item.inStock}
                        className={`p-3.5 h-28 border rounded-xl text-left flex flex-col justify-between transition-all ${item.inStock ? 'bg-blue-50/70 border-blue-200 hover:bg-blue-100 active:scale-95' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        <div>
                          <span className="font-bold text-sm text-gray-900 block leading-tight line-clamp-2">{item.name}</span>
                          {item.spicy && <span className="text-[10px] text-red-600 font-bold uppercase mt-0.5 block">Spicy</span>}
                        </div>
                        <span className={`text-sm font-black ${item.inStock ? 'text-gray-800' : 'text-red-500'}`}>{getAvailabilityText(item)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[75vh]">
                <h2 className="text-xl font-bold mb-3 border-b pb-2 text-gray-800">Current Ticket</h2>
                
                <button 
                  onClick={() => setShowTablePicker(true)}
                  className={`w-full border-2 rounded-lg p-3 text-lg font-black text-left flex justify-between items-center transition-colors mb-3 ${tableNumber ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-500 hover:border-blue-400'}`}
                >
                  <span>{tableNumber ? `Selected: ${tableNumber}` : 'Tap to Select Table / Room'}</span>
                  <span>🎯</span>
                </button>
                
                <div className="flex-grow overflow-y-auto mb-3 border rounded-lg bg-gray-50 p-2 space-y-2">
                  {currentTicket.length === 0 ? (
                    <p className="text-gray-400 text-center mt-14 font-medium">Select dishes to begin</p>
                  ) : (
                    currentTicket.map((item) => (
                      <div key={item.uniqueId} className="flex justify-between items-start p-2.5 bg-white border border-gray-200 rounded-lg shadow-xs">
                        <div className="pr-2">
                          <div className="font-bold text-gray-800 text-sm">{item.name} {item.seat !== 'Shared' && <span className="text-xs text-blue-600 ml-1">(S-{item.seat})</span>}</div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {item.modifiers.map((mod, idx) => <li key={idx} className="text-[11px] font-black text-red-600 uppercase leading-none">+ {mod}</li>)}
                            </ul>
                          )}
                          <div className="text-xs text-gray-500 mt-1">₹{item.price}</div>
                        </div>
                        <button onClick={() => removeFromBody(item.uniqueId)} className="text-red-500 font-bold hover:bg-red-50 px-2 py-1 rounded border border-red-200 text-xs shrink-0">✕</button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t pt-3 mt-auto space-y-3">
                  <div className="flex justify-between text-lg font-black text-gray-800">
                    <span>Total Bill:</span>
                    <span>₹{currentTicket.reduce((sum, item) => sum + item.price, 0)}</span>
                  </div>
                  <div className="text-center bg-orange-50 border border-orange-200 text-orange-800 py-2 px-3 rounded-lg text-xs font-bold">Predictive Prep Time: {calculateEstimatedWait()} mins</div>
                  <button onClick={sendToKitchen} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base py-3.5 rounded-xl shadow">SEND TO KITCHEN ➔</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- KDS VIEW --- */}
        {activeView === 'KDS' && (
          <div className="flex flex-col h-full flex-grow">
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-black text-gray-800">Kitchen Display Workflow</h2>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button onClick={() => setKdsViewMode('tickets')} className={`px-4 py-1.5 rounded-md font-bold text-sm ${kdsViewMode === 'tickets' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Active</button>
                <button onClick={() => setKdsViewMode('bulk')} className={`px-4 py-1.5 rounded-md font-bold text-sm ${kdsViewMode === 'bulk' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Bulk</button>
                <button onClick={() => setKdsViewMode('stock')} className={`px-4 py-1.5 rounded-md font-bold text-sm ${kdsViewMode === 'stock' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Stock (86)</button>
              </div>
            </div>

            {kdsViewMode === 'stock' && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-grow overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className={`p-4 rounded-xl border-2 ${item.inStock ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-base text-gray-900">{item.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-black ${item.inStock ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'}`}>{item.inStock ? 'ACTIVE' : 'PAUSED'}</span>
                      </div>
                      {!item.inStock && item.availableAt && <div className="text-center font-bold text-orange-700 text-xs mb-3 bg-white p-1 rounded border border-orange-200">Resumes in {Math.ceil((item.availableAt - currentTime) / 60000)} mins</div>}
                      <div className="space-y-2">
                        <button onClick={() => toggleStock(item.id)} className={`w-full py-2 rounded-lg font-bold text-xs text-white ${item.inStock ? 'bg-red-500' : 'bg-emerald-600'}`}>{item.inStock ? 'Mark Out of Stock (86)' : 'Reactivate'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kdsViewMode === 'bulk' && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-grow">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {getBulkTotals().map(([name, count]) => (
                    <div key={name} className="bg-blue-50 border-2 border-blue-200 p-5 rounded-xl text-center">
                      <div className="text-4xl font-black text-blue-700 mb-1">{count}</div>
                      <div className="text-sm font-bold text-gray-800">{name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kdsViewMode === 'tickets' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow h-[75vh]">
                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-red-600 text-white p-2 rounded-lg text-center">NEW ORDERS</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'new').sort((a, b) => a.timestamp - b.timestamp).map((order) => {
                      const waitStatus = getOrderWaitStatus(order.timestamp);
                      return (
                        <div key={order.id} className={`p-4 rounded-xl shadow-sm border-l-8 ${waitStatus.class}`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                            <div className="text-right"><div className="text-xs text-gray-800 font-bold">{order.timeFormatted}</div></div>
                          </div>
                          <ul className="mb-4 space-y-1.5">
                            {order.items.map((item) => (
                              <li key={item.uniqueId} onClick={() => toggleItemReady(order.id, item.uniqueId)} className={`p-2 rounded-lg cursor-pointer border flex flex-col items-start ${item.isReady ? 'bg-emerald-100 border-emerald-300 text-gray-400 line-through' : 'bg-white'}`}>
                                <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                {item.modifiers && item.modifiers.length > 0 && <div className="mt-1 pl-2">{item.modifiers.map((mod, idx) => <div key={idx} className="text-xs font-black text-red-600 uppercase">* {mod}</div>)}</div>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'prep')} className="w-full bg-amber-400 text-gray-950 font-black py-2.5 rounded-lg text-xs">START PREPARING ➔</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-amber-500 text-white p-2 rounded-lg text-center">IN PROGRESS</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'prep').sort((a, b) => a.timestamp - b.timestamp).map((order) => {
                      return (
                        <div key={order.id} className="p-4 rounded-xl shadow-sm border-l-8 bg-white border-gray-300">
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                            <div className="text-xs text-gray-800 font-bold">{order.timeFormatted}</div>
                          </div>
                          <ul className="mb-4 space-y-1.5">
                            {order.items.map((item) => (
                              <li key={item.uniqueId} onClick={() => toggleItemReady(order.id, item.uniqueId)} className={`p-2 rounded-lg cursor-pointer border flex flex-col items-start ${item.isReady ? 'bg-emerald-100 border-emerald-300 text-gray-400 line-through' : 'bg-white'}`}>
                                <div className="flex justify-between w-full">
                                  <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                  {item.isReady && <span className="text-[10px] font-black text-emerald-700 bg-emerald-200 px-1 py-0.5 rounded">READY</span>}
                                </div>
                                {item.modifiers && item.modifiers.length > 0 && !item.isReady && <div className="mt-1 pl-2">{item.modifiers.map((mod, idx) => <div key={idx} className="text-xs font-black text-red-600 uppercase">* {mod}</div>)}</div>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'ready')} className="w-full bg-emerald-600 text-white font-black py-2.5 rounded-lg text-xs">MARK COMPLETED ➔</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-emerald-600 text-white p-2 rounded-lg text-center">READY FOR SERVICE</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'ready').sort((a, b) => a.timestamp - b.timestamp).map((order) => (
                      <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border-l-8 border-emerald-500">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                          <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                        </div>
                        <ul className="mb-4 space-y-1 text-xs font-medium text-gray-500 line-through">
                          {order.items.map((item) => <li key={item.uniqueId}>• {item.name}</li>)}
                        </ul>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => printReceipt(order, 'KOT')} className="flex-1 bg-blue-100 text-blue-800 font-bold py-2 rounded-lg text-xs border border-blue-300">🖨️ Print</button>
                          <button onClick={() => clearOrder(order.id)} className="flex-1 bg-gray-700 text-white font-bold py-2 rounded-lg text-xs">DISMISS ✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- SUMMARY / Z-REPORT VIEW --- */}
        {activeView === 'SUMMARY' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex-grow overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Current Shift Summary</h2>
              <button onClick={() => printReceipt({ table: 'DAY SUMMARY', items: [], totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0) }, 'SUMMARY')} className="bg-gray-800 text-white px-4 py-2 rounded font-bold hover:bg-gray-700 transition-colors shadow-sm">
                🖨️ Print Report
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl shadow-sm">
                <div className="text-emerald-800 font-bold mb-1">Shift Revenue</div>
                <div className="text-4xl font-black text-emerald-600">₹{orders.reduce((sum, order) => sum + order.totalAmount, 0)}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl shadow-sm">
                <div className="text-blue-800 font-bold mb-1">Tickets Processed</div>
                <div className="text-4xl font-black text-blue-600">{orders.length}</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 p-6 rounded-xl shadow-sm">
                <div className="text-purple-800 font-bold mb-1">Items Prepared</div>
                <div className="text-4xl font-black text-purple-600">{orders.reduce((sum, order) => sum + order.items.length, 0)}</div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Shift Itemized Sales</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {Object.entries(orders.reduce((acc, order) => { order.items.forEach(item => { acc[item.name] = (acc[item.name] || 0) + 1; }); return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <div key={name} className="flex justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                  <span className="font-semibold text-gray-700 text-sm">{name}</span>
                  <span className="font-black text-gray-900 text-sm">x{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- QR CODE GENERATOR VIEW --- */}
        {activeView === 'QR_PRINT' && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex-grow overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Table QR Code Standees</h2>
                <p className="text-gray-500 text-sm mt-1">Print this page and place codes on the tables.</p>
              </div>
              <button 
                onClick={() => window.print()}
                className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2"
              >
                🖨️ Print All Codes
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 print:grid-cols-3 print:gap-4">
              {RESTAURANT_LAYOUT.flatMap(zone => zone.tables).map(table => {
                const orderUrl = 'https://docs.google.com/spreadsheets/d/15FywfLnU_4KSVDY_BWUvlxTfb6zbLgpuvY-bD_GLVeM/edit?usp=sharing';

                return (
                  <div key={table.id} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 print:break-inside-avoid print:bg-white print:border-solid print:border-gray-800">
                    <h3 className="text-2xl font-black text-amber-500 mb-1 tracking-wider uppercase">ONAM VEG</h3>
                    <p className="text-xs font-bold text-gray-500 mb-4 tracking-widest">SCAN TO ORDER</p>
                    
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-4">
                      <QRCodeSVG 
                        value={orderUrl} 
                        size={160}
                        level="H" 
                        includeMargin={true}
                      />
                    </div>
                    
                    <div className="bg-slate-900 text-white w-full text-center py-2 rounded-lg">
                      <span className="font-black text-xl">{table.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}