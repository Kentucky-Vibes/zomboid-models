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

--- Integers are written as they are; other numbers are rounded to four decimals. Large values
--- skip the rounding, whose intermediate product would overflow a 32-bit integer runtime.
local function encodeNumber(n)
    if n ~= n or n == INFINITY or n == -INFINITY then return 'null' end
    local floor = math.floor(n)
    if n == floor then return tostring(floor) end
    if n > -100000 and n < 100000 then
        local rounded = math.floor(n * 10000 + 0.5) / 10000
        if rounded == math.floor(rounded) then
            return tostring(math.floor(rounded))
        end
        return tostring(rounded)
    end
    return tostring(n)
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

--- Decoding -------------------------------------------------------------------------------------

local decodeValue

local function isSpace(byte)
    return byte == 32 or byte == 9 or byte == 10 or byte == 13
end

local function skipSpace(text, pos)
    while pos <= #text and isSpace(string.byte(text, pos)) do
        pos = pos + 1
    end
    return pos
end

local function decodeError(text, pos, message)
    error('JSON: ' .. message .. ' at position ' .. tostring(pos) .. ' of ' .. tostring(#text))
end

local function hexValue(text, pos)
    local value = 0
    for i = pos, pos + 3 do
        local byte = string.byte(text, i)
        local digit
        if byte == nil then
            decodeError(text, i, 'truncated unicode escape')
        elseif byte >= 48 and byte <= 57 then
            digit = byte - 48
        elseif byte >= 97 and byte <= 102 then
            digit = byte - 87
        elseif byte >= 65 and byte <= 70 then
            digit = byte - 55
        else
            decodeError(text, i, 'bad unicode escape')
        end
        value = value * 16 + digit
    end
    return value
end

--- Encodes a code point below 0x10000 as UTF-8 bytes.
local function utf8Char(code)
    if code < 128 then
        return string.char(code)
    elseif code < 2048 then
        return string.char(192 + math.floor(code / 64), 128 + code - math.floor(code / 64) * 64)
    end
    local high = math.floor(code / 4096)
    local mid = math.floor((code - high * 4096) / 64)
    local low = code - high * 4096 - mid * 64
    return string.char(224 + high, 128 + mid, 128 + low)
end

local UNESCAPES = { [34] = '"', [92] = '\\', [47] = '/', [98] = '\b', [102] = '\f', [110] = '\n', [114] = '\r', [116] = '\t' }

local function decodeString(text, pos)
    local parts = {}
    pos = pos + 1
    while true do
        local byte = string.byte(text, pos)
        if byte == nil then decodeError(text, pos, 'unterminated string') end
        if byte == 34 then
            return table.concat(parts), pos + 1
        elseif byte == 92 then
            local escape = string.byte(text, pos + 1)
            if escape == 117 then
                table.insert(parts, utf8Char(hexValue(text, pos + 2)))
                pos = pos + 6
            elseif UNESCAPES[escape] then
                table.insert(parts, UNESCAPES[escape])
                pos = pos + 2
            else
                decodeError(text, pos, 'bad escape')
            end
        else
            table.insert(parts, string.sub(text, pos, pos))
            pos = pos + 1
        end
    end
end

local function decodeNumber(text, pos)
    local finish = pos
    while true do
        local byte = string.byte(text, finish)
        if byte == nil then break end
        local isNumberChar = (byte >= 48 and byte <= 57) or byte == 45 or byte == 43 or byte == 46
            or byte == 101 or byte == 69
        if not isNumberChar then break end
        finish = finish + 1
    end
    local value = tonumber(string.sub(text, pos, finish - 1))
    if value == nil then decodeError(text, pos, 'bad number') end
    return value, finish
end

local function decodeArray(text, pos)
    local result = JSON.array({})
    pos = skipSpace(text, pos + 1)
    if string.byte(text, pos) == 93 then return result, pos + 1 end
    while true do
        local value
        value, pos = decodeValue(text, pos)
        result.n = result.n + 1
        result[result.n] = value
        pos = skipSpace(text, pos)
        local byte = string.byte(text, pos)
        if byte == 93 then return result, pos + 1 end
        if byte ~= 44 then decodeError(text, pos, 'expected , or ]') end
        pos = skipSpace(text, pos + 1)
    end
end

local function decodeObject(text, pos)
    local result = {}
    pos = skipSpace(text, pos + 1)
    if string.byte(text, pos) == 125 then return result, pos + 1 end
    while true do
        if string.byte(text, pos) ~= 34 then decodeError(text, pos, 'expected a key') end
        local key
        key, pos = decodeString(text, pos)
        pos = skipSpace(text, pos)
        if string.byte(text, pos) ~= 58 then decodeError(text, pos, 'expected :') end
        local value
        value, pos = decodeValue(text, skipSpace(text, pos + 1))
        result[key] = value
        pos = skipSpace(text, pos)
        local byte = string.byte(text, pos)
        if byte == 125 then return result, pos + 1 end
        if byte ~= 44 then decodeError(text, pos, 'expected , or }') end
        pos = skipSpace(text, pos + 1)
    end
end

local function decodeLiteral(text, pos, word, value)
    if string.sub(text, pos, pos + #word - 1) ~= word then decodeError(text, pos, 'unexpected token') end
    return value, pos + #word
end

decodeValue = function(text, pos)
    pos = skipSpace(text, pos)
    local byte = string.byte(text, pos)
    if byte == nil then decodeError(text, pos, 'unexpected end') end
    if byte == 123 then return decodeObject(text, pos) end
    if byte == 91 then return decodeArray(text, pos) end
    if byte == 34 then return decodeString(text, pos) end
    if byte == 116 then return decodeLiteral(text, pos, 'true', true) end
    if byte == 102 then return decodeLiteral(text, pos, 'false', false) end
    if byte == 110 then return decodeLiteral(text, pos, 'null', nil) end
    return decodeNumber(text, pos)
end

--- Decodes JSON text. Arrays come back marked with `n` (see `JSON.array`), objects as plain
--- tables, `null` as nil. Errors are raised with `error`; wrap calls in `pcall`.
function JSON.decode(text)
    local value, pos = decodeValue(text, 1)
    pos = skipSpace(text, pos)
    if pos <= #text then decodeError(text, pos, 'trailing characters') end
    return value
end
