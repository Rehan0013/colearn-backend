// ── Whiteboard Client Logic ──────────────────────────────────────────────────

// State Variables
let socket = null;
let roomId = "";
let token = "";
let username = "";
let tool = "pencil";
let strokeColor = "#e63946";
let fillColor = "transparent";
let strokeWidth = 3;
let fontSize = 20;

let elements = [];
let selectedElementId = null;
let history = [];
let historyIndex = -1;

// Drawing context trackers
let isDrawing = false;
let currentDrawingElement = null;
let dragStartOffset = { x: 0, y: 0 };
let remoteCursors = {};

// Canvas elements
const canvas = document.getElementById("whiteboardCanvas");
const ctx = canvas.getContext("2d");
const cursorsContainer = document.getElementById("cursorsContainer");

// UI Elements
const setupOverlay = document.getElementById("setupOverlay");
const roomIdInput = document.getElementById("roomIdInput");
const tokenInput = document.getElementById("tokenInput");
const usernameInput = document.getElementById("usernameInput");
const btnJoinSession = document.getElementById("btnJoinSession");
const btnGenTestToken = document.getElementById("btnGenTestToken");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const saveStatus = document.getElementById("saveStatus");

const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnClearCanvas = document.getElementById("btnClearCanvas");
const btnManualSave = document.getElementById("btnManualSave");

// ── Setup & Authentication ────────────────────────────────────────────────────

// Generate Test Token helper
btnGenTestToken.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/notes/test-token");
        const data = await response.json();
        if (data.token) {
            tokenInput.value = data.token;
            toast("Test token generated successfully!");
        } else {
            alert("Failed to generate test token");
        }
    } catch (err) {
        console.error(err);
        alert("Error fetching test token: " + err.message);
    }
});

// Join session handler
btnJoinSession.addEventListener("click", () => {
    roomId = roomIdInput.value.trim();
    token = tokenInput.value.trim();
    username = usernameInput.value.trim();

    if (!roomId) return alert("Please enter a Room ID");
    if (!token) return alert("Please enter an authentication token");
    if (!username) return alert("Please enter a username");

    joinSession();
});

function joinSession() {
    setupOverlay.classList.add("hidden");
    toast("Connecting to session...");

    // Connect to Socket.io (Realtime service is on port 5003)
    socket = io("http://localhost:5003", {
        auth: { token },
        withCredentials: true
    });

    socket.on("connect", () => {
        statusDot.className = "status-dot connected";
        statusText.innerText = "Connected";
        toast("Connected to socket server");

        // Join room and sync note content
        const userData = { name: username, role: "member" };
        socket.emit("presence:join", { roomId, userData });
        socket.emit("notes:get", { roomId });
    });

    socket.on("connect_error", (err) => {
        console.error("Connection error:", err);
        statusDot.className = "status-dot disconnected";
        statusText.innerText = "Error";
        toast("Connection failed: " + err.message, "danger");
        setupOverlay.classList.remove("hidden");
    });

    socket.on("disconnect", () => {
        statusDot.className = "status-dot disconnected";
        statusText.innerText = "Disconnected";
        toast("Disconnected from socket", "warning");
    });

    // Handle note content sync
    socket.on("notes:content", ({ content }) => {
        syncContentFromServer(content);
    });

    socket.on("notes:broadcast", ({ content }) => {
        syncContentFromServer(content);
    });

    // Handle cursor tracking
    socket.on("notes:cursor:update", ({ userId, userData, position }) => {
        if (!position) return;
        updateRemoteCursor(userId, userData?.name || "Anonymous", position.x, position.y);
    });

    socket.on("presence:left", ({ userId }) => {
        removeRemoteCursor(userId);
    });
}

function syncContentFromServer(contentString) {
    if (isDrawing) return; // Don't interrupt drawing
    
    let parsed = [];
    if (contentString) {
        try {
            parsed = JSON.parse(contentString);
            if (!Array.isArray(parsed)) parsed = [];
        } catch {
            // Legacy text fallback: convert to a text shape
            parsed = [{
                id: "legacy-text",
                type: "text",
                x: 40,
                y: 40,
                width: 400,
                height: 100,
                text: contentString,
                strokeColor: "#1e1e1e",
                fontSize: 16
            }];
        }
    }
    elements = parsed;
    render();
}

// ── Drawing Engine ────────────────────────────────────────────────────────────

// Resize Canvas to fill space
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    render();
}

window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 100);

// Rendering Loop
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background dots
    const gridGap = 20;
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    for (let x = 0; x < canvas.width; x += gridGap) {
        for (let y = 0; y < canvas.height; y += gridGap) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const listToDraw = currentDrawingElement ? [...elements, currentDrawingElement] : elements;

    listToDraw.forEach((el) => {
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth;
        ctx.fillStyle = el.fillColor || "transparent";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (el.type === "rectangle") {
            ctx.beginPath();
            ctx.rect(el.x, el.y, el.width, el.height);
            ctx.stroke();
            if (el.fillColor && el.fillColor !== "transparent") ctx.fill();
        } else if (el.type === "ellipse") {
            ctx.beginPath();
            const rx = Math.abs(el.width / 2);
            const ry = Math.abs(el.height / 2);
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
            if (el.fillColor && el.fillColor !== "transparent") ctx.fill();
        } else if (el.type === "line") {
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.x + el.width, el.y + el.height);
            ctx.stroke();
        } else if (el.type === "pencil") {
            if (el.points && el.points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
                for (let i = 1; i < el.points.length; i++) {
                    ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
                }
                ctx.stroke();
            }
        } else if (el.type === "text") {
            if (el.text) {
                const fs = el.fontSize || 16;
                ctx.font = `500 ${fs}px Outfit, Inter, sans-serif`;
                ctx.fillStyle = el.strokeColor;
                const lines = el.text.split("\n");
                lines.forEach((line, index) => {
                    ctx.fillText(line, el.x, el.y + (fs * 0.9) + (index * fs * 1.2));
                });
            }
        }

        // Draw selection highlight bounding box
        if (el.id === selectedElementId) {
            ctx.strokeStyle = "rgba(108, 99, 255, 0.6)";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();

            if (el.type === "pencil" && el.points) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                el.points.forEach(([px, py]) => {
                    const absX = el.x + px;
                    const absY = el.y + py;
                    minX = Math.min(minX, absX);
                    minY = Math.min(minY, absY);
                    maxX = Math.max(maxX, absX);
                    maxY = Math.max(maxY, absY);
                });
                ctx.rect(minX - 4, minY - 4, (maxX - minX) + 8, (maxY - minY) + 8);
            } else if (el.type === "text") {
                const fs = el.fontSize || 16;
                const w = (el.text ?? "").length * (fs * 0.6);
                ctx.rect(el.x - 4, el.y - 4, w + 8, fs + 8);
            } else {
                const lx = el.width >= 0 ? el.x : el.x + el.width;
                const ty = el.height >= 0 ? el.y : el.y + el.height;
                ctx.rect(lx - 4, ty - 4, Math.abs(el.width) + 8, Math.abs(el.height) + 8);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

// Hit testing
function isWithinElement(x, y, el) {
    if (el.type === "rectangle" || el.type === "ellipse" || el.type === "line") {
        const minX = Math.min(el.x, el.x + el.width);
        const maxX = Math.max(el.x, el.x + el.width);
        const minY = Math.min(el.y, el.y + el.height);
        const maxY = Math.max(el.y, el.y + el.height);
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    if (el.type === "text") {
        const fs = el.fontSize || 16;
        const w = (el.text ?? "").length * (fs * 0.6);
        return x >= el.x && x <= el.x + w && y >= el.y && y <= el.y + fs;
    }
    if (el.type === "pencil" && el.points) {
        return el.points.some(([px, py]) => {
            const absX = el.x + px;
            const absY = el.y + py;
            return Math.hypot(absX - x, absY - y) < 12;
        });
    }
    return false;
}

// Coordinates converter
function getMouseCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// ── Mouse & Drawing Action Handlers ───────────────────────────────────────────

canvas.addEventListener("mousedown", (e) => {
    if (socket === null || !socket.connected) return;
    const coords = getMouseCoords(e);
    isDrawing = true;

    if (tool === "select") {
        const clicked = [...elements].reverse().find((el) => isWithinElement(coords.x, coords.y, el));
        if (clicked) {
            selectedElementId = clicked.id;
            dragStartOffset = {
                x: coords.x - clicked.x,
                y: coords.y - clicked.y
            };
        } else {
            selectedElementId = null;
        }
        render();
    } else if (tool === "eraser") {
        const clicked = [...elements].reverse().find((el) => isWithinElement(coords.x, coords.y, el));
        if (clicked) {
            const updated = elements.filter((el) => el.id !== clicked.id);
            updateWhiteboardState(updated);
        }
    } else if (tool === "text") {
        selectedElementId = null;
        render();
        spawnTextInput(coords.x, coords.y);
    } else {
        selectedElementId = null;
        currentDrawingElement = {
            id: `el-${Date.now()}`,
            type: tool,
            x: coords.x,
            y: coords.y,
            width: 0,
            height: 0,
            strokeColor,
            fillColor: (tool === "rectangle" || tool === "ellipse") ? fillColor : "transparent",
            strokeWidth,
            fontSize,
            points: tool === "pencil" ? [[0, 0]] : undefined
        };
        render();
    }
});

canvas.addEventListener("mousemove", (e) => {
    const coords = getMouseCoords(e);

    // Broadcast cursor position
    if (socket && socket.connected) {
        const userData = { name: username };
        socket.emit("notes:cursor", { roomId, position: coords, userData });
    }

    if (!isDrawing) return;

    if (tool === "select" && selectedElementId) {
        elements = elements.map((el) => {
            if (el.id === selectedElementId) {
                return {
                    ...el,
                    x: coords.x - dragStartOffset.x,
                    y: coords.y - dragStartOffset.y
                };
            }
            return el;
        });
        render();
    } else if (currentDrawingElement) {
        if (currentDrawingElement.type === "pencil") {
            const relX = coords.x - currentDrawingElement.x;
            const relY = coords.y - currentDrawingElement.y;
            currentDrawingElement.points.push([relX, relY]);
        } else {
            currentDrawingElement.width = coords.x - currentDrawingElement.x;
            currentDrawingElement.height = coords.y - currentDrawingElement.y;
        }
        render();
    }
});

canvas.addEventListener("mouseup", () => {
    if (!isDrawing) return;
    isDrawing = false;

    if (tool === "select" && selectedElementId) {
        updateWhiteboardState(elements);
    } else if (currentDrawingElement) {
        const finished = currentDrawingElement;
        currentDrawingElement = null;

        if (finished.type === "pencil" && finished.points.length <= 1) {
            render();
            return;
        }
        
        const updated = [...elements, finished];
        updateWhiteboardState(updated);
    }
});

function spawnTextInput(x, y) {
    const input = document.createElement("textarea");
    input.style.position = "absolute";
    input.style.left = `${canvas.offsetLeft + x}px`;
    input.style.top = `${canvas.offsetTop + y - 10}px`;
    input.style.font = `500 ${fontSize}px Outfit, Inter, sans-serif`;
    input.style.color = strokeColor;
    input.style.background = "transparent";
    input.style.border = "1px dashed #6c63ff";
    input.style.outline = "none";
    input.style.padding = "4px";
    input.style.resize = "both";
    input.style.minWidth = "200px";
    input.style.overflow = "hidden";
    input.style.zIndex = "100";

    document.body.appendChild(input);
    input.focus();

    input.addEventListener("blur", () => {
        const text = input.value.trim();
        document.body.removeChild(input);

        if (text) {
            const newText = {
                id: `text-${Date.now()}`,
                type: "text",
                x,
                y,
                width: text.length * (fontSize * 0.6),
                height: fontSize,
                text,
                strokeColor,
                strokeWidth,
                fontSize
            };
            updateWhiteboardState([...elements, newText]);
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        }
    });
}

function updateWhiteboardState(newElements) {
    elements = newElements;
    render();

    // Save to Redux/Server
    const serialized = JSON.stringify(elements);
    if (socket && socket.connected) {
        const userData = { name: username };
        socket.emit("notes:update", { roomId, content: serialized, userData });
        saveStatus.innerText = "Drafting (Syncing...)";
    }

    const newHistory = history.slice(0, historyIndex + 1);
    history = [...newHistory, newElements];
    historyIndex = newHistory.length;
    
    updateHistoryButtons();
}

function updateHistoryButtons() {
    btnUndo.disabled = historyIndex < 0;
    btnRedo.disabled = historyIndex >= history.length - 1;
}

// ── Multi-user Cursor Handling ────────────────────────────────────────────────

function updateRemoteCursor(userId, name, x, y) {
    let cursor = remoteCursors[userId];
    if (!cursor) {
        // Create cursor markup
        const cursorEl = document.createElement("div");
        cursorEl.className = "remote-cursor-element";
        
        const pointer = document.createElement("div");
        pointer.className = "cursor-pointer-arrow";
        
        const nameTag = document.createElement("div");
        nameTag.className = "cursor-name-tag";
        nameTag.innerText = name;
        
        // Pick random color based on userId
        const colors = ["#e63946", "#f4a261", "#2a9d8f", "#1d3557", "#8338ec", "#ff006e"];
        const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const col = colors[hash % colors.length];
        
        pointer.style.borderBottomColor = col;
        nameTag.style.backgroundColor = col;

        cursorEl.appendChild(pointer);
        cursorEl.appendChild(nameTag);
        cursorsContainer.appendChild(cursorEl);

        cursor = { el: cursorEl };
        remoteCursors[userId] = cursor;
    }
    // Update cursor coordinates
    cursor.el.style.left = `${x}px`;
    cursor.el.style.top = `${y}px`;
}

function removeRemoteCursor(userId) {
    const cursor = remoteCursors[userId];
    if (cursor) {
        cursorsContainer.removeChild(cursor.el);
        delete remoteCursors[userId];
    }
}

// ── Interactive Controls & Events ─────────────────────────────────────────────

// Undo / Redo
btnUndo.addEventListener("click", () => {
    if (historyIndex > 0) {
        historyIndex--;
        elements = history[historyIndex];
        const serialized = JSON.stringify(elements);
        socket.emit("notes:update", { roomId, content: serialized, userData: { name: username } });
        render();
    } else if (historyIndex === 0) {
        historyIndex = -1;
        elements = [];
        socket.emit("notes:update", { roomId, content: "", userData: { name: username } });
        render();
    }
    updateHistoryButtons();
});

btnRedo.addEventListener("click", () => {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        elements = history[historyIndex];
        const serialized = JSON.stringify(elements);
        socket.emit("notes:update", { roomId, content: serialized, userData: { name: username } });
        render();
    }
    updateHistoryButtons();
});

// Clear canvas
btnClearCanvas.addEventListener("click", () => {
    if (confirm("Clear the entire whiteboard?")) {
        updateWhiteboardState([]);
        selectedElementId = null;
    }
});

// Manual save snapshot to note-service database
btnManualSave.addEventListener("click", async () => {
    if (!roomId) return;
    saveStatus.innerText = "Saving snapshot...";
    try {
        const response = await fetch(`/api/notes/${roomId}/save`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ content: JSON.stringify(elements) })
        });
        if (response.ok) {
            toast("Whiteboard snapshot saved to database");
            saveStatus.innerText = "Snapshot Saved";
        } else {
            const data = await response.json();
            alert("Failed to save: " + (data.message || response.statusText));
            saveStatus.innerText = "Save failed";
        }
    } catch (err) {
        console.error(err);
        alert("Error saving snapshot: " + err.message);
        saveStatus.innerText = "Save error";
    }
});

// Tool selector buttons
document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        tool = btn.getAttribute("data-tool");
        selectedElementId = null;
        render();

        // Show font selector if text tool is active, else stroke thickness
        document.getElementById("fontSizeGroup").style.display = tool === "text" ? "flex" : "none";
        document.getElementById("strokeWidthGroup").style.display = tool === "text" ? "none" : "flex";
        
        // Hide fill color palette if not rectangle/ellipse
        document.getElementById("fillGroup").style.display = (tool === "rectangle" || tool === "ellipse") ? "flex" : "none";
    });
});

// Stroke Color Selection
document.querySelectorAll("#strokePalette .color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
        document.querySelectorAll("#strokePalette .color-swatch").forEach((s) => s.classList.remove("active"));
        swatch.classList.add("active");
        strokeColor = swatch.getAttribute("data-color");
        
        if (selectedElementId) {
            elements = elements.map((el) => el.id === selectedElementId ? { ...el, strokeColor } : el);
            updateWhiteboardState(elements);
        }
    });
});

// Fill Color Selection
document.querySelectorAll("#fillPalette .color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
        document.querySelectorAll("#fillPalette .color-swatch").forEach((s) => s.classList.remove("active"));
        swatch.classList.add("active");
        fillColor = swatch.getAttribute("data-color");
        
        if (selectedElementId) {
            elements = elements.map((el) => el.id === selectedElementId ? { ...el, fillColor } : el);
            updateWhiteboardState(elements);
        }
    });
});

// Stroke Width Selection
document.querySelectorAll(".thick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".thick-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        strokeWidth = parseInt(btn.getAttribute("data-width"));

        if (selectedElementId) {
            elements = elements.map((el) => el.id === selectedElementId ? { ...el, strokeWidth } : el);
            updateWhiteboardState(elements);
        }
    });
});

// Font Size Selection
document.querySelectorAll(".font-size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".font-size-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        fontSize = parseInt(btn.getAttribute("data-size"));

        if (selectedElementId) {
            elements = elements.map((el) => el.id === selectedElementId ? { ...el, fontSize } : el);
            updateWhiteboardState(elements);
        }
    });
});

// Export triggers
document.querySelectorAll(".export-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const format = btn.getAttribute("data-format");
        if (format === "png") {
            // Local Client PNG Export
            const link = document.createElement("a");
            link.download = `colearn-whiteboard-${roomId}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            toast("PNG exported locally");
        } else {
            // Backend endpoint exports (PDF, SVG, JSON)
            window.open(`/api/notes/${roomId}/export?format=${format}`, "_blank");
        }
    });
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        btnUndo.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        btnRedo.click();
    } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedElementId) {
            const updated = elements.filter((el) => el.id !== selectedElementId);
            selectedElementId = null;
            updateWhiteboardState(updated);
        }
    } else if (e.key === "v" || e.key === "V") {
        document.querySelector('[data-tool="select"]').click();
    } else if (e.key === "p" || e.key === "P") {
        document.querySelector('[data-tool="pencil"]').click();
    } else if (e.key === "l" || e.key === "L") {
        document.querySelector('[data-tool="line"]').click();
    } else if (e.key === "r" || e.key === "R") {
        document.querySelector('[data-tool="rectangle"]').click();
    } else if (e.key === "o" || e.key === "O") {
        document.querySelector('[data-tool="ellipse"]').click();
    } else if (e.key === "t" || e.key === "T") {
        document.querySelector('[data-tool="text"]').click();
    } else if (e.key === "e" || e.key === "E") {
        document.querySelector('[data-tool="eraser"]').click();
    }
});

// Toast system
function toast(message, type = "success") {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.bottom = "24px";
    el.style.left = "24px";
    el.style.background = type === "success" ? "var(--success)" : type === "warning" ? "var(--warning)" : "var(--danger)";
    el.style.color = "white";
    el.style.padding = "10px 18px";
    el.style.borderRadius = "10px";
    el.style.fontSize = "12px";
    el.style.fontWeight = "600";
    el.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.3)";
    el.style.zIndex = "2000";
    el.style.transition = "all 0.3s ease";
    el.innerText = message;
    
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => document.body.removeChild(el), 300);
    }, 3000);
}
