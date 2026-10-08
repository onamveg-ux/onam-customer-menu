import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

export default function OnamDashboard() {
  // --- STATE MANAGEMENT ---
  const [activeView, setActiveView] = useState('FOH'); // 'FOH' | 'KDS' | 'SUMMARY'
  const [kdsViewMode, setKdsViewMode] = useState('tickets'); // 'tickets' | 'bulk' | 'stock'
  const [orders, setOrders] = useState([]);
  const [currentTicket, setCurrentTicket] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [menuItems, setMenuItems] = useState([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [loadError, setLoadError] = useState(null);
  
  // Historical Summary States
  const [dailyHistory, setDailyHistory] = useState([]);
  const [isShowingHistory, setIsShowingHistory] = useState(false);

  // The official "Publish to Web" link for Google Sheets integration
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7iToziMLVb9Mrx7kWD3HkhTISA7ouA0f1M0f3UQu0z6L70oKB9dLOhoHP7iR9CY249qyiDU19KSgr/pub?output=csv';

  // 1. System Clock for Aging & Timers
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(clock);
  }, []);

  // 2. Fetch Live Menu from Google Sheets
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
            .map((row, index) => ({
              id: index + 1,
              sku: row.category_id ? `${row.category_id}_${index + 1}` : `SKU_${index + 1}`,
              name: row.item_name ? row.item_name.trim() : 'Unnamed Dish',
              category: row.category_name ? row.category_name.trim() : 'General',
              price: parseFloat(String(row.price).replace(/[^0-9.]/g, '')) || 0,
              spicy: String(row.spicy).trim().toUpperCase() === 'TRUE',
              prepTime: 5, // Defaulting prep time
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
        setLoadError('Could not fetch data. Check network or publish settings.');
        setIsLoadingMenu(false);
      }
    });
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // --- API INTEGRATIONS (Node.js Backend) ---

  const printReceipt = async (orderData, printType) => {
    try {
      // Replace localhost with Dell server IP if on a tablet
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
        item.id === itemId ? { ...item, inStock: !item.inStock, availableAt: null } : item
      )
    );
  };

  const setAvailabilityTimer = (itemId, minutes) => {
    setMenuItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, inStock: false, availableAt: Date.now() + minutes * 60000 } : item
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

    // Update local KDS state instantly
    setOrders((prev) => [...prev, newOrder]);
    
    // Optional: Push to Node.js backend for PostgreSQL storage silently
    try {
      await fetch('http://localhost:3000/api/orders/foh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableNumber, items: currentTicket, totalAmount })
      });
    } catch (e) {
      console.warn("Backend disconnected. Order saved locally only.", e);
    }

    setCurrentTicket([]);
    setTableNumber('');
  };

  // --- KITCHEN TICKETS ACTIONS ---
  const updateOrderStatus = (orderId, newStatus) => {
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)));
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
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded font-semibold hidden sm:block">POS Engine</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveView('F