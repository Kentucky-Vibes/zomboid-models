--- Client side: exports the local player on start and whenever their clothing changes, and
--- asks the server to refresh its copy in multiplayer. `ZomboidModels.exportLocalPlayer()` can
--- be called from the Lua console or from other mods at any time.

require 'ZomboidModels/Exporter'

if not isServer() then
    function ZomboidModels.exportLocalPlayer()
        local player = getPlayer()
        if player == nil then return nil end
        local relPath = ZomboidModels.export(player)
        if isClient() then
            sendClientCommand(player, 'ZomboidModels', 'export', {})
        end
        return relPath
    end

    local function onClothingUpdated(character)
        local player = getPlayer()
        if player ~= nil and character == player then
            ZomboidModels.exportLocalPlayer()
        end
    end

    Events.OnGameStart.Add(ZomboidModels.exportLocalPlayer)
    Events.OnClothingUpdated.Add(onClothingUpdated)
end
