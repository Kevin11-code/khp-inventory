# KHP Inventory: Product Design Document

## 1. Product Overview

**Product Name**: KHP Steelworks Inventory (branded internally as "Steel IMS" for Shri Steel Works)

**Purpose**: A secure desktop application designed to manage the full inventory lifecycle of metal products — from raw material procurement (steel coils and pattas) through manufacturing stages (cutting, pressing, and polishing) into finished utensils. The app targets small-to-medium steel fabrication workshops that outsource processing to third-party vendors while also performing some in-house operations.

**Key Differentiator**: The app launches into a stealthy "Calculator Lock" screen that disguises the entire application as a standard calculator. Only users who know a specific mathematical unlock sequence can access the inventory management interface, providing privacy in shared or public workspaces.

---

## 2. Architecture & Technology Stack

### 2.1 Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 (functional components with hooks) |
| Build Tool | Vite 6 |
| Styling | Inline styles + injected `<style>` tags (no CSS framework) |
| Font | Inter, system-ui fallback stack |
| State Management | React `useState` + `useEffect` with callback-based persistence |

### 2.2 Backend / Desktop Shell
| Layer | Technology |
|-------|-----------|
| Runtime | Tauri 2.5.0 (Rust) |
| CLI | `@tauri-apps/cli` 2.11.2 |
| IPC | Tauri `invoke` commands (`load_app_state`, `save_app_state`, `verify_unlock_code`) |
| Window Management | Tauri `getCurrentWindow` API for dynamic resize/title/resizability |

### 2.3 Database
| Component | Detail |
|-----------|--------|
| Engine | SQLite 0.32 (bundled via `rusqlite`) |
| Location | Platform-specific app data directory (`khp-inventory.sqlite3`) |
| Schema | 3 tables: `app_state`, `auth_credentials`, `auth_events` |
| Migration | Single migration file: `migrations/001_initial.sql` |
| Seeding | JSON seed file: `seed/app_state.json` loaded on first run |

### 2.4 Security
| Mechanism | Implementation |
|-----------|---------------|
| Password Hashing | Argon2 (v0.5) with random salt via `OsRng` |
| Unlock Code Verification | Backend Argon2 comparison; fallback to hardcoded `"2026+11="` in browser dev mode |
| Session Management | `sessionStorage` flag (`khp_inventory_unlocked`) — cleared on tab close |
| Auth Event Logging | Every unlock attempt (success/failure) recorded in `auth_events` table |
| Idle Auto-Lock | 15-minute inactivity timeout resets to calculator screen |

### 2.5 Dependencies (from `Cargo.toml`)
```
argon2 = "0.5"
password-hash = "0.5"
rand_core = "0.6"
rusqlite = "0.32" (bundled)
serde = "1" (derive)
serde_json = "1"
tauri = "2.5.0"
tauri-plugin-shell = "2.2.0"
thiserror = "2"
```

---

## 3. Core Features

### 3.1 Stealth Mode — Calculator Lock (`CalculatorLock.jsx`)

**Behavior on Launch**:
- App opens in a fixed 360×520px non-resizable window titled "Calculator"
- Full-screen calculator UI with dark theme (`#15171c` background)

**Calculator Functionality**:
- Standard 4×5 grid layout: digits 0-9, operators (`+`, `-`, `×`, `÷`), `%`, `.`, `C`, `⌫`, `=`
- Expression-based evaluation using `Function()` with strict regex sanitization (`/^[\d.+\-×÷\s]+$/`)
- Keyboard support: `Enter` = `=`, `Escape` = `C`, `Backspace` = `⌫`, `*` = `×`, `/` = `÷`
- Display shows current expression; history line shows previous expression
- Error display for invalid input

**Unlock Mechanism**:
- When `=` or `%` is pressed, the full expression (e.g., `"2026+11="`) is sent to `verifyUnlockCode()`
- Backend normalizes (strips whitespace), retrieves stored Argon2 hash from `auth_credentials`, and verifies
- On success: `onUnlock()` callback fires → session set → window transitions to inventory mode
- On failure: calculator evaluates the expression normally (plausible deniability)

### 3.2 Inventory Management — 5-Stage Pipeline

The app tracks materials through a linear production pipeline. Each stage has a dedicated page and color-coded identity:

| Stage | Color | ID Prefix | Statuses |
|-------|-------|-----------|----------|
| Raw Material | Blue (`#58a6ff`) | `RM-` | `Issued` |
| Cutting | Orange (`#f0a500`) | `CJ-` | `In Progress`, `Completed` |
| Pressing | Teal (`#2dd4bf`) | `PR-` | `Dispatched`, `Done` |
| Polishing | Purple (`#bc8cff`) | `PL-` | `Sent`, `Partial`, `Done` |
| Finished | Green (`#3fb950`) | — | `Done` |

#### 3.2.1 Raw Material (`RawMaterial` component)

**Data Model** (`rawMaterials[]`):
- `id`, `date`, `supplier`, `matType` (Coil/Patta), `grade`, `gauge`, `purchaseKg`, `ratePerKg`, `vendor` (assigned cutting vendor), `status`

**Grade Options**:
- Coil grades: `DD`, `SDM`, `EDD`, `HDD`, `CQ`
- Patta grades: `J/4`, `J/5`, `J/6`, `J/7`, `J/8`
- Gauges: `18g`, `20g`, `22g`, `24g`, `26g`

**Workflow**:
1. User fills purchase form: material type, supplier, grade, gauge, weight, rate, cutting vendor, cutting factor
2. On save: **two records are created simultaneously**:
   - A `RawMaterial` record (status: `Issued`)
   - A `CuttingJob` record (status: `In Progress`) linked via `rmId`
3. Live preview shows calculated circle rate: `ratePerKg × cuttingFactor`

**Summary Stats**: Total Purchased (kg), Total Lots, Average Rate (₹/kg)

#### 3.2.2 Cutting (`Cutting` component)

**Three Sub-Views** (tabbed):

**a) Dispatch Jobs** — Table of all cutting jobs:
- Columns: Job ID, Date, RM Lot, Vendor, Sent (kg), Received (kg), Pending (kg), Scrap (kg), Factor, Circle Rate, Settlement, Status, Actions
- Actions: `+ Receipt` button, `✓ Complete` button (for In Progress jobs)
- Settlement calculation: `rmTotalCost - circlesValue` (positive = vendor refunds you; negative = you pay extra)

**b) Circle Receipts** — Grouped by cutting job:
- Each job card shows: vendor, sent weight, circle cost/kg, status, mark-complete button
- Visual weight distribution bar showing received kg by size (color-coded segments)
- Cost breakdown box (when job is complete): RM Paid, Circles Value, Settlement, Circle Cost/kg

**c) Stock by Size** — Grid of circle sizes with total kg in stock:
- Only counts circles from `Completed` jobs
- Sizes: 10", 11", 12", 13", 14", 15", 16", 17", 18", 20", 22", 24"

**Receipt Modal**:
- Select cutting job (shows sent/received/pending context)
- Select circle size, enter received kg, date
- Validation: cannot exceed sent weight for the job

#### 3.2.3 Pressing (`Pressing` component)

**Data Model** (`pressing[]`):
- `id`, `dispatchDate`, `receivedDate`, `vendor`, `ccJobId`, `circleSize`, `sentKg`, `receivedKg`, `pressRate`, `utensil`, `status`

**Utensil Types**: Plate, Bowl, Thali, Pot, Kadai, Tope, Patila, Degchi, Paraat, Tray

**Vendor Options**: Self, Kapoor Press, Srinath Press Works, Dilip Pressing, Arjun Press

**Workflow**:
1. Dispatch Modal: select cutting job → select available circle size (shows available stock + cost/kg) → enter utensil type, vendor, sent kg, press rate (₹/kg), dispatch date
2. Stock-aware dispatch: available kg = total received from cutting job − already allocated to other pressing batches
3. Record Return: inline form on pending batches to enter received kg + date
4. Status auto-set: `Done` when returned

**Cost Calculation** (`getPressedCostPerKg`):
```
lossKg = max(0, sentKg - receivedKg)
circleCost = getCircleCostPerKg(data, ccJobId)
addlCost = (receivedKg × pressRate) + (lossKg × circleCost)
addlPerKg = addlCost / receivedKg
finalCost = circleCost + addlPerKg
```

**Summary Stats**: Total Sent, Received Back, Awaiting Return (count), In-house vs Outsourced ratio

#### 3.2.4 Polishing (`Polishing` component)

**Data Model** (`polishing[]`):
- `id`, `dispatchDate`, `receivedDate`, `vendor`, `prId`, `sentKg`, `returnedKg`, `polishRate`, `status`

**Workflow**:
1. Dispatch Modal: select polishing vendor → select completed pressing batch (shows utensil, kg, cost/kg) → enter sent kg, polish rate (₹/kg), dispatch date
2. Record Return: inline form on pending batches
3. Status logic: `Done` if `returnedKg >= sentKg`, otherwise `Partial`

**Cost Calculation** (`getPolishedCostPerKg`):
```
lossKg = max(0, sentKg - returnedKg)
pressedCost = getPressedCostPerKg(data, prId)
addlCost = (returnedKg × polishRate) + (lossKg × pressedCost)
addlPerKg = addlCost / returnedKg
finalCost = pressedCost + addlPerKg
```

**Summary Stats**: Sent Out (kg), Returned (kg), Still Out (kg)

#### 3.2.5 Vendor Management (`Vendors` component)

**Vendor Types** (filterable):
| Type | Label | Color |
|------|-------|-------|
| `rm` | RM Suppliers | Blue |
| `cutting` | Cutting | Orange |
| `pressing` | Pressing | Teal |
| `polishing` | Polishing | Purple |
| `other` | Other | Muted |

**Vendor Data Model**:
- `id` (auto-generated `V-XXX`), `type`, `name`, `contact`, `city`, `notes`

**Features**:
- Filter pills with count badges
- Add/Edit/Delete via modal form
- Table display with type-colored pills

### 3.3 Dashboard & Analytics

#### 3.3.1 Overview Page (`Dashboard` component)

**KPI Grid** (4 cards):
1. **RM Purchased** — total kg across all raw materials
2. **Circles in Stock** — total kg from completed cutting jobs
3. **Polished Ready** — total returned kg from polishing
4. **Needs Attention** — count of in-progress cutting + dispatched pressing + non-done polishing

**Quick Actions** (5 buttons):
- New Purchase → Raw Material page
- Circle Receipt → Cutting page
- Pressing Return → Pressing page
- Polish Return → Polishing page
- Review Costs → Cost Summary page

**Material Flow Visualization**:
- Horizontal bar chart showing kg at each pipeline stage:
  Purchased → At Cutter → Circles → Pressed → Polishing → Ready
- Color-coded bars proportional to max kg

**Recent Data Tables**:
- Recent Raw Material (latest 4 lots)
- Latest Finished Movement (latest 4 polishing returns with cost)

**Today's Work Panel**:
- Alert cards for items needing action:
  - In-progress cutting jobs ("needs circle receipts")
  - Dispatched pressing batches ("awaiting return")
  - Non-done polishing batches ("pending from vendor")
- Each alert is clickable → navigates to relevant page
- Color-coded by stage

**Cost Chain Panel**:
- Shows per-kg cost progression for the most recent raw material:
  Raw Material → After Cutting → After Pressing → After Polishing
- Each stage shows cost with color-coded indicator dot
- Shows total added cost from raw to polished

#### 3.3.2 Cost Summary Page (`Costs` component)

**Per-Lot Cost Breakdown**:
- For each raw material lot, displays a 4-column grid:
  Raw Material | After Cutting | After Pressing | After Polishing
- Each column shows:
  - Cost per kg (₹/kg) in large font
  - Cost delta from previous stage (red, "+₹X/kg added")
  - Visual progress bar (relative to max cost)
  - Context note (vendor, factor, yield %)
- Footer shows total cost added and final cost/kg

**Formula Reference Banner**:
- Cutting: `rateWithCut = rmRate × factor`, `settlement = rmPaid − circlesValue`
- Pressing/Polishing: `addlCost = (recKg × labour) + (lossKg × prevCost)`, `newCost = prevCost + addlCost / recKg`

#### 3.3.3 Settlement Ledger (`Settlement` component)

**Purpose**: Track financial settlements with cutting vendors based on material exchange.

**Summary Stats**:
- Net Settlement (total across all completed jobs) — green if vendors owe you, red if you owe them
- Total Scrap (kg) — noted as "Vendor's property"
- Completed Jobs count

**Ledger Table**:
- Columns: Date, Job, Vendor, Sent, Circles, Scrap, Factor, Circle Rate, RM Paid, Circles Value, Settlement, Cost/kg
- Settlement displayed as `+₹X refund` (green) or `₹X pay` (red)

---

## 4. User Interface (UI) and Experience (UX)

### 4.1 Theme System

**Color Palette** (defined in `C` constant):
```
bg:       #0d1117  (page background)
surface:  #161b22  (header, inputs)
card:     #1c2333  (card backgrounds)
border:   #30363d  (dividers, borders)
accent:   #f0a500  (primary action color)
text:     #e6edf3  (primary text)
muted:    #7d8590  (secondary text)
subtle:   #3d444d  (tertiary elements)
green:    #3fb950  (success/done)
red:      #f85149  (error/loss)
blue:     #58a6ff  (raw material)
orange:   #f0a500  (cutting)
teal:     #2dd4bf  (pressing)
purple:   #bc8cff  (polishing)
```

**Stage-to-Color Mapping**:
```javascript
const STAGE_COLORS = {
  "Raw Material": C.blue,
  Cutting: C.orange,
  Pressing: C.teal,
  Polishing: C.purple,
  Done: C.green,
};
```

### 4.2 Layout Architecture

**Two-Column Shell** (`.inventory-shell`):
```
+------------------+------------------------------------------+
|                  |  .app-header (sticky, 76px min-height)   |
|  .side-nav       |------------------------------------------|
|  (232px wide)    |                                          |
|                  |  .content-wrap (max-width: 1560px)       |
|  - Brand block   |                                          |
|  - Nav buttons   |  Page-specific content                   |
|  - Alert badge   |                                          |
|                  |                                          |
+------------------+------------------------------------------+
```

**Responsive Breakpoint** (`@media max-width: 1100px`):
- Sidebar collapses to 76px (icon-only)
- Brand subtitle, nav labels, and nav badges hidden
- Nav buttons centered
- Dashboard grid switches to single column
- KPI grid: 4 → 2 columns
- Quick actions grid: 5 → 2 columns

### 4.3 Component Library

| Component | Purpose | Variants/Props |
|-----------|---------|----------------|
| `Pill` | Status badges with colored background, border, and optional dot | `label`, `color` (green/red/orange/blue/teal/purple/muted), `dot` |
| `Btn` | Action buttons | `variant` (primary/outline/ghost/danger/success), `size` (sm/md/lg), `disabled`, `full` |
| `Modal` | Overlay dialogs | `title`, `onClose`, `width` (default 480), backdrop click to dismiss |
| `Field` | Form field wrapper with label and optional hint | `label`, `hint`, children |
| `KV` | Key-value display pair | `label`, `value`, `color` |
| `Box` | Card container with border | `children`, `color` (tints border), `style` |
| `StatCard` | Dashboard metric card | `label`, `value`, `sub`, `color`, `icon` |
| `EmptyState` | Empty list placeholder | `icon`, `text` |
| `AlertBanner` | Warning banner with bullet list | `items` (array of strings) |
| `PanelHeader` | Card header with title/subtitle/action | `title`, `subtitle`, `action` |
| `Section` | Content section with title and optional action | `title`, `action`, `children` |
| `PipelineBar` | Visual production stage progress indicator | `active` (current stage name) |
| `CostChip` | Per-kg cost display with label | `label`, `cost`, `color` |

### 4.4 Navigation

**Page Configuration** (`PAGES` array):
```javascript
[
  { id: "home",       label: "Overview",     icon: "⌂" },
  { id: "raw",        label: "Raw Material", icon: "📦", stage: "Raw Material" },
  { id: "cutting",    label: "Cutting",      icon: "✂",  stage: "Cutting" },
  { id: "pressing",   label: "Pressing",     icon: "🔨", stage: "Pressing" },
  { id: "polishing",  label: "Polishing",    icon: "✨", stage: "Polishing" },
  { id: "costs",      label: "Cost Summary", icon: "₹" },
  { id: "settlement", label: "Settlement",   icon: "⚖" },
  { id: "vendors",    label: "Vendors",      icon: "👥" },
]
```

**Header Elements**:
- Page title + subtitle ("Production stage" or "Workspace")
- PipelineBar (visible only on production stage pages)
- Save status indicator ("Saved locally" / "Save issue")
- Lock button (returns to calculator screen)

**Sidebar Badge**: Orange notification badge on "Overview" showing count of items needing attention.

---

## 5. Data Flow & Storage

### 5.1 Application State Shape

```typescript
interface AppState {
  data: {
    rawMaterials: RawMaterial[];
    cuttingJobs: CuttingJob[];
    circleReceipts: CircleReceipt[];
    pressing: PressingBatch[];
    polishing: PolishingBatch[];
  };
  vendors: Vendor[];
}
```

### 5.2 Persistence Layer

**Desktop Bridge** (`desktopBridge.js`):
- Detects Tauri environment via `window.__TAURI_INTERNALS__`
- **With Tauri**: invokes Rust commands (`load_app_state`, `save_app_state`, `verify_unlock_code`)
- **Without Tauri** (browser dev): falls back to `localStorage` / `sessionStorage`

**State Sync Flow**:
1. `App` component loads state via `loadAppState()` on mount
2. Falls back to `initData` + `initVendors` if no saved state
3. `InventoryApp` maintains `data` and `vendors` in local state
4. `useEffect` on `[data, vendors]` triggers `onStateChange` callback
5. `persistState` callback saves to backend and updates `appState`
6. Save errors displayed in header and as a fixed toast notification

### 5.3 Database Schema

```sql
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  attempted_at TEXT NOT NULL
);
```

**Design Rationale**: The entire inventory state is serialized as a single JSON object stored under `key = 'inventory_state'` in the `app_state` table. This avoids complex relational schema migrations and allows flexible frontend data structures.

### 5.4 Initialization Sequence

1. Tauri app starts → `init_database()` runs
2. Database created at platform app data dir → `khp-inventory.sqlite3`
3. `run_migrations()` executes `001_initial.sql`
4. `seed_database()` checks for existing state:
   - If no `inventory_state` exists → loads `seed/app_state.json`
   - If no auth credentials exist → hashes default unlock code `"2026+11="` with Argon2
5. Frontend loads → `loadAppState()` retrieves state from DB
6. Calculator Lock screen displays

### 5.5 Window Mode Transitions

**Calculator Mode** (locked):
- Title: "Calculator"
- Size: 360×520px (fixed, non-resizable)
- Centered on screen

**Inventory Mode** (unlocked):
- Title: "KHP Steelworks Inventory"
- Min size: 960×640px
- Resizable: true
- Maximized on unlock

**Transitions**:
- Unlock: `setSessionUnlocked(true)` → `setInventoryWindowMode()` → `setUnlocked(true)`
- Lock (manual): Lock button → `setSessionUnlocked(false)` → `setCalculatorWindowMode()` → `setUnlocked(false)`
- Lock (idle): 15-min timeout on no user activity (mousemove, mousedown, keydown, touchstart)

---

## 6. Cost Calculation Engine

### 6.1 Cutting Stage

```
rateWithCutting = rm.ratePerKg × cuttingJob.cuttingFactor
rmTotalCost = job.sentKg × rm.ratePerKg
circlesValue = totalCirclesKg × rateWithCutting
settlement = rmTotalCost - circlesValue  (cash adjustment with vendor)
costPerKg = rateWithCutting  (only when job is Completed)
scrapKg = job.sentKg - totalCirclesKg  (belongs to vendor)
```

### 6.2 Pressing Stage

```
circleCost = getCircleCostPerKg(data, ccJobId)
lossKg = max(0, sentKg - receivedKg)
laborCost = receivedKg × pressRate
scrapLoss = lossKg × circleCost
addlCost = laborCost + scrapLoss
addlPerKg = addlCost / receivedKg
finalCost = circleCost + addlPerKg
```

### 6.3 Polishing Stage

```
pressedCost = getPressedCostPerKg(data, prId)
lossKg = max(0, sentKg - returnedKg)
laborCost = returnedKg × polishRate
scrapLoss = lossKg × pressedCost
addlCost = laborCost + scrapLoss
addlPerKg = addlCost / returnedKg
finalCost = pressedCost + addlPerKg
```

### 6.4 Formatting Utilities

- `fmtR(n)`: `₹X,XXX.XX` (Indian locale, 2 decimal places)
- `fmtKg(n)`: `X,XXX.XX kg` (Indian locale, 2 decimal places, omits if 0)
- `pct(a, b)`: `(a/b)*100 %` (for yield calculations)
- `r2(n)`: Round to 2 decimal places

---

## 7. Build & Development

### 7.1 Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `npm run tauri` | Tauri CLI passthrough |
| `npm run desktop:dev` | `tauri dev` — full desktop dev mode |
| `npm run desktop:build` | `tauri build` — production desktop build |

### 7.2 Tauri Configuration

```json
{
  "productName": "KHP Steelworks Inventory",
  "version": "0.1.0",
  "identifier": "com.khp.inventory",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "Calculator",
      "width": 360,
      "height": 520,
      "minWidth": 360,
      "minHeight": 520,
      "maxWidth": 360,
      "maxHeight": 520,
      "resizable": false,
      "center": true
    }]
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"]
  }
}
```

### 7.3 Distribution Targets

- **NSIS** installer (Windows)
- **MSI** package (Windows)

---

## 8. File Structure

```
KHP-inventory/
├── src/
│   ├── App.jsx              # Main app: state, routing, all page components
│   ├── CalculatorLock.jsx   # Stealth calculator with unlock logic
│   ├── desktopBridge.js     # Tauri/browser abstraction layer
│   └── main.jsx             # React entry point
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri entry point
│   │   └── lib.rs           # DB init, Tauri commands, auth, migrations, seeding
│   ├── migrations/
│   │   └── 001_initial.sql  # Database schema
│   ├── seed/
│   │   └── app_state.json   # Initial seed data
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Tauri configuration
│   └── build.rs             # Tauri build script
├── package.json
├── vite.config.js
├── index.html
└── product_design.md
```

---

## 9. Default Data (Seed)

### 9.1 Sample Raw Materials (4 lots)
- RM-001: Tata Steel, Coil DD 20g, 950kg @ ₹98/kg → Raj Cutters
- RM-002: Shiv Steel, Patta J/5 22g, 840kg @ ₹102/kg → Prakash Cutters
- RM-003: JSW Steel, Coil SDM 20g, 720kg @ ₹95/kg → Raj Cutters
- RM-004: Mehta Metals, Patta J/6 22g, 1100kg @ ₹100/kg → Suresh Circle Works

### 9.2 Sample Cutting Jobs (4)
- CJ-001: 950kg sent, factor 1.17, Completed
- CJ-002: 840kg sent, factor 1.15, Completed
- CJ-003: 720kg sent, factor 1.17, In Progress
- CJ-004: 1100kg sent, factor 1.18, Completed

### 9.3 Sample Circle Receipts (9)
- Sizes: 10"–16", linked to cutting jobs CJ-001 through CJ-004

### 9.4 Sample Pressing Batches (4)
- PR-205 to PR-208: Plate, Bowl, Thali utensils; Self and Kapoor Press vendors

### 9.5 Sample Polishing Batches (3)
- PL-029 to PL-031: Partial and Done statuses; multiple vendors

### 9.6 Sample Vendors (12)
- 4 RM suppliers, 3 cutting vendors, 1 pressing vendor, 4 polishing vendors
