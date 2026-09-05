--- Minimal JSON encoder for the game's Kahlua runtime, which lacks `next`, `table.sort`,
--- `string.format`, and the function form of `string.gsub`. Only `pairs`, `ipairs`,
--- `table.insert`, `table.concat`, `string.byte`, `string.sub`, `math.floor`, and `tostring`
--- are used. Tables are encoded as arrays when they carry `n` (see `ZomboidModelsJSON.array`)
--- and as objects otherwise; object keys are sorted so that output is stable.

ZomboidModelsJSON = ZomboidModelsJSON or {}
local JSON = ZomboidModelsJSON

local ESCAPES = {
    [34] = '\\"',
    [92] = '\\\\',
    [8] = '\\b',
    [12] = '\\f',
    [10] = '\\n',
    [13] = '\\r',
    [9] = '\\t',
}

local HEX = '0123456789abcdef'

local function hex4(value)
    local out = ''
    for _ = 1, 4 do
        local d = value - math.floor(value / 16) * 16
        out = string.sub(HEX, d + 1, d + 1) .. out
        value = math.floor(value / 16)
    end
    return out
end

local function encodeString(s)
    local parts = { '"' }
    for i = 1, #s do
        local byte = string.byte(s, i)
        local known = ESCAPES[byte]
        if known then
            table.insert(parts, known)
        elseif byte < 32 then
            table.insert(parts, '\\u' .. hex4(byte))
        else
            table.insert(parts, string.sub(s, i, i))
        end
    end
    table.insert(parts, '"')
    return table.concat(parts)
end

local INFINITY = 1 / 0

local function encodeNumber(n)
    if n ~= n or n == INFINITY or n == -INFINITY then return 'null' end
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

local function isEmpty(t)
    for _ in pairs(t) do
        return false
    end
    return true
end
JSON.isEmpty = isEmpty

--- String keys of a table in ascending order (insertion sort; the tables are small).
local function sortedKeys(t)
    local keys = {}
    for key in pairs(t) do
        if type(key) == 'string' then
            local pos = #keys + 1
            while pos > 1 and keys[pos - 1] > key do
                keys[pos] = keys[pos - 1]
                pos = pos - 1
            end
            keys[pos] = key
        end
    end
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
