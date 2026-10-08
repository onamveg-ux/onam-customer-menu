import React, { useState, useEffect } from 'react';

export default function OnamDashboard() {
  const [activeView, setActiveView] = useState('FOH');
  const [kdsViewMode, setKdsViewMode] = useState('tickets'); // 'tickets', 'bulk', 'stock'
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update clock every 10 seconds for late warnings and stock countdowns
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // 1. Menu is now stateful with base prep times and stock properties
  const [menuItems, setMenuItems] = useState([
    { id: 1, name: 'Masala Dosa', price: 80, prepTime: 5, inStock: true, availableAt: null },
    { id: 2, name: 'Idli (Set of 3)', price: 50, prepTime: 3, inStock: true, availableAt: null },
    { id: 3, name: 'Ghee Roast', price: 100, prepTime: 6, inStock: true, availableAt: null },
    { id: 4, name: 'Onam Sadya', price: 250, prepTime: 10, inStock: true, availableAt: null },
    { id: 5, name: 'Paneer Butter Masala', price: 180, prepTime: 8, inStock: true, availableAt: null },
    { id: 6, name: 'Filter Coffee', price: 30, prepTime: 2, inStock: true, availableAt: null }
  ]);

  // --- PREDICTIVE WAIT TIME ALGORITHM ---
  const calculateEstimatedWait = () => {
    if (currentTicket.length === 0) return 0;
    
    const basePrepTime = Math.max(...currentTicket.map(item => item.prepTime));
    let pendingItemsCount = 0;
    
    orders.forEach(order => {
      if (order.status === 'new' || order.status === 'prep') {
        pendingItemsCount += order.items.filter(item => !item.isReady).length;
      }
    });

    // Add 30 seconds (0.5 mins) per item currently holding in the kitchen
    return Math.ceil(basePrepTime + (pendingItemsCount * 0.5));
  };

  const getAvailabilityText = (item) => {
    if (item.inStock) return `₹${item.price}`;
    if (!item.availableAt) return 'Out of Stock (86)';
    const minutesLeft = Math.ceil((item.availableAt - currentTime) / 60000);
    return minutesLeft > 0 ? `Back in ${minutesLeft}m` : 'Refreshing...';
  };

  // --- STOCK MANAGER FUNCTIONS ---
  const toggleStock = (itemId) => {
    setMenuItems(menuItems.map(item => 
      item.id === itemId ? { ...item, inStock: !item.inStock, availableAt: null } : item
    ));
  };

  const setAvailabilityTimer = (itemId, minutes) => {
    setMenuItems(menuItems.map(item => 
      item.id === itemId ? { ...item, inStock: false, availableAt: Date.now() + (minutes * 60000) } : item
    ));
  };

  // --- STANDARD FOH & KDS FUNCTIONS ---
  const addToTicket = (item) => {
    if (item.inStock) setCurrentTicket([...currentTicket, { ...item, uniqueId: Date.now(), isReady: false }]);
  };

  const removeFromBody = (uniqueId) => {
    setCurrentTicket(currentTicket.filter(item => item.uniqueId !== uniqueId));
  };

  const sendToKitchen = () => {
    if (currentTicket.length === 0) return alert('Ticket is empty!');
    if (!tableNumber) return alert('Please enter a table number!');

    const newOrder = {
      id: Math.floor(Math.random() * 10000),
      table: tableNumber,
      items: currentTicket,
      status: 'new',
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setOrders([...orders, newOrder]);
    setCurrentTicket([]);
    setTableNumber('');
  };

  const updateOrderStatus = (orderId, newStatus) => setOrders(orders.map(order => order.id === orderId ? { ...order, status: newStatus } : order));
  const toggleItemReady = (orderId, itemUniqueId) => {
    setOrders(orders.map(order => order.id === orderId ? { ...order, items: order.items.map(item => item.uniqueId === itemUniqueId ? { ...item, isReady: !item.isReady } : item) } : order));
  };
  const clearOrder = (orderId) => setOrders(orders.filter(order => order.id !== orderId));
  const getBulkTotals = () => {
    const totals = {};
    orders.forEach(order => order.status !== 'ready' && order.items.forEach(item => {
      if (!item.isReady) totals[item.name] = (totals[item.name] || 0) + 1;
    }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  };
  const getOrderWaitStatus = (timestamp) => {
    const elapsedMinutes = (currentTime - timestamp) / 60000;
    if (elapsedMinutes >= 15) return { class: 'bg-red-100 border-red-500', text: 'text-red-700', label: 'LATE' };
    if (elapsedMinutes >= 10) return { class: 'bg-orange-100 border-orange-500', text: 'text-orange-700', label: 'WARNING' };
    return { class: 'bg-white border-gray-300', text: 'text-gray-500', label: 'ON TIME' };
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl font-bold tracking-wide">ONAM VEG 🌿</h1>
        <div className="flex gap-2">
          <button onClick={() => setActiveView('FOH')} className={`px-6 py-2 rounded font-bold transition-colors ${activeView === 'FOH' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>FOH</button>
          <button onClick={() => setActiveView('KDS')} className={`px-6 py-2 rounded font-bold transition-colors ${activeView === 'KDS' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>KDS</button>
        </div>
      </nav>

      <main className="p-4 flex-grow flex flex-col">
        {activeView === 'FOH' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Menu Items</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToTicket(item)}
                    disabled={!item.inStock}
                    className={`p-4 h-28 border rounded-lg text-lg flex flex-col items-center justify-center transition-colors shadow-sm ${item.inStock ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 font-semibold active:bg-blue-200' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
                  >
                    <span>{item.name}</span>
                    <span className={`text-sm mt-1 ${item.inStock ? 'text-gray-600' : 'text-red-500 font-bold'}`}>{getAvailabilityText(item)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col h-[80vh]">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Current Ticket</h2>
              <div className="mb-4">
                <input type="text" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="w-full border-2 border-gray-300 rounded p-3 text-xl font-bold" placeholder="Table No." />
              </div>
              <div className="flex-grow overflow-y-auto mb-4 border rounded bg-gray-50 p-2">
                {currentTicket.length === 0 ? (
                  <p className="text-gray-400 text-center mt-10">Ticket is empty</p>
                ) : (
                  <ul className="space-y-2">
                    {currentTicket.map((item) => (
                      <li key={item.uniqueId} className="flex justify-between items-center p-2 bg-white border rounded shadow-sm">
                        <span className="font-semibold text-lg">{item.name}</span>
                        <button onClick={() => removeFromBody(item.uniqueId)} className="text-red-500 font-bold px-3 py-1 rounded border border-red-200">X</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              <div className="border-t pt-4 mt-auto">
                <div className="text-center bg-orange-50 border border-orange-200 text-orange-800 p-2 rounded-lg font-bold mb-3">
                  Predictive Prep Time: {calculateEstimatedWait()} mins
                </div>
                <button onClick={sendToKitchen} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xl py-4 rounded-lg shadow-md transition-colors">
                  SEND TO KITCHEN
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded shadow border">
              <h2 className="text-2xl font-bold text-gray-800">Live Kitchen Operations</h2>
              <div className="flex gap-2 bg-gray-200 p-1 rounded">
                <button onClick={() => setKdsViewMode('tickets')} className={`px-4 py-2 rounded font-bold ${kdsViewMode === 'tickets' ? 'bg-white shadow' : 'text-gray-600'}`}>Tickets</button>
                <button onClick={() => setKdsViewMode('bulk')} className={`px-4 py-2 rounded font-bold ${kdsViewMode === 'bulk' ? 'bg-white shadow' : 'text-gray-600'}`}>Bulk Prep</button>
                <button onClick={() => setKdsViewMode('stock')} className={`px-4 py-2 rounded font-bold ${kdsViewMode === 'stock' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Stock Manager</button>
              </div>
            </div>

            {kdsViewMode === 'stock' ? (
              <div className="bg-white p-6 rounded-lg shadow border flex-grow overflow-y-auto">
                <h3 className="text-xl font-bold mb-6 text-gray-700 border-b pb-2">86 & Stock Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems.map(item => (
                    <div key={item.id} className={`p-4 rounded-lg border-2 ${item.inStock ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-xl">{item.name}</span>
                        <span className={`px-2 py-1 rounded text-sm font-bold ${item.inStock ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                          {item.inStock ? 'IN STOCK' : '86 (OUT)'}
                        </span>
                      </div>
                      
                      {!item.inStock && item.availableAt && (
                        <div className="text-center font-bold text-orange-600 mb-3 bg-white p-2 rounded border border-orange-200">
                          Resumes in {Math.ceil((item.availableAt - currentTime) / 60000)} mins
                        </div>
                      )}

                      <div className="space-y-2 mt-4">
                        <button onClick={() => toggleStock(item.id)} className={`w-full py-2 rounded font-bold transition-colors ${item.inStock ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
                          {item.inStock ? 'MARK OUT OF STOCK (86)' : 'RESTOCK IMMEDIATELY'}
                        </button>
                        {item.inStock && (
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setAvailabilityTimer(item.id, 15)} className="bg-orange-100 hover:bg-orange-200 text-orange-800 py-1 rounded text-sm font-bold border border-orange-300">Pause 15m</button>
                            <button onClick={() => setAvailabilityTimer(item.id, 30)} className="bg-orange-100 hover:bg-orange-200 text-orange-800 py-1 rounded text-sm font-bold border border-orange-300">Pause 30m</button>
                            <button onClick={() => setAvailabilityTimer(item.id, 60)} className="bg-orange-100 hover:bg-orange-200 text-orange-800 py-1 rounded text-sm font-bold border border-orange-300">Pause 1h</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : kdsViewMode === 'bulk' ? (
              <div className="bg-white p-6 rounded-lg shadow border flex-grow">
                <h3 className="text-xl font-bold mb-6 text-gray-700 border-b pb-2">Pending Items</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {getBulkTotals().map(([name, count]) => (
                    <div key={name} className="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg text-center shadow-sm">
                      <div className="text-4xl font-black text-blue-700 mb-2">{count}</div>
                      <div className="text-xl font-semibold text-gray-800">{name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow h-[75vh]">
                <div className="bg-gray-200 p-3 rounded-lg flex flex-col">
                  <h3 className="font-bold text-lg mb-3 bg-red-600 text-white p-2 rounded text-center shadow">NEW ORDERS</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter(o => o.status === 'new').map(order => {
                      const waitStatus = getOrderWaitStatus(order.timestamp);
                      return (
                        <div key={order.id} className={`p-4 rounded shadow-md border-l-8 ${waitStatus.class}`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-xl">Table: {order.table}</span>
                            <div className="text-right">
                              <div className="text-sm text-gray-800 font-bold">{order.timeFormatted}</div>
                            </div>
                          </div>
                          <ul className="mb-4 space-y-2">
                            {order.items.map((item) => (
                              <li key={item.uniqueId} onClick={() => toggleItemReady(order.id, item.uniqueId)} className={`p-2 rounded cursor-pointer border flex justify-between items-center ${item.isReady ? 'bg-green-100 border-green-300 text-gray-500 line-through' : 'bg-gray-50'}`}>
                                <span className="font-medium text-lg">{item.name}</span>
                                {item.isReady && <span className="text-green-600 font-bold text-sm">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'prep')} className="w-full bg-yellow-400 font-bold py-3 rounded">START PREPARING ➡️</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-gray-200 p-3 rounded-lg flex flex-col">
                  <h3 className="font-bold text-lg mb-3 bg-yellow-400 text-black p-2 rounded text-center shadow">PREPARING</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter(o => o.status === 'prep').map(order => {
                      return (
                        <div key={order.id} className={`p-4 rounded shadow-md border-l-8 bg-white border-gray-300`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-xl">Table: {order.table}</span>
                            <div className="text-sm text-gray-800 font-bold">{order.timeFormatted}</div>
                          </div>
                          <ul className="mb-4 space-y-2">
                            {order.items.map((item) => (
                              <li key={item.uniqueId} onClick={() => toggleItemReady(order.id, item.uniqueId)} className={`p-2 rounded cursor-pointer border flex justify-between items-center ${item.isReady ? 'bg-green-100 border-green-300 text-gray-500 line-through' : 'bg-gray-50'}`}>
                                <span className="font-medium text-lg">{item.name}</span>
                                {item.isReady && <span className="text-green-600 font-bold text-sm">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'ready')} className="w-full bg-green-500 text-white font-bold py-3 rounded">MARK ALL READY ➡️</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-gray-200 p-3 rounded-lg flex flex-col">
                  <h3 className="font-bold text-lg mb-3 bg-green-600 text-white p-2 rounded text-center shadow">READY</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter(o => o.status === 'ready').map(order => (
                      <div key={order.id} className="bg-white p-4 rounded shadow-md border-l-8 border-green-500 opacity-90">
                        <span className="font-black text-xl block border-b pb-2 mb-2">Table: {order.table}</span>
                        <ul className="mb-4 text-lg font-medium text-gray-500 line-through">
                          {order.items.map((item) => <li key={item.uniqueId}>• {item.name}</li>)}
                        </ul>
                        <button onClick={() => clearOrder(order.id)} className="w-full bg-gray-700 text-white font-bold py-3 rounded">CLEAR ORDER ✖</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}