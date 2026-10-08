import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

export default function OnamDashboard() {
  const [activeView, setActiveView] = useState('FOH');
  const [kdsViewMode, setKdsViewMode] = useState('tickets'); // 'tickets' | 'bulk' | 'stock'
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [menuItems, setMenuItems] = useState([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Direct export endpoint for your specific Google Sheet ID
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/15FywfLnU_4KSVDY_BWUvlxTfb6zbLgpuvY-bD_GLVeM/export?format=csv';

  // 1. Clock interval to update prep aging counters and restock timers
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(clock);
  }, []);

  // 2. Fetch and parse live menu from Google Sheets
  const fetchMenu = () => {
    setIsLoadingMenu(true);
    setLoadError(null);

    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      // Normalize all column headers to lowercase and trim spaces
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        try {
          const liveMenu = results.data
            .filter((row) => {
              if (!row.active) return false;
              const val = String(row.active).trim().toUpperCase();
              return val === 'TRUE' || val === '1' || val === 'YES';
            })
            .map((row, index) => ({
              id: index + 1,
              sku: row.category_id ? `${row.category_id}_${index + 1}` : `SKU_${index + 1}`,
              name: row.item_name ? row.item_name.trim() : 'Unnamed Dish',
              category: row.category_name ? row.category_name.trim() : 'General',
              description: row.description ? row.description.trim() : '',
              price: parseFloat(String(row.price).replace(/[^0-9.]/g, '')) || 0,
              spicy: String(row.spicy).trim().toUpperCase() === 'TRUE',
              prepTime: 5,
              inStock: true,
              availableAt: null
            }));

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
        setLoadError('Could not reach Google Sheets. Check share permissions.');
        setIsLoadingMenu(false);
      }
    });
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // --- PREDICTIVE WAIT TIME ALGORITHM ---
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

  // --- STOCK CONTROLS ---
  const toggleStock = (itemId) => {
    setMenuItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, inStock: !item.inStock, availableAt: null }
          : item
      )
    );
  };

  const setAvailabilityTimer = (itemId, minutes) => {
    setMenuItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, inStock: false, availableAt: Date.now() + minutes * 60000 }
          : item
      )
    );
  };

  // --- ORDER TICKETING ACTIONS ---
  const addToTicket = (item) => {
    if (item.inStock) {
      setCurrentTicket((prev) => [
        ...prev,
        { ...item, uniqueId: `${Date.now()}-${Math.random()}`, isReady: false }
      ]);
    }
  };

  const removeFromBody = (uniqueId) => {
    setCurrentTicket((prev) => prev.filter((item) => item.uniqueId !== uniqueId));
  };

  const sendToKitchen = async () => {
    if (currentTicket.length === 0) return alert('Ticket is empty!');
    if (!tableNumber.trim()) return alert('Please enter Table Number or Order Identifier!');

    const totalAmount = currentTicket.reduce((sum, item) => sum + item.price, 0);

    const newOrder = {
      id: Math.floor(1000 + Math.random() * 9000),
      table: tableNumber.trim(),
      items: currentTicket,
      totalAmount,
      status: 'new',
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Push to local state immediately for instant feedback
    setOrders((prev) => [...prev, newOrder]);
    setCurrentTicket([]);
    setTableNumber('');
  };

  // --- KITCHEN TICKETS ACTIONS ---
  const updateOrderStatus = (orderId, newStatus) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order))
    );
  };

  const toggleItemReady = (orderId, itemUniqueId) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id === orderId) {
          return {
            ...order,
            items: order.items.map((item) =>
              item.uniqueId === itemUniqueId ? { ...item, isReady: !item.isReady } : item
            )
          };
        }
        return order;
      })
    );
  };

  const clearOrder = (orderId) => {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  };

  const getBulkTotals = () => {
    const totals = {};
    orders.forEach((order) => {
      if (order.status !== 'ready') {
        order.items.forEach((item) => {
          if (!item.isReady) {
            totals[item.name] = (totals[item.name] || 0) + 1;
          }
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

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      {/* Top Application Bar */}
      <nav className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-wider text-amber-400">ONAM VEG</h1>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded font-semibold">POS Engine</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('FOH')}
            className={`px-5 py-2 rounded-lg font-bold transition-all ${
              activeView === 'FOH' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            FOH (Billing)
          </button>
          <button
            onClick={() => setActiveView('KDS')}
            className={`px-5 py-2 rounded-lg font-bold transition-all ${
              activeView === 'KDS' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            KDS (Kitchen)
          </button>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="p-4 flex-grow flex flex-col">
        {activeView === 'FOH' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
            {/* Menu Catalog Section */}
            <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b pb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Menu Selection</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Direct sync from active spreadsheet rows</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchMenu}
                    className="text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors"
                  >
                    Sync Sheet
                  </button>
                  {isLoadingMenu && <span className="text-xs text-blue-600 font-semibold animate-pulse">Syncing...</span>}
                </div>
              </div>

              {loadError && (
                <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {loadError} Ensure the sheet is shared with <strong>"Anyone with the link"</strong> set to Viewer.
                </div>
              )}

              {menuItems.length === 0 && !isLoadingMenu && !loadError ? (
                <div className="flex-grow flex flex-col items-center justify-center text-gray-400">
                  <p className="font-semibold">No active menu items found.</p>
                  <p className="text-sm mt-1">Confirm that rows have the 'active' column set to 'TRUE'.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto max-h-[75vh]">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToTicket(item)}
                      disabled={!item.inStock}
                      className={`p-3.5 h-28 border rounded-xl text-left flex flex-col justify-between transition-all ${
                        item.inStock
                          ? 'bg-blue-50/70 border-blue-200 hover:bg-blue-100 active:scale-95'
                          : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-sm text-gray-900 block leading-tight line-clamp-2">{item.name}</span>
                        {item.spicy && <span className="text-[10px] text-red-600 font-bold uppercase mt-0.5 block">Spicy</span>}
                      </div>
                      <span className={`text-sm font-black ${item.inStock ? 'text-gray-800' : 'text-red-500'}`}>
                        {getAvailabilityText(item)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Current Ticket Panel */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[82vh]">
              <h2 className="text-xl font-bold mb-3 border-b pb-2 text-gray-800">Current Ticket</h2>

              <div className="mb-3">
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded-lg p-2.5 text-base font-bold focus:border-blue-500 outline-none"
                  placeholder="Table No. / Order Identifier"
                />
              </div>

              <div className="flex-grow overflow-y-auto mb-3 border rounded-lg bg-gray-50 p-2 space-y-2">
                {currentTicket.length === 0 ? (
                  <p className="text-gray-400 text-center mt-14 font-medium">Select dishes from the menu</p>
                ) : (
                  currentTicket.map((item) => (
                    <div key={item.uniqueId} className="flex justify-between items-center p-2.5 bg-white border border-gray-200 rounded-lg shadow-xs">
                      <div>
                        <div className="font-bold text-gray-800 text-sm">{item.name}</div>
                        <div className="text-xs text-gray-500">₹{item.price}</div>
                      </div>
                      <button
                        onClick={() => removeFromBody(item.uniqueId)}
                        className="text-red-500 font-bold hover:bg-red-50 px-2 py-1 rounded border border-red-200 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t pt-3 mt-auto space-y-3">
                <div className="flex justify-between text-lg font-black text-gray-800">
                  <span>Total Bill:</span>
                  <span>₹{currentTicket.reduce((sum, item) => sum + item.price, 0)}</span>
                </div>

                <div className="text-center bg-orange-50 border border-orange-200 text-orange-800 py-2 px-3 rounded-lg text-xs font-bold">
                  Predictive Prep Time: {calculateEstimatedWait()} mins
                </div>

                <button
                  onClick={sendToKitchen}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-base py-3.5 rounded-xl shadow transition-colors"
                >
                  SEND TO KITCHEN ➔
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* KDS View Modules */
          <div className="flex flex-col h-full flex-grow">
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-black text-gray-800">Kitchen Display Workflow</h2>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setKdsViewMode('tickets')}
                  className={`px-4 py-1.5 rounded-md font-bold text-sm transition-all ${
                    kdsViewMode === 'tickets' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Active Orders
                </button>
                <button
                  onClick={() => setKdsViewMode('bulk')}
                  className={`px-4 py-1.5 rounded-md font-bold text-sm transition-all ${
                    kdsViewMode === 'bulk' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Consolidated Bulk
                </button>
                <button
                  onClick={() => setKdsViewMode('stock')}
                  className={`px-4 py-1.5 rounded-md font-bold text-sm transition-all ${
                    kdsViewMode === 'stock' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Stock Pause (86)
                </button>
              </div>
            </div>

            {/* Sub-view: Stock Control */}
            {kdsViewMode === 'stock' && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-grow overflow-y-auto">
                <h3 className="text-base font-bold mb-4 text-gray-800 border-b pb-2">Dish Availability & Batch Pausing</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        item.inStock ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-base text-gray-900">{item.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-black ${item.inStock ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'}`}>
                          {item.inStock ? 'ACTIVE' : '86 / PAUSED'}
                        </span>
                      </div>

                      {!item.inStock && item.availableAt && (
                        <div className="text-center font-bold text-orange-700 text-xs mb-3 bg-white p-1 rounded border border-orange-200">
                          Resumes in {Math.ceil((item.availableAt - currentTime) / 60000)} mins
                        </div>
                      )}

                      <div className="space-y-2">
                        <button
                          onClick={() => toggleStock(item.id)}
                          className={`w-full py-2 rounded-lg font-bold text-xs text-white shadow-xs transition-colors ${
                            item.inStock ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {item.inStock ? 'Mark Out of Stock (86)' : 'Reactivate Immediately'}
                        </button>

                        {item.inStock && (
                          <div className="grid grid-cols-3 gap-1.5">
                            <button onClick={() => setAvailabilityTimer(item.id, 15)} className="bg-white hover:bg-orange-50 text-orange-800 py-1 rounded text-xs font-bold border border-orange-300">15m</button>
                            <button onClick={() => setAvailabilityTimer(item.id, 30)} className="bg-white hover:bg-orange-50 text-orange-800 py-1 rounded text-xs font-bold border border-orange-300">30m</button>
                            <button onClick={() => setAvailabilityTimer(item.id, 60)} className="bg-white hover:bg-orange-50 text-orange-800 py-1 rounded text-xs font-bold border border-orange-300">1 hr</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-view: Bulk Prep */}
            {kdsViewMode === 'bulk' && (
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-grow">
                <h3 className="text-base font-bold mb-4 text-gray-800 border-b pb-2">Total Dishes Currently Required by Kitchen</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {getBulkTotals().map(([name, count]) => (
                    <div key={name} className="bg-blue-50 border-2 border-blue-200 p-5 rounded-xl text-center shadow-xs">
                      <div className="text-4xl font-black text-blue-700 mb-1">{count}</div>
                      <div className="text-sm font-bold text-gray-800">{name}</div>
                    </div>
                  ))}
                  {getBulkTotals().length === 0 && (
                    <p className="text-gray-400 font-medium text-center col-span-full py-12">All orders cleared. No pending items.</p>
                  )}
                </div>
              </div>
            )}

            {/* Sub-view: Active Tickets */}
            {kdsViewMode === 'tickets' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow h-[75vh]">
                {/* Column 1: New Orders */}
                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-red-600 text-white p-2 rounded-lg text-center tracking-wide">NEW ORDERS</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'new').map((order) => {
                      const waitStatus = getOrderWaitStatus(order.timestamp);
                      return (
                        <div key={order.id} className={`p-4 rounded-xl shadow-sm border-l-8 ${waitStatus.class}`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                            <div className="text-right">
                              <div className="text-xs text-gray-800 font-bold">{order.timeFormatted}</div>
                              <div className={`text-[10px] font-black uppercase ${waitStatus.text}`}>{waitStatus.label}</div>
                            </div>
                          </div>
                          <ul className="mb-4 space-y-1.5">
                            {order.items.map((item) => (
                              <li
                                key={item.uniqueId}
                                onClick={() => toggleItemReady(order.id, item.uniqueId)}
                                className={`p-2 rounded-lg cursor-pointer border flex justify-between items-center text-xs font-semibold transition-all ${
                                  item.isReady ? 'bg-emerald-100 border-emerald-300 text-gray-400 line-through' : 'bg-white border-gray-200'
                                }`}
                              >
                                <span>{item.name}</span>
                                {item.isReady && <span className="text-[10px] font-black text-emerald-700 bg-emerald-200 px-1 py-0.5 rounded">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'prep')}
                            className="w-full bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-gray-950 font-black py-2.5 rounded-lg text-xs transition-colors"
                          >
                            START PREPARING ➔
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Preparing */}
                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-amber-500 text-white p-2 rounded-lg text-center tracking-wide">IN PROGRESS</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'prep').map((order) => {
                      const waitStatus = getOrderWaitStatus(order.timestamp);
                      return (
                        <div key={order.id} className={`p-4 rounded-xl shadow-sm border-l-8 ${waitStatus.class}`}>
                          <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
                            <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                            <div className="text-right">
                              <div className="text-xs text-gray-800 font-bold">{order.timeFormatted}</div>
                              <div className={`text-[10px] font-black uppercase ${waitStatus.text}`}>{waitStatus.label}</div>
                            </div>
                          </div>
                          <ul className="mb-4 space-y-1.5">
                            {order.items.map((item) => (
                              <li
                                key={item.uniqueId}
                                onClick={() => toggleItemReady(order.id, item.uniqueId)}
                                className={`p-2 rounded-lg cursor-pointer border flex justify-between items-center text-xs font-semibold transition-all ${
                                  item.isReady ? 'bg-emerald-100 border-emerald-300 text-gray-400 line-through' : 'bg-white border-gray-200'
                                }`}
                              >
                                <span>{item.name}</span>
                                {item.isReady && <span className="text-[10px] font-black text-emerald-700 bg-emerald-200 px-1 py-0.5 rounded">READY</span>}
                              </li>
                            ))}
                          </ul>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'ready')}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black py-2.5 rounded-lg text-xs transition-colors"
                          >
                            MARK COMPLETED ➔
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 3: Ready */}
                <div className="bg-gray-200/80 p-3 rounded-xl flex flex-col border border-gray-300">
                  <h3 className="font-black text-xs mb-3 bg-emerald-600 text-white p-2 rounded-lg text-center tracking-wide">READY FOR SERVICE</h3>
                  <div className="overflow-y-auto flex-grow space-y-3">
                    {orders.filter((o) => o.status === 'ready').map((order) => (
                      <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border-l-8 border-emerald-500 opacity-95">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                          <span className="font-black text-base text-gray-900">Table: {order.table}</span>
                          <span className="text-xs text-gray-500 font-bold">{order.timeFormatted}</span>
                        </div>
                        <ul className="mb-4 space-y-1 text-xs font-medium text-gray-500 line-through">
                          {order.items.map((item) => (
                            <li key={item.uniqueId}>• {item.name}</li>
                          ))}
                        </ul>
                        <button
                          onClick={() => clearOrder(order.id)}
                          className="w-full bg-gray-700 hover:bg-gray-800 active:bg-gray-900 text-white font-bold py-2 rounded-lg text-xs transition-colors"
                        >
                          DISMISS TICKET ✕
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