#!/usr/bin/env python3
"""Create the selectable-text USA Map Studio install and user guide."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "USA-Map-Studio-User-Guide.pdf"
SCREENSHOT = ROOT / "docs" / "assets" / "usa-map-studio-overview.png"
PAGE_W, PAGE_H = letter

GREEN = HexColor("#00662C")
NAVY = HexColor("#00454D")
DARK = HexColor("#373A36")
ENERGY = HexColor("#7DBA00")
MIST = HexColor("#8BFEBF")
BIOME = HexColor("#00B38F")
AQUA = HexColor("#00BDB5")
BLUE = HexColor("#006BA6")
HYDRO = HexColor("#005776")
FORGE = HexColor("#FF9E1B")
SPARK = HexColor("#FE5000")
PLASMA = HexColor("#B50094")
PULSAR = HexColor("#4E008E")
GRAPHITE = HexColor("#DBDCDB")
SOFT_GREEN = HexColor("#EAF4EC")
SOFT_NAVY = HexColor("#E8F0F1")
PALE = HexColor("#F3F6F4")
BORDER = HexColor("#C8D3CE")
WHITE = white


def wrapped(pdf, text, x, y, width, font="Helvetica", size=9, leading=12, color=DARK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and stringWidth(candidate, font, size) > width:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def label(pdf, text, x, y, color=GREEN):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold", 8.2)
    pdf.drawString(x, y, text.upper())


def page_header(pdf, eyebrow, title, subtitle, page_number):
    pdf.setFillColor(GREEN)
    pdf.rect(0, PAGE_H - 142, PAGE_W, 142, stroke=0, fill=1)
    pdf.setFillColor(NAVY)
    pdf.rect(PAGE_W - 18, PAGE_H - 142, 18, 142, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(0, PAGE_H - 148, PAGE_W, 6, stroke=0, fill=1)
    label(pdf, eyebrow, 40, 758, WHITE)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 26)
    pdf.drawString(40, 717, title)
    pdf.setFont("Helvetica", 10.2)
    pdf.drawString(40, 690, subtitle)
    pdf.setFont("Helvetica-Bold", 31)
    pdf.drawRightString(570, 697, f"0{page_number}")


def footer(pdf, page_number):
    pdf.setFillColor(DARK)
    pdf.rect(0, 0, PAGE_W, 48, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica", 7.2)
    pdf.drawString(40, 28, "USA Map Studio | Local desktop quick start | August 6, 2026")
    pdf.drawRightString(572, 28, f"PAGE {page_number} OF 6")


def code_box(pdf, title, lines, x, y, width, height, accent):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, height, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y + height - 30, width, 30, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x + 13, y + height - 20, title)
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 6.6)
    cursor = y + height - 48
    for line in lines:
        pdf.drawString(x + 13, cursor, line)
        cursor -= 12


def step_card(pdf, number, title, body, x, y, width, height, fill=SOFT_GREEN, accent=GREEN):
    pdf.setFillColor(fill)
    pdf.rect(x, y, width, height, stroke=0, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y, 5, height, stroke=0, fill=1)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(x + 14, y + height - 21, f"{number}  {title}")
    wrapped(pdf, body, x + 14, y + height - 39, width - 28, size=7.7, leading=10.4)


def bullet(pdf, title, body, x, y, width, accent=GREEN):
    pdf.setFillColor(accent)
    pdf.circle(x + 5, y - 2, 3, stroke=0, fill=1)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 8.7)
    pdf.drawString(x + 16, y, title)
    return wrapped(pdf, body, x + 16, y - 15, width - 16, size=8.1, leading=10.8)


def palette_row(pdf, title, entries, x, y, width):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, 74, stroke=1, fill=1)
    label(pdf, title, x + 12, y + 55)
    cell_width = (width - 24) / len(entries)
    for index, (name, value, color) in enumerate(entries):
        cell_x = x + 12 + index * cell_width
        pdf.setFillColor(color)
        pdf.setStrokeColor(DARK if value in ("#FFFFFF", "#DBDCDB") else color)
        pdf.rect(cell_x, y + 22, 20, 20, stroke=1, fill=1)
        pdf.setFillColor(NAVY)
        pdf.setFont("Helvetica-Bold", 5.8)
        pdf.drawString(cell_x + 25, y + 34, name)
        pdf.setFillColor(DARK)
        pdf.setFont("Courier", 5.5)
        pdf.drawString(cell_x + 25, y + 24, value)


def build_pdf(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1)
    pdf.setTitle("USA Map Studio User Guide")
    pdf.setAuthor("USA Map Studio")
    pdf.setSubject("macOS and Windows setup, CSV import, custom SVG pins, ORNL color swatches, exports, and local MCP control")

    page_header(pdf, "No signed installer required | macOS and Windows", "Install from source.", "One verified script prepares, builds, checks, and starts the local desktop app.", 1)
    label(pdf, "Before you begin", 40, 614)
    wrapped(pdf, "Use Terminal on Mac or PowerShell on Windows as a normal user. The first setup needs internet access for application dependencies and a private Node.js runtime when a compatible system copy is unavailable.", 40, 595, 532, size=9.1, leading=12.4)
    code_box(pdf, "Mac - Terminal", [
        "git clone https://github.com/adammalin/Map-Maker-Studio.git \\",
        "  \"$HOME/Map-Maker-Studio\"",
        "cd \"$HOME/Map-Maker-Studio\"",
        "/bin/zsh scripts/setup-macos.zsh",
    ], 40, 398, 532, 142, GREEN)
    code_box(pdf, "Windows - PowerShell", [
        "git clone https://github.com/adammalin/Map-Maker-Studio.git `",
        "  \"$env:USERPROFILE\\Map-Maker-Studio\"",
        "Set-Location \"$env:USERPROFILE\\Map-Maker-Studio\"",
        "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `",
        "  -File \".\\scripts\\setup-windows.ps1\"",
    ], 40, 202, 532, 168, NAVY)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 77, 532, 96, stroke=0, fill=1)
    label(pdf, "What setup does", 56, 149)
    wrapped(pdf, "The script installs exact dependencies, builds the Electron interface, and runs a hidden map/UI smoke check. It does not create a DMG, PKG, MSI, or EXE installer, disable Gatekeeper, or make system-wide changes. Later, double-click Start-USA-Map-Studio.command on Mac or Start-USA-Map-Studio.cmd on Windows.", 56, 129, 500, size=8.2, leading=11.1)
    footer(pdf, 1)
    pdf.showPage()

    page_header(pdf, "Workspace overview | accurate local geography", "Build the map visually.", "A focused canvas, location list, and inspector keep every change visible.", 2)
    if SCREENSHOT.exists():
        image = ImageReader(str(SCREENSHOT))
        pdf.drawImage(image, 40, 314, width=532, height=320, preserveAspectRatio=True, anchor="c", mask="auto")
        pdf.setStrokeColor(BORDER)
        pdf.rect(40, 314, 532, 320, stroke=1, fill=0)
    step_card(pdf, "1", "IMPORT", "Choose Import CSV. City/state-only rows resolve against the bundled Census place index; exact latitude and longitude take priority.", 40, 190, 166, 96)
    step_card(pdf, "2", "EDIT", "Select a row or pin. Change coordinates, import a custom SVG symbol, choose color swatches, and edit labels, notes, and visibility.", 223, 190, 166, 96, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "STYLE", "Click a state for its own fill. Set canvas, state and county lines, label halo, state abbreviations, and legend globally.", 406, 190, 166, 96, PALE, BLUE)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 86, stroke=0, fill=1)
    label(pdf, "Map controls", 56, 139, ENERGY)
    wrapped(pdf, "Use the mouse wheel to zoom, drag the map background to pan, and choose Fit view to reset. Drag a pin for a visual adjustment; enter or resolve coordinates for an exact location. Editor selection outlines never appear in an export.", 56, 119, 500, font="Helvetica-Bold", size=8.2, leading=11.2, color=WHITE)
    footer(pdf, 2)
    pdf.showPage()

    page_header(pdf, "CSV intake and complete projects", "Bring data in. Keep it whole.", "Flexible columns feed a versioned project file that can be saved and reopened.", 3)
    label(pdf, "Minimum CSV", 40, 614)
    code_box(pdf, "Two columns are enough", ["city,state", "Oak Ridge,TN", "Seattle,WA"], 40, 508, 254, 82, GREEN)
    code_box(pdf, "Or supply exact coordinates", ["city,state,latitude,longitude", "Denver,CO,39.7392,-104.9903"], 318, 508, 254, 82, NAVY)
    label(pdf, "Optional visual fields", 40, 478)
    y = bullet(pdf, "Labels", "label, show_label, label_color, and label_position (right, left, above, or below).", 40, 456, 250)
    y = bullet(pdf, "Pins", "pin_type (pin, circle, square, diamond, or star), pin_color, and pin_size from 6 through 40. Custom SVG pins are added in the inspector.", 40, y - 5, 250, BLUE)
    bullet(pdf, "Additional data", "notes plus any custom columns. Unknown columns stay in customData and return with the project.", 40, y - 58, 250, FORGE)
    y2 = bullet(pdf, "Review before adding", "The import summary separates ready rows from unresolved or malformed rows. Choose Add or Replace deliberately.", 318, 456, 254)
    y2 = bullet(pdf, "Save project", "Save project creates a .usmap.json file containing map styling, every location, embedded custom SVG pins, labels, custom data, schema, and timestamps.", 318, y2 - 5, 254, BLUE)
    bullet(pdf, "Open project", "Opening validates the schema and required fields before replacing the canvas. Unsupported or unrelated JSON is rejected.", 318, y2 - 58, 254, FORGE)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 77, 532, 116, stroke=0, fill=1)
    label(pdf, "Coordinate rule", 56, 168)
    wrapped(pdf, "When latitude and longitude are blank, the app matches city and state to one of 32,350 representative points from the 2025 U.S. Census National Places Gazetteer. If both coordinates are supplied, the app preserves them. An unresolved place stays out of the map and appears in the import issue list so it cannot be plotted silently at the wrong location.", 56, 147, 500, size=8.4, leading=11.4)
    footer(pdf, 3)
    pdf.showPage()

    page_header(pdf, "Publish and recover | local-first workflow", "Export what you see.", "SVG, PNG, PowerPoint, and project JSON share one composition.", 4)
    step_card(pdf, "1", "SVG", "Best for scalable artwork and downstream design tools. State lines, labels, pins, and legend remain vector content.", 40, 516, 120, 92)
    step_card(pdf, "2", "PNG", "A 2400 x 1440 raster image for documents, email, and quick review.", 174, 516, 120, 92, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "PPTX", "A one-slide 16:9 PowerPoint with the map embedded as scalable vector artwork and source notes.", 308, 516, 120, 92, PALE, BLUE)
    step_card(pdf, "4", "JSON", "The complete editable project, including embedded custom pin artwork. Reopen it to continue work.", 442, 516, 130, 92, SOFT_GREEN, GREEN)
    label(pdf, "Good working sequence", 40, 478)
    bullet(pdf, "1  Save the project", "Keep a .usmap.json source file before making presentation-specific variations.", 40, 456, 532)
    bullet(pdf, "2  Export the audience copy", "Choose SVG, PNG, or PowerPoint after checking title, labels, state colors, and legend at Fit view.", 40, 402, 532, BLUE)
    bullet(pdf, "3  Keep source and output together", "Store the CSV and project JSON beside exported artwork when the map must be reproduced later.", 40, 348, 532, FORGE)
    label(pdf, "Troubleshooting", 40, 292)
    wrapped(pdf, "Setup fails: rerun the setup script; it repairs dependencies and rebuilds safely. A city is unresolved: add exact latitude and longitude or use the official Census place name. Labels overlap: select a location and move its label left, right, above, or below. The app is not built: run the setup script instead of the start shortcut.", 40, 273, 532, size=8.8, leading=12)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 118, stroke=0, fill=1)
    label(pdf, "Local data boundary", 56, 171, ENERGY)
    wrapped(pdf, "Normal editing, place lookup, map rendering, and export run locally. USA Map Studio does not send CSV or project content to a service. Files are written only to locations you choose. The bundled map and place data come from U.S. Census Bureau 2025 Cartographic Boundary and Gazetteer files.", 56, 149, 500, font="Helvetica-Bold", size=8.4, leading=11.6, color=WHITE)
    footer(pdf, 4)
    pdf.showPage()

    page_header(pdf, "Optional local integration | Model Context Protocol", "Let AI prepare. You decide.", "ChatGPT desktop, Codex, and compatible local clients can stage map changes for review.", 5)
    step_card(pdf, "1", "KEEP THE APP OPEN", "The setup script registers usa_map_studio. Restart the AI client, open USA Map Studio, then use /mcp to confirm the connection.", 40, 516, 166, 100)
    step_card(pdf, "2", "ASK FOR A DRAFT", "The AI reads the named open project, uses its current timestamp, and stages one proposal. No map or saved file changes yet.", 223, 516, 166, 100, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "REVIEW IN THE APP", "Compare Before and After. Apply to the working map or Reject. Save the project separately only after checking the canvas.", 406, 516, 166, 100, PALE, BLUE)
    label(pdf, "Manual connection commands", 40, 478)
    code_box(pdf, "Register or repair", [
        "npm run mcp:install",
        "# Restart ChatGPT desktop or Codex, then use /mcp",
    ], 40, 380, 254, 78, GREEN)
    code_box(pdf, "Remove managed connection", [
        "npm run mcp:remove",
        "# Existing unrelated MCP settings remain in place",
    ], 318, 380, 254, 78, NAVY)
    label(pdf, "What the AI can do", 40, 346)
    bullet(pdf, "Read", "Check app status, read the complete current project, list locations, and validate project JSON.", 40, 324, 250)
    bullet(pdf, "Prepare", "Stage CSV imports, exact locations, custom SVG pins, location edits, removals, map styling, or a complete project replacement.", 40, 270, 250, BLUE)
    bullet(pdf, "Cannot bypass review", "Write tools create one pending proposal. They cannot click Apply, write an export, or silently save project JSON.", 318, 324, 254, FORGE)
    bullet(pdf, "Stale changes stop", "If the working map changes after the AI reads it, the proposal must be rebuilt from the current project.", 318, 270, 254, GREEN)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 130, stroke=0, fill=1)
    label(pdf, "Privacy boundary", 56, 182, ENERGY)
    wrapped(pdf, "The bridge listens only on this computer and uses a new random token for each app launch. Project data stays local until a read tool returns it to the connected AI conversation. Use only an AI client approved for the map content. ChatGPT web cannot directly reach this private desktop bridge; that would require a separate hosted plugin.", 56, 160, 500, font="Helvetica-Bold", size=8.3, leading=11.4, color=WHITE)
    footer(pdf, 5)
    pdf.showPage()

    page_header(pdf, "Custom visual system | portable project assets", "Import a pin. Reuse the palette.", "SVG artwork stays with the project, and named ORNL swatches stay one click away.", 6)
    label(pdf, "Custom SVG pin workflow", 40, 614)
    step_card(pdf, "1", "IMPORT", "Select a location, choose Import custom SVG pin, and select a vector-only .svg file up to 500 KB.", 40, 508, 166, 82)
    step_card(pdf, "2", "COLOR", "Use currentColor in the SVG when the design should follow each location's pin color. Otherwise, embedded SVG fills are preserved.", 223, 508, 166, 82, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "SAVE", "The sanitized SVG is stored inside .usmap.json. Move or share that one project file without losing the pin artwork.", 406, 508, 166, 82, PALE, BLUE)
    palette_row(pdf, "Primary", [
        ("ORNL Green", "#00662C", GREEN),
        ("Hale Navy", "#00454D", NAVY),
        ("Graphite", "#DBDCDB", GRAPHITE),
        ("Polar", "#FFFFFF", WHITE),
        ("Dark Matter", "#373A36", DARK),
    ], 40, 397, 532)
    palette_row(pdf, "Secondary", [
        ("Energy", "#7DBA00", ENERGY),
        ("Mist", "#8BFEBF", MIST),
        ("Biome", "#00B38F", BIOME),
        ("Aqua", "#00BDB5", AQUA),
        ("Infinity", "#006BA6", BLUE),
        ("Hydro", "#005776", HYDRO),
    ], 40, 300, 532)
    palette_row(pdf, "Accent", [
        ("Forge", "#FF9E1B", FORGE),
        ("Spark", "#FE5000", SPARK),
        ("Plasma", "#B50094", PLASMA),
        ("Pulsar", "#4E008E", PULSAR),
    ], 40, 203, 532)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 77, 532, 96, stroke=0, fill=1)
    label(pdf, "Safe by design", 56, 149, ENERGY)
    wrapped(pdf, "The importer removes scripts, event handlers, external references, embedded raster images, styles, and unsupported elements before display or save. ORNL swatches are a draft-production aid: check contrast, use accent colors sparingly, and complete the normal communications review before release.", 56, 128, 500, font="Helvetica-Bold", size=8.1, leading=11.1, color=WHITE)
    footer(pdf, 6)
    pdf.save()


if __name__ == "__main__":
    build_pdf(OUTPUT)
    print(OUTPUT)
