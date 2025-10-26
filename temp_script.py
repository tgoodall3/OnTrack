from pathlib import Path
path = Path(''frontend/src/app/(app)/checklists/page.tsx'')
lines = path.read_text().splitlines()
start = None
for i,line in enumerate(lines):
    if line == '              {items.map((item, index) => (':
        start = i-1
        break
if start is None:
    raise SystemExit(''start not found'')
end = start
while end < len(lines) and lines[end] != '            </div>':
    end += 1
if end >= len(lines):
    raise SystemExit(''end not found'')
new_block = """
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{index + 1}.</span>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(event) => handleItemChange(item.id, event.target.value)}
                    placeholder="Describe the step to complete"
                    className="flex-1 min-w-[200px] rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick=lambda direction=-1: None
"
