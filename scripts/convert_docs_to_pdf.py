# ============================================================================
# ReliefChain: Markdown to High-Quality PDF Converter
# Owner: Member 1 (Database Architect & Core Backend)
# Usage: python scripts/convert_docs_to_pdf.py   (needs: pip install markdown-it-py, and Microsoft Edge)
# Uses Python markdown-it-py + Microsoft Edge Headless Print-to-PDF
# ============================================================================

import os
import subprocess
from markdown_it import MarkdownIt

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")

CSS_STYLES = """
@page {
    size: A4;
    margin: 18mm 16mm 20mm 16mm;
    @bottom-right {
        content: counter(page);
    }
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1e293b;
    margin: 0;
    padding: 0;
}

h1 {
    font-size: 20pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 6px;
    margin-top: 18pt;
    margin-bottom: 12pt;
    page-break-after: avoid;
}

h2 {
    font-size: 14pt;
    font-weight: 700;
    color: #0369a1;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    margin-top: 16pt;
    margin-bottom: 8pt;
    page-break-after: avoid;
}

h3 {
    font-size: 12pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 14pt;
    margin-bottom: 6pt;
    page-break-after: avoid;
}

h4 {
    font-size: 11pt;
    font-weight: 600;
    color: #334155;
    margin-top: 10pt;
    margin-bottom: 4pt;
    page-break-after: avoid;
}

p, ul, ol {
    margin-top: 4pt;
    margin-bottom: 8pt;
}

li {
    margin-bottom: 3pt;
}

hr {
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 16pt 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0 14pt 0;
    font-size: 9pt;
    page-break-inside: avoid;
}

th {
    background-color: #0f172a;
    color: #ffffff;
    font-weight: 700;
    text-align: left;
    padding: 7px 10px;
    border: 1px solid #334155;
}

td {
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
}

tr:nth-child(even) td {
    background-color: #f8fafc;
}

code {
    font-family: "JetBrains Mono", "Cascadia Code", Consolas, Courier, monospace;
    font-size: 8.8pt;
    background-color: #f1f5f9;
    color: #0369a1;
    padding: 1.5px 4px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
}

pre {
    background-color: #0f172a;
    color: #f8fafc;
    padding: 12pt;
    border-radius: 6px;
    font-family: "JetBrains Mono", "Cascadia Code", Consolas, Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    overflow-x: auto;
    page-break-inside: avoid;
    margin: 8pt 0 12pt 0;
}

pre code {
    background-color: transparent;
    color: #e2e8f0;
    padding: 0;
    border: none;
}

blockquote {
    border-left: 4px solid #0284c7;
    background-color: #f0f9ff;
    padding: 8pt 12pt;
    margin: 8pt 0;
    color: #0c4a6e;
    border-radius: 0 4px 4px 0;
    page-break-inside: avoid;
}

blockquote p {
    margin: 0;
}

.page-break {
    page-break-before: always;
}
"""

def convert_md_to_pdf(md_filename):
    md_path = os.path.join(DOCS_DIR, md_filename)
    base_name = os.path.splitext(md_filename)[0]
    html_path = os.path.join(DOCS_DIR, f"{base_name}_temp.html")
    pdf_path = os.path.join(DOCS_DIR, f"{base_name}.pdf")

    print(f"Reading {md_path}...")
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    md = MarkdownIt("commonmark", {"html": True, "breaks": True}).enable("table")
    html_content = md.render(md_text)

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{base_name}</title>
<style>
{CSS_STYLES}
</style>
</head>
<body>
{html_content}
</body>
</html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"Printing to PDF via Edge Headless: {pdf_path}...")
    cmd = [
        EDGE_PATH,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        html_path
    ]

    subprocess.run(cmd, check=True)
    if os.path.exists(html_path):
        os.remove(html_path)

    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"Generated: {pdf_path} ({size_kb:.1f} KB)")
    return pdf_path

def main():
    files = [
        "DBMS_Level3_Project_Report_ReliefChain.md",
        "DBMS_Level3_Comprehensive_Viva_Report.md"
    ]
    for f in files:
        convert_md_to_pdf(f)
    print("\nAll PDFs generated successfully!")

if __name__ == "__main__":
    main()
