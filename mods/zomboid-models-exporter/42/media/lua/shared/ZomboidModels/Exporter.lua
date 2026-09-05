--- Builds a zomboid-models character document from a game character and writes it to
--- Zomboid/Lua/zomboid-models/<name>.json. Shared between the client and the server.
---
--- Every call into the game is wrapped in pcall: a missing method on some item type must never
--- break the export of the rest of the character.

require 'ZomboidModels/JSON'

ZomboidModels = ZomboidModels or {}
local M = ZomboidModels
local JSON = ZomboidModelsJSON

M.FORMAT = 'zomboid-models/character'
M.VERSION = 1
M.OUTPUT_FOLDER = 'zomboid-models'

--- Body parts in the game's enum order; the same names exist on BloodBodyPartType and BodyPartType.
M.BODY_PARTS = {
    'Hand_L', 'Hand_R', 'ForeArm_L', 'ForeArm_R', 'UpperArm_L', 'UpperArm_R',
    'Torso_Upper', 'Torso_Lower', 'Head', 'Neck', 'Groin',
    'UpperLeg_L', 'UpperLeg_R', 'LowerLeg_L', 'LowerLeg_R', 'Foot_L', 'Foot_R', 'Back',
}

local function try(object, method, ...)
    if object == nil then return nil end
    local fn = object[method]
    if fn == nil then return nil end
    local ok, result = pcall(fn, object, ...)
    if ok then return result end
    return nil
end

local isEmpty = JSON.isEmpty

local function color(immutable)
    if immutable == nil then return nil end
    local r = try(immutable, 'getRedFloat')
    local g = try(immutable, 'getGreenFloat')
    local b = try(immutable, 'getBlueFloat')
    if r == nil or g == nil or b == nil then return nil end
    return { r = r, g = g, b = b }
end

local function isWhite(c)
    return c == nil or (c.r >= 0.999 and c.g >= 0.999 and c.b >= 0.999)
end

--- Reads a per-part amount getter (getBlood, getDirt) into a table of parts above zero.
local function partAmounts(visual, method)
    local amounts = {}
    for _, name in ipairs(M.BODY_PARTS) do
        local part = BloodBodyPartType[name]
        local value = part and try(visual, method, part)
        if value ~= nil and value > 0 then
            amounts[name] = value
        end
    end
    return amounts
end

local function partFlags(visual, method)
    local flags = {}
    for _, name in ipairs(M.BODY_PARTS) do
        local part = BloodBodyPartType[name]
        local value = part and try(visual, method, part)
        if value ~= nil and value > 0 then
            flags[name] = true
        end
    end
    return flags
end

local function partPatches(visual)
    local patches = {}
    for _, name in ipairs(M.BODY_PARTS) do
        local part = BloodBodyPartType[name]
        if part then
            if (try(visual, 'getLeatherPatch', part) or 0) > 0 then
                patches[name] = 'leather'
            elseif (try(visual, 'getDenimPatch', part) or 0) > 0 then
                patches[name] = 'denim'
            elseif (try(visual, 'getBasicPatch', part) or 0) > 0 then
                patches[name] = 'basic'
            end
        end
    end
    return patches
end

--- The `body` section from a HumanVisual.
function M.describeBody(character)
    local visual = try(character, 'getHumanVisual')
    local body = { sex = try(character, 'isFemale') and 'female' or 'male' }
    if visual == nil then return body end

    local skinIndex = try(visual, 'getSkinTextureIndex')
    if skinIndex ~= nil and skinIndex >= 0 then body.skin = skinIndex end
    local skinTexture = try(visual, 'getSkinTexture')
    if skinTexture ~= nil and skinTexture ~= '' then body.skinTexture = skinTexture end
    local bodyHair = try(visual, 'getBodyHairIndex')
    if bodyHair ~= nil and bodyHair >= 0 then body.bodyHair = true end

    local hair = try(visual, 'getHairModel')
    if hair ~= nil and hair ~= '' then body.hair = hair end
    local beard = try(visual, 'getBeardModel')
    if beard ~= nil and beard ~= '' then body.beard = beard end
    body.hairColor = color(try(visual, 'getHairColor'))
    body.beardColor = color(try(visual, 'getBeardColor'))

    local blood = partAmounts(visual, 'getBlood')
    if not isEmpty(blood) then body.blood = blood end
    local dirt = partAmounts(visual, 'getDirt')
    if not isEmpty(dirt) then body.dirt = dirt end
    return body
end

--- One `worn` entry from an inventory item and its ItemVisual.
function M.describeWornItem(item)
    local entry = { item = try(item, 'getFullType') }
    if entry.item == nil then return nil end
    local visual = try(item, 'getVisual')
    if visual == nil then return entry end

    local clothingItem = try(visual, 'getClothingItem')
    local clothingName = try(visual, 'getClothingItemName')
    if clothingName ~= nil and clothingName ~= '' then entry.clothingItem = clothingName end
    local alternate = try(visual, 'getAlternateModelName')
    if alternate ~= nil and alternate ~= '' then entry.alternateModel = alternate end

    local textureChoice = try(visual, 'getTextureChoice')
    if textureChoice ~= nil and textureChoice >= 0 then entry.textureChoice = textureChoice end
    local baseTexture = try(visual, 'getBaseTexture')
    if baseTexture ~= nil and baseTexture >= 0 then entry.baseTexture = baseTexture end

    local tint = color(try(visual, 'getTint'))
    if not isWhite(tint) then entry.tint = tint end
    local hue = try(visual, 'getHue')
    if hue ~= nil and hue == hue and hue > -1000 and hue < 1000 and (hue > 0.0001 or hue < -0.0001) then
        entry.hue = hue
    end
    if clothingItem ~= nil then
        local decal = try(visual, 'getDecal', clothingItem)
        if decal ~= nil and decal ~= '' then entry.decal = decal end
    end

    local blood = partAmounts(visual, 'getBlood')
    if not isEmpty(blood) then entry.blood = blood end
    local dirt = partAmounts(visual, 'getDirt')
    if not isEmpty(dirt) then entry.dirt = dirt end
    local holes = partFlags(visual, 'getHole')
    if not isEmpty(holes) then entry.holes = holes end
    local patches = partPatches(visual)
    if not isEmpty(patches) then entry.patches = patches end
    return entry
end

function M.describeWorn(character)
    local worn = JSON.array({})
    local items = try(character, 'getWornItems')
    local count = try(items, 'size') or 0
    for i = 0, count - 1 do
        local wornItem = try(items, 'get', i)
        local entry = M.describeWornItem(try(wornItem, 'getItem'))
        if entry ~= nil then
            worn.n = worn.n + 1
            worn[worn.n] = entry
        end
    end
    return worn
end

local function describeHeldItem(item)
    local fullType = try(item, 'getFullType')
    if fullType == nil then return nil end
    local held = { item = fullType }
    local blood = try(item, 'getBloodLevel')
    if blood ~= nil and blood > 0 then
        held.blood = blood > 1 and 1 or blood
    end
    return held
end

function M.describeHeld(character)
    local held = {}
    held.primary = describeHeldItem(try(character, 'getPrimaryHandItem'))
    held.secondary = describeHeldItem(try(character, 'getSecondaryHandItem'))
    if isEmpty(held) then return nil end
    return held
end

function M.describeAttached(character)
    local attached = JSON.array({})
    local items = try(character, 'getAttachedItems')
    local count = try(items, 'size') or 0
    for i = 0, count - 1 do
        local entry = try(items, 'get', i)
        local location = try(entry, 'getLocation')
        local fullType = try(try(entry, 'getItem'), 'getFullType')
        if location ~= nil and fullType ~= nil then
            attached.n = attached.n + 1
            attached[attached.n] = { location = location, item = fullType }
        end
    end
    if attached.n == 0 then return nil end
    return attached
end

local DAMAGE_FLAGS = {
    { key = 'bitten', method = 'bitten' },
    { key = 'scratched', method = 'scratched' },
    { key = 'cut', method = 'isCut' },
    { key = 'deepWound', method = 'isDeepWounded' },
    { key = 'burnt', method = 'isBurnt' },
    { key = 'stitched', method = 'stitched' },
    { key = 'splint', method = 'isSplint' },
    { key = 'bleeding', method = 'bleeding' },
}

function M.describeDamage(character)
    local bodyDamage = try(character, 'getBodyDamage')
    if bodyDamage == nil then return nil end
    local damage = {}
    for _, name in ipairs(M.BODY_PARTS) do
        local partType = BodyPartType[name]
        local part = partType and try(bodyDamage, 'getBodyPart', partType)
        if part ~= nil then
            local state = {}
            if try(part, 'bandaged') then
                state.bandage = try(part, 'isBandageDirty') and 'dirty' or 'clean'
            end
            for _, flag in ipairs(DAMAGE_FLAGS) do
                if try(part, flag.method) then state[flag.key] = true end
            end
            if not isEmpty(state) then damage[name] = state end
        end
    end
    if isEmpty(damage) then return nil end
    return damage
end

--- The whole document as a Lua table.
function M.describe(character)
    return {
        format = M.FORMAT,
        version = M.VERSION,
        body = M.describeBody(character),
        worn = M.describeWorn(character),
        held = M.describeHeld(character),
        attached = M.describeAttached(character),
        damage = M.describeDamage(character),
        meta = {
            exporter = 'ZomboidModelsExporter',
            username = try(character, 'getUsername'),
            displayName = try(character, 'getDisplayName'),
        },
    }
end

--- A file-system safe name: letters, digits, '-', '_', and '.' are kept, everything else
--- becomes '_'. Written byte by byte because Kahlua's `string.gsub` has no character classes.
function M.safeName(name)
    name = tostring(name or '')
    local parts = {}
    for i = 1, #name do
        local byte = string.byte(name, i)
        local keep = (byte >= 48 and byte <= 57) or (byte >= 65 and byte <= 90)
            or (byte >= 97 and byte <= 122) or byte == 45 or byte == 95 or byte == 46
        table.insert(parts, keep and string.sub(name, i, i) or '_')
    end
    return table.concat(parts)
end

--- The file name for a player: the username, else the display name, else 'player'.
function M.fileName(character)
    local safe = M.safeName(try(character, 'getUsername') or try(character, 'getDisplayName') or '')
    if safe == '' then safe = 'player' end
    return safe
end

--- Writes the document for a character and returns the relative path, or nil on failure. A
--- character sitting in a vehicle gets the vehicle exported too, and the document links to it
--- through `meta.vehicleId` and `meta.vehicleFile`. The player is recorded in the index; call
--- `writeIndex` to save it.
function M.export(character)
    if character == nil then return nil end
    local doc = M.describe(character)
    local vehicle = try(character, 'getVehicle')
    local exportedVehicle = nil
    if vehicle ~= nil then
        local vehicleFile = M.exportVehicle(vehicle)
        if vehicleFile ~= nil then
            exportedVehicle = { id = try(vehicle, 'getId'), file = vehicleFile }
            doc.meta.vehicleId = exportedVehicle.id
            doc.meta.vehicleFile = vehicleFile
        end
    end
    local ok, text = pcall(function() return JSON.encode(doc) end)
    if not ok then
        print('[zomboid-models] export failed: ' .. tostring(text))
        return nil
    end
    local relPath = M.OUTPUT_FOLDER .. '/' .. M.fileName(character) .. '.json'
    local writer = getFileWriter(relPath, true, false)
    if writer == nil then
        print('[zomboid-models] cannot open ' .. relPath)
        return nil
    end
    writer:write(text)
    writer:close()
    M.updateIndex(character, relPath, exportedVehicle)
    return relPath
end

--- Vehicles ------------------------------------------------------------------------------------

M.VEHICLE_FORMAT = 'zomboid-models/vehicle'

local function clamp01(value)
    if value < 0 then return 0 end
    if value > 1 then return 1 end
    return value
end

--- The state of one VehiclePart, or nil when the part is installed, intact, and closed.
local function describeVehiclePart(part)
    local state = {}
    local item = try(part, 'getInventoryItem')
    if item == nil then
        state.missing = true
    else
        local condition = try(item, 'getCondition')
        if condition ~= nil and condition < 100 then state.condition = condition end
    end
    local window = try(part, 'getWindow')
    if window ~= nil and try(window, 'isOpen') then state.open = true end
    local door = try(part, 'getDoor')
    if door ~= nil and try(door, 'isOpen') then state.open = true end
    if isEmpty(state) then return nil end
    return state
end

--- The parts of a vehicle that differ from a complete vehicle in full condition.
function M.describeVehicleParts(vehicle)
    local parts = {}
    local count = try(vehicle, 'getPartCount') or 0
    for i = 0, count - 1 do
        local part = try(vehicle, 'getPartByIndex', i)
        local id = try(part, 'getId')
        local state = describeVehiclePart(part)
        if id ~= nil and state ~= nil then parts[id] = state end
    end
    if isEmpty(parts) then return nil end
    return parts
end

--- The whole vehicle document as a Lua table, from a BaseVehicle.
function M.describeVehicle(vehicle)
    local doc = {
        format = M.VEHICLE_FORMAT,
        version = M.VERSION,
        vehicle = try(vehicle, 'getScriptName'),
    }
    local skin = try(vehicle, 'getSkinIndex')
    if skin ~= nil and skin >= 0 then doc.skin = skin end
    local hue = try(vehicle, 'getColorHue')
    local saturation = try(vehicle, 'getColorSaturation')
    local value = try(vehicle, 'getColorValue')
    if hue ~= nil and saturation ~= nil and value ~= nil then
        doc.paint = { hue = clamp01(hue), saturation = clamp01(saturation), value = clamp01(value) }
    end
    local rust = try(vehicle, 'getRust')
    if rust ~= nil then doc.rust = clamp01(rust) end
    doc.parts = M.describeVehicleParts(vehicle)
    if try(vehicle, 'getHeadlightsOn') then doc.headlights = true end
    if try(vehicle, 'getStoplightsOn') then doc.stoplights = true end
    if try(vehicle, 'getWindowLightsOn') then doc.interiorLight = true end
    local lightbar = try(vehicle, 'getLightbarLightsModeObject')
    if lightbar ~= nil and try(lightbar, 'isEnable') then
        local index = try(lightbar, 'getLightTexIndex')
        if index == 1 then doc.lightbar = 'left' elseif index == 2 then doc.lightbar = 'right' end
        local mode = try(lightbar, 'getMode')
        if mode == 1 or mode == 2 or mode == 3 then doc.lightbarMode = mode end
    end
    local blood = {}
    for _, side in ipairs({ 'Front', 'Rear', 'Left', 'Right' }) do
        local amount = try(vehicle, 'getBloodIntensity', side)
        if amount ~= nil and amount > 0 then blood[string.lower(side)] = clamp01(amount) end
    end
    if not isEmpty(blood) then doc.blood = blood end
    doc.meta = {
        exporter = 'ZomboidModelsExporter',
        id = try(vehicle, 'getId'),
    }
    return doc
end

--- Writes the document for a vehicle to zomboid-models/vehicle-<script>-<id>.json and returns
--- the relative path, or nil on failure. Nothing calls this on its own; run it from the Lua
--- console or from another mod, for example on `getPlayer():getVehicle()`.
function M.exportVehicle(vehicle)
    if vehicle == nil then return nil end
    local ok, text = pcall(function() return JSON.encode(M.describeVehicle(vehicle)) end)
    if not ok then
        print('[zomboid-models] vehicle export failed: ' .. tostring(text))
        return nil
    end
    local script = tostring(try(vehicle, 'getScriptName') or 'vehicle')
    local id = tostring(try(vehicle, 'getId') or 0)
    local relPath = M.OUTPUT_FOLDER .. '/vehicle-' .. M.safeName(script .. '-' .. id) .. '.json'
    local writer = getFileWriter(relPath, true, false)
    if writer == nil then
        print('[zomboid-models] cannot open ' .. relPath)
        return nil
    end
    writer:write(text)
    writer:close()
    return relPath
end

--- Index of exported players ---------------------------------------------------------------

M.INDEX_FILE = M.OUTPUT_FOLDER .. '/players.json'

--- Reads the whole text of a file in the Zomboid folder, or nil when it does not exist.
local function readText(relPath)
    local reader = getFileReader(relPath, false)
    if reader == nil then return nil end
    local lines = {}
    while true do
        local line = reader:readLine()
        if line == nil then break end
        table.insert(lines, line)
    end
    reader:close()
    return table.concat(lines, '\n')
end

local function writeText(relPath, text)
    local writer = getFileWriter(relPath, true, false)
    if writer == nil then
        print('[zomboid-models] cannot open ' .. relPath)
        return false
    end
    writer:write(text)
    writer:close()
    return true
end

--- The entries of players.json by username, read from disk on first use.
local indexEntries = nil

local function loadIndex()
    if indexEntries ~= nil then return indexEntries end
    indexEntries = {}
    local text = readText(M.INDEX_FILE)
    if text ~= nil and text ~= '' then
        local ok, decoded = pcall(JSON.decode, text)
        if ok and type(decoded) == 'table' and type(decoded.players) == 'table' then
            for i = 1, decoded.players.n or #decoded.players do
                local entry = decoded.players[i]
                if type(entry) == 'table' and type(entry.username) == 'string' then
                    indexEntries[entry.username] = entry
                end
            end
        else
            print('[zomboid-models] players.json could not be read; starting a new index')
        end
    end
    return indexEntries
end

local function now()
    local ok, seconds = pcall(getTimestamp)
    if ok and type(seconds) == 'number' then return math.floor(seconds) end
    return 0
end

--- Records one exported player in the index (in memory; `writeIndex` saves it).
function M.updateIndex(character, relPath, vehicle)
    local entries = loadIndex()
    local username = try(character, 'getUsername') or try(character, 'getDisplayName')
    if username == nil then return end
    local entry = {
        username = username,
        displayName = try(character, 'getDisplayName'),
        file = relPath,
        updatedAt = now(),
        online = true,
    }
    if vehicle ~= nil then
        entry.vehicleId = vehicle.id
        entry.vehicleFile = vehicle.file
    end
    entries[username] = entry
end

--- Marks every player whose username is not in the given set as offline.
function M.markOffline(onlineUsernames)
    local entries = loadIndex()
    for username, entry in pairs(entries) do
        if not onlineUsernames[username] then entry.online = false end
    end
end

--- Writes players.json: the entries sorted by username, with the time of writing.
function M.writeIndex()
    local entries = loadIndex()
    local list = JSON.array({})
    local names = {}
    for username in pairs(entries) do
        local pos = #names + 1
        while pos > 1 and names[pos - 1] > username do
            names[pos] = names[pos - 1]
            pos = pos - 1
        end
        names[pos] = username
    end
    for _, username in ipairs(names) do
        list.n = list.n + 1
        list[list.n] = entries[username]
    end
    local document = {
        format = 'zomboid-models/players',
        version = M.VERSION,
        updatedAt = now(),
        players = list,
    }
    local ok, text = pcall(JSON.encode, document)
    if not ok then
        print('[zomboid-models] index encoding failed: ' .. tostring(text))
        return nil
    end
    if writeText(M.INDEX_FILE, text) then return M.INDEX_FILE end
    return nil
end
