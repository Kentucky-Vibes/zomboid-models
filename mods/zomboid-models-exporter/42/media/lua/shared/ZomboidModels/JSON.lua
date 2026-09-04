--- Minimal JSON encoder for the game's Kahlua runtime: no string.format, no metatables.
--- Tables are encoded as arrays when they carry `n` (see `ZomboidModelsJSON.array`) and as
--- objects otherwise; object keys are sorted so that output is stable.

ZomboidModelsJSON = ZomboidModelsJSON or {}
local JSON = ZomboidModelsJSON

local ESCAPES = {
    ['"'] = '\\"',
    ['\\'] = '\\\\',
    ['\b'] = '\\b',
    ['\f'] = '\\f',
    ['\n'] = '\\n',
    ['\r'] = '\\r',
    ['\t'] = '\\t',
}

local function escapeChar(c)
    local known = ESCAPES[c]
    if known then return known end
    local byte = string.byte(c)
    local hex = ''
    local digits = '0123456789abcdef'
    local value = byte
    for _ = 1, 4 do
        local d = value % 16
        hex = string.sub(digits, d + 1, d + 1) .. hex
        value = math.floor(value / 16)
    end
    return '\\u' .. hex
end

local function encodeString(s)
    return '"' .. string.gsub(s, '[%c"\\]', escapeChar) .. '"'
end

local function encodeNumber(n)
    if n ~= n or n == math.huge or n == -math.huge then return 'null' end
    local rounded = math.floor(n * 10000 + 0.5) / 10000
    if rounded == math.floor(rounded) then
        return tostring(math.floor(rounded))
    end
    return tostring(rounded)
end

--- Marks a table as a JSON array with the given length (zero for an empty array).
function JSON.array(t)
    t = t or {}
    t.n = t.n or #t
    return t
end

local function sortedKeys(t)
    local keys = {}
    for key in pairs(t) do
        if type(key) == 'string' then table.insert(keys, key) end
    end
    table.sort(keys)
    return keys
end

local encodeValue

local function encodeArray(t)
    local parts = {}
    for i = 1, t.n do
        table.insert(parts, encodeValue(t[i]))
    end
    return '[' .. table.concat(parts, ',') .. ']'
end

local function encodeObject(t)
    local parts = {}
    for _, key in ipairs(sortedKeys(t)) do
        local value = t[key]
        if value ~= nil then
            table.insert(parts, encodeString(key) .. ':' .. encodeValue(value))
        end
    end
    return '{' .. table.concat(parts, ',') .. '}'
end

encodeValue = function(value)
    local kind = type(value)
    if kind == 'nil' then return 'null' end
    if kind == 'boolean' then return value and 'true' or 'false' end
    if kind == 'number' then return encodeNumber(value) end
    if kind == 'string' then return encodeString(value) end
    if kind == 'table' then
        if value.n ~= nil then return encodeArray(value) end
        return encodeObject(value)
    end
    return encodeString(tostring(value))
end

--- Encodes a value as JSON text.
function JSON.encode(value)
    return encodeValue(value)
end
