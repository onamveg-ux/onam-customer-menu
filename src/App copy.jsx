import React, { useState, useEffect } from 'react';

export default function OnamDashboard() {
  const [activeView, setActiveView] = useState('FOH');
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');

  // Sample Menu
  const menuItems = [
    { id: 1, name: 'Masala Dosa', category: 'Tiffin', price: 80 },
    { id: 2, name: 'Idli (Set of 3)', category: 'Tiffin', price: 50 },
    { id: 3, name: 'Ghee Roast', category: 'Tiffin', price: 100 },
    { id: 4, name: 'Onam Sadya', category: 'Meals', price: 250 },
    { id: 5, name: 'Paneer Butter Masala', category: 'Curry', price: 180 },
    { id: 6, name: 'Filter Coffee', category: 'Beverage', price: 30 }
  ];

  // FOH Functions
  const addToTicket = (item) => {
    setCurrentTicket([...currentTicket, { ...item, uniqueId: Date.now() }]);
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
      status: 'new', // new, prep, ready
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };

    setOrders([...orders, newOrder]);
    setCurrentTicket([]);
    setTableNumber('');
  };

  // Kitchen Functions
  const updateOrderStatus = (orderId, newStatus) => {
    setOrders(orders.map(order => 
      order.id === orderId ? { ...order, status: newStatus } : order
    ));
  };

  const clearOrder = (orderId) => {
    setOrders(orders.filter(order => order.id !== orderId));
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Top Navigation */}
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl font-bold tracking-wide">ONAM VEG 🌿</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveView('FOH')}
            className={`px-6 py-2 rounded font-bold transition-colors ${activeView === 'FOH' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            FOH (Order Entry)
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
      <main className="p-4">
        {activeView === 'FOH' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Menu Section */}
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Menu Items</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToTicket(item)}
                    className="p-4 h-24 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-lg font-semibold flex flex-col items-center justify-center transition-colors active:bg-blue-200"
                  >
                    <span>{item.name}</span>
                    <span className="text-sm font-normal text-gray-600">₹{item.price}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Current Ticket Section */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col h-[80vh]">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Current Ticket</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-bold mb-1">Table / Order #</label>
                <input 
                  type="text" 
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded p-2 text-xl"
                  placeholder="e.g. 4 or Takeaway"
                />
              </div>

              <div className="flex-grow overflow-y-auto mb-4 border rounded bg-gray-50 p-2">
                {currentTicket.length === 0 ? (
                  <p className="text-gray-400 text-center mt-10">Ticket is empty</p>
                ) : (
                  <ul className="space-y-2">
                    {currentTicket.map((item) => (
                      <li key={item.uniqueId} className="flex justify-between items-center p-2 bg-white border rounded shadow-sm">
                        <span className="font-semibold">{item.name}</span>
                        <div className="flex items-center gap-4">
                          <span>₹{item.price}</span>
                          <button onClick={() => removeFromBody(item.uniqueId)} className="text-red-500 font-bold hover:bg-red-50 px-2 rounded">X</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-xl font-bold mb-4">
                  <span>Total:</span>
                  <span>₹{currentTicket.reduce((sum, item) => sum + item.price, 0)}</span>
                </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[85vh]">
            {/* KDS Column: NEW */}
            <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200 overflow-y-auto">
              <h2 className="text-xl font-bold text-red-800 mb-4 bg-red-200 p-2 rounded text-center">NEW ORDERS</h2>
              {orders.filter(o => o.status === 'new').map(order => (
                <div key={order.id} className="bg-white p-4 mb-4 rounded shadow-md border-l-4 border-red-500">
                  <div className="flex justify-between border-b pb-2 mb-2">
                    <span className="font-bold text-lg">Table: {order.table}</span>
                    <span className="text-gray-500">{order.time}</span>
                  </div>
                  <ul className="mb-4 text-lg font-medium space-y-1">
                    {order.items.map((item, idx) => <li key={idx}>• {item.name}</li>)}
                  </ul>
                  <button onClick={() => updateOrderStatus(order.id, 'prep')} className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-2 rounded">
                    START PREPARING ➡️
                  </button>
                </div>
              ))}
            </div>

            {/* KDS Column: PREPARING */}
            <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200 overflow-y-auto">
              <h2 className="text-xl font-bold text-yellow-800 mb-4 bg-yellow-200 p-2 rounded text-center">PREPARING</h2>
              {orders.filter(o => o.status === 'prep').map(order => (
                <div key={order.id} className="bg-white p-4 mb-4 rounded shadow-md border-l-4 border-yellow-500">
                  <div className="flex justify-between border-b pb-2 mb-2">
                    <span className="font-bold text-lg">Table: {order.table}</span>
                    <span className="text-gray-500">{order.time}</span>
                  </div>
                  <ul className="mb-4 text-lg font-medium space-y-1 text-gray-700">
                    {order.items.map((item, idx) => <li key={idx}>• {item.name}</li>)}
                  </ul>
                  <button onClick={() => updateOrderStatus(order.id, 'ready')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded">
                    MARK READY ➡️
                  </button>
                </div>
              ))}
            </div>

            {/* KDS Column: READY */}
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200 overflow-y-auto">
              <h2 className="text-xl font-bold text-green-800 mb-4 bg-green-200 p-2 rounded text-center">READY TO SERVE</h2>
              {orders.filter(o => o.status === 'ready').map(order => (
                <div key={order.id} className="bg-white p-4 mb-4 rounded shadow-md border-l-4 border-green-500 opacity-80">
                  <div className="flex justify-between border-b pb-2 mb-2">
                    <span className="font-bold text-lg">Table: {order.table}</span>
                    <span className="text-gray-500">{order.time}</span>
                  </div>
                  <ul className="mb-4 text-lg font-medium space-y-1 text-gray-500 line-through">
                    {order.items.map((item, idx) => <li key={idx}>• {item.name}</li>)}
                  </ul>
                  <button onClick={() => clearOrder(order.id)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded">
                    CLEAR ORDER ✖
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}