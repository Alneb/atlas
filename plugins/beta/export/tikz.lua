-- A ```tikz block → the tikzpicture itself, as raw LaTeX: the PDF gets the vector figure TeX draws. The block's leading
-- \usetikzlibrary{…} / \usepackage[…]{…} lines go to the preamble, after \usepackage{tikz}. Other output formats keep
-- the block as code. Used by the Export plugin (helper/helper.ts, the LaTeX road) and usable by any `pandoc --lua-filter tikz.lua`.
-- Same reading of a block as Atlas's own drawing of it (ui/src/lib/tikz.ts, parseTikz).

local libraries, packages, seen, used = {}, {}, {}, false

local function add(list, item)
  if not seen[item] then seen[item] = true; table.insert(list, item) end
end

local function split(source)
  local body, head = {}, true
  for line in (source .. "\n"):gmatch("(.-)\r?\n") do
    local t = line:match("^%s*(.-)%s*$")
    local lib = t:match("^\\usetikzlibrary%s*{([^}]*)}$")
    local opts, pkg = t:match("^\\usepackage%s*%[([^%]]*)%]%s*{([^}]*)}$")
    if not pkg then pkg = t:match("^\\usepackage%s*{([^}]*)}$") end
    if head and (t == "" or t:sub(1, 1) == "%") then
      -- blank lines and comments before the picture
    elseif head and lib then
      for name in lib:gmatch("[^,%s]+") do add(libraries, name) end
    elseif head and pkg then
      for name in pkg:gmatch("[^,%s]+") do add(packages, (opts and opts ~= "" and ("[" .. opts .. "]") or "") .. "{" .. name .. "}") end
    else
      head = false
      table.insert(body, line)
    end
  end
  return table.concat(body, "\n")
end

function CodeBlock(el)
  if not el.classes:includes("tikz") or not FORMAT:match("latex") and not FORMAT:match("beamer") then return nil end
  used = true
  return pandoc.RawBlock("latex", "\\begin{center}\n" .. split(el.text) .. "\n\\end{center}")
end

function Meta(meta)
  if not used then return nil end
  local lines = { "\\usepackage{tikz}" }
  for _, p in ipairs(packages) do table.insert(lines, "\\usepackage" .. p) end
  if #libraries > 0 then table.insert(lines, "\\usetikzlibrary{" .. table.concat(libraries, ",") .. "}") end
  local includes = meta["header-includes"]
  if includes == nil then includes = pandoc.MetaList({})
  elseif includes.t ~= "MetaList" then includes = pandoc.MetaList({ includes }) end
  for _, l in ipairs(lines) do includes:insert(pandoc.MetaBlocks({ pandoc.RawBlock("latex", l) })) end
  meta["header-includes"] = includes
  return meta
end

-- blocks first, so the preamble knows what they asked for
return { { CodeBlock = CodeBlock }, { Meta = Meta } }
