// const baseURL = "http://localhost:5000";
const baseURL = "https://trading-ai-lx48.onrender.com";

// Function to show popup notifications using SweetAlert2
function showPopup(title, text, icon) {
  if (window.Swal) {
    Swal.fire({ title, text, icon });
  } else {
    alert(title + "\n" + text);
  }
}

// Poll for status updates every 5 seconds
function updateStatus() {
  fetch(`${baseURL}/status`)
    .then(response => response.json())
    .then(data => {
      document.getElementById("status-text").innerText = data.trading_enabled ? "Running" : "Stopped";
      document.getElementById("balance").innerText = data.capital;
      document.getElementById("cycle-count").innerText = data.cycle_count;
      updateTradeLog(data.trade_history);
    })
    .catch(err => console.error("Error fetching status:", err));
}

// Update trade history table
function updateTradeLog(tradeHistory) {
  const tradeLogBody = document.getElementById("trade-log").querySelector("tbody");
  tradeLogBody.innerHTML = "";
  if (tradeHistory && tradeHistory.length > 0) {
    tradeHistory.forEach(trade => {
      const profitLoss = Number(trade.pnl || 0).toFixed(2);
      const profitLossFormatted = profitLoss > 0
        ? `<span style="color: green;">+${profitLoss}</span>`
        : `<span style="color: red;">-${Math.abs(profitLoss)}</span>`;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${trade.time}</td>
        <td>${trade.decision}</td>
        <td>${Number(trade.stake).toFixed(2)}</td>
        <td>${Number(trade.price).toFixed(2)}</td>
        <td>${trade.confidence}</td>
        <td>${profitLossFormatted}</td>
        <td>${trade.note}</td>
      `;
      tradeLogBody.appendChild(row);
    });
  }
}

// Initialize chart using Lightweight Charts (Area Chart with Dark Theme)
let chart;
let areaSeries;
function initAreaChart() {
  const container = document.getElementById("chartContainer");
  if (!container) {
    console.error("Chart container not found!");
    return;
  }
  container.style.backgroundColor = "#1e1e1e";
  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 400,
    layout: {
      background: "#1e1e1e",
      textColor: "#e0e0e0",
    },
    grid: {
      vertLines: { color: "#282928" },
      horzLines: { color: "#282928" },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: "#555",
        width: 1,
        style: LightweightCharts.LineStyle.Solid,
        labelBackgroundColor: "#555",
      },
      horzLine: {
        color: "#555",
        width: 1,
        style: LightweightCharts.LineStyle.Solid,
        labelBackgroundColor: "#555",
      },
    },
    timeScale: {
      borderColor: "#444",
      timeVisible: true,
      secondsVisible: true,
      tickMarkFormatter: (time, tickMarkType, locale) => {
        const date = new Date(time * 1000);
        return date.toLocaleTimeString(locale, { hour12: false });
      },
    },
  });
  areaSeries = chart.addAreaSeries({
    lineColor: "#26a69a",
    topColor: "rgba(38, 166, 154, 0.56)",
    bottomColor: "rgba(38, 166, 154, 0.04)",
    lineWidth: 2,
    priceFormat: {
      type: "price",
      precision: 5,
      minMove: 0.00001,
    },
  });
  window.addEventListener("resize", () => {
    chart.applyOptions({ width: container.clientWidth });
  });
}

function updateAreaChart() {
  const symbol = document.getElementById("symbol-select").value;
  const lowerSymbol = symbol.toLowerCase();
  // Determine the interval: use "tick" for Boom/Crash; "1m" for others
  const interval = (lowerSymbol === "boom1000" || lowerSymbol === "crash1000") ? "tick" : "1m";

  fetch(`${baseURL}/market_data?symbol=${symbol}&interval=${interval}`)
    .then(response => response.json())
    .then(data => {
      console.log("Fetched market data:", data);
      if (!data || !data.data || data.data.length === 0) {
        console.error("Market data is empty or invalid");
        return;
      }
      const processedData = data.data.map(d => {
        // Extract datetime from available keys
        let dateStr = d.Datetime_ || d.Date || d.Datetime || d.date;
        if (!dateStr) return null;
        // Ensure ISO format (replace first space with 'T' if needed)
        if (!dateStr.includes("T")) {
          dateStr = dateStr.replace(" ", "T");
        }
        const timestamp = Math.floor(new Date(dateStr).getTime() / 1000);
        let closeVal = 0;
        if (lowerSymbol === "boom1000" || lowerSymbol === "crash1000") {
          // For Boom/Crash symbols, use the "close" property directly
          closeVal = parseFloat(d.close) || 0;
        } else if (lowerSymbol.startsWith("frx")) {
          // For forex pairs, remove the "frx" prefix and append "=X"
          const forexSymbol = symbol.substring(3);
          const closeKey = "Close_" + forexSymbol + "=X";
          closeVal = parseFloat(d[closeKey]);
          if (isNaN(closeVal)) {
            closeVal = parseFloat(d["Close"]) || parseFloat(d.close) || 0;
          }
        } else {
          // Default extraction for other symbols
          const closeKey = "Close_" + symbol;
          closeVal = parseFloat(d[closeKey]);
          if (isNaN(closeVal)) {
            closeVal = parseFloat(d["Close"]) || parseFloat(d.close) || 0;
          }
        }
        return { time: timestamp, value: closeVal };
      }).filter(item => item !== null);
      console.log("Processed chart data:", processedData);
      if (processedData.length === 0) {
        console.warn("No valid data for chart found.");
        return;
      }
      if (areaSeries && typeof areaSeries.setData === "function") {
        areaSeries.setData(processedData);
        console.log("Area chart data updated.");
      } else {
        console.error("Area series is not defined properly.");
      }
    })
    .catch(err => console.error("Error fetching market data:", err));
}

// Button event listeners
document.getElementById("set-symbol-btn").addEventListener("click", () => {
  const symbolInput = document.getElementById("symbol-select").value;
  fetch(`${baseURL}/set_symbol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: symbolInput })
  })
    .then(response => response.json())
    .then(data => {
      showPopup("Symbol Updated", `New symbol: ${data.symbol}`, "success");
    })
    .catch(err => {
      showPopup("Error", err.toString(), "error");
    });
});

document.getElementById("start-btn").addEventListener("click", () => {
  fetch(`${baseURL}/start`, { method: "POST" })
    .then(response => response.json())
    .then(data => {
      showPopup("Trading Started", data.status, "success");
    })
    .catch(err => {
      showPopup("Error", err.toString(), "error");
    });
});

document.getElementById("stop-btn").addEventListener("click", () => {
  fetch(`${baseURL}/stop`, { method: "POST" })
    .then(response => response.json())
    .then(data => {
      showPopup("Trading Stopped", data.status, "success");
    })
    .catch(err => {
      showPopup("Error", err.toString(), "error");
    });
});

document.getElementById("set-duration-btn").addEventListener("click", () => {
  const duration = document.getElementById("duration-input").value;
  fetch(`${baseURL}/set_duration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration })
  })
    .then(response => response.json())
    .then(data => {
      showPopup("Duration Updated", `New duration: ${data.duration} minutes`, "success");
    })
    .catch(err => {
      showPopup("Error", err.toString(), "error");
    });
});

updateStatus(); // initial status update

// Initialize chart and poll for data/status updates
document.addEventListener("DOMContentLoaded", () => {
  initAreaChart();
  updateAreaChart();
  setInterval(updateAreaChart, 1000); // per tick (or 1-minute for forex) updates
  setInterval(updateStatus, 5000);    // poll status every 5 seconds
});
