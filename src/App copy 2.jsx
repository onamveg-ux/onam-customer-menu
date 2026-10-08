import React, { useState, useEffect } from 'react';

export default function OnamDashboard() {
  const [activeView, setActiveView] = useState('FOH');
  const [kdsViewMode, setKdsViewMode] = useState('tickets'); // 'tickets' or 'bulk'
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update the clock every 10 seconds to calculate late orders
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const menuItems = [
    { id: 1, name: 'Masala Dosa', category: 'Tiffin', price: 80 },
    { id: 2, name: 'Idli (Set of 3)', category: 'Tiffin', price: 50 },
    { id: 3, name: 'Ghee Roast', category: 'Tiffin', price: 100 },
    { id: 4, name: 'Onam Sadya', category: 'Meals', price: 250 },
    { id: 5, name: 'Paneer Butter Masala', category: 'Curry', price: 180 },
    { id: 6, name: 'Filter Coffee', category: 'Beverage', price: 30 }
  ];

  // --- FOH FUNCTIONS ---
  const addToTicket = (item) => {
    setCurrentTicket([...currentTicket, { ...item, uniqueId: Date.now(), isReady: false }]);
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

  // --- KITCHEN FUNCTIONS ---
  const updateOrderStatus = (orderId, newStatus) => {
    setOrders(orders.map(order => order.id === orderId ? { ...order, status: newStatus } : order));
  };

  const toggleItemReady = (orderId, itemUniqueId) => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        const updatedItems = order.items.map(item => 
          item.uniqueId === itemUniqueId ? { ...item, isReady: !item.isReady } : item
        );
        return { ...order, items: updatedItems };
      }
      return order;
    }));
  };

  const clearOrder = (orderId) => {
    setOrders(orders.filter(order => order.id !== orderId));
  };

  // Calculate bulk items for the kitchen
  const getBulkTotals = () => {
    const totals = {};
    orders.forEach(order => {
      if (order.status !== 'ready') {
        order.items.forEach(item => {
          if (!item.isReady) {
            totals[item.name] = (totals[item.name] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]); // Sort by highest quantity
  };

  // Helper to determine if an order is late
  const getOrderWaitStatus = (timestamp) => {
    const elapsedMinutes = (currentTime - timestamp) / 60000;
    if (elapsedMinutes >= 15) return { class: 'bg-red-100 border-red-500', text: 'text-red-700', label: 'LATE' };
    if (elapsedMinutes >= 10) return { class: 'bg-orange-100 border-orange-500', text: 'text-orange-700', label: 'WARNING' };
    return { class: 'bg-white border-gray-300', text: 'text-gray-500', label: 'ON TIME' };
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl font-bold tracking-wide">ONAM VEG 🌿</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveView('FOH')}
            className={`px-6 py-2 rounded font-bold transition-colors ${activeView === 'FOH' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            Front of House (FOH)
          </button>
          <button 
            onClick={() => setActiveView('KDS')}
            className={`px-6 py-2 rounded font-bold transition-colors ${activeView === 'KDS' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            Kitchen Display (KDS)
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="p-4 flex-grow flex flex-col">
        {activeView === 'FOH' ? (
          /* FOH VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Menu Items</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToTicket(item)}
                    className="p-4 h-24 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-lg font-semibold flex flex-col items-center justify-center transition-colors active:bg-blue-200 shadow-sm"
                  >
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col h-[80vh]">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Current Ticket</h2>
              <div className="mb-4">
                <label className="block text-sm font-bold mb-1">Table Number</label>
                <input 
                  type="text" 
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded p-3 text-xl"
                  placeholder="e.g. 4"
                />
              </div>
              <div className="flex-grow overflow-y-auto mb-4 border rounded bg-gray-50 p-2">
                {currentTicket.length === 0 ? (
                  <p className="text-gray-400 text-center mt-10 font-medium">Ticket is empty</p>
                ) : (
                  <ul className="space-y-2">
                    {currentTicket.map((item) => (
                      <li key={item.uniqueId} className="flex justify-between items-center p-3 bg-white border rounded shadow-sm">
                        <span className="font-semibold text-lg">{item.name}</span>
                        <button onClick={() => removeFromBody(item.uniqueId)} className="text-red-500 font-bold hover:bg-red-50 px-3 py-1 rounded border border-red-200">X</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t pt-4 mt-auto">
                <button 
                  onClick={sendToKitchen}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xl py-4 rounded-lg shadow-md active:bg-green-800 transition-colors"
                >
                  SEND TO KITCHEN
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* KDS VIEW */
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded shadow border">
              <h2 className="text-2xl font-bold text-gray-800">Live Kitchen Operations</h2>
              <div className="flex gap-2 bg-gray-200 p-1 rounded">
                <button 
                  onClick={() => setKdsViewMode('tickets')}
                  className={`px-4 py-2 rounded font-bold ${kdsViewMode === 'tickets' ? 'bg-white shadow' : 'text-gray-600'}`}
                >
                  Ticket View
                </button>
                <button 
                  onClick={() => setKdsViewMode('bulk')}
                  className={`px-4 py-2 rounded font-bold ${kdsViewMode === 'bulk' ? 'bg-white shadow' : 'text-gray-600'}`}
                >
                  Bulk Prep View
                </button>
              </div>
            </div>

            {kdsViewMode === 'bulk' ? (
              /* BULK PREP VIEW */
              <div className="bg-white p-6 rounded-lg shadow border flex-grow">
                <h3 className="text-xl font-bold mb-6 text-gray-700 border-b pb-2">Pending Items (Consolidated)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {getBulkTotals().map(([name, count]) => (
                    <div key={name} className="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg text-center shadow-sm">
                      <div className="text-4xl font-black text-blue-700 mb-2">{count}</div>
                      <div className="text-xl font-semibold text-gray-800">{name}</div>
                    </div>
                  ))}
                  {getBulkTotals().length === 0 && <p className="text-gray-500 text-lg col-span-full text-center mt-10">No pending items to prep.</p>}
                </div>
              </div>
            ) : (
              /* TICKET VIEW */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow h-[75vh]">
                
                {/* NEW ORDERS */}
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
                              <div className={`text-xs font-bold mt-1 ${waitStatus.text}`}>{waitStatus.label}</div>
                            </div>
                          </div>
                          <ul className="mb-4 space-y-2">
                            {order.items.map((item) => (
                              <li 
                                key={item.uniqueId} 
                                onClick={() => toggleItemReady(order.id, item.uniqueId)}
                                className={`p-2 rounded cursor-pointer border flex justify-between items-center transition-colors ${item.isReady ? 'bg-green-100 border-green-300 text-gray-500 line-through' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                              >
                                <span className="font-medium text-lg">{item.name}</span>
                                {item.isReady && <span className="text-green-600 font-bold text-sm">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'prep')} className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 rounded shadow">
                            START PREPARING ➡️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PREPARING */}
                <div className="bg-gray-200 p-3 rounded-lg flex flex-col">
                  <h3 className="font-bold text-lg mb-3 bg-yellow-400 text-black p-2 rounded text-center shadow">PREPARING</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter(o => o.status === 'prep').map(order => {
                      const waitStatus = getOrderWaitStatus(order.timestamp);
                      return (
                        <div key={order.id} className={`p-4 rounded shadow-md border-l-8 ${waitStatus.class}`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-xl">Table: {order.table}</span>
                            <div className="text-right">
                              <div className="text-sm text-gray-800 font-bold">{order.timeFormatted}</div>
                              <div className={`text-xs font-bold mt-1 ${waitStatus.text}`}>{waitStatus.label}</div>
                            </div>
                          </div>
                          <ul className="mb-4 space-y-2">
                            {order.items.map((item) => (
                              <li 
                                key={item.uniqueId} 
                                onClick={() => toggleItemReady(order.id, item.uniqueId)}
                                className={`p-2 rounded cursor-pointer border flex justify-between items-center transition-colors ${item.isReady ? 'bg-green-100 border-green-300 text-gray-500 line-through' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                              >
                                <span className="font-medium text-lg">{item.name}</span>
                                {item.isReady && <span className="text-green-600 font-bold text-sm">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => updateOrderStatus(order.id, 'ready')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded shadow">
                            MARK ALL READY ➡️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* READY TO SERVE */}
                <div className="bg-gray-200 p-3 rounded-lg flex flex-col">
                  <h3 className="font-bold text-lg mb-3 bg-green-600 text-white p-2 rounded text-center shadow">READY TO SERVE</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter(o => o.status === 'ready').map(order => (
                      <div key={order.id} className="bg-white p-4 rounded shadow-md border-l-8 border-green-500 opacity-90">
                        <div className="flex justify-between border-b pb-2 mb-2">
                          <span className="font-black text-xl">Table: {order.table}</span>
                        </div>
                        <ul className="mb-4 text-lg font-medium space-y-1 text-gray-500 line-through">
                          {order.items.map((item) => <li key={item.uniqueId}>• {item.name}</li>)}
                        </ul>
                        <button onClick={() => clearOrder(order.id)} className="w-full bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 rounded shadow">
                          CLEAR ORDER ✖
                        </button>
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