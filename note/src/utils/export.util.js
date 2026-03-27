import { marked } from "marked";

/**
 * Export note content as a .md file (plain text download)
 */
export const exportAsMarkdown = (res, content, roomId) => {
    const filename = `colearn-note-${roomId}.md`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "text/markdown");
    res.send(content);
};

/**
 * Export note content as a PDF via Puppeteer
 * Converts markdown → HTML → PDF
 */
export const exportAsPDF = async (res, content, roomId) => {
    // Dynamic import — puppeteer is heavy, only load when needed
    const { default: puppeteer } = await import("puppeteer");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();

        // Convert markdown to HTML
        const htmlContent = marked(content);

        // Wrap in styled HTML document
        const html = `
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

        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
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