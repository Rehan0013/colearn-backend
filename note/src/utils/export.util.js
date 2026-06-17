import { marked } from "marked";

const escapeHtml = (text) => {
    if (typeof text !== "string") return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

/**
 * Generates an SVG string representation of the whiteboard elements
 */
export const generateSVGString = (content) => {
    let elements = [];
    try {
        elements = JSON.parse(content);
        if (!Array.isArray(elements)) {
            elements = [];
        }
    } catch {
        // Not valid JSON (legacy markdown note)
        return null;
    }

    if (elements.length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
            <rect width="100%" height="100%" fill="#ffffff" />
            <text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="#aaaaaa" text-anchor="middle" dominant-baseline="middle">Empty Whiteboard</text>
        </svg>`;
    }

    // Compute bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    elements.forEach((el) => {
        if (el.type === "pencil") {
            const elX = el.x ?? 0;
            const elY = el.y ?? 0;
            if (Array.isArray(el.points)) {
                el.points.forEach((pt) => {
                    const absX = elX + pt[0];
                    const absY = elY + pt[1];
                    minX = Math.min(minX, absX);
                    minY = Math.min(minY, absY);
                    maxX = Math.max(maxX, absX);
                    maxY = Math.max(maxY, absY);
                });
            }
        } else {
            const elX = el.x ?? 0;
            const elY = el.y ?? 0;
            const elW = el.width ?? 0;
            const elH = el.height ?? 0;

            const left = elW >= 0 ? elX : elX + elW;
            const right = elW >= 0 ? elX + elW : elX;
            const top = elH >= 0 ? elY : elY + elH;
            const bottom = elH >= 0 ? elY + elH : elY;

            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, right);
            maxY = Math.max(maxY, bottom);

            if (el.type === "text") {
                const fontSize = el.fontSize ?? 16;
                const estimatedWidth = (el.text ?? "").length * (fontSize * 0.6);
                maxX = Math.max(maxX, elX + estimatedWidth);
                maxY = Math.max(maxY, elY + fontSize);
            }
        }
    });

    const padding = 40;
    const finalMinX = minX === Infinity ? 0 : minX - padding;
    const finalMinY = minY === Infinity ? 0 : minY - padding;
    const finalMaxX = maxX === -Infinity ? 800 : maxX + padding;
    const finalMaxY = maxY === -Infinity ? 600 : maxY + padding;
    const width = finalMaxX - finalMinX;
    const height = finalMaxY - finalMinY;

    let svgContent = "";

    elements.forEach((el) => {
        const stroke = el.strokeColor || "#000000";
        const strokeWidth = el.strokeWidth || 2;
        const fill = el.fillColor || "transparent";

        if (el.type === "rectangle") {
            const elW = el.width ?? 0;
            const elH = el.height ?? 0;
            const rx = elW >= 0 ? el.x : el.x + elW;
            const ry = elH >= 0 ? el.y : el.y + elH;
            const w = Math.abs(elW);
            const h = Math.abs(elH);
            svgContent += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" rx="3" ry="3" />\n`;
        } else if (el.type === "ellipse") {
            const elW = el.width ?? 0;
            const elH = el.height ?? 0;
            const cx = el.x + elW / 2;
            const cy = el.y + elH / 2;
            const rx = Math.abs(elW / 2);
            const ry = Math.abs(elH / 2);
            svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" />\n`;
        } else if (el.type === "line") {
            const x2 = el.x + (el.width ?? 0);
            const y2 = el.y + (el.height ?? 0);
            svgContent += `<line x1="${el.x}" y1="${el.y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" />\n`;
        } else if (el.type === "pencil") {
            if (Array.isArray(el.points) && el.points.length > 0) {
                const elX = el.x ?? 0;
                const elY = el.y ?? 0;
                const pathData = el.points
                    .map((pt, idx) => {
                        const absX = elX + pt[0];
                        const absY = elY + pt[1];
                        return `${idx === 0 ? "M" : "L"} ${absX} ${absY}`;
                    })
                    .join(" ");
                svgContent += `<path d="${pathData}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" stroke-linejoin="round" stroke-linecap="round" />\n`;
            }
        } else if (el.type === "text") {
            const fontSize = el.fontSize ?? 16;
            const fontFamily = el.fontFamily || "sans-serif";
            const textLines = (el.text ?? "").split("\n");

            textLines.forEach((line, index) => {
                const escaped = escapeHtml(line);
                const lineY = el.y + (fontSize * 0.9) + (index * fontSize * 1.2);
                svgContent += `<text x="${el.x}" y="${lineY}" fill="${stroke}" font-size="${fontSize}px" font-family="${fontFamily}" font-weight="500">${escaped}</text>\n`;
            });
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${finalMinX} ${finalMinY} ${width} ${height}" width="${width}" height="${height}">
        <rect x="${finalMinX}" y="${finalMinY}" width="100%" height="100%" fill="#ffffff" />
        <g>
            ${svgContent}
        </g>
    </svg>`;
};

/**
 * Export note content as a .md file (plain text download)
 */
export const exportAsMarkdown = (res, content, roomId) => {
    let finalContent = content;

    // Check if it's whiteboard JSON, and extract texts if it is
    try {
        const elements = JSON.parse(content);
        if (Array.isArray(elements)) {
            const texts = elements
                .filter((el) => el.type === "text" && el.text)
                .map((el) => el.text);

            if (texts.length > 0) {
                finalContent = `# Colearn Whiteboard Text Notes (Room ${roomId})\n\n` +
                    texts.map((t) => `- ${t}`).join("\n\n");
            } else {
                finalContent = `# Colearn Whiteboard Notes (Room ${roomId})\n\nEmpty whiteboard or whiteboard with no text. Total shapes: ${elements.length}.`;
            }
        }
    } catch {
        // Fallback to raw content if not JSON
    }

    const filename = `colearn-note-${roomId}.md`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "text/markdown");
    res.send(finalContent);
};

/**
 * Export note content as an SVG file
 */
export const exportAsSVG = (res, content, roomId) => {
    const svgString = generateSVGString(content);
    
    // If not valid JSON, fallback to creating a basic text SVG
    let finalSVG = svgString;
    if (!svgString) {
        finalSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
            <rect width="100%" height="100%" fill="#ffffff" />
            <text x="40" y="80" font-family="monospace" font-size="14" fill="#333333">${escapeHtml(content)}</text>
        </svg>`;
    }

    const filename = `colearn-note-${roomId}.svg`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(finalSVG);
};

/**
 * Export note content as raw JSON file
 */
export const exportAsJSON = (res, content, roomId) => {
    const filename = `colearn-note-${roomId}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");

    // Make sure it is valid JSON, or package it as a string
    try {
        JSON.parse(content);
        res.send(content);
    } catch {
        res.send(JSON.stringify({ textNote: content }));
    }
};

/**
 * Export note content as a PDF via Puppeteer
 * Converts markdown → HTML → PDF (for legacy) OR rendered SVG → PDF (for whiteboard)
 */
export const exportAsPDF = async (res, content, roomId) => {
    const { default: puppeteer } = await import("puppeteer");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();
        const svgString = generateSVGString(content);

        let html = "";
        let isLandscape = true;

        if (svgString) {
            // Whiteboard Mode
            isLandscape = true;
            html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        @page {
                            size: A4 landscape;
                            margin: 0;
                        }
                        body {
                            margin: 0;
                            padding: 40px;
                            box-sizing: border-box;
                            background: #ffffff;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        }
                        .header {
                            width: 100%;
                            border-bottom: 2px solid #6C63FF;
                            padding-bottom: 12px;
                            margin-bottom: 20px;
                            color: #6C63FF;
                            font-size: 0.85em;
                            display: flex;
                            justify-content: space-between;
                        }
                        .canvas-container {
                            flex: 1;
                            width: 100%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            overflow: hidden;
                        }
                        svg {
                            max-width: 100%;
                            max-height: 100%;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <span>Colearn Whiteboard Note</span>
                        <span>Room ID: ${roomId} · Exported ${new Date().toLocaleDateString()}</span>
                    </div>
                    <div class="canvas-container">
                        ${svgString}
                    </div>
                </body>
                </html>
            `;
        } else {
            // Legacy Markdown Mode
            isLandscape = false;
            const htmlContent = marked(content);
            html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                            max-width: 800px;
                            margin: 40px auto;
                            padding: 0 20px;
                            line-height: 1.7;
                            color: #1a1a1a;
                        }
                        h1, h2, h3 { color: #111; margin-top: 1.5em; }
                        code {
                            background: #f4f4f4;
                            padding: 2px 6px;
                            border-radius: 4px;
                            font-size: 0.9em;
                        }
                        pre {
                            background: #f4f4f4;
                            padding: 16px;
                            border-radius: 8px;
                            overflow-x: auto;
                        }
                        blockquote {
                            border-left: 4px solid #6C63FF;
                            margin: 0;
                            padding-left: 16px;
                            color: #555;
                        }
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px 12px; }
                        th { background: #f4f4f4; }
                        .header {
                            border-bottom: 2px solid #6C63FF;
                            padding-bottom: 12px;
                            margin-bottom: 32px;
                            color: #6C63FF;
                            font-size: 0.85em;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">Colearn · Room Notes · Exported ${new Date().toLocaleDateString()}</div>
                    ${htmlContent}
                </body>
                </html>
            `;
        }

        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            landscape: isLandscape,
            margin: isLandscape 
                ? { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
                : { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
            printBackground: true,
        });

        const filename = `colearn-note-${roomId}.pdf`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/pdf");
        res.send(pdf);
    } finally {
        await browser.close();
    }
};